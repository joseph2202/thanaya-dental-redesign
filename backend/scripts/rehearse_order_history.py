#!/usr/bin/env python3
"""Rehearse additive order status evidence on a disposable clone, never source."""
from __future__ import annotations
import argparse
from contextlib import closing
from pathlib import Path
import sqlite3
import sys
from tempfile import TemporaryDirectory
from safe_backup import read_only_connection, integrity
from rehearse_erp_receiving import columns, fingerprint

TABLE = "OrderStatusEvent"
MIGRATION = (
    '''CREATE TABLE "OrderStatusEvent" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "orderId" TEXT NOT NULL,
      "actorId" TEXT NOT NULL,
      "actorName" TEXT NOT NULL,
      "actorRole" TEXT NOT NULL,
      "kind" TEXT NOT NULL,
      "fromStatus" TEXT,
      "toStatus" TEXT NOT NULL,
      "reason" TEXT,
      "referenceId" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
    )''',
    'CREATE INDEX "OrderStatusEvent_orderId_createdAt_idx" ON "OrderStatusEvent"("orderId","createdAt")',
    'CREATE INDEX "OrderStatusEvent_actorId_createdAt_idx" ON "OrderStatusEvent"("actorId","createdAt")',
)
EXPECTED = {"id", "orderId", "actorId", "actorName", "actorRole", "kind", "fromStatus",
            "toStatus", "reason", "referenceId", "createdAt"}


def state(db):
    integrity(db)
    if db.execute("PRAGMA foreign_key_check").fetchall():
        raise RuntimeError("Existing foreign keys invalid")
    for table, required in [("User", {"id", "name", "role"}), ("Order", {"id", "status"})]:
        actual = {row[1] for row in db.execute('PRAGMA table_info("' + table + '")')}
        if not required.issubset(actual):
            raise RuntimeError("Order history requires existing User/Order schema")
    names = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    if TABLE not in names:
        return "pending"
    actual = {row[1] for row in db.execute('PRAGMA table_info("OrderStatusEvent")')}
    if actual != EXPECTED:
        raise RuntimeError("Incomplete order history columns")
    foreign = {(row[2], row[3], row[4], row[6]) for row in db.execute('PRAGMA foreign_key_list("OrderStatusEvent")')}
    if foreign != {("Order", "orderId", "id", "RESTRICT"), ("User", "actorId", "id", "RESTRICT")}:
        raise RuntimeError("Incomplete order history foreign keys")
    indexes = set()
    for row in db.execute('PRAGMA index_list("OrderStatusEvent")'):
        # Names come from SQLite metadata, not caller input.
        name = row[1].replace('"', '""')
        indexes.add(tuple(col[2] for col in db.execute('PRAGMA index_info("' + name + '")')))
    if not {("orderId", "createdAt"), ("actorId", "createdAt")}.issubset(indexes):
        raise RuntimeError("Incomplete order history indexes")
    return "installed"


def rehearse(source: Path):
    source = source.expanduser()
    if source.is_symlink():
        raise RuntimeError("SQLite source symlink refused")
    source = source.resolve(strict=True)
    if not source.is_file():
        raise RuntimeError("SQLite source must be a file")
    with closing(read_only_connection(source)) as original:
        prior = state(original)
        layout = columns(original)
        before = fingerprint(original, layout)
        with TemporaryDirectory(prefix="thanaya-order-history-rehearsal-") as folder:
            with closing(sqlite3.connect(Path(folder) / "clone.sqlite")) as copy:
                copy.execute("PRAGMA foreign_keys=ON")
                original.backup(copy)
                if fingerprint(copy, layout) != before:
                    raise RuntimeError("Temporary copy differs from source")
                if prior == "pending":
                    with copy:
                        for sql in MIGRATION:
                            copy.execute(sql)
                if state(copy) != "installed" or fingerprint(copy, layout) != before:
                    raise RuntimeError("Rehearsal altered existing rows or did not finish")
                if prior == "pending" and copy.execute('SELECT count(*) FROM "OrderStatusEvent"').fetchone()[0]:
                    raise RuntimeError("Historical events must not be invented")
        if fingerprint(original, layout) != before:
            raise RuntimeError("Original changed during rehearsal")
    return {"prior_tables": len(layout), "already_installed": prior == "installed",
            "source_unchanged": True, "historical_events_backfilled": 0}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Order status history rehearsal; clone writes only")
    parser.add_argument("--source", type=Path, required=True)
    args = parser.parse_args()
    try:
        print("THANAYA ORDER HISTORY REHEARSAL PASSED", rehearse(args.source))
        print("SOURCE UNCHANGED; no live activation mode exists.")
    except (OSError, RuntimeError, ValueError, sqlite3.Error) as error:
        print("ORDER HISTORY REHEARSAL BLOCKED:", error, file=sys.stderr)
        sys.exit(1)
