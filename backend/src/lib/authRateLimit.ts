import { createHash } from 'node:crypto';
import type { RequestHandler, Response } from 'express';

// Local single-process safety net for the current Mac/SQLite preview. For a
// multi-instance deployment, replace the in-memory store with a shared limiter.
type Counter = { count: number; resetAt: number };
const counters = new Map<string, Counter>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_KEYS = 10000;

function keyHash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function current(key: string): Counter | undefined {
  const previous = counters.get(key);
  if (!previous) return undefined;
  if (Date.now() >= previous.resetAt) {
    counters.delete(key);
    return undefined;
  }
  return previous;
}

function record(key: string): Counter {
  const now = Date.now();
  const entry = current(key) || { count: 0, resetAt: now + WINDOW_MS };
  entry.count += 1;
  counters.set(key, entry);
  // Bound memory against attacks using many distinct email addresses.
  if (counters.size > MAX_KEYS) {
    for (const [candidate, bucket] of counters) {
      if (bucket.resetAt <= now) counters.delete(candidate);
    }
    if (counters.size > MAX_KEYS) {
      const oldest = counters.keys().next().value;
      if (oldest) counters.delete(oldest);
    }
  }
  return entry;
}

function denied(res: Response, entry: Counter): void {
  res.setHeader('Retry-After', String(Math.max(1, Math.ceil((entry.resetAt - Date.now()) / 1000))));
  res.status(429).json({ error: 'محاولات كثيرة خلال فترة قصيرة. حاول مرة ثانية بعد قليل.' });
}

// Trust only the socket peer. Never trust X-Forwarded-For from direct clients.
// For the current same-origin Next.js rewrite, multiple visitors may share
// the local proxy peer; keep this general threshold generous accordingly.
function sourceKey(ip: string | undefined, kind: 'login' | 'register'): string {
  return kind + ':source:' + keyHash(ip || 'unknown');
}

function sourceLimiter(kind: 'login' | 'register', maximum: number): RequestHandler {
  return (req, res, next) => {
    const entry = record(sourceKey(req.ip || req.socket.remoteAddress, kind));
    if (entry.count > maximum) return denied(res, entry);
    next();
  };
}

export const limitLoginTraffic = sourceLimiter('login', 120);
export const limitRegistrations = sourceLimiter('register', 30);

const FAILED_LIMIT = 10;
function failedKey(email: string): string {
  return 'login:failed:' + keyHash(email.toLowerCase());
}

export function rejectRepeatedLoginFailures(email: string, res: Response): boolean {
  const entry = current(failedKey(email));
  if (entry && entry.count >= FAILED_LIMIT) {
    denied(res, entry);
    return true;
  }
  return false;
}

export function noteFailedLogin(email: string): void {
  record(failedKey(email));
}

export function clearFailedLogins(email: string): void {
  counters.delete(failedKey(email));
}
