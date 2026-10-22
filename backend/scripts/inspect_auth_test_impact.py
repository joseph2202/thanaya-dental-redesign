#!/usr/bin/env python3
"""Read-only check for a known accidental auth-test account in the local SQLite DB.

This script never changes, deletes, or creates users. No passwords are printed.
"""
from __future__ import annotations

from contextlib import closing
from safe_backup import database_path, read_only_connection, integrity, verified_counts

MARKER_EMAIL = "Legacy.Owner@Test.invalid"

def main() -> int:
    path = database_path()
    print("Database: " + str(path))
    with closing(read_only_connection(path)) as db:
        integrity(db)
        print("SQLite integrity: ok")
        counts = verified_counts(db)
        print("Records: users=%s, orders=%s, items=%s, products=%s, inventory movements=%s" % (
            counts["User"], counts["Order"], counts["OrderItem"], counts["Product"],
            counts["InventoryMovement"]))
        matches = db.execute(
            'SELECT id, name, role, email, createdAt FROM "User" WHERE email = ?',
            (MARKER_EMAIL,),
        ).fetchall()
        print("Auth test marker matches: " + str(len(matches)))
        if not matches:
            print("No exact test account marker found. No cleanup should be attempted.")
            return 0
        for user_id, name, role, email, created in matches:
            print("Test marker: email=%r name=%r role=%r createdAt=%s" % (
                email, name, role, created))
            references = {
                "orders": ('"Order"', "userId"),
                "saved addresses": ('"CustomerAddress"', "userId"),
                "notifications": ('"Notification"', "recipientId"),
                "role changes": ('"RoleChange"', "actorId"),
                "settings changes": ('"StoreSettingsChange"', "actorId"),
                "delivery changes": ('"DeliverySettingsChange"', "actorId"),
            }
            for label, (table, column) in references.items():
                table_name = table.strip('"')
                exists = db.execute(
                    "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
                    (table_name,),
                ).fetchone()
                if not exists:
                    print("Related %-20s: not present" % label)
                    continue
                count = db.execute(
                    "SELECT COUNT(*) FROM " + table + " WHERE " + column + "=?",
                    (user_id,),
                ).fetchone()[0]
                print("Related %-20s: %d" % (label, count))
        print("READ ONLY COMPLETE. Do not delete anything before reviewing these results.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
