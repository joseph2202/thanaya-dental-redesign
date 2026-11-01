# THANAYA — Secure session migration, stage 1 (2026-11-01)

## State and hierarchy
- Parent: PR #45 / `feature/security-hardening-and-ux-cleanup-20261101`.
- This branch: `feature/cookie-session-csrf-foundation-20261101`.
- **Stage 1 only:** Cookie transport is opt-in; storefront continues using legacy Bearer/localStorage until the next separately tested stage. Do NOT claim the frontend has been migrated.
- No schema migrations, no changes to Mac `backend/prisma/dev.db`, no deployment, no card payments.

## Changes
- `backend/src/lib/cookieSession.ts`: HttpOnly, SameSite=Lax cookie for signed HS256 JWT; JS-readable session-bound HMAC CSRF proof, double-submit header validation, strict Origin allowlist, explicit Bearer precedence. Production cookies use Secure and __Host- prefix (local HTTP uses development names).
- `backend/src/routes/auth.ts`: request header `X-Thanaya-Auth-Mode: cookie` opts login/register into cookies. Response contains user only (no raw JWT). `POST /api/auth/logout` clears the cookies after trusted Origin and CSRF guard. Legacy login/register remain backward-compatible for existing scripts/tests.
- `backend/src/index.ts`: cookie bridge before API routes, CORS origin rules reused.
- `backend/tests/auth.integration.cjs`: test real cookie login and expiry clearing, cross-site/wrong Origin, missing/incorrect CSRF, authorized address read/write with CSRF and no fallback from explicit invalid Bearer. Scratch SQLite only.

## Critical next stage
1. Confirm GitHub Actions CI, especially isolated auth tests and Node TypeScript build.
2. Migrate `frontend/src/lib/auth.ts`, `frontend/src/context/AuthContext.tsx`, `frontend/src/lib/api.ts`, upload/export requests, login/register/logout UI to opt-in cookie transport + CSRF header on unsafe methods. Remove all localStorage bearer writes and read paths. Ensure first-party same-origin credentials and expiry/401 handling.
3. Repeat full CI + browser login/checkout/admin/logout test on isolated preview. Do not merge until all routes work with cookie-only auth. Explicitly test CSRF from third-party origin, duplicate cookies, old bearer compatibility, cookie flags on HTTPS.
4. Long-term: revocation/rotation for server-side sessions, shared rate limit before multiple backend instances, CSP with script restrictions and audited payment integration.

## Caveats
- Cookie session HMAC CSRF helps CSRF, not XSS. Current frontend still uses localStorage JWT until stage 2.
- Strict Origin check relies on configured `CORS_ALLOWED_ORIGINS` for deployed custom domains; always configure trusted HTTPS storefront origin before activating cookie mode on production.
- CSRF cookie is intentionally not HttpOnly: JavaScript must read it to send `X-Thanaya-CSRF`. The signed JWT cookie IS HttpOnly.
- Logout cannot cryptographically revoke a stateless JWT that was already copied; rotation/revocation work remains.
