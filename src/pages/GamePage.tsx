import React, { useEffect, useState, useCallback } from 'react';
import { Header } from '../components/Header.js';
import { Wheel } from '../components/Wheel.js';
import { SpinButton } from '../components/SpinButton.js';
import { ResultPanel } from '../components/ResultPanel.js';
import { BlockedScreen } from '../components/BlockedScreen.js';
import { collectDeviceFingerprint, getClientStoredTokens, syncClientToken } from '../utils/anti-cheat.js';
import { SessionResponse, SpinResponse, GamePhase, PublicOfferSummary } from '../../api/_lib/types.js';
import { CouponCardData } from '../utils/canvas-card.js';

export const GamePage: React.FC = () => {
  const [phase, setPhase] = useState<GamePhase>('open');
  const [spinsUsed, setSpinsUsed] = useState<number>(0);
  const [refCode, setRefCode] = useState<string | undefined>(undefined);
  const [publicOffers, setPublicOffers] = useState<PublicOfferSummary[]>([]);
  const [activeCoupon, setActiveCoupon] = useState<CouponCardData | null>(null);
  const [lastSpinSegment, setLastSpinSegment] = useState<number | null>(null);

  const [isLoadingSession, setIsLoadingSession] = useState<boolean>(true);
  const [isRequestInFlight, setIsRequestInFlight] = useState<boolean>(false);
  const [isWheelSpinning, setIsWheelSpinning] = useState<boolean>(false);
  const [targetSegment, setTargetSegment] = useState<number | null>(null);
  const [pendingSpinResponse, setPendingSpinResponse] = useState<SpinResponse | null>(null);

  const [showResultPanel, setShowResultPanel] = useState<boolean>(false);
  const [panelOutcome, setPanelOutcome] = useState<'offer' | 'miss'>('offer');
  const [panelSpinNo, setPanelSpinNo] = useState<number>(1);
  const [panelOfferTitle, setPanelOfferTitle] = useState<string | undefined>();
  const [panelOfferDesc, setPanelOfferDesc] = useState<string | undefined>();

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Initialize session
  const initSession = useCallback(async () => {
    try {
      setIsLoadingSession(true);
      setErrorMessage(null);

      const [fingerprint, storedTokens] = await Promise.all([
        collectDeviceFingerprint(),
        getClientStoredTokens(),
      ]);

      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokens: storedTokens,
          fingerprint,
        }),
      });

      if (!res.ok) {
        if (res.status === 429) {
          setErrorMessage('Too many requests. Please wait a moment.');
        } else {
          setErrorMessage('Something went wrong. Please try again.');
        }
        return;
      }

      const session: SessionResponse = await res.json();

      // Sync signed device token to localStorage and IndexedDB
      if (session.token) {
        await syncClientToken(session.token);
      }

      setPhase(session.phase);
      setSpinsUsed(session.spinsUsed);
      setRefCode(session.refCode);
      setPublicOffers(session.offers || []);

      if (session.lastSpin) {
        setLastSpinSegment(session.lastSpin.segmentIndex);
      }

      if (session.coupon) {
        const cData: CouponCardData = {
          code: session.coupon.code,
          offerSlot: session.coupon.offerSlot,
          offerTitle: session.coupon.offerTitle,
          offerDescription: session.coupon.offerDescription,
          expiresAt: session.coupon.expiresAt,
        };
        setActiveCoupon(cData);
        setPanelOutcome('offer');
        setPanelSpinNo(session.spinsUsed);
        setPanelOfferTitle(session.coupon.offerTitle);
        setPanelOfferDesc(session.coupon.offerDescription);
        setShowResultPanel(true);
      }
    } catch (err) {
      console.error('Session init error:', err);
      setErrorMessage('Something went wrong. Please try again.');
    } finally {
      setIsLoadingSession(false);
    }
  }, []);

  useEffect(() => {
    initSession();
  }, [initSession]);

  // Execute Spin
  const handleSpin = async () => {
    if (isWheelSpinning || isRequestInFlight || phase === 'before_start' || phase === 'ended' || phase === 'played') {
      return;
    }

    setErrorMessage(null);
    setShowResultPanel(false);
    setIsRequestInFlight(true);

    try {
      // 1. Generate client requestId uuid
      const requestId = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
          });

      // 2. Call server
      const res = await fetch('/api/spin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        setErrorMessage(errorData.error || 'Something went wrong. Please try again.');
        setIsRequestInFlight(false);
        return;
      }

      const spinData: SpinResponse = await res.json();

      // 3. Hand over segment index to the Wheel and trigger 7-second animation
      setPendingSpinResponse(spinData);
      setTargetSegment(spinData.segmentIndex);
      setIsWheelSpinning(true);
      setIsRequestInFlight(false);
    } catch (err) {
      console.error('Spin request error:', err);
      setErrorMessage('Something went wrong. Please try again.');
      setIsRequestInFlight(false);
    }
  };

  // Called when 7000ms wheel animation reaches full stop
  const handleSpinComplete = () => {
    setIsWheelSpinning(false);
    if (!pendingSpinResponse) return;

    const { outcome, spinNo, offer, coupon, finished } = pendingSpinResponse;

    setSpinsUsed(spinNo);
    setPanelOutcome(outcome);
    setPanelSpinNo(spinNo);

    if (outcome === 'offer' && coupon && offer) {
      const cData: CouponCardData = {
        code: coupon.code,
        offerSlot: offer.slot,
        offerTitle: offer.title,
        offerDescription: offer.description,
        expiresAt: coupon.expiresAt,
      };
      setActiveCoupon(cData);
      setPanelOfferTitle(offer.title);
      setPanelOfferDesc(offer.description);
    }

    if (finished) {
      setPhase('played');
    }

    setShowResultPanel(true);
    setPendingSpinResponse(null);
  };

  if (phase === 'blocked') {
    return (
      <main className="app-shell">
        <Header />
        <BlockedScreen refCode={refCode} />
      </main>
    );
  }

  return (
    <main className="app-shell">
      {/* Header with Cravery Logo / Wordmark and Title */}
      <Header />

      {/* Hero Wheel */}
      <Wheel
        targetSegment={targetSegment}
        isSpinning={isWheelSpinning}
        initialSegment={lastSpinSegment}
        offers={publicOffers}
        onSpinComplete={handleSpinComplete}
      />

      {/* Main Spin CTA Button & helper text */}
      <SpinButton
        onSpin={handleSpin}
        isSpinning={isWheelSpinning}
        isLoading={isRequestInFlight || isLoadingSession}
        phase={phase}
        spinsUsed={spinsUsed}
        errorMessage={errorMessage}
      />

      {/* Slide-Up Result Panel */}
      {showResultPanel && (
        <ResultPanel
          outcome={panelOutcome}
          spinNo={panelSpinNo}
          offerTitle={panelOfferTitle}
          offerDescription={panelOfferDesc}
          coupon={activeCoupon}
          onSpinAgain={() => {
            setShowResultPanel(false);
            handleSpin();
          }}
          onClose={() => setShowResultPanel(false)}
        />
      )}
    </main>
  );
};
