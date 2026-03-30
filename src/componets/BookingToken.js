import { useEffect, useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router';
import API from '../services/api';

export default function BookingToken() {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    token, doctorName, hospital, date, slot,
    paymentId, userName, queue_access,
  } = location.state || {};

  const [queuePos,  setQueuePos]  = useState(null);
  const [bookingId, setBookingId] = useState(null);

  useEffect(() => {
    if (!queue_access) return;
    API.get('/bookings/my/')
      .then(({ data }) => {
        const found = data.find(b => b.token === token);
        if (found) { setBookingId(found.id); setQueuePos(found.queue_position); }
      }).catch(() => {});
  }, [token, queue_access]);

  useEffect(() => {
    if (!bookingId || !queue_access) return;
    const t = setInterval(() => {
      API.get('/bookings/my/')
        .then(({ data }) => {
          const found = data.find(b => b.id === bookingId);
          if (found) setQueuePos(found.queue_position);
        }).catch(() => {});
    }, 15000);
    return () => clearInterval(t);
  }, [bookingId, queue_access]);

  if (!token) { navigate('/alldoctor'); return null; }

  const queueMsg = () => {
    if (queuePos === null)  return 'Loading queue position...';
    if (queuePos === 0)     return '✅ Your turn — please go in now!';
    if (queuePos === 1)     return "You're next! Head to the clinic";
    return `${queuePos - 1} patient${queuePos > 2 ? 's' : ''} ahead of you`;
  };

  return (
    <>
      <style>{`
        .bt-root {
          font-family: 'DM Sans', sans-serif;
          background: linear-gradient(160deg, var(--blue-50) 0%, #EAF3FF 50%, #F8FBFF 100%);
          min-height: 100vh; padding: 60px 0 80px; position: relative; overflow: hidden;
        }
        .bt-grid {
          position: fixed; inset: 0;
          background-image: linear-gradient(var(--blue-100) 1px, transparent 1px), linear-gradient(90deg, var(--blue-100) 1px, transparent 1px);
          background-size: 48px 48px; opacity: 0.35; pointer-events: none;
        }
        .bt-inner { position: relative; z-index: 1; max-width: 560px; margin: 0 auto; padding: 0 20px; }

        /* Success header */
        .bt-success-icon {
          width: 80px; height: 80px; border-radius: 50%;
          background: var(--color-success-bg); border: 2px solid var(--color-success-border);
          display: flex; align-items: center; justify-content: center; font-size: 2.2rem;
          margin: 0 auto 20px;
          animation: popIn 0.6s cubic-bezier(0.34,1.56,0.64,1) both;
        }
        @keyframes popIn { from{opacity:0;transform:scale(0.5)} to{opacity:1;transform:scale(1)} }
        .bt-title {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: clamp(1.6rem, 4vw, 2rem); font-weight: 800;
          text-align: center; color: var(--gray-900); margin-bottom: 8px;
        }
        .bt-sub { text-align: center; font-size: 15px; color: var(--gray-500); margin-bottom: 36px; }

        /* Token card */
        .bt-card {
          background: #fff; border: 1px solid var(--blue-100);
          border-radius: 24px; overflow: hidden; margin-bottom: 20px;
          box-shadow: 0 8px 32px rgba(24,95,165,0.1);
          animation: fadeUp 0.5s 0.2s ease both;
        }
        .bt-card-topbar {
          height: 4px;
          background: linear-gradient(90deg, var(--blue-600), var(--blue-400), #85B7EB);
          background-size: 200% 100%;
          animation: shimmer 3s linear infinite;
        }
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }

        .bt-card-header {
          padding: 20px 24px 16px;
          border-bottom: 1px solid var(--blue-50);
          display: flex; align-items: center; justify-content: space-between;
        }
        .bt-card-brand { display: flex; align-items: center; gap: 9px; }
        .bt-brand-logo { width: 30px; height: 30px; border-radius: 8px; overflow: hidden; }
        .bt-brand-logo img { width:100%;height:100%;object-fit:cover;display:block; }
        .bt-brand-name { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1rem; font-weight: 800; color: var(--gray-900); }
        .bt-brand-name .accent { color: var(--blue-600); }
        .bt-confirmed {
          display: flex; align-items: center; gap: 6px;
          background: var(--color-success-bg); border: 1px solid var(--color-success-border);
          border-radius: 100px; padding: 4px 12px; font-size: 12px; font-weight: 600; color: var(--color-success-text);
        }

        /* Token number section */
        .bt-token-section { padding: 28px 24px; text-align: center; }
        .bt-token-label { font-size: 11px; font-weight: 600; letter-spacing: 2.5px; text-transform: uppercase; color: var(--gray-400); margin-bottom: 10px; }
        .bt-token-number {
          font-family: 'DM Mono', monospace; font-size: clamp(2.8rem, 8vw, 4.5rem);
          font-weight: 500; color: var(--blue-600); line-height: 1; margin-bottom: 8px; letter-spacing: -1px;
        }
        .bt-token-sub { font-size: 13px; color: var(--gray-400); }

        /* Dashed divider */
        .bt-dashed { margin: 0 20px; border: none; border-top: 2px dashed var(--blue-100); position: relative; }
        .bt-dashed::before, .bt-dashed::after {
          content:''; position:absolute; top:50%;transform:translateY(-50%);
          width:18px;height:18px;border-radius:50%;background:var(--blue-50);
        }
        .bt-dashed::before { left:-22px; }
        .bt-dashed::after  { right:-22px; }

        /* Info grid */
        .bt-info-grid { padding: 20px 24px 24px; display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
        .bt-info-label { font-size: 11px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; color: var(--gray-400); margin-bottom: 4px; }
        .bt-info-value { font-size: 14px; font-weight: 500; color: var(--gray-800); }
        .bt-info-item.full { grid-column: 1/-1; }

        /* Queue row */
        .bt-queue-row {
          margin: 0 20px 20px;
          padding: 14px 16px; border-radius: 12px;
          display: flex; align-items: center; gap: 14px;
        }
        .bt-queue-row.has-access { background: var(--blue-50); border: 1px solid var(--blue-200); }
        .bt-queue-row.no-access  { background: var(--gray-50);  border: 1px solid var(--gray-200); }
        .bt-queue-icon { width: 38px; height: 38px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; }
        .bt-queue-title { font-size: 14px; font-weight: 600; color: var(--gray-800); margin-bottom: 2px; }
        .bt-queue-desc  { font-size: 12px; color: var(--gray-500); }

        /* Queue position card */
        .bt-pos-card {
          background: var(--blue-50); border: 1px solid var(--blue-200);
          border-radius: 18px; padding: 22px;
          display: flex; align-items: center; gap: 18px;
          margin-bottom: 20px;
          animation: fadeUp 0.5s 0.3s ease both;
        }
        .bt-pos-circle {
          width: 60px; height: 60px; border-radius: 50%;
          background: var(--blue-600); color: #fff;
          display: flex; align-items: center; justify-content: center;
          font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1.5rem; font-weight: 800;
          flex-shrink: 0; position: relative;
        }
        .bt-pos-ring {
          position: absolute; inset: -4px; border-radius: 50%;
          border: 2px solid rgba(24,95,165,0.25);
          animation: ring 2.5s ease-in-out infinite;
        }
        @keyframes ring { 0%{transform:scale(1);opacity:0.6} 100%{transform:scale(1.5);opacity:0} }
        .bt-pos-label { font-size: 12px; color: var(--gray-500); margin-bottom: 4px; }
        .bt-pos-text  { font-size: 15px; font-weight: 600; color: var(--blue-700); }

        /* Actions */
        .bt-actions { display: flex; flex-direction: column; gap: 12px; animation: fadeUp 0.5s 0.35s ease both; }
        .bt-note { text-align: center; font-size: 12px; color: var(--gray-400); line-height: 1.6; margin-top: 18px; }
      `}</style>

      <div className="bt-root">
        <div className="bt-grid" />
        <div className="bt-inner">

          {/* Success header */}
          <div className="bt-success-icon">✅</div>
          <div className="bt-title">Booking Confirmed!</div>
          <p className="bt-sub">Your appointment is booked. Show this token at the hospital.</p>

          {/* Token card */}
          <div className="bt-card">
            <div className="bt-card-topbar" />
            <div className="bt-card-header">
              <div className="bt-card-brand">
                <div className="bt-brand-logo"><img src="/logo.png" alt="TokenWalla" /></div>
                <span className="bt-brand-name"><span className="accent">Token</span>walla</span>
              </div>
              <div className="bt-confirmed">
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-success-text)', animation: 'twPulse 2s infinite', flexShrink: 0 }} />
                Confirmed
              </div>
            </div>

            <div className="bt-token-section">
              <div className="bt-token-label">Your Token Number</div>
              <div className="bt-token-number">{token}</div>
              <div className="bt-token-sub">Present this at reception</div>
            </div>

            <hr className="bt-dashed" />

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
                  📞{' '}
                  <a href={`tel:${location.state?.doctorMobile}`} style={{ color: 'var(--blue-600)', textDecoration: 'none', fontWeight: 500 }}>
                    {location.state?.doctorMobile || '—'}
                  </a>
                </div>
              </div>
              {paymentId && (
                <div className="bt-info-item full">
                  <div className="bt-info-label">Payment ID</div>
                  <div className="bt-info-value" style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: 'var(--gray-400)' }}>{paymentId}</div>
                </div>
              )}
            </div>

            {/* Queue access indicator */}
            <div className={`bt-queue-row ${queue_access ? 'has-access' : 'no-access'}`}>
              <div className="bt-queue-icon" style={{ background: queue_access ? 'var(--blue-100)' : 'var(--gray-100)' }}>
                {queue_access ? '📍' : '🎫'}
              </div>
              <div>
                <div className="bt-queue-title">{queue_access ? 'Queue View Active' : 'Basic Token'}</div>
                <div className="bt-queue-desc">
                  {queue_access ? 'You can track your live position in the queue' : 'Basic token only — no live tracking'}
                </div>
              </div>
            </div>
          </div>

          {/* Live queue position */}
          {queue_access && (
            <div className="bt-pos-card">
              <div className="bt-pos-circle">
                {queuePos ?? '—'}
                <div className="bt-pos-ring" />
              </div>
              <div>
                <div className="bt-pos-label">Your queue position</div>
                <div className="bt-pos-text">{queueMsg()}</div>
                <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 3 }}>Auto-refreshes every 15s</div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="bt-actions">
            <Link to="/my-bookings" className="btn-primary" style={{ justifyContent: 'center', padding: 15, borderRadius: 12, fontSize: 15 }}>
              View My Bookings →
            </Link>
            <Link to="/alldoctor" className="btn-outline" style={{ justifyContent: 'center', padding: 14, borderRadius: 12, fontSize: 15 }}>
              Book Another Appointment
            </Link>
          </div>

          <p className="bt-note">
            Keep this token handy. You'll need it at the hospital reception.<br />
            For support, contact us at tokentraq@gmail.com
          </p>
        </div>
      </div>
      <style>{`@keyframes twPulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
    </>
  );
}