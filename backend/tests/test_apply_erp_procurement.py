"""Guarded ERP migration: all tests run on synthetic, disposable SQLite."""
from contextlib import closing
import json
from pathlib import Path
import sqlite3
import sys
from tempfile import TemporaryDirectory
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from apply_erp_procurement import CONFIRMATION,preflight,migrate
from rehearse_erp_procurement import verify,tables
from rehearse_finance_ledger import data_fingerprint
from safe_backup import verified_counts,digest

SCHEMA="""
PRAGMA foreign_keys=ON;
CREATE TABLE "User"("id" TEXT PRIMARY KEY, "name" TEXT);
CREATE TABLE "Product"("id" TEXT PRIMARY KEY, "stock" INTEGER);
CREATE TABLE "Order"("id" TEXT PRIMARY KEY, "total" INTEGER, "paymentRevision" INTEGER NOT NULL DEFAULT 0);
CREATE TABLE "OrderReturnLine"("id" TEXT PRIMARY KEY, "disposition" TEXT);
CREATE TABLE "OrderPaymentEvent"("id" TEXT PRIMARY KEY);
CREATE TABLE "InventoryMovement"("id" TEXT PRIMARY KEY, "delta" INTEGER);
INSERT INTO "User" VALUES ('owner-1','Owner');
INSERT INTO "Product" VALUES ('product-1',17);
INSERT INTO "Order" ("id","total") VALUES ('order-1',85000);
INSERT INTO "InventoryMovement" VALUES ('move-1',-3);
"""

class GuardedProcurementSafety(unittest.TestCase):
    def setUp(self):
        temp=TemporaryDirectory(prefix="thanaya-erp-apply-test-")
        self.addCleanup(temp.cleanup)
        self.base=Path(temp.name)
        self.root=self.base/"Thanaya-Backups"
        self.folder=self.root/"THANAYA-20261024-104500"
        self.folder.mkdir(parents=True)
        self.source=self.base/"dev.db"
        self.backup=self.folder/"database.sqlite"
        with closing(sqlite3.connect(self.source)) as conn:
            conn.executescript(SCHEMA)
            conn.commit()
            with closing(sqlite3.connect(self.backup)) as backup:
                conn.backup(backup)
        self.manifest()

    def manifest(self):
        with closing(sqlite3.connect(self.backup)) as conn:
            counts=verified_counts(conn)
        (self.folder/"manifest.json").write_text(json.dumps({
            "project":"THANAYA","sqlite_integrity":"ok",
            "uploads_verified_sha256":True,
            "database_sha256":digest(self.backup),"counts":counts
        }),encoding="utf-8")
    def preflight(self):
        return preflight(self.source,self.folder,self.root)
    def apply(self):
        return migrate(self.source,self.folder,confirmation=CONFIRMATION,backup_root=self.root)
    def test_preflight_is_byte_identical(self):
        before=self.source.read_bytes()
        self.assertIn("Order",self.preflight())
        self.assertEqual(before,self.source.read_bytes())
    def test_guards_existing_orders_stock_finance_and_adds_empty_tables(self):
        with closing(sqlite3.connect(self.source)) as db:
            original=tables(db)
            before=data_fingerprint(db,original)
        self.assertIn("Order",self.apply())
        with closing(sqlite3.connect(self.source)) as db:
            self.assertTrue(verify(db))
            self.assertEqual(data_fingerprint(db,original),before)
            self.assertEqual(db.execute('SELECT stock FROM "Product"').fetchone()[0],17)
            for name in ("Supplier","PurchaseOrder","PurchaseOrderLine"):
                self.assertEqual(db.execute('SELECT count(*) FROM "'+name+'"').fetchone()[0],0)
            db.execute("PRAGMA foreign_keys=ON")
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute("""INSERT INTO "PurchaseOrder"
                ("id","requestId","supplierId","createdById","updatedAt")
                VALUES('p1','r1','missing','owner-1',CURRENT_TIMESTAMP)""")
        with self.assertRaisesRegex(RuntimeError,"already"):
            self.apply()
    def test_refuses_stale_backup_different_stock(self):
        with closing(sqlite3.connect(self.source)) as db:
            db.execute('UPDATE "Product" SET stock=33')
            db.commit()
        old=self.source.read_bytes()
        with self.assertRaisesRegex(RuntimeError,"content|rows|changed"):
            self.apply()
        self.assertEqual(old,self.source.read_bytes())
    def test_stale_backup_changed_payment_revision_blocks_apply(self):
        # A previous finance-era row comparator excluded paymentRevision.
        # ERP must compare every existing column, including CAS revisions.
        with closing(sqlite3.connect(self.source)) as db:
            db.execute('UPDATE "Order" SET "paymentRevision"=1')
            db.commit()
        before=self.source.read_bytes()
        with self.assertRaisesRegex(RuntimeError,"content|rows|changed"):
            self.apply()
        self.assertEqual(self.source.read_bytes(),before)
        with closing(sqlite3.connect(self.source)) as db:
            self.assertFalse(verify(db))
    def test_blocks_tampered_backup(self):
        with closing(sqlite3.connect(self.backup)) as db:
            db.execute('UPDATE "Product" SET stock=1234')
            db.commit()
        with self.assertRaisesRegex(RuntimeError,"SHA-256"):
            self.apply()
    def test_refuses_missing_approval(self):
        old=self.source.read_bytes()
        with self.assertRaisesRegex(RuntimeError,"confirmation"):
            migrate(self.source,self.folder,confirmation="",backup_root=self.root)
        self.assertEqual(old,self.source.read_bytes())
    def test_refuses_partial_new_schema(self):
        with closing(sqlite3.connect(self.source)) as db:
            db.execute('CREATE TABLE "Supplier"("id" TEXT PRIMARY KEY)')
            db.commit()
        with self.assertRaisesRegex(RuntimeError,"Partial"):
            self.preflight()
    def test_rejects_unexpected_backup_folder(self):
        bad=self.base/"random-copy"
        bad.mkdir()
        with self.assertRaisesRegex(RuntimeError,"THANAYA"):
            preflight(self.source,bad,self.root)
    def test_stops_when_another_writer_holds_lock(self):
        with closing(sqlite3.connect(self.source,timeout=1,isolation_level=None)) as writer:
            writer.execute("BEGIN EXCLUSIVE")
            with self.assertRaises(sqlite3.OperationalError):
                self.apply()
            writer.execute("ROLLBACK")
        with closing(sqlite3.connect(self.source)) as db:
            self.assertFalse(verify(db))
    def test_refuses_symlink_database(self):
        link=self.base/"alias.db"
        link.symlink_to(self.source)
        with self.assertRaisesRegex(RuntimeError,"symlink"):
            preflight(link,self.folder,self.root)

if __name__=="__main__":unittest.main(verbosity=2)
