import React, { useState } from 'react';
import { GamePhase } from '../../api/_lib/types.js';

interface HeaderProps {
  phase?: GamePhase;
}

export const Header: React.FC<HeaderProps> = ({ phase }) => {
  const [logoFailed, setLogoFailed] = useState(false);

  return (
    <header className="header-section">
      <div className="logo-container">
        {!logoFailed ? (
          <img
            src="/logo.png"
            alt="Cravory"
            className="logo-img"
            onError={() => setLogoFailed(true)}
          />
        ) : (
          <span className="wordmark-logo">CRAVORY</span>
        )}
      </div>

      <h1 className="anniversary-heading">
        Cravory Turns <span className="highlight-one">One!!!</span>
      </h1>

      <p className="anniversary-subtext">
        {phase === 'before_start'
          ? 'The offer will start on 1 Nov'
          : 'Spin the wheel and win an offer.'}
      </p>
    </header>
  );
};
