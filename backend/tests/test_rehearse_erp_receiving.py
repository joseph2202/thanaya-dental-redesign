"""Read-only ERP03 receipt rehearsal tests; synthetic SQLite only."""
from contextlib import closing
from pathlib import Path
import sqlite3
import sys
from tempfile import TemporaryDirectory
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from rehearse_erp_receiving import rehearse, MIGRATION, state

FIXTURE = """
PRAGMA foreign_keys=ON;
CREATE TABLE "User" ("id" TEXT PRIMARY KEY);
CREATE TABLE "ProductLot" ("id" TEXT PRIMARY KEY);
CREATE TABLE "PurchaseOrder" ("id" TEXT PRIMARY KEY, "status" TEXT NOT NULL DEFAULT 'ordered');
CREATE TABLE "PurchaseOrderLine" ("id" TEXT PRIMARY KEY, "purchaseOrderId" TEXT NOT NULL);
INSERT INTO "User" VALUES ('owner-1');
INSERT INTO "ProductLot" VALUES ('lot-1');
INSERT INTO "PurchaseOrder" VALUES ('order-1','ordered');
INSERT INTO "PurchaseOrderLine" VALUES ('line-1','order-1');
"""

class ReceiptRehearsalSafety(unittest.TestCase):
    def setUp(self):
        temp = TemporaryDirectory(prefix="thanaya-erp03-rehearsal-test-")
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.source = self.root/"synthetic.sqlite"
        with closing(sqlite3.connect(self.source)) as db:
            db.executescript(FIXTURE)
            db.commit()

    def test_source_is_unchanged_and_rehearsal_adds_receipts_to_clone(self):
        before=self.source.read_bytes()
        result=rehearse(self.source)
        self.assertFalse(result["already_installed"])
        self.assertEqual(self.source.read_bytes(),before)
        with closing(sqlite3.connect(self.source)) as original:
            self.assertEqual(state(original),"pending")
            self.assertEqual(original.execute('SELECT status FROM "PurchaseOrder"').fetchone()[0],"ordered")

    def test_installed_schema_is_idempotent_and_keeps_existing_records(self):
        with closing(sqlite3.connect(self.source)) as db:
            with db:
                for sql in MIGRATION: db.execute(sql)
            self.assertEqual(state(db),"installed")
        before=self.source.read_bytes()
        self.assertTrue(rehearse(self.source)["already_installed"])
        self.assertEqual(self.source.read_bytes(),before)
        with closing(sqlite3.connect(self.source)) as db:
            self.assertEqual(db.execute('SELECT "receiptRevision" FROM "PurchaseOrder"').fetchone()[0],0)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM "PurchaseReceipt"').fetchone()[0],0)

    def test_rejects_partially_added_column(self):
        with closing(sqlite3.connect(self.source)) as db:
            db.execute(MIGRATION[0]);db.commit()
        with self.assertRaisesRegex(RuntimeError,"Partial"):
            rehearse(self.source)

    def test_rejects_orphan_receipt_table(self):
        with closing(sqlite3.connect(self.source)) as db:
            db.execute('CREATE TABLE "PurchaseReceipt"("id" TEXT PRIMARY KEY)')
            db.commit()
        with self.assertRaisesRegex(RuntimeError,"Partial"):
            rehearse(self.source)

    def test_rejects_missing_legacy_purchase_tables(self):
        with closing(sqlite3.connect(self.source)) as db:
            db.execute('DROP TABLE "PurchaseOrderLine"')
            db.commit()
        with self.assertRaisesRegex(RuntimeError,"requires"):
            rehearse(self.source)

    def test_rejects_symlink_without_touching_source(self):
        fake=self.root/"alias.sqlite"
        fake.symlink_to(self.source)
        before=self.source.read_bytes()
        with self.assertRaisesRegex(RuntimeError,"symlink"):
            rehearse(fake)
        self.assertEqual(self.source.read_bytes(),before)

if __name__=="__main__":
    unittest.main(verbosity=2)
