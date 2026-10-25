import { describe, it, expect } from 'vitest';

interface TestOffer {
  slot: number;
  weight: number;
  totalStock: number;
  claimedCount: number;
  isActive: boolean;
}

/**
 * Pure TypeScript representation of perform_spin Postgres outcome algorithm
 */
function pickOutcome(
  offers: TestOffer[],
  betterLuckWeight: number,
  randFloat: number
): { outcome: 'offer' | 'miss'; chosenSlot?: number } {
  const availableOffers = offers.filter(
    (o) => o.isActive && o.claimedCount < o.totalStock
  );

  const offerWeightSum = availableOffers.reduce((sum, o) => sum + o.weight, 0);
  const totalWeight = offerWeightSum + betterLuckWeight;

  if (totalWeight <= 0 || offerWeightSum <= 0) {
    return { outcome: 'miss' };
  }

  const clampedRand = Math.max(0, Math.min(0.99999999, randFloat));
  const scaled = clampedRand * totalWeight;

  if (scaled < offerWeightSum) {
    let running = 0;
    for (const off of availableOffers) {
      running += off.weight;
      if (scaled < running) {
        return { outcome: 'offer', chosenSlot: off.slot };
      }
    }
  }

  return { outcome: 'miss' };
}

describe('Weighted Outcome Picker Math', () => {
  const defaultOffers: TestOffer[] = [
    { slot: 1, weight: 10, totalStock: 50, claimedCount: 0, isActive: true },
    { slot: 2, weight: 10, totalStock: 50, claimedCount: 0, isActive: true },
    { slot: 3, weight: 10, totalStock: 50, claimedCount: 0, isActive: true },
    { slot: 4, weight: 10, totalStock: 50, claimedCount: 0, isActive: true },
  ];
  const betterLuckWeight = 60;

  it('correctly picks outcomes based on default 40% win / 60% miss weights', () => {
    // 0.05 falls in [0, 10) -> Slot 1
    expect(pickOutcome(defaultOffers, betterLuckWeight, 0.05)).toEqual({
      outcome: 'offer',
      chosenSlot: 1,
    });

    // 0.15 falls in [10, 20) -> Slot 2
    expect(pickOutcome(defaultOffers, betterLuckWeight, 0.15)).toEqual({
      outcome: 'offer',
      chosenSlot: 2,
    });

    // 0.25 falls in [20, 30) -> Slot 3
    expect(pickOutcome(defaultOffers, betterLuckWeight, 0.25)).toEqual({
      outcome: 'offer',
      chosenSlot: 3,
    });

    // 0.35 falls in [30, 40) -> Slot 4
    expect(pickOutcome(defaultOffers, betterLuckWeight, 0.35)).toEqual({
      outcome: 'offer',
      chosenSlot: 4,
    });

    // 0.40+ falls in [40, 100) -> Miss
    expect(pickOutcome(defaultOffers, betterLuckWeight, 0.40)).toEqual({
      outcome: 'miss',
    });
    expect(pickOutcome(defaultOffers, betterLuckWeight, 0.75)).toEqual({
      outcome: 'miss',
    });
    expect(pickOutcome(defaultOffers, betterLuckWeight, 0.99)).toEqual({
      outcome: 'miss',
    });
  });

  it('never returns an offer that is out of stock', () => {
    // Slot 1 is exhausted (50 claimed out of 50)
    const exhaustedOffers: TestOffer[] = [
      { slot: 1, weight: 10, totalStock: 50, claimedCount: 50, isActive: true },
      { slot: 2, weight: 10, totalStock: 50, claimedCount: 0, isActive: true },
      { slot: 3, weight: 10, totalStock: 50, claimedCount: 0, isActive: true },
      { slot: 4, weight: 10, totalStock: 50, claimedCount: 0, isActive: true },
    ];

    // Total weight: 30 (offers) + 60 (miss) = 90
    // Test 1000 random samples across [0, 1)
    for (let i = 0; i < 1000; i++) {
      const rand = i / 1000;
      const res = pickOutcome(exhaustedOffers, betterLuckWeight, rand);
      expect(res.chosenSlot).not.toBe(1);
    }
  });

  it('never returns an inactive offer', () => {
    const inactiveOffers: TestOffer[] = [
      { slot: 1, weight: 10, totalStock: 50, claimedCount: 0, isActive: false },
      { slot: 2, weight: 10, totalStock: 50, claimedCount: 0, isActive: true },
      { slot: 3, weight: 10, totalStock: 50, claimedCount: 0, isActive: true },
      { slot: 4, weight: 10, totalStock: 50, claimedCount: 0, isActive: true },
    ];

    for (let i = 0; i < 1000; i++) {
      const rand = i / 1000;
      const res = pickOutcome(inactiveOffers, betterLuckWeight, rand);
      expect(res.chosenSlot).not.toBe(1);
    }
  });
});
