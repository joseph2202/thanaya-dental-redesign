"""ERP04 guarded payable activation tests never open the user's database."""
from contextlib import closing
import json
from pathlib import Path
import sqlite3
import sys
from tempfile import TemporaryDirectory
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from apply_erp_payables import CONFIRMATION,preflight,migrate
from rehearse_erp_payables import status
from safe_backup import digest,verified_counts

SCHEMA="""
PRAGMA foreign_keys=ON;
CREATE TABLE "User"("id" TEXT PRIMARY KEY);
CREATE TABLE "Supplier"("id" TEXT PRIMARY KEY);
CREATE TABLE "PurchaseOrder"("id" TEXT PRIMARY KEY,"receiptRevision" INTEGER NOT NULL DEFAULT 0);
CREATE TABLE "PurchaseReceipt"("id" TEXT PRIMARY KEY);
CREATE TABLE "PurchaseReceiptLine"("id" TEXT PRIMARY KEY);
CREATE TABLE "Product"("id" TEXT PRIMARY KEY,stock INTEGER NOT NULL);
CREATE TABLE "Order"("id" TEXT PRIMARY KEY,total INTEGER NOT NULL);
INSERT INTO "User" VALUES ('owner');
INSERT INTO "Supplier" VALUES ('supplier');
INSERT INTO "PurchaseOrder" VALUES ('po1',0);
INSERT INTO "PurchaseReceipt" VALUES ('receipt1');
INSERT INTO "PurchaseReceiptLine" VALUES ('line1');
INSERT INTO "Product" VALUES ('product1',9);
INSERT INTO "Order" VALUES ('customer1',70000);
"""

class PayableSchemaActivation(unittest.TestCase):
 def setUp(self):
  temp=TemporaryDirectory(prefix="thanaya-erp04-apply-test-")
  self.addCleanup(temp.cleanup)
  self.base=Path(temp.name)
  self.root=self.base/"Thanaya-Backups"
  self.folder=self.root/"THANAYA-20261102-TEST"
  self.folder.mkdir(parents=True)
  self.source=self.base/"source.sqlite"
  self.backup=self.folder/"database.sqlite"
  with closing(sqlite3.connect(self.source)) as db:
   db.executescript(SCHEMA)
   db.commit()
   with closing(sqlite3.connect(self.backup)) as copy:db.backup(copy)
  self.manifest()
 def manifest(self):
  with closing(sqlite3.connect(self.backup)) as db:counts=verified_counts(db)
  (self.folder/"manifest.json").write_text(json.dumps({
   "project":"THANAYA","sqlite_integrity":"ok",
   "uploads_verified_sha256":True,
   "database_sha256":digest(self.backup),"counts":counts
  }),encoding="utf-8")

 def test_preflight_preserves_every_original_byte(self):
  before=self.source.read_bytes()
  self.assertEqual(preflight(self.source,self.folder,self.root).get("Product"),1)
  self.assertEqual(before,self.source.read_bytes())

 def test_activation_changes_only_schema_and_adds_empty_accounts(self):
  counts=migrate(self.source,self.folder,CONFIRMATION,self.root)
  self.assertEqual(counts["Order"],1)
  with closing(sqlite3.connect(self.source)) as db:
   self.assertEqual(status(db),"installed")
   self.assertEqual(db.execute('SELECT stock FROM "Product"').fetchone()[0],9)
   self.assertEqual(db.execute('SELECT total FROM "Order"').fetchone()[0],70000)
   self.assertEqual(db.execute('SELECT invoiceRevision FROM "PurchaseOrder"').fetchone()[0],0)
   self.assertEqual(db.execute('SELECT COUNT(*) FROM "SupplierInvoice"').fetchone()[0],0)
   self.assertEqual(db.execute('SELECT COUNT(*) FROM "SupplierPayment"').fetchone()[0],0)
   db.execute("PRAGMA foreign_keys=ON")
   with self.assertRaises(sqlite3.IntegrityError):
    db.execute("""INSERT INTO "SupplierInvoice"
     ("id","requestId","supplierId","purchaseOrderId","invoiceNumber","amountIqd",
      "invoiceDate","dueDate","note","createdById")
     VALUES ("b1","req1","ghost","po1","B-1",1,"2026-11-02","2026-12-02","sample","owner")""")
  with self.assertRaisesRegex(RuntimeError,"already"):
   migrate(self.source,self.folder,CONFIRMATION,self.root)

 def test_missing_confirmation_rejected(self):
  before=self.source.read_bytes()
  with self.assertRaisesRegex(RuntimeError,"confirmation"):
   migrate(self.source,self.folder,"",self.root)
  self.assertEqual(before,self.source.read_bytes())

 def test_stale_backup_after_stock_change_rejected(self):
  with closing(sqlite3.connect(self.source)) as db:
   db.execute('UPDATE "Product" SET stock=10')
   db.commit()
  before=self.source.read_bytes()
  with self.assertRaisesRegex(RuntimeError,"changed|differs"):
   migrate(self.source,self.folder,CONFIRMATION,self.root)
  self.assertEqual(before,self.source.read_bytes())

 def test_tampered_backup_rejected(self):
  with closing(sqlite3.connect(self.backup)) as db:
   db.execute('UPDATE "Order" SET total=5')
   db.commit()
  with self.assertRaisesRegex(RuntimeError,"manifest|SHA-256"):
   preflight(self.source,self.folder,self.root)

 def test_partial_schema_refused(self):
  with closing(sqlite3.connect(self.source)) as db:
   db.execute('ALTER TABLE "PurchaseOrder" ADD COLUMN "invoiceRevision" INTEGER NOT NULL DEFAULT 0')
   db.commit()
  with self.assertRaisesRegex(RuntimeError,"Partial"):
   preflight(self.source,self.folder,self.root)

 def test_concurrent_sqlite_writer_refused(self):
  with closing(sqlite3.connect(self.source,timeout=1,isolation_level=None)) as writer:
   writer.execute("BEGIN EXCLUSIVE")
   with self.assertRaises(sqlite3.OperationalError):
    migrate(self.source,self.folder,CONFIRMATION,self.root)
   writer.execute("ROLLBACK")
  with closing(sqlite3.connect(self.source)) as db:self.assertEqual(status(db),"pending")

 def test_symlink_source_refused(self):
  link=self.base/"link.sqlite"
  link.symlink_to(self.source)
  with self.assertRaisesRegex(RuntimeError,"symlink"):
   preflight(link,self.folder,self.root)

if __name__=="__main__":
 unittest.main(verbosity=2)
