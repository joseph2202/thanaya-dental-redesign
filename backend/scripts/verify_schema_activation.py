#!/usr/bin/env python3
"""Verify the live Thanaya SQLite DB against a verified backup, before or after additive schema activation.

Read-only only: never writes or migrates database files. Do not publish logs with personal data.
"""
from __future__ import annotations

import argparse
from contextlib import closing
from hashlib import sha256
import json
from pathlib import Path
import sqlite3
import sys
from urllib.parse import quote

from safe_backup import database_path
from rehearse_schema import BACKUP_ROOT, validated_backup, connect_read_only, verify_integrity, snapshot

EXPECTED_NEW_TABLES = {"OrderReturn", "OrderReturnLine"}
EXPECTED_NEW_COLUMNS = {"Order": {"returnRevision"}, "OrderItem": {"productName"}}

def rows_digest(conn: sqlite3.Connection, table: str, fields: list[str]) -> str:
    """Compare historic field values, not just counts. Never print values."""
    identifier = '"' + table.replace('"', '""') + '"'
    cols = ",".join('"' + f.replace('"', '""') + '"' for f in fields)
    h = sha256()
    for row in conn.execute("SELECT " + cols + " FROM " + identifier + " ORDER BY rowid"):
        # repr is deterministic across both SQLite connections and avoids printing PII.
        h.update(repr(tuple(row)).encode("utf-8", "surrogatepass"))
        h.update(b"\n")
    return h.hexdigest()

def main() -> None:
    parser = argparse.ArgumentParser(description="Check live DB versus backup without mutating either")
    parser.add_argument("--backup-dir", required=True, type=Path)
    parser.add_argument("--stage", choices=("before", "after"), required=True)
    args = parser.parse_args()

    live = database_path()
    expected_live = (Path(__file__).resolve().parents[1] / "prisma" / "dev.db").resolve()
    if live != expected_live:
        raise RuntimeError("Live DB is not backend/prisma/dev.db; refusing verification of an unexpected DB.")
    backup, manifest = validated_backup(args.backup_dir.expanduser())
    if backup.resolve() == live:
        raise RuntimeError("Backup and live DB resolve to the same file.")

    with closing(connect_read_only(backup)) as baseline, closing(connect_read_only(live)) as current:
        verify_integrity(baseline, "Verified backup")
        verify_integrity(current, "Live database")
        old = snapshot(baseline)
        now = snapshot(current)
        for name, count in old["counts"].items():
            if now["counts"].get(name) != count:
                raise RuntimeError(f"Historic table {name} count changed (expected {count}, now {now['counts'].get(name)}).")
            previous_columns = old["columns"][name]
            if not set(previous_columns).issubset(now["columns"].get(name, [])):
                raise RuntimeError(f"Legacy columns were dropped from {name}.")
            if rows_digest(baseline, name, previous_columns) != rows_digest(current, name, previous_columns):
                raise RuntimeError(f"Historic row data differ for {name}; do not proceed without review.")
        additional = set(now["tables"]) - set(old["tables"])
        added_columns = {table: set(now["columns"][table]) - set(fields)
                         for table, fields in old["columns"].items()}
        added_columns = {table: fields for table, fields in added_columns.items() if fields}
        if args.stage == "before":
            if additional or added_columns:
                raise RuntimeError(
                    "The live schema already differs from the verified backup. Recheck changes before migration: "
                    + repr(sorted(additional)) + ", columns: " + repr(added_columns)
                )
        else:
            if additional != EXPECTED_NEW_TABLES or added_columns != EXPECTED_NEW_COLUMNS:
                raise RuntimeError(
                    "Unexpected schema delta after migration: tables " + repr(sorted(additional))
                    + ", columns " + repr(added_columns)
                )
            for table in EXPECTED_NEW_TABLES:
                if now["counts"].get(table) != 0:
                    raise RuntimeError("New return ledger unexpectedly contains data: " + table)
            actual_revision = current.execute('SELECT COUNT(*) FROM "Order" WHERE "returnRevision" != 0').fetchone()[0]
            if actual_revision:
                raise RuntimeError("Historic orders have a nonzero returnRevision.")
            snapshot_names = current.execute('SELECT COUNT(*) FROM "OrderItem" WHERE "productName" IS NOT NULL').fetchone()[0]
            if snapshot_names:
                raise RuntimeError("Legacy order items unexpectedly received guessed names.")
    print(f"{args.stage.upper()} VERIFICATION PASSED")
    print("SQLite integrity and foreign keys: OK")
    print("Legacy rows and values unchanged; verified against backed-up source.")
    print("Orders:", old["counts"].get("Order"), "Products:", old["counts"].get("Product"),
          "Order items:", old["counts"].get("OrderItem"))
    if args.stage == "after":
        print("Added exactly the two return tables and the two expected columns.")
        print("The historical order totals and product records remain unchanged.")
    print("This verification did not modify the live database or the backup.")

if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("VERIFICATION STOPPED: " + str(error), file=sys.stderr)
        sys.exit(1)
