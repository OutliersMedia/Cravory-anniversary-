import { describe, it, expect } from 'vitest';
import {
  WHEEL_SLICES,
  easeOutQuart,
  calculateSpinRotation,
  getAngleUnderPointer,
  getSliceIndexForAngle,
} from '../utils/wheel-math.js';

describe('Wheel Geometry & Slices', () => {
  it('has exactly 7 slices totaling 360 degrees in the exact order', () => {
    expect(WHEEL_SLICES).toHaveLength(7);

    const totalDegrees = WHEEL_SLICES.reduce((sum, s) => sum + s.width, 0);
    expect(totalDegrees).toBe(360);

    // Verify exact sequence
    expect(WHEEL_SLICES[0].label).toBe('Offer 1');
    expect(WHEEL_SLICES[0].startAngle).toBe(0);
    expect(WHEEL_SLICES[0].endAngle).toBe(54);
    expect(WHEEL_SLICES[0].width).toBe(54);

    expect(WHEEL_SLICES[1].label).toBe('Better luck next time');
    expect(WHEEL_SLICES[1].startAngle).toBe(54);
    expect(WHEEL_SLICES[1].endAngle).toBe(102);
    expect(WHEEL_SLICES[1].width).toBe(48);

    expect(WHEEL_SLICES[2].label).toBe('Offer 2');
    expect(WHEEL_SLICES[2].startAngle).toBe(102);
    expect(WHEEL_SLICES[2].endAngle).toBe(156);
    expect(WHEEL_SLICES[2].width).toBe(54);

    expect(WHEEL_SLICES[3].label).toBe('Better luck next time');
    expect(WHEEL_SLICES[3].startAngle).toBe(156);
    expect(WHEEL_SLICES[3].endAngle).toBe(204);
    expect(WHEEL_SLICES[3].width).toBe(48);

    expect(WHEEL_SLICES[4].label).toBe('Offer 3');
    expect(WHEEL_SLICES[4].startAngle).toBe(204);
    expect(WHEEL_SLICES[4].endAngle).toBe(258);
    expect(WHEEL_SLICES[4].width).toBe(54);

    expect(WHEEL_SLICES[5].label).toBe('Better luck next time');
    expect(WHEEL_SLICES[5].startAngle).toBe(258);
    expect(WHEEL_SLICES[5].endAngle).toBe(306);
    expect(WHEEL_SLICES[5].width).toBe(48);

    expect(WHEEL_SLICES[6].label).toBe('Offer 4');
    expect(WHEEL_SLICES[6].startAngle).toBe(306);
    expect(WHEEL_SLICES[6].endAngle).toBe(360);
    expect(WHEEL_SLICES[6].width).toBe(54);
  });
});

describe('Wheel Physics & Landing Math', () => {
  it('easeOutQuart smoothly maps [0, 1] to [0, 1]', () => {
    expect(easeOutQuart(0)).toBe(0);
    expect(easeOutQuart(1)).toBe(1);
    expect(easeOutQuart(0.5)).toBeGreaterThan(0.5); // Fast early deceleration
    expect(easeOutQuart(0.5)).toBeCloseTo(0.9375, 4);
  });

  it('accurately lands on each segmentIndex from any starting rotation', () => {
    for (let segmentIndex = 0; segmentIndex < 7; segmentIndex++) {
      const slice = WHEEL_SLICES[segmentIndex];

      // Test with multiple start rotations and multiple random offsets
      for (const startRotation of [0, 45, 120, 270, 720, 1530]) {
        for (const randomOffset of [0, 0.25, 0.5, 0.75, 1]) {
          const { targetAngle, totalRotation, finalRotation } = calculateSpinRotation(
            segmentIndex,
            startRotation,
            randomOffset
          );

          // Must rotate at least 6 full circles (6 * 360 = 2160°)
          expect(totalRotation).toBeGreaterThanOrEqual(2160);
          expect(totalRotation).toBeLessThan(2160 + 360);

          // Target angle must stay at least 6° away from slice edges
          expect(targetAngle).toBeGreaterThanOrEqual(slice.startAngle + 6);
          expect(targetAngle).toBeLessThanOrEqual(slice.endAngle - 6);

          // Angle under the pointer after finalRotation must match targetAngle
          const angleUnderPointer = getAngleUnderPointer(finalRotation);
          expect(Math.abs(angleUnderPointer - (targetAngle % 360))).toBeLessThan(0.001);

          // Must correctly identify slice index under pointer
          const detectedSlice = getSliceIndexForAngle(angleUnderPointer);
          expect(detectedSlice).toBe(segmentIndex);
        }
      }
    }
  });
});
