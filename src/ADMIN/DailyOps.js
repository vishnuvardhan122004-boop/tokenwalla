import { useEffect, useState } from 'react';
import { NavLink } from 'react-router';
import API from '../services/api';

// The daily check. Doctor payouts are MANUAL by design — Razorpay settles to
// TokenWalla, we wire each doctor from the Slice current account, then mark it
// paid on the payouts page. This card exists to make that daily human check
// fast: what came in today, what's owed, and what needs a person.
//
// Read-only. It never moves money.

const rupees = (v) =>
  `₹${Number(v || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;

// Exported for testing: the four numbers, in the order they matter.
//
// `gross` and `revenue` are deliberately separate cards. Gross is what landed
// in the Razorpay account, most of which is owed onward to doctors and to the
// government — reading it as earnings is the single easiest way to get a payout
// wrong, so the card labels say so.
export const buildCards = (summary) => {
  const b = summary?.bookings || {};
  const c = summary?.collected || {};
  const p = summary?.payouts || {};
  return [
    {
      key: 'bookings',
      label: 'Bookings today',
      value: String(b.total ?? 0),
      sub: `${b.completed ?? 0} completed · ${b.confirmed ?? 0} upcoming`,
      accent: '#185FA5',
    },
    {
      key: 'collected',
      label: 'Collected today',
      value: rupees(c.gross),
      sub: 'gross into Razorpay',
      accent: '#0EA5E9',
    },
    {
      key: 'revenue',
      label: 'Our revenue',
      value: rupees(c.tokenwalla_revenue),
      sub: 'service fee only — GST & doctor fees excluded',
      accent: '#3B6D11',
    },
    {
      key: 'owed',
      label: 'Owed to doctors',
      value: rupees(p.total_owed),
      sub: `${p.doctors_owed ?? 0} doctor${(p.doctors_owed ?? 0) === 1 ? '' : 's'} waiting`,
      accent: (Number(p.total_owed) || 0) > 0 ? '#854F0B' : '#64748B',
    },
  ];
};

const TONE = {
  high:   { bg: '#FCEBEB', border: '#F09595', text: '#A32D2D', icon: '🔴' },
  medium: { bg: '#FAEEDA', border: '#EF9F27', text: '#854F0B', icon: '🟡' },
};

const DailyOps = () => {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    API.get('/payment/daily-summary/')
      .then(({ data }) => { setSummary(data); setError(''); })
      .catch(() => setError('Could not load today’s summary.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;

  if (error) return (
    <div className="dops-err">⚠️ {error}</div>
  );

  const attention = summary?.attention || [];
  const dateLabel = summary?.date
    ? new Date(`${summary.date}T00:00:00`).toLocaleDateString('en-IN', {
        weekday: 'short', day: 'numeric', month: 'short',
      })
    : '';

  return (
    <>
      <style>{`
        .dops { background:#fff; border:1px solid #B5D4F4; border-radius:16px; padding:18px 20px; margin-bottom:20px; }
        .dops-top { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:14px; flex-wrap:wrap; }
        .dops-title { font-family:'Plus Jakarta Sans',sans-serif; font-size:14px; font-weight:800; color:#0F172A; }
        .dops-date { font-size:12px; color:#94A3B8; margin-left:8px; font-weight:500; }
        .dops-clear { display:inline-flex; align-items:center; gap:6px; background:#EAF3DE; border:1px solid #97C459; color:#3B6D11; border-radius:100px; padding:4px 12px; font-size:12px; font-weight:700; }
        .dops-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; }
        .dops-card { border:1px solid #E6F1FB; border-radius:12px; padding:14px; background:#F8FAFC; }
        .dops-card-label { font-size:11px; font-weight:700; letter-spacing:0.6px; text-transform:uppercase; color:#94A3B8; margin-bottom:6px; }
        .dops-card-val { font-family:'Plus Jakarta Sans',sans-serif; font-size:1.35rem; font-weight:800; line-height:1.1; margin-bottom:4px; }
        .dops-card-sub { font-size:11px; color:#94A3B8; line-height:1.35; }
        .dops-att { margin-bottom:14px; display:flex; flex-direction:column; gap:8px; }
        .dops-item { display:flex; align-items:flex-start; gap:10px; border-radius:10px; padding:10px 13px; font-size:13px; line-height:1.4; }
        .dops-link { display:inline-block; margin-top:12px; font-size:12px; font-weight:700; color:#185FA5; text-decoration:none; }
        .dops-link:hover { text-decoration:underline; }
        .dops-err { background:#FCEBEB; border:1px solid #F09595; border-radius:12px; padding:12px 16px; color:#A32D2D; font-size:13px; margin-bottom:20px; }
        @media(max-width:900px){ .dops-grid{grid-template-columns:repeat(2,1fr);} }
        @media(max-width:500px){ .dops-grid{grid-template-columns:1fr;} }
      `}</style>

      <div className="dops">
        <div className="dops-top">
          <div>
            <span className="dops-title">Today’s check</span>
            <span className="dops-date">{dateLabel}</span>
          </div>
          {attention.length === 0 && (
            <span className="dops-clear">✓ Nothing needs you</span>
          )}
        </div>

        {attention.length > 0 && (
          <div className="dops-att">
            {attention.map((item) => {
              const tone = TONE[item.severity] || TONE.medium;
              return (
                <div
                  key={item.code}
                  className="dops-item"
                  style={{ background: tone.bg, border: `1px solid ${tone.border}`, color: tone.text }}
                >
                  <span>{tone.icon}</span>
                  <span>{item.message}</span>
                </div>
              );
            })}
          </div>
        )}

        <div className="dops-grid">
          {buildCards(summary).map((card) => (
            <div key={card.key} className="dops-card">
              <div className="dops-card-label">{card.label}</div>
              <div className="dops-card-val" style={{ color: card.accent }}>{card.value}</div>
              <div className="dops-card-sub">{card.sub}</div>
            </div>
          ))}
        </div>

        <NavLink to="payouts" className="dops-link">
          Go to payouts to wire and mark paid →
        </NavLink>
      </div>
    </>
  );
};

export default DailyOps;
