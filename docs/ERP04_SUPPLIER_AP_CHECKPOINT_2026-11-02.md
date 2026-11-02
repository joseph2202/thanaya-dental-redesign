# THANAYA — ERP04 supplier accounts payable checkpoint (2026-11-02)

## Branch / project status
- Parent is integration PR #52 (`feature/integrate-security-erp3-20261102`) — security + ERP03 receiving.
- Current draft PR #53 (`feature/erp4-supplier-payables-foundation-20261102`). No deploy, no merge to main.
- Local Mac `backend/prisma/dev.db`, uploads and secrets **untouched**. Never run `prisma db push` on that source.
- CI uses disposable SQLite and isolated fake users/invoices.

## Implemented
- New `SupplierInvoice`, `SupplierPayment`, and `PurchaseOrder.invoiceRevision`. Supplier invoice is an explicitly entered payable; receipt alone does not create a debt.
- Supplier invoice must belong to an ordered purchase order and cannot exceed physically received IQD purchase-cost value less already recorded invoices. Prices/taxes/freight mismatch reconciliation is NOT supported in this initial scope.
- Strict input, immutable bill amount/number/date, supplier-scoped unique invoice number, unique create requestId and CAS revision for parallel creations.
- Append-only manual supplier payment events with reference/method, idempotency and CAS on bill revision. No automatic bank transfer, customer order collection, gateway payment or inventory adjustment.
- Owner/admin-only `/api/payables/invoices` GET/POST, `/api/payables/invoices/:id` GET and `/api/payables/invoices/:id/payments` POST. Existing HttpOnly cookie + CSRF protection from PR #52 also applies.
- `/admin/payables` shows registered invoice totals, records invoice against physically received stock, lets user record out-of-band payment and follow remaining balance. Linked from admin sidebar and procurement.
- Dedicated `backend/tests/payables.integration.cjs` covers authorization, duplicate invoice/debt, over-billing, partial/full payment, concurrency, forbidden inputs, and separation from stock/cash.
- Browser Playwright test covers creating and partially paying supplier invoice from owner UI after a synthetic goods receipt.
- `backend/scripts/rehearse_erp_payables.py`: copy-only / read-only source schema rehearsal, preserve all legacy table fingerprints. `apply_erp_payables.py`: guarded apply requiring independently verified SHA-256 backup and explicit confirmation; only synthetic test databases are permitted in CI.
- Test modules `test_rehearse_erp_payables.py`, `test_apply_erp_payables.py` integrated into GitHub Actions.

## Acceptance / hard gates
1. Check **latest HEAD CI** and require green backend/Prisma build, isolated AP suite, migration rehearsal & guarded apply suite, Next.js build, and real Playwright admin payment flow.
2. At a later controlled offline migration, apply prior ERP procurement + ERP03 schema first on a protected SQLite backup, before ERP04. Never pull production data into CI.
3. Manual audit of partial receipt -> invoice -> partially paid -> fully paid -> duplicate request -> simultaneous payment, including supplier invoice photo/document workflow (not yet implemented).
4. The invoice picker shows the latest 200 invoices, but API/UI **summary totals are aggregated across every stored invoice and payment**, not just the visible 200. Older invoice selection/search and general ledger reconciliation remain future work. A separate regression seeds 201 additional historical invoices to prove full-history totals.
5. Invoicing outside received-goods cost, taxes, currency conversion, opening supplier balances, chargebacks, supplier credits, payment reversal, and financial period closing are **not implemented**. Do not claim otherwise.
6. Continue ERP05 COGS, ERP06 expenses/cash, disaster recovery, server-side session revocation and UX polish. No live card integration.

## Recovery after interruption
Start with PR #52 and #53, GitHub Actions result of newest PR #53 head, and this file. Never assume latest CI is green from earlier success. Keep the approved original brand color, not orange.
