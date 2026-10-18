# Thanaya owner and staff roles — draft

This branch starts from the verified inventory-ledger feature and is not merged.

- Existing admin becomes owner ONLY via explicit local CLI with its exact email.
- Signup creates customer as before. No public admin signup.
- Owner may assign admin, inventory, sales or customer role to an existing account.
- Owner cannot demote itself, and no role management API can alter an owner.
- Admin manages catalog/order/users read-only, but cannot assign roles.
- Inventory manages stock, not product pricing.
- Sales processes orders, not stock adjustments or pricing.
- Role-change events are persisted in additive RoleChange table.
- Existing accounts, passwords, orders and products must be preserved.

## Deployment: never skip

1. Stop backend, take and verify an SQLite backup.
2. On this branch run isolated tests first.
3. Run prisma db push ONLY with confirmed backup; stop if reset/data-loss warning.
4. Identify YOUR exact already-admin email (do not guess).
5. Run `cd backend && node scripts/bootstrap-owner.cjs 'EXISTING_ADMIN_EMAIL'`.
6. Restart servers and sign in as owner. Manage existing users at /admin/users.

Emails and invited-user onboarding are NOT part of this version; users sign up normally before owner assigns a staff role. No automatic JWT revocation beyond DB role checks. Settings remain browser-local.
