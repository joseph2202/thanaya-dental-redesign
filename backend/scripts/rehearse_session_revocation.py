#!/usr/bin/env python3
"""Rehearse the private logout journal on a disposable clone; no live apply."""
from __future__ import annotations
import argparse
from contextlib import closing
from pathlib import Path
import sqlite3
import sys
from tempfile import TemporaryDirectory
from safe_backup import read_only_connection, integrity
from rehearse_erp_receiving import columns, fingerprint

TABLE = "RevokedSession"
MIGRATION = (
    '''CREATE TABLE "RevokedSession" (
      "tokenHash" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "expiresAt" DATETIME NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )''',
    'CREATE INDEX "RevokedSession_expiresAt_idx" ON "RevokedSession"("expiresAt")',
)
EXPECTED = {
    "tokenHash": ("TEXT", 1, 1), "userId": ("TEXT", 1, 0),
    "expiresAt": ("DATETIME", 1, 0), "createdAt": ("DATETIME", 1, 0),
}


def state(db):
    integrity(db)
    if db.execute("PRAGMA foreign_key_check").fetchall():
        raise RuntimeError("Existing foreign keys invalid")
    users = {row[1] for row in db.execute('PRAGMA table_info("User")')}
    if not {"id", "email", "password", "role"}.issubset(users):
        raise RuntimeError("Session revocation requires existing User schema")
    object_type = db.execute("SELECT type FROM sqlite_master WHERE name=?", (TABLE,)).fetchone()
    if object_type is None:
        return "pending"
    if object_type[0] != "table":
        raise RuntimeError("Incomplete session journal: name belongs to another object")
    info = db.execute('PRAGMA table_info("RevokedSession")').fetchall()
    actual = {row[1]: (row[2].upper(), row[3], row[5]) for row in info}
    if actual != EXPECTED or next(row[4] for row in info if row[1] == "createdAt") != "CURRENT_TIMESTAMP":
        raise RuntimeError("Incomplete session journal columns/defaults")
    if db.execute('PRAGMA foreign_key_list("RevokedSession")').fetchall():
        raise RuntimeError("Unexpected session journal foreign keys")
    indexes = set()
    for row in db.execute('PRAGMA index_list("RevokedSession")'):
        name = row[1].replace('"', '""')
        fields = tuple(col[2] for col in db.execute('PRAGMA index_info("' + name + '")'))
        if row[2] and fields != ("tokenHash",):
            raise RuntimeError("Unexpected session journal unique constraint")
        if not row[2] and not row[4]:
            indexes.add(fields)
    if ("expiresAt",) not in indexes:
        raise RuntimeError("Incomplete session journal expiry index")
    if db.execute("SELECT 1 FROM sqlite_master WHERE type='trigger' AND tbl_name=?", (TABLE,)).fetchone():
        raise RuntimeError("Unexpected session journal trigger")
    return "installed"


def rehearse(source: Path):
    source = source.expanduser()
    if source.is_symlink():
        raise RuntimeError("SQLite source symlink refused")
    source = source.resolve(strict=True)
    if not source.is_file():
        raise RuntimeError("SQLite source must be a file")
    with closing(read_only_connection(source)) as original:
        prior = state(original)
        layout = columns(original)
        before = fingerprint(original, layout)
        with TemporaryDirectory(prefix="thanaya-session-rehearsal-") as folder:
            with closing(sqlite3.connect(Path(folder) / "clone.sqlite")) as copy:
                original.backup(copy)
                if fingerprint(copy, layout) != before:
                    raise RuntimeError("Temporary copy differs from source")
                if prior == "pending":
                    with copy:
                        for sql in MIGRATION:
                            copy.execute(sql)
                if state(copy) != "installed" or fingerprint(copy, layout) != before:
                    raise RuntimeError("Rehearsal changed existing rows")
                if prior == "pending" and copy.execute('SELECT count(*) FROM "RevokedSession"').fetchone()[0]:
                    raise RuntimeError("Past revocations must not be invented")
        if fingerprint(original, layout) != before:
            raise RuntimeError("Original changed during rehearsal")
    return {"already_installed": prior == "installed", "source_unchanged": True,
            "prior_tables": len(layout), "past_revocations_backfilled": 0}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Session journal rehearsal; writes to a temporary clone only")
    parser.add_argument("--source", type=Path, required=True)
    args = parser.parse_args()
    try:
        print("THANAYA SESSION REHEARSAL PASSED", rehearse(args.source))
        print("SOURCE UNCHANGED; no live activation mode exists.")
    except (OSError, RuntimeError, ValueError, sqlite3.Error) as error:
        print("SESSION REHEARSAL BLOCKED:", error, file=sys.stderr)
        sys.exit(1)
