import React from 'react';

interface BlockedScreenProps {
  refCode?: string;
}

export const BlockedScreen: React.FC<BlockedScreenProps> = ({ refCode }) => {
  return (
    <div className="blocked-container">
      <p className="blocked-copy">
        This phone has already played. If this is a mistake, show this code at the Cravery counter:
      </p>

      {refCode && (
        <div className="blocked-ref-code-box">
          <span className="blocked-ref-code">{refCode}</span>
        </div>
      )}
    </div>
  );
};
