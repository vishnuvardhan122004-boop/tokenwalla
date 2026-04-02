// ADMIN/Adashboard.js — Fixed layout with blue palette, working nav & outlet
import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router';

const Adashboard = () => {
  const navigate  = useNavigate();
  const location  = useLocation();
  const [user, setUser] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('user');
    try {
      if (stored) {
        const u = JSON.parse(stored);
        if (u.role !== 'admin') { navigate('/'); return; }
        setUser(u);
      } else {
        navigate('/login');
      }
    } catch { navigate('/login'); }
  }, [navigate]);

  const logout = () => {
    localStorage.removeItem('access');
    localStorage.removeItem('refresh');
    localStorage.removeItem('user');
    navigate('/');
  };

  const initials = (name) => name ? name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) : 'AD';

  const navItems = [
    { to: '/Adashboard',                    end: true,  icon: '📊', label: 'Overview'         },
    { to: '/Adashboard/user-management',    end: false, icon: '👥', label: 'Users'             },
    { to: '/Adashboard/hospitals',          end: false, icon: '🏥', label: 'Hospitals & Docs'  },
    { to: '/Adashboard/reports',            end: false, icon: '📋', label: 'Reports'           },
    { to: '/Adashboard/support',            end: false, icon: '🎧', label: 'Support'           },
    { to: '/Adashboard/settings',           end: false, icon: '⚙️', label: 'Settings'          },
  ];

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .ad-shell {
          display: flex; min-height: 100vh; font-family: 'DM Sans', sans-serif;
          background: var(--gray-50);
        }

        /* ── SIDEBAR ── */
        .ad-sidebar {
          width: 256px; flex-shrink: 0;
          background: var(--blue-900);
          display: flex; flex-direction: column;
          position: fixed; top: 0; left: 0; bottom: 0; z-index: 200;
          transition: transform 0.25s ease;
        }
        .ad-sidebar.closed { transform: translateX(-100%); }

        .ad-sidebar-brand {
          display: flex; align-items: center; gap: 10px;
          padding: 20px 20px 18px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
        }
        .ad-brand-logo {
          width: 36px; height: 36px; border-radius: 10px; overflow: hidden;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3); flex-shrink: 0;
        }
        .ad-brand-logo img { width:100%; height:100%; object-fit:cover; display:block; }
        .ad-brand-text { flex: 1; }
        .ad-brand-name {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 1rem; font-weight: 800; color: #fff;
        }
        .ad-brand-name .accent { color: #85B7EB; }
        .ad-brand-sub { font-size: 11px; color: rgba(255,255,255,0.35); font-weight: 500; }

        .ad-nav { flex: 1; padding: 12px 10px; overflow-y: auto; }
        .ad-nav-section { margin-bottom: 6px; }
        .ad-nav-label {
          font-size: 10px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase;
          color: rgba(255,255,255,0.25); padding: 8px 10px 6px;
        }
        .ad-nav-item {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 12px; border-radius: 10px;
          font-size: 14px; font-weight: 500; color: rgba(255,255,255,0.6);
          text-decoration: none; transition: all 0.15s; margin-bottom: 2px;
          cursor: pointer; border: none; background: none; width: 100%; text-align: left;
          font-family: 'DM Sans', sans-serif;
        }
        .ad-nav-item:hover { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.9); text-decoration: none; }
        .ad-nav-item.active { background: var(--blue-600); color: #fff; font-weight: 600; }
        .ad-nav-icon { width: 32px; height: 32px; border-radius: 8px; background: rgba(255,255,255,0.06); display: flex; align-items: center; justify-content: center; font-size: 15px; flex-shrink: 0; }
        .ad-nav-item.active .ad-nav-icon { background: rgba(255,255,255,0.15); }

        .ad-sidebar-footer {
          padding: 14px 10px;
          border-top: 1px solid rgba(255,255,255,0.08);
        }
        .ad-user-card {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 12px; border-radius: 10px;
          background: rgba(255,255,255,0.05);
          margin-bottom: 8px;
        }
        .ad-user-avatar {
          width: 32px; height: 32px; border-radius: 50%;
          background: var(--blue-600); color: #fff;
          display: flex; align-items: center; justify-content: center;
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 12px; font-weight: 700; flex-shrink: 0;
        }
        .ad-user-name { font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.85); }
        .ad-user-role { font-size: 11px; color: rgba(255,255,255,0.35); }
        .ad-logout-btn {
          display: flex; align-items: center; gap: 8px;
          width: 100%; padding: 9px 12px; border-radius: 8px;
          background: rgba(255,80,80,0.1); border: 1px solid rgba(255,80,80,0.2);
          color: #FF8080; font-size: 13px; font-weight: 500;
          cursor: pointer; transition: all 0.15s;
          font-family: 'DM Sans', sans-serif;
        }
        .ad-logout-btn:hover { background: rgba(255,80,80,0.2); border-color: rgba(255,80,80,0.35); }

        /* ── MAIN ── */
        .ad-main { flex: 1; margin-left: 256px; display: flex; flex-direction: column; min-height: 100vh; }

        /* ── TOPBAR ── */
        .ad-topbar {
          position: sticky; top: 0; z-index: 100;
          background: rgba(255,255,255,0.97);
          border-bottom: 1px solid var(--blue-100);
          padding: 0 28px; height: 64px;
          display: flex; align-items: center; justify-content: space-between; gap: 16px;
          backdrop-filter: blur(12px);
        }
        .ad-topbar-left { display: flex; align-items: center; gap: 14px; }
        .ad-page-title {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 1.05rem; font-weight: 700; color: var(--gray-900);
        }
        .ad-topbar-right { display: flex; align-items: center; gap: 10px; }
        .ad-badge-admin {
          display: flex; align-items: center; gap: 6px;
          background: var(--blue-50); border: 1px solid var(--blue-200);
          border-radius: 100px; padding: 4px 12px;
          font-size: 12px; font-weight: 600; color: var(--blue-700);
        }
        .ad-live-dot {
          width: 6px; height: 6px; border-radius: 50%; background: #3B6D11;
          animation: twPulse 2s infinite;
        }

        /* ── CONTENT ── */
        .ad-content { flex: 1; padding: 28px; }

        /* ── OVERLAY (mobile) ── */
        .ad-overlay {
          position: fixed; inset: 0; z-index: 199;
          background: rgba(4,44,83,0.5);
          backdrop-filter: blur(4px);
        }

        /* Hamburger for mobile */
        .ad-hamburger {
          display: none; flex-direction: column; gap: 4px;
          background: none; border: 1px solid var(--blue-100);
          border-radius: 8px; padding: 8px; cursor: pointer;
        }
        .ad-hamburger span { display: block; width: 18px; height: 2px; background: var(--gray-700); border-radius: 2px; }

        @keyframes twPulse { 0%,100%{opacity:1} 50%{opacity:0.4} }

        @media (max-width: 900px) {
          .ad-sidebar { transform: translateX(-100%); }
          .ad-sidebar.open { transform: translateX(0); }
          .ad-main { margin-left: 0; }
          .ad-hamburger { display: flex; }
          .ad-content { padding: 16px; }
          .ad-topbar { padding: 0 16px; }
        }
      `}</style>

      <div className="ad-shell">

        {/* Overlay for mobile sidebar */}
        {sidebarOpen && (
          <div className="ad-overlay" onClick={() => setSidebarOpen(false)} />
        )}

        {/* ── SIDEBAR ── */}
        <aside className={`ad-sidebar ${sidebarOpen ? 'open' : ''}`}>
          <div className="ad-sidebar-brand">
            <div className="ad-brand-logo">
              <img src="/logo.png" alt="TokenWalla" />
            </div>
            <div className="ad-brand-text">
              <div className="ad-brand-name"><span className="accent">Token</span>walla</div>
              <div className="ad-brand-sub">Admin Console</div>
            </div>
          </div>

          <nav className="ad-nav">
            <div className="ad-nav-section">
              <div className="ad-nav-label">Main</div>
              {navItems.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `ad-nav-item ${isActive ? 'active' : ''}`}
                  onClick={() => setSidebarOpen(false)}
                >
                  <span className="ad-nav-icon">{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
            </div>
          </nav>

          <div className="ad-sidebar-footer">
            {user && (
              <div className="ad-user-card">
                <div className="ad-user-avatar">{initials(user.name || user.username)}</div>
                <div>
                  <div className="ad-user-name">{user.name || user.username}</div>
                  <div className="ad-user-role">Administrator</div>
                </div>
              </div>
            )}
            <button className="ad-logout-btn" onClick={logout}>
              🚪 Sign Out
            </button>
          </div>
        </aside>

        {/* ── MAIN AREA ── */}
        <div className="ad-main">
          <div className="ad-topbar">
            <div className="ad-topbar-left">
              <button className="ad-hamburger" onClick={() => setSidebarOpen(p => !p)}>
                <span /><span /><span />
              </button>
              <div className="ad-page-title">
                {navItems.find(i => {
                  if (i.end) return location.pathname === i.to;
                  return location.pathname.startsWith(i.to);
                })?.label || 'Admin Dashboard'}
              </div>
            </div>
            <div className="ad-topbar-right">
              <div className="ad-badge-admin">
                <span className="ad-live-dot" />
                Admin
              </div>
            </div>
          </div>

          <div className="ad-content">
            <Outlet />
          </div>
        </div>
      </div>
    </>
  );
};

export default Adashboard;