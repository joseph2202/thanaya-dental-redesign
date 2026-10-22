#!/usr/bin/env python3
"""Guarded, one-column Thanaya SQLite migration.

NEVER creates a database, runs Prisma push, changes inventory, or guesses a
backup path. The owner must stop services and provide a VERIFIED current
backup. A preflight is read-only; --apply demands an explicit confirmation.
"""
from __future__ import annotations

import argparse
from contextlib import closing
import json
import os
from pathlib import Path
import sqlite3
import sys
from urllib.parse import quote

from safe_backup import BACKUPS, database_path, digest, integrity, read_only_connection, verified_counts
from rehearse_return_disposition import ADDITION, fingerprint, validate_source

CONFIRMATION = "APPLY-THANAYA-RETURNS"
EXPECTED_BACKUP_PREFIX = "THANAYA-"


def schema_snapshot(db: sqlite3.Connection) -> list[tuple]:
    return db.execute(
        "SELECT type,name,tbl_name,sql FROM sqlite_master "
        "WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name"
    ).fetchall()


def validated_backup(source: Path, folder: Path, backup_root: Path) -> tuple[Path, dict]:
    backup_root = backup_root.expanduser().resolve(strict=True)
    if not backup_root.is_dir() or not folder.is_dir() or folder.is_symlink():
        raise RuntimeError("Expected a regular verified backup directory.")
    folder = folder.resolve(strict=True)
    if folder.parent != backup_root or not folder.name.startswith(EXPECTED_BACKUP_PREFIX):
        raise RuntimeError("The backup must be a direct THANAYA-* folder inside ~/Thanaya-Backups.")
    if folder == source.parent:
        raise RuntimeError("Backup must be separate from the live SQLite directory.")
    backup_db = folder / "database.sqlite"
    manifest_path = folder / "manifest.json"
    if (not backup_db.is_file() or backup_db.is_symlink()
            or not manifest_path.is_file() or manifest_path.is_symlink()):
        raise RuntimeError("Backup database or verified manifest missing.")
    if os.path.samefile(source, backup_db):
        raise RuntimeError("Backup must be a physically separate file.")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if (manifest.get("project") != "THANAYA"
            or manifest.get("sqlite_integrity") != "ok"
            or manifest.get("uploads_verified_sha256") is not True
            or not isinstance(manifest.get("counts"), dict)
            or not isinstance(manifest.get("database_sha256"), str)
            or manifest["database_sha256"] != digest(backup_db)):
        raise RuntimeError("Backup checksum or manifest invalid; DO NOT MIGRATE.")
    with closing(read_only_connection(backup_db)) as backup:
        if validate_source(backup):
            raise RuntimeError("Backup already has the new column; choose a pre-migration backup.")
        if verified_counts(backup) != manifest["counts"]:
            raise RuntimeError("Backup manifest row counts do not match its database.")
    return backup_db, manifest


def check_unchanged(current: sqlite3.Connection, backup: sqlite3.Connection,
                    manifest: dict) -> None:
    if validate_source(current):
        raise RuntimeError("The source already has disposition; refusing a second migration.")
    if verified_counts(current) != manifest["counts"]:
        raise RuntimeError("Shop records changed since backup. Make a fresh verified backup.")
    if schema_snapshot(current) != schema_snapshot(backup):
        raise RuntimeError("Shop schema differs from verified backup; refusing to guess.")
    if fingerprint(current) != fingerprint(backup):
        raise RuntimeError("Shop data no longer exactly match the verified backup.")
    integrity(current)


def preflight(source: Path, folder: Path, backup_root: Path = BACKUPS) -> dict:
    source = source.expanduser().resolve(strict=True)
    if not source.is_file():
        raise RuntimeError("Shop database must already exist.")
    backup_db, manifest = validated_backup(source, folder, backup_root)
    with closing(read_only_connection(source)) as current:
        with closing(read_only_connection(backup_db)) as backup:
            check_unchanged(current, backup, manifest)
    return manifest["counts"]


def migrate(source: Path, folder: Path, *, confirmation: str,
            backup_root: Path = BACKUPS) -> dict:
    if confirmation != CONFIRMATION:
        raise RuntimeError("Explicit migration confirmation does not match.")
    source = source.expanduser().resolve(strict=True)
    counts = preflight(source, folder, backup_root)
    backup_db, manifest = validated_backup(source, folder, backup_root)

    # SQLite mode=rw refuses a missing database. BEGIN EXCLUSIVE fails instead
    # of proceeding when other writers are holding the source database.
    sqlite_uri = "file:" + quote(source.as_posix(), safe="/") + "?mode=rw"
    with closing(sqlite3.connect(sqlite_uri, uri=True, timeout=1, isolation_level=None)) as current:
        current.execute("PRAGMA busy_timeout=1000")
        current.execute("PRAGMA foreign_keys=ON")
        try:
            current.execute("BEGIN EXCLUSIVE")
            with closing(read_only_connection(backup_db)) as backup:
                # Recheck AFTER taking the exclusive lock: no time-of-check
                # race can smuggle inventory changes between checks and DDL.
                check_unchanged(current, backup, manifest)
            old_values = fingerprint(current)
            current.execute(ADDITION)
            if not validate_source(current):
                raise RuntimeError("Expected disposition column absent after migration.")
            if fingerprint(current, skip_disposition=True) != old_values:
                raise RuntimeError("Existing row data changed unexpectedly. Rolling back.")
            unwanted = current.execute(
                """SELECT COUNT(*) FROM "OrderReturnLine"
                   WHERE disposition <> 'restocked' OR disposition IS NULL"""
            ).fetchone()[0]
            if unwanted:
                raise RuntimeError("Historical returns not labelled restocked. Rolling back.")
            if verified_counts(current) != counts:
                raise RuntimeError("Table row counts changed unexpectedly. Rolling back.")
            if current.execute("PRAGMA foreign_key_check").fetchall():
                raise RuntimeError("Foreign-key violations. Rolling back.")
            integrity(current)
            current.execute("COMMIT")
        except BaseException:
            if current.in_transaction:
                current.execute("ROLLBACK")
            raise
    with closing(read_only_connection(source)) as checked:
        if not validate_source(checked):
            raise RuntimeError("POST-COMMIT WARNING: expected schema missing!")
        if verified_counts(checked) != counts:
            raise RuntimeError("POST-COMMIT WARNING: row counts changed!")
        integrity(checked)
        if checked.execute("PRAGMA foreign_key_check").fetchall():
            raise RuntimeError("POST-COMMIT WARNING: foreign key check failed!")
    return counts


def main() -> int:
    parser = argparse.ArgumentParser(description="Guarded Thanaya return schema migration")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--preflight", action="store_true", help="Read-only backup comparison")
    mode.add_argument("--apply", action="store_true", help="Apply exactly ONE column")
    parser.add_argument("--backup", type=Path, required=True,
                        help="Recent verified THANAYA-* folder (not the SQLite filename)")
    parser.add_argument("--confirm", default="", help="Required exact words for --apply")
    args = parser.parse_args()
    source = database_path()  # existing dev.db from backend/.env
    if args.preflight:
        counts = preflight(source, args.backup)
        print("THANAYA MIGRATION PREFLIGHT PASSED — read only.")
        print("Existing orders: %s; old return lines: %s" %
              (counts.get("Order"), counts.get("OrderReturnLine")))
        print("LIVE DB UNCHANGED; verified backup matches exact records and schema.")
        return 0
    counts = migrate(source, args.backup, confirmation=args.confirm)
    print("THANAYA RETURN SCHEMA MIGRATION APPLIED — VERIFIED")
    print("Added OrderReturnLine.disposition with legacy default restocked.")
    print("Original rows preserved; orders: %s; return lines: %s." %
          (counts.get("Order"), counts.get("OrderReturnLine")))
    print("Backup untouched. Start the NEW backend only after Prisma generate.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (RuntimeError, sqlite3.Error, OSError, ValueError, json.JSONDecodeError) as exc:
        print("THANAYA MIGRATION BLOCKED: " + str(exc), file=sys.stderr)
        sys.exit(1)
