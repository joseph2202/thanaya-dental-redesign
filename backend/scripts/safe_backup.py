#!/usr/bin/env python3
"""Read-only preflight and verified SQLite + uploaded-image backup for Thanaya.

Run from any directory:
  python3 backend/scripts/safe_backup.py --check-only
  python3 backend/scripts/safe_backup.py --backup

NEVER runs Prisma or changes the source database. Stop frontend/backend first
so SQLite rows and uploaded files form a consistent point-in-time snapshot.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import sys
from datetime import datetime
from urllib.parse import unquote, urlsplit, quote

BACKEND = Path(__file__).resolve().parents[1]
SCHEMA_DIR = BACKEND / "prisma"
UPLOADS = BACKEND / "uploads"
BACKUPS = Path.home() / "Thanaya-Backups"
TABLES = (
    "User", "Product", "Order", "OrderItem", "ProductLot",
    "OrderItemLot", "InventoryMovement", "OrderReturn", "OrderReturnLine",
)

def database_path() -> Path:
    envfile = BACKEND / ".env"
    disk_url = ""
    if envfile.is_file():
        for line in envfile.read_text(encoding="utf-8").splitlines():
            match = re.match(r"^\s*(?:export\s+)?DATABASE_URL\s*=\s*(.*?)\s*$", line)
            if match:
                disk_url = match.group(1).strip().strip("'\"")
    raw = os.environ.get("DATABASE_URL") or disk_url
    if not raw or not raw.startswith("file:"):
        raise RuntimeError("DATABASE_URL must be a non-empty SQLite file: URL in backend/.env or the shell.")
    parts = urlsplit(raw)
    if parts.scheme != "file" or parts.netloc or parts.fragment:
        raise RuntimeError("Unsupported SQLite URL; expected file:./dev.db (no host or fragment).")
    path = Path(unquote(parts.path))
    if not str(path):
        raise RuntimeError("SQLite file path is empty.")
    # Prisma resolves relative SQLite file URLs beside prisma/schema.prisma.
    db = (path if path.is_absolute() else SCHEMA_DIR / path).resolve()
    if not db.is_file():
        raise FileNotFoundError(
            "Database file does not exist at the location resolved from DATABASE_URL: " + str(db)
            + ". Refusing to create an empty database."
        )
    return db

def read_only_connection(db: Path) -> sqlite3.Connection:
    conn = sqlite3.connect("file:" + quote(db.as_posix(), safe="/") + "?mode=ro", uri=True, timeout=10)
    conn.execute("PRAGMA query_only=ON")
    return conn

def verified_counts(conn: sqlite3.Connection) -> dict[str, int | None]:
    existing = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    return {name: conn.execute('SELECT COUNT(*) FROM "' + name + '"').fetchone()[0]
            if name in existing else None for name in TABLES}

def integrity(conn: sqlite3.Connection) -> None:
    result = conn.execute("PRAGMA integrity_check").fetchone()
    if not result or result[0] != "ok":
        raise RuntimeError("SQLite integrity_check did not return ok: " + str(result))

def digest(path: Path) -> str:
    sha = hashlib.sha256()
    with path.open("rb") as fd:
        for block in iter(lambda: fd.read(1024 * 1024), b""):
            sha.update(block)
    return sha.hexdigest()

def get_uploads() -> list[Path]:
    if not UPLOADS.exists():
        return []
    if not UPLOADS.is_dir() or UPLOADS.is_symlink():
        raise RuntimeError("backend/uploads is not a regular directory.")
    result: list[Path] = []
    for directory, dirs, files in os.walk(UPLOADS, followlinks=False):
        for name in dirs:
            if (Path(directory) / name).is_symlink():
                raise RuntimeError("Uploads contains directory symlinks; review these before backup.")
        for name in files:
            p = Path(directory) / name
            if p.is_symlink() or not p.is_file():
                raise RuntimeError("Uploads contains links or non-files; review these before backup.")
            result.append(p)
    return sorted(result)

def main() -> int:
    parser = argparse.ArgumentParser(description="Thanaya read-only database check and verified backup")
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--check-only", action="store_true", help="Inspect data without creating files")
    action.add_argument("--backup", action="store_true", help="Create verified backup outside the repository")
    args = parser.parse_args()
    os.umask(0o077)

    db = database_path()
    uploads = get_uploads()
    with read_only_connection(db) as conn:
        integrity(conn)
        counts_before = verified_counts(conn)
        print("SOURCE: " + str(db))
        print("SQLite integrity: ok")
        print("Table counts (null means table is not created yet):")
        print(json.dumps(counts_before, ensure_ascii=False, indent=2))
        print("Upload files: " + str(len(uploads)))
        if args.check_only:
            print("CHECK ONLY COMPLETE — database and uploads unchanged.")
            return 0

        if BACKUPS.exists() and BACKUPS.is_symlink():
            raise RuntimeError("Backup root is a symlink; choose a safe local destination.")
        BACKUPS.mkdir(parents=True, exist_ok=True, mode=0o700)
        if BACKUPS.stat().st_mode & 0o077:
            raise RuntimeError("Backup root permits access to other users; restrict permissions before backing up.")

        required = db.stat().st_size + sum(file.stat().st_size for file in uploads)
        free = shutil.disk_usage(BACKUPS).free
        if free < 2 * required + 100 * 1024 * 1024:
            raise RuntimeError("Not enough available disk space for a safe backup.")

        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        destination = BACKUPS / ("THANAYA-" + stamp)
        incomplete = BACKUPS / ("INCOMPLETE-THANAYA-" + stamp)
        if destination.exists() or incomplete.exists():
            raise RuntimeError("Backup timestamp already exists. Run again after a moment.")
        incomplete.mkdir(mode=0o700)
        try:
            dest_db = incomplete / "database.sqlite"
            with sqlite3.connect(dest_db) as target:
                conn.backup(target, pages=128, sleep=0.1)
            with read_only_connection(dest_db) as checked:
                integrity(checked)
                counts_after = verified_counts(checked)
            counts_end = verified_counts(conn)
            if counts_before != counts_after or counts_before != counts_end:
                raise RuntimeError("Database rows changed during backup, or the copy differs. Stop services and retry.")

            backed_files = 0
            total_upload_bytes = 0
            if UPLOADS.exists():
                for src in uploads:
                    relative = src.relative_to(UPLOADS)
                    dst = incomplete / "uploads" / relative
                    dst.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(src, dst, follow_symlinks=False)
                    if digest(src) != digest(dst):
                        raise RuntimeError("Upload checksum mismatch: " + str(relative))
                    backed_files += 1
                    total_upload_bytes += dst.stat().st_size
                # Preserve an empty uploads directory, too.
                (incomplete / "uploads").mkdir(exist_ok=True)

            manifest = {
                "project": "THANAYA",
                "created_at_local": datetime.now().astimezone().isoformat(),
                "sqlite_integrity": "ok",
                "counts": counts_after,
                "database_bytes": dest_db.stat().st_size,
                "database_sha256": digest(dest_db),
                "uploads_directory_present": UPLOADS.exists(),
                "upload_files": backed_files,
                "upload_total_bytes": total_upload_bytes,
                "uploads_verified_sha256": True,
                "contains_sensitive_customer_data": True,
                "note": "Offline backup; no Prisma migration was run. Keep private."
            }
            (incomplete / "manifest.json").write_text(
                json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
            )
            incomplete.rename(destination)
        except Exception:
            print("INCOMPLETE BACKUP AT: " + str(incomplete), file=sys.stderr)
            raise

    print("BACKUP VERIFIED: " + str(destination))
    print("Database integrity and row counts checked; uploads copied and SHA-256 verified.")
    print("Keep this folder private. It includes customer data and must NOT be committed to GitHub.")
    print("NO DATABASE MIGRATION PERFORMED.")
    return 0

if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print("FAILED: " + str(exc), file=sys.stderr)
        sys.exit(1)
