import { useEffect, useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router';
import API from '../services/api';

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap');

  .bt-wrap {
    font-family: 'DM Sans', sans-serif;
    background: #00133A;
    min-height: 100vh;
    color: white;
    padding: 60px 0 80px;
  }

  .bt-bg {
    position: fixed; inset: 0; z-index: 0;
    background:
      radial-gradient(ellipse 60% 60% at 50% 20%, rgba(0,245,196,0.12) 0%, transparent 60%),
      radial-gradient(ellipse 50% 50% at 20% 80%, rgba(0,87,255,0.12) 0%, transparent 50%),
      radial-gradient(ellipse 40% 40% at 80% 60%, rgba(0,212,255,0.08) 0%, transparent 50%);
    pointer-events: none;
  }

  .bt-grid {
    position: fixed; inset: 0; z-index: 0;
    background-image:
      linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px);
    background-size: 60px 60px;
    pointer-events: none;
  }

  .bt-inner {
    position: relative; z-index: 1;
    max-width: 560px; margin: 0 auto;
    padding: 0 20px;
  }

  /* ── SUCCESS HEADER ── */
  .bt-success-icon {
    width: 80px; height: 80px;
    border-radius: 50%;
    background: rgba(0,245,196,0.12);
    border: 2px solid rgba(0,245,196,0.3);
    display: flex; align-items: center; justify-content: center;
    font-size: 2.2rem;
    margin: 0 auto 20px;
    animation: btPop 0.6s cubic-bezier(0.34,1.56,0.64,1) both;
  }

  .bt-success-title {
    font-family: 'Syne', sans-serif;
    font-size: clamp(1.6rem, 4vw, 2.2rem);
    font-weight: 800;
    text-align: center;
    margin-bottom: 8px;
    animation: btFadeUp 0.5s 0.1s ease both;
  }

  .bt-success-sub {
    text-align: center;
    font-size: 15px; color: rgba(255,255,255,0.45);
    margin-bottom: 40px;
    animation: btFadeUp 0.5s 0.15s ease both;
  }

  /* ── TOKEN CARD ── */
  .bt-card {
    background: rgba(255,255,255,0.05);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 28px;
    overflow: hidden;
    margin-bottom: 24px;
    animation: btFadeUp 0.5s 0.2s ease both;
    position: relative;
  }

  /* Holographic shimmer top bar */
  .bt-card-top-bar {
    height: 4px;
    background: linear-gradient(90deg,
      #0057FF 0%, #00D4FF 30%, #00F5C4 60%, #0057FF 100%
    );
    background-size: 200% 100%;
    animation: btShimmer 3s linear infinite;
  }

  .bt-card-header {
    padding: 28px 32px 20px;
    display: flex; align-items: center; justify-content: space-between;
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }

  .bt-card-brand {
    display: flex; align-items: center; gap: 10px;
  }

  .bt-card-brand-logo {
    width: 32px; height: 32px; border-radius: 9px; overflow: hidden;
  }

  .bt-card-brand-logo img { width: 100%; height: 100%; object-fit: cover; }

  .bt-card-brand-name {
    font-family: 'Syne', sans-serif;
    font-size: 1rem; font-weight: 800;
  }

  .bt-card-brand-name span { color: #00D4FF; }

  .bt-confirmed-badge {
    display: flex; align-items: center; gap: 6px;
    background: rgba(0,245,196,0.1);
    border: 1px solid rgba(0,245,196,0.25);
    border-radius: 100px;
    padding: 5px 12px;
    font-size: 12px; font-weight: 600; color: #00F5C4;
  }

  .bt-confirmed-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: #00F5C4;
    animation: btPulse 2s infinite;
  }

  /* Token number section */
  .bt-token-section {
    padding: 32px;
    text-align: center;
    position: relative;
  }

  .bt-token-label {
    font-size: 11px; font-weight: 600;
    letter-spacing: 3px; text-transform: uppercase;
    color: rgba(255,255,255,0.3);
    margin-bottom: 12px;
  }

  .bt-token-number {
    font-family: 'DM Mono', monospace;
    font-size: clamp(2.8rem, 8vw, 4.5rem);
    font-weight: 500;
    background: linear-gradient(135deg, #00D4FF 0%, #00F5C4 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    line-height: 1;
    margin-bottom: 8px;
    letter-spacing: -1px;
  }

  .bt-token-sub {
    font-size: 13px; color: rgba(255,255,255,0.3);
  }

  /* Dashed divider */
  .bt-dash-divider {
    margin: 0 24px;
    border: none;
    border-top: 2px dashed rgba(255,255,255,0.07);
    position: relative;
  }

  .bt-dash-divider::before,
  .bt-dash-divider::after {
    content: '';
    position: absolute;
    top: 50%; transform: translateY(-50%);
    width: 20px; height: 20px; border-radius: 50%;
    background: #00133A;
  }

  .bt-dash-divider::before { left: -32px; }
  .bt-dash-divider::after  { right: -32px; }

  /* Info rows */
  .bt-info-grid {
    padding: 24px 32px 28px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
  }

  .bt-info-item {}

  .bt-info-label {
    font-size: 11px; font-weight: 600;
    letter-spacing: 1.5px; text-transform: uppercase;
    color: rgba(255,255,255,0.25);
    margin-bottom: 5px;
  }

  .bt-info-value {
    font-size: 14px; font-weight: 500;
    color: rgba(255,255,255,0.85);
  }

  .bt-info-item.full { grid-column: 1 / -1; }

  /* Queue access row */
  .bt-queue-row {
    margin: 0 32px 24px;
    padding: 14px 18px;
    border-radius: 14px;
    display: flex; align-items: center; gap: 14px;
  }

  .bt-queue-row.has-access {
    background: rgba(0,212,255,0.08);
    border: 1px solid rgba(0,212,255,0.2);
  }

  .bt-queue-row.no-access {
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.07);
  }

  .bt-queue-icon {
    width: 40px; height: 40px; border-radius: 12px;
    display: flex; align-items: center; justify-content: center;
    font-size: 20px; flex-shrink: 0;
  }

  .bt-queue-text { flex: 1; }
  .bt-queue-title { font-size: 14px; font-weight: 600; margin-bottom: 2px; }
  .bt-queue-desc  { font-size: 12px; color: rgba(255,255,255,0.35); }

  /* ── QUEUE POSITION ── */
  .bt-position-card {
    background: rgba(0,212,255,0.06);
    border: 1px solid rgba(0,212,255,0.2);
    border-radius: 20px;
    padding: 24px;
    margin-bottom: 24px;
    display: flex; align-items: center; gap: 20px;
    animation: btFadeUp 0.5s 0.3s ease both;
  }

  .bt-pos-circle-wrap { position: relative; flex-shrink: 0; }

  .bt-pos-circle {
    width: 64px; height: 64px; border-radius: 50%;
    background: rgba(0,212,255,0.12);
    border: 2px solid rgba(0,212,255,0.35);
    display: flex; align-items: center; justify-content: center;
    font-family: 'Syne', sans-serif;
    font-size: 1.6rem; font-weight: 800; color: #00D4FF;
  }

  .bt-pos-ring {
    position: absolute; inset: -5px;
    border-radius: 50%;
    border: 2px solid rgba(0,212,255,0.12);
    animation: btRing 2.5s ease-in-out infinite;
  }

  .bt-pos-label { font-size: 12px; color: rgba(255,255,255,0.35); margin-bottom: 4px; }
  .bt-pos-text  { font-size: 15px; font-weight: 600; color: #00D4FF; }
  .bt-pos-auto  { font-size: 11px; color: rgba(255,255,255,0.2); margin-top: 4px; }

  /* ── ACTIONS ── */
  .bt-actions {
    display: flex; flex-direction: column; gap: 12px;
    animation: btFadeUp 0.5s 0.35s ease both;
  }

  .bt-btn-primary {
    display: flex; align-items: center; justify-content: center; gap: 10px;
    width: 100%; padding: 16px;
    border-radius: 14px; border: none;
    background: linear-gradient(135deg, #0057FF, #0040CC);
    color: white;
    font-family: 'DM Sans', sans-serif;
    font-size: 16px; font-weight: 600;
    cursor: pointer; text-decoration: none;
    transition: all 0.25s;
    box-shadow: 0 6px 24px rgba(0,87,255,0.3);
  }

  .bt-btn-primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 12px 32px rgba(0,87,255,0.45);
    color: white; text-decoration: none;
  }

  .bt-btn-ghost {
    display: flex; align-items: center; justify-content: center; gap: 10px;
    width: 100%; padding: 14px;
    border-radius: 14px;
    border: 1px solid rgba(255,255,255,0.1);
    background: transparent; color: rgba(255,255,255,0.6);
    font-family: 'DM Sans', sans-serif;
    font-size: 15px; font-weight: 500;
    cursor: pointer; text-decoration: none;
    transition: all 0.2s;
  }

  .bt-btn-ghost:hover {
    background: rgba(255,255,255,0.06);
    border-color: rgba(255,255,255,0.2);
    color: white; text-decoration: none;
  }

  .bt-note {
    text-align: center;
    font-size: 12px; color: rgba(255,255,255,0.2);
    line-height: 1.6; margin-top: 20px;
    animation: btFadeUp 0.5s 0.4s ease both;
  }

  /* ── ANIMATIONS ── */
  @keyframes btPop {
    from { opacity: 0; transform: scale(0.5); }
    to   { opacity: 1; transform: scale(1); }
  }

  @keyframes btFadeUp {
    from { opacity: 0; transform: translateY(16px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  @keyframes btPulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.3; }
  }

  @keyframes btRing {
    0%   { transform: scale(1);   opacity: 0.5; }
    100% { transform: scale(1.6); opacity: 0; }
  }

  @keyframes btShimmer {
    0%   { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
`;

export default function BookingToken() {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    token, doctorName, hospital, date, slot,
    paymentId, userName, queue_access,
  } = location.state || {};

  const [queuePos,   setQueuePos]   = useState(null);
  const [bookingId,  setBookingId]  = useState(null);

  // Fetch booking id to get queue position
  useEffect(() => {
    if (!queue_access) return;
    API.get('/bookings/my/')
      .then(({ data }) => {
        const found = data.find(b => b.token === token);
        if (found) {
          setBookingId(found.id);
          setQueuePos(found.queue_position);
        }
      })
      .catch(() => {});
  }, [token, queue_access]);

  // Auto-refresh queue position every 15s
  useEffect(() => {
    if (!bookingId || !queue_access) return;
    const t = setInterval(() => {
      API.get('/bookings/my/')
        .then(({ data }) => {
          const found = data.find(b => b.id === bookingId);
          if (found) setQueuePos(found.queue_position);
        })
        .catch(() => {});
    }, 15000);
    return () => clearInterval(t);
  }, [bookingId, queue_access]);

  if (!token) {
    navigate('/alldoctor');
    return null;
  }

  const queueMsg = () => {
    if (queuePos === null) return 'Loading queue position...';
    if (queuePos === 0)    return '🎉 Your turn — please go in now!';
    if (queuePos === 1)    return "You're next! Head to the clinic";
    return `${queuePos - 1} patient${queuePos > 2 ? 's' : ''} ahead of you`;
  };

  return (
    <>
      <style>{css}</style>
      <div className="bt-wrap">
        <div className="bt-bg" />
        <div className="bt-grid" />

        <div className="bt-inner">

          {/* Success header */}
          <div className="bt-success-icon">✅</div>
          <div className="bt-success-title">Booking Confirmed!</div>
          <div className="bt-success-sub">
            Your appointment is booked. Show this token at the hospital.
          </div>

          {/* Token card */}
          <div className="bt-card">
            <div className="bt-card-top-bar" />

            <div className="bt-card-header">
              <div className="bt-card-brand">
                <div className="bt-card-brand-logo">
                  <img src="/logo.png" alt="TokenWalla" />
                </div>
                <span className="bt-card-brand-name">
                  <span>Token</span>walla
                </span>
              </div>
              <div className="bt-confirmed-badge">
                <span className="bt-confirmed-dot" />
                Confirmed
              </div>
            </div>

            <div className="bt-token-section">
              <div className="bt-token-label">Your Token Number</div>
              <div className="bt-token-number">{token}</div>
              <div className="bt-token-sub">Present this at reception</div>
            </div>

            <hr className="bt-dash-divider" />

            <div className="bt-info-grid">
              <div className="bt-info-item">
                <div className="bt-info-label">Doctor</div>
                <div className="bt-info-value">Dr. {doctorName}</div>
              </div>
              <div className="bt-info-item">
                <div className="bt-info-label">Patient</div>
                <div className="bt-info-value">{userName || '—'}</div>
              </div>
              <div className="bt-info-item">
                <div className="bt-info-label">Date</div>
                <div className="bt-info-value">{date || '—'}</div>
              </div>
              <div className="bt-info-item">
                <div className="bt-info-label">Slot</div>
                <div className="bt-info-value">{slot || '—'}</div>
              </div>
             <div className="bt-info-item full">
            <div className="bt-info-label">Hospital</div>
           <div className="bt-info-value">🏥 {hospital || '—'}</div>
           </div>
           <div className="bt-info-item full">
           <div className="bt-info-label">Doctor Contact</div>
               <div className="bt-info-value">
                        📞 
              <a
               href={`tel:${location.state?.doctorMobile}`}
            style={{ color: '#00D4FF', textDecoration: 'none' }}
              >
             {location.state?.doctorMobile || '—'}
              </a>
             </div>
          </div>
              {paymentId && (
                <div className="bt-info-item full">
                  <div className="bt-info-label">Payment ID</div>
                  <div className="bt-info-value" style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                    {paymentId}
                  </div>
                </div>
              )}
            </div>

            {/* Queue access indicator */}
            <div className={`bt-queue-row ${queue_access ? 'has-access' : 'no-access'}`}>
              <div className="bt-queue-icon" style={{
                background: queue_access ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.05)'
              }}>
                {queue_access ? '📍' : '🎫'}
              </div>
              <div className="bt-queue-text">
                <div className="bt-queue-title">
                  {queue_access ? 'Queue View Active' : 'Basic Token'}
                </div>
                <div className="bt-queue-desc">
                  {queue_access
                    ? 'You can track your live position in the queue'
                    : 'Upgrade for ₹5 to track live queue position'}
                </div>
              </div>
            </div>

          </div>

          {/* Live queue position */}
          {queue_access && (
            <div className="bt-position-card">
              <div className="bt-pos-circle-wrap">
                <div className="bt-pos-circle">
                  {queuePos ?? '—'}
                </div>
                <div className="bt-pos-ring" />
              </div>
              <div>
                <div className="bt-pos-label">Your queue position</div>
                <div className="bt-pos-text">{queueMsg()}</div>
                <div className="bt-pos-auto">Auto-refreshes every 15s</div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="bt-actions">
            <Link to="/my-bookings" className="bt-btn-primary">
              View My Bookings →
            </Link>
            <Link to="/alldoctor" className="bt-btn-ghost">
              Book Another Appointment
            </Link>
          </div>

          <p className="bt-note">
            Keep this token handy. You'll need it at the hospital reception.<br />
            For support, contact us at tokentraq@gmail.com
          </p>

        </div>
      </div>
    </>
  );
}