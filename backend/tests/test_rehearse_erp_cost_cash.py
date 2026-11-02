"""ERP05/06 schema rehearsal verifies no changes to source SQLite."""
from contextlib import closing
from pathlib import Path
import sqlite3,sys,unittest
from tempfile import TemporaryDirectory
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from rehearse_erp_cost_cash import MIGRATION,rehearse,state

BASE="""
PRAGMA foreign_keys=ON;
CREATE TABLE "User"("id" TEXT PRIMARY KEY);
CREATE TABLE "OrderItem"("id" TEXT PRIMARY KEY);
CREATE TABLE "SupplierInvoice"("id" TEXT PRIMARY KEY);
CREATE TABLE "SupplierPayment"("id" TEXT PRIMARY KEY);
CREATE TABLE "Product"("id" TEXT PRIMARY KEY,stock INTEGER NOT NULL);
INSERT INTO "User" VALUES ("owner");
INSERT INTO "OrderItem" VALUES ("item-1");
INSERT INTO "Product" VALUES ("product-1",42);
"""
class SafeCostCashRehearsal(unittest.TestCase):
 def setUp(self):
  tmp=TemporaryDirectory(prefix="thanaya-cost-cash-test-")
  self.addCleanup(tmp.cleanup)
  self.root=Path(tmp.name)
  self.db=self.root/"fixture.sqlite"
  with closing(sqlite3.connect(self.db)) as sql:
   sql.executescript(BASE)
   sql.commit()
 def test_clone_only_preserves_every_source_byte(self):
  before=self.db.read_bytes()
  self.assertFalse(rehearse(self.db)["already_installed"])
  self.assertEqual(before,self.db.read_bytes())
  with closing(sqlite3.connect(self.db)) as sql:
   self.assertEqual(state(sql),"pending")
   self.assertEqual(sql.execute('SELECT stock FROM "Product"').fetchone()[0],42)
 def test_rehearsal_works_on_fully_installed_schema(self):
  with closing(sqlite3.connect(self.db)) as sql:
   with sql:
    for statement in MIGRATION:sql.execute(statement)
   self.assertEqual(state(sql),"installed")
  before=self.db.read_bytes()
  self.assertTrue(rehearse(self.db)["already_installed"])
  self.assertEqual(before,self.db.read_bytes())
 def test_partial_install_denied(self):
  with closing(sqlite3.connect(self.db)) as sql:
   sql.execute(MIGRATION[0]);sql.commit()
  with self.assertRaisesRegex(RuntimeError,"Partial"):
   rehearse(self.db)
 def test_missing_erp04_denied(self):
  with closing(sqlite3.connect(self.db)) as sql:
   sql.execute('DROP TABLE "SupplierPayment"');sql.commit()
  with self.assertRaisesRegex(RuntimeError,"requires"):
   rehearse(self.db)
 def test_symlink_denied(self):
  link=self.root/"linked.sqlite"
  link.symlink_to(self.db)
  with self.assertRaisesRegex(RuntimeError,"symlink"):
   rehearse(link)
if __name__=="__main__":unittest.main(verbosity=2)
