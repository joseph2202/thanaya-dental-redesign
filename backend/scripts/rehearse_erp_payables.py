#!/usr/bin/env python3
"""Read-only ERP04 payable schema rehearsal on a disposable SQLite clone."""
from __future__ import annotations
import argparse
from contextlib import closing
from pathlib import Path
import sqlite3
import sys
from tempfile import TemporaryDirectory
from safe_backup import read_only_connection, integrity, database_path
from rehearse_erp_receiving import columns, fingerprint

NEW_TABLES=("SupplierInvoice","SupplierPayment")
MIGRATION=(
 'ALTER TABLE "PurchaseOrder" ADD COLUMN "invoiceRevision" INTEGER NOT NULL DEFAULT 0',
 '''CREATE TABLE "SupplierInvoice"(
 "id" TEXT NOT NULL PRIMARY KEY,
 "requestId" TEXT NOT NULL,
 "supplierId" TEXT NOT NULL,
 "purchaseOrderId" TEXT NOT NULL,
 "invoiceNumber" TEXT NOT NULL,
 "amountIqd" INTEGER NOT NULL,
 "invoiceDate" TEXT NOT NULL,
 "dueDate" TEXT NOT NULL,
 "note" TEXT NOT NULL,
 "createdById" TEXT NOT NULL,
 "paymentRevision" INTEGER NOT NULL DEFAULT 0,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
 )''',
 '''CREATE TABLE "SupplierPayment"(
 "id" TEXT NOT NULL PRIMARY KEY,
 "invoiceId" TEXT NOT NULL,
 "requestId" TEXT NOT NULL,
 "actorId" TEXT NOT NULL,
 "method" TEXT NOT NULL,
 "amountIqd" INTEGER NOT NULL,
 "reference" TEXT NOT NULL,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY ("invoiceId") REFERENCES "SupplierInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
 )''',
 'CREATE UNIQUE INDEX "SupplierInvoice_requestId_key" ON "SupplierInvoice"("requestId")',
 'CREATE UNIQUE INDEX "SupplierInvoice_supplierId_invoiceNumber_key" ON "SupplierInvoice"("supplierId","invoiceNumber")',
 'CREATE INDEX "SupplierInvoice_supplierId_createdAt_idx" ON "SupplierInvoice"("supplierId","createdAt")',
 'CREATE INDEX "SupplierInvoice_purchaseOrderId_idx" ON "SupplierInvoice"("purchaseOrderId")',
 'CREATE INDEX "SupplierInvoice_dueDate_idx" ON "SupplierInvoice"("dueDate")',
 'CREATE UNIQUE INDEX "SupplierPayment_invoiceId_requestId_key" ON "SupplierPayment"("invoiceId","requestId")',
 'CREATE INDEX "SupplierPayment_invoiceId_createdAt_idx" ON "SupplierPayment"("invoiceId","createdAt")',
 'CREATE INDEX "SupplierPayment_actorId_createdAt_idx" ON "SupplierPayment"("actorId","createdAt")',
)

def table_names(db):
 return {row[0] for row in db.execute(
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}

def status(db):
 integrity(db)
 if db.execute("PRAGMA foreign_key_check").fetchall():
  raise RuntimeError("Existing foreign keys invalid")
 existing=table_names(db)
 if not {"Supplier","PurchaseOrder","PurchaseReceipt","PurchaseReceiptLine","User"}.issubset(existing):
  raise RuntimeError("ERP04 requires activated procurement and ERP03 receipt schemas")
 has_revision="invoiceRevision" in {
  row[1] for row in db.execute('PRAGMA table_info("PurchaseOrder")')
 }
 present=existing.intersection(NEW_TABLES)
 if not has_revision and not present:
  return "pending"
 if has_revision and present==set(NEW_TABLES):
  for name,required in {
   "SupplierInvoice":{"id","requestId","supplierId","purchaseOrderId","invoiceNumber",
    "amountIqd","invoiceDate","dueDate","createdById","paymentRevision"},
   "SupplierPayment":{"id","invoiceId","requestId","actorId","method","amountIqd","reference"}
  }.items():
   fields={row[1] for row in db.execute('PRAGMA table_info("'+name+'")')}
   if not required.issubset(fields):
    raise RuntimeError("Incomplete accounts payable schema: "+name)
  return "installed"
 raise RuntimeError("Partial ERP04 schema detected")

def rehearse(source:Path):
 if source.is_symlink():
  raise RuntimeError("SQLite source may not be a symlink")
 source=source.expanduser().resolve(strict=True)
 if not source.is_file():
  raise RuntimeError("SQLite source must exist")
 with closing(read_only_connection(source)) as original:
  initial=status(original)
  layout=columns(original)
  before=fingerprint(original,layout)
  with TemporaryDirectory(prefix="thanaya-erp04-rehearsal-") as temp:
   with closing(sqlite3.connect(Path(temp)/"private.sqlite")) as copy:
    original.backup(copy)
    if fingerprint(copy,layout)!=before:
     raise RuntimeError("Copy differs from original")
    if initial=="pending":
     with copy:
      for statement in MIGRATION:
       copy.execute(statement)
    if status(copy)!="installed":
     raise RuntimeError("ERP04 tables did not activate on clone")
    if fingerprint(copy,layout)!=before:
     raise RuntimeError("Purchase orders, stock or customer data changed")
    if initial=="pending":
     for name in NEW_TABLES:
      if copy.execute('SELECT COUNT(*) FROM "'+name+'"').fetchone()[0]:
       raise RuntimeError("New accounts payable tables are unexpectedly nonempty")
     if copy.execute('SELECT COUNT(*) FROM "PurchaseOrder" WHERE "invoiceRevision" != 0').fetchone()[0]:
      raise RuntimeError("Unexpected legacy invoice revision values")
  if fingerprint(original,layout)!=before:
   raise RuntimeError("Source changed during read-only rehearsal")
 return {"original_tables":len(layout),"already_installed":initial=="installed"}

if __name__=="__main__":
 parser=argparse.ArgumentParser(description="READ-ONLY ERP04 accounts payable schema rehearsal")
 parser.add_argument("--source",type=Path)
 args=parser.parse_args()
 try:
  report=rehearse(args.source or database_path())
  print("THANAYA ERP04 PAYABLES REHEARSAL — PASSED")
  print("Old tables preserved:",report["original_tables"])
  print("Schema already installed:",report["already_installed"])
  print("SOURCE UNCHANGED. ONLY TEMPORARY DATABASE MODIFIED.")
 except (OSError,ValueError,sqlite3.Error,RuntimeError) as err:
  print("ERP04 REHEARSAL BLOCKED:",err,file=sys.stderr)
  sys.exit(1)
