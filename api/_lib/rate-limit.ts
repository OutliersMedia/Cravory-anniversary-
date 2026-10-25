import { getDb } from './db.js';
import { hashIp } from './crypto.js';

interface RateLimitConfig {
  action: 'session' | 'spin' | 'admin_login';
  limit: number;
  windowSeconds: number;
}

export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  session: { action: 'session', limit: 60, windowSeconds: 60 },       // 60 per 1 min
  spin: { action: 'spin', limit: 20, windowSeconds: 60 },             // 20 per 1 min
  admin_login: { action: 'admin_login', limit: 5, windowSeconds: 600 },// 5 per 10 min
};

/**
 * Extracts client IP from request headers (works on Vercel and local)
 */
export function getClientIp(req: any): string {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (forwarded) {
    const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return ips.split(',')[0].trim();
  }
  return req.headers?.['x-real-ip'] || req.socket?.remoteAddress || '127.0.0.1';
}

/**
 * Checks and increments rate limit in Supabase rate_limits table
 */
export async function checkRateLimit(
  req: any,
  config: RateLimitConfig
): Promise<{ allowed: boolean; remaining: number }> {
  try {
    const db = getDb();
    const rawIp = getClientIp(req);
    const ipHash = hashIp(rawIp);
    const windowMs = config.windowSeconds * 1000;
    const windowBucket = Math.floor(Date.now() / windowMs) * windowMs;
    const windowStart = new Date(windowBucket).toISOString();
    const key = `${config.action}:${ipHash}`;

    // Select existing count for current window
    const { data: existing, error: selectError } = await db
      .from('rate_limits')
      .select('id, count')
      .eq('key', key)
      .eq('window_start', windowStart)
      .maybeSingle();

    if (selectError && selectError.code !== 'PGRST116') {
      console.warn('Rate limit query warning:', selectError.message);
      // Soft-fail on DB read error so legitimate users are not blocked
      return { allowed: true, remaining: config.limit };
    }

    if (existing) {
      if (existing.count >= config.limit) {
        return { allowed: false, remaining: 0 };
      }

      await db
        .from('rate_limits')
        .update({ count: existing.count + 1 })
        .eq('id', existing.id);

      return { allowed: true, remaining: config.limit - (existing.count + 1) };
    } else {
      await db.from('rate_limits').insert({
        key,
        window_start: windowStart,
        count: 1,
      });

      return { allowed: true, remaining: config.limit - 1 };
    }
  } catch (err) {
    console.warn('Rate limit check exception:', err);
    // Soft-fail: never block users on infrastructure glitch
    return { allowed: true, remaining: 1 };
  }
}
