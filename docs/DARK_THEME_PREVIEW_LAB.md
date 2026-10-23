# THANAYA dark theme — PREVIEW ONLY

**Status:** Experimental visual lab on `feature/dark-theme-preview-lab`, based on `feature/thanaya-signature-experience`. Nothing is being applied globally.

## How to review

After switching to the isolated branch, run the existing frontend/backend locally, then open `http://localhost:3000/theme-preview`.

The lab has 5 representative screens:
1. Home: high-contrast ink/cyan hero and trust content.
2. Products: interactive category filter/search and product cards.
3. Product detail: gallery, price, quantity availability and technical attributes from catalog data.
4. Cart: **preview-only local state**; add/remove/change quantities and view layout. No real shopping cart, no order creation, no inventory changes, checkout disabled.
5. Admin: styling prototype that displays published catalog items, with placeholder views for orders/reports. **No private customer order data queried or invented**, no admin mutations.

On this dual-theme candidate branch, the **Dark / Light** choice also saves a *visual preference only* in browser local storage and applies to the actual shop pages in this same browser. It never changes inventory, orders, server settings or other customer data. The "Original site" link opens the fully functional storefront with the same saved theme; the lab's cart still cannot checkout.

This route is not linked from real store navigation, and is `noindex, nofollow`. Layout CSS is namespaced to `.thl-shell`; the production pages keep their existing themes.

## Visual design proposal

Dark background `#0b202c`, navy surfaces `#153442` / `#193d4f`, cyan accents `#82dff5`, light legible body text `#f3fbff`. Vary depth by surface and border; **do not fill every panel with identical dark blue**. For the light preview, invert using local CSS theme variables. Only a final user-approved theme rollout should touch global Header, pages, admin, settings or checkout.

## Safety and quality gate

- A/B review: compare dark versus light here and against `/` in a separate tab; inspect both desktop and mobile.
- UI access: navigation and mock cart are interactive, but never call write APIs; the only network operation in this lab is `productsAPI.getAll()` (public catalog GET).
- Actual product images and real prices are reused if present. Missing photos are disclosed.
- Reduced-motion and keyboard-visible focus are supported.
- Existing GitHub Action tests isolated backend order/return operations and runs `frontend npm run build`; **CI passes are not a replacement for visual approval**.

## Decision checkpoint

The user explicitly asked to TEST FIRST, then approve the change. **The original lab branch stays unmerged. The approved dual-theme implementation lives on a separate Draft PR and must undergo real visual review before any merge/rollout.**
