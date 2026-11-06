from contextlib import closing
from pathlib import Path
import sqlite3
import sys
import unittest
from tempfile import TemporaryDirectory
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from rehearse_session_revocation import MIGRATION, rehearse, state

BASE = '''
CREATE TABLE "User"("id" TEXT PRIMARY KEY,"email" TEXT,"password" TEXT,"role" TEXT);
CREATE TABLE "Order"("id" TEXT PRIMARY KEY,"total" INTEGER);
CREATE TABLE "Product"("id" TEXT PRIMARY KEY,"stock" INTEGER);
INSERT INTO "User" VALUES('buyer','synthetic@test.invalid','unchanged-hash','customer');
INSERT INTO "Order" VALUES('existing',40000);
INSERT INTO "Product" VALUES('stock',42);
'''


class SessionRehearsal(unittest.TestCase):
    def setUp(self):
        temp = TemporaryDirectory(prefix="thanaya-session-rehearsal-test-")
        self.addCleanup(temp.cleanup)
        self.source = Path(temp.name) / "source.sqlite"
        with closing(sqlite3.connect(self.source)) as db:
            db.executescript(BASE)

    def install(self):
        with closing(sqlite3.connect(self.source)) as db:
            with db:
                for sql in MIGRATION:
                    db.execute(sql)

    def test_clone_rehearsal_keeps_source_bytes_and_all_business_rows(self):
        before = self.source.read_bytes()
        result = rehearse(self.source)
        self.assertFalse(result["already_installed"])
        self.assertEqual(result["past_revocations_backfilled"], 0)
        self.assertEqual(self.source.read_bytes(), before)
        with closing(sqlite3.connect(self.source)) as db:
            self.assertEqual(state(db), "pending")
            self.assertEqual(db.execute('SELECT total FROM "Order"').fetchone()[0], 40000)
            self.assertEqual(db.execute('SELECT stock FROM "Product"').fetchone()[0], 42)

    def test_existing_revocations_survive_repeat_rehearsal(self):
        self.install()
        with closing(sqlite3.connect(self.source)) as db:
            db.execute('INSERT INTO "RevokedSession"(tokenHash,userId,expiresAt) VALUES(?,?,?)', ("a" * 64, "buyer", "2099-01-01"))
            db.commit()
        before = self.source.read_bytes()
        self.assertTrue(rehearse(self.source)["already_installed"])
        self.assertEqual(self.source.read_bytes(), before)

    def test_missing_user_schema_is_refused(self):
        with closing(sqlite3.connect(self.source)) as db:
            db.execute('DROP TABLE "User"')
        with self.assertRaisesRegex(RuntimeError, "requires"):
            rehearse(self.source)

    def test_incomplete_columns_or_defaults_are_refused(self):
        with closing(sqlite3.connect(self.source)) as db:
            db.execute('CREATE TABLE "RevokedSession"(tokenHash TEXT PRIMARY KEY)')
        with self.assertRaisesRegex(RuntimeError, "Incomplete"):
            rehearse(self.source)

    def test_missing_expiry_index_is_refused(self):
        self.install()
        with closing(sqlite3.connect(self.source)) as db:
            db.execute('DROP INDEX "RevokedSession_expiresAt_idx"')
        with self.assertRaisesRegex(RuntimeError, "expiry index"):
            rehearse(self.source)

    def test_unexpected_unique_constraint_is_refused(self):
        self.install()
        with closing(sqlite3.connect(self.source)) as db:
            db.execute('CREATE UNIQUE INDEX "bad_user" ON "RevokedSession"(userId)')
        with self.assertRaisesRegex(RuntimeError, "unique constraint"):
            rehearse(self.source)

    def test_symlink_and_nonexistent_source_are_refused(self):
        link = self.source.with_name("link.sqlite")
        link.symlink_to(self.source)
        with self.assertRaisesRegex(RuntimeError, "symlink"):
            rehearse(link)
        missing = self.source.with_name("missing.sqlite")
        with self.assertRaises(FileNotFoundError):
            rehearse(missing)
        self.assertFalse(missing.exists())

    def test_wal_database_rehearsal_keeps_database_and_journal_bytes(self):
        with closing(sqlite3.connect(self.source)) as writer:
            writer.execute("PRAGMA journal_mode=WAL")
            writer.execute('UPDATE "Product" SET stock=41')
            writer.commit()
            wal = Path(str(self.source) + "-wal")
            before, journal = self.source.read_bytes(), wal.read_bytes()
            self.assertTrue(rehearse(self.source)["source_unchanged"])
            self.assertEqual(self.source.read_bytes(), before)
            self.assertEqual(wal.read_bytes(), journal)


if __name__ == "__main__":
    unittest.main()
