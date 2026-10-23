#!/usr/bin/env python3
"""Isolated safety checks for guarded finance schema activation.

All files are created under unittest TemporaryDirectory. NEVER reads dev.db.
"""
from __future__ import annotations

from contextlib import closing
import json
from pathlib import Path
import sqlite3
import sys
from tempfile import TemporaryDirectory
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from apply_finance_ledger import (
    CONFIRMATION, preflight, migrate, schema_snapshot,
)
from rehearse_finance_ledger import (
    data_fingerprint, verify_source, ORDER_ADD, CREATE_LEDGER, CREATE_INDEXES,
)
from safe_backup import digest, verified_counts

SCHEMA = """
PRAGMA foreign_keys=ON;
CREATE TABLE "Order" (
 "id" TEXT PRIMARY KEY NOT NULL,
 "total" INTEGER NOT NULL,
 "status" TEXT NOT NULL,
 "returnRevision" INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE "OrderReturnLine" (
 "id" TEXT PRIMARY KEY NOT NULL,
 "quantity" INTEGER NOT NULL,
 "disposition" TEXT NOT NULL DEFAULT 'restocked'
);
CREATE TABLE "Product" (
 "id" TEXT PRIMARY KEY NOT NULL,
 "stock" INTEGER NOT NULL
);
CREATE TABLE "InventoryMovement" (
 "id" TEXT PRIMARY KEY NOT NULL,
 "productId" TEXT NOT NULL,
 "delta" INTEGER NOT NULL,
 FOREIGN KEY("productId") REFERENCES "Product"("id")
);
INSERT INTO "Order" VALUES ('o1',85000,'delivered',0);
INSERT INTO "Order" VALUES ('o2',55000,'pending',1);
INSERT INTO "OrderReturnLine" VALUES ('rl1',1,'restocked');
INSERT INTO "Product" VALUES ('p1',31);
INSERT INTO "InventoryMovement" VALUES ('m1','p1',-2);
"""


class GuardedFinanceTests(unittest.TestCase):
    def setUp(self):
        temp = TemporaryDirectory(prefix="thanaya-guarded-finance-test-")
        self.addCleanup(temp.cleanup)
        self.work = Path(temp.name)
        self.root = self.work / "Thanaya-Backups"
        self.root.mkdir()
        self.folder = self.root / "THANAYA-20261023-183300"
        self.folder.mkdir()
        self.source = self.work / "dev.sqlite"
        self.backup = self.folder / "database.sqlite"
        with closing(sqlite3.connect(self.source)) as source:
            source.executescript(SCHEMA)
            source.commit()
            with closing(sqlite3.connect(self.backup)) as backup:
                source.backup(backup)
        self.manifest()

    def manifest(self):
        with closing(sqlite3.connect(self.backup)) as backup:
            counts = verified_counts(backup)
        (self.folder / "manifest.json").write_text(
            json.dumps({
                "project": "THANAYA",
                "sqlite_integrity": "ok",
                "uploads_verified_sha256": True,
                "database_sha256": digest(self.backup),
                "counts": counts,
            }), encoding="utf-8"
        )

    def preflight(self):
        return preflight(self.source, self.folder, self.root)

    def apply(self):
        return migrate(self.source, self.folder, confirmation=CONFIRMATION, backup_root=self.root)

    def test_preflight_is_readonly_byte_identical(self):
        data = self.source.read_bytes()
        result = self.preflight()
        self.assertEqual(result["Order"], 2)
        self.assertEqual(self.source.read_bytes(), data)
        with closing(sqlite3.connect(self.source)) as db:
            self.assertFalse(verify_source(db))

    def test_successfully_adds_only_finance_schema_and_preserves_legacy_records(self):
        with closing(sqlite3.connect(self.source)) as db:
            names = [
                row[0] for row in db.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
                )
            ]
            before = data_fingerprint(db, names)
            old_schema = schema_snapshot(db)
        counts = self.apply()
        self.assertEqual(counts["Order"], 2)
        with closing(sqlite3.connect(self.source)) as db:
            self.assertTrue(verify_source(db))
            self.assertEqual(data_fingerprint(db, names), before)
            self.assertEqual(db.execute(
                'SELECT id,total,status,returnRevision,paymentRevision FROM "Order" ORDER BY id'
            ).fetchall(), [
                ("o1", 85000, "delivered", 0, 0),
                ("o2", 55000, "pending", 1, 0)
            ])
            self.assertEqual(db.execute('SELECT COUNT(*) FROM "OrderPaymentEvent"').fetchone()[0], 0)
            self.assertEqual(db.execute('SELECT stock FROM "Product"').fetchone()[0], 31)
            self.assertEqual(db.execute('SELECT delta FROM "InventoryMovement"').fetchone()[0], -2)
            indexes = db.execute(
                "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='OrderPaymentEvent'"
            ).fetchall()
            self.assertEqual(len(indexes), 4)  # 3 named indexes plus SQLite PK index
            self.assertNotEqual(schema_snapshot(db), old_schema)
            self.assertFalse(db.execute("PRAGMA foreign_key_check").fetchall())
        with closing(sqlite3.connect(self.backup)) as old:
            self.assertFalse(verify_source(old))
        with self.assertRaisesRegex(RuntimeError, "already"):
            self.apply()

    def test_stale_backup_blocks_changed_order(self):
        with closing(sqlite3.connect(self.source)) as db:
            db.execute('UPDATE "Order" SET total=999999 WHERE id="o1"')
            db.commit()
        before = self.source.read_bytes()
        with self.assertRaisesRegex(RuntimeError, "differ|changed"):
            self.apply()
        self.assertEqual(self.source.read_bytes(), before)

    def test_new_order_after_backup_blocks_apply(self):
        with closing(sqlite3.connect(self.source)) as db:
            db.execute('INSERT INTO "Order" VALUES ("o3",25000,"pending",0)')
            db.commit()
        with self.assertRaisesRegex(RuntimeError, "counts|changed"):
            self.apply()

    def test_backup_tamper_blocks_apply(self):
        with closing(sqlite3.connect(self.backup)) as db:
            db.execute('UPDATE "Product" SET stock=3000 WHERE id="p1"')
            db.commit()
        before = self.source.read_bytes()
        with self.assertRaisesRegex(RuntimeError, "checksum"):
            self.apply()
        self.assertEqual(self.source.read_bytes(), before)

    def test_manifest_tamper_blocks_apply(self):
        path = self.folder / "manifest.json"
        manifest = json.loads(path.read_text(encoding="utf-8"))
        manifest["uploads_verified_sha256"] = False
        path.write_text(json.dumps(manifest), encoding="utf-8")
        with self.assertRaisesRegex(RuntimeError, "manifest"):
            self.apply()

    def test_refuses_missing_confirmation(self):
        data = self.source.read_bytes()
        with self.assertRaisesRegex(RuntimeError, "confirmation"):
            migrate(self.source, self.folder, confirmation="", backup_root=self.root)
        self.assertEqual(self.source.read_bytes(), data)

    def test_refuses_unexpected_backup_folder(self):
        unsafe = self.work / "other-backup"
        unsafe.mkdir()
        with self.assertRaisesRegex(RuntimeError, "THANAYA"):
            preflight(self.source, unsafe, self.root)

    def test_refuses_schema_divergence(self):
        with closing(sqlite3.connect(self.source)) as db:
            db.execute('CREATE TABLE "unknown" (id TEXT)')
            db.commit()
        with self.assertRaisesRegex(RuntimeError, "schema"):
            self.apply()

    def test_refuses_symlink_to_live_database(self):
        symlink = self.work / "fake.sqlite"
        symlink.symlink_to(self.source)
        with self.assertRaisesRegex(RuntimeError, "symlink"):
            preflight(symlink, self.folder, self.root)

    def test_refuses_partial_schema_without_modification(self):
        with closing(sqlite3.connect(self.source)) as db:
            db.execute(ORDER_ADD)
            db.commit()
        with self.assertRaisesRegex(RuntimeError, "Partial financial"):
            self.apply()

    def test_exclusive_lock_refuses_active_writer(self):
        with closing(sqlite3.connect(self.source, timeout=1, isolation_level=None)) as writer:
            writer.execute("BEGIN EXCLUSIVE")
            with self.assertRaises(sqlite3.OperationalError):
                self.apply()
            writer.execute("ROLLBACK")
        with closing(sqlite3.connect(self.source)) as db:
            self.assertFalse(verify_source(db))

    def test_fk_constraints_on_new_table(self):
        self.apply()
        with closing(sqlite3.connect(self.source)) as db:
            db.execute("PRAGMA foreign_keys=ON")
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute(
                    '''INSERT INTO "OrderPaymentEvent"
                       ("id","orderId","requestId","actorId","kind","method","amountIqd","note")
                       VALUES ('bad','missing','r1','staff','collection','cash',10,'sample note')'''
                )


if __name__ == "__main__":
    unittest.main(verbosity=2)
