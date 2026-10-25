import { z } from 'zod';

// ==========================================
// Zod Schemas for Validation
// ==========================================

export const SessionRequestSchema = z.object({
  tokens: z.array(z.string().min(1)).optional().default([]),
  fingerprint: z.record(z.any()),
  turnstileToken: z.string().optional(),
});

export const SpinRequestSchema = z.object({
  requestId: z.string().uuid(),
});

export const AdminLoginSchema = z.object({
  password: z.string().min(1),
});

export const UpdateOffersSchema = z.object({
  betterLuckWeight: z.number().int().min(0).max(1000),
  offers: z.array(
    z.object({
      slot: z.number().int().min(1).max(4),
      title: z.string().min(1).max(255),
      description: z.string().min(1),
      weight: z.number().int().min(0).max(1000),
      totalStock: z.number().int().min(0),
      isActive: z.boolean(),
    })
  ).length(4),
});

export const UpdateSettingsSchema = z.object({
  startAt: z.string().datetime(),
  endAt: z.string().datetime().nullable().optional(),
  couponValidDays: z.number().int().min(1).max(365),
  strictDeviceMode: z.boolean(),
});

export const RedeemCouponSchema = z.object({
  code: z.string().min(1).max(32),
});

export const ApproveDeviceSchema = z.object({
  refCode: z.string().min(1).max(16),
});

// ==========================================
// TypeScript Interfaces
// ==========================================

export const CampaignActionSchema = z.object({
  action: z.enum(['start', 'pause', 'cancel']),
});

export type GamePhase = 'before_start' | 'open' | 'paused' | 'ended' | 'blocked' | 'played';

export interface PublicOfferSummary {
  slot: number;
  title: string;
}

export interface SessionResponse {
  phase: GamePhase;
  spinsUsed: number;
  maxSpins: number;
  lastSpin?: {
    segmentIndex: number;
    spinNo: number;
    outcome: 'offer' | 'miss';
    offerSlot?: number;
  };
  coupon?: {
    code: string;
    offerSlot?: number;
    offerTitle: string;
    offerDescription: string;
    expiresAt: string;
    redeemedAt?: string | null;
  };
  refCode?: string;
  offers: PublicOfferSummary[];
  isTestMode: boolean;
  token?: string;
}

export interface SpinResponse {
  segmentIndex: number;
  spinNo: number;
  outcome: 'offer' | 'miss';
  offer?: {
    slot: number;
    title: string;
    description: string;
  };
  coupon?: {
    code: string;
    expiresAt: string;
  };
  finished: boolean;
  isTestMode?: boolean;
}

export interface CouponResponse {
  code: string;
  offerSlot: number;
  offerTitle: string;
  offerDescription: string;
  expiresAt: string;
  redeemedAt: string | null;
  createdAt: string;
}
