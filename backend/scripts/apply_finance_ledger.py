#!/usr/bin/env python3
"""Guarded THANAYA financial ledger migration.

Default --preflight reads the existing SQLite database and its verified backup
without changing either. Only --apply + an exact confirmation string can alter
the existing source, and only when an exact, recent offline backup matches.

Never uses Prisma db push, never creates a missing source DB, never touches
orders, stock or historical returns, and never fabricates payment events.
STOP backend, frontend and public Cloudflare tunnel before taking a fresh backup.
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

from safe_backup import (
    BACKUPS, database_path, digest, integrity, read_only_connection, verified_counts,
)
from rehearse_finance_ledger import (
    ORDER_ADD, CREATE_LEDGER, CREATE_INDEXES, verify_source, data_fingerprint,
)

CONFIRMATION = "APPLY-THANAYA-FINANCE"
INDEX_PREFIX = "OrderPaymentEvent_"


def tables(db: sqlite3.Connection) -> list[str]:
    return [
        row[0] for row in db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' "
            "AND name NOT LIKE 'sqlite_%' ORDER BY name"
        )
    ]


def schema_snapshot(db: sqlite3.Connection) -> list[tuple]:
    return db.execute(
        "SELECT type,name,tbl_name,sql FROM sqlite_master "
        "WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name"
    ).fetchall()


def validated_backup(source: Path, folder: Path, backup_root: Path) -> tuple[Path, dict]:
    backup_root = backup_root.expanduser()
    if backup_root.is_symlink():
        raise RuntimeError("Backup root must not be a symlink.")
    backup_root = backup_root.resolve(strict=True)
    if not backup_root.is_dir() or folder.is_symlink() or not folder.is_dir():
        raise RuntimeError("A regular THANAYA verified backup directory is required.")
    folder = folder.expanduser().resolve(strict=True)
    if folder.parent != backup_root or not folder.name.startswith("THANAYA-"):
        raise RuntimeError("Expected a direct THANAYA-* folder in ~/Thanaya-Backups.")
    if folder == source.parent:
        raise RuntimeError("Backup must be outside the live SQLite directory.")
    backup_db = folder / "database.sqlite"
    manifest_path = folder / "manifest.json"
    if (backup_db.is_symlink() or not backup_db.is_file()
            or manifest_path.is_symlink() or not manifest_path.is_file()):
        raise RuntimeError("Backup file or verified manifest is missing/unsafe.")
    if os.path.samefile(source, backup_db):
        raise RuntimeError("Backup must be an independent SQLite file.")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if (manifest.get("project") != "THANAYA"
            or manifest.get("sqlite_integrity") != "ok"
            or manifest.get("uploads_verified_sha256") is not True
            or not isinstance(manifest.get("counts"), dict)
            or not isinstance(manifest.get("database_sha256"), str)
            or manifest["database_sha256"] != digest(backup_db)):
        raise RuntimeError("Backup checksum or verification manifest is invalid.")
    with closing(read_only_connection(backup_db)) as backup:
        if verify_source(backup):
            raise RuntimeError("The backup already has financial schema; expected pre-migration backup.")
        if verified_counts(backup) != manifest["counts"]:
            raise RuntimeError("Backup SQLite rows disagree with its verified manifest.")
    return backup_db, manifest


def check_unchanged(current: sqlite3.Connection, backup: sqlite3.Connection,
                    manifest: dict) -> list[str]:
    if verify_source(current):
        raise RuntimeError("The source already has financial schema; migration cannot run twice.")
    if verified_counts(current) != manifest["counts"]:
        raise RuntimeError("Shop row counts changed since backup; take a new offline backup.")
    if schema_snapshot(current) != schema_snapshot(backup):
        raise RuntimeError("Shop schema differs from the backup; refusing to guess.")
    original_tables = tables(backup)
    if data_fingerprint(current, original_tables) != data_fingerprint(backup, original_tables):
        raise RuntimeError("Shop data differ from verified backup; stop and create a new backup.")
    integrity(current)
    return original_tables


def safe_source(source: Path) -> Path:
    source = source.expanduser()
    if source.is_symlink():
        raise RuntimeError("A symlink to the live database is not permitted.")
    source = source.resolve(strict=True)
    if not source.is_file():
        raise RuntimeError("Live SQLite file must already exist.")
    return source


def preflight(source: Path, folder: Path, backup_root: Path = BACKUPS) -> dict:
    source = safe_source(source)
    backup_db, manifest = validated_backup(source, folder, backup_root)
    with closing(read_only_connection(source)) as current:
        with closing(read_only_connection(backup_db)) as backup:
            check_unchanged(current, backup, manifest)
    return manifest["counts"]


def migrate(source: Path, folder: Path, *, confirmation: str,
            backup_root: Path = BACKUPS) -> dict:
    if confirmation != CONFIRMATION:
        raise RuntimeError("Explicit financial migration confirmation is missing or incorrect.")
    source = safe_source(source)
    counts = preflight(source, folder, backup_root)
    backup_db, manifest = validated_backup(source, folder, backup_root)

    # rw refuses missing DB; 1-second exclusive lock refuses active writers.
    sqlite_uri = "file:" + quote(source.as_posix(), safe="/") + "?mode=rw"
    with closing(sqlite3.connect(sqlite_uri, uri=True, timeout=1, isolation_level=None)) as current:
        current.execute("PRAGMA busy_timeout=1000")
        current.execute("PRAGMA foreign_keys=ON")
        try:
            current.execute("BEGIN EXCLUSIVE")
            with closing(read_only_connection(backup_db)) as backup:
                # Re-check under write lock: avoid any race after initial preflight.
                original_tables = check_unchanged(current, backup, manifest)
            before = data_fingerprint(current, original_tables)
            before_schema = schema_snapshot(current)
            current.execute(ORDER_ADD)
            current.execute(CREATE_LEDGER)
            for index_sql in CREATE_INDEXES:
                current.execute(index_sql)
            if not verify_source(current):
                raise RuntimeError("Financial schema not found after DDL; rolling back.")
            if data_fingerprint(current, original_tables) != before:
                raise RuntimeError("Legacy row values changed unexpectedly; rolling back.")
            if verified_counts(current) != counts:
                raise RuntimeError("Legacy row counts changed unexpectedly; rolling back.")
            if current.execute(
                'SELECT COUNT(*) FROM "Order" WHERE "paymentRevision" <> 0 OR "paymentRevision" IS NULL'
            ).fetchone()[0]:
                raise RuntimeError("Legacy order payment revision not zero; rolling back.")
            if current.execute('SELECT COUNT(*) FROM "OrderPaymentEvent"').fetchone()[0]:
                raise RuntimeError("New financial table must be empty; rolling back.")
            # No schema object except the new table/indexes and Order column may change.
            after_schema = schema_snapshot(current)
            old_except_order = [row for row in before_schema if row[1] != "Order"]
            new_except_finance = [
                row for row in after_schema
                if row[1] != "Order" and row[1] != "OrderPaymentEvent"
                and not row[1].startswith(INDEX_PREFIX)
            ]
            if old_except_order != new_except_finance:
                raise RuntimeError("Unrelated schema changed; rolling back.")
            if current.execute("PRAGMA foreign_key_check").fetchall():
                raise RuntimeError("Foreign-key violations; rolling back.")
            integrity(current)
            current.execute("COMMIT")
        except BaseException:
            if current.in_transaction:
                current.execute("ROLLBACK")
            raise
    with closing(read_only_connection(source)) as verified:
        if not verify_source(verified):
            raise RuntimeError("POST-COMMIT WARNING: expected financial schema missing.")
        if verified_counts(verified) != counts:
            raise RuntimeError("POST-COMMIT WARNING: legacy table counts changed.")
        if verified.execute("PRAGMA foreign_key_check").fetchall():
            raise RuntimeError("POST-COMMIT WARNING: SQLite foreign-key violation.")
        integrity(verified)
    return counts


def main() -> int:
    parser = argparse.ArgumentParser(description="Safely check or apply THANAYA finance schema")
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--preflight", action="store_true", help="Compare DB with verified backup (READ ONLY)")
    action.add_argument("--apply", action="store_true", help="Apply table/column ONLY after exact confirmation")
    parser.add_argument("--backup", required=True, type=Path,
                        help="Fresh private verified THANAYA-* backup folder")
    parser.add_argument("--confirm", default="", help="Required exact approval words for --apply")
    args = parser.parse_args()
    source = database_path()
    if args.preflight:
        counts = preflight(source, args.backup)
        print("THANAYA FINANCE PREFLIGHT — READ ONLY, VERIFIED")
        print("Orders: %s; return lines: %s" % (counts.get("Order"), counts.get("OrderReturnLine")))
        print("Live DB UNCHANGED. Exact schema/records match backup.")
        return 0
    counts = migrate(source, args.backup, confirmation=args.confirm)
    print("THANAYA FINANCIAL SCHEMA APPLIED — VERIFIED")
    print("Added paymentRevision (default 0), OrderPaymentEvent and indexes.")
    print("Legacy orders: %s; old return lines: %s preserved." %
          (counts.get("Order"), counts.get("OrderReturnLine")))
    print("Backup remains untouched. Generate the NEW Prisma Client before starting backend.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (RuntimeError, OSError, ValueError, sqlite3.Error, json.JSONDecodeError) as exc:
        print("THANAYA FINANCE MIGRATION BLOCKED: " + str(exc), file=sys.stderr)
        sys.exit(1)
