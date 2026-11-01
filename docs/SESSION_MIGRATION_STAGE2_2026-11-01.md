# THANAYA — Secure cookie frontend migration, stage 2 — 2026-11-01

## Branches and isolation
- Parent PR #46: `feature/cookie-session-csrf-foundation-20261101` (opt-in backend, Run #148 success).
- Current branch: `feature/cookie-auth-frontend-migration-20261101`; Draft PR for the frontend switch.
- This is **not deployed or merged**. Never apply migrations to `backend/prisma/dev.db` or alter local Mac secrets. Existing production/live users: none presumed; still preserve their data and existing branches.

## Code changes
- `frontend/src/lib/api.ts`: API calls use same-origin cookies. Sign-in and sign-up send `X-Thanaya-Auth-Mode: cookie`; unsafe mutations send CSRF cookie's proof as `X-Thanaya-CSRF`. Uploads and XLSX exports use the same session without a JS-readable token.
- `frontend/src/lib/auth.ts`: new registrations and logins no longer persist JWT. Obsolete `thanaya-token` and `thanaya-current-user` storage keys cleared after upgrading. Logout calls backend; it never claims success if the network request fails.
- `frontend/src/context/AuthContext.tsx`: account is revalidated through GET /api/auth/me on app load; no cached role is trusted. Login/register set server-confirmed user data; logout updates only after cookie clearance.
- Login and register pages pass the server-verified user to AuthContext.
- `backend/src/lib/cookieSession.ts` still honors explicit legacy Bearer for CLI/test compatibility while the frontend no longer uses it.

## Required verification before merging
- Full CI frontend and backend builds, isolated auth/cookie CSRF integration tests, dependency scans.
- Browser E2E: login, reload, owner/admin roles, saved addresses, orders, checkout, image uploads and spreadsheet exports, failed CSRF, logout and reload.
- Review cross-browser cookie/Origin behavior through Next.js rewrites and private Cloudflare preview. Production needs `CORS_ALLOWED_ORIGINS` configured for actual HTTPS storefront domain.
- Follow-on: server-side revocation / rotation, shared rate limiter for multi-instance backend, stronger CSP and XSS review.
- Keep payment card integration disabled and ERP #43 separate.

## Restart guide
1. Read PR #45, PR #46 and this stage-2 PR. Inspect latest CI status.
2. Do not pull stage 2 to Mac without checking `git status`/stash backup and verifying a matching local backend branch.
3. Never run `prisma db push` on the real Mac store database.
