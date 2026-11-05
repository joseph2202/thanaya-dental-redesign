from contextlib import closing
from pathlib import Path
import sqlite3
import sys
import unittest
from tempfile import TemporaryDirectory
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from rehearse_order_history import MIGRATION, rehearse, state

BASE = '''
PRAGMA foreign_keys=ON;
CREATE TABLE "User"("id" TEXT PRIMARY KEY,"name" TEXT,"role" TEXT);
CREATE TABLE "Order"("id" TEXT PRIMARY KEY,"status" TEXT);
CREATE TABLE "Product"("id" TEXT PRIMARY KEY,"stock" INTEGER);
INSERT INTO "User" VALUES('owner','Synthetic owner','owner');
INSERT INTO "Order" VALUES('legacy','delivered');
INSERT INTO "Product" VALUES('stock',42);
'''


class OrderHistoryRehearsal(unittest.TestCase):
    def setUp(self):
        tmp = TemporaryDirectory(prefix="thanaya-order-history-test-")
        self.addCleanup(tmp.cleanup)
        self.source = Path(tmp.name) / "source.sqlite"
        with closing(sqlite3.connect(self.source)) as db:
            db.executescript(BASE)
            db.commit()

    def test_rehearsal_never_changes_source_or_fabricates_past_events(self):
        before = self.source.read_bytes()
        result = rehearse(self.source)
        self.assertFalse(result["already_installed"])
        self.assertEqual(result["historical_events_backfilled"], 0)
        self.assertEqual(self.source.read_bytes(), before)
        with closing(sqlite3.connect(self.source)) as db:
            self.assertEqual(state(db), "pending")
            self.assertEqual(db.execute('SELECT stock FROM "Product"').fetchone()[0], 42)

    def install(self):
        with closing(sqlite3.connect(self.source)) as db:
            with db:
                for sql in MIGRATION:
                    db.execute(sql)

    def test_existing_events_are_preserved_on_repeat_rehearsal(self):
        self.install()
        with closing(sqlite3.connect(self.source)) as db:
            db.execute('''INSERT INTO "OrderStatusEvent"(id,orderId,actorId,actorName,actorRole,kind,toStatus)
              VALUES('event','legacy','owner','Original name','owner','status_changed','delivered')''')
            db.commit()
        before = self.source.read_bytes()
        self.assertTrue(rehearse(self.source)["already_installed"])
        self.assertEqual(self.source.read_bytes(), before)

    def test_partial_columns_are_refused(self):
        with closing(sqlite3.connect(self.source)) as db:
            db.execute('CREATE TABLE "OrderStatusEvent"(id TEXT PRIMARY KEY)')
        with self.assertRaisesRegex(RuntimeError, "Incomplete"):
            rehearse(self.source)

    def test_missing_index_is_refused(self):
        self.install()
        with closing(sqlite3.connect(self.source)) as db:
            db.execute('DROP INDEX "OrderStatusEvent_actorId_createdAt_idx"')
        with self.assertRaisesRegex(RuntimeError, "indexes"):
            rehearse(self.source)

    def test_missing_parent_schema_is_refused(self):
        with closing(sqlite3.connect(self.source)) as db:
            db.execute('DROP TABLE "Order"')
        with self.assertRaisesRegex(RuntimeError, "requires"):
            rehearse(self.source)

    def test_symlink_is_refused(self):
        link = self.source.with_name("linked.sqlite")
        link.symlink_to(self.source)
        with self.assertRaisesRegex(RuntimeError, "symlink"):
            rehearse(link)

    def test_invalid_existing_fk_is_refused(self):
        self.install()
        with closing(sqlite3.connect(self.source)) as db:
            db.execute('''INSERT INTO "OrderStatusEvent"(id,orderId,actorId,actorName,actorRole,kind,toStatus)
              VALUES('bad','missing','owner','Name','owner','status_changed','confirmed')''')
            db.commit()
        with self.assertRaisesRegex(RuntimeError, "foreign keys"):
            rehearse(self.source)


if __name__ == "__main__":
    unittest.main(verbosity=2)
