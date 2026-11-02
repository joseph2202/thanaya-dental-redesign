# THANAYA — ERP05/ERP06 development and local preview checkpoint (2026-11-02)

## Current branch chain
- Parent PR #53: `feature/erp4-supplier-payables-foundation-20261102` — supplier invoices/partial payments, previously green CI.
- PR #54: `feature/erp5-immutable-cogs-margin-20261102` — checkout-time private cost snapshots and narrowly scoped merchandise-margin coverage. CI Run #217 succeeded on the feature code including real checkout and security tests; verify latest HEAD after preview additions.
- PR #55: `feature/erp6-expenses-cash-20261102` — expense and recorded cash subledger, real admin UI and Chrome interaction, and demo preview. Must verify latest green CI before declaring acceptance.
- All PRs **Draft, unmerged, undeployed**. Mac local store `backend/prisma/dev.db` and uploads were **never accessed**.

## ERP05: what it computes and what it doesn't
- `OrderItemCostSnapshot` is a private relation, **not** a field on public order items. For new COD checkouts the backend captures immutable product-reference or exact allocated lot cost in the same SQLite transaction that reserves stock.
- Unknown cost is NULL (not 0). Historical orders have no snapshots; never backfill using today's cost.
- `/api/reports/costs?range=...` aggregates all **delivered, unreturned** orders with complete checkout snapshots; orders with merchandise returns or missing costs are counted as excluded instead of inventing profit.
- On admin `/admin/reports`, 3 new financial tiles show covered merchandise sales, covered cost and **qualified merchandise margin** with visible evidence coverage and a warning. Not net profit: operational costs, customer cash collections, shipping, taxes, returns require additional reconciliation.

## ERP06: recorded operating expenses and physical cash movements
- `StoreExpense` append-only, safe idempotency key, category/method/proof; separate from supplier-purchased inventory invoices to prevent double counting.
- `CashAdjustment` append-only owner-only contributions or withdrawals; other staff cannot record owner cash adjustments.
- `/api/cash/summary` combines **cash method only** customer collections/refunds, supplier payments, operating expenses and owner contributions/withdrawals. Excludes bank/card from physical cash, includes expense total across methods.
- `/admin/cash`: new operating expense entry, owner-only cash contribution/withdrawal, current period recorded-cash component breakdown; explicitly **NOT real physical till balance or net profit**.
- `backend/tests/cash.integration.cjs` checks roles, bad inputs, idempotency, distinction between cash vs bank and arithmetic. Real Playwright browser checks admin cost report and expense/cash entry on disposable data.

## Real local preview: show a website, not a mock
See `docs/LOCAL_SAFE_PREVIEW_2026-11-02.md`. Separate `thanaya-preview` clone plus `bash scripts/preview-local.sh` uses a uniquely named temp SQLite and uploads dir, random local owner password printed to Terminal, isolated ports 4108 and 3108, and cleans up on Ctrl+C. The script does **not** run on real `dev.db`. CI additionally executes seed safety tests.

## Safeguards and next gates
- **No real database migrations** for ERP03/04/05/06 have been applied. Rehearsed guarded migration scripts exist for ERP03/04, but ERP05/ERP06 require similarly reviewed additive migrations and an isolated backup+restore rehearsal before any real rollout. Do not run blind Prisma db push.
- Full real-provider electronic payment is **not configured**. Card UI remains truthful/disabled; real hosted checkout, provider sandbox, signed webhooks, idempotency, reconciliations and refunds need the merchant provider and testing. Never collect PAN/CVV in Thanaya.
- Additional future work: customer returns margin reconciliation, comprehensive net profit and true cash register opening/counted balance, owner expense approvals, HTTPS staging, distributed rate limiting, session revocation, CSP, performance/accessibility/mobile polish and actual merchant products/legal policies.
- Preserve original THANAYA palette, not orange. Do not claim project ready for launch.

Resume by checking PR #55 latest workflow, fixing failing tests first. The user requested an actual *visible screen* next: let them run the isolated preview clone after CI, with direct links to the storefront, reports, invoices and cash page.
