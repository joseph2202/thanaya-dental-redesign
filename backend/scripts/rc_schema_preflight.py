#!/usr/bin/env python3
"""RC schema inventory + verified backup/restore/rehearsal. NO live apply mode.

Only --source is opened read-only. All DDL runs on a restored disposable copy
under a brand-new private output directory outside the repository/source folder.
Reports contain schema names/counts, never credentials or business row values.
"""
from __future__ import annotations
import argparse
from contextlib import closing
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import sys
from safe_backup import read_only_connection, integrity, digest
from verify_schema_activation import rows_digest

ROOT = Path(__file__).resolve().parents[2]
SCHEMA = ROOT / 'backend/prisma/schema.prisma'
TARGET = ROOT / 'backend/prisma/rc1-target.sql'
# Prisma Int is signed 32-bit even though SQLite accepts larger integers.
# Verified against the locked client: reading 3,000,000,000 raises P2023.
MAX_IQD = 2147483647


class Blocked(RuntimeError):
    pass


def q(name):
    return '"' + name.replace('"', '""') + '"'


def checked_path(path, directory=False):
    path = Path(os.path.abspath(path.expanduser()))
    if any(parent.is_symlink() for parent in (path, *path.parents)):
        raise Blocked('Symlink paths are refused')
    path = path.resolve(strict=True)
    if not (path.is_dir() if directory else path.is_file()):
        raise Blocked('Expected an existing regular source')
    return path


def validate(db):
    integrity(db)
    if db.execute('PRAGMA foreign_key_check').fetchone():
        raise Blocked('Broken foreign keys; no repair is inferred')


def layout(db):
    tables = {}
    for name, sql in db.execute("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"):
        fields = {row[1]: {'type': row[2].upper(), 'required': row[3], 'default': row[4], 'pk': row[5]}
                  for row in db.execute('PRAGMA table_info('+q(name)+')')}
        foreign = sorted(tuple(row[2:]) for row in db.execute('PRAGMA foreign_key_list('+q(name)+')'))
        indexes = {}
        for row in db.execute('PRAGMA index_list('+q(name)+')'):
            if row[3] == 'pk':
                continue
            index_sql = db.execute('SELECT sql FROM sqlite_master WHERE name=?', (row[1],)).fetchone()[0]
            indexes[row[1]] = {'unique': row[2], 'partial': row[4],
                'columns': [item[2] for item in db.execute('PRAGMA index_info('+q(row[1])+')')],
                'terms': [list(item[1:]) for item in db.execute('PRAGMA index_xinfo('+q(row[1])+')')], 'sql': index_sql}
        tables[name] = {'fields': fields, 'foreign_keys': foreign, 'indexes': indexes, 'sql': sql}
    return tables


def target_db():
    sql = TARGET.read_text()
    if '-- schema-sha256: '+digest(SCHEMA) not in sql.splitlines():
        raise Blocked('Reference SQL does not match current Prisma schema; regenerate with locked Prisma')
    db = sqlite3.connect(':memory:')
    db.executescript(sql)
    return db


def fingerprints(db, tables):
    return {name: {'count': db.execute('SELECT count(*) FROM '+q(name)).fetchone()[0],
                   'sha256': rows_digest(db, name, list(table['fields']))}
            for name, table in tables.items()}


def plan(db, expected):
    actual = layout(db)
    missing_core = {'User', 'Product', 'Order', 'OrderItem'} - actual.keys()
    if missing_core:
        raise Blocked('Missing core tables: '+', '.join(sorted(missing_core)))
    if db.execute("SELECT 1 FROM sqlite_master WHERE type IN ('view','trigger')").fetchone():
        raise Blocked('Views/triggers require separate review')
    unknown = actual.keys() - expected.keys() - {'_prisma_migrations'}
    if unknown:
        raise Blocked('Unknown tables require review: '+', '.join(sorted(unknown)))
    statements, added_tables, added_columns, added_indexes = [], [], {}, []
    for name, target in expected.items():
        if name not in actual:
            statements.append(target['sql'])
            added_tables.append(name)
            added_indexes.extend(target['indexes'])
            continue
        old = actual[name]
        if re.search(r'\b(CHECK|COLLATE|GENERATED|STRICT)\b|WITHOUT\s+ROWID', old['sql'], re.I):
            raise Blocked('Custom table constraints require review: '+name)
        unknown_fields = old['fields'].keys() - target['fields'].keys()
        if unknown_fields:
            raise Blocked('Unknown columns require review: '+name)
        if old['foreign_keys'] != target['foreign_keys']:
            raise Blocked('Foreign key change requires a reviewed migration: '+name)
        for column, field in target['fields'].items():
            if column in old['fields']:
                if old['fields'][column] != field:
                    raise Blocked('Incompatible type/default/nullability/primary key: '+name+'.'+column)
                continue
            # Never rebuild/drop a historic table, guess a required value or
            # assign creation timestamps to historical rows.
            if field['pk'] or (field['required'] and field['default'] is None) or (
                    field['default'] and 'CURRENT_' in field['default'].upper()):
                raise Blocked('Column needs explicit historic-data policy: '+name+'.'+column)
            definition = q(column)+' '+field['type']+(' NOT NULL' if field['required'] else '')
            if field['default'] is not None:
                definition += ' DEFAULT '+field['default']
            statements.append('ALTER TABLE '+q(name)+' ADD COLUMN '+definition)
            added_columns.setdefault(name, []).append(column)
        for index, info in old['indexes'].items():
            expected_index = target['indexes'].get(index)
            if expected_index is None or {k:v for k,v in info.items() if k!='sql'} != {k:v for k,v in expected_index.items() if k!='sql'}:
                raise Blocked('Unexpected/incompatible index: '+index)
        added_indexes.extend(target['indexes'].keys()-old['indexes'].keys())
    # Create tables first (SQLite permits forward FK declarations), then indexes.
    for name, table in expected.items():
        for index, value in table['indexes'].items():
            if index in added_indexes:
                statements.append(value['sql'])
    return {'added_tables': sorted(added_tables), 'added_columns': added_columns,
            'added_indexes': sorted(added_indexes), 'statements': statements}


def data_preflight(db):
    tables = layout(db)
    def exists(table, *columns):
        return table in tables and set(columns).issubset(tables[table]['fields'])
    def reject(table, condition):
        if db.execute('SELECT 1 FROM '+q(table)+' WHERE '+condition+' LIMIT 1').fetchone():
            raise Blocked('Data invariant failed in '+table+'; values are deliberately not printed')
    for table,info in tables.items():
        for column,field in info['fields'].items():
            if field['type']=='INTEGER':
                reject(table,q(column)+' IS NOT NULL AND (typeof('+q(column)+") != 'integer' OR "+q(column)+' < -2147483648 OR '+q(column)+' > '+str(MAX_IQD)+')')
            elif field['type']=='BOOLEAN':
                reject(table,q(column)+' IS NOT NULL AND (typeof('+q(column)+") != 'integer' OR "+q(column)+' NOT IN (0,1))')
    for table, columns in {'Product': ['price','usdPrice','stock','purchaseCostIqd','costRevision'],
                           'ProductLot': ['stock','purchaseCostIqd','costRevision'],
                           'Order': ['total','subtotal','shippingFee','discountAmount','returnRevision','paymentRevision'],
                           'OrderItem': ['price'], 'OrderItemCostSnapshot': ['unitCostIqd']}.items():
        for column in columns:
            if exists(table, column):
                reject(table, q(column)+' IS NOT NULL AND (typeof('+q(column)+") != 'integer' OR "+q(column)+' < 0 OR '+q(column)+' > '+str(MAX_IQD)+')')
    for table in ['OrderItem','OrderItemLot','OrderReturnLine','PurchaseOrderLine','PurchaseReceiptLine','OrderItemCostSnapshot']:
        if exists(table, 'quantity'):
            reject(table, 'typeof(quantity) != \'integer\' OR quantity < 1 OR quantity > '+str(MAX_IQD))
    for table in ['OrderPaymentEvent','SupplierInvoice','SupplierPayment','StoreExpense','CashAdjustment']:
        if exists(table, 'amountIqd'):
            reject(table, 'typeof(amountIqd) != \'integer\' OR amountIqd < 1 OR amountIqd > '+str(MAX_IQD))
    if exists('User', 'role'):
        reject('User', "role NOT IN ('owner','admin','inventory','sales','customer')")
    if exists('Order', 'status'):
        reject('Order', "status NOT IN ('pending','confirmed','shipped','delivered','cancelled','returned')")
    if exists('OrderReturnLine', 'disposition'):
        reject('OrderReturnLine', "disposition NOT IN ('restocked','quarantined')")
    if exists('InventoryMovement', 'before','delta','after'):
        reject('InventoryMovement', '"before"+delta != "after" OR "before" < 0 OR "after" < 0')
    if exists('OrderReturnLine','orderItemId'):
        bad = db.execute('''SELECT 1 FROM OrderReturnLine GROUP BY orderItemId HAVING sum(quantity) >
          (SELECT quantity FROM OrderItem WHERE id=orderItemId) LIMIT 1''').fetchone()
        if bad:
            raise Blocked('Returned quantity exceeds original sale')
    if exists('OrderPaymentEvent','kind','orderId','amountIqd'):
        reject('OrderPaymentEvent', "kind NOT IN ('collection','refund')")
        if db.execute('''SELECT 1 FROM OrderPaymentEvent e JOIN "Order" o ON o.id=e.orderId GROUP BY e.orderId
          HAVING sum(CASE WHEN kind='collection' THEN amountIqd ELSE 0 END)>o.total
          OR sum(CASE WHEN kind='refund' THEN amountIqd ELSE 0 END)>
             sum(CASE WHEN kind='collection' THEN amountIqd ELSE 0 END) LIMIT 1''').fetchone():
            raise Blocked('Financial ledger exceeds order collection/refund bounds')
    owner_count = db.execute("SELECT count(*) FROM User WHERE role='owner'").fetchone()[0] if exists('User','role') else None
    return {'owner_count': owner_count, 'owner_review_required': owner_count != 1,
            'external_cash_bank_reconciliation': 'not_performed', 'historic_backfill': 'none'}


def source_bytes(source):
    return {suffix: digest(Path(str(source)+suffix)) if Path(str(source)+suffix).exists() else None
            for suffix in ['', '-wal']}


def upload_inventory(folder):
    if folder is None:
        return []
    folder = checked_path(folder, directory=True)
    result = []
    for path in sorted(folder.rglob('*')):
        if path.is_symlink() or not (path.is_dir() or path.is_file()):
            raise Blocked('Uploads contain a symlink or special file')
        if path.is_file():
            result.append((path.relative_to(folder), digest(path), path.stat().st_size))
    return result


def verify_backup(folder):
    folder=checked_path(folder,directory=True)
    manifest_path=checked_path(folder/'manifest.json')
    manifest=json.loads(manifest_path.read_text())
    if manifest.get('project')!='THANAYA' or manifest.get('schema_sha256')!=digest(SCHEMA):
        raise Blocked('Backup manifest is not for the current RC schema')
    backup=checked_path(folder/'database.sqlite')
    restored=checked_path(folder/'restored.sqlite')
    if digest(backup)!=manifest.get('database_sha256'):
        raise Blocked('Backup checksum mismatch')
    if digest(restored)!=manifest.get('rehearsed_database_sha256'):
        raise Blocked('Restored rehearsal checksum mismatch')
    with closing(read_only_connection(backup)) as saved, closing(read_only_connection(restored)) as clone, closing(target_db()) as reference:
        validate(saved);validate(clone)
        original_layout=layout(saved)
        if fingerprints(saved,original_layout)!=manifest.get('fingerprints'):
            raise Blocked('Backup manifest/data fingerprints differ')
        if fingerprints(clone,original_layout)!=manifest['fingerprints']:
            raise Blocked('Restored historic values differ from backup')
        if plan(clone,layout(reference))['statements']:
            raise Blocked('Restored rehearsal does not have the full RC schema')
        data_preflight(clone)
    for relative,info in manifest.get('uploads',{}).items():
        name=Path(relative)
        if name.is_absolute() or '..' in name.parts:
            raise Blocked('Unsafe relative image path in manifest')
        for area in ['uploads','restored-uploads']:
            file=checked_path(folder/area/name)
            if digest(file)!=info['sha256'] or file.stat().st_size!=info['bytes']:
                raise Blocked('Backed-up/restored image checksum mismatch')
    return {'backup_verified':True,'restore_verified':True,'current_schema':True,
            'uploads_verified':len(manifest.get('uploads',{}))}


def run(source, output=None, uploads=None):
    source = checked_path(source)
    if output is None and uploads is not None:
        raise Blocked('--uploads is only used with a private rehearsal output')
    if uploads is not None:
        uploads=checked_path(uploads,directory=True)
    before_bytes = source_bytes(source)
    with closing(target_db()) as reference, closing(read_only_connection(source)) as original:
        validate(original)
        # Hold one stable snapshot while computing fingerprints and backing up.
        original.execute('BEGIN')
        expected = layout(reference)
        current = layout(original)
        changes = plan(original, expected)
        data = data_preflight(original)
        before = fingerprints(original, current)
        report = {'mode': 'preflight_only', 'schema_sha256': digest(SCHEMA),
          'reference_sql_sha256': digest(TARGET), 'source_unchanged': False,
          'table_counts': {name: item['count'] for name,item in before.items()},
          'schema_delta': {k:v for k,v in changes.items() if k != 'statements'},
          'data_checks': data, 'live_activation_authorized': False}
        if output is not None:
            output = Path(os.path.abspath(output.expanduser()))
            if any(p.is_symlink() for p in (output,*output.parents)) or output.exists():
                raise Blocked('Rehearsal output must be a brand-new directory without symlinks')
            if output.is_relative_to(ROOT) or output.is_relative_to(source.parent):
                raise Blocked('Backup/restore output must be outside the repository and source folder')
            if uploads is not None and (output.is_relative_to(uploads) or uploads.is_relative_to(output)):
                raise Blocked('Backup/restore output must not overlap the source images')
            output.parent.resolve(strict=True)
            inventory = upload_inventory(uploads)
            needed = source.stat().st_size*4 + sum(row[2] for row in inventory)*3 + 100*1024*1024
            if shutil.disk_usage(output.parent).free < needed:
                raise Blocked('Not enough free space for backup, restore and rehearsal')
            output.mkdir(mode=0o700)
            backup = output/'database.sqlite'
            with closing(sqlite3.connect(backup)) as dest:
                original.backup(dest)
            with closing(read_only_connection(backup)) as saved:
                validate(saved)
                if fingerprints(saved,current) != before or layout(saved) != current:
                    raise Blocked('Backup data/schema mismatch')
            backup_digest = digest(backup)
            manifest = {'project':'THANAYA','database_sha256':backup_digest,
                        'schema_sha256':digest(SCHEMA), 'fingerprints':before,
                        'uploads':{str(path):{'sha256':sha,'bytes':size} for path,sha,size in inventory}}
            for relative, sha, _ in inventory:
                dest = output/'uploads'/relative
                dest.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
                shutil.copyfile(uploads/relative,dest)
                if digest(dest) != sha:
                    raise Blocked('Upload backup mismatch')
            (output/'manifest.json').write_text(json.dumps(manifest,indent=2))
            restored = output/'restored.sqlite'
            shutil.copyfile(backup,restored)
            if digest(restored) != backup_digest:
                raise Blocked('Restore checksum mismatch')
            for relative, sha, _ in inventory:
                dest = output/'restored-uploads'/relative
                dest.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
                shutil.copyfile(output/'uploads'/relative,dest)
                if digest(dest) != sha:
                    raise Blocked('Upload restore mismatch')
            with closing(sqlite3.connect(restored)) as clone:
                validate(clone)
                if fingerprints(clone,current) != before:
                    raise Blocked('Restored original rows differ')
                clone.execute('PRAGMA foreign_keys=ON')
                # sqlite3's context manager does not begin a transaction for
                # DDL by itself. A late UNIQUE failure must roll back all DDL.
                clone.execute('BEGIN IMMEDIATE')
                with clone:
                    for statement in changes['statements']:
                        clone.execute(statement)
                validate(clone)
                if plan(clone,expected)['statements'] or fingerprints(clone,current) != before:
                    raise Blocked('Rehearsed schema/legacy row verification failed')
                for name in changes['added_tables']:
                    if clone.execute('SELECT count(*) FROM '+q(name)).fetchone()[0]:
                        raise Blocked('Historical evidence must not be backfilled')
                data_preflight(clone)
            if digest(backup) != backup_digest:
                raise Blocked('Verified backup was changed during restore/rehearsal')
            if upload_inventory(uploads) != inventory:
                raise Blocked('Source uploads changed during backup/restore')
            manifest['rehearsed_database_sha256']=digest(restored)
            (output/'manifest.json').write_text(json.dumps(manifest,indent=2))
            verify_backup(output)
            report.update(mode='backup_restore_clone_rehearsal',backup_verified=True,restore_verified=True,
                          uploads_restored=len(inventory),legacy_values_preserved=True,final_schema_exact=True)
        original.rollback()
        if fingerprints(original,current) != before or source_bytes(source) != before_bytes:
            raise Blocked('Source changed during preflight/rehearsal; stop services and repeat in a new folder')
        report['source_unchanged'] = True
    if output is not None:
        (output/'report.json').write_text(json.dumps(report,indent=2))
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    action=parser.add_mutually_exclusive_group(required=True)
    action.add_argument('--source',type=Path)
    action.add_argument('--verify-backup-dir',type=Path,help='Read-only verification of a completed RC backup/restore/rehearsal folder')
    parser.add_argument('--output-dir',type=Path,help='Create verified backup + restored migrated clone here; never applies to source')
    parser.add_argument('--uploads',type=Path,help='Optional explicit image folder for backup and restore; never modifies it')
    args=parser.parse_args()
    os.umask(0o077)
    try:
        if args.verify_backup_dir and (args.output_dir or args.uploads):
            raise Blocked('Backup verification accepts no output/source image options')
        result=verify_backup(args.verify_backup_dir) if args.verify_backup_dir else run(args.source,args.output_dir,args.uploads)
        print(json.dumps(result,indent=2))
    except (OSError,RuntimeError,ValueError,sqlite3.Error) as error:
        print('RC PREFLIGHT BLOCKED: '+str(error),file=sys.stderr)
        return 1
    return 0


if __name__=='__main__':
    sys.exit(main())
