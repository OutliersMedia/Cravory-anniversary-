import { getDb } from './_lib/db.js';
import {
  verifyDeviceToken,
  verifyAdminToken,
  parseCookies,
  DEVICE_COOKIE_NAME,
  ADMIN_COOKIE_NAME,
} from './_lib/auth.js';
import {
  getSecureRandomFloat,
  getRandomMissSegment,
  generateCouponCode,
} from './_lib/crypto.js';
import {
  checkRateLimit,
  RATE_LIMITS,
} from './_lib/rate-limit.js';
import {
  SpinRequestSchema,
  SpinResponse,
} from './_lib/types.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // 1. Rate limiting
  const rateLimitResult = await checkRateLimit(req, RATE_LIMITS.spin);
  if (!rateLimitResult.allowed) {
    return res.status(429).json({ error: 'Please wait a moment before spinning again.' });
  }

  // 2. Validate request body
  const parseResult = SpinRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'Invalid spin request' });
  }

  const { requestId } = parseResult.data;

  // 3. Check for Admin Test Mode
  const cookies = parseCookies(req.headers?.cookie);
  const adminCookie = cookies[ADMIN_COOKIE_NAME];
  const isTestMode = adminCookie ? await verifyAdminToken(adminCookie) : false;

  // 4. Verify Player Device Token
  // Accept token from cookie or Authorization header
  let rawToken = cookies[DEVICE_COOKIE_NAME];
  if (!rawToken && req.headers?.authorization) {
    const authHeader = req.headers.authorization;
    if (authHeader.startsWith('Bearer ')) {
      rawToken = authHeader.substring(7).trim();
    }
  }

  const verified = rawToken ? await verifyDeviceToken(rawToken) : null;

  // If in test mode, allow dry run even without an active player
  if (isTestMode) {
    const testSegments = [0, 1, 2, 3, 4, 5, 6];
    const segmentIndex = testSegments[Math.floor(getSecureRandomFloat() * testSegments.length)];
    const isOffer = segmentIndex % 2 === 0;
    const offerSlot = isOffer ? (segmentIndex / 2) + 1 : undefined;

    const testResponse: SpinResponse = {
      segmentIndex,
      spinNo: 1,
      outcome: isOffer ? 'offer' : 'miss',
      offer: isOffer
        ? {
            slot: offerSlot!,
            title: `Offer ${offerSlot} (Test Mode)`,
            description: 'This is a dry-run test spin. No database records were modified.',
          }
        : undefined,
      coupon: isOffer
        ? {
            code: 'CRV-TEST-DEMO',
            expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
          }
        : undefined,
      finished: isOffer,
      isTestMode: true,
    };

    return res.status(200).json(testResponse);
  }

  if (!verified) {
    return res.status(401).json({ error: 'Unauthorized. Please refresh the page.' });
  }

  const db = getDb();

  // 5. Generate secure parameters in Node using crypto
  const pRand = getSecureRandomFloat();
  const pMissSegment = getRandomMissSegment();
  const pCouponCode = generateCouponCode();

  // 6. Execute atomic spin in Postgres
  const { data, error } = await db.rpc('perform_spin', {
    p_player_id: verified.playerId,
    p_request_id: requestId,
    p_rand: pRand,
    p_miss_segment: pMissSegment,
    p_coupon_code: pCouponCode,
  });

  if (error) {
    const msg = error.message || '';
    if (msg.includes('EVENT_NOT_STARTED')) {
      return res.status(403).json({ error: 'Opens on 1 November' });
    }
    if (msg.includes('EVENT_ENDED')) {
      return res.status(403).json({ error: 'This offer has ended' });
    }
    if (msg.includes('GAME_ALREADY_FINISHED') || msg.includes('MAX_SPINS_EXCEEDED')) {
      return res.status(403).json({ error: 'You have already played.' });
    }
    console.error('perform_spin database error:', error);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }

  return res.status(200).json(data as SpinResponse);
}
