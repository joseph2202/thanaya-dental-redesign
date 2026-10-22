#!/usr/bin/env python3
"""READ-ONLY rehearsal of the Thanaya return-line disposition migration.

Reads the selected existing SQLite database in read-only mode, creates a
throwaway private copy using SQLite's backup API, and alters THAT COPY ONLY.
No live migration, Prisma schema push, user/stock changes, or uploads changes.

Use on a quiet/offline database for meaningful before/after comparisons:
    python3 backend/scripts/rehearse_return_disposition.py

Optional: --source PATH (for a verified backup or synthetic test database).
"""
from __future__ import annotations

import argparse
from contextlib import closing
import hashlib
import os
from pathlib import Path
import sqlite3
import sys
import tempfile

from safe_backup import database_path, integrity, read_only_connection

TABLE = 'OrderReturnLine'
LEGACY_COLUMNS = {'id', 'orderReturnId', 'orderItemId', 'lotId', 'quantity'}
ADDITION = 'ALTER TABLE "OrderReturnLine" ADD COLUMN "disposition" TEXT NOT NULL DEFAULT \'restocked\''


def quoted(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def columns(db: sqlite3.Connection, table: str) -> list[tuple]:
    return db.execute(f'PRAGMA table_info({quoted(table)})').fetchall()


def validate_source(db: sqlite3.Connection) -> bool:
    integrity(db)
    errors = db.execute('PRAGMA foreign_key_check').fetchall()
    if errors:
        raise RuntimeError('Existing foreign-key violations detected; do not attempt a migration.')
    col = columns(db, TABLE)
    if not col:
        raise RuntimeError('OrderReturnLine table not found; refusing to guess the schema.')
    names = {row[1] for row in col}
    if not LEGACY_COLUMNS.issubset(names):
        raise RuntimeError('OrderReturnLine missing expected legacy fields; refuse unknown database.')
    if 'disposition' in names:
        entry = next(row for row in col if row[1] == 'disposition')
        if entry[2].upper() != 'TEXT' or entry[3] != 1 or entry[4] != "'restocked'":
            raise RuntimeError('Disposition exists but differs from intended definition; stop.')
        return True
    return False


def fingerprint(db: sqlite3.Connection, skip_disposition: bool = False) -> dict[str, tuple[int, str]]:
    """Only hash row data locally; never print customer identities or records."""
    names = [row[0] for row in db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )]
    result: dict[str, tuple[int, str]] = {}
    for table in names:
        selected = [row[1] for row in columns(db, table)
                    if not (skip_disposition and table == TABLE and row[1] == 'disposition')]
        if not selected:
            continue
        fields = ', '.join(quoted(name) for name in selected)
        rows = db.execute(f'SELECT {fields} FROM {quoted(table)} ORDER BY rowid')
        count = 0
        digest = hashlib.sha256()
        for row in rows:
            digest.update(repr(tuple(row)).encode('utf-8'))
            digest.update(b'\n')
            count += 1
        result[table] = (count, digest.hexdigest())
    return result


def rehearse(source: Path) -> dict[str, int | bool]:
    source = source.expanduser()
    if source.is_symlink():
        raise RuntimeError('Symlink database paths are not allowed.')
    source = source.resolve(strict=True)
    if not source.is_file():
        raise RuntimeError('Source must be an existing, regular SQLite file.')
    with closing(read_only_connection(source)) as original:
        already_upgraded = validate_source(original)
        before = fingerprint(original)
        # The backup() API captures a consistent copy even when a WAL file exists.
        with tempfile.TemporaryDirectory(prefix='thanaya-quarantine-rehearsal-') as folder:
            private_copy = Path(folder) / 'rehearsal.sqlite'
            with closing(sqlite3.connect(private_copy)) as clone:
                original.backup(clone, pages=256, sleep=0.05)
                if fingerprint(clone) != before:
                    raise RuntimeError('Temporary copy differs from source before migration.')
                validate_source(clone)
                if not already_upgraded:
                    with clone:
                        clone.execute(ADDITION)
                validate_source(clone)
                after = fingerprint(clone, skip_disposition=not already_upgraded)
                if after != before:
                    raise RuntimeError('Original records changed in the temporary copy!')
                if not already_upgraded:
                    incorrect = clone.execute(
                        'SELECT COUNT(*) FROM "OrderReturnLine" WHERE disposition != ?',
                        ('restocked',)
                    ).fetchone()[0]
                    if incorrect:
                        raise RuntimeError('Legacy return rows were not assigned default restocked.')
                integrity(clone)
                if clone.execute('PRAGMA foreign_key_check').fetchall():
                    raise RuntimeError('Migration rehearsal introduced foreign-key violations.')
                line_count = clone.execute('SELECT COUNT(*) FROM "OrderReturnLine"').fetchone()[0]
                table_count = len(before)
        # Detect concurrent changes that could invalidate the rehearsal.
        if fingerprint(original) != before:
            raise RuntimeError('Source data changed during rehearsal. Stop services and retry.')
    return {'tables': table_count, 'previous_return_lines': line_count,
            'already_upgraded': already_upgraded}


def main() -> int:
    parser = argparse.ArgumentParser(description='Safe rehearsal ONLY. Never modifies source SQLite.')
    parser.add_argument('--source', type=Path, help='Specific existing database or verified backup')
    args = parser.parse_args()
    os.umask(0o077)
    source = args.source if args.source else database_path()
    result = rehearse(source)
    print('THANAYA QUARANTINE MIGRATION — ISOLATED REHEARSAL PASSED')
    print('Tables checked: ' + str(result['tables']))
    print('Historical return rows: ' + str(result['previous_return_lines']))
    if result['already_upgraded']:
        print('Source already has the expected column; only compatibility checks were performed.')
    else:
        print("Historical return rows would be labelled 'restocked' (no historic stock recalculation).")
    print('All old rows identical; SQLite integrity and foreign keys valid.')
    print('Original database UNCHANGED; temporary copy DELETED; no Prisma push was run.')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (RuntimeError, sqlite3.Error, OSError) as exc:
        print('REHEARSAL STOPPED WITHOUT SOURCE CHANGES: ' + str(exc), file=sys.stderr)
        sys.exit(1)
