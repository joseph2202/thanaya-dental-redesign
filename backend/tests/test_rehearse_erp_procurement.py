"""Safety tests: ERP first-phase schema is rehearsed only on throwaway files."""
from contextlib import closing
from pathlib import Path
import sqlite3
import sys
from tempfile import TemporaryDirectory
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from rehearse_erp_procurement import rehearse,MIGRATION,verify

LEGACY = """
PRAGMA foreign_keys=ON;
CREATE TABLE "User" ("id" TEXT PRIMARY KEY, "name" TEXT);
CREATE TABLE "Product" ("id" TEXT PRIMARY KEY, "stock" INTEGER);
CREATE TABLE "Order" ("id" TEXT PRIMARY KEY);
CREATE TABLE "OrderReturnLine" ("id" TEXT PRIMARY KEY, "disposition" TEXT);
CREATE TABLE "OrderPaymentEvent" ("id" TEXT PRIMARY KEY);
INSERT INTO "User" VALUES ('user-1','Owner');
INSERT INTO "Product" VALUES ('prod-1',125);
INSERT INTO "Order" VALUES ('order-1');
"""

class ProcurementRehearsalSafety(unittest.TestCase):
    def setUp(self):
        private=TemporaryDirectory(prefix="thanaya-erp-migration-test-")
        self.addCleanup(private.cleanup)
        self.file=Path(private.name)/"source.sqlite"
        with closing(sqlite3.connect(self.file)) as db:
            db.executescript(LEGACY)
            db.commit()
    def test_readonly_never_changes_source_bytes(self):
        before=self.file.read_bytes()
        outcome=rehearse(self.file)
        self.assertFalse(outcome["already_applied"])
        self.assertEqual(outcome["tables_preserved"],5)
        self.assertEqual(self.file.read_bytes(),before)
        with closing(sqlite3.connect(self.file)) as db:
            self.assertFalse(verify(db))
            self.assertEqual(db.execute('SELECT stock FROM "Product"').fetchone()[0],125)
    def test_existing_erp_database_is_idempotent(self):
        with closing(sqlite3.connect(self.file)) as db:
            with db:
                for sql in MIGRATION:db.execute(sql)
            self.assertTrue(verify(db))
        before=self.file.read_bytes()
        self.assertTrue(rehearse(self.file)["already_applied"])
        self.assertEqual(self.file.read_bytes(),before)
    def test_partial_procurement_migration_is_rejected(self):
        with closing(sqlite3.connect(self.file)) as db:
            db.execute(MIGRATION[0]);db.commit()
        with self.assertRaisesRegex(RuntimeError,"Partial"):
            rehearse(self.file)
    def test_requires_financial_migration(self):
        with closing(sqlite3.connect(self.file)) as db:
            db.execute('DROP TABLE "OrderPaymentEvent"');db.commit()
        with self.assertRaisesRegex(RuntimeError,"finance"):
            rehearse(self.file)
    def test_broken_fk_blocks_erp_rehearsal(self):
        with closing(sqlite3.connect(self.file)) as db:
            db.execute('PRAGMA foreign_keys=OFF')
            db.execute('CREATE TABLE child (parent TEXT REFERENCES "Product"("id"))')
            db.execute('INSERT INTO child VALUES ("missing")')
            db.commit()
        with self.assertRaisesRegex(RuntimeError,"Foreign keys"):
            rehearse(self.file)
    def test_source_symlink_is_rejected(self):
        link=self.file.parent/"alias.sqlite"
        link.symlink_to(self.file)
        with self.assertRaisesRegex(RuntimeError,"symlink"):
            rehearse(link)

if __name__=="__main__":unittest.main(verbosity=2)
