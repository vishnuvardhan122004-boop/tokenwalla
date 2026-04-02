// ADMIN/AdminIndex.js — Overview dashboard with blue palette
import { useEffect, useState } from 'react';
import API from '../services/api';

const STATUS_STYLES = {
  completed:   { bg: 'var(--color-success-bg)',  text: 'var(--color-success-text)',  border: 'var(--color-success-border)',  label: 'Completed'    },
  waiting:     { bg: 'var(--color-warning-bg)',  text: 'var(--color-warning-text)',  border: 'var(--color-warning-border)',  label: 'Waiting'      },
  in_progress: { bg: 'var(--blue-50)',           text: 'var(--blue-700)',            border: 'var(--blue-200)',              label: 'In Progress'  },
  cancelled:   { bg: 'var(--gray-100)',          text: 'var(--gray-600)',            border: 'var(--gray-200)',              label: 'Cancelled'    },
};

const AdminIndex = () => {
  const [stats,   setStats]   = useState({ total: 0, completed: 0, waiting: 0, bookings: [] });
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    Promise.all([
      API.get('/payment/reports/'),
      API.get('/auth/users/'),
    ])
      .then(([repRes, usrRes]) => {
        setStats(repRes.data);
        setUsers(usrRes.data);
      })
      .catch(() => setError('Failed to load dashboard data. Make sure you\'re connected.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
      <div style={{ width: 40, height: 40, border: '3px solid var(--blue-100)', borderTopColor: 'var(--blue-600)', borderRadius: '50%', animation: 'adSpin 0.7s linear infinite', marginBottom: 16 }} />
      <p style={{ color: 'var(--gray-400)', fontSize: 14 }}>Loading dashboard…</p>
      <style>{`@keyframes adSpin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (error) return (
    <div style={{ background: 'var(--color-error-bg)', border: '1px solid var(--color-error-border)', borderRadius: 14, padding: '16px 20px', color: 'var(--color-error-text)', fontSize: 14 }}>
      ⚠️ {error}
    </div>
  );

  const inProgress   = stats.bookings.filter(b => b.status === 'in_progress').length;
  const cancelled    = stats.bookings.filter(b => b.status === 'cancelled').length;
  const patientCount = users.filter(u => u.role === 'patient').length;
  const hospCount    = users.filter(u => u.role === 'hospital').length;
  const revenue      = stats.bookings.reduce((acc, b) => acc + (b.amount || 0), 0);

  return (
    <>
      <style>{`
        .ai-grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
        .ai-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px; }
        .ai-stat-card {
          background: #fff; border: 1px solid var(--blue-100); border-radius: 16px;
          padding: 20px 22px; position: relative; overflow: hidden;
        }
        .ai-stat-card::before {
          content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
        }
        .ai-stat-card.primary::before { background: var(--blue-600); }
        .ai-stat-card.success::before { background: var(--color-success-text); }
        .ai-stat-card.warning::before { background: var(--color-warning-text); }
        .ai-stat-card.info::before    { background: #0EA5E9; }
        .ai-stat-card.purple::before  { background: #7C3AED; }
        .ai-stat-card.teal::before    { background: #0D9488; }
        .ai-stat-icon { font-size: 1.6rem; margin-bottom: 10px; display: block; }
        .ai-stat-val {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 1.8rem; font-weight: 800; color: var(--gray-900); line-height: 1; margin-bottom: 4px;
        }
        .ai-stat-label { font-size: 13px; color: var(--gray-500); font-weight: 500; }
        .ai-table-card { background: #fff; border: 1px solid var(--blue-100); border-radius: 16px; overflow: hidden; }
        .ai-table-header {
          padding: 18px 22px; border-bottom: 1px solid var(--blue-50);
          display: flex; align-items: center; justify-content: space-between;
        }
        .ai-table-title { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 15px; font-weight: 700; color: var(--gray-900); }
        .ai-table-sub { font-size: 13px; color: var(--gray-400); margin-top: 2px; }
        .ai-table { width: 100%; border-collapse: collapse; }
        .ai-table th { padding: 10px 20px; text-align: left; font-size: 11px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; color: var(--gray-400); background: var(--gray-50); border-bottom: 1px solid var(--blue-50); }
        .ai-table td { padding: 13px 20px; font-size: 14px; border-bottom: 1px solid var(--blue-50); vertical-align: middle; color: var(--gray-800); }
        .ai-table tr:last-child td { border-bottom: none; }
        .ai-table tr:hover td { background: var(--blue-50); }
        .ai-status-badge { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 100px; font-size: 12px; font-weight: 600; border: 1px solid transparent; }
        .ai-token { font-family: 'DM Mono', monospace; font-size: 13px; color: var(--blue-700); font-weight: 500; }
        .ai-empty { text-align: center; padding: 40px 20px; color: var(--gray-400); font-size: 14px; }
        @media (max-width: 900px) { .ai-grid-4 { grid-template-columns: 1fr 1fr; } .ai-grid-3 { grid-template-columns: 1fr 1fr; } }
        @media (max-width: 600px) { .ai-grid-4 { grid-template-columns: 1fr 1fr; } .ai-grid-3 { grid-template-columns: 1fr; } }
      `}</style>

      {/* Page heading */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: '1.4rem', fontWeight: 800, color: 'var(--gray-900)', marginBottom: 4 }}>
          Dashboard Overview
        </h2>
        <p style={{ color: 'var(--gray-400)', fontSize: 14 }}>
          Real-time stats across the TokenWalla platform
        </p>
      </div>

      {/* Stat cards row 1 */}
      <div className="ai-grid-4">
        {[
          { icon: '👥', label: 'Total Users',    val: users.length,    cls: 'primary' },
          { icon: '🏥', label: 'Total Bookings', val: stats.total,     cls: 'info'    },
          { icon: '✅', label: 'Completed',      val: stats.completed, cls: 'success' },
          { icon: '⏳', label: 'Waiting',        val: stats.waiting,   cls: 'warning' },
        ].map(({ icon, label, val, cls }) => (
          <div className={`ai-stat-card ${cls}`} key={label}>
            <span className="ai-stat-icon">{icon}</span>
            <div className="ai-stat-val">{val}</div>
            <div className="ai-stat-label">{label}</div>
          </div>
        ))}
      </div>

      {/* Stat cards row 2 */}
      <div className="ai-grid-3">
        {[
          { icon: '🔄', label: 'In Progress',       val: inProgress,   cls: 'info'   },
          { icon: '🩺', label: 'Patients',           val: patientCount, cls: 'purple' },
          { icon: '🏨', label: 'Hospital Accounts',  val: hospCount,    cls: 'teal'   },
        ].map(({ icon, label, val, cls }) => (
          <div className={`ai-stat-card ${cls}`} key={label}>
            <span className="ai-stat-icon">{icon}</span>
            <div className="ai-stat-val">{val}</div>
            <div className="ai-stat-label">{label}</div>
          </div>
        ))}
      </div>

      {/* Recent bookings */}
      <div className="ai-table-card">
        <div className="ai-table-header">
          <div>
            <div className="ai-table-title">🕐 Recent Bookings</div>
            <div className="ai-table-sub">Last {Math.min(stats.bookings.length, 10)} bookings on the platform</div>
          </div>
          <div style={{ fontSize: 13, color: 'var(--gray-400)' }}>
            Total: {stats.total} · Revenue: ₹{revenue.toLocaleString('en-IN')}
          </div>
        </div>
        {stats.bookings.length === 0 ? (
          <div className="ai-empty">No bookings yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="ai-table">
              <thead>
                <tr>
                  <th>Token</th><th>Patient</th><th>Doctor</th>
                  <th>Date</th><th>Amount</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {stats.bookings.slice(0, 10).map(b => {
                  const st = STATUS_STYLES[b.status] || STATUS_STYLES.cancelled;
                  return (
                    <tr key={b.id}>
                      <td><span className="ai-token">{b.token}</span></td>
                      <td style={{ fontWeight: 500 }}>{b.patient_name || b.user_name || '—'}</td>
                      <td>{b.doctor_name || '—'}</td>
                      <td style={{ color: 'var(--gray-500)' }}>{b.date || '—'}</td>
                      <td style={{ fontWeight: 600 }}>₹{b.amount || 0}</td>
                      <td>
                        <span className="ai-status-badge" style={{ background: st.bg, color: st.text, borderColor: st.border }}>
                          {st.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
};

export default AdminIndex;