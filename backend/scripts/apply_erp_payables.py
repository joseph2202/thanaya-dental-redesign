#!/usr/bin/env python3
"""ERP04 accounts payable guarded SQLite schema activation.

--preflight is strictly read-only. --apply needs a separate verified backup
and explicit human confirmation. Never run against actual shop in CI.
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
from safe_backup import BACKUPS,database_path,digest,integrity,read_only_connection,verified_counts
from apply_finance_ledger import schema_snapshot
from rehearse_erp_payables import MIGRATION,NEW_TABLES,status
from rehearse_erp_receiving import columns,fingerprint

CONFIRMATION="APPLY-THANAYA-ERP04-PAYABLES"

def source_path(path:Path):
 if path.is_symlink():raise RuntimeError("Refusing symlink SQLite source")
 p=path.expanduser().resolve(strict=True)
 if not p.is_file():raise RuntimeError("SQLite source missing")
 return p

def verified_backup(source:Path,folder:Path,backup_root:Path):
 root=backup_root.expanduser()
 if root.is_symlink():raise RuntimeError("Backup root is symlinked")
 root=root.resolve(strict=True)
 if folder.is_symlink() or not folder.is_dir():
  raise RuntimeError("Verified backup folder does not exist")
 folder=folder.expanduser().resolve(strict=True)
 if folder.parent!=root or not folder.name.startswith("THANAYA-"):
  raise RuntimeError("Backup must be a direct Thanaya-Backups/THANAYA-* subfolder")
 backup=folder/"database.sqlite"
 manifest_file=folder/"manifest.json"
 if (backup.is_symlink() or not backup.is_file() or
     manifest_file.is_symlink() or not manifest_file.is_file() or
     os.path.samefile(source,backup)):
  raise RuntimeError("Backup database is missing, linked or not independent")
 manifest=json.loads(manifest_file.read_text(encoding="utf-8"))
 if (manifest.get("project")!="THANAYA" or
     manifest.get("sqlite_integrity")!="ok" or
     manifest.get("uploads_verified_sha256") is not True or
     manifest.get("database_sha256")!=digest(backup) or
     not isinstance(manifest.get("counts"),dict)):
  raise RuntimeError("Backup manifest/SHA-256 verification failed")
 with closing(read_only_connection(backup)) as copy:
  if status(copy)!="pending":
   raise RuntimeError("Backup is not the pre-ERP04 schema")
  if verified_counts(copy)!=manifest["counts"]:
   raise RuntimeError("Backup rows differ from signed manifest")
 return backup,manifest

def compare(live,backup,manifest):
 if status(live)!="pending":
  raise RuntimeError("ERP04 is already installed or schema is partial")
 if verified_counts(live)!=manifest["counts"]:
  raise RuntimeError("SQLite rows changed since backup")
 if schema_snapshot(live)!=schema_snapshot(backup):
  raise RuntimeError("Live schema differs from verified backup")
 layout=columns(backup)
 if fingerprint(live,layout)!=fingerprint(backup,layout):
  raise RuntimeError("Live content differs from verified backup")
 integrity(live)
 return layout

def preflight(source:Path,folder:Path,root:Path=BACKUPS):
 source=source_path(source)
 backup,manifest=verified_backup(source,folder,root)
 with closing(read_only_connection(source)) as live,closing(read_only_connection(backup)) as copy:
  compare(live,copy,manifest)
 return manifest["counts"]

def migrate(source:Path,folder:Path,confirmation:str,root:Path=BACKUPS):
 if confirmation!=CONFIRMATION:
  raise RuntimeError("Exact ERP04 migration confirmation phrase required")
 source=source_path(source)
 counts=preflight(source,folder,root)
 backup,manifest=verified_backup(source,folder,root)
 uri="file:"+quote(source.as_posix(),safe="/")+"?mode=rw"
 with closing(sqlite3.connect(uri,uri=True,timeout=1,isolation_level=None)) as live:
  live.execute("PRAGMA busy_timeout=1000")
  live.execute("PRAGMA foreign_keys=ON")
  try:
   live.execute("BEGIN EXCLUSIVE")
   with closing(read_only_connection(backup)) as verified:
    layout=compare(live,verified,manifest)
   before=fingerprint(live,layout)
   for sql in MIGRATION: live.execute(sql)
   if status(live)!="installed":
    raise RuntimeError("ERP04 schema incomplete, rolling back")
   if fingerprint(live,layout)!=before:
    raise RuntimeError("Old orders, stock or purchase ledger changed, rolling back")
   if verified_counts(live)!=counts:
    raise RuntimeError("Legacy row counts differ, rolling back")
   for table in NEW_TABLES:
    if live.execute('SELECT COUNT(*) FROM "'+table+'"').fetchone()[0]:
     raise RuntimeError("New payable tables not empty, rolling back")
   if live.execute('SELECT COUNT(*) FROM "PurchaseOrder" WHERE "invoiceRevision" != 0').fetchone()[0]:
    raise RuntimeError("Purchase order invoice revision unexpected, rolling back")
   if live.execute("PRAGMA foreign_key_check").fetchall():
    raise RuntimeError("Foreign key check failed, rolling back")
   integrity(live)
   live.execute("COMMIT")
  except BaseException:
   if live.in_transaction:live.execute("ROLLBACK")
   raise
 with closing(read_only_connection(source)) as verified:
  if status(verified)!="installed" or verified_counts(verified)!=counts:
   raise RuntimeError("Post-commit payable verification failed")
  integrity(verified)
 return counts

if __name__=="__main__":
 p=argparse.ArgumentParser(description="Guarded ERP04 supplier payables migration")
 action=p.add_mutually_exclusive_group(required=True)
 action.add_argument("--preflight",action="store_true",help="READ ONLY")
 action.add_argument("--apply",action="store_true",help="Requires written human approval")
 p.add_argument("--backup",type=Path,required=True)
 p.add_argument("--confirm",default="")
 args=p.parse_args()
 try:
  result=preflight(database_path(),args.backup) if args.preflight else migrate(
   database_path(),args.backup,args.confirm)
  print("THANAYA ERP04", "PREFLIGHT READ ONLY" if args.preflight else "SCHEMA APPLIED", "— VERIFIED")
  print("Existing orders:",result.get("Order"),"Products:",result.get("Product"))
  if args.preflight:print("SOURCE UNCHANGED")
 except (OSError,ValueError,RuntimeError,sqlite3.Error,json.JSONDecodeError) as exc:
  print("ERP04 PAYABLE MIGRATION BLOCKED:",exc,file=sys.stderr)
  sys.exit(1)
