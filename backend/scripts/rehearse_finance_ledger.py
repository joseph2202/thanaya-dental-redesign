#!/usr/bin/env python3
"""READ-ONLY trial of THANAYA financial-ledger schema changes on a TEMPORARY copy.

This program NEVER updates the source database or invokes Prisma db push.
Use the existing protected migration workflow for a live update, only after
a new private backup and an explicit migration review.
"""
from __future__ import annotations

import argparse
from contextlib import closing
import hashlib
import os
from pathlib import Path
import sqlite3
import sys
import tempfile

from safe_backup import database_path, integrity, read_only_connection

ORDER_ADD = 'ALTER TABLE "Order" ADD COLUMN "paymentRevision" INTEGER NOT NULL DEFAULT 0'
CREATE_LEDGER = """
CREATE TABLE "OrderPaymentEvent" (
 "id" TEXT PRIMARY KEY NOT NULL,
 "orderId" TEXT NOT NULL,
 "requestId" TEXT NOT NULL,
 "actorId" TEXT NOT NULL,
 "kind" TEXT NOT NULL,
 "method" TEXT NOT NULL,
 "amountIqd" INTEGER NOT NULL,
 "note" TEXT NOT NULL,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE
)
"""
CREATE_INDEXES = (
 'CREATE UNIQUE INDEX "OrderPaymentEvent_orderId_requestId_key" ON "OrderPaymentEvent"("orderId","requestId")',
 'CREATE INDEX "OrderPaymentEvent_orderId_createdAt_idx" ON "OrderPaymentEvent"("orderId","createdAt")',
 'CREATE INDEX "OrderPaymentEvent_createdAt_idx" ON "OrderPaymentEvent"("createdAt")',
)
NEEDED_ORDER = {"id", "total", "status", "returnRevision"}


def cols(db: sqlite3.Connection, table: str) -> set[str]:
    return {row[1] for row in db.execute(
        'PRAGMA table_info("' + table.replace('"', '""') + '")'
    )}


def verify_source(db: sqlite3.Connection) -> bool:
    integrity(db)
    if db.execute('PRAGMA foreign_key_check').fetchall():
        raise RuntimeError("Existing foreign-key violations; migration must not proceed.")
    order_columns = cols(db, "Order")
    if not NEEDED_ORDER.issubset(order_columns):
        raise RuntimeError("Order missing expected previous-version fields.")
    # Returns migration is a prerequisite and was safely applied previously.
    if "disposition" not in cols(db, "OrderReturnLine"):
        raise RuntimeError("Safe return quarantine migration is not yet applied.")
    has_revision = "paymentRevision" in order_columns
    has_events = bool(cols(db, "OrderPaymentEvent"))
    if has_revision != has_events:
        raise RuntimeError("Partial financial schema encountered; refusing to guess.")
    if has_revision:
        revisions = [
            row for row in db.execute('PRAGMA table_info("Order")')
            if row[1] == "paymentRevision"
        ]
        if len(revisions) != 1 or revisions[0][2].upper() != "INTEGER" or revisions[0][3] != 1 or revisions[0][4] != "0":
            raise RuntimeError("Financial revision column differs from expected form.")
        if not {"id", "orderId", "requestId", "actorId", "kind",
                "method", "amountIqd", "note", "createdAt"}.issubset(
                    cols(db, "OrderPaymentEvent")):
            raise RuntimeError("Financial event table differs from intended schema.")
    return has_revision


def data_fingerprint(db: sqlite3.Connection, original_tables: list[str]) -> dict[str, tuple[int, str]]:
    result = {}
    for table in original_tables:
        fields = [col[1] for col in db.execute(
            'PRAGMA table_info("' + table.replace('"', '""') + '")'
        ) if not (table == "Order" and col[1] == "paymentRevision")]
        quoted = ", ".join('"' + c.replace('"', '""') + '"' for c in fields)
        table_sql = '"' + table.replace('"', '""') + '"'
        rows = db.execute(f"SELECT {quoted} FROM {table_sql} ORDER BY rowid")
        count, digest = 0, hashlib.sha256()
        for row in rows:
            count += 1
            digest.update(repr(tuple(row)).encode("utf-8"))
            digest.update(b"\n")
        result[table] = count, digest.hexdigest()
    return result


def rehearse(source: Path) -> dict[str, int | bool]:
    source = source.expanduser()
    if source.is_symlink():
        raise RuntimeError("Symlink database paths not permitted.")
    source = source.resolve(strict=True)
    if not source.is_file():
        raise RuntimeError("Expected an existing SQLite file.")
    os.umask(0o077)
    with closing(read_only_connection(source)) as original:
        already = verify_source(original)
        tables = [row[0] for row in original.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        )]
        before = data_fingerprint(original, tables)
        with tempfile.TemporaryDirectory(prefix="thanaya-finance-rehearsal-") as private:
            temp_db = Path(private) / "rehearsal.sqlite"
            with closing(sqlite3.connect(temp_db)) as clone:
                original.backup(clone, pages=256, sleep=0.05)
                verify_source(clone)
                if data_fingerprint(clone, tables) != before:
                    raise RuntimeError("Clone already differs from source.")
                if not already:
                    with clone:
                        clone.execute(ORDER_ADD)
                        clone.execute(CREATE_LEDGER)
                        for sql in CREATE_INDEXES:
                            clone.execute(sql)
                verify_source(clone)
                if data_fingerprint(clone, tables) != before:
                    raise RuntimeError("Existing records changed in the temporary clone.")
                if not already:
                    if clone.execute('SELECT COUNT(*) FROM "OrderPaymentEvent"').fetchone()[0]:
                        raise RuntimeError("New financial ledger is not empty.")
                    if clone.execute(
                        'SELECT COUNT(*) FROM "Order" WHERE "paymentRevision" != 0'
                    ).fetchone()[0]:
                        raise RuntimeError("Legacy orders unexpectedly changed revision.")
                integrity(clone)
                if clone.execute("PRAGMA foreign_key_check").fetchall():
                    raise RuntimeError("Foreign keys invalid after rehearsal.")
        if data_fingerprint(original, tables) != before:
            raise RuntimeError("Source changed during rehearsal; stop services before live migration.")
    return {"tables": len(tables), "orders": before["Order"][0], "already_upgraded": already}


def main() -> int:
    parser = argparse.ArgumentParser(description="Trial finance schema on private copy only")
    parser.add_argument("--source", type=Path, help="Existing SQLite DB or previous verified backup")
    args = parser.parse_args()
    result = rehearse(args.source or database_path())
    print("THANAYA FINANCE MIGRATION REHEARSAL — PASSED")
    print("Existing tables checked:", result["tables"], "| orders preserved:", result["orders"])
    print("Schema already upgraded:", result["already_upgraded"])
    print("SOURCE UNCHANGED. TEMPORARY COPY DELETED. NO LIVE MIGRATION.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (RuntimeError, ValueError, OSError, sqlite3.Error) as exc:
        print("FINANCE REHEARSAL BLOCKED: " + str(exc), file=sys.stderr)
        sys.exit(1)
