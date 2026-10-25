import React, { useState } from 'react';

export const Header: React.FC = () => {
  const [logoFailed, setLogoFailed] = useState(false);

  return (
    <header className="header-section">
      <div className="logo-container">
        {!logoFailed ? (
          <img
            src="/logo.png"
            alt="Cravery"
            className="logo-img"
            onError={() => setLogoFailed(true)}
          />
        ) : (
          <span className="wordmark-logo">Cravery</span>
        )}
      </div>

      <h1 className="anniversary-heading">
        Cravery turns <span className="highlight-one">1</span>
      </h1>

      <p className="anniversary-subtext">Spin the wheel and win an offer.</p>
    </header>
  );
};
