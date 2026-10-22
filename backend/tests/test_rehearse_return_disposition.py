#!/usr/bin/env python3
"""CI tests: nonempty legacy data, already-upgraded schema, and rejection cases.

Creates ONLY disposable SQLite files under /tmp and never touches dev.db.
"""
from __future__ import annotations

from contextlib import closing
import sqlite3
from tempfile import TemporaryDirectory
from pathlib import Path
import unittest

# unittest discovery from backend/tests does not automatically include backend/scripts
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from rehearse_return_disposition import rehearse

LEGACY_SQL = '''
PRAGMA foreign_keys=ON;
CREATE TABLE "User" ("id" TEXT PRIMARY KEY, "name" TEXT NOT NULL);
CREATE TABLE "Product" ("id" TEXT PRIMARY KEY, "stock" INTEGER NOT NULL);
CREATE TABLE "Order" ("id" TEXT PRIMARY KEY, "userId" TEXT, "total" INTEGER NOT NULL,
 FOREIGN KEY("userId") REFERENCES "User"("id"));
CREATE TABLE "OrderItem" ("id" TEXT PRIMARY KEY, "orderId" TEXT NOT NULL,
 "productId" TEXT NOT NULL, "quantity" INTEGER NOT NULL,
 FOREIGN KEY("orderId") REFERENCES "Order"("id"),
 FOREIGN KEY("productId") REFERENCES "Product"("id"));
CREATE TABLE "OrderReturn" ("id" TEXT PRIMARY KEY, "orderId" TEXT NOT NULL,
 "reason" TEXT NOT NULL, FOREIGN KEY("orderId") REFERENCES "Order"("id"));
CREATE TABLE "OrderReturnLine" ("id" TEXT PRIMARY KEY, "orderReturnId" TEXT NOT NULL,
 "orderItemId" TEXT NOT NULL, "lotId" TEXT, "quantity" INTEGER NOT NULL,
 FOREIGN KEY("orderReturnId") REFERENCES "OrderReturn"("id"),
 FOREIGN KEY("orderItemId") REFERENCES "OrderItem"("id"));
CREATE TABLE "InventoryMovement" ("id" TEXT PRIMARY KEY, "productId" TEXT NOT NULL,
 "delta" INTEGER NOT NULL, FOREIGN KEY("productId") REFERENCES "Product"("id"));
INSERT INTO "User" VALUES ('u1','sample user');
INSERT INTO "Product" VALUES ('p1',7);
INSERT INTO "Order" VALUES ('o1','u1',60000);
INSERT INTO "OrderItem" VALUES ('i1','o1','p1',3);
INSERT INTO "OrderReturn" VALUES ('r1','o1','Legacy good return');
INSERT INTO "OrderReturnLine" VALUES ('rl1','r1','i1',NULL,2);
INSERT INTO "InventoryMovement" VALUES ('m1','p1',2);
'''


class QuarantineMigrationRehearsalTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = TemporaryDirectory(prefix='thanaya-rehearsal-test-')
        self.addCleanup(self.temporary.cleanup)
        self.source = Path(self.temporary.name) / 'legacy.sqlite'
        with closing(sqlite3.connect(self.source)) as db:
            db.executescript(LEGACY_SQL)
            db.commit()

    def test_nonempty_legacy_data_migrates_only_on_copy(self) -> None:
        original_bytes = self.source.read_bytes()
        result = rehearse(self.source)
        self.assertFalse(result['already_upgraded'])
        self.assertEqual(result['previous_return_lines'], 1)
        self.assertEqual(result['tables'], 7)
        self.assertEqual(original_bytes, self.source.read_bytes())
        with closing(sqlite3.connect(self.source)) as db:
            column_names = [x[1] for x in db.execute('PRAGMA table_info("OrderReturnLine")')]
            self.assertNotIn('disposition', column_names)
            self.assertEqual(db.execute('SELECT "stock" FROM "Product"').fetchone()[0], 7)
            self.assertEqual(db.execute('SELECT "total" FROM "Order"').fetchone()[0], 60000)
            self.assertEqual(db.execute('SELECT "quantity" FROM "OrderReturnLine"').fetchone()[0], 2)

    def test_already_upgraded_is_readonly_noop(self) -> None:
        with closing(sqlite3.connect(self.source)) as db:
            db.execute('ALTER TABLE "OrderReturnLine" ADD COLUMN "disposition" TEXT NOT NULL DEFAULT \'restocked\'')
            db.commit()
        initial = self.source.read_bytes()
        result = rehearse(self.source)
        self.assertTrue(result['already_upgraded'])
        self.assertEqual(initial, self.source.read_bytes())

    def test_rejects_malformed_disposition(self) -> None:
        with closing(sqlite3.connect(self.source)) as db:
            db.execute('ALTER TABLE "OrderReturnLine" ADD COLUMN "disposition" TEXT')
            db.commit()
        with self.assertRaisesRegex(RuntimeError, 'differs'):
            rehearse(self.source)

    def test_rejects_foreign_key_breakage(self) -> None:
        with closing(sqlite3.connect(self.source)) as db:
            db.execute('PRAGMA foreign_keys=OFF')
            db.execute('UPDATE "OrderItem" SET "orderId"=? WHERE "id"=?', ('missing', 'i1'))
            db.commit()
        with self.assertRaisesRegex(RuntimeError, 'foreign-key'):
            rehearse(self.source)

    def test_rejects_missing_expected_table(self) -> None:
        with closing(sqlite3.connect(self.source)) as db:
            db.execute('PRAGMA foreign_keys=OFF')
            db.execute('DROP TABLE "OrderReturnLine"')
            db.commit()
        with self.assertRaisesRegex(RuntimeError, 'table not found'):
            rehearse(self.source)


if __name__ == '__main__':
    unittest.main(verbosity=2)
