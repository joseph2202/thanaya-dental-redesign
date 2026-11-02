#!/usr/bin/env python3
"""Guarded ERP03 receiving-table activation.

--preflight: read-only. --apply: requires an independent verified backup,
an exact confirmation phrase and a final exclusive-lock recheck.
Never launch automatically; run only after owner approves controlled local migration.
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
from apply_finance_ledger import schema_snapshot
from rehearse_erp_receiving import MIGRATION, NEW_TABLES, columns, fingerprint, state

CONFIRMATION = "APPLY-THANAYA-ERP03-RECEIVING"

def real_file(candidate: Path) -> Path:
    if candidate.is_symlink():
        raise RuntimeError("Refusing symlink as SQLite source")
    p = candidate.expanduser().resolve(strict=True)
    if not p.is_file():
        raise RuntimeError("SQLite source is missing")
    return p

def backup_file(source: Path, folder: Path, root: Path):
    root = root.expanduser()
    if root.is_symlink():
        raise RuntimeError("Backup root must not be symlinked")
    root = root.resolve(strict=True)
    if folder.is_symlink() or not folder.is_dir():
        raise RuntimeError("Private verified backup directory not found")
    folder = folder.expanduser().resolve(strict=True)
    if folder.parent != root or not folder.name.startswith("THANAYA-"):
        raise RuntimeError("Backup directory must be directly under Thanaya-Backups/THANAYA-*")
    dbfile = folder / "database.sqlite"
    manifest_file = folder / "manifest.json"
    if dbfile.is_symlink() or not dbfile.is_file() or manifest_file.is_symlink() or not manifest_file.is_file():
        raise RuntimeError("Verified backup files are missing or unsafe")
    if os.path.samefile(source, dbfile):
        raise RuntimeError("Live SQLite file cannot also be its own backup")
    manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
    if (manifest.get("project") != "THANAYA"
        or manifest.get("sqlite_integrity") != "ok"
        or manifest.get("uploads_verified_sha256") is not True
        or manifest.get("database_sha256") != digest(dbfile)
        or not isinstance(manifest.get("counts"), dict)):
        raise RuntimeError("Backup manifest or SHA-256 verification failed")
    with closing(read_only_connection(dbfile)) as copy:
        if state(copy) != "pending":
            raise RuntimeError("Backup must contain the previous ERP schema, but not ERP03 receipts")
        if verified_counts(copy) != manifest["counts"]:
            raise RuntimeError("Backup table counts differ from signed manifest")
    return dbfile, manifest

def compare(current, backup, manifest):
    if state(current) != "pending":
        raise RuntimeError("ERP03 schema is already installed or incomplete")
    if verified_counts(current) != manifest["counts"]:
        raise RuntimeError("Live SQLite rows changed since backup; create a new offline backup")
    if schema_snapshot(current) != schema_snapshot(backup):
        raise RuntimeError("SQLite schema differs from verified backup")
    original_columns = columns(backup)
    if fingerprint(current, original_columns) != fingerprint(backup, original_columns):
        raise RuntimeError("SQLite content differs from verified backup")
    integrity(current)
    return original_columns

def preflight(source: Path, folder: Path, root: Path=BACKUPS):
    source = real_file(source)
    dbfile, manifest = backup_file(source, folder, root)
    with closing(read_only_connection(source)) as live, closing(read_only_connection(dbfile)) as backup:
        compare(live, backup, manifest)
    return manifest["counts"]

def migrate(source: Path, folder: Path, confirmation: str, root: Path=BACKUPS):
    if confirmation != CONFIRMATION:
        raise RuntimeError("Exact ERP03 migration approval phrase is required")
    source = real_file(source)
    counts = preflight(source, folder, root)
    dbfile, manifest = backup_file(source, folder, root)
    uri = "file:" + quote(source.as_posix(), safe="/") + "?mode=rw"
    with closing(sqlite3.connect(uri, uri=True, timeout=1, isolation_level=None)) as live:
        live.execute("PRAGMA busy_timeout=1000")
        live.execute("PRAGMA foreign_keys=ON")
        try:
            live.execute("BEGIN EXCLUSIVE")
            with closing(read_only_connection(dbfile)) as backup:
                old_layout = compare(live, backup, manifest)
            old_rows = fingerprint(live, old_layout)
            for statement in MIGRATION:
                live.execute(statement)
            if state(live) != "installed":
                raise RuntimeError("Receipt schema not installed; rolling back")
            if fingerprint(live, old_layout) != old_rows:
                raise RuntimeError("Existing purchase, inventory or customer rows changed; rolling back")
            if verified_counts(live) != counts:
                raise RuntimeError("Old table counts changed; rolling back")
            if live.execute("SELECT count(*) FROM \"PurchaseReceipt\"").fetchone()[0]:
                raise RuntimeError("New receipt table not empty; rolling back")
            if live.execute("SELECT count(*) FROM \"PurchaseReceiptLine\"").fetchone()[0]:
                raise RuntimeError("New receipt lines not empty; rolling back")
            if live.execute('SELECT COUNT(*) FROM "PurchaseOrder" WHERE "receiptRevision" != 0').fetchone()[0]:
                raise RuntimeError("Existing purchase orders have unexpected receipt revisions")
            if live.execute("PRAGMA foreign_key_check").fetchall():
                raise RuntimeError("Foreign keys invalid; rolling back")
            integrity(live)
            live.execute("COMMIT")
        except BaseException:
            if live.in_transaction:
                live.execute("ROLLBACK")
            raise
    with closing(read_only_connection(source)) as current:
        if state(current) != "installed" or verified_counts(current) != counts:
            raise RuntimeError("Post-commit verification failed")
        integrity(current)
    return counts

if __name__ == "__main__":
    parser=argparse.ArgumentParser(description="Guarded ERP03 receipts schema migration")
    action=parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--preflight",action="store_true",help="READ ONLY backup comparison")
    action.add_argument("--apply",action="store_true",help="Do NOT run without explicit human approval")
    parser.add_argument("--backup",required=True,type=Path)
    parser.add_argument("--confirm",default="")
    args=parser.parse_args()
    try:
        if args.preflight:
            result=preflight(database_path(),args.backup)
            print("THANAYA ERP03 RECEIVING PREFLIGHT — READ ONLY, VERIFIED")
            print("Existing orders:",result.get("Order"),"Products:",result.get("Product"))
            print("SOURCE UNCHANGED")
        else:
            result=migrate(database_path(),args.backup,args.confirm)
            print("THANAYA ERP03 RECEIVING SCHEMA APPLIED — VERIFIED")
            print("Orders preserved:",result.get("Order"))
            print("RESTORE VERIFIED BACKUP if independent validation later fails.")
    except (OSError,RuntimeError,ValueError,json.JSONDecodeError,sqlite3.Error) as error:
        print("ERP03 RECEIVING ACTIVATION BLOCKED:",error,file=sys.stderr)
        sys.exit(1)
