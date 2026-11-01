export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) {
    throw new Error('JWT_SECRET must be configured in backend/.env');
  }
  // Fail closed on production deployments with weak or example signing keys.
  // Development and isolated CI databases retain their existing local setup.
  if (process.env.NODE_ENV === 'production' &&
      (Buffer.byteLength(secret, 'utf8') < 32 ||
       /^(?:changeme|change-me|your[-_ ]?secret|test[-_ ]?secret|placeholder)$/i.test(secret))) {
    throw new Error('Production JWT_SECRET must be a unique random secret of at least 32 bytes');
  }
  return secret;
}
