import { getDb } from './_lib/db.js';
import {
  createDeviceToken,
  verifyDeviceToken,
  verifyAdminToken,
  parseCookies,
  serializeCookie,
  DEVICE_COOKIE_NAME,
  ADMIN_COOKIE_NAME,
} from './_lib/auth.js';
import {
  hashFingerprint,
  hashIp,
  generateRefCode,
} from './_lib/crypto.js';
import {
  checkRateLimit,
  getClientIp,
  RATE_LIMITS,
} from './_lib/rate-limit.js';
import {
  SessionRequestSchema,
  SessionResponse,
  PublicOfferSummary,
  GamePhase,
} from './_lib/types.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // 1. Rate limiting
  const rateLimitResult = await checkRateLimit(req, RATE_LIMITS.session);
  if (!rateLimitResult.allowed) {
    return res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
  }

  const rawIp = getClientIp(req);
  const ipHash = hashIp(rawIp);
  const cookies = parseCookies(req.headers?.cookie);
  const adminCookie = cookies[ADMIN_COOKIE_NAME];
  const isTestMode = adminCookie ? await verifyAdminToken(adminCookie) : false;

  // 2. Validate request body
  const parseResult = SessionRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'Invalid session payload' });
  }

  const { tokens: bodyTokens, fingerprint, turnstileToken } = parseResult.data;

  // 3. Optional Turnstile Verification
  if (process.env.TURNSTILE_SECRET) {
    if (!turnstileToken) {
      return res.status(403).json({ error: 'Bot verification required.' });
    }
    try {
      const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          secret: process.env.TURNSTILE_SECRET,
          response: turnstileToken,
          remoteip: rawIp,
        }),
      });
      const verifyData: any = await verifyRes.json();
      if (!verifyData.success) {
        return res.status(403).json({ error: 'Bot verification failed.' });
      }
    } catch (err) {
      console.warn('Turnstile check error:', err);
      return res.status(500).json({ error: 'Bot verification service unavailable.' });
    }
  }

  const db = getDb();

  // 4. Load system settings and active offers
  const [{ data: settingsData }, { data: offersData }] = await Promise.all([
    db.from('settings').select('*').eq('id', 1).single(),
    db.from('offers').select('slot, title').order('slot'),
  ]);

  const settings = settingsData || {
    start_at: '2026-10-31T18:30:00Z',
    end_at: null,
    strict_device_mode: true,
  };

  const publicOffers: PublicOfferSummary[] = (offersData || []).map((o: any) => ({
    slot: o.slot,
    title: o.title,
  }));

  // Helper to determine phase
  const now = new Date();
  const startTime = new Date(settings.start_at);
  const endTime = settings.end_at ? new Date(settings.end_at) : null;

  function calculatePhase(player: any): GamePhase {
    if (!isTestMode) {
      if ((settings as any).campaign_status === 'paused' || startTime.getFullYear() >= 2090) {
        return 'paused';
      }
      if ((settings as any).campaign_status === 'cancelled' || (endTime && now > endTime)) {
        return 'ended';
      }
      if (now < startTime) return 'before_start';
    }
    if (player.status === 'won' || player.status === 'lost' || player.spins_used >= 2) {
      return 'played';
    }
    return 'open';
  }

  // 5. Gather candidate tokens: cookie first, then localStorage & IndexedDB tokens
  const candidateTokens = [cookies[DEVICE_COOKIE_NAME], ...bodyTokens].filter(
    (t): t is string => typeof t === 'string' && t.trim().length > 0
  );

  let activePlayer: any = null;
  const verifiedPlayerIds: string[] = [];

  for (const token of candidateTokens) {
    const verified = await verifyDeviceToken(token);
    if (verified?.playerId && !verifiedPlayerIds.includes(verified.playerId)) {
      verifiedPlayerIds.push(verified.playerId);
    }
  }

  if (verifiedPlayerIds.length > 0) {
    // If multiple player IDs found, pick the one with the most spins used
    const { data: playersList } = await db
      .from('players')
      .select('*')
      .in('id', verifiedPlayerIds)
      .order('spins_used', { ascending: false });

    if (playersList && playersList.length > 0) {
      activePlayer = playersList[0];
      // Update last seen
      await db
        .from('players')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', activePlayer.id);
    }
  }

  // 6. If no valid player from token, check fingerprint
  const fpHash = hashFingerprint(fingerprint);

  if (!activePlayer) {
    // Check if there is an approved blocked attempt for this fingerprint
    const { data: approvedAttempt } = await db
      .from('blocked_attempts')
      .select('*')
      .eq('fp_hash', fpHash)
      .eq('approved', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (approvedAttempt) {
      // Counter staff approved this device: create an override player
      const { data: newOverridePlayer, error: createOverrideError } = await db
        .from('players')
        .insert({
          fp_hash: fpHash,
          ip_hash: ipHash,
          spins_used: 0,
          status: 'active',
          is_override: true,
        })
        .select('*')
        .single();

      if (createOverrideError || !newOverridePlayer) {
        return res.status(500).json({ error: 'Failed to initialize approved session.' });
      }

      activePlayer = newOverridePlayer;

      await db.from('events').insert({
        event_type: 'approved_session_created',
        player_id: activePlayer.id,
        ip_hash: ipHash,
        metadata: { ref_code: approvedAttempt.ref_code },
      });
    } else {
      // Check for an existing non-override player with the same fp_hash
      const { data: existingFpPlayer } = await db
        .from('players')
        .select('id, spins_used, status')
        .eq('fp_hash', fpHash)
        .eq('is_override', false)
        .limit(1)
        .maybeSingle();

      if (existingFpPlayer) {
        if (settings.strict_device_mode) {
          // Strict device mode: create or reuse blocked attempt
          let refCode = '';
          const { data: existingBlocked } = await db
            .from('blocked_attempts')
            .select('ref_code')
            .eq('fp_hash', fpHash)
            .eq('approved', false)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (existingBlocked) {
            refCode = existingBlocked.ref_code;
          } else {
            refCode = generateRefCode();
            await db.from('blocked_attempts').insert({
              ref_code: refCode,
              fp_hash: fpHash,
              ip_hash: ipHash,
              matched_player_id: existingFpPlayer.id,
              approved: false,
            });

            await db.from('events').insert({
              event_type: 'blocked_attempt',
              player_id: existingFpPlayer.id,
              ip_hash: ipHash,
              metadata: { ref_code: refCode },
            });
          }

          // NEVER reveal the other player's coupon or game state
          const blockedResponse: SessionResponse = {
            phase: 'blocked',
            spinsUsed: 0,
            maxSpins: 2,
            refCode,
            offers: publicOffers,
            isTestMode,
          };
          return res.status(200).json(blockedResponse);
        } else {
          // Strict device mode is OFF: log collision event and allow new player
          await db.from('events').insert({
            event_type: 'device_collision_allowed',
            ip_hash: ipHash,
            metadata: { matched_player_id: existingFpPlayer.id },
          });
        }
      }

      // No collision or strict mode off: create brand new player
      const { data: newPlayer, error: createError } = await db
        .from('players')
        .insert({
          fp_hash: fpHash,
          ip_hash: ipHash,
          spins_used: 0,
          status: 'active',
          is_override: false,
        })
        .select('*')
        .single();

      if (createError || !newPlayer) {
        return res.status(500).json({ error: 'Failed to create session.' });
      }

      activePlayer = newPlayer;

      await db.from('events').insert({
        event_type: 'session_created',
        player_id: activePlayer.id,
        ip_hash: ipHash,
      });
    }
  }

  // 7. Fetch player's last spin and coupon (if any)
  const [{ data: lastSpinData }, { data: couponData }] = await Promise.all([
    db
      .from('spins')
      .select('segment_index, spin_no, outcome, offer_slot')
      .eq('player_id', activePlayer.id)
      .order('spin_no', { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from('coupons')
      .select('code, offer_slot, offer_title, offer_description, expires_at, redeemed_at')
      .eq('player_id', activePlayer.id)
      .maybeSingle(),
  ]);

  // 8. Generate fresh signed device token (1 year)
  const deviceToken = await createDeviceToken(activePlayer.id);

  // Set httpOnly + Secure + SameSite=Lax cookie
  res.setHeader(
    'Set-Cookie',
    serializeCookie(DEVICE_COOKIE_NAME, deviceToken, 365 * 24 * 60 * 60)
  );

  const phase = calculatePhase(activePlayer);

  const responseBody: SessionResponse = {
    phase,
    spinsUsed: activePlayer.spins_used,
    maxSpins: 2,
    lastSpin: lastSpinData
      ? {
          segmentIndex: lastSpinData.segment_index,
          spinNo: lastSpinData.spin_no,
          outcome: lastSpinData.outcome,
          offerSlot: lastSpinData.offer_slot,
        }
      : undefined,
    coupon: couponData
      ? {
          code: couponData.code,
          offerSlot: couponData.offer_slot,
          offerTitle: couponData.offer_title,
          offerDescription: couponData.offer_description,
          expiresAt: couponData.expires_at,
          redeemedAt: couponData.redeemed_at,
        }
      : undefined,
    offers: publicOffers,
    isTestMode,
    token: deviceToken, // For syncing with localStorage and IndexedDB
  };

  return res.status(200).json(responseBody);
}
