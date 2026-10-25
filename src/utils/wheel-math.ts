export interface WheelSlice {
  index: number;
  label: string;
  startAngle: number;
  endAngle: number;
  width: number;
  isOffer: boolean;
  offerSlot?: number;
  bgColor: string;
  textColor: string;
  borderColor?: string;
}

export const WHEEL_SLICES: WheelSlice[] = [
  {
    index: 0,
    label: 'Offer 1',
    startAngle: 0,
    endAngle: 54,
    width: 54,
    isOffer: true,
    offerSlot: 1,
    bgColor: '#FF4FA3', // Pink
    textColor: '#FFFFFF', // White
  },
  {
    index: 1,
    label: 'Better luck next time',
    startAngle: 54,
    endAngle: 102,
    width: 48,
    isOffer: false,
    bgColor: '#FFFFFF', // White
    textColor: '#2B1B2E', // Ink
    borderColor: '#FF4FA3',
  },
  {
    index: 2,
    label: 'Offer 2',
    startAngle: 102,
    endAngle: 156,
    width: 54,
    isOffer: true,
    offerSlot: 2,
    bgColor: '#22D3EE', // Cyan
    textColor: '#2B1B2E', // Ink
  },
  {
    index: 3,
    label: 'Better luck next time',
    startAngle: 156,
    endAngle: 204,
    width: 48,
    isOffer: false,
    bgColor: '#FFFFFF', // White
    textColor: '#2B1B2E', // Ink
    borderColor: '#FF4FA3',
  },
  {
    index: 4,
    label: 'Offer 3',
    startAngle: 204,
    endAngle: 258,
    width: 54,
    isOffer: true,
    offerSlot: 3,
    bgColor: '#FF4FA3', // Pink
    textColor: '#FFFFFF', // White
  },
  {
    index: 5,
    label: 'Better luck next time',
    startAngle: 258,
    endAngle: 306,
    width: 48,
    isOffer: false,
    bgColor: '#FFFFFF', // White
    textColor: '#2B1B2E', // Ink
    borderColor: '#FF4FA3',
  },
  {
    index: 6,
    label: 'Offer 4',
    startAngle: 306,
    endAngle: 360,
    width: 54,
    isOffer: true,
    offerSlot: 4,
    bgColor: '#22D3EE', // Cyan
    textColor: '#2B1B2E', // Ink
  },
];

/**
 * Quartic ease-out function: 1 - (1 - p)^4
 */
export function easeOutQuart(p: number): number {
  const clamped = Math.max(0, Math.min(1, p));
  return 1 - Math.pow(1 - clamped, 4);
}

/**
 * Calculates the exact rotation required to land on a segmentIndex.
 * Pointer is fixed at top (0 deg). Rotation is clockwise.
 *
 * @param segmentIndex Target segment (0..6)
 * @param currentRotation Current total rotation in degrees
 * @param randomOffset Ratio [0, 1] within the 6 deg safe margins
 */
export function calculateSpinRotation(
  segmentIndex: number,
  currentRotation: number,
  randomOffset: number = 0.5
): {
  targetAngle: number;
  totalRotation: number;
  finalRotation: number;
} {
  const slice = WHEEL_SLICES[segmentIndex];
  if (!slice) {
    throw new Error(`Invalid segment index: ${segmentIndex}`);
  }

  // Safe inner span: stays 6° away from edges
  const safeMargin = 6;
  const safeSpan = slice.width - safeMargin * 2;
  const clampedOffset = Math.max(0, Math.min(1, randomOffset));
  const targetAngle = slice.startAngle + safeMargin + clampedOffset * safeSpan;

  // Since pointer is at 0 deg, slice angle targetAngle aligns with pointer when wheel rotation mod 360 = (360 - targetAngle) % 360
  const desiredMod = (360 - (targetAngle % 360)) % 360;
  const currentMod = ((currentRotation % 360) + 360) % 360;
  const delta = ((desiredMod - currentMod) + 360) % 360;

  // Exactly 6 full rotations (6 * 360 = 2160°) + delta
  const totalRotation = 6 * 360 + delta;
  const finalRotation = currentRotation + totalRotation;

  return { targetAngle, totalRotation, finalRotation };
}

/**
 * Given a total rotation, computes the angle currently under the top pointer (0..360)
 */
export function getAngleUnderPointer(rotation: number): number {
  const mod = ((rotation % 360) + 360) % 360;
  return (360 - mod) % 360;
}

/**
 * Finds which slice contains the given angle
 */
export function getSliceIndexForAngle(angle: number): number {
  const normalized = ((angle % 360) + 360) % 360;
  for (const slice of WHEEL_SLICES) {
    if (normalized >= slice.startAngle && normalized < slice.endAngle) {
      return slice.index;
    }
  }
  return 0; // Wrap fallback
}

/**
 * Calculates rotation at rest for an initial slice index (e.g. on page reload)
 */
export function getInitialRotationForSlice(segmentIndex: number): number {
  const slice = WHEEL_SLICES[segmentIndex];
  if (!slice) return 0;
  const midAngle = slice.startAngle + slice.width / 2;
  return (360 - (midAngle % 360)) % 360;
}
