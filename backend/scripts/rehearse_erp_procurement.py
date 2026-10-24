#!/usr/bin/env python3
"""ERP phase-one schema rehearsal on a private SQLite clone only.

This script is ALWAYS READ ONLY on the source; it never runs prisma db push.
Requires the existing finance ledger schema from the previous safe migration.
"""
from __future__ import annotations

from contextlib import closing
import argparse
from pathlib import Path
import sqlite3
import sys
import tempfile

from safe_backup import database_path, integrity, read_only_connection
from rehearse_finance_ledger import data_fingerprint

TABLES = ("Supplier", "PurchaseOrder", "PurchaseOrderLine")
MIGRATION = [
    """CREATE TABLE "Supplier" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "code" TEXT NOT NULL, "name" TEXT NOT NULL,
        "contact" TEXT, "phone" TEXT, "email" TEXT, "city" TEXT,
        "address" TEXT, "note" TEXT,
        "active" BOOLEAN NOT NULL DEFAULT true,
        "revision" INTEGER NOT NULL DEFAULT 0,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL
    )""",
    """CREATE TABLE "PurchaseOrder" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "requestId" TEXT NOT NULL, "supplierId" TEXT NOT NULL,
        "createdById" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'draft',
        "note" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL,
        FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id")
          ON DELETE RESTRICT ON UPDATE CASCADE,
        FOREIGN KEY ("createdById") REFERENCES "User" ("id")
          ON DELETE RESTRICT ON UPDATE CASCADE
    )""",
    """CREATE TABLE "PurchaseOrderLine" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "purchaseOrderId" TEXT NOT NULL, "productId" TEXT NOT NULL,
        "productName" TEXT NOT NULL, "sku" TEXT,
        "quantity" INTEGER NOT NULL, "unitCostIqd" INTEGER NOT NULL,
        FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder" ("id")
          ON DELETE RESTRICT ON UPDATE CASCADE,
        FOREIGN KEY ("productId") REFERENCES "Product" ("id")
          ON DELETE RESTRICT ON UPDATE CASCADE
    )""",
    'CREATE UNIQUE INDEX "Supplier_code_key" ON "Supplier" ("code")',
    'CREATE INDEX "Supplier_name_idx" ON "Supplier" ("name")',
    'CREATE INDEX "Supplier_active_idx" ON "Supplier" ("active")',
    'CREATE UNIQUE INDEX "PurchaseOrder_requestId_key" ON "PurchaseOrder" ("requestId")',
    'CREATE INDEX "PurchaseOrder_supplierId_createdAt_idx" ON "PurchaseOrder" ("supplierId","createdAt")',
    'CREATE INDEX "PurchaseOrder_createdAt_idx" ON "PurchaseOrder" ("createdAt")',
    'CREATE INDEX "PurchaseOrderLine_purchaseOrderId_idx" ON "PurchaseOrderLine" ("purchaseOrderId")',
    'CREATE INDEX "PurchaseOrderLine_productId_idx" ON "PurchaseOrderLine" ("productId")',
]

def tables(db:sqlite3.Connection)->list[str]:
    return [row[0] for row in db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' "
        "AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )]

def verify(db:sqlite3.Connection)->bool:
    integrity(db)
    if db.execute("PRAGMA foreign_key_check").fetchall():
        raise RuntimeError("Foreign keys are invalid; refusing rehearsal")
    names = set(tables(db))
    if not {"User","Product","Order","OrderPaymentEvent","OrderReturnLine"}.issubset(names):
        raise RuntimeError("ERP requires already migrated orders, returns and finance tables")
    existing=names.intersection(TABLES)
    if existing and existing!=set(TABLES):
        raise RuntimeError("Partial ERP procurement migration detected; no changes permitted")
    if existing:
        expected={
            "Supplier":{"id","code","name","active","revision","updatedAt"},
            "PurchaseOrder":{"id","supplierId","requestId","createdById","status"},
            "PurchaseOrderLine":{"id","purchaseOrderId","productId","quantity","unitCostIqd"}
        }
        for name,required in expected.items():
            found={column[1] for column in db.execute('PRAGMA table_info("'+name+'")')}
            if not required.issubset(found):
                raise RuntimeError("ERP schema is incomplete: "+name)
    return bool(existing)

def rehearse(path:Path)->dict:
    if path.is_symlink():raise RuntimeError("Source must not be a symlink")
    source=path.expanduser().resolve(strict=True)
    if not source.is_file():raise RuntimeError("Source database does not exist")
    with closing(read_only_connection(source)) as original:
        already=verify(original)
        originals=tables(original)
        before=data_fingerprint(original,originals)
        with tempfile.TemporaryDirectory(prefix="thanaya-erp-rehearsal-") as tmp:
            with closing(sqlite3.connect(Path(tmp)/"erp.sqlite")) as copy:
                original.backup(copy)
                if data_fingerprint(copy,originals)!=before:
                    raise RuntimeError("Temporary backup differs from source")
                if not already:
                    with copy:
                        for statement in MIGRATION:copy.execute(statement)
                if not verify(copy):
                    raise RuntimeError("New schema not present in clone")
                if data_fingerprint(copy,originals)!=before:
                    raise RuntimeError("Legacy records changed in the clone")
                if not already:
                    for name in TABLES:
                        if copy.execute('SELECT COUNT(*) FROM "'+name+'"').fetchone()[0]:
                            raise RuntimeError("New ERP table must start empty")
        if data_fingerprint(original,originals)!=before:
            raise RuntimeError("Source changed during rehearsal")
    return {"tables_preserved":len(originals),"already_applied":already}

if __name__=="__main__":
    p=argparse.ArgumentParser(description="READ-ONLY ERP procurement schema rehearsal")
    p.add_argument("--source",type=Path)
    args=p.parse_args()
    try:
        result=rehearse(args.source or database_path())
        print("THANAYA ERP PROCUREMENT REHEARSAL — PASSED")
        print("Old tables identical:",result["tables_preserved"])
        print("Schema previously upgraded:",result["already_applied"])
        print("SOURCE UNCHANGED. TEMPORARY DATABASE DELETED. NO LIVE MIGRATION.")
    except (RuntimeError,OSError,sqlite3.Error,ValueError) as exc:
        print("THANAYA ERP REHEARSAL BLOCKED:",exc,file=sys.stderr)
        sys.exit(1)
