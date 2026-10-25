import React, { useEffect, useRef, useState } from 'react';
import {
  WHEEL_SLICES,
  WheelSlice,
  easeOutQuart,
  calculateSpinRotation,
  getAngleUnderPointer,
  getSliceIndexForAngle,
  getInitialRotationForSlice,
} from '../utils/wheel-math.js';
import { PublicOfferSummary } from '../../api/_lib/types.js';

interface WheelProps {
  targetSegment: number | null;
  isSpinning: boolean;
  initialSegment?: number | null;
  offers?: PublicOfferSummary[];
  onSpinComplete: () => void;
}

const CENTER_X = 250;
const CENTER_Y = 250;
const RADIUS = 236;

export const Wheel: React.FC<WheelProps> = ({
  targetSegment,
  isSpinning,
  initialSegment,
  offers,
  onSpinComplete,
}) => {
  const currentRotationRef = useRef<number>(
    initialSegment !== undefined && initialSegment !== null
      ? getInitialRotationForSlice(initialSegment)
      : 0
  );
  const [displayRotation, setDisplayRotation] = useState<number>(currentRotationRef.current);
  const [isPointerTicking, setIsPointerTicking] = useState(false);
  const lastSliceRef = useRef<number>(getSliceIndexForAngle(getAngleUnderPointer(currentRotationRef.current)));
  const animFrameIdRef = useRef<number | null>(null);
  const tickTimeoutRef = useRef<any>(null);

  // Dynamic titles mapping
  const getSliceTitle = (slice: WheelSlice): string => {
    if (!slice.isOffer) {
      return 'Better luck next time';
    }
    if (offers && slice.offerSlot) {
      const match = offers.find((o) => o.slot === slice.offerSlot);
      if (match && match.title) {
        return match.title.length > 22 ? `${match.title.substring(0, 21)}…` : match.title;
      }
    }
    return slice.label;
  };

  // Convert polar coordinates (angle from 12 o'clock) to cartesian
  const polarToCartesian = (cx: number, cy: number, r: number, angleDeg: number) => {
    const rad = ((angleDeg - 90) * Math.PI) / 180.0;
    return {
      x: cx + r * Math.cos(rad),
      y: cy + r * Math.sin(rad),
    };
  };

  // Generate SVG path for an arc wedge
  const describeArc = (startAngle: number, endAngle: number) => {
    const start = polarToCartesian(CENTER_X, CENTER_Y, RADIUS, startAngle);
    const end = polarToCartesian(CENTER_X, CENTER_Y, RADIUS, endAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

    return [
      `M ${CENTER_X} ${CENTER_Y}`,
      `L ${start.x} ${start.y}`,
      `A ${RADIUS} ${RADIUS} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`,
      'Z',
    ].join(' ');
  };

  // Trigger pointer flick
  const triggerPointerTick = () => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    setIsPointerTicking(true);
    if (tickTimeoutRef.current) clearTimeout(tickTimeoutRef.current);
    tickTimeoutRef.current = setTimeout(() => {
      setIsPointerTicking(false);
    }, 90);
  };

  // Animation controller
  useEffect(() => {
    if (!isSpinning || targetSegment === null) return;

    // Use crypto/Math.random for landing offset inside the safe 6° slice boundary
    const randomOffset = Math.random();
    const { totalRotation, finalRotation } = calculateSpinRotation(
      targetSegment,
      currentRotationRef.current,
      randomOffset
    );

    const startRotation = currentRotationRef.current;
    const durationMs = 7000;
    let startTime: number | null = null;

    const animate = (timestamp: number) => {
      if (startTime === null) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(1, elapsed / durationMs);

      const eased = easeOutQuart(progress);
      const newRotation = startRotation + totalRotation * eased;
      currentRotationRef.current = newRotation;
      setDisplayRotation(newRotation);

      // Check boundary crossing for pointer tick
      const angleUnderPointer = getAngleUnderPointer(newRotation);
      const currentSlice = getSliceIndexForAngle(angleUnderPointer);
      if (currentSlice !== lastSliceRef.current) {
        lastSliceRef.current = currentSlice;
        triggerPointerTick();
      }

      if (progress < 1) {
        animFrameIdRef.current = requestAnimationFrame(animate);
      } else {
        // Spin finished
        currentRotationRef.current = finalRotation;
        setDisplayRotation(finalRotation);

        // Haptic feedback (1 light 30ms vibration if supported)
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          try {
            navigator.vibrate(30);
          } catch {
            // Ignore if vibrate disallowed
          }
        }

        onSpinComplete();
      }
    };

    animFrameIdRef.current = requestAnimationFrame(animate);

    return () => {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
      if (tickTimeoutRef.current) {
        clearTimeout(tickTimeoutRef.current);
      }
    };
  }, [isSpinning, targetSegment, onSpinComplete]);

  return (
    <div className="wheel-hero-container">
      <div className="wheel-frame">
        {/* Fixed Top Pointer */}
        <div className="wheel-pointer-container">
          <svg
            className={`wheel-pointer ${isPointerTicking ? 'ticking' : ''}`}
            viewBox="0 0 32 38"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Crisp flat Ink pointer with white border */}
            <path
              d="M16 38L2 10C0 6 3 0 8 0H24C29 0 32 6 30 10L16 38Z"
              fill="#2B1B2E"
              stroke="#FFFFFF"
              strokeWidth="2"
            />
          </svg>
        </div>

        {/* The Wheel SVG */}
        <svg
          className="wheel-svg"
          viewBox="0 0 500 500"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Rotating Group driven by requestAnimationFrame */}
          <g
            style={{
              transformOrigin: '250px 250px',
              transform: `rotate(${displayRotation}deg)`,
            }}
          >
            {/* Slices */}
            {WHEEL_SLICES.map((slice) => {
              const midAngle = slice.startAngle + slice.width / 2;
              const title = getSliceTitle(slice);

              return (
                <g key={slice.index}>
                  {/* Slice Wedge */}
                  <path
                    d={describeArc(slice.startAngle, slice.endAngle)}
                    fill={slice.bgColor}
                    stroke="#FF4FA3"
                    strokeWidth="1.5"
                  />

                  {/* Radial Label */}
                  <g transform={`rotate(${midAngle}, ${CENTER_X}, ${CENTER_Y})`}>
                    {slice.isOffer ? (
                      <text
                        x={CENTER_X}
                        y={CENTER_Y - RADIUS + 44}
                        fill={slice.textColor}
                        fontFamily="Fredoka, sans-serif"
                        fontSize="15"
                        fontWeight="700"
                        textAnchor="middle"
                        transform={`rotate(90, ${CENTER_X}, ${CENTER_Y - RADIUS + 44})`}
                      >
                        {title}
                      </text>
                    ) : (
                      // Two lines for "Better luck" and "next time"
                      <g transform={`rotate(90, ${CENTER_X}, ${CENTER_Y - RADIUS + 44})`}>
                        <text
                          x={CENTER_X}
                          y={CENTER_Y - RADIUS + 36}
                          fill={slice.textColor}
                          fontFamily="Fredoka, sans-serif"
                          fontSize="12"
                          fontWeight="600"
                          textAnchor="middle"
                        >
                          Better luck
                        </text>
                        <text
                          x={CENTER_X}
                          y={CENTER_Y - RADIUS + 52}
                          fill={slice.textColor}
                          fontFamily="Fredoka, sans-serif"
                          fontSize="12"
                          fontWeight="600"
                          textAnchor="middle"
                        >
                          next time
                        </text>
                      </g>
                    )}
                  </g>
                </g>
              );
            })}

            {/* Simple Outer Rim - No glow, no dots */}
            <circle
              cx={CENTER_X}
              cy={CENTER_Y}
              r={RADIUS}
              fill="none"
              stroke="#FF4FA3"
              strokeWidth="6"
            />
          </g>

          {/* Center Hub: Circular Logo with Pink Ring */}
          <defs>
            <clipPath id="wheel-hub-clip">
              <circle cx={CENTER_X} cy={CENTER_Y} r="42" />
            </clipPath>
          </defs>
          <circle
            cx={CENTER_X}
            cy={CENTER_Y}
            r="44"
            fill="#FFFFFF"
            stroke="#FF4FA3"
            strokeWidth="5"
          />
          <image
            href="/logo.png"
            x={CENTER_X - 42}
            y={CENTER_Y - 42}
            width="84"
            height="84"
            clipPath="url(#wheel-hub-clip)"
            preserveAspectRatio="xMidYMid meet"
          />
        </svg>
      </div>
    </div>
  );
};
