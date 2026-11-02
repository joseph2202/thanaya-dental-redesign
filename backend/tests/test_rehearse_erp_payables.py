"""ERP04 rehearsal tests use only synthetic, disposable SQLite databases."""
import sqlite3
from contextlib import closing
from pathlib import Path
from tempfile import TemporaryDirectory
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from rehearse_erp_payables import MIGRATION,rehearse,status

FIXTURE="""
PRAGMA foreign_keys=ON;
CREATE TABLE "User" ("id" TEXT PRIMARY KEY);
CREATE TABLE "Supplier" ("id" TEXT PRIMARY KEY);
CREATE TABLE "PurchaseOrder" ("id" TEXT PRIMARY KEY,"receiptRevision" INTEGER NOT NULL DEFAULT 0);
CREATE TABLE "PurchaseReceipt" ("id" TEXT PRIMARY KEY,"purchaseOrderId" TEXT);
CREATE TABLE "PurchaseReceiptLine" ("id" TEXT PRIMARY KEY,"receiptId" TEXT);
CREATE TABLE "Product" ("id" TEXT PRIMARY KEY,"stock" INTEGER NOT NULL);
INSERT INTO "User" VALUES ('owner');
INSERT INTO "Supplier" VALUES ('supplier');
INSERT INTO "PurchaseOrder" VALUES ('purchase-01',0);
INSERT INTO "Product" VALUES ('product',13);
INSERT INTO "PurchaseReceipt" VALUES ('r1','purchase-01');
INSERT INTO "PurchaseReceiptLine" VALUES ('line1','r1');
"""

class AccountsPayableRehearsal(unittest.TestCase):
 def setUp(self):
  temp=TemporaryDirectory(prefix="thanaya-ap-rehearsal-")
  self.addCleanup(temp.cleanup)
  self.base=Path(temp.name)
  self.source=self.base/"original.sqlite"
  with closing(sqlite3.connect(self.source)) as db:
   db.executescript(FIXTURE)
   db.commit()

 def test_clone_changes_only_never_source(self):
  before=self.source.read_bytes()
  report=rehearse(self.source)
  self.assertFalse(report["already_installed"])
  self.assertEqual(before,self.source.read_bytes())
  with closing(sqlite3.connect(self.source)) as db:
   self.assertEqual(status(db),"pending")
   self.assertEqual(db.execute('SELECT stock FROM "Product"').fetchone()[0],13)

 def test_rehearsal_is_idempotent_on_activated_schema(self):
  with closing(sqlite3.connect(self.source)) as db:
   with db:
    for sql in MIGRATION: db.execute(sql)
   self.assertEqual(status(db),"installed")
  before=self.source.read_bytes()
  self.assertTrue(rehearse(self.source)["already_installed"])
  self.assertEqual(before,self.source.read_bytes())

 def test_rejects_only_revision_column(self):
  with closing(sqlite3.connect(self.source)) as db:
   db.execute(MIGRATION[0]);db.commit()
  with self.assertRaisesRegex(RuntimeError,"Partial"):
   rehearse(self.source)

 def test_rejects_partial_bill_tables(self):
  with closing(sqlite3.connect(self.source)) as db:
   db.execute('CREATE TABLE "SupplierInvoice" ("id" TEXT PRIMARY KEY)')
   db.commit()
  with self.assertRaisesRegex(RuntimeError,"Partial"):
   rehearse(self.source)

 def test_rejects_missing_erp3(self):
  with closing(sqlite3.connect(self.source)) as db:
   db.execute('DROP TABLE "PurchaseReceiptLine"')
   db.commit()
  with self.assertRaisesRegex(RuntimeError,"requires"):
   rehearse(self.source)

 def test_rejects_symlink_source(self):
  link=self.base/"alias.sqlite"
  link.symlink_to(self.source)
  before=self.source.read_bytes()
  with self.assertRaisesRegex(RuntimeError,"symlink"):
   rehearse(link)
  self.assertEqual(before,self.source.read_bytes())

if __name__=="__main__":
 unittest.main(verbosity=2)
