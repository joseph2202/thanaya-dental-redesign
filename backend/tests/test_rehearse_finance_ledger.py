"""The financial schema rehearsal must never mutate the real or test source."""
from __future__ import annotations

from contextlib import closing
from pathlib import Path
import sqlite3
import sys
from tempfile import TemporaryDirectory
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from rehearse_finance_ledger import (
    rehearse, ORDER_ADD, CREATE_LEDGER, CREATE_INDEXES, verify_source,
)

SOURCE_SCHEMA = """
CREATE TABLE "Order"(
 "id" TEXT PRIMARY KEY NOT NULL,
 "status" TEXT NOT NULL,
 "total" INTEGER NOT NULL,
 "returnRevision" INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE "OrderReturnLine"(
 "id" TEXT PRIMARY KEY NOT NULL,
 "quantity" INTEGER NOT NULL,
 "disposition" TEXT NOT NULL DEFAULT 'restocked'
);
INSERT INTO "Order" VALUES ('order-001','delivered',85000,0);
INSERT INTO "OrderReturnLine" VALUES ('line-001',1,'restocked');
"""


class FinancialSchemaRehearsalTests(unittest.TestCase):
    def setUp(self):
        self.private = TemporaryDirectory(prefix="thanaya-finance-schema-check-")
        self.addCleanup(self.private.cleanup)
        self.db_path = Path(self.private.name) / "source.sqlite"
        with closing(sqlite3.connect(self.db_path)) as db:
            db.executescript(SOURCE_SCHEMA)
            db.commit()

    def raw(self):
        return self.db_path.read_bytes()

    def test_rehearsal_does_not_change_original_bytes(self):
        before = self.raw()
        result = rehearse(self.db_path)
        self.assertFalse(result["already_upgraded"])
        self.assertEqual(result["orders"], 1)
        self.assertEqual(self.raw(), before)
        with closing(sqlite3.connect(self.db_path)) as db:
            self.assertNotIn("paymentRevision", {
                col[1] for col in db.execute('PRAGMA table_info("Order")')
            })
            self.assertFalse(db.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name='OrderPaymentEvent'"
            ).fetchone())

    def test_existing_financial_data_is_never_rewritten(self):
        with closing(sqlite3.connect(self.db_path)) as db:
            with db:
                db.execute(ORDER_ADD)
                db.execute(CREATE_LEDGER)
                for query in CREATE_INDEXES:
                    db.execute(query)
                db.execute(
                    """INSERT INTO "OrderPaymentEvent"
                       ("id","orderId","requestId","actorId","kind","method","amountIqd","note")
                       VALUES ('e1','order-001','r1','staff1','collection','cash',85000,'sample payment')"""
                )
            self.assertTrue(verify_source(db))
        before = self.raw()
        result = rehearse(self.db_path)
        self.assertTrue(result["already_upgraded"])
        self.assertEqual(self.raw(), before)

    def test_rejects_partially_upgraded_database(self):
        with closing(sqlite3.connect(self.db_path)) as db:
            db.execute(ORDER_ADD)
            db.commit()
        with self.assertRaisesRegex(RuntimeError, "Partial financial"):
            rehearse(self.db_path)

    def test_rejects_quarantine_migration_not_applied(self):
        with closing(sqlite3.connect(self.db_path)) as db:
            db.execute('ALTER TABLE "OrderReturnLine" RENAME TO "old_lines"')
            db.execute('CREATE TABLE "OrderReturnLine" ("id" TEXT PRIMARY KEY)')
            db.commit()
        with self.assertRaisesRegex(RuntimeError, "quarantine"):
            rehearse(self.db_path)

    def test_rejects_missing_order_table(self):
        with closing(sqlite3.connect(self.db_path)) as db:
            db.execute('DROP TABLE "Order"')
            db.commit()
        with self.assertRaisesRegex(RuntimeError, "Order missing"):
            rehearse(self.db_path)

    def test_refuses_symlink_to_source(self):
        link = self.db_path.parent / "shortcut.sqlite"
        link.symlink_to(self.db_path)
        with self.assertRaisesRegex(RuntimeError, "Symlink"):
            rehearse(link)

    def test_rejects_invalid_existing_column(self):
        with closing(sqlite3.connect(self.db_path)) as db:
            with db:
                db.execute('ALTER TABLE "Order" ADD COLUMN "paymentRevision" TEXT DEFAULT "wrong"')
                db.execute(CREATE_LEDGER)
        with self.assertRaisesRegex(RuntimeError, "differs"):
            rehearse(self.db_path)


if __name__ == "__main__":
    unittest.main(verbosity=2)
