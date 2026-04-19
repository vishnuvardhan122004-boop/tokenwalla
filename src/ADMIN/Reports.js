import { useEffect, useState } from 'react';
import API from '../services/api';

const STATUS_STYLES = {
  completed:   { bg: 'var(--color-success-bg)',  text: 'var(--color-success-text)',  border: 'var(--color-success-border)',  label: 'Completed'   },
  waiting:     { bg: 'var(--color-warning-bg)',  text: 'var(--color-warning-text)',  border: 'var(--color-warning-border)',  label: 'Waiting'     },
  in_progress: { bg: 'var(--blue-50)',           text: 'var(--blue-700)',            border: 'var(--blue-200)',              label: 'In Progress' },
  cancelled:   { bg: 'var(--gray-100)',          text: 'var(--gray-600)',            border: 'var(--gray-200)',              label: 'Cancelled'   },
};

const Reports = () => {
  const [data,    setData]    = useState({ total: 0, completed: 0, waiting: 0, bookings: [] });
  const [loading, setLoading] = useState(false);
  const [filter,  setFilter]  = useState('all');
  const [search,  setSearch]  = useState('');
  const [error,   setError]   = useState('');

  useEffect(() => {
    setLoading(true);
    API.get('/payment/reports/')
      .then(({ data: raw }) => {
        // AdminReportsView returns flat { total, completed, waiting, bookings: [] }
        setData({
          total:     raw.total     || 0,
          completed: raw.completed || 0,
          waiting:   raw.waiting   || 0,
          bookings:  Array.isArray(raw.bookings) ? raw.bookings : [],
        });
      })
      .catch(() => setError('Failed to load reports.'))
      .finally(() => setLoading(false));
  }, []);

  const bookingsArr = data.bookings;
  const inProgress  = bookingsArr.filter(b => b.status === 'in_progress').length;
  const revenue     = bookingsArr.reduce((a, b) => a + (b.amount || 0), 0);

  const filtered = bookingsArr.filter(b => {
    const matchStatus = filter === 'all' || b.status === filter;
    const q           = search.toLowerCase();
    const matchSearch = !search ||
      (b.token        || '').toLowerCase().includes(q) ||
      (b.patient_name || '').toLowerCase().includes(q) ||
      (b.doctor_name  || '').toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  return (
    <>
      <style>{`
        .rp-header { margin-bottom: 24px; }
        .rp-title { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1.4rem; font-weight: 800; color: var(--gray-900); margin-bottom: 4px; }
        .rp-sub { font-size: 14px; color: var(--gray-400); }
        .rp-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
        .rp-stat { background: #fff; border: 1px solid var(--blue-100); border-radius: 16px; padding: 20px 22px; position: relative; overflow: hidden; }
        .rp-stat::before { content:''; position:absolute; top:0;left:0;right:0;height:3px; }
        .rp-stat.p::before { background: var(--blue-600); }
        .rp-stat.s::before { background: var(--color-success-text); }
        .rp-stat.w::before { background: var(--color-warning-text); }
        .rp-stat.i::before { background: #0EA5E9; }
        .rp-stat-val { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1.8rem; font-weight: 800; color: var(--gray-900); line-height: 1; margin-bottom: 4px; }
        .rp-stat-label { font-size: 13px; color: var(--gray-500); }
        .rp-revenue { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1.3rem; font-weight: 800; color: var(--blue-600); }
        .rp-toolbar { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; margin-bottom: 16px; }
        .rp-search-wrap { position: relative; }
        .rp-search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); font-size: 14px; color: var(--gray-400); pointer-events: none; }
        .rp-search { background: #fff; border: 1px solid var(--blue-100); border-radius: 11px; padding: 10px 14px 10px 36px; font-family: 'DM Sans', sans-serif; font-size: 14px; outline: none; width: 220px; transition: all 0.15s; }
        .rp-search:focus { border-color: var(--blue-400); box-shadow: 0 0 0 3px rgba(55,138,221,0.12); }
        .rp-filter-btn { padding: 9px 14px; border-radius: 10px; border: 1px solid var(--blue-100); background: #fff; font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 500; color: var(--gray-600); cursor: pointer; transition: all 0.15s; }
        .rp-filter-btn.active { background: var(--blue-600); color: #fff; border-color: var(--blue-600); }
        .rp-filter-btn:hover:not(.active) { border-color: var(--blue-300); color: var(--blue-700); background: var(--blue-50); }
        .rp-count { margin-left: auto; font-size: 13px; color: var(--gray-400); }
        .rp-card { background: #fff; border: 1px solid var(--blue-100); border-radius: 16px; overflow: hidden; }
        .rp-table { width: 100%; border-collapse: collapse; }
        .rp-table th { padding: 11px 18px; text-align: left; font-size: 11px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; color: var(--gray-400); background: var(--gray-50); border-bottom: 1px solid var(--blue-50); }
        .rp-table td { padding: 12px 18px; font-size: 14px; border-bottom: 1px solid var(--blue-50); vertical-align: middle; color: var(--gray-800); }
        .rp-table tr:last-child td { border-bottom: none; }
        .rp-table tr:hover td { background: var(--blue-50); }
        .rp-badge { display: inline-flex; align-items: center; padding: 3px 10px; border-radius: 100px; font-size: 12px; font-weight: 600; border: 1px solid transparent; }
        .rp-token { font-family: 'DM Mono', monospace; font-size: 13px; color: var(--blue-700); font-weight: 500; }
        .rp-empty { text-align: center; padding: 60px 20px; color: var(--gray-400); font-size: 14px; }
        @media (max-width: 900px) { .rp-stats { grid-template-columns: 1fr 1fr; } }
      `}</style>

      <div className="rp-header">
        <div className="rp-title">📋 Booking Reports</div>
        <div className="rp-sub">Detailed view of all platform bookings and revenue</div>
      </div>

      {error && (
        <div style={{ background: 'var(--color-error-bg)', border: '1px solid var(--color-error-border)', borderRadius: 12, padding: '12px 16px', color: 'var(--color-error-text)', fontSize: 14, marginBottom: 20 }}>
          ⚠️ {error}
        </div>
      )}

      <div className="rp-stats">
        <div className="rp-stat p">
          <div style={{ fontSize: '1.4rem', marginBottom: 8 }}>📊</div>
          <div className="rp-stat-val">{data.total}</div>
          <div className="rp-stat-label">Total Bookings</div>
        </div>
        <div className="rp-stat s">
          <div style={{ fontSize: '1.4rem', marginBottom: 8 }}>✅</div>
          <div className="rp-stat-val">{data.completed}</div>
          <div className="rp-stat-label">Completed</div>
        </div>
        <div className="rp-stat w">
          <div style={{ fontSize: '1.4rem', marginBottom: 8 }}>⏳</div>
          <div className="rp-stat-val">{data.waiting}</div>
          <div className="rp-stat-label">Waiting</div>
        </div>
        <div className="rp-stat i">
          <div style={{ fontSize: '1.4rem', marginBottom: 8 }}>💰</div>
          <div className="rp-revenue">₹{revenue.toLocaleString('en-IN')}</div>
          <div className="rp-stat-label">Total Revenue</div>
        </div>
      </div>

      <div className="rp-toolbar">
        <div className="rp-search-wrap">
          <span className="rp-search-icon">🔍</span>
          <input
            className="rp-search"
            placeholder="Search token, patient…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {['all', 'waiting', 'in_progress', 'completed', 'cancelled'].map(s => (
          <button
            key={s}
            className={`rp-filter-btn ${filter === s ? 'active' : ''}`}
            onClick={() => setFilter(s)}
          >
            {s === 'all' ? 'All' : s.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
          </button>
        ))}
        <span className="rp-count">{filtered.length} bookings</span>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
          <div style={{ width: 36, height: 36, border: '3px solid var(--blue-100)', borderTopColor: 'var(--blue-600)', borderRadius: '50%', animation: 'adSpin 0.7s linear infinite' }} />
          <style>{`@keyframes adSpin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : (
        <div className="rp-card">
          <div style={{ overflowX: 'auto' }}>
            <table className="rp-table">
              <thead>
                <tr>
                  <th>Token</th>
                  <th>Patient</th>
                  <th>Doctor</th>
                  <th>Hospital</th>
                  <th>Date</th>
                  <th>Slot</th>
                  <th>₹</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="rp-empty">No bookings match your filter</td></tr>
                )}
                {filtered.map(b => {
                  const st = STATUS_STYLES[b.status] || STATUS_STYLES.cancelled;
                  return (
                    <tr key={b.id}>
                      <td><span className="rp-token">{b.token}</span></td>
                      <td style={{ fontWeight: 500 }}>{b.patient_name || '—'}</td>
                      <td>{b.doctor_name || '—'}</td>
                      <td style={{ color: 'var(--gray-500)' }}>{b.hospital_name || '—'}</td>
                      <td style={{ color: 'var(--gray-500)' }}>{b.date || '—'}</td>
                      <td style={{ color: 'var(--gray-500)' }}>{b.slot || '—'}</td>
                      <td style={{ fontWeight: 600 }}>₹{b.amount || 0}</td>
                      <td>
                        <span className="rp-badge" style={{ background: st.bg, color: st.text, borderColor: st.border }}>
                          {st.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
};

export default Reports;