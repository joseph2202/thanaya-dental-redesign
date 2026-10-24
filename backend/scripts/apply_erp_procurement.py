#!/usr/bin/env python3
"""Guarded supplier / purchase-draft schema activation.

NEVER invoke on the live store without an offline, fresh verified THANAYA backup
and human review. --preflight is strictly read-only, --apply changes only schema.
Existing orders, inventory, payments and returns are left byte-for-byte as rows.
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
from rehearse_erp_procurement import MIGRATION, TABLES, verify, tables
from rehearse_finance_ledger import data_fingerprint
from apply_finance_ledger import schema_snapshot

CONFIRMATION = "APPLY-THANAYA-ERP-PROCUREMENT"

def source_path(source: Path) -> Path:
    p = source.expanduser()
    if p.is_symlink():
        raise RuntimeError("Refusing symlink as live SQLite source")
    p = p.resolve(strict=True)
    if not p.is_file():
        raise RuntimeError("Source SQLite file is missing")
    return p

def validated_backup(source: Path, folder: Path, backup_root: Path) -> tuple[Path, dict]:
    root = backup_root.expanduser()
    if root.is_symlink():
        raise RuntimeError("Backup root is a symlink")
    root = root.resolve(strict=True)
    if not root.is_dir() or folder.is_symlink() or not folder.is_dir():
        raise RuntimeError("Private verified backup folder is missing")
    folder = folder.expanduser().resolve(strict=True)
    if folder.parent != root or not folder.name.startswith("THANAYA-"):
        raise RuntimeError("Backup must be directly within Thanaya-Backups/THANAYA-*")
    dbfile,manifest_path=folder/"database.sqlite",folder/"manifest.json"
    if (dbfile.is_symlink() or not dbfile.is_file()
            or manifest_path.is_symlink() or not manifest_path.is_file()
            or os.path.samefile(source,dbfile)):
        raise RuntimeError("Backup database or manifest is unsafe / not independent")
    manifest=json.loads(manifest_path.read_text(encoding="utf-8"))
    if (manifest.get("project")!="THANAYA" or
        manifest.get("sqlite_integrity")!="ok" or
        manifest.get("uploads_verified_sha256") is not True or
        not isinstance(manifest.get("counts"),dict) or
        manifest.get("database_sha256")!=digest(dbfile)):
        raise RuntimeError("Backup SHA-256 or verification manifest invalid")
    with closing(read_only_connection(dbfile)) as backup:
        if verify(backup):
            raise RuntimeError("ERP schema is already in backup; expected pre-ERP backup")
        if verified_counts(backup)!=manifest["counts"]:
            raise RuntimeError("Backup table counts disagree with manifest")
    return dbfile,manifest

def compare(current: sqlite3.Connection, backup: sqlite3.Connection, manifest: dict) -> list[str]:
    if verify(current):
        raise RuntimeError("ERP procurement schema already installed; migration refused")
    if verified_counts(current)!=manifest["counts"]:
        raise RuntimeError("SQLite rows changed since backup. Take a new offline backup.")
    if schema_snapshot(current)!=schema_snapshot(backup):
        raise RuntimeError("Database schema differs from verified backup")
    originals=tables(backup)
    if data_fingerprint(current,originals)!=data_fingerprint(backup,originals):
        raise RuntimeError("Database content differs from backup")
    integrity(current)
    return originals

def preflight(source: Path, folder: Path, backup_root: Path=BACKUPS) -> dict:
    source=source_path(source)
    dbfile,manifest=validated_backup(source,folder,backup_root)
    with closing(read_only_connection(source)) as current:
        with closing(read_only_connection(dbfile)) as backup:
            compare(current,backup,manifest)
    return manifest["counts"]

def migrate(source: Path, folder: Path, *, confirmation: str,
            backup_root: Path=BACKUPS) -> dict:
    if confirmation!=CONFIRMATION:
        raise RuntimeError("Explicit ERP procurement confirmation was not supplied")
    source=source_path(source)
    counts=preflight(source,folder,backup_root)
    dbfile,manifest=validated_backup(source,folder,backup_root)
    # Rejects a missing source and fails fast if another process holds a writer.
    uri="file:"+quote(source.as_posix(),safe="/")+"?mode=rw"
    with closing(sqlite3.connect(uri,uri=True,timeout=1,isolation_level=None)) as current:
        current.execute("PRAGMA busy_timeout=1000")
        current.execute("PRAGMA foreign_keys=ON")
        try:
            current.execute("BEGIN EXCLUSIVE")
            with closing(read_only_connection(dbfile)) as backup:
                previous_tables=compare(current,backup,manifest)
            rows=data_fingerprint(current,previous_tables)
            old_schema=schema_snapshot(current)
            for statement in MIGRATION:
                current.execute(statement)
            if not verify(current):
                raise RuntimeError("ERP schema incomplete; rolling back")
            if data_fingerprint(current,previous_tables)!=rows:
                raise RuntimeError("Old orders, stock or financial rows changed; rolling back")
            if verified_counts(current)!=counts:
                raise RuntimeError("Old table counts changed; rolling back")
            for name in TABLES:
                if current.execute('SELECT COUNT(*) FROM "'+name+'"').fetchone()[0]:
                    raise RuntimeError("New ERP tables not empty; rolling back")
            # Every existing schema object must remain unchanged.
            excluded=tuple(TABLES)
            old_objects={x[1]:x for x in old_schema}
            new_objects={x[1]:x for x in schema_snapshot(current)
                         if x[2] not in excluded and
                         not x[1].startswith(("Supplier_","PurchaseOrder_","PurchaseOrderLine_","PurchaseOrderEvent_"))}
            if new_objects!=old_objects:
                raise RuntimeError("Unrelated SQLite schema changed; rolling back")
            if current.execute("PRAGMA foreign_key_check").fetchall():
                raise RuntimeError("Foreign key violation; rolling back")
            integrity(current)
            current.execute("COMMIT")
        except BaseException:
            if current.in_transaction:
                current.execute("ROLLBACK")
            raise
    with closing(read_only_connection(source)) as verified:
        if not verify(verified) or verified_counts(verified)!=counts:
            raise RuntimeError("POST-COMMIT verification failed")
        if verified.execute("PRAGMA foreign_key_check").fetchall():
            raise RuntimeError("POST-COMMIT foreign key violation")
        integrity(verified)
    return counts

if __name__=="__main__":
    parser=argparse.ArgumentParser(description="Safely prepare or activate THANAYA ERP procurement tables")
    group=parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--preflight",action="store_true",help="Compare source against verified private backup: READ ONLY")
    group.add_argument("--apply",action="store_true",help="Apply new schema ONLY after independent approval")
    parser.add_argument("--backup",required=True,type=Path)
    parser.add_argument("--confirm",default="")
    args=parser.parse_args()
    try:
        if args.preflight:
            data=preflight(database_path(),args.backup)
            print("THANAYA ERP PROCUREMENT PREFLIGHT — READ ONLY, VERIFIED")
            print("Orders:",data.get("Order"),"Products:",data.get("Product"))
            print("LIVE DATABASE UNCHANGED")
        else:
            data=migrate(database_path(),args.backup,confirmation=args.confirm)
            print("THANAYA ERP PROCUREMENT SCHEMA APPLIED — VERIFIED")
            print("Added Supplier, PurchaseOrder, PurchaseOrderLine and PurchaseOrderEvent; all initially empty")
            print("Existing orders:",data.get("Order"),"Products:",data.get("Product"))
            print("BACKUP UNCHANGED. Generate new Prisma Client BEFORE starting new backend.")
    except (RuntimeError,OSError,ValueError,sqlite3.Error,json.JSONDecodeError) as exc:
        print("THANAYA ERP PROCUREMENT MIGRATION BLOCKED:",exc,file=sys.stderr)
        sys.exit(1)
