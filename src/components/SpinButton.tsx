import React from 'react';
import { GamePhase } from '../../api/_lib/types.js';

interface SpinButtonProps {
  onSpin: () => void;
  isSpinning: boolean;
  isLoading: boolean;
  phase: GamePhase;
  spinsUsed: number;
  errorMessage?: string | null;
}

export const SpinButton: React.FC<SpinButtonProps> = ({
  onSpin,
  isSpinning,
  isLoading,
  phase,
  spinsUsed,
  errorMessage,
}) => {
  let buttonText = 'SPIN';
  let isDisabled = isSpinning || isLoading;

  if (phase === 'before_start') {
    buttonText = 'Opens on 1 November';
    isDisabled = true;
  } else if (phase === 'paused') {
    buttonText = 'Campaign Paused';
    isDisabled = true;
  } else if (phase === 'ended') {
    buttonText = 'This offer has ended';
    isDisabled = true;
  } else if (phase === 'played') {
    buttonText = 'You have already played.';
    isDisabled = true;
  } else if (isSpinning) {
    buttonText = 'Spinning...';
  } else if (isLoading) {
    buttonText = '...';
  }

  // Exact helper text logic
  let helperText = '1 spin. Miss it? You get one more try.';
  if (phase === 'before_start') {
    helperText = 'The offer will start on 1 Nov';
  } else if (phase === 'paused') {
    helperText = 'The celebration is temporarily paused. Please check back shortly.';
  } else if (spinsUsed === 1) {
    helperText = '1 more chance.';
  } else if (phase === 'played' || spinsUsed >= 2) {
    helperText = '';
  }

  return (
    <div className="controls-section">
      <button
        type="button"
        className="spin-btn"
        onClick={onSpin}
        disabled={isDisabled}
      >
        {buttonText}
      </button>

      {helperText && !errorMessage && (
        <p className="spin-helper-text">{helperText}</p>
      )}

      {errorMessage && (
        <p className="error-banner">{errorMessage}</p>
      )}
    </div>
  );
};
