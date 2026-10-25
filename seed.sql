-- Cravery 1st Anniversary "Spin the Wheel" Seed Data

-- 1. Insert default settings
INSERT INTO settings (
  id,
  start_at,
  end_at,
  coupon_valid_days,
  strict_device_mode,
  better_luck_weight
) VALUES (
  1,
  '2026-10-31T18:30:00Z', -- 1 Nov 2026, 00:00:00 IST
  NULL,
  7,
  TRUE,
  60
)
ON CONFLICT (id) DO UPDATE SET
  start_at = EXCLUDED.start_at,
  coupon_valid_days = EXCLUDED.coupon_valid_days,
  strict_device_mode = EXCLUDED.strict_device_mode,
  better_luck_weight = EXCLUDED.better_luck_weight;

-- 2. Insert default 4 placeholder offers
INSERT INTO offers (
  slot,
  title,
  description,
  weight,
  total_stock,
  claimed_count,
  is_active
) VALUES
  (1, 'Offer 1', 'Complimentary signature cookie with any order.', 10, 50, 0, TRUE),
  (2, 'Offer 2', 'Flat 20% off on your total celebration bill.', 10, 50, 0, TRUE),
  (3, 'Offer 3', 'Buy 1 Get 1 free on all freshly baked cupcakes.', 10, 50, 0, TRUE),
  (4, 'Offer 4', 'Free handcrafted beverage with any dessert purchase.', 10, 50, 0, TRUE)
ON CONFLICT (slot) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  weight = EXCLUDED.weight,
  total_stock = EXCLUDED.total_stock,
  is_active = EXCLUDED.is_active;
