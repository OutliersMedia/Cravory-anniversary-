import crypto from 'crypto';

// Custom charset without ambiguous characters 0, O, 1, I, L
const COUPON_CHARSET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/**
 * Generates a coupon code in the exact format CRV-XXXX-XXXX
 * Uses Node crypto randomBytes
 */
export function generateCouponCode(): string {
  const bytes = crypto.randomBytes(8);
  let part1 = '';
  let part2 = '';
  for (let i = 0; i < 4; i++) {
    part1 += COUPON_CHARSET[bytes[i] % COUPON_CHARSET.length];
    part2 += COUPON_CHARSET[bytes[i + 4] % COUPON_CHARSET.length];
  }
  return `CRV-${part1}-${part2}`;
}

/**
 * Generates a 6-character reference code for blocked device disputes
 */
export function generateRefCode(): string {
  const bytes = crypto.randomBytes(6);
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += COUPON_CHARSET[bytes[i] % COUPON_CHARSET.length];
  }
  return code;
}

/**
 * Computes SHA-256 hash of device fingerprint composite with server FP_SALT
 */
export function hashFingerprint(fingerprint: Record<string, any>, salt = process.env.FP_SALT || 'default-cravery-salt'): string {
  // Sort keys for deterministic JSON serialization
  const sortedKeys = Object.keys(fingerprint).sort();
  const normalized: Record<string, any> = {};
  for (const key of sortedKeys) {
    normalized[key] = fingerprint[key];
  }
  const payload = JSON.stringify(normalized) + ':' + salt;
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

/**
 * Computes SHA-256 hash of an IP address for privacy-preserving audit logs
 */
export function hashIp(ip: string): string {
  const salt = process.env.FP_SALT || 'default-ip-salt';
  return crypto.createHash('sha256').update(ip + ':' + salt, 'utf8').digest('hex');
}

/**
 * Cryptographically secure random float in range [0.0, 1.0)
 */
export function getSecureRandomFloat(): number {
  const max = 1000000000;
  const randInt = crypto.randomInt(0, max);
  return randInt / max;
}

/**
 * Cryptographically selects a miss segment: 1, 3, or 5
 */
export function getRandomMissSegment(): number {
  const options = [1, 3, 5];
  const idx = crypto.randomInt(0, options.length);
  return options[idx];
}

/**
 * Timing-safe string comparison
 */
export function timingSafeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    // Perform dummy comparison to mitigate length leaks
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}
