-- Cravery 1st Anniversary "Spin the Wheel" Database Schema
-- Supabase Postgres

-- 1. Settings table (single-row table)
CREATE TABLE IF NOT EXISTS settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  start_at TIMESTAMPTZ NOT NULL DEFAULT '2026-10-31T18:30:00Z', -- 1 Nov 2026, 00:00 IST
  end_at TIMESTAMPTZ,
  coupon_valid_days INT NOT NULL DEFAULT 7 CHECK (coupon_valid_days > 0),
  strict_device_mode BOOLEAN NOT NULL DEFAULT TRUE,
  better_luck_weight INT NOT NULL DEFAULT 60 CHECK (better_luck_weight >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Offers table (slots 1 to 4)
CREATE TABLE IF NOT EXISTS offers (
  slot INT PRIMARY KEY CHECK (slot BETWEEN 1 AND 4),
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  weight INT NOT NULL DEFAULT 10 CHECK (weight >= 0),
  total_stock INT NOT NULL DEFAULT 50 CHECK (total_stock >= 0),
  claimed_count INT NOT NULL DEFAULT 0 CHECK (claimed_count >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Players table
CREATE TABLE IF NOT EXISTS players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fp_hash VARCHAR(64) NOT NULL,
  ip_hash VARCHAR(64),
  spins_used INT NOT NULL DEFAULT 0 CHECK (spins_used >= 0 AND spins_used <= 2),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'won', 'lost')),
  is_override BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_players_fp_hash ON players(fp_hash);
CREATE INDEX IF NOT EXISTS idx_players_created_at ON players(created_at);

-- 4. Spins table
CREATE TABLE IF NOT EXISTS spins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  spin_no INT NOT NULL CHECK (spin_no IN (1, 2)),
  request_id UUID NOT NULL,
  segment_index INT NOT NULL CHECK (segment_index BETWEEN 0 AND 6),
  outcome VARCHAR(20) NOT NULL CHECK (outcome IN ('offer', 'miss')),
  offer_slot INT REFERENCES offers(slot),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_player_spin_no UNIQUE (player_id, spin_no),
  CONSTRAINT uq_player_request_id UNIQUE (player_id, request_id)
);

CREATE INDEX IF NOT EXISTS idx_spins_player_id ON spins(player_id);

-- 5. Coupons table
CREATE TABLE IF NOT EXISTS coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(32) NOT NULL UNIQUE,
  player_id UUID NOT NULL UNIQUE REFERENCES players(id) ON DELETE CASCADE,
  offer_slot INT NOT NULL REFERENCES offers(slot),
  offer_title VARCHAR(255) NOT NULL,
  offer_description TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  redeemed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupons_player_id ON coupons(player_id);

-- 6. Blocked attempts table
CREATE TABLE IF NOT EXISTS blocked_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_code VARCHAR(16) NOT NULL UNIQUE,
  fp_hash VARCHAR(64) NOT NULL,
  ip_hash VARCHAR(64),
  matched_player_id UUID REFERENCES players(id) ON DELETE SET NULL,
  approved BOOLEAN NOT NULL DEFAULT FALSE,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blocked_attempts_ref_code ON blocked_attempts(ref_code);
CREATE INDEX IF NOT EXISTS idx_blocked_attempts_fp_hash ON blocked_attempts(fp_hash);

-- 7. Audit log / Events table
CREATE TABLE IF NOT EXISTS events (
  id BIGSERIAL PRIMARY KEY,
  event_type VARCHAR(64) NOT NULL,
  player_id UUID REFERENCES players(id) ON DELETE SET NULL,
  ip_hash VARCHAR(64),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_event_type ON events(event_type);

-- 8. Rate limits table
CREATE TABLE IF NOT EXISTS rate_limits (
  id BIGSERIAL PRIMARY KEY,
  key VARCHAR(128) NOT NULL,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  count INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_key_window ON rate_limits(key, window_start);

-- =========================================================================
-- Enable Row Level Security (RLS) on all tables with NO public policies
-- All access is restricted to the Supabase Service Role key (Serverless API)
-- =========================================================================
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE spins ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- Atomic Spin Postgres Function: perform_spin
-- =========================================================================
CREATE OR REPLACE FUNCTION perform_spin(
  p_player_id UUID,
  p_request_id UUID,
  p_rand DOUBLE PRECISION,
  p_miss_segment INT,
  p_coupon_code TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_player RECORD;
  v_settings RECORD;
  v_existing_spin RECORD;
  v_offer RECORD;
  v_chosen_offer RECORD;
  v_total_weight INT := 0;
  v_offer_weight_sum INT := 0;
  v_scaled_rand DOUBLE PRECISION;
  v_running_weight INT := 0;
  v_is_win BOOLEAN := FALSE;
  v_spin_no INT;
  v_segment_index INT;
  v_outcome VARCHAR(20);
  v_chosen_slot INT := NULL;
  v_chosen_title VARCHAR(255) := NULL;
  v_chosen_desc TEXT := NULL;
  v_final_coupon_code VARCHAR(32);
  v_expires_at TIMESTAMPTZ;
  v_finished BOOLEAN;
  v_miss_seg INT;
BEGIN
  -- 1. Check for idempotency: if request_id for this player already recorded
  SELECT s.*, c.code AS coupon_code, c.expires_at AS coupon_expires_at,
         c.offer_title AS coupon_offer_title, c.offer_description AS coupon_offer_desc
  INTO v_existing_spin
  FROM spins s
  LEFT JOIN coupons c ON c.player_id = s.player_id
  WHERE s.player_id = p_player_id AND s.request_id = p_request_id;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'segmentIndex', v_existing_spin.segment_index,
      'spinNo', v_existing_spin.spin_no,
      'outcome', v_existing_spin.outcome,
      'offer', CASE WHEN v_existing_spin.offer_slot IS NOT NULL THEN jsonb_build_object(
        'slot', v_existing_spin.offer_slot,
        'title', COALESCE(v_existing_spin.coupon_offer_title, 'Cravery Offer'),
        'description', COALESCE(v_existing_spin.coupon_offer_desc, '')
      ) ELSE NULL END,
      'coupon', CASE WHEN v_existing_spin.coupon_code IS NOT NULL THEN jsonb_build_object(
        'code', v_existing_spin.coupon_code,
        'expiresAt', v_existing_spin.coupon_expires_at
      ) ELSE NULL END,
      'finished', (v_existing_spin.outcome = 'offer' OR v_existing_spin.spin_no >= 2)
    );
  END IF;

  -- 2. Lock player row FOR UPDATE
  SELECT * INTO v_player
  FROM players
  WHERE id = p_player_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PLAYER_NOT_FOUND';
  END IF;

  IF v_player.status <> 'active' THEN
    RAISE EXCEPTION 'GAME_ALREADY_FINISHED';
  END IF;

  IF v_player.spins_used >= 2 THEN
    RAISE EXCEPTION 'MAX_SPINS_EXCEEDED';
  END IF;

  -- 3. Check event window against DB now()
  SELECT * INTO v_settings FROM settings WHERE id = 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SETTINGS_NOT_CONFIGURED';
  END IF;

  IF now() < v_settings.start_at THEN
    RAISE EXCEPTION 'EVENT_NOT_STARTED';
  END IF;

  IF v_settings.end_at IS NOT NULL AND now() > v_settings.end_at THEN
    RAISE EXCEPTION 'EVENT_ENDED';
  END IF;

  -- Validate miss segment (must be 1, 3, or 5)
  IF p_miss_segment IN (1, 3, 5) THEN
    v_miss_seg := p_miss_segment;
  ELSE
    v_miss_seg := 1;
  END IF;

  -- 4. Lock available offers FOR UPDATE
  -- Sum active, in-stock offer weights
  FOR v_offer IN
    SELECT slot, title, description, weight, total_stock, claimed_count
    FROM offers
    WHERE is_active = TRUE AND claimed_count < total_stock
    ORDER BY slot
    FOR UPDATE
  LOOP
    v_offer_weight_sum := v_offer_weight_sum + v_offer.weight;
  END LOOP;

  v_total_weight := v_offer_weight_sum + v_settings.better_luck_weight;

  -- 5. Determine outcome using p_rand [0.0, 1.0)
  IF v_total_weight > 0 AND v_offer_weight_sum > 0 THEN
    v_scaled_rand := (GREATEST(0.0, LEAST(0.99999999, p_rand))) * v_total_weight;

    -- Offers partition: [0, v_offer_weight_sum)
    -- Better luck partition: [v_offer_weight_sum, v_total_weight)
    IF v_scaled_rand < v_offer_weight_sum THEN
      v_running_weight := 0;
      FOR v_offer IN
        SELECT slot, title, description, weight
        FROM offers
        WHERE is_active = TRUE AND claimed_count < total_stock
        ORDER BY slot
      LOOP
        v_running_weight := v_running_weight + v_offer.weight;
        IF v_scaled_rand < v_running_weight THEN
          v_is_win := TRUE;
          v_chosen_slot := v_offer.slot;
          v_chosen_title := v_offer.title;
          v_chosen_desc := v_offer.description;
          EXIT;
        END IF;
      END LOOP;
    END IF;
  END IF;

  v_spin_no := v_player.spins_used + 1;

  -- 6. Process Win vs Miss
  IF v_is_win THEN
    v_outcome := 'offer';
    -- Map slot (1..4) to wheel slice index (0, 2, 4, 6)
    v_segment_index := (v_chosen_slot - 1) * 2;
    v_finished := TRUE;

    -- Decrement stock / increment claimed count
    UPDATE offers
    SET claimed_count = claimed_count + 1,
        updated_at = now()
    WHERE slot = v_chosen_slot;

    -- Expiry date
    v_expires_at := now() + (v_settings.coupon_valid_days || ' days')::interval;

    -- Generate coupon code if not provided
    IF p_coupon_code IS NOT NULL AND length(trim(p_coupon_code)) > 0 THEN
      v_final_coupon_code := trim(p_coupon_code);
    ELSE
      v_final_coupon_code := 'CRV-' || upper(substr(md5(random()::text), 1, 4)) || '-' || upper(substr(md5(random()::text), 5, 4));
    END IF;

    -- Create snapshot coupon
    INSERT INTO coupons (
      code,
      player_id,
      offer_slot,
      offer_title,
      offer_description,
      expires_at
    ) VALUES (
      v_final_coupon_code,
      p_player_id,
      v_chosen_slot,
      v_chosen_title,
      v_chosen_desc,
      v_expires_at
    );

    -- Update player
    UPDATE players
    SET spins_used = v_spin_no,
        status = 'won',
        last_seen_at = now()
    WHERE id = p_player_id;

  ELSE
    -- Miss
    v_outcome := 'miss';
    v_segment_index := v_miss_seg;

    IF v_spin_no = 1 THEN
      v_finished := FALSE;
      UPDATE players
      SET spins_used = 1,
          status = 'active',
          last_seen_at = now()
      WHERE id = p_player_id;
    ELSE
      v_finished := TRUE;
      UPDATE players
      SET spins_used = 2,
          status = 'lost',
          last_seen_at = now()
      WHERE id = p_player_id;
    END IF;
  END IF;

  -- 7. Insert spin record
  INSERT INTO spins (
    player_id,
    spin_no,
    request_id,
    segment_index,
    outcome,
    offer_slot
  ) VALUES (
    p_player_id,
    v_spin_no,
    p_request_id,
    v_segment_index,
    v_outcome,
    v_chosen_slot
  );

  -- 8. Insert audit event
  INSERT INTO events (
    event_type,
    player_id,
    metadata
  ) VALUES (
    'spin',
    p_player_id,
    jsonb_build_object(
      'spin_no', v_spin_no,
      'outcome', v_outcome,
      'segment_index', v_segment_index,
      'offer_slot', v_chosen_slot
    )
  );

  -- 9. Return JSON response
  RETURN jsonb_build_object(
    'segmentIndex', v_segment_index,
    'spinNo', v_spin_no,
    'outcome', v_outcome,
    'offer', CASE WHEN v_chosen_slot IS NOT NULL THEN jsonb_build_object(
      'slot', v_chosen_slot,
      'title', v_chosen_title,
      'description', v_chosen_desc
    ) ELSE NULL END,
    'coupon', CASE WHEN v_final_coupon_code IS NOT NULL THEN jsonb_build_object(
      'code', v_final_coupon_code,
      'expiresAt', v_expires_at
    ) ELSE NULL END,
    'finished', v_finished
  );
END;
$$;
