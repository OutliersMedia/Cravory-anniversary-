import React, { useEffect, useState } from 'react';
import {
  formatIstDate,
  generateOfferCard,
  triggerDirectDownload,
  CouponCardData,
  GeneratedOfferCard,
} from '../utils/canvas-card.js';

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
  const [isGenerating, setIsGenerating] = useState(false);
  const [saveSuccessHint, setSaveSuccessHint] = useState<string | null>(null);
  const [cardData, setCardData] = useState<GeneratedOfferCard | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  // Pre-generate the card data (Blob + File + DataURL) as soon as coupon is available
  // This allows navigator.share to run 100% synchronously on user tap, preventing iOS gesture expiration
  useEffect(() => {
    if (!coupon) return;
    let cancelled = false;

    setIsGenerating(true);
    generateOfferCard(coupon)
      .then((res) => {
        if (!cancelled) {
          setCardData(res);
        }
      })
      .catch((err) => {
        console.warn('Card pre-generation error:', err);
      })
      .finally(() => {
        if (!cancelled) setIsGenerating(false);
      });

    return () => {
      cancelled = true;
    };
  }, [coupon]);

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

  // Universal Save handler (Mobile Share -> Direct Download -> Visual Preview Modal)
  const handleSaveImage = async () => {
    if (!coupon) return;
    setSaveSuccessHint(null);

    let currentCard = cardData;

    // If pregeneration hasn't finished yet, generate immediately
    if (!currentCard) {
      setIsGenerating(true);
      try {
        currentCard = await generateOfferCard(coupon);
        setCardData(currentCard);
      } catch (err) {
        console.error('Failed to generate offer card:', err);
        setSaveSuccessHint('Unable to generate image. Please take a screenshot!');
        setIsGenerating(false);
        return;
      }
      setIsGenerating(false);
    }

    // Check if Web Share API with files is supported
    const canShareFiles =
      typeof navigator !== 'undefined' &&
      typeof navigator.canShare === 'function' &&
      typeof navigator.share === 'function' &&
      currentCard.file &&
      (() => {
        try {
          return navigator.canShare({ files: [currentCard.file] });
        } catch {
          return false;
        }
      })();

    if (canShareFiles && currentCard.file) {
      try {
        await navigator.share({
          files: [currentCard.file],
          title: 'Cravory 1st Anniversary Offer',
          text: `My Cravory Anniversary Offer: ${coupon.offerTitle}`,
        });
        setSaveSuccessHint('Saved to your device photos/files!');
        return;
      } catch (err: any) {
        // If user cancelled, don't show error
        if (err.name === 'AbortError') return;
        // If share failed on mobile, proceed to download + preview modal fallback
      }
    }

    // Fallback for devices without File share (or if share failed):
    // 1. Trigger direct browser download
    triggerDirectDownload(currentCard);

    // 2. Open the image preview modal so user can tap & hold to save
    setShowPreviewModal(true);
  };

  return (
    <>
      <div className="result-panel-overlay" role="dialog" aria-modal="true">
        <div className="result-panel-content">
          {outcome === 'offer' && (
            <>
              <h2 className="result-badge-heading">
                {coupon?.offerSlot ? `You won Offer ${coupon.offerSlot}!` : 'You won!'}
              </h2>
              <div
                style={{
                  background: '#FFF1F8',
                  border: '2px solid var(--color-pink)',
                  borderRadius: 10,
                  padding: '14px 16px',
                  margin: '12px 0 14px',
                }}
              >
                <h3 className="result-offer-title" style={{ color: 'var(--color-pink)', marginBottom: 6 }}>
                  {offerTitle || coupon?.offerTitle}
                </h3>
                <p className="result-offer-description" style={{ margin: 0, fontWeight: 600 }}>
                  {offerDescription || coupon?.offerDescription}
                </p>
              </div>

              <div
                style={{
                  backgroundColor: '#ECFEFF',
                  border: '2px dashed var(--color-cyan)',
                  borderRadius: 8,
                  padding: '10px 12px',
                  marginBottom: 12,
                  fontSize: 14,
                  fontWeight: 'bold',
                  color: 'var(--color-ink)',
                }}
              >
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
                    disabled={isGenerating}
                  >
                    {isGenerating ? 'Preparing image...' : 'Save offer as image'}
                  </button>
                </>
              )}

              {saveSuccessHint && <p className="save-hint-text">{saveSuccessHint}</p>}

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

              {/* Instagram link */}
              <div style={{ marginTop: 14, fontSize: 13, color: 'var(--color-ink)' }}>
                Follow us on{' '}
                <a
                  href="https://www.instagram.com/cravoryofficial/"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: 'var(--color-pink)',
                    fontWeight: 'bold',
                    textDecoration: 'underline',
                  }}
                >
                  @cravoryofficial
                </a>
              </div>
            </>
          )}

          {outcome === 'miss' && spinNo === 1 && (
            <>
              <h2 className="result-badge-heading">Better luck next time</h2>
              <p className="result-offer-description" style={{ marginTop: 8, marginBottom: 18 }}>
                You still have 1 more chance to spin!
              </p>
              <button type="button" className="action-btn-primary" onClick={onSpinAgain}>
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
                <button type="button" className="action-btn-secondary" onClick={onClose}>
                  Close
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Visual Image Preview Modal (Guaranteed 100% fallback on all mobile devices & in-app browsers) */}
      {showPreviewModal && cardData && (
        <div
          className="image-preview-overlay"
          onClick={() => setShowPreviewModal(false)}
          role="dialog"
          aria-modal="true"
        >
          <div className="image-preview-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="image-preview-heading">Your Cravory Offer Card</h3>
            <p className="image-preview-instruction">
              👉 Press & hold the image below to <strong>Save to Photos</strong> (or take a screenshot)!
            </p>

            <img
              src={cardData.dataUrl}
              alt="Cravory Offer Card"
              className="image-preview-img"
            />

            <button
              type="button"
              className="action-btn-primary"
              style={{ marginBottom: 8 }}
              onClick={() => triggerDirectDownload(cardData)}
            >
              Download again
            </button>

            <button
              type="button"
              className="action-btn-secondary"
              onClick={() => setShowPreviewModal(false)}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
};
