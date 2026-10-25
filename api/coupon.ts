import { getDb } from './_lib/db.js';
import {
  verifyDeviceToken,
  parseCookies,
  DEVICE_COOKIE_NAME,
} from './_lib/auth.js';
import { CouponResponse } from './_lib/types.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const cookies = parseCookies(req.headers?.cookie);
  let rawToken = cookies[DEVICE_COOKIE_NAME];
  if (!rawToken && req.headers?.authorization) {
    const authHeader = req.headers.authorization;
    if (authHeader.startsWith('Bearer ')) {
      rawToken = authHeader.substring(7).trim();
    }
  }

  if (!rawToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const verified = await verifyDeviceToken(rawToken);
  if (!verified) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  const db = getDb();
  const { data: coupon, error } = await db
    .from('coupons')
    .select('code, offer_slot, offer_title, offer_description, expires_at, redeemed_at, created_at')
    .eq('player_id', verified.playerId)
    .maybeSingle();

  if (error || !coupon) {
    return res.status(404).json({ error: 'No coupon found for this device' });
  }

  const response: CouponResponse = {
    code: coupon.code,
    offerSlot: coupon.offer_slot,
    offerTitle: coupon.offer_title,
    offerDescription: coupon.offer_description,
    expiresAt: coupon.expires_at,
    redeemedAt: coupon.redeemed_at,
    createdAt: coupon.created_at,
  };

  return res.status(200).json(response);
}
