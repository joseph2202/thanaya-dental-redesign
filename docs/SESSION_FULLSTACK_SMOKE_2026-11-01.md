# THANAYA — Full-stack cookie security verification checkpoint

Date: 2026-11-01. Parent PR #47 branch: `feature/cookie-auth-frontend-migration-20261101`.
New branch: `feature/fullstack-cookie-session-smoke-20261101`. Draft only; do not merge or deploy without green CI and browser review.

## Implemented
- `frontend/tests/fullstack-session-proxy.cjs` spins up **real compiled Express API** and **production Next.js** behind its existing `/api` rewrite.
- Uses an isolated temporary SQLite database in `os.tmpdir()`, random JWT secret, and temporary upload directory. Test aborts if the configured backend port 4000 is already occupied (to avoid connecting to real Mac backend).
- Tests a synthetic new customer registration through Next, no JWT in response JSON, proper HttpOnly cookie and a separate JS-readable signed CSRF cookie, `/auth/me` and `/orders/mine`, blocked/allowed address writes, wrong-origin requests, restricted exports, and logout cookie clearing.
- Added to `.github/workflows/returns-quarantine.yml` following production Next build and security-header checks.

## Limits and next steps
- This is a **live HTTP full-stack smoke test**, not a headless-browser E2E. It proves Next-to-Express proxy transport, not clicking real forms, Chrome cookie enforcement, Cloudflare HTTPS handling, dark mode or responsive UI.
- The test backend runs with NODE_ENV=test; production `__Host-` Secure cookie flags still require testing over a real HTTPS preview.
- Real-world browser login, register, logout, staff role switching, checkout, image upload and Excel export are not yet proven end-to-end.
- Cookie logout deletes the browser cookie but does not revoke any stolen stateless JWT. Session revocation/rotation still open.
- No Prisma migration against user's dev.db; no changes to production credentials, no external deployment and no payment activation.

## Resume
- Read this file, PR #47 and earlier #46/#45.
- Check GitHub Actions on this branch for **latest HEAD** before reporting success.
- If CI fails, inspect failed step and fix in a new commit; never modify user Mac DB.
