#!/usr/bin/env python3
"""Isolated tests for guarded Thanaya return migration; no access to dev.db."""
from __future__ import annotations

from contextlib import closing
import hashlib
import json
from pathlib import Path
import sqlite3
import sys
from tempfile import TemporaryDirectory
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from apply_return_disposition import migrate,preflight,CONFIRMATION
from safe_backup import digest,verified_counts
from rehearse_return_disposition import fingerprint,validate_source

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


class GuardedMigrationTests(unittest.TestCase):
    def setUp(self):
        self.temporary=TemporaryDirectory(prefix="thanaya-guarded-migration-")
        self.addCleanup(self.temporary.cleanup)
        root=Path(self.temporary.name)
        self.root=root/"Thanaya-Backups"
        self.root.mkdir()
        self.folder=self.root/"THANAYA-20261022-235716"
        self.folder.mkdir()
        self.source=root/"live.sqlite"
        self.backup=self.folder/"database.sqlite"
        with closing(sqlite3.connect(self.source)) as db:
            db.executescript(LEGACY_SQL)
            db.commit()
        with closing(sqlite3.connect(self.backup)) as db:
            with closing(sqlite3.connect(self.source)) as source:
                source.backup(db)
        self.write_manifest()

    def write_manifest(self):
        with closing(sqlite3.connect(self.backup)) as db:
            counts=verified_counts(db)
        data={"project":"THANAYA","sqlite_integrity":"ok","uploads_verified_sha256":True,
              "database_sha256":digest(self.backup),"counts":counts}
        (self.folder/"manifest.json").write_text(json.dumps(data),encoding="utf-8")

    def check(self):
        return preflight(self.source,self.folder,self.root)

    def apply(self):
        return migrate(self.source,self.folder,confirmation=CONFIRMATION,backup_root=self.root)

    def test_preflight_leaves_source_exactly_unchanged(self):
        before=self.source.read_bytes()
        self.assertEqual(self.check()["Order"],1)
        self.assertEqual(self.source.read_bytes(),before)
        with closing(sqlite3.connect(self.source)) as db:
            self.assertFalse(validate_source(db))

    def test_migration_only_adds_column_and_preserves_legacy_rows(self):
        with closing(sqlite3.connect(self.source)) as db:
            old_rows=fingerprint(db)
        self.assertEqual(self.apply()["Order"],1)
        with closing(sqlite3.connect(self.source)) as db:
            self.assertTrue(validate_source(db))
            self.assertEqual(fingerprint(db,skip_disposition=True),old_rows)
            self.assertEqual(db.execute('SELECT disposition FROM "OrderReturnLine"').fetchone()[0],"restocked")
            self.assertEqual(db.execute('SELECT total FROM "Order"').fetchone()[0],60000)
            self.assertEqual(db.execute('SELECT stock FROM "Product"').fetchone()[0],7)
        with closing(sqlite3.connect(self.backup)) as db:
            self.assertFalse(validate_source(db))
        with self.assertRaisesRegex(RuntimeError,"already"):
            self.apply()

    def test_changed_live_data_blocks_apply(self):
        with closing(sqlite3.connect(self.source)) as db:
            db.execute('UPDATE "Order" SET total=999 WHERE id="o1"')
            db.commit()
        before=self.source.read_bytes()
        with self.assertRaisesRegex(RuntimeError,"match|changed"):
            self.apply()
        self.assertEqual(self.source.read_bytes(),before)

    def test_modified_backup_blocks_apply(self):
        with closing(sqlite3.connect(self.backup)) as db:
            db.execute('UPDATE "Product" SET stock=900 WHERE id="p1"')
            db.commit()
        before=self.source.read_bytes()
        with self.assertRaisesRegex(RuntimeError,"checksum"):
            self.apply()
        self.assertEqual(self.source.read_bytes(),before)

    def test_confirmation_is_mandatory(self):
        before=self.source.read_bytes()
        with self.assertRaisesRegex(RuntimeError,"confirmation"):
            migrate(self.source,self.folder,confirmation="no",backup_root=self.root)
        self.assertEqual(self.source.read_bytes(),before)

    def test_refuse_backup_outside_verified_folder(self):
        other=Path(self.temporary.name)/"random-backup"
        other.mkdir()
        with self.assertRaisesRegex(RuntimeError,"THANAYA"):
            preflight(self.source,other,self.root)

    def test_source_schema_mismatch_blocks_apply(self):
        with closing(sqlite3.connect(self.source)) as db:
            db.execute('CREATE TABLE "unexpected" (id INTEGER)')
            db.commit()
        with self.assertRaisesRegex(RuntimeError,"schema"):
            self.apply()

    def test_exclusive_lock_blocks_concurrent_writer(self):
        # A busy database must not be migrated while another writer holds a lock.
        with closing(sqlite3.connect(self.source,isolation_level=None,timeout=1)) as active:
            active.execute("BEGIN EXCLUSIVE")
            with self.assertRaises(sqlite3.OperationalError):
                self.apply()
            active.execute("ROLLBACK")
        with closing(sqlite3.connect(self.source)) as db:
            self.assertFalse(validate_source(db))


if __name__=="__main__":
    unittest.main(verbosity=2)
