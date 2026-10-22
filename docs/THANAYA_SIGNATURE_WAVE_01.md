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

- **Verified successful:** GitHub Actions run `39866019792` completed with success: synthetic migration rehearsal, guarded-migration checks, isolated SQLite order/returns tests, Backend TypeScript build and optimized Next.js frontend build. This is a build/logic check, **not a real device screenshot or production load test**.
- Review layout on a real mobile viewport and desktop **after** green CI. Do not run repeated Mac DB integration tests merely for UI styles.

## Next waves

1. **Commerce accounting:** genuine payment collection/refund ledger and audit trail; cannot infer settlement from delivered/returned status. Historical returned orders lack a merchandise receipt ledger in legacy records.
2. **Merchandising readiness:** replace test inventory photos/descriptions with real supplier-confirmed medical devices, packaging, SKU and technical attributes.
3. **Full brand polish:** branded imagery supplied by Thanaya, image optimization, accessibility/contrast and mobile performance audit, then domain/hosting with persistent uploads/backups.

## Screenshot-driven follow-up — 23 October 2026

The user supplied five desktop screenshots of the running Mac storefront (home hero, empty basket, sparse product grid, categories/steps, footer). The homepage's new medical visual language rendered correctly; there are concrete improvements before claiming launch-quality:

- The hero consumed most of the first desktop viewport. Its typography, spacing, and desktop orbit block were reduced while preserving the dark-cyan identity.
- A two-product catalog left approximately half the page unused and stretched two placeholder images. The layout now renders the two genuine catalog records alongside a proportional editorial guide on desktop; cards with missing photographs use a shorter aspect ratio and explicitly disclose that the photo has not yet been uploaded.
- The former animated blue marquee listed equipment categories not represented by actual products (e.g. lab equipment and sterilization). It was replaced with four factual, static shopping information points. Real category discovery still derives from actual products using `CategoryGrid`.
- The basket screenshot was its *empty* state, not evidence of checkout behavior. Now it optionally displays in-stock products fetched from the existing catalog below the empty-state message; failures to fetch are nonblocking.
- The global grid background was softened to reduce visual noise and prioritise merchandise.

**Next meaningful visual checkpoint:** inspect the populated basket with one product (not a real checkout), inspect desktop + mobile homepage, and replace test catalog imagery with original, authorized product photography when available.

**Data/safety:** no changes to database schema, order statuses, inventory mutations, payments, or return accounting. All UI still reads existing product availability and quote state.
