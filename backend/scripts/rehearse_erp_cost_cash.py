#!/usr/bin/env python3
"""ERP05 + ERP06 additive schema rehearsal on a disposable SQLite CLONE.

No apply mode, no writes to --source. Requires prior ERP03/ERP04 schemas.
"""
from __future__ import annotations
import argparse
from contextlib import closing
from pathlib import Path
import sqlite3
import sys
from tempfile import TemporaryDirectory
from safe_backup import read_only_connection,integrity,database_path
from rehearse_erp_receiving import columns,fingerprint

NEW_TABLES=("OrderItemCostSnapshot","StoreExpense","CashAdjustment")
MIGRATION=(
 '''CREATE TABLE "OrderItemCostSnapshot" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "orderItemId" TEXT NOT NULL,
 "lotId" TEXT,
 "quantity" INTEGER NOT NULL,
 "unitCostIqd" INTEGER,
 "source" TEXT NOT NULL,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY ("orderItemId") REFERENCES "OrderItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
 )''',
 'CREATE INDEX "OrderItemCostSnapshot_orderItemId_idx" ON "OrderItemCostSnapshot"("orderItemId")',
 'CREATE INDEX "OrderItemCostSnapshot_createdAt_idx" ON "OrderItemCostSnapshot"("createdAt")',
 '''CREATE TABLE "StoreExpense" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "requestId" TEXT NOT NULL,
 "actorId" TEXT NOT NULL,
 "category" TEXT NOT NULL,
 "method" TEXT NOT NULL,
 "amountIqd" INTEGER NOT NULL,
 "reference" TEXT NOT NULL,
 "note" TEXT NOT NULL,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
 )''',
 'CREATE UNIQUE INDEX "StoreExpense_requestId_key" ON "StoreExpense"("requestId")',
 'CREATE INDEX "StoreExpense_createdAt_idx" ON "StoreExpense"("createdAt")',
 'CREATE INDEX "StoreExpense_category_createdAt_idx" ON "StoreExpense"("category","createdAt")',
 '''CREATE TABLE "CashAdjustment" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "requestId" TEXT NOT NULL,
 "actorId" TEXT NOT NULL,
 "direction" TEXT NOT NULL,
 "amountIqd" INTEGER NOT NULL,
 "reference" TEXT NOT NULL,
 "note" TEXT NOT NULL,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
 )''',
 'CREATE UNIQUE INDEX "CashAdjustment_requestId_key" ON "CashAdjustment"("requestId")',
 'CREATE INDEX "CashAdjustment_createdAt_idx" ON "CashAdjustment"("createdAt")',
)
EXPECTED={
 "OrderItemCostSnapshot":{"id","orderItemId","lotId","quantity","unitCostIqd","source","createdAt"},
 "StoreExpense":{"id","requestId","actorId","category","method","amountIqd","reference","note","createdAt"},
 "CashAdjustment":{"id","requestId","actorId","direction","amountIqd","reference","note","createdAt"}
}
def state(db):
 integrity(db)
 if db.execute("PRAGMA foreign_key_check").fetchall():
  raise RuntimeError("Existing foreign keys invalid")
 names={row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
 if not {"OrderItem","User","SupplierInvoice","SupplierPayment"}.issubset(names):
  raise RuntimeError("ERP05/06 requires completed ERP04 supplier payable schema")
 present=names.intersection(NEW_TABLES)
 if not present:return "pending"
 if present!=set(NEW_TABLES):
  raise RuntimeError("Partial ERP05/06 schema: one or more tables missing")
 for table,required in EXPECTED.items():
  cols={col[1] for col in db.execute('PRAGMA table_info("'+table+'")')}
  if not required.issubset(cols):
   raise RuntimeError("Incomplete ERP05/06 table: "+table)
 return "installed"

def rehearse(source:Path):
 if source.is_symlink():
  raise RuntimeError("SQLite source symlink refused")
 source=source.expanduser().resolve(strict=True)
 if not source.is_file():raise RuntimeError("SQLite source missing")
 with closing(read_only_connection(source)) as original:
  initial=state(original)
  layout=columns(original)
  before=fingerprint(original,layout)
  with TemporaryDirectory(prefix="thanaya-cost-cash-rehearsal-") as folder:
   with closing(sqlite3.connect(Path(folder)/"copy.sqlite")) as copy:
    original.backup(copy)
    if fingerprint(copy,layout)!=before:
     raise RuntimeError("Temporary copy differs from source")
    if initial=="pending":
     with copy:
      for sql in MIGRATION:copy.execute(sql)
    if state(copy)!="installed":
     raise RuntimeError("ERP05/06 schema not installed on disposable copy")
    if fingerprint(copy,layout)!=before:
     raise RuntimeError("Legacy inventory, orders or payments changed")
    if initial=="pending":
     for table in NEW_TABLES:
      if copy.execute('SELECT count(*) FROM "'+table+'"').fetchone()[0]:
       raise RuntimeError("New table was unexpectedly populated")
  if fingerprint(original,layout)!=before:
   raise RuntimeError("Original changed during read-only rehearsal")
 return {"prior_tables":len(layout),"already_installed":initial=="installed"}

if __name__=="__main__":
 parser=argparse.ArgumentParser(description="Read-only ERP05/06 schema rehearsal")
 parser.add_argument("--source",type=Path)
 args=parser.parse_args()
 try:
  result=rehearse(args.source or database_path())
  print("THANAYA ERP05/06 SCHEMA REHEARSAL PASSED")
  print(result)
  print("SOURCE UNCHANGED; writes only occurred on private temporary clone.")
 except (OSError,RuntimeError,ValueError,sqlite3.Error) as e:
  print("ERP05/06 REHEARSAL BLOCKED:",e,file=sys.stderr)
  sys.exit(1)
