// ADMIN/Adashboard.js — with pending-hospital badge on sidebar nav
import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router';
import API from '../services/api';

/* ── Overview panel ─────────────────────────────────────────────────────────── */
const Overview = ({ pendingCount }) => {
  const [stats,   setStats]   = useState({ total: 0, completed: 0, waiting: 0, bookings: [] });
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    Promise.all([
      API.get('/payment/reports/'),
      API.get('/auth/users/?page_size=500'),
    ])
      .then(([rReports, rUsers]) => {
        setStats(rReports.data);
        const rawUsers = rUsers.data;
        if (Array.isArray(rawUsers))        setUsers(rawUsers);
        else if (rawUsers?.results)         setUsers(rawUsers.results);
        else                                setUsers([]);
      })
      .catch(() => setError('Failed to load dashboard data.'))
      .finally(() => setLoading(false));
  }, []);

  const STATUS_STYLES = {
    completed:   { bg: '#EAF3DE', text: '#3B6D11', border: '#97C459', label: 'Completed'   },
    waiting:     { bg: '#FAEEDA', text: '#854F0B', border: '#EF9F27', label: 'Waiting'     },
    in_progress: { bg: '#E6F1FB', text: '#185FA5', border: '#85B7EB', label: 'In Progress' },
    cancelled:   { bg: '#F1F5F9', text: '#64748B', border: '#E2E8F0', label: 'Cancelled'   },
  };

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
      <div style={{ width: 36, height: 36, border: '3px solid #B5D4F4', borderTopColor: '#185FA5', borderRadius: '50%', animation: 'ovSpin 0.7s linear infinite' }} />
      <style>{`@keyframes ovSpin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (error) return (
    <div style={{ background: '#FCEBEB', border: '1px solid #F09595', borderRadius: 12, padding: '14px 18px', color: '#A32D2D', fontSize: 14 }}>
      ⚠️ {error}
    </div>
  );

  const bookingsArr  = Array.isArray(stats.bookings) ? stats.bookings : [];
  const inProgress   = bookingsArr.filter(b => b.status === 'in_progress').length;
  const patientCount = users.filter(u => u.role === 'patient').length;
  const hospCount    = users.filter(u => u.role === 'hospital').length;
  const revenue      = bookingsArr.reduce((a, b) => a + (b.amount || 0), 0);

  const statCards = [
    { icon: '👥', label: 'Total Users',    val: users.length,         accent: '#185FA5' },
    { icon: '🏥', label: 'Total Bookings', val: stats.total || 0,     accent: '#0EA5E9' },
    { icon: '✅', label: 'Completed',      val: stats.completed || 0,  accent: '#3B6D11' },
    { icon: '⏳', label: 'Waiting',        val: stats.waiting || 0,   accent: '#854F0B' },
    { icon: '🔄', label: 'In Progress',    val: inProgress,           accent: '#0EA5E9' },
    { icon: '🩺', label: 'Patients',       val: patientCount,         accent: '#7C3AED' },
    { icon: '🏨', label: 'Hospitals',      val: hospCount,            accent: '#0D9488' },
    { icon: '💰', label: 'Revenue',        val: `₹${revenue.toLocaleString('en-IN')}`, accent: '#185FA5' },
  ];

  return (
    <>
      <style>{`
        .ov-heading { margin-bottom: 22px; }
        .ov-heading h2 { font-family:'Plus Jakarta Sans',sans-serif; font-size:1.35rem; font-weight:800; color:#0F172A; margin-bottom:3px; }
        .ov-heading p  { font-size:13px; color:#94A3B8; }
        .ov-alert { display:flex; align-items:flex-start; gap:12px; background:#FAEEDA; border:1px solid #EF9F27; border-radius:14px; padding:14px 18px; margin-bottom:20px; }
        .ov-alert-icon { font-size:1.2rem; flex-shrink:0; margin-top:1px; }
        .ov-alert-text { font-size:14px; font-weight:600; color:#854F0B; margin-bottom:2px; }
        .ov-alert-sub  { font-size:12px; color:#854F0B; opacity:0.75; }
        .ov-alert-link { display:inline-flex; align-items:center; gap:5px; margin-top:8px; background:rgba(255,255,255,0.7); border:1px solid #EF9F27; border-radius:7px; padding:5px 12px; font-size:12px; font-weight:700; color:#854F0B; text-decoration:none; cursor:pointer; }
        .ov-alert-link:hover { background:#fff; }
        .ov-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:24px; }
        .ov-card { background:#fff; border:1px solid #B5D4F4; border-radius:16px; padding:20px 18px; position:relative; overflow:hidden; }
        .ov-card-bar { position:absolute; top:0; left:0; right:0; height:3px; }
        .ov-card-icon { font-size:1.5rem; margin-bottom:10px; display:block; }
        .ov-card-val { font-family:'Plus Jakarta Sans',sans-serif; font-size:1.75rem; font-weight:800; color:#0F172A; line-height:1; margin-bottom:3px; }
        .ov-card-label { font-size:13px; color:#64748B; }
        .ov-table-wrap { background:#fff; border:1px solid #B5D4F4; border-radius:16px; overflow:hidden; }
        .ov-table-head { padding:16px 20px; border-bottom:1px solid #E6F1FB; display:flex; align-items:center; justify-content:space-between; }
        .ov-table-title { font-family:'Plus Jakarta Sans',sans-serif; font-size:14px; font-weight:700; color:#0F172A; }
        .ov-table-sub   { font-size:12px; color:#94A3B8; }
        table.ov-table  { width:100%; border-collapse:collapse; }
        table.ov-table th { padding:10px 18px; text-align:left; font-size:11px; font-weight:600; letter-spacing:1px; text-transform:uppercase; color:#94A3B8; background:#F8FAFC; border-bottom:1px solid #E6F1FB; }
        table.ov-table td { padding:12px 18px; font-size:14px; border-bottom:1px solid #E6F1FB; color:#1E293B; vertical-align:middle; }
        table.ov-table tr:last-child td { border-bottom:none; }
        table.ov-table tr:hover td { background:#F4F9FF; }
        .ov-token  { font-family:'DM Mono',monospace; font-size:13px; color:#185FA5; font-weight:500; }
        .ov-badge  { display:inline-flex; align-items:center; padding:3px 10px; border-radius:100px; font-size:12px; font-weight:600; border:1px solid transparent; }
        .ov-empty  { text-align:center; padding:48px 20px; color:#94A3B8; font-size:14px; }
        @media(max-width:900px){ .ov-grid{grid-template-columns:repeat(2,1fr);} }
        @media(max-width:500px){ .ov-grid{grid-template-columns:1fr 1fr;} }
      `}</style>

      <div className="ov-heading">
        <h2>Platform Overview</h2>
        <p>Real-time stats across the TokenWalla platform</p>
      </div>

      {/* Pending hospitals alert on overview */}
      {pendingCount > 0 && (
        <div className="ov-alert">
          <div className="ov-alert-icon">🔔</div>
          <div>
            <div className="ov-alert-text">
              {pendingCount} hospital{pendingCount > 1 ? 's' : ''} awaiting approval
            </div>
            <div className="ov-alert-sub">
              These hospitals have registered but cannot log in until you approve them.
            </div>
            <NavLink to="hospitals" className="ov-alert-link">
              Review now →
            </NavLink>
          </div>
        </div>
      )}

      <div className="ov-grid">
        {statCards.map(({ icon, label, val, accent }) => (
          <div className="ov-card" key={label}>
            <div className="ov-card-bar" style={{ background: accent }} />
            <span className="ov-card-icon">{icon}</span>
            <div className="ov-card-val">{val}</div>
            <div className="ov-card-label">{label}</div>
          </div>
        ))}
      </div>

      <div className="ov-table-wrap">
        <div className="ov-table-head">
          <div>
            <div className="ov-table-title">🕐 Recent Bookings</div>
            <div className="ov-table-sub">
              Last {Math.min(bookingsArr.length, 10)} · Revenue ₹{revenue.toLocaleString('en-IN')}
            </div>
          </div>
        </div>
        {bookingsArr.length === 0 ? (
          <div className="ov-empty">No bookings yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="ov-table">
              <thead>
                <tr>
                  <th>Token</th><th>Patient</th><th>Doctor</th>
                  <th>Date</th><th>₹</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {bookingsArr.slice(0, 10).map(b => {
                  const st = STATUS_STYLES[b.status] || STATUS_STYLES.cancelled;
                  return (
                    <tr key={b.id}>
                      <td><span className="ov-token">{b.token}</span></td>
                      <td style={{ fontWeight: 500 }}>{b.patient_name || b.user_name || '—'}</td>
                      <td style={{ color: '#64748B' }}>{b.doctor_name || '—'}</td>
                      <td style={{ color: '#64748B' }}>{b.date || '—'}</td>
                      <td style={{ fontWeight: 600 }}>₹{b.amount || 0}</td>
                      <td>
                        <span className="ov-badge" style={{ background: st.bg, color: st.text, borderColor: st.border }}>
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

/* ── Shell ───────────────────────────────────────────────────────────────────── */
const Adashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [user,         setUser]         = useState(null);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const stored = localStorage.getItem('user');
    try {
      if (!stored) { navigate('/2004'); return; }
      const u = JSON.parse(stored);
      if (u.role !== 'admin') { navigate('/2004'); return; }
      setUser(u);
    } catch { navigate('/2004'); }
  }, [navigate]);

  // ── Fetch pending hospital count for the badge ──
  useEffect(() => {
    API.get('/hospitals/admin/all/')
      .then(({ data }) => {
        const list  = Array.isArray(data) ? data : data?.results || [];
        setPendingCount(list.filter(h => h.status === 'pending').length);
      })
      .catch(() => {});
  }, [location.pathname]); // refresh count when navigating between admin pages

  const logout = () => {
    localStorage.removeItem('access');
    localStorage.removeItem('refresh');
    localStorage.removeItem('user');
    navigate('/');
    window.location.reload();
  };

  const initials = (name) =>
    name ? name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) : 'AD';

  const isOverview = location.pathname === '/Adashboard' || location.pathname === '/Adashboard/';

  const PAGE_LABELS = {
    '/Adashboard/user-management': 'User Management',
    '/Adashboard/hospitals':       'Hospitals & Doctors',
    '/Adashboard/reports':         'Reports',
    '/Adashboard/support':         'Support',
    '/Adashboard/settings':        'Settings',
  };
  const pageLabel = PAGE_LABELS[location.pathname] || 'Overview';

  const NAV_ITEMS = [
    { to: 'user-management', icon: '👥', label: 'User Management',     badge: null         },
    { to: 'hospitals',       icon: '🏥', label: 'Hospitals / Doctors',  badge: pendingCount },
    { to: 'reports',         icon: '📋', label: 'Reports',              badge: null         },
    { to: 'support',         icon: '🎧', label: 'Support',              badge: null         },
    { to: 'settings',        icon: '⚙️', label: 'Settings',             badge: null         },
  ];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        .adb-shell { display:flex; min-height:100vh; font-family:'DM Sans',sans-serif; }
        .adb-aside { width:240px; flex-shrink:0; background:#042C53; display:flex; flex-direction:column; position:sticky; top:0; height:100vh; overflow-y:auto; }
        .adb-brand { display:flex; align-items:center; gap:10px; padding:20px 18px 18px; border-bottom:1px solid rgba(255,255,255,0.08); }
        .adb-brand-logo { width:36px; height:36px; border-radius:10px; overflow:hidden; flex-shrink:0; box-shadow:0 2px 8px rgba(0,0,0,0.3); }
        .adb-brand-logo img { width:100%; height:100%; object-fit:cover; display:block; }
        .adb-brand-name { font-family:'Plus Jakarta Sans',sans-serif; font-size:1rem; font-weight:800; color:#fff; line-height:1.2; margin:0; }
        .adb-brand-name .acc { color:#85B7EB; }
        .adb-brand-sub { font-size:10px; color:rgba(255,255,255,0.35); margin:0; }
        .adb-nav { flex:1; padding:12px 10px; }
        .adb-nav-label { font-size:10px; font-weight:700; letter-spacing:2px; text-transform:uppercase; color:rgba(255,255,255,0.25); padding:10px 10px 6px; display:block; }
        .adb-nav-link { display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:10px; margin-bottom:2px; font-size:14px; font-weight:500; color:rgba(255,255,255,0.55); text-decoration:none; transition:all 0.15s; position:relative; }
        .adb-nav-link:hover { background:rgba(255,255,255,0.06); color:rgba(255,255,255,0.9); text-decoration:none; }
        .adb-nav-link.active { background:#185FA5; color:#fff; font-weight:600; }
        .adb-nav-icon { width:30px; height:30px; border-radius:8px; background:rgba(255,255,255,0.07); display:flex; align-items:center; justify-content:center; font-size:14px; flex-shrink:0; }
        .adb-nav-link.active .adb-nav-icon { background:rgba(255,255,255,0.15); }

        /* ── Pending badge on nav item ── */
        .adb-nav-badge {
          margin-left: auto;
          background: #EF9F27; color: #fff;
          border-radius: 100px; padding: 1px 8px;
          font-size: 11px; font-weight: 800;
          animation: adbBadgePulse 2.5s ease-in-out infinite;
          flex-shrink: 0;
        }
        @keyframes adbBadgePulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.75;transform:scale(0.95)} }

        .adb-footer { padding:12px 10px; border-top:1px solid rgba(255,255,255,0.08); }
        .adb-user-row { display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:10px; background:rgba(255,255,255,0.05); margin-bottom:8px; }
        .adb-avatar { width:30px; height:30px; border-radius:50%; background:#185FA5; color:#fff; display:flex; align-items:center; justify-content:center; font-family:'Plus Jakarta Sans',sans-serif; font-size:11px; font-weight:800; flex-shrink:0; }
        .adb-user-name { font-size:13px; font-weight:600; color:rgba(255,255,255,0.8); margin:0; }
        .adb-user-role { font-size:10px; color:rgba(255,255,255,0.3); margin:0; }
        .adb-logout { display:flex; align-items:center; gap:8px; width:100%; padding:9px 12px; border-radius:9px; background:rgba(163,45,45,0.15); border:1px solid rgba(240,149,149,0.2); color:#F09595; font-size:13px; font-weight:500; cursor:pointer; transition:all 0.15s; font-family:'DM Sans',sans-serif; }
        .adb-logout:hover { background:rgba(163,45,45,0.25); border-color:rgba(240,149,149,0.4); }
        .adb-main { flex:1; display:flex; flex-direction:column; background:#F4F9FF; min-height:100vh; }
        .adb-topbar { background:#fff; border-bottom:1px solid #B5D4F4; padding:0 28px; height:60px; display:flex; align-items:center; justify-content:space-between; position:sticky; top:0; z-index:100; flex-shrink:0; }
        .adb-page-title { font-family:'Plus Jakarta Sans',sans-serif; font-size:1rem; font-weight:700; color:#0F172A; margin:0; display:flex; align-items:center; gap:10px; }
        .adb-topbar-pending { background: #FAEEDA; border: 1px solid #EF9F27; border-radius: 100px; padding: 3px 12px; font-size: 12px; font-weight: 700; color: #854F0B; }
        .adb-badge { display:flex; align-items:center; gap:6px; background:#E6F1FB; border:1px solid #B5D4F4; border-radius:100px; padding:4px 12px; font-size:12px; font-weight:600; color:#185FA5; }
        .adb-dot { width:6px; height:6px; border-radius:50%; background:#3B6D11; animation:adbPulse 2s infinite; }
        @keyframes adbPulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        .adb-content { flex:1; padding:28px; }
        @media (max-width: 800px) { .adb-aside { display:none; } .adb-content { padding:16px; } .adb-topbar { padding:0 16px; } }
      `}</style>

      <div className="adb-shell">
        <aside className="adb-aside">
          <div className="adb-brand">
            <div className="adb-brand-logo"><img src="/logo.png" alt="TW" /></div>
            <div>
              <div className="adb-brand-name"><span className="acc">Token</span>walla</div>
              <div className="adb-brand-sub">Admin Panel</div>
            </div>
          </div>

          <nav className="adb-nav">
            <span className="adb-nav-label">Navigation</span>
            {NAV_ITEMS.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `adb-nav-link${isActive ? ' active' : ''}`}
              >
                <span className="adb-nav-icon">{item.icon}</span>
                {item.label}
                {item.badge > 0 && (
                  <span className="adb-nav-badge">{item.badge}</span>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="adb-footer">
            {user && (
              <div className="adb-user-row">
                <div className="adb-avatar">{initials(user.name || user.username)}</div>
                <div>
                  <div className="adb-user-name">{user.name || user.username || 'Admin'}</div>
                  <div className="adb-user-role">Administrator</div>
                </div>
              </div>
            )}
            <button className="adb-logout" onClick={logout}>🚪 Sign Out</button>
          </div>
        </aside>

        <main className="adb-main">
          <div className="adb-topbar">
            <div className="adb-page-title">
              Admin Dashboard — {pageLabel}
              {pageLabel === 'Hospitals & Doctors' && pendingCount > 0 && (
                <span className="adb-topbar-pending">⏳ {pendingCount} pending</span>
              )}
            </div>
            <div className="adb-badge"><span className="adb-dot" /> Admin</div>
          </div>
          <div className="adb-content">
            {isOverview ? <Overview pendingCount={pendingCount} /> : <Outlet />}
          </div>
        </main>
      </div>
    </>
  );
};

export default Adashboard;