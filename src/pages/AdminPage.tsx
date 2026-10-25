import React, { useState, useEffect, useCallback } from 'react';

type AdminTab = 'dashboard' | 'offers' | 'settings' | 'winners' | 'approve';

// Helper: Converts ISO UTC string to local datetime-local format (YYYY-MM-DDTHH:mm)
function isoToDatetimeLocal(isoStr: string | null | undefined): string {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

// Helper: Converts local datetime-local format (YYYY-MM-DDTHH:mm) to ISO UTC string
function datetimeLocalToIso(localStr: string): string | null {
  if (!localStr || !localStr.trim()) return null;
  const d = new Date(localStr);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

export const AdminPage: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');

  // Dashboard Data
  const [dashboardData, setDashboardData] = useState<any>(null);

  // Offers Data
  const [offersData, setOffersData] = useState<any>(null);
  const [offersSuccessMsg, setOffersSuccessMsg] = useState<string | null>(null);

  // Settings Data
  const [settingsData, setSettingsData] = useState<any>(null);
  const [settingsSuccessMsg, setSettingsSuccessMsg] = useState<string | null>(null);

  // Winners Data (Customers who won an offer)
  const [winnersData, setWinnersData] = useState<any>(null);

  // Approve Device Data
  const [refCodeInput, setRefCodeInput] = useState<string>('');
  const [approveError, setApproveError] = useState<string | null>(null);
  const [approveSuccess, setApproveSuccess] = useState<string | null>(null);

  // Check auth on mount
  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/check');
      if (res.ok) {
        const data = await res.json();
        setIsAuthenticated(data.authenticated);
      }
    } catch {
      setIsAuthenticated(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Load Dashboard Stats
  const loadDashboard = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/stats');
      if (res.ok) {
        const data = await res.json();
        setDashboardData(data);
      }
    } catch (err) {
      console.error(err);
    }
  }, []);

  // Load Offers & Odds
  const loadOffers = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/offers');
      if (res.ok) {
        const data = await res.json();
        setOffersData(data);
      }
    } catch (err) {
      console.error(err);
    }
  }, []);

  // Load Settings
  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/settings');
      if (res.ok) {
        const data = await res.json();
        setSettingsData(data);
      }
    } catch (err) {
      console.error(err);
    }
  }, []);

  // Load Winners (Customers who won offers)
  const loadWinners = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/winners');
      if (res.ok) {
        const data = await res.json();
        setWinnersData(data);
      }
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      if (activeTab === 'dashboard') loadDashboard();
      if (activeTab === 'offers') loadOffers();
      if (activeTab === 'settings') loadSettings();
      if (activeTab === 'winners') loadWinners();
    }
  }, [isAuthenticated, activeTab, loadDashboard, loadOffers, loadSettings, loadWinners]);

  // Handle Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordInput }),
      });
      if (res.ok) {
        setIsAuthenticated(true);
        setPasswordInput('');
      } else {
        const err = await res.json();
        setLoginError(err.error || 'Invalid password');
      }
    } catch {
      setLoginError('Login request failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Logout
  const handleLogout = async () => {
    try {
      await fetch('/api/admin/logout', { method: 'POST' });
      setIsAuthenticated(false);
    } catch (err) {
      console.error(err);
    }
  };

  // Handle Save Offers
  const handleSaveOffers = async (e: React.FormEvent) => {
    e.preventDefault();
    setOffersSuccessMsg(null);
    try {
      const payload = {
        betterLuckWeight: Number(offersData.betterLuckWeight),
        offers: offersData.offers.map((o: any) => ({
          slot: o.slot,
          title: o.title,
          description: o.description,
          weight: Number(o.weight),
          totalStock: Number(o.totalStock),
          isActive: Boolean(o.isActive),
        })),
      };

      const res = await fetch('/api/admin/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setOffersSuccessMsg('Offers and odds updated successfully!');
        loadOffers();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to update offers');
      }
    } catch (err) {
      console.error(err);
      alert('Network error while saving offers');
    }
  };

  // Handle Save Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsSuccessMsg(null);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsData),
      });

      if (res.ok) {
        setSettingsSuccessMsg('Settings updated successfully!');
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to update settings');
      }
    } catch (err) {
      console.error(err);
      alert('Network error while saving settings');
    }
  };

  // Handle Campaign Action: Start / Pause / Cancel
  const handleCampaignAction = async (actionCmd: 'start' | 'pause' | 'cancel') => {
    try {
      const res = await fetch('/api/admin/campaign-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: actionCmd }),
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.message);
        loadSettings();
        loadDashboard();
      } else {
        alert(data.error || 'Failed to update campaign state');
      }
    } catch {
      alert('Network error while updating campaign');
    }
  };

  // Handle Reset Total Players
  const handleResetPlayers = async () => {
    const confirmed = window.confirm(
      'Are you sure you want to RESET all players, spins, and claimed offers to 0?\n\nThis will completely clear all test data and give you a fresh 0-player start for the real event.'
    );
    if (!confirmed) return;

    try {
      const res = await fetch('/api/admin/reset-players', {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.message);
        loadDashboard();
        loadOffers();
      } else {
        alert(data.error || 'Failed to reset players');
      }
    } catch {
      alert('Network error while resetting players');
    }
  };

  // Handle Approve Device
  const handleApproveDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    setApproveError(null);
    setApproveSuccess(null);
    const code = refCodeInput.trim().toUpperCase();
    if (!code) return;

    try {
      const res = await fetch('/api/admin/approve-device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refCode: code }),
      });
      if (res.ok) {
        const data = await res.json();
        setApproveSuccess(data.message);
        setRefCodeInput('');
      } else {
        const err = await res.json();
        setApproveError(err.error || 'Failed to approve device');
      }
    } catch {
      setApproveError('Network error during approval');
    }
  };

  // Login Screen
  if (!isAuthenticated) {
    return (
      <div className="admin-shell" style={{ maxWidth: 400, marginTop: 40 }}>
        <div className="admin-card">
          <h2 style={{ fontFamily: 'var(--font-heading)', marginBottom: 16 }}>Cravory Admin Login</h2>
          <form onSubmit={handleLogin}>
            <label style={{ fontSize: 14 }}>Enter Admin Password</label>
            <input
              type="password"
              className="admin-input"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="••••••••••••"
              required
            />
            {loginError && <p style={{ color: 'var(--color-pink)', fontSize: 13, marginBottom: 12 }}>{loginError}</p>}
            <button type="submit" className="admin-btn" style={{ width: '100%' }} disabled={isSubmitting}>
              {isSubmitting ? 'Logging in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-shell">
      <div className="admin-header">
        <div>
          <h1>Cravory Administration</h1>
          <span style={{ fontSize: 13, color: '#666' }}>1st Anniversary Campaign Management</span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <a href="/" style={{ padding: '8px 12px', border: '1px solid #2B1B2E', textDecoration: 'none', color: '#2B1B2E', fontSize: 14 }}>
            Open Public App
          </a>
          <button onClick={handleLogout} style={{ padding: '8px 12px', border: '1px solid #FF4FA3', background: '#FF4FA3', color: '#fff', cursor: 'pointer' }}>
            Logout
          </button>
        </div>
      </div>

      {/* Global Campaign Action & Reset Bar */}
      <div style={{
        background: '#fff',
        border: '1px solid #ddd',
        padding: '12px 16px',
        marginBottom: 16,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 'bold' }}>CAMPAIGN CONTROLS:</span>
          <button
            type="button"
            style={{
              padding: '7px 14px',
              background: '#10B981',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              fontWeight: 'bold',
              cursor: 'pointer',
              fontSize: 13,
            }}
            onClick={() => handleCampaignAction('start')}
            title="Start campaign immediately (live for customers)"
          >
            ▶ Start Campaign
          </button>
          <button
            type="button"
            style={{
              padding: '7px 14px',
              background: '#F59E0B',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              fontWeight: 'bold',
              cursor: 'pointer',
              fontSize: 13,
            }}
            onClick={() => handleCampaignAction('pause')}
            title="Temporarily pause spinning for customers"
          >
            ⏸ Pause Campaign
          </button>
          <button
            type="button"
            style={{
              padding: '7px 14px',
              background: '#EF4444',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              fontWeight: 'bold',
              cursor: 'pointer',
              fontSize: 13,
            }}
            onClick={() => handleCampaignAction('cancel')}
            title="Cancel or end the campaign"
          >
            ⏹ Cancel Campaign
          </button>
        </div>

        <button
          type="button"
          style={{
            padding: '7px 14px',
            background: '#2B1B2E',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            fontWeight: 'bold',
            cursor: 'pointer',
            fontSize: 13,
          }}
          onClick={handleResetPlayers}
          title="Clear all test players and reset counts to 0"
        >
          ↺ Reset Total Players
        </button>
      </div>

      {/* Tabs */}
      <div className="admin-tabs">
        <button className={`admin-tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
          Dashboard
        </button>
        <button className={`admin-tab-btn ${activeTab === 'offers' ? 'active' : ''}`} onClick={() => setActiveTab('offers')}>
          Offers & Odds
        </button>
        <button className={`admin-tab-btn ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
          Settings
        </button>
        <button className={`admin-tab-btn ${activeTab === 'winners' ? 'active' : ''}`} onClick={() => setActiveTab('winners')}>
          Customers Won ({dashboardData?.totalWinners ?? 0})
        </button>
        <button className={`admin-tab-btn ${activeTab === 'approve' ? 'active' : ''}`} onClick={() => setActiveTab('approve')}>
          Approve Device
        </button>
      </div>

      {/* 1. Dashboard Tab */}
      {activeTab === 'dashboard' && (
        <div>
          {dashboardData ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
                <div className="admin-card">
                  <div style={{ fontSize: 13, color: '#666' }}>Total Players</div>
                  <div style={{ fontSize: 26, fontWeight: 'bold' }}>{dashboardData.totalPlayers}</div>
                </div>
                <div className="admin-card">
                  <div style={{ fontSize: 13, color: '#666' }}>Total Spins</div>
                  <div style={{ fontSize: 26, fontWeight: 'bold' }}>{dashboardData.totalSpins}</div>
                </div>
                <div className="admin-card" style={{ cursor: 'pointer' }} onClick={() => setActiveTab('winners')} title="Click to view all winners">
                  <div style={{ fontSize: 13, color: '#666' }}>Customers Won</div>
                  <div style={{ fontSize: 26, fontWeight: 'bold', color: 'var(--color-pink)' }}>{dashboardData.totalWinners ?? 0}</div>
                </div>
                <div className="admin-card">
                  <div style={{ fontSize: 13, color: '#666' }}>Blocked Attempts</div>
                  <div style={{ fontSize: 26, fontWeight: 'bold' }}>{dashboardData.blockedCount}</div>
                </div>
              </div>

              <div className="admin-card">
                <h3 style={{ fontFamily: 'var(--font-heading)', marginBottom: 8 }}>Wins & Stock Remaining</h3>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Slot</th>
                      <th>Offer Title</th>
                      <th>Wins Claimed</th>
                      <th>Remaining Stock</th>
                      <th>Total Stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboardData.winsPerOffer.map((w: any) => (
                      <tr key={w.slot}>
                        <td>Slot {w.slot}</td>
                        <td>{w.title}</td>
                        <td>{w.wins}</td>
                        <td style={{ fontWeight: 'bold', color: w.remainingStock <= 5 ? '#FF4FA3' : 'inherit' }}>
                          {w.remainingStock}
                        </td>
                        <td>{w.totalStock}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="admin-card">
                <h3 style={{ fontFamily: 'var(--font-heading)', marginBottom: 8 }}>Recent Events (Audit Log)</h3>
                <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Time (IST)</th>
                        <th>Event</th>
                        <th>Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboardData.recentEvents.map((evt: any) => (
                        <tr key={evt.id}>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            {new Date(evt.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                          </td>
                          <td style={{ fontWeight: 600 }}>{evt.event_type}</td>
                          <td style={{ fontSize: 12 }}>{JSON.stringify(evt.metadata || {})}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <p>Loading dashboard stats...</p>
          )}
        </div>
      )}

      {/* 2. Offers & Live Odds Tab */}
      {activeTab === 'offers' && (
        <div>
          {offersData ? (
            <form onSubmit={handleSaveOffers} className="admin-card">
              <h3 style={{ fontFamily: 'var(--font-heading)', marginBottom: 12 }}>Edit Offers & Real-Time Odds</h3>

              <div style={{ marginBottom: 16 }}>
                <label style={{ fontWeight: 600, display: 'block' }}>Better Luck Weight (Current Odds: {offersData.betterLuckOddsPct}%)</label>
                <input
                  type="number"
                  min="0"
                  className="admin-input"
                  style={{ width: 140 }}
                  value={offersData.betterLuckWeight}
                  onChange={(e) => setOffersData({ ...offersData, betterLuckWeight: Number(e.target.value) })}
                />
              </div>

              {offersData.offers.map((off: any, idx: number) => (
                <div key={off.slot} style={{ borderTop: '1px solid #eee', paddingTop: 12, marginTop: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h4 style={{ fontFamily: 'var(--font-heading)' }}>Offer Slot {off.slot}</h4>
                    <span style={{ fontSize: 13, background: '#22D3EE', padding: '2px 8px', borderRadius: 4, fontWeight: 'bold' }}>
                      Live Odds: {off.liveOddsPct}%
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10, marginTop: 6 }}>
                    <div>
                      <label style={{ fontSize: 12 }}>Offer Title (Max 22 chars shown on wheel)</label>
                      <input
                        type="text"
                        className="admin-input"
                        value={off.title}
                        onChange={(e) => {
                          const updated = [...offersData.offers];
                          updated[idx].title = e.target.value;
                          setOffersData({ ...offersData, offers: updated });
                        }}
                        required
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 12 }}>Weight</label>
                      <input
                        type="number"
                        min="0"
                        className="admin-input"
                        value={off.weight}
                        onChange={(e) => {
                          const updated = [...offersData.offers];
                          updated[idx].weight = Number(e.target.value);
                          setOffersData({ ...offersData, offers: updated });
                        }}
                        required
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 12 }}>Total Stock</label>
                      <input
                        type="number"
                        min="0"
                        className="admin-input"
                        value={off.totalStock}
                        onChange={(e) => {
                          const updated = [...offersData.offers];
                          updated[idx].totalStock = Number(e.target.value);
                          setOffersData({ ...offersData, offers: updated });
                        }}
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: 12 }}>Description (Shown to Winner & On Card)</label>
                    <input
                      type="text"
                      className="admin-input"
                      value={off.description}
                      onChange={(e) => {
                        const updated = [...offersData.offers];
                        updated[idx].description = e.target.value;
                        setOffersData({ ...offersData, offers: updated });
                      }}
                      required
                    />
                  </div>

                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      id={`active-${off.slot}`}
                      checked={off.isActive}
                      onChange={(e) => {
                        const updated = [...offersData.offers];
                        updated[idx].isActive = e.target.checked;
                        setOffersData({ ...offersData, offers: updated });
                      }}
                    />
                    <label htmlFor={`active-${off.slot}`} style={{ fontSize: 14 }}>Active in spin outcomes</label>
                    <span style={{ fontSize: 13, color: '#666', marginLeft: 16 }}>
                      (Claimed: {off.claimedCount} / Remaining: {off.remainingStock})
                    </span>
                  </div>
                </div>
              ))}

              {offersSuccessMsg && (
                <p style={{ color: 'green', fontSize: 14, marginTop: 12, fontWeight: 600 }}>{offersSuccessMsg}</p>
              )}

              <button type="submit" className="admin-btn" style={{ marginTop: 16 }}>
                Save Offers & Update Weights
              </button>
            </form>
          ) : (
            <p>Loading offers...</p>
          )}
        </div>
      )}

      {/* 3. Settings Tab */}
      {activeTab === 'settings' && (
        <div>
          {settingsData ? (
            <form onSubmit={handleSaveSettings} className="admin-card">
              <h3 style={{ fontFamily: 'var(--font-heading)', marginBottom: 14 }}>Campaign Schedule & Rules</h3>

              {/* Live Campaign Status Badge */}
              {(() => {
                const now = new Date();
                const startDate = settingsData.startAt ? new Date(settingsData.startAt) : null;
                const endDate = settingsData.endAt ? new Date(settingsData.endAt) : null;
                let statusText = 'LIVE NOW (Campaign is actively open)';
                let statusBg = '#D1FAE5';
                let statusColor = '#065F46';

                if (startDate && now < startDate) {
                  statusText = `SCHEDULED (Opens on ${startDate.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST)`;
                  statusBg = '#FEF3C7';
                  statusColor = '#92400E';
                } else if (endDate && now > endDate) {
                  statusText = `ENDED (Closed on ${endDate.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST)`;
                  statusBg = '#FEE2E2';
                  statusColor = '#991B1B';
                }

                return (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '10px 14px',
                      borderRadius: 6,
                      backgroundColor: statusBg,
                      color: statusColor,
                      fontWeight: 'bold',
                      fontSize: 14,
                      marginBottom: 20,
                    }}
                  >
                    <span style={{ fontSize: 16 }}>●</span>
                    <span>{statusText}</span>
                  </div>
                );
              })()}

              {/* Start Date & Time Calendar Picker */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontWeight: 600, display: 'block', fontSize: 14, marginBottom: 6 }}>
                  Start Date & Time (Click calendar icon to pick):
                </label>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    type="datetime-local"
                    className="admin-input"
                    style={{ margin: 0, width: 280, cursor: 'pointer', fontWeight: 600 }}
                    value={isoToDatetimeLocal(settingsData.startAt)}
                    onChange={(e) => {
                      const iso = datetimeLocalToIso(e.target.value);
                      if (iso) setSettingsData({ ...settingsData, startAt: iso });
                    }}
                    required
                  />
                  <button
                    type="button"
                    style={{ padding: '8px 12px', fontSize: 13, cursor: 'pointer', border: '1px solid #2B1B2E', background: '#fff', fontWeight: 600 }}
                    onClick={() => setSettingsData({ ...settingsData, startAt: new Date().toISOString() })}
                  >
                    ▶ Start Campaign Now
                  </button>
                  <button
                    type="button"
                    style={{ padding: '8px 12px', fontSize: 13, cursor: 'pointer', border: '1px solid #FF4FA3', color: '#FF4FA3', background: '#fff', fontWeight: 600 }}
                    onClick={() => setSettingsData({ ...settingsData, startAt: '2026-10-31T18:30:00Z' })}
                  >
                    📅 Set to 1 Nov (00:00 IST)
                  </button>
                </div>
                <span style={{ fontSize: 12, color: '#666', marginTop: 4, display: 'block' }}>
                  Current setting: <strong>{new Date(settingsData.startAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full', timeStyle: 'medium' })} IST</strong>
                </span>
              </div>

              {/* End Date & Time Calendar Picker */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontWeight: 600, display: 'block', fontSize: 14, marginBottom: 6 }}>
                  End Date & Time (Optional):
                </label>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    type="datetime-local"
                    className="admin-input"
                    style={{ margin: 0, width: 280, cursor: 'pointer', fontWeight: 600 }}
                    value={isoToDatetimeLocal(settingsData.endAt)}
                    onChange={(e) => {
                      const iso = datetimeLocalToIso(e.target.value);
                      setSettingsData({ ...settingsData, endAt: iso });
                    }}
                  />
                  <button
                    type="button"
                    style={{ padding: '8px 12px', fontSize: 13, cursor: 'pointer', border: '1px solid #999', background: '#f5f5f5' }}
                    onClick={() => setSettingsData({ ...settingsData, endAt: null })}
                  >
                    ✕ No End Date (Continuous)
                  </button>
                </div>
                <span style={{ fontSize: 12, color: '#666', marginTop: 4, display: 'block' }}>
                  {settingsData.endAt ? (
                    <>
                      Current setting: <strong>{new Date(settingsData.endAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full', timeStyle: 'medium' })} IST</strong>
                    </>
                  ) : (
                    'Currently set to run indefinitely with no cutoff.'
                  )}
                </span>
              </div>

              {/* Coupon Validity */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontWeight: 600, display: 'block', fontSize: 14, marginBottom: 4 }}>
                  Coupon Validity (Days from win date)
                </label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  className="admin-input"
                  style={{ width: 140, margin: 0 }}
                  value={settingsData.couponValidDays}
                  onChange={(e) => setSettingsData({ ...settingsData, couponValidDays: Number(e.target.value) })}
                  required
                />
              </div>

              {/* Anti-cheat Strict Mode */}
              <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  id="strict-mode"
                  checked={settingsData.strictDeviceMode}
                  onChange={(e) => setSettingsData({ ...settingsData, strictDeviceMode: e.target.checked })}
                />
                <label htmlFor="strict-mode" style={{ fontSize: 14, fontWeight: 600 }}>
                  Strict Device Mode (Block device fingerprint collisions and display dispute reference code)
                </label>
              </div>

              {settingsSuccessMsg && (
                <p style={{ color: 'green', fontSize: 14, marginTop: 12, fontWeight: 600 }}>{settingsSuccessMsg}</p>
              )}

              <button type="submit" className="admin-btn" style={{ marginTop: 10 }}>
                Save Settings
              </button>
            </form>
          ) : (
            <p>Loading settings...</p>
          )}
        </div>
      )}

      {/* 4. Customers Won (Winners List) */}
      {activeTab === 'winners' && (
        <div className="admin-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h3 style={{ fontFamily: 'var(--font-heading)' }}>Customers Won (Live Winners List)</h3>
              <span style={{ fontSize: 13, color: '#666' }}>
                All customers who have won an offer by spinning the wheel
              </span>
            </div>
            <button
              type="button"
              className="admin-btn"
              style={{ padding: '6px 14px', fontSize: 13 }}
              onClick={loadWinners}
            >
              ↻ Refresh List
            </button>
          </div>

          {/* Breakdown cards per offer */}
          {dashboardData?.winsPerOffer && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 20 }}>
              {dashboardData.winsPerOffer.map((off: any) => (
                <div key={off.slot} style={{
                  padding: '12px',
                  borderRadius: 6,
                  border: '1px solid #ddd',
                  background: off.wins > 0 ? '#FFF1F8' : '#fafafa',
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: 12, color: '#666', fontWeight: 600 }}>Offer {off.slot}</div>
                  <div style={{ fontSize: 24, fontWeight: 'bold', color: off.wins > 0 ? 'var(--color-pink)' : '#333' }}>
                    {off.wins}
                  </div>
                  <div style={{ fontSize: 11, color: '#555', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {off.title}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Winners table */}
          {winnersData && winnersData.winners && winnersData.winners.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>#</th>
                    <th>Won Time (IST)</th>
                    <th>Offer Won</th>
                    <th>Description</th>
                    <th>Valid Till</th>
                  </tr>
                </thead>
                <tbody>
                  {winnersData.winners.map((winner: any, idx: number) => (
                    <tr key={winner.id || idx}>
                      <td>{idx + 1}</td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: 13 }}>
                        {new Date(winner.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td>
                        <span style={{
                          display: 'inline-block',
                          padding: '3px 8px',
                          borderRadius: 4,
                          background: 'var(--color-pink)',
                          color: '#fff',
                          fontWeight: 'bold',
                          fontSize: 12,
                        }}>
                          Offer {winner.offer_slot}
                        </span>
                        <span style={{ marginLeft: 8, fontWeight: 600 }}>{winner.offer_title}</span>
                      </td>
                      <td style={{ fontSize: 13, color: '#444' }}>{winner.offer_description}</td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: 13 }}>
                        {new Date(winner.expires_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#777', border: '1px dashed #ddd', borderRadius: 8 }}>
              <p style={{ fontSize: 16, fontWeight: 600 }}>No customers have won yet.</p>
              <p style={{ fontSize: 13, marginTop: 4 }}>
                When customers spin the wheel and land on an offer, they will be listed here automatically with the exact offer details.
              </p>
            </div>
          )}
        </div>
      )}

      {/* 5. Approve Device Tab */}
      {activeTab === 'approve' && (
        <div className="admin-card">
          <h3 style={{ fontFamily: 'var(--font-heading)', marginBottom: 12 }}>Approve Blocked Device</h3>
          <p style={{ fontSize: 14, marginBottom: 14, color: '#555' }}>
            When a customer shows a 6-character reference code from a blocked phone, enter it here to approve a one-time game override for that device.
          </p>

          <form onSubmit={handleApproveDevice} style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <input
              type="text"
              className="admin-input"
              style={{ margin: 0, textTransform: 'uppercase', letterSpacing: 2, fontWeight: 'bold' }}
              placeholder="ABC123"
              maxLength={16}
              value={refCodeInput}
              onChange={(e) => setRefCodeInput(e.target.value)}
              required
            />
            <button type="submit" className="admin-btn" style={{ whiteSpace: 'nowrap' }}>
              Approve Device
            </button>
          </form>

          {approveError && (
            <p style={{ color: '#FF4FA3', fontWeight: 600 }}>{approveError}</p>
          )}

          {approveSuccess && (
            <p style={{ color: 'green', fontWeight: 600 }}>{approveSuccess}</p>
          )}
        </div>
      )}
    </div>
  );
};
