import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, RequestHandler, Response } from 'express';
import { getJwtSecret } from '../config/auth';

// Deliberately opt-in: the existing Bearer-token frontend and tests still work.
// The storefront must switch transports only after cookie/CSRF regression checks.
const COOKIE_AGE = 7 * 24 * 60 * 60 * 1000;
const secure = () => process.env.NODE_ENV === 'production';
const names = () => secure()
  ? { session: '__Host-thanaya_session', csrf: '__Host-thanaya_csrf' }
  : { session: 'thanaya_session', csrf: 'thanaya_csrf' };

function parseCookieHeader(raw: string, name: string): string | null {
  if (raw.length > 8192) return null;
  let value: string | null = null;
  for (const part of raw.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 1 || part.slice(0, separator).trim() !== name) continue;
    if (value !== null) return null; // Never accept ambiguous duplicate auth cookies.
    const candidate = part.slice(separator + 1).trim();
    if (!/^[A-Za-z0-9_.-]{1,4096}$/.test(candidate)) return null;
    value = candidate;
  }
  return value;
}

function expectedCsrf(token: string): string {
  return createHmac('sha256', getJwtSecret())
    .update('thanaya-csrf-v1:' + token).digest('base64url');
}

function equalToken(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function issueCookieSession(res: Response, token: string): void {
  const key = names();
  const attributes = { path: '/', sameSite: 'lax' as const, secure: secure(), maxAge: COOKIE_AGE };
  res.cookie(key.session, token, { ...attributes, httpOnly: true });
  // Safe for JavaScript to read; it is an unguessable, session-bound CSRF proof,
  // not the signed session itself. Do not log or persist it.
  res.cookie(key.csrf, expectedCsrf(token), { ...attributes, httpOnly: false });
}

export function clearCookieSession(res: Response): void {
  const key = names();
  const attributes = { path: '/', sameSite: 'lax' as const, secure: secure() };
  res.clearCookie(key.session, { ...attributes, httpOnly: true });
  res.clearCookie(key.csrf, { ...attributes, httpOnly: false });
}

export function cookieAllowedOrigins(): Set<string> {
  return new Set([
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    ...(process.env.CORS_ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean),
  ]);
}

export function wantsCookieSession(req: Request): boolean {
  return req.get('X-Thanaya-Auth-Mode') === 'cookie';
}

export function trustedCookieOrigin(req: Request, allowedOrigins: ReadonlySet<string>): boolean {
  const origin = req.get('Origin');
  return !!origin && allowedOrigins.has(origin);
}

// A compatibility bridge for existing routes: credentials are accepted from
// the browser's protected cookie only after a same-origin CSRF check for writes.
// Explicit Bearer authorization wins and never falls back to cookies.
export function cookieSessionBridge(allowedOrigins: ReadonlySet<string>): RequestHandler {
  return (req, res, next) => {
    if (req.path === '/api/auth/login' || req.path === '/api/auth/register') return next();
    if (req.headers.authorization) return next();
    const key = names();
    const token = parseCookieHeader(req.headers.cookie || '', key.session);
    if (!token) return next();

    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase())) {
      const supplied = req.get('X-Thanaya-CSRF');
      const cookieProof = parseCookieHeader(req.headers.cookie || '', key.csrf);
      const expected = expectedCsrf(token);
      if (!trustedCookieOrigin(req, allowedOrigins) ||
          !supplied || !cookieProof ||
          !equalToken(supplied, expected) || !equalToken(cookieProof, expected)) {
        res.status(403).json({ error: 'تعذّر التحقق من أمان الجلسة. حدّث الصفحة وحاول مجدداً.' });
        return;
      }
    }

    req.headers.authorization = 'Bearer ' + token;
    next();
  };
}
