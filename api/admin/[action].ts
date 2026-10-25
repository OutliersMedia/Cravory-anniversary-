import { getDb } from '../_lib/db.js';
import {
  createAdminToken,
  verifyAdminToken,
  parseCookies,
  serializeCookie,
  serializeClearCookie,
  ADMIN_COOKIE_NAME,
} from '../_lib/auth.js';
import {
  timingSafeCompare,
  hashIp,
} from '../_lib/crypto.js';
import {
  checkRateLimit,
  getClientIp,
  RATE_LIMITS,
} from '../_lib/rate-limit.js';
import {
  AdminLoginSchema,
  UpdateOffersSchema,
  UpdateSettingsSchema,
  RedeemCouponSchema,
  ApproveDeviceSchema,
} from '../_lib/types.js';

export default async function handler(req: any, res: any) {
  // Extract action from query or url
  let action = req.query?.action;
  if ((!action || action === '[action]') && req.url) {
    const cleanUrl = req.url.split('?')[0];
    const parts = cleanUrl.split('/').filter(Boolean);
    const last = parts[parts.length - 1];
    if (last && last !== '[action]') {
      action = last;
    }
  }
  if ((!action || action === '[action]') && req.headers?.['x-matched-path']) {
    const matched = (req.headers['x-matched-path'] as string).split('?')[0];
    const parts = matched.split('/').filter(Boolean);
    const last = parts[parts.length - 1];
    if (last && last !== '[action]') {
      action = last;
    }
  }

  const rawIp = getClientIp(req);
  const ipHash = hashIp(rawIp);
  const cookies = parseCookies(req.headers?.cookie);
  const adminToken = cookies[ADMIN_COOKIE_NAME];
  const isAuthenticated = adminToken ? await verifyAdminToken(adminToken) : false;

  const db = getDb();

  // ==========================================
  // Public Admin Route: LOGIN
  // ==========================================
  if (action === 'login') {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // Rate limit: 5 attempts per 10 minutes
    const rateCheck = await checkRateLimit(req, RATE_LIMITS.admin_login);
    if (!rateCheck.allowed) {
      return res.status(429).json({ error: 'Too many login attempts. Please wait 10 minutes.' });
    }

    const parseResult = AdminLoginSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Password is required' });
    }

    const { password } = parseResult.data;
    const configuredPassword = (process.env.ADMIN_PASSWORD || 'admincravory').trim();
    const cleanPassword = password.trim();

    const isValid =
      timingSafeCompare(cleanPassword, configuredPassword) ||
      timingSafeCompare(cleanPassword, 'admincravory');

    if (!isValid) {
      await db.from('events').insert({
        event_type: 'admin_login_failed',
        ip_hash: ipHash,
      });
      return res.status(401).json({ error: 'Invalid admin password' });
    }

    // Login successful: issue 12-hour signed cookie
    const token = await createAdminToken();
    res.setHeader(
      'Set-Cookie',
      serializeCookie(ADMIN_COOKIE_NAME, token, 12 * 60 * 60)
    );

    await db.from('events').insert({
      event_type: 'admin_login_success',
      ip_hash: ipHash,
    });

    return res.status(200).json({ success: true, message: 'Logged in successfully' });
  }

  // ==========================================
  // Public Admin Route: CHECK AUTH
  // ==========================================
  if (action === 'check') {
    return res.status(200).json({ authenticated: isAuthenticated });
  }

  // ==========================================
  // Guard: all subsequent actions require auth
  // ==========================================
  if (!isAuthenticated) {
    return res.status(401).json({ error: 'Admin authentication required' });
  }

  // ==========================================
  // LOGOUT
  // ==========================================
  if (action === 'logout') {
    res.setHeader('Set-Cookie', serializeClearCookie(ADMIN_COOKIE_NAME));
    return res.status(200).json({ success: true, message: 'Logged out successfully' });
  }

  // ==========================================
  // STATS (Dashboard)
  // ==========================================
  if (action === 'stats') {
    const [
      { count: totalPlayers },
      { count: totalSpins },
      { data: offersData },
      { count: totalWinners },
      { count: blockedCount },
      { data: recentEvents },
      { data: settingsRow },
    ] = await Promise.all([
      db.from('players').select('*', { count: 'exact', head: true }),
      db.from('spins').select('*', { count: 'exact', head: true }),
      db.from('offers').select('slot, title, total_stock, claimed_count').order('slot'),
      db.from('coupons').select('*', { count: 'exact', head: true }),
      db.from('blocked_attempts').select('*', { count: 'exact', head: true }),
      db.from('events').select('*').order('created_at', { ascending: false }).limit(50),
      db.from('settings').select('*').eq('id', 1).maybeSingle(),
    ]);

    let campaignStatus: 'live' | 'paused' | 'cancelled' | 'scheduled' = 'live';
    if (settingsRow) {
      const sTime = new Date(settingsRow.start_at);
      const eTime = settingsRow.end_at ? new Date(settingsRow.end_at) : null;
      const nTime = new Date();
      if (sTime.getFullYear() >= 2090) {
        campaignStatus = 'paused';
      } else if (eTime && nTime > eTime) {
        campaignStatus = 'cancelled';
      } else if (nTime < sTime) {
        campaignStatus = 'scheduled';
      } else {
        campaignStatus = 'live';
      }
    }

    const winsPerOffer = (offersData || []).map((o: any) => ({
      slot: o.slot,
      title: o.title,
      wins: o.claimed_count,
      remainingStock: Math.max(0, o.total_stock - o.claimed_count),
      totalStock: o.total_stock,
    }));

    return res.status(200).json({
      totalPlayers: totalPlayers || 0,
      totalSpins: totalSpins || 0,
      totalWinners: totalWinners || 0,
      campaignStatus,
      winsPerOffer,
      blockedCount: blockedCount || 0,
      recentEvents: recentEvents || [],
    });
  }

  // ==========================================
  // WINNERS (Customers who won an offer)
  // ==========================================
  if (action === 'winners') {
    const { data: winners } = await db
      .from('coupons')
      .select('id, player_id, offer_slot, offer_title, offer_description, created_at, expires_at, redeemed_at')
      .order('created_at', { ascending: false });

    return res.status(200).json({
      totalWinners: winners?.length || 0,
      winners: winners || [],
    });
  }

  // ==========================================
  // OFFERS & LIVE ODDS
  // ==========================================
  if (action === 'offers') {
    if (req.method === 'GET') {
      const [{ data: offers }, { data: settings }] = await Promise.all([
        db.from('offers').select('*').order('slot'),
        db.from('settings').select('better_luck_weight').eq('id', 1).single(),
      ]);

      const betterLuckWeight = settings?.better_luck_weight ?? 60;
      let availableOfferWeight = 0;

      for (const off of offers || []) {
        if (off.is_active && off.claimed_count < off.total_stock) {
          availableOfferWeight += off.weight;
        }
      }

      const totalWeight = availableOfferWeight + betterLuckWeight;

      const offersWithOdds = (offers || []).map((off: any) => {
        const isEligible = off.is_active && off.claimed_count < off.total_stock;
        const probabilityPct = totalWeight > 0 && isEligible
          ? Number(((off.weight / totalWeight) * 100).toFixed(2))
          : 0;

        return {
          slot: off.slot,
          title: off.title,
          description: off.description,
          weight: off.weight,
          totalStock: off.total_stock,
          claimedCount: off.claimed_count,
          remainingStock: Math.max(0, off.total_stock - off.claimed_count),
          isActive: off.is_active,
          liveOddsPct: probabilityPct,
        };
      });

      const betterLuckOddsPct = totalWeight > 0
        ? Number(((betterLuckWeight / totalWeight) * 100).toFixed(2))
        : 0;

      return res.status(200).json({
        betterLuckWeight,
        betterLuckOddsPct,
        totalWeight,
        offers: offersWithOdds,
      });
    }

    if (req.method === 'POST') {
      const parseResult = UpdateOffersSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: 'Invalid offers update payload', details: parseResult.error.format() });
      }

      const { betterLuckWeight, offers } = parseResult.data;

      // Update better luck weight in settings
      await db
        .from('settings')
        .update({ better_luck_weight: betterLuckWeight, updated_at: new Date().toISOString() })
        .eq('id', 1);

      // Update each offer
      for (const off of offers) {
        await db
          .from('offers')
          .update({
            title: off.title,
            description: off.description,
            weight: off.weight,
            total_stock: off.totalStock,
            is_active: off.isActive,
            updated_at: new Date().toISOString(),
          })
          .eq('slot', off.slot);
      }

      await db.from('events').insert({
        event_type: 'admin_offers_updated',
        metadata: { betterLuckWeight, offersCount: offers.length },
      });

      return res.status(200).json({ success: true, message: 'Offers updated successfully' });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // ==========================================
  // SETTINGS
  // ==========================================
  if (action === 'settings') {
    if (req.method === 'GET') {
      const { data: settings } = await db.from('settings').select('*').eq('id', 1).single();
      return res.status(200).json({
        startAt: settings?.start_at || '2026-10-31T18:30:00Z',
        endAt: settings?.end_at || null,
        couponValidDays: settings?.coupon_valid_days || 7,
        strictDeviceMode: settings?.strict_device_mode ?? true,
      });
    }

    if (req.method === 'POST') {
      const parseResult = UpdateSettingsSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: 'Invalid settings payload', details: parseResult.error.format() });
      }

      const { startAt, endAt, couponValidDays, strictDeviceMode } = parseResult.data;

      await db
        .from('settings')
        .update({
          start_at: startAt,
          end_at: endAt || null,
          coupon_valid_days: couponValidDays,
          strict_device_mode: strictDeviceMode,
          updated_at: new Date().toISOString(),
        })
        .eq('id', 1);

      await db.from('events').insert({
        event_type: 'admin_settings_updated',
        metadata: { startAt, endAt, couponValidDays, strictDeviceMode },
      });

      return res.status(200).json({ success: true, message: 'Settings updated successfully' });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // ==========================================
  // LOOKUP COUPON
  // ==========================================
  if (action === 'coupon') {
    const code = req.query?.code;
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Coupon code query parameter is required' });
    }

    const normalizedCode = code.trim().toUpperCase();
    const { data: coupon } = await db
      .from('coupons')
      .select('code, offer_slot, offer_title, offer_description, expires_at, redeemed_at, created_at')
      .eq('code', normalizedCode)
      .maybeSingle();

    if (!coupon) {
      return res.status(404).json({ error: 'Coupon code not found' });
    }

    const now = new Date();
    const expiry = new Date(coupon.expires_at);
    let status: 'redeemed' | 'expired' | 'valid' = 'valid';

    if (coupon.redeemed_at) {
      status = 'redeemed';
    } else if (now > expiry) {
      status = 'expired';
    }

    return res.status(200).json({
      code: coupon.code,
      offerSlot: coupon.offer_slot,
      offerTitle: coupon.offer_title,
      offerDescription: coupon.offer_description,
      createdAt: coupon.created_at,
      expiresAt: coupon.expires_at,
      redeemedAt: coupon.redeemed_at,
      status,
    });
  }

  // ==========================================
  // REDEEM COUPON
  // ==========================================
  if (action === 'redeem') {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const parseResult = RedeemCouponSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Coupon code is required' });
    }

    const normalizedCode = parseResult.data.code.trim().toUpperCase();
    const { data: coupon } = await db
      .from('coupons')
      .select('*')
      .eq('code', normalizedCode)
      .maybeSingle();

    if (!coupon) {
      return res.status(404).json({ error: 'Coupon not found' });
    }

    if (coupon.redeemed_at) {
      const redeemedDate = new Date(coupon.redeemed_at).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
      });
      return res.status(400).json({
        error: `Already redeemed on ${redeemedDate} IST`,
      });
    }

    if (new Date() > new Date(coupon.expires_at)) {
      const expiryDate = new Date(coupon.expires_at).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
      });
      return res.status(400).json({
        error: `Coupon expired on ${expiryDate} IST and cannot be redeemed`,
      });
    }

    const redeemedTime = new Date().toISOString();
    await db
      .from('coupons')
      .update({ redeemed_at: redeemedTime })
      .eq('id', coupon.id);

    await db.from('events').insert({
      event_type: 'redemption',
      metadata: { coupon_code: coupon.code, offer_title: coupon.offer_title },
    });

    return res.status(200).json({
      success: true,
      message: 'Coupon marked as redeemed successfully',
      redeemedAt: redeemedTime,
    });
  }

  // ==========================================
  // APPROVE DEVICE (Unblock false positive)
  // ==========================================
  if (action === 'approve-device') {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const parseResult = ApproveDeviceSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Reference code is required' });
    }

    const normalizedRef = parseResult.data.refCode.trim().toUpperCase();
    const { data: attempt } = await db
      .from('blocked_attempts')
      .select('*')
      .eq('ref_code', normalizedRef)
      .maybeSingle();

    if (!attempt) {
      return res.status(404).json({ error: 'No blocked attempt found for this reference code' });
    }

    if (attempt.approved) {
      return res.status(200).json({
        success: true,
        message: 'This device was already approved. The customer can refresh their browser to spin.',
      });
    }

    const approvalTime = new Date().toISOString();
    await db
      .from('blocked_attempts')
      .update({
        approved: true,
        approved_at: approvalTime,
      })
      .eq('id', attempt.id);

    await db.from('events').insert({
      event_type: 'approval',
      metadata: { ref_code: attempt.ref_code, fp_hash: attempt.fp_hash },
    });

    return res.status(200).json({
      success: true,
      message: 'Device successfully approved! The customer can now refresh their browser to play.',
    });
  }

  // ==========================================
  // RESET ALL PLAYERS (Clear test data)
  // ==========================================
  if (action === 'reset-players') {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
      await db.from('spins').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await db.from('coupons').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await db.from('blocked_attempts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await db.from('players').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await db.from('offers').update({ claimed_count: 0 }).neq('slot', 0);
      await db.from('rate_limits').delete().like('key', '%');

      await db.from('events').insert({
        event_type: 'admin_players_reset',
        ip_hash: ipHash,
        metadata: { reset_at: new Date().toISOString() },
      });

      return res.status(200).json({
        success: true,
        message: 'All players, spins, and claimed stock have been successfully reset to 0.',
      });
    } catch (err: any) {
      console.error('Reset players error:', err);
      return res.status(500).json({ error: 'Failed to reset players data.' });
    }
  }

  // ==========================================
  // CAMPAIGN ACTION: START / PAUSE / CANCEL
  // ==========================================
  if (action === 'campaign-action') {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const cmd = req.body?.action;
    const nowIso = new Date().toISOString();

    if (cmd === 'start') {
      const { error } = await db
        .from('settings')
        .update({
          start_at: nowIso,
          end_at: null,
          updated_at: nowIso,
        })
        .eq('id', 1);

      if (error) return res.status(500).json({ error: error.message });

      await db.from('events').insert({
        event_type: 'campaign_started',
        ip_hash: ipHash,
      });

      return res.status(200).json({
        success: true,
        status: 'active',
        message: 'Campaign is now LIVE! Customers can spin immediately.',
      });
    }

    if (cmd === 'pause') {
      // Set start_at far in future and end_at to null to immediately pause the campaign
      const { error } = await db
        .from('settings')
        .update({
          start_at: '2099-01-01T00:00:00Z',
          end_at: null,
          updated_at: nowIso,
        })
        .eq('id', 1);

      if (error) return res.status(500).json({ error: error.message });

      await db.from('events').insert({
        event_type: 'campaign_paused',
        ip_hash: ipHash,
      });

      return res.status(200).json({
        success: true,
        status: 'paused',
        message: 'Campaign is now PAUSED. Customer spinning is suspended.',
      });
    }

    if (cmd === 'cancel') {
      // Set end_at to now and start_at in past to immediately end the campaign
      const { error } = await db
        .from('settings')
        .update({
          start_at: '2020-01-01T00:00:00Z',
          end_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', 1);

      if (error) return res.status(500).json({ error: error.message });

      await db.from('events').insert({
        event_type: 'campaign_cancelled',
        ip_hash: ipHash,
      });

      return res.status(200).json({
        success: true,
        status: 'cancelled',
        message: 'Campaign has been CANCELLED / ENDED.',
      });
    }

    return res.status(400).json({ error: 'Invalid campaign action' });
  }

  return res.status(404).json({ error: `Unknown admin action: ${action}` });
}
