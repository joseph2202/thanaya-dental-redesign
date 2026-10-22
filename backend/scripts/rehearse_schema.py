#!/usr/bin/env python3
"""Rehearse Thanaya Prisma schema synchronization on a DISPOSABLE database copy.

Input must be an existing, verified folder made by safe_backup.py.
The script NEVER writes to that backup folder or to backend/prisma/dev.db.
It NEVER passes --accept-data-loss or --force-reset to Prisma.

Usage:
 python3 backend/scripts/rehearse_schema.py --backup-dir ~/Thanaya-Backups/THANAYA-YYYYMMDD-HHMMSS
"""
from __future__ import annotations

import argparse
from contextlib import closing
import hashlib
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import tempfile

BACKEND = Path(__file__).resolve().parents[1]
SCHEMA = BACKEND / "prisma" / "schema.prisma"
BACKUP_ROOT = Path.home() / "Thanaya-Backups"
REQUIRED_TABLES = ("Order", "OrderItem", "OrderReturn", "OrderReturnLine", "ProductCostChange")
REQUIRED_COLUMNS = {
    "Order": ("returnRevision",),
    "OrderItem": ("productName",),
    "Product": ("purchaseCostIqd", "costRevision"),
    "ProductLot": ("purchaseCostIqd", "costRevision"),
}
PRIVATE_TABLE_PREFIXES = ("sqlite_", "_prisma_")

def sha256(filename: Path) -> str:
    h = hashlib.sha256()
    with filename.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def connect_read_only(db: Path) -> sqlite3.Connection:
    # URI read-only, query-only; never silently creates a new DB.
    from urllib.parse import quote
    conn = sqlite3.connect("file:" + quote(db.as_posix(), safe="/") + "?mode=ro",
                           uri=True, timeout=10)
    conn.execute("PRAGMA query_only=ON")
    return conn

def verify_integrity(conn: sqlite3.Connection, which: str) -> None:
    value = conn.execute("PRAGMA integrity_check").fetchone()
    if not value or value[0] != "ok":
        raise RuntimeError(which + " failed PRAGMA integrity_check: " + str(value))
    broken = conn.execute("PRAGMA foreign_key_check").fetchall()
    if broken:
        raise RuntimeError(which + " has broken foreign keys; first example: " + str(broken[0]))

def snapshot(conn: sqlite3.Connection) -> dict[str, object]:
    tables = sorted(row[0] for row in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'"
    ) if not row[0].startswith(PRIVATE_TABLE_PREFIXES))
    counts = {
        name: conn.execute('SELECT COUNT(*) FROM "' + name.replace('"', '""') + '"').fetchone()[0]
        for name in tables
    }
    columns = {
        name: [col[1] for col in conn.execute(
            'PRAGMA table_info("' + name.replace('"', '""') + '")')]
        for name in tables
    }
    return {"tables": tables, "counts": counts, "columns": columns}

def validated_backup(path: Path) -> tuple[Path, dict[str, object]]:
    # Refuse arbitrary databases, symlinks and absent/incomplete backups.
    if path.is_symlink() or BACKUP_ROOT.is_symlink() or not path.is_dir():
        raise RuntimeError("Expected a real verified backup folder, not a symlink.")
    if path.resolve().parent != BACKUP_ROOT.resolve() or not path.name.startswith("THANAYA-"):
        raise RuntimeError("Backup must reside directly under ~/Thanaya-Backups/THANAYA-*.")
    db = path / "database.sqlite"
    manifest_file = path / "manifest.json"
    if db.is_symlink() or manifest_file.is_symlink() or not db.is_file() or not manifest_file.is_file():
        raise RuntimeError("Verified backup must include database.sqlite and manifest.json.")
    manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
    if manifest.get("project") != "THANAYA" or manifest.get("sqlite_integrity") != "ok":
        raise RuntimeError("Unrecognized backup manifest.")
    if sha256(db) != manifest.get("database_sha256"):
        raise RuntimeError("Backup checksum mismatch. Do not rehearse or migrate.")
    with closing(connect_read_only(db)) as conn:
        verify_integrity(conn, "Backup")
        saved_counts = snapshot(conn)["counts"]
        for table, number in manifest.get("counts", {}).items():
            if number is not None and saved_counts.get(table) != number:
                raise RuntimeError("Backup counts differ from manifest for table " + table)
    return db, manifest

def main() -> int:
    parser = argparse.ArgumentParser(description="Rehearse Prisma schema only against a disposable copy of a verified backup.")
    parser.add_argument("--backup-dir", type=Path, required=True)
    args = parser.parse_args()
    os.umask(0o077)

    backup, manifest = validated_backup(args.backup_dir.expanduser())
    prisma = BACKEND / "node_modules" / ".bin" / "prisma"
    if not prisma.is_file() or not SCHEMA.is_file():
        raise RuntimeError("Local Prisma CLI or schema.prisma missing. Run npm install in backend if needed.")
    if manifest.get("upload_files", 0) < 0:
        raise RuntimeError("Invalid uploads information in manifest.")

    with closing(connect_read_only(backup)) as conn:
        before = snapshot(conn)
    print("REHEARSAL SOURCE: verified backup (never modifies it)")
    print("Legacy tables:", ", ".join(before["tables"]))
    print("Orders:", before["counts"].get("Order", 0),
          "Products:", before["counts"].get("Product", 0),
          "Order items:", before["counts"].get("OrderItem", 0))
    print("Uploads previously verified:", manifest.get("upload_files"))
    print("DATABASE_URL for rehearsal will point ONLY to a newly created file under /tmp.")

    with tempfile.TemporaryDirectory(prefix="thanaya-rehearsal-") as tmp:
        staging = Path(tmp) / "staging.db"
        shutil.copyfile(backup, staging)
        env = os.environ.copy()
        # Prisma requires a file: URL; /absolute/path intentionally targets staging ONLY.
        env["DATABASE_URL"] = "file:" + staging.as_posix()
        env["CI"] = "true"
        env["PRISMA_HIDE_UPDATE_MESSAGE"] = "1"
        argv = [str(prisma), "db", "push", "--skip-generate", "--schema", str(SCHEMA)]
        print("Running Prisma db push on TEMPORARY COPY only (without reset or data-loss flags).")
        result = subprocess.run(argv, cwd=BACKEND, env=env, stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT, text=True, timeout=150)
        output = result.stdout or ""
        print("Prisma output:\n" + output[-5000:])
        if result.returncode != 0:
            raise RuntimeError(
                "Temporary rehearsal refused or failed. ORIGINAL DATA IS UNCHANGED. "
                "Do not run db:push on the real database; review Prisma output."
            )

        with closing(connect_read_only(staging)) as conn:
            verify_integrity(conn, "Migrated temporary copy")
            after = snapshot(conn)
            for table, expected in before["counts"].items():
                if after["counts"].get(table) != expected:
                    raise RuntimeError("Table " + table + " lost/changed rows in rehearsal.")
            for table, required in REQUIRED_COLUMNS.items():
                if table not in after["columns"]:
                    raise RuntimeError("Expected table missing after rehearsal: " + table)
                for column in required:
                    if column not in after["columns"][table]:
                        raise RuntimeError("Column missing in rehearsal: " + table + "." + column)
            for table in REQUIRED_TABLES:
                if table not in after["tables"]:
                    raise RuntimeError("Expected table missing after rehearsal: " + table)
            if after["counts"].get("OrderReturn") != 0 or after["counts"].get("OrderReturnLine") != 0:
                raise RuntimeError("New return tables unexpectedly contain data.")
            new_tables = sorted(set(after["tables"]) - set(before["tables"]))
            new_columns = {
                table: sorted(set(after["columns"][table]) - set(before["columns"].get(table, [])))
                for table in after["tables"]
                if table in before["columns"]
                and set(after["columns"][table]) != set(before["columns"][table])
            }
            print("Added tables:", new_tables)
            print("Added/modified columns by table:", json.dumps(new_columns, ensure_ascii=False))
            print("Legacy table counts preserved:", json.dumps(before["counts"], ensure_ascii=False))
            print("SQLite integrity and foreign keys: OK")
            print("REHEARSAL PASSED — ONLY temporary database was changed.")
            print("The real database and its verified backup remain unchanged.")

    return 0

if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:
        print("REHEARSAL STOPPED: " + str(error), file=sys.stderr)
        sys.exit(1)
