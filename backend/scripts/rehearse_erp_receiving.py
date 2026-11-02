#!/usr/bin/env python3
"""ERP03 receipt-schema rehearsal on a private SQLite clone.

Read-only against --source: never applies the schema to the actual shop.
"""
from __future__ import annotations

import argparse
from contextlib import closing
from hashlib import sha256
from pathlib import Path
import sqlite3
import sys
from tempfile import TemporaryDirectory

from safe_backup import integrity, read_only_connection, database_path

NEW_TABLES = ("PurchaseReceipt", "PurchaseReceiptLine")
MIGRATION = (
    'ALTER TABLE "PurchaseOrder" ADD COLUMN "receiptRevision" INTEGER NOT NULL DEFAULT 0',
    '''CREATE TABLE "PurchaseReceipt" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "purchaseOrderId" TEXT NOT NULL,
      "requestId" TEXT NOT NULL,
      "actorId" TEXT NOT NULL,
      "note" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
    )''',
    '''CREATE TABLE "PurchaseReceiptLine" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "receiptId" TEXT NOT NULL,
      "purchaseOrderLineId" TEXT NOT NULL,
      "quantity" INTEGER NOT NULL,
      "unitCostIqd" INTEGER NOT NULL,
      "lotId" TEXT,
      "lotCode" TEXT,
      "expiryDate" TEXT,
      FOREIGN KEY ("receiptId") REFERENCES "PurchaseReceipt" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      FOREIGN KEY ("purchaseOrderLineId") REFERENCES "PurchaseOrderLine" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      FOREIGN KEY ("lotId") REFERENCES "ProductLot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
    )''',
    'CREATE UNIQUE INDEX "PurchaseReceipt_purchaseOrderId_requestId_key" ON "PurchaseReceipt" ("purchaseOrderId","requestId")',
    'CREATE INDEX "PurchaseReceipt_purchaseOrderId_createdAt_idx" ON "PurchaseReceipt" ("purchaseOrderId","createdAt")',
    'CREATE INDEX "PurchaseReceipt_actorId_createdAt_idx" ON "PurchaseReceipt" ("actorId","createdAt")',
    'CREATE UNIQUE INDEX "PurchaseReceiptLine_receiptId_purchaseOrderLineId_key" ON "PurchaseReceiptLine" ("receiptId","purchaseOrderLineId")',
    'CREATE INDEX "PurchaseReceiptLine_purchaseOrderLineId_idx" ON "PurchaseReceiptLine" ("purchaseOrderLineId")',
    'CREATE INDEX "PurchaseReceiptLine_lotId_idx" ON "PurchaseReceiptLine" ("lotId")',
)

def names(db):
    return {row[0] for row in db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}

def columns(db):
    result = {}
    for name in sorted(names(db)):
        safe = name.replace('"', '""')
        result[name] = tuple(row[1] for row in db.execute('PRAGMA table_info("'+safe+'")'))
    return result

def fingerprint(db, layout):
    result = {}
    for name, fields in layout.items():
        safe = name.replace('"', '""')
        quoted = ','.join('"'+col.replace('"','""')+'"' for col in fields)
        hash_value = sha256()
        count = 0
        for row in db.execute('SELECT '+quoted+' FROM "'+safe+'" ORDER BY rowid'):
            hash_value.update(repr(tuple(row)).encode('utf-8') + b'\n')
            count += 1
        result[name] = (count, hash_value.hexdigest())
    return result

def state(db):
    if db.execute("PRAGMA foreign_key_check").fetchall():
        raise RuntimeError("Source has broken foreign key references")
    integrity(db)
    existing = names(db)
    if not {"PurchaseOrder", "PurchaseOrderLine", "User", "ProductLot"}.issubset(existing):
        raise RuntimeError("ERP03 requires activated purchase-order and lot schemas")
    has_revision = "receiptRevision" in {
        x[1] for x in db.execute('PRAGMA table_info("PurchaseOrder")')
    }
    present = existing.intersection(NEW_TABLES)
    if not present and not has_revision:
        return "pending"
    if present != set(NEW_TABLES) or not has_revision:
        raise RuntimeError("Partial ERP03 receipt schema detected; rehearsal blocked")
    expected = {
        "PurchaseReceipt": {"id", "purchaseOrderId", "requestId", "actorId", "note", "createdAt"},
        "PurchaseReceiptLine": {"id", "receiptId", "purchaseOrderLineId", "quantity",
                                "unitCostIqd", "lotId", "lotCode", "expiryDate"},
    }
    for table, required in expected.items():
        available = {x[1] for x in db.execute('PRAGMA table_info("'+table+'")')}
        if not required.issubset(available):
            raise RuntimeError("Incomplete ERP03 table: "+table)
    return "installed"

def rehearse(source_path: Path):
    if source_path.is_symlink():
        raise RuntimeError("SQLite source symlink is forbidden")
    source = source_path.expanduser().resolve(strict=True)
    if not source.is_file():
        raise RuntimeError("Expected an existing SQLite database")
    with closing(read_only_connection(source)) as live:
        initial_state = state(live)
        layout = columns(live)
        initial = fingerprint(live, layout)
        with TemporaryDirectory(prefix="thanaya-receiving-rehearsal-") as tmp:
            with closing(sqlite3.connect(Path(tmp) / "receipt-copy.sqlite")) as copy:
                live.backup(copy)
                if fingerprint(copy, layout) != initial:
                    raise RuntimeError("Source-to-clone data mismatch")
                if initial_state == "pending":
                    with copy:
                        for statement in MIGRATION:
                            copy.execute(statement)
                if state(copy) != "installed":
                    raise RuntimeError("Receipt schema was not installed on clone")
                if fingerprint(copy, layout) != initial:
                    raise RuntimeError("Existing orders, stock or purchase data changed")
                if initial_state == "pending":
                    for table in NEW_TABLES:
                        if copy.execute('SELECT count(*) FROM "'+table+'"').fetchone()[0]:
                            raise RuntimeError("New receipt tables are not empty")
                if not all(row[0] == 0 for row in copy.execute(
                    'SELECT "receiptRevision" FROM "PurchaseOrder"')) and initial_state == "pending":
                    raise RuntimeError("Existing orders have an unexpected receipt revision")
        if fingerprint(live, layout) != initial:
            raise RuntimeError("Source changed during read-only rehearsal")
    return {"original_tables":len(layout), "already_installed":initial_state=="installed"}

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="READ-ONLY ERP03 receiving migration rehearsal")
    parser.add_argument("--source", type=Path, default=None)
    args = parser.parse_args()
    try:
        summary = rehearse(args.source or database_path())
        print("THANAYA ERP03 RECEIVING REHEARSAL — PASSED")
        print("Previous tables verified:", summary["original_tables"])
        print("Schema already installed:", summary["already_installed"])
        print("SOURCE DATABASE UNCHANGED. MIGRATION RUN ONLY ON TEMPORARY CLONE.")
    except (OSError, ValueError, RuntimeError, sqlite3.Error) as error:
        print("THANAYA ERP03 REHEARSAL BLOCKED:", error, file=sys.stderr)
        sys.exit(1)
