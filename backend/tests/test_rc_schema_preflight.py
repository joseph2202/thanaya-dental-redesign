import json
from pathlib import Path
import sqlite3
import sys
from tempfile import TemporaryDirectory
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import rc_schema_preflight as rc


class ReleaseSchemaTests(unittest.TestCase):
    def setUp(self):
        self.tmp=TemporaryDirectory(prefix='thanaya-rc-schema-test-')
        self.root=Path(self.tmp.name)
        (self.root/'original').mkdir()
        self.source=self.root/'original/shop.sqlite'

    def tearDown(self):
        self.tmp.cleanup()

    def fixture(self, legacy=False):
        with rc.target_db() as target, sqlite3.connect(self.source) as db:
            expected=rc.layout(target)
            if legacy:
                # A real prior shape: all baseline core/store/returns/cost-reference
                # fields, before finance/ERP/history/revocations. Preserve old events.
                omitted={'RevokedSession','OrderStatusEvent','OrderPaymentEvent','Supplier',
                    'PurchaseOrder','PurchaseOrderLine','PurchaseOrderEvent','PurchaseReceipt',
                    'PurchaseReceiptLine','SupplierInvoice','SupplierPayment',
                    'OrderItemCostSnapshot','StoreExpense','CashAdjustment'}
                for name,table in expected.items():
                    if name in omitted:continue
                    sql=table['sql']
                    if name=='Order':
                        sql=sql.replace('    "paymentRevision" INTEGER NOT NULL DEFAULT 0,\n','')
                    if name=='OrderReturnLine':
                        sql=sql.replace('    "disposition" TEXT NOT NULL DEFAULT \'restocked\',\n','')
                    db.execute(sql)
                    for index in table['indexes'].values(): db.execute(index['sql'])
            else:
                db.executescript(rc.TARGET.read_text())
            db.execute('''INSERT INTO User(id,name,email,phone,password,role) VALUES
                ('owner','SYNTHETIC NAME CANARY','synthetic@test.invalid','07812345678','PRIVATE_HASH_CANARY','owner')''')
            db.execute('''INSERT INTO Product(id,name,description,price,usdPrice,category,brand,icon,stock)
                VALUES ('product','SYNTHETIC PRODUCT','private synthetic',5000,0,'test','test','Package',7)''')
            db.execute('''INSERT INTO "Order"(id,userId,customerName,customerPhone,customerAddress,customerCity,total,status)
                VALUES ('order','owner','CUSTOMER_PII_CANARY','07812345678','ADDRESS_CANARY','test',10000,'delivered')''')
            db.execute('''INSERT INTO OrderItem(id,orderId,productId,quantity,price)
                VALUES ('item','order','product',2,5000)''')
            db.execute('''INSERT INTO OrderReturn(id,orderId,requestId,actorId,reason)
                VALUES ('return','order','return-key','owner','PRIVATE_RETURN_REASON')''')
            db.execute('''INSERT INTO OrderReturnLine(id,orderReturnId,orderItemId,quantity)
                VALUES ('line','return','item',1)''')

    def test_integrated_legacy_backup_restore_and_full_target(self):
        self.fixture(legacy=True)
        upload=self.root/'photos';upload.mkdir();(upload/'item.png').write_bytes(b'synthetic-image-bytes')
        before=rc.source_bytes(self.source)
        report=rc.run(self.source,self.root/'verified',upload)
        self.assertTrue(report['backup_verified'] and report['restore_verified'])
        self.assertTrue(report['legacy_values_preserved'] and report['final_schema_exact'])
        self.assertFalse(report['live_activation_authorized'])
        self.assertEqual(report['uploads_restored'],1)
        self.assertIn('RevokedSession',report['schema_delta']['added_tables'])
        self.assertIn('OrderStatusEvent',report['schema_delta']['added_tables'])
        self.assertEqual(report['schema_delta']['added_columns']['Order'],['paymentRevision'])
        self.assertEqual(report['schema_delta']['added_columns']['OrderReturnLine'],['disposition'])
        self.assertEqual(rc.source_bytes(self.source),before)
        with sqlite3.connect(self.root/'verified/restored.sqlite') as copy:
            for name in report['schema_delta']['added_tables']:
                self.assertEqual(copy.execute('SELECT count(*) FROM '+rc.q(name)).fetchone()[0],0)
            self.assertIsNone(copy.execute('SELECT productName FROM OrderItem').fetchone()[0])
            self.assertEqual(copy.execute('SELECT disposition FROM OrderReturnLine').fetchone()[0],'restocked')
        self.assertEqual((self.root/'verified/restored-uploads/item.png').read_bytes(),b'synthetic-image-bytes')
        encoded=json.dumps(report)
        for canary in ['CUSTOMER_PII_CANARY','PRIVATE_HASH_CANARY','ADDRESS_CANARY','PRIVATE_RETURN_REASON']:
            self.assertNotIn(canary,encoded)

    def test_already_current_preserves_real_existing_evidence(self):
        self.fixture()
        with sqlite3.connect(self.source) as db:
            db.execute("INSERT INTO RevokedSession VALUES ('digest','owner','2030-01-01','2026-01-01')")
            db.execute("INSERT INTO OrderItemCostSnapshot VALUES ('cost','item',NULL,2,2000,'product_reference','2026-01-01')")
        report=rc.run(self.source,self.root/'verified')
        self.assertEqual(report['schema_delta'],{'added_tables':[],'added_columns':{},'added_indexes':[]})
        self.assertEqual(report['table_counts']['RevokedSession'],1)
        self.assertEqual(report['table_counts']['OrderItemCostSnapshot'],1)

    def test_wal_backup_contains_committed_wal_rows_and_leaves_bytes(self):
        self.fixture(legacy=True)
        db=sqlite3.connect(self.source)
        try:
            db.execute('PRAGMA journal_mode=WAL');db.execute('PRAGMA wal_autocheckpoint=0')
            db.execute("UPDATE Product SET stock=11");db.commit()
            before=rc.source_bytes(self.source)
            self.assertIsNotNone(before['-wal'])
            report=rc.run(self.source,self.root/'verified')
            self.assertTrue(report['source_unchanged'])
            self.assertEqual(rc.source_bytes(self.source),before)
            with sqlite3.connect(self.root/'verified/restored.sqlite') as restored:
                self.assertEqual(restored.execute('SELECT stock FROM Product').fetchone()[0],11)
        finally:db.close()

    def test_missing_index_is_rehearsed_without_table_rebuild(self):
        self.fixture()
        with sqlite3.connect(self.source) as db:db.execute('DROP INDEX RevokedSession_expiresAt_idx')
        report=rc.run(self.source,self.root/'verified')
        self.assertEqual(report['schema_delta']['added_indexes'],['RevokedSession_expiresAt_idx'])

    def test_preflight_creates_no_backup_and_lists_all_tables(self):
        self.fixture(legacy=True)
        before=set(self.root.rglob('*'));bytes_before=rc.source_bytes(self.source)
        report=rc.run(self.source)
        self.assertEqual(set(self.root.rglob('*')),before)
        self.assertEqual(rc.source_bytes(self.source),bytes_before)
        self.assertEqual(report['mode'],'preflight_only')
        self.assertEqual(report['table_counts']['OrderReturn'],1)

    def test_rejects_symlinks_output_reuse_and_source_folder(self):
        self.fixture()
        link=self.root/'link.sqlite';link.symlink_to(self.source)
        with self.assertRaises(rc.Blocked):rc.run(link)
        with self.assertRaises(rc.Blocked):rc.run(self.source,self.root/'original/output')
        (self.root/'already').mkdir()
        with self.assertRaises(rc.Blocked):rc.run(self.source,self.root/'already')
        uploads=self.root/'photos';uploads.mkdir();(uploads/'leak').symlink_to(self.source)
        with self.assertRaises(rc.Blocked):rc.run(self.source,self.root/'safe-output',uploads)
        (uploads/'leak').unlink()
        with self.assertRaises(rc.Blocked):rc.run(self.source,uploads/'backup',uploads)
        self.assertEqual(list(uploads.iterdir()),[],'refused overlap must not create anything in source images')

    def test_rejects_unknown_tables_custom_triggers_and_wrong_definition(self):
        self.fixture()
        for statement,undo in [
            ('CREATE TABLE UnknownData(id TEXT)','DROP TABLE UnknownData'),
            ('CREATE TRIGGER custom AFTER UPDATE ON Product BEGIN SELECT 1; END','DROP TRIGGER custom'),
            ('CREATE UNIQUE INDEX unreviewed ON Product(name)','DROP INDEX unreviewed')]:
            with sqlite3.connect(self.source) as db:db.execute(statement)
            with self.assertRaises(rc.Blocked):rc.run(self.source)
            with sqlite3.connect(self.source) as db:db.execute(undo)
        with sqlite3.connect(self.source) as db:
            db.execute('DROP TABLE RevokedSession');db.execute('CREATE TABLE RevokedSession(tokenHash TEXT PRIMARY KEY)')
        with self.assertRaises(rc.Blocked):rc.run(self.source)

    def test_rejects_bad_money_stock_overreturn_and_foreign_keys(self):
        self.fixture()
        for statement,undo in [
            ('UPDATE Product SET stock=-1','UPDATE Product SET stock=7'),
            ('UPDATE "Order" SET total=1.5','UPDATE "Order" SET total=10000'),
            ('UPDATE Product SET price=3000000000','UPDATE Product SET price=5000'),
            ('UPDATE Product SET published=2','UPDATE Product SET published=1'),
            ('UPDATE OrderReturnLine SET quantity=3','UPDATE OrderReturnLine SET quantity=1'),
            ("UPDATE OrderItem SET productId='missing'","UPDATE OrderItem SET productId='product'")]:
            with sqlite3.connect(self.source) as db:db.execute(statement)
            with self.assertRaises((rc.Blocked,RuntimeError)):rc.run(self.source)
            with sqlite3.connect(self.source) as db:db.execute(undo)

    def test_saved_backup_verifier_rejects_tampering_and_restore_damage(self):
        self.fixture(legacy=True)
        output=self.root/'verified';rc.run(self.source,output)
        self.assertTrue(rc.verify_backup(output)['backup_verified'])
        with sqlite3.connect(output/'restored.sqlite') as db:db.execute('UPDATE Product SET price=1')
        with self.assertRaises(rc.Blocked):rc.verify_backup(output)
        with sqlite3.connect(output/'restored.sqlite') as db:db.execute('UPDATE Product SET price=5000')
        with sqlite3.connect(output/'database.sqlite') as db:db.execute('UPDATE Product SET price=1')
        with self.assertRaises(rc.Blocked):rc.verify_backup(output)

    def test_restore_verifier_rejects_damaged_images(self):
        self.fixture()
        images=self.root/'photos';images.mkdir();(images/'product.png').write_bytes(b'original-synthetic')
        output=self.root/'verified';rc.run(self.source,output,images)
        (output/'restored-uploads/product.png').write_bytes(b'bad-image')
        with self.assertRaises(rc.Blocked):rc.verify_backup(output)

    def test_late_unique_failure_rolls_back_entire_clone_ddl(self):
        self.fixture(legacy=True)
        with sqlite3.connect(self.source) as db:
            db.execute('DROP INDEX Product_sku_key')
            db.execute("UPDATE Product SET sku='DUPLICATE'")
            db.execute('''INSERT INTO Product(id,name,description,price,usdPrice,category,brand,icon,stock,sku)
                VALUES ('second','synthetic second','test',5000,0,'test','test','Package',1,'DUPLICATE')''')
        before=rc.source_bytes(self.source)
        output=self.root/'failed-rehearsal'
        with self.assertRaises(sqlite3.IntegrityError):rc.run(self.source,output)
        self.assertEqual(rc.source_bytes(self.source),before)
        self.assertFalse((output/'report.json').exists())
        with sqlite3.connect(output/'restored.sqlite') as db:
            names=rc.layout(db)
            self.assertNotIn('RevokedSession',names,'late failed index must roll back earlier CREATE TABLE')
            self.assertNotIn('paymentRevision',names['Order']['fields'],'earlier ALTER TABLE must also roll back')
            self.assertEqual(db.execute('SELECT count(*) FROM Product').fetchone()[0],2)
        with self.assertRaises(rc.Blocked):rc.verify_backup(output)


if __name__=='__main__':unittest.main()
