"""Guarded ERP03 activation: disposable SQLite + independently signed test backup."""
from contextlib import closing
import json
from pathlib import Path
import sqlite3
import sys
from tempfile import TemporaryDirectory
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from apply_erp_receiving import CONFIRMATION, preflight, migrate
from rehearse_erp_receiving import state
from safe_backup import digest,verified_counts

SCHEMA = """
PRAGMA foreign_keys=ON;
CREATE TABLE "User" ("id" TEXT PRIMARY KEY);
CREATE TABLE "ProductLot" ("id" TEXT PRIMARY KEY);
CREATE TABLE "PurchaseOrder" ("id" TEXT PRIMARY KEY, "status" TEXT NOT NULL DEFAULT 'ordered');
CREATE TABLE "PurchaseOrderLine" ("id" TEXT PRIMARY KEY, "purchaseOrderId" TEXT NOT NULL);
CREATE TABLE "Order" ("id" TEXT PRIMARY KEY,"total" INTEGER);
CREATE TABLE "Product" ("id" TEXT PRIMARY KEY,"stock" INTEGER);
INSERT INTO "User" VALUES ('owner-1');
INSERT INTO "ProductLot" VALUES ('lot-1');
INSERT INTO "PurchaseOrder" VALUES ('order-1','ordered');
INSERT INTO "PurchaseOrderLine" VALUES ('line-1','order-1');
INSERT INTO "Order" VALUES ('customer-order-1',70000);
INSERT INTO "Product" VALUES ('product-1',42);
"""

class GuardedReceivingActivation(unittest.TestCase):
    def setUp(self):
        directory=TemporaryDirectory(prefix="thanaya-erp03-guard-test-")
        self.addCleanup(directory.cleanup)
        self.home=Path(directory.name)
        self.root=self.home/"Thanaya-Backups"
        self.folder=self.root/"THANAYA-20261102-TEST"
        self.folder.mkdir(parents=True)
        self.source=self.home/"shop.sqlite"
        self.backup=self.folder/"database.sqlite"
        with closing(sqlite3.connect(self.source)) as live:
            live.executescript(SCHEMA)
            live.commit()
            with closing(sqlite3.connect(self.backup)) as backup:
                live.backup(backup)
        self.write_manifest()

    def write_manifest(self):
        with closing(sqlite3.connect(self.backup)) as db:
            counts=verified_counts(db)
        (self.folder/"manifest.json").write_text(json.dumps({
            "project":"THANAYA",
            "sqlite_integrity":"ok",
            "uploads_verified_sha256":True,
            "database_sha256":digest(self.backup),
            "counts":counts,
        }),encoding="utf-8")

    def test_preflight_is_read_only(self):
        original=self.source.read_bytes()
        self.assertEqual(preflight(self.source,self.folder,self.root).get("Order"),1)
        self.assertEqual(original,self.source.read_bytes())

    def test_rejects_migration_without_exact_confirmation(self):
        before=self.source.read_bytes()
        with self.assertRaisesRegex(RuntimeError,"approval"):
            migrate(self.source,self.folder,"",self.root)
        self.assertEqual(before,self.source.read_bytes())

    def test_guarded_activation_keeps_purchase_and_customer_rows(self):
        self.assertEqual(migrate(self.source,self.folder,CONFIRMATION,self.root)["Product"],1)
        with closing(sqlite3.connect(self.source)) as db:
            self.assertEqual(state(db),"installed")
            self.assertEqual(db.execute('SELECT total FROM "Order"').fetchone()[0],70000)
            self.assertEqual(db.execute('SELECT stock FROM "Product"').fetchone()[0],42)
            self.assertEqual(db.execute('SELECT status,"receiptRevision" FROM "PurchaseOrder"').fetchone(),("ordered",0))
            self.assertEqual(db.execute('SELECT count(*) FROM "PurchaseReceipt"').fetchone()[0],0)
            db.execute("PRAGMA foreign_keys=ON")
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute('INSERT INTO "PurchaseReceipt" ("id","purchaseOrderId","requestId","actorId","note") VALUES ("r","fake","req","owner-1","test")')
        with self.assertRaisesRegex(RuntimeError,"already|incomplete"):
            migrate(self.source,self.folder,CONFIRMATION,self.root)

    def test_rejects_stale_backup_after_inventory_change(self):
        with closing(sqlite3.connect(self.source)) as db:
            db.execute('UPDATE "Product" SET "stock"=100')
            db.commit()
        before=self.source.read_bytes()
        with self.assertRaisesRegex(RuntimeError,"content|rows"):
            migrate(self.source,self.folder,CONFIRMATION,self.root)
        self.assertEqual(before,self.source.read_bytes())

    def test_rejects_tampered_backup(self):
        with closing(sqlite3.connect(self.backup)) as db:
            db.execute('UPDATE "Product" SET "stock"=999')
            db.commit()
        with self.assertRaisesRegex(RuntimeError,"manifest|SHA-256"):
            preflight(self.source,self.folder,self.root)

    def test_rejects_partial_schema(self):
        with closing(sqlite3.connect(self.source)) as db:
            db.execute('ALTER TABLE "PurchaseOrder" ADD COLUMN "receiptRevision" INTEGER NOT NULL DEFAULT 0')
            db.commit()
        with self.assertRaisesRegex(RuntimeError,"Partial"):
            preflight(self.source,self.folder,self.root)

    def test_blocks_concurrent_writer(self):
        with closing(sqlite3.connect(self.source,timeout=1,isolation_level=None)) as writer:
            writer.execute("BEGIN EXCLUSIVE")
            with self.assertRaises(sqlite3.OperationalError):
                migrate(self.source,self.folder,CONFIRMATION,self.root)
            writer.execute("ROLLBACK")
        with closing(sqlite3.connect(self.source)) as db:
            self.assertEqual(state(db),"pending")

    def test_rejects_symlink_source(self):
        other=self.home/"symlink.sqlite"
        other.symlink_to(self.source)
        with self.assertRaisesRegex(RuntimeError,"symlink"):
            preflight(other,self.folder,self.root)

if __name__ == "__main__":
    unittest.main(verbosity=2)
