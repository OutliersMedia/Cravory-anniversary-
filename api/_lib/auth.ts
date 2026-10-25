import * as jose from 'jose';

const DEVICE_COOKIE_NAME = 'crv_device';
const ADMIN_COOKIE_NAME = 'crv_admin';

function getJwtSecret(): Uint8Array {
  const secret = process.env.TOKEN_SECRET || 'fallback-cravery-secret-at-least-32-chars-long';
  return new TextEncoder().encode(secret);
}

function getAdminSecret(): Uint8Array {
  const secret = (process.env.TOKEN_SECRET || 'fallback-cravery-secret-at-least-32-chars-long') + ':admin';
  return new TextEncoder().encode(secret);
}

/**
 * Creates a signed JWT for the player device (1 year validity)
 */
export async function createDeviceToken(playerId: string): Promise<string> {
  return await new jose.SignJWT({ sub: playerId, type: 'device' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('365d')
    .sign(getJwtSecret());
}

/**
 * Verifies a device JWT and returns playerId if valid
 */
export async function verifyDeviceToken(token: string): Promise<{ playerId: string } | null> {
  try {
    const { payload } = await jose.jwtVerify(token, getJwtSecret(), {
      algorithms: ['HS256'],
    });
    if (payload.sub && payload.type === 'device') {
      return { playerId: payload.sub };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Creates a signed JWT for an authenticated admin session (12 hours validity)
 */
export async function createAdminToken(): Promise<string> {
  return await new jose.SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(getAdminSecret());
}

/**
 * Verifies if an admin JWT is valid
 */
export async function verifyAdminToken(token: string): Promise<boolean> {
  try {
    const { payload } = await jose.jwtVerify(token, getAdminSecret(), {
      algorithms: ['HS256'],
    });
    return payload.role === 'admin';
  } catch {
    return false;
  }
}

/**
 * Parses the Cookie request header
 */
export function parseCookies(header?: string | string[]): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  const raw = Array.isArray(header) ? header.join('; ') : header;
  const parts = raw.split(';');
  for (const part of parts) {
    const [key, ...vals] = part.trim().split('=');
    if (key) {
      cookies[key.trim()] = decodeURIComponent(vals.join('='));
    }
  }
  return cookies;
}

/**
 * Serializes an httpOnly, Secure, SameSite=Lax cookie header
 */
export function serializeCookie(
  name: string,
  value: string,
  maxAgeSeconds: number,
  isSecure = process.env.NODE_ENV === 'production'
): string {
  const secureFlag = isSecure ? '; Secure' : '';
  return `${name}=${encodeURIComponent(value)}; Max-Age=${maxAgeSeconds}; Path=/; HttpOnly; SameSite=Lax${secureFlag}`;
}

/**
 * Serializes an expired cookie header for clearing
 */
export function serializeClearCookie(name: string): string {
  return `${name}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`;
}

export { DEVICE_COOKIE_NAME, ADMIN_COOKIE_NAME };
