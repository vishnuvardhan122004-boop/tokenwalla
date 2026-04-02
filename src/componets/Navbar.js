import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router';

const NAV_LINKS = [
  { to: '/',          label: 'Home'         },
  { to: '/alldoctor', label: 'Find Doctors' },
  { to: '/about',     label: 'About'        },
  { to: '/contact',   label: 'Contact'      },
];

export default function Navbar() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const [user,      setUser]      = useState(null);
  const [scrolled,  setScrolled]  = useState(false);
  const [menuOpen,  setMenuOpen]  = useState(false);
  const [dropOpen,  setDropOpen]  = useState(false);
  const [hospDrop,  setHospDrop]  = useState(false);
  const dropRef     = useRef(null);
  const hospDropRef = useRef(null);

  useEffect(() => {
    const stored = localStorage.getItem('user');
    try { setUser(stored ? JSON.parse(stored) : null); } catch { setUser(null); }
  }, [location]);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  // Close patient dropdown on outside click
  useEffect(() => {
    const fn = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target)) setDropOpen(false);
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  // Close hospital dropdown on outside click
  useEffect(() => {
    const fn = (e) => {
      if (hospDropRef.current && !hospDropRef.current.contains(e.target)) setHospDrop(false);
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  useEffect(() => { setMenuOpen(false); setDropOpen(false); setHospDrop(false); }, [location]);

  const logout = () => { localStorage.clear(); setUser(null); navigate('/'); };
  const isActive = (p) => p === '/' ? location.pathname === '/' : location.pathname.startsWith(p);
  const initials = (name) => name ? name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) : '?';

  const isHospital = user?.role === 'hospital';
  const isPatient  = user && !isHospital;

  return (
    <>
      <style>{`
        .nav-root {
          position: fixed; top: 0; left: 0; right: 0; z-index: 1000;
          background: rgba(255,255,255,0.97);
          border-bottom: 1px solid transparent;
          transition: border-color 0.2s, box-shadow 0.2s;
          font-family: 'DM Sans', sans-serif;
        }
        .nav-root.scrolled {
          border-color: var(--blue-100);
          box-shadow: 0 1px 16px rgba(24,95,165,0.08);
        }
        .nav-inner {
          max-width: 1200px; margin: 0 auto; padding: 0 24px;
          height: 64px; display: flex; align-items: center; justify-content: space-between; gap: 24px;
        }
        .nav-brand {
          display: flex; align-items: center; gap: 10px; text-decoration: none; flex-shrink: 0;
        }
        .nav-logo {
          width: 36px; height: 36px; border-radius: 10px; overflow: hidden;
          box-shadow: 0 2px 8px rgba(24,95,165,0.2);
          transition: transform 0.25s cubic-bezier(0.34,1.56,0.64,1);
        }
        .nav-brand:hover .nav-logo { transform: rotate(-6deg) scale(1.08); }
        .nav-logo img { width:100%; height:100%; object-fit:cover; display:block; }
        .nav-wordmark {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 1.15rem; font-weight: 800; color: var(--gray-900); letter-spacing: -0.3px;
        }
        .nav-wordmark .accent { color: var(--blue-600); }

        .nav-links { display: flex; align-items: center; gap: 2px; list-style: none; margin: 0; padding: 0; }
        .nav-link {
          padding: 7px 14px; border-radius: 8px;
          font-size: 14px; font-weight: 500; color: var(--gray-600);
          text-decoration: none; transition: all 0.15s; white-space: nowrap;
        }
        .nav-link:hover { color: var(--blue-600); background: var(--blue-50); text-decoration: none; }
        .nav-link.active { color: var(--blue-600); background: var(--blue-50); font-weight: 600; }

        .nav-right { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }

        /* Hospital badge */
        .hosp-badge {
          display: flex; align-items: center; gap: 7px;
          padding: 5px 12px 5px 8px;
          background: var(--blue-50); border: 1px solid var(--blue-200);
          border-radius: 100px; font-size: 13px; color: var(--blue-800);
          white-space: nowrap; max-width: 180px; overflow: hidden; text-overflow: ellipsis;
        }
        .hosp-dot {
          width: 7px; height: 7px; border-radius: 50%; background: #3B6D11; flex-shrink: 0;
          animation: twPulse 2s ease-in-out infinite;
        }

        /* Hospital profile trigger */
        .hosp-profile-trigger {
          display: flex; align-items: center; gap: 9px;
          padding: 5px 12px 5px 5px;
          background: #fff; border: 1px solid var(--blue-100);
          border-radius: 100px; cursor: pointer; transition: all 0.15s;
        }
        .hosp-profile-trigger:hover { border-color: var(--blue-300); background: var(--blue-50); }
        .hosp-avatar {
          width: 28px; height: 28px; border-radius: 50%;
          background: var(--blue-600); color: #fff;
          display: flex; align-items: center; justify-content: center;
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 11px; font-weight: 700; flex-shrink: 0;
        }
        .hosp-name { font-size: 13px; font-weight: 500; color: var(--gray-800); max-width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .hosp-chevron { font-size: 9px; color: var(--gray-400); transition: transform 0.2s; }
        .hosp-chevron.open { transform: rotate(180deg); }

        /* User menu */
        .user-trigger {
          display: flex; align-items: center; gap: 9px;
          padding: 5px 12px 5px 5px;
          background: #fff; border: 1px solid var(--blue-100);
          border-radius: 100px; cursor: pointer; transition: all 0.15s;
        }
        .user-trigger:hover { border-color: var(--blue-300); background: var(--blue-50); }
        .user-avatar {
          width: 28px; height: 28px; border-radius: 50%;
          background: var(--blue-600); color: #fff;
          display: flex; align-items: center; justify-content: center;
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 11px; font-weight: 700; flex-shrink: 0;
        }
        .user-name { font-size: 13px; font-weight: 500; color: var(--gray-800); max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .user-chevron { font-size: 9px; color: var(--gray-400); transition: transform 0.2s; }
        .user-chevron.open { transform: rotate(180deg); }

        /* Dropdown */
        .dropdown {
          position: absolute; top: calc(100% + 8px); right: 0;
          width: 220px; background: #fff;
          border: 1px solid var(--blue-100); border-radius: 14px;
          padding: 6px;
          box-shadow: 0 8px 32px rgba(24,95,165,0.14);
          animation: dropIn 0.18s cubic-bezier(0.34,1.56,0.64,1) both;
        }
        @keyframes dropIn {
          from { opacity:0; transform:translateY(-6px) scale(0.97); }
          to   { opacity:1; transform:translateY(0) scale(1); }
        }
        .dropdown-header {
          padding: 10px 12px 10px; border-bottom: 1px solid var(--blue-50); margin-bottom: 4px;
        }
        .dropdown-name { font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 700; font-size: 14px; color: var(--gray-900); margin-bottom: 2px; }
        .dropdown-role { font-size: 11px; color: var(--blue-600); text-transform: uppercase; letter-spacing: 1px; font-weight: 600; }
        .dropdown-item {
          display: flex; align-items: center; gap: 10px;
          padding: 9px 12px; border-radius: 8px;
          font-size: 14px; color: var(--gray-700);
          text-decoration: none; cursor: pointer; transition: all 0.12s;
          border: none; background: none; width: 100%; text-align: left;
          font-family: 'DM Sans', sans-serif;
        }
        .dropdown-item:hover { background: var(--blue-50); color: var(--blue-800); text-decoration: none; }
        .dropdown-item.danger { color: var(--color-error-text); }
        .dropdown-item.danger:hover { background: var(--color-error-bg); }
        .dropdown-icon {
          width: 26px; height: 26px; border-radius: 7px;
          background: var(--gray-100); display: flex; align-items: center; justify-content: center;
          font-size: 13px; flex-shrink: 0;
        }
        .dropdown-divider { height: 1px; background: var(--blue-50); margin: 4px 0; }

        /* Hamburger */
        .hamburger { display: none; flex-direction: column; gap: 5px; background: none; border: none; cursor: pointer; padding: 8px; border-radius: 8px; }
        .hamburger:hover { background: var(--blue-50); }
        .hamburger span { display: block; width: 20px; height: 2px; background: var(--gray-700); border-radius: 2px; transition: all 0.25s; transform-origin: center; }
        .hamburger.open span:nth-child(1) { transform: translateY(7px) rotate(45deg); }
        .hamburger.open span:nth-child(2) { opacity:0; transform: scaleX(0); }
        .hamburger.open span:nth-child(3) { transform: translateY(-7px) rotate(-45deg); }

        /* Mobile drawer */
        .mobile-drawer {
          position: fixed; top: 64px; left:0; right:0; bottom:0; z-index: 999;
          background: #fff; padding: 20px; display: flex; flex-direction: column; gap: 4px;
          overflow-y: auto; border-top: 1px solid var(--blue-100);
          animation: drawerIn 0.25s ease both;
        }
        @keyframes drawerIn { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }
        .mobile-link {
          display: flex; align-items: center; gap: 12px;
          padding: 13px 16px; border-radius: 12px;
          font-size: 15px; font-weight: 500; color: var(--gray-700);
          text-decoration: none; transition: all 0.15s; border: 1px solid transparent;
        }
        .mobile-link:hover, .mobile-link.active {
          background: var(--blue-50); border-color: var(--blue-200); color: var(--blue-700); text-decoration: none;
        }
        .mobile-link-icon {
          width: 34px; height: 34px; border-radius: 9px;
          background: var(--gray-100); display: flex; align-items: center; justify-content: center; font-size: 16px;
        }
        .mobile-divider { height: 1px; background: var(--blue-50); margin: 6px 0; }
        .mobile-user-card {
          display: flex; align-items: center; gap: 12px;
          padding: 14px; background: var(--blue-50);
          border: 1px solid var(--blue-200); border-radius: 14px; margin-bottom: 6px;
        }
        .mobile-avatar {
          width: 42px; height: 42px; border-radius: 50%;
          background: var(--blue-600); color: #fff;
          display: flex; align-items: center; justify-content: center;
          font-family: 'Plus Jakarta Sans', sans-serif; font-size: 16px; font-weight: 800;
        }
        .mobile-hosp-card {
          display: flex; align-items: center; gap: 12px;
          padding: 14px; background: var(--blue-50);
          border: 1px solid var(--blue-200); border-radius: 14px; margin-bottom: 6px;
        }

        @keyframes twPulse { 0%,100%{opacity:1} 50%{opacity:0.4} }

        @media (max-width: 860px) {
          .nav-links { display: none; }
          .hamburger { display: flex; }
          .hosp-badge { display: none; }
        }
        @media (max-width: 480px) { .nav-inner { padding: 0 16px; } }
        .nav-spacer { height: 64px; }
      `}</style>

      <nav className={`nav-root ${scrolled ? 'scrolled' : ''}`}>
        <div className="nav-inner">

          {/* Brand */}
          <Link to="/" className="nav-brand">
            <div className="nav-logo">
              <img src="/logo.png" alt="TokenWalla" />
            </div>
            <span className="nav-wordmark">
              <span className="accent">Token</span>walla
            </span>
          </Link>

          {/* Desktop nav — only for non-hospital */}
          {!isHospital && (
            <ul className="nav-links">
              {NAV_LINKS.map(l => (
                <li key={l.to}>
                  <Link to={l.to} className={`nav-link ${isActive(l.to) ? 'active' : ''}`}>{l.label}</Link>
                </li>
              ))}
            </ul>
          )}

          {/* Hospital nav links */}
          {isHospital && (
            <ul className="nav-links">
              <li><Link to="/Hdashboard" className={`nav-link ${isActive('/Hdashboard') ? 'active' : ''}`}>🏥 Dashboard</Link></li>
            </ul>
          )}

          {/* Right side */}
          <div className="nav-right">

            {/* ── HOSPITAL USER ── */}
            {isHospital && (
              <>
                {/* Live badge (hidden on mobile) */}
                <div className="hosp-badge">
                  <span className="hosp-dot" />
                  🏥 {user?.hospital?.name || user?.name || 'Hospital'}
                </div>

                {/* Hospital profile dropdown */}
                <div style={{ position: 'relative' }} ref={hospDropRef}>
                  <div className="hosp-profile-trigger" onClick={() => setHospDrop(p => !p)}>
                    <div className="hosp-avatar">
                      {initials(user?.hospital?.name || user?.name || 'H')}
                    </div>
                    <span className="hosp-name">{user?.hospital?.name || user?.name || 'Hospital'}</span>
                    <span className={`hosp-chevron ${hospDrop ? 'open' : ''}`}>▼</span>
                  </div>
                  {hospDrop && (
                    <div className="dropdown">
                      <div className="dropdown-header">
                        <div className="dropdown-name">{user?.hospital?.name || user?.name}</div>
                        <div className="dropdown-role">Hospital Admin</div>
                      </div>
                      <Link to="/Hdashboard" className="dropdown-item">
                        <div className="dropdown-icon">🏥</div> Dashboard
                      </Link>
                      <Link to="/Hdashboard" className="dropdown-item" onClick={() => { setHospDrop(false); }}>
                        <div className="dropdown-icon">👨‍⚕️</div> Manage Doctors
                      </Link>
                      <Link to="/Hdashboard" className="dropdown-item" onClick={() => { setHospDrop(false); }}>
                        <div className="dropdown-icon">📋</div> Patient Queue
                      </Link>
                      <div className="dropdown-divider" />
                      <button className="dropdown-item danger" onClick={logout}>
                        <div className="dropdown-icon" style={{ background: 'var(--color-error-bg)' }}>🚪</div> Logout
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ── PATIENT USER ── */}
            {isPatient && (
              <div style={{ position: 'relative' }} ref={dropRef}>
                <div className="user-trigger" onClick={() => setDropOpen(p => !p)}>
                  <div className="user-avatar">{initials(user.name || user.username)}</div>
                  <span className="user-name">{user.name || user.username}</span>
                  <span className={`user-chevron ${dropOpen ? 'open' : ''}`}>▼</span>
                </div>
                {dropOpen && (
                  <div className="dropdown">
                    <div className="dropdown-header">
                      <div className="dropdown-name">{user.name || user.username}</div>
                      <div className="dropdown-role">{user.role || 'Patient'}</div>
                    </div>
                    <Link to="/my-bookings" className="dropdown-item">
                      <div className="dropdown-icon">🎫</div> My Bookings
                    </Link>
                    <Link to="/alldoctor" className="dropdown-item">
                      <div className="dropdown-icon">🩺</div> Find Doctors
                    </Link>
                    {user.role === 'admin' && (
                      <Link to="/Adashboard" className="dropdown-item">
                        <div className="dropdown-icon">⚙️</div> Admin Panel
                      </Link>
                    )}
                    <div className="dropdown-divider" />
                    <button className="dropdown-item danger" onClick={logout}>
                      <div className="dropdown-icon" style={{ background: 'var(--color-error-bg)' }}>🚪</div> Logout
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── GUEST ── */}
            {!user && (
              <Link to="/login" className="btn-primary" style={{ padding: '9px 20px', fontSize: 14 }}>
                Login →
              </Link>
            )}

            {/* Hamburger — for patient / guest only */}
            {!isHospital && (
              <button
                className={`hamburger ${menuOpen ? 'open' : ''}`}
                onClick={() => setMenuOpen(p => !p)}
                aria-label="Menu"
              >
                <span /><span /><span />
              </button>
            )}

            {/* Hospital hamburger */}
            {isHospital && (
              <button
                className={`hamburger ${menuOpen ? 'open' : ''}`}
                onClick={() => setMenuOpen(p => !p)}
                aria-label="Menu"
                style={{ display: 'none' }}
              >
                <span /><span /><span />
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Mobile drawer — patient/guest */}
      {menuOpen && !isHospital && (
        <div className="mobile-drawer">
          {isPatient && (
            <div className="mobile-user-card">
              <div className="mobile-avatar">{initials(user.name || user.username)}</div>
              <div>
                <div style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 700, fontSize: 14, color: 'var(--gray-900)' }}>
                  {user.name || user.username}
                </div>
                <div style={{ fontSize: 12, color: 'var(--blue-600)', fontWeight: 600 }}>
                  {user.role || 'Patient'}
                </div>
              </div>
            </div>
          )}
          {NAV_LINKS.map(l => (
            <Link key={l.to} to={l.to} className={`mobile-link ${isActive(l.to) ? 'active' : ''}`}>
              <div className="mobile-link-icon">
                {l.to === '/' ? '🏠' : l.to === '/alldoctor' ? '🩺' : l.to === '/about' ? 'ℹ️' : '📬'}
              </div>
              {l.label}
            </Link>
          ))}
          <div className="mobile-divider" />
          {isPatient ? (
            <>
              <Link to="/my-bookings" className="mobile-link">
                <div className="mobile-link-icon">🎫</div> My Bookings
              </Link>
              {user.role === 'admin' && (
                <Link to="/Adashboard" className="mobile-link">
                  <div className="mobile-link-icon">⚙️</div> Admin Panel
                </Link>
              )}
              <div className="mobile-divider" />
              <button
                className="mobile-link"
                style={{ color: 'var(--color-error-text)', background: 'var(--color-error-bg)', border: '1px solid var(--color-error-border)', cursor: 'pointer', width: '100%', textAlign: 'left' }}
                onClick={logout}
              >
                <div className="mobile-link-icon" style={{ background: 'var(--color-error-bg)' }}>🚪</div> Logout
              </button>
            </>
          ) : (
            <Link to="/login" className="btn-primary" style={{ justifyContent: 'center', padding: 14, borderRadius: 12, marginTop: 8 }}>
              Login to TokenWalla →
            </Link>
          )}
        </div>
      )}

      <div className="nav-spacer" />
      <style>{`@keyframes twPulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </>
  );
}