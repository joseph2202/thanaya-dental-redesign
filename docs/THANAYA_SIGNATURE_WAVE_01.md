# THANAYA Signature Experience · Wave 01

> Branch `feature/thanaya-signature-experience` based on `feature/returns-quarantine-foundation`. Frontend-only UX/design work; **no DB migration, no write API changes, no inventory or financial state changes**.

## Visible changes

- **Editorial hero:** dark ink-blue medical aesthetic with a crisp cyan CTA, grounded Basra/IQD reassurance, and CSS-driven category navigation cards on desktop. No simulated merchandise, fake customer testimonials, or externally sourced images.
- **Curated home catalog:** anchor link to the real products, shorter editorial section headers, reusable product cards.
- **Catalog cards:** coherent media crops, stock state, category, real product/brand data, explicit sale unit and IQD pricing, high-legibility touch targets and add-to-cart feedback. No fake product photos when uploads are absent.
- **Product details:** consistent gallery, clear media-placeholder disclosure, sticky desktop commerce panel, current sellable stock/price information, structured specifications and attributes, and related products using the same cart-ready card component.
- **Cart:** responsive product rows and quantity stepper, sticky desktop quote summary, price-change alerts and availability block derived from the **server quote API**, with shipping/coupon clearly marked as determined at checkout.
- **Admin orders:** dense three-column order cards on desktop and stacked mobile layout, legible real item preview and call/copy/details/actions, preserving historical-return warnings. Existing confirmation dialogs and back-end permissions remain intact.
- **Motion:** CSS transitions only, with `prefers-reduced-motion` support. No heavyweight animation dependencies added.

## What makes this more than cosmetics

- Product and cart prices are not invented; they use stored product data and `productsAPI.quote`.
- No order totals or stock values are altered by this PR.
- Unavailable products remain disabled, the cart cannot proceed before the quote confirms availability, and price changes are explained.
- The design calls out missing product photography instead of presenting fabricated medical product pictures.

## Verification

- Existing GitHub Actions `.github/workflows/returns-quarantine.yml` runs isolated SQLite schema/order checks, backend typecheck, and Next.js `npm run build` on PRs.
- Review layout on a real mobile viewport and desktop **after** green CI. Do not run repeated Mac DB integration tests merely for UI styles.

## Next waves

1. **Commerce accounting:** genuine payment collection/refund ledger and audit trail; cannot infer settlement from delivered/returned status. Historical returned orders lack a merchandise receipt ledger in legacy records.
2. **Merchandising readiness:** replace test inventory photos/descriptions with real supplier-confirmed medical devices, packaging, SKU and technical attributes.
3. **Full brand polish:** branded imagery supplied by Thanaya, image optimization, accessibility/contrast and mobile performance audit, then domain/hosting with persistent uploads/backups.
