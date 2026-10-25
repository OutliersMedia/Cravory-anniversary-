import React, { useEffect, useState } from 'react';
import { formatIstDate, deliverOfferImage, CouponCardData } from '../utils/canvas-card.js';

interface ResultPanelProps {
  outcome: 'offer' | 'miss';
  spinNo: number;
  offerTitle?: string;
  offerDescription?: string;
  coupon?: CouponCardData | null;
  onSpinAgain?: () => void;
  onClose?: () => void;
}

export const ResultPanel: React.FC<ResultPanelProps> = ({
  outcome,
  spinNo,
  offerTitle,
  offerDescription,
  coupon,
  onSpinAgain,
  onClose,
}) => {
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessHint, setSaveSuccessHint] = useState<string | null>(null);

  // Trigger dynamic confetti on win only (if prefers-reduced-motion is false)
  useEffect(() => {
    if (outcome === 'offer') {
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!prefersReducedMotion) {
        import('canvas-confetti')
          .then((confettiModule) => {
            const confetti = confettiModule.default;
            confetti({
              particleCount: 70,
              spread: 60,
              origin: { y: 0.65 },
              colors: ['#FF4FA3', '#22D3EE', '#FFFFFF'],
              disableForReducedMotion: true,
            });
          })
          .catch(() => {
            // Non-critical if confetti fails to load
          });
      }
    }
  }, [outcome]);

  const handleSaveImage = async () => {
    if (!coupon) return;
    setIsSaving(true);
    setSaveSuccessHint(null);
    try {
      const res = await deliverOfferImage(coupon);
      if (res.method === 'tab') {
        setSaveSuccessHint('Press and hold the image to save.');
      } else if (res.method === 'share') {
        setSaveSuccessHint('Saved to your photos/files.');
      } else {
        setSaveSuccessHint('Image downloaded successfully.');
      }
    } catch (err) {
      console.warn('Save image error:', err);
      setSaveSuccessHint('Unable to save image directly. Take a screenshot!');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="result-panel-overlay" role="dialog" aria-modal="true">
      <div className="result-panel-content">
        {outcome === 'offer' && (
          <>
            <h2 className="result-badge-heading">
              {coupon?.offerSlot ? `You won Offer ${coupon.offerSlot}!` : 'You won!'}
            </h2>
            <div style={{
              background: '#FFF1F8',
              border: '2px solid var(--color-pink)',
              borderRadius: 10,
              padding: '14px 16px',
              margin: '12px 0 14px',
            }}>
              <h3 className="result-offer-title" style={{ color: 'var(--color-pink)', marginBottom: 6 }}>
                {offerTitle || coupon?.offerTitle}
              </h3>
              <p className="result-offer-description" style={{ margin: 0, fontWeight: 600 }}>
                {offerDescription || coupon?.offerDescription}
              </p>
            </div>

            <div style={{
              backgroundColor: '#ECFEFF',
              border: '2px dashed var(--color-cyan)',
              borderRadius: 8,
              padding: '10px 12px',
              marginBottom: 12,
              fontSize: 14,
              fontWeight: 'bold',
              color: 'var(--color-ink)',
            }}>
              Show this screen or saved image at the Cravory counter to claim
            </div>

            {coupon && (
              <>
                <p className="validity-text" style={{ marginBottom: 14 }}>
                  Valid till {formatIstDate(coupon.expiresAt)} • 1 offer per bill
                </p>

                <button
                  type="button"
                  className="action-btn-primary"
                  onClick={handleSaveImage}
                  disabled={isSaving}
                >
                  {isSaving ? 'Generating...' : 'Save offer as image'}
                </button>
              </>
            )}

            {saveSuccessHint && (
              <p className="save-hint-text">{saveSuccessHint}</p>
            )}

            {onClose && (
              <button
                type="button"
                className="action-btn-secondary"
                style={{ marginTop: 8 }}
                onClick={onClose}
              >
                Close
              </button>
            )}
          </>
        )}

        {outcome === 'miss' && spinNo === 1 && (
          <>
            <h2 className="result-badge-heading">Better luck next time</h2>
            <p className="result-offer-description" style={{ marginTop: 8, marginBottom: 18 }}>
              You still have 1 more chance to spin!
            </p>
            <button
              type="button"
              className="action-btn-primary"
              onClick={onSpinAgain}
            >
              Spin again
            </button>
          </>
        )}

        {outcome === 'miss' && spinNo >= 2 && (
          <>
            <p className="result-offer-description" style={{ fontSize: 16, marginTop: 12, marginBottom: 16 }}>
              No offer this time. Thank you for celebrating with us.
            </p>
            {onClose && (
              <button
                type="button"
                className="action-btn-secondary"
                onClick={onClose}
              >
                Close
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};
