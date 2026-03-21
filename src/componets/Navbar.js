import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router';

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&display=swap');

  .tw-nav {
    position: fixed;
    top: 0; left: 0; right: 0;
    z-index: 1000;
    font-family: 'DM Sans', sans-serif;
    transition: all 0.3s ease;
  }

  .tw-nav.scrolled {
    background: rgba(0, 19, 58, 0.95);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    border-bottom: 1px solid rgba(255,255,255,0.07);
    box-shadow: 0 8px 40px rgba(0,0,0,0.3);
  }

  .tw-nav.transparent {
    background: transparent;
    border-bottom: 1px solid transparent;
  }

  .tw-nav-inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 32px;
    height: 68px;
    max-width: 1280px;
    margin: 0 auto;
  }

  /* BRAND */
  .tw-nav-brand {
    display: flex;
    align-items: center;
    gap: 10px;
    text-decoration: none;
    flex-shrink: 0;
  }

  .tw-nav-logo {
    width: 34px; height: 34px;
    border-radius: 10px;
    overflow: hidden;
    box-shadow: 0 2px 12px rgba(0,87,255,0.35);
    flex-shrink: 0;
    transition: transform 0.3s cubic-bezier(0.34,1.56,0.64,1);
  }

  .tw-nav-brand:hover .tw-nav-logo { transform: rotate(-8deg) scale(1.1); }
  .tw-nav-logo img { width: 100%; height: 100%; object-fit: cover; }

  .tw-nav-wordmark {
    font-family: 'Syne', sans-serif;
    font-size: 1.15rem;
    font-weight: 800;
    letter-spacing: -0.3px;
    color: white;
  }
  .tw-nav-wordmark .blue { color: #00D4FF; }

  /* DESKTOP LINKS */
  .tw-nav-links {
    display: flex;
    align-items: center;
    gap: 4px;
    list-style: none;
    margin: 0; padding: 0;
  }

  .tw-nav-link {
    position: relative;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 500;
    color: rgba(255,255,255,0.6);
    text-decoration: none;
    transition: all 0.2s;
    white-space: nowrap;
  }

  .tw-nav-link:hover {
    color: white;
    background: rgba(255,255,255,0.07);
    text-decoration: none;
  }

  .tw-nav-link.active {
    color: #00D4FF;
    background: rgba(0,212,255,0.08);
  }

  .tw-nav-link.active::after {
    content: '';
    position: absolute;
    bottom: 4px; left: 50%;
    transform: translateX(-50%);
    width: 16px; height: 2px;
    background: #00D4FF;
    border-radius: 2px;
  }

  /* RIGHT */
  .tw-nav-right {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
  }

  /* HOSPITAL BADGE */
  .tw-hospital-badge {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 14px 6px 8px;
    background: rgba(0,212,255,0.08);
    border: 1px solid rgba(0,212,255,0.2);
    border-radius: 100px;
    font-size: 13px;
    color: rgba(255,255,255,0.8);
    font-weight: 500;
    white-space: nowrap;
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tw-hospital-badge .dot {
    width: 7px; height: 7px;
    border-radius: 50%;
    background: #00F5C4;
    flex-shrink: 0;
    animation: twPulse 2s infinite;
  }

  .tw-hospital-dash-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: rgba(0,87,255,0.15);
    border: 1px solid rgba(0,87,255,0.3);
    color: #00D4FF;
    border-radius: 12px;
    padding: 8px 16px;
    font-family: 'DM Sans', sans-serif;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    text-decoration: none;
    transition: all 0.2s;
  }

  .tw-hospital-dash-btn:hover {
    background: rgba(0,87,255,0.25);
    border-color: rgba(0,87,255,0.5);
    color: white;
    text-decoration: none;
  }

  .tw-hospital-logout {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: rgba(255,80,80,0.1);
    border: 1px solid rgba(255,80,80,0.25);
    color: #FF8080;
    border-radius: 12px;
    padding: 8px 16px;
    font-family: 'DM Sans', sans-serif;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .tw-hospital-logout:hover {
    background: rgba(255,80,80,0.2);
    border-color: rgba(255,80,80,0.4);
    color: #FF6060;
  }

  /* USER MENU */
  .tw-user-trigger {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 14px 6px 6px;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 100px;
    cursor: pointer;
    transition: all 0.2s;
    position: relative;
  }

  .tw-user-trigger:hover {
    background: rgba(255,255,255,0.1);
    border-color: rgba(255,255,255,0.2);
  }

  .tw-user-avatar {
    width: 30px; height: 30px;
    border-radius: 50%;
    background: linear-gradient(135deg, #0057FF, #00D4FF);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Syne', sans-serif;
    font-weight: 700;
    font-size: 13px;
    color: white;
    flex-shrink: 0;
  }

  .tw-user-name {
    font-size: 13px;
    font-weight: 500;
    color: white;
    max-width: 100px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tw-chevron {
    color: rgba(255,255,255,0.4);
    font-size: 10px;
    transition: transform 0.2s;
  }
  .tw-chevron.open { transform: rotate(180deg); }

  /* DROPDOWN */
  .tw-dropdown {
    position: absolute;
    top: calc(100% + 10px);
    right: 0;
    width: 220px;
    background: rgba(0, 19, 58, 0.97);
    backdrop-filter: blur(24px);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 18px;
    padding: 8px;
    box-shadow: 0 24px 60px rgba(0,0,0,0.5);
    animation: twDropIn 0.2s cubic-bezier(0.34,1.56,0.64,1) both;
    z-index: 200;
  }

  .tw-dropdown-header {
    padding: 10px 14px 12px;
    border-bottom: 1px solid rgba(255,255,255,0.07);
    margin-bottom: 6px;
  }

  .tw-dropdown-name {
    font-family: 'Syne', sans-serif;
    font-weight: 700;
    font-size: 14px;
    color: white;
    margin-bottom: 2px;
  }

  .tw-dropdown-role {
    font-size: 11px;
    color: #00D4FF;
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .tw-dropdown-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border-radius: 10px;
    font-size: 14px;
    color: rgba(255,255,255,0.65);
    text-decoration: none;
    cursor: pointer;
    transition: all 0.15s;
    border: none;
    background: none;
    width: 100%;
    text-align: left;
    font-family: 'DM Sans', sans-serif;
  }

  .tw-dropdown-item:hover {
    background: rgba(255,255,255,0.07);
    color: white;
    text-decoration: none;
  }

  .tw-dropdown-item.danger { color: rgba(255,100,100,0.8); }
  .tw-dropdown-item.danger:hover {
    background: rgba(255,80,80,0.1);
    color: #FF8080;
  }

  .tw-dropdown-divider {
    height: 1px;
    background: rgba(255,255,255,0.06);
    margin: 6px 0;
  }

  .tw-dropdown-icon {
    width: 28px; height: 28px;
    border-radius: 8px;
    background: rgba(255,255,255,0.06);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    flex-shrink: 0;
  }

  /* LOGIN BTN */
  .tw-nav-login {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: linear-gradient(135deg, #0057FF, #0040CC);
    color: white;
    border: none;
    border-radius: 12px;
    padding: 10px 22px;
    font-family: 'DM Sans', sans-serif;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    text-decoration: none;
    transition: all 0.25s;
    box-shadow: 0 4px 16px rgba(0,87,255,0.3);
  }

  .tw-nav-login:hover {
    transform: translateY(-1px);
    box-shadow: 0 8px 24px rgba(0,87,255,0.45);
    color: white;
    text-decoration: none;
  }

  /* HAMBURGER */
  .tw-hamburger {
    display: none;
    flex-direction: column;
    gap: 5px;
    background: none;
    border: none;
    cursor: pointer;
    padding: 8px;
    border-radius: 10px;
    transition: background 0.2s;
  }

  .tw-hamburger:hover { background: rgba(255,255,255,0.07); }

  .tw-hamburger span {
    display: block;
    width: 22px; height: 2px;
    background: white;
    border-radius: 2px;
    transition: all 0.3s;
    transform-origin: center;
  }

  .tw-hamburger.open span:nth-child(1) { transform: translateY(7px) rotate(45deg); }
  .tw-hamburger.open span:nth-child(2) { opacity: 0; transform: scaleX(0); }
  .tw-hamburger.open span:nth-child(3) { transform: translateY(-7px) rotate(-45deg); }

  /* MOBILE DRAWER */
  .tw-mobile-drawer {
    position: fixed;
    top: 68px; left: 0; right: 0; bottom: 0;
    background: rgba(0,13,40,0.98);
    backdrop-filter: blur(20px);
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    animation: twDrawerIn 0.3s ease both;
    overflow-y: auto;
    z-index: 999;
  }

  .tw-mobile-link {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 16px;
    border-radius: 14px;
    font-size: 16px;
    font-weight: 500;
    color: rgba(255,255,255,0.7);
    text-decoration: none;
    transition: all 0.2s;
    border: 1px solid transparent;
  }

  .tw-mobile-link:hover, .tw-mobile-link.active {
    background: rgba(0,87,255,0.1);
    border-color: rgba(0,87,255,0.2);
    color: white;
    text-decoration: none;
  }

  .tw-mobile-link .icon {
    width: 36px; height: 36px;
    border-radius: 10px;
    background: rgba(255,255,255,0.06);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
  }

  .tw-mobile-divider {
    height: 1px;
    background: rgba(255,255,255,0.06);
    margin: 8px 0;
  }

  .tw-mobile-user-card {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 16px;
    background: rgba(0,87,255,0.08);
    border: 1px solid rgba(0,87,255,0.2);
    border-radius: 16px;
    margin-bottom: 8px;
  }

  .tw-mobile-avatar {
    width: 44px; height: 44px;
    border-radius: 50%;
    background: linear-gradient(135deg, #0057FF, #00D4FF);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Syne', sans-serif;
    font-weight: 800;
    font-size: 18px;
    color: white;
    flex-shrink: 0;
  }

  /* SCROLL BAR */
  .tw-scroll-bar {
    position: absolute;
    bottom: 0; left: 0;
    height: 2px;
    background: linear-gradient(90deg, #0057FF, #00D4FF, #00F5C4);
    transition: width 0.1s linear;
  }

  /* ANIMATIONS */
  @keyframes twDropIn {
    from { opacity: 0; transform: translateY(-8px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }

  @keyframes twDrawerIn {
    from { opacity: 0; transform: translateY(-10px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  @keyframes twPulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%       { opacity: 0.5; transform: scale(0.8); }
  }

  /* RESPONSIVE */
  @media (max-width: 900px) {
    .tw-nav-links { display: none; }
    .tw-hamburger { display: flex; }
    .tw-nav-login { padding: 9px 18px; font-size: 13px; }
    .tw-hospital-badge { display: none; }
  }

  @media (max-width: 480px) {
    .tw-nav-inner { padding: 0 16px; }
  }

  .tw-nav-spacer { height: 68px; }
`;

const NAV_LINKS = [
  { to: '/',          label: 'Home',         icon: '🏠' },
  { to: '/alldoctor', label: 'Find Doctors',  icon: '🩺' },
  { to: '/about',     label: 'About',        icon: 'ℹ️' },
  { to: '/contact',   label: 'Contact',      icon: '📬' },
];

export default function Navbar() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const [user,      setUser]      = useState(null);
  const [scrolled,  setScrolled]  = useState(false);
  const [scrollPct, setScrollPct] = useState(0);
  const [menuOpen,  setMenuOpen]  = useState(false);
  const [dropOpen,  setDropOpen]  = useState(false);
  const dropRef = useRef(null);

  // Load user on every route change
  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (stored) {
      try { setUser(JSON.parse(stored)); }
      catch { setUser(null); }
    } else {
      setUser(null);
    }
  }, [location]);

  // Scroll detection
  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 20);
      const docH = document.documentElement.scrollHeight - window.innerHeight;
      setScrollPct(docH > 0 ? (window.scrollY / docH) * 100 : 0);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target)) setDropOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Close menus on route change
  useEffect(() => { setMenuOpen(false); setDropOpen(false); }, [location]);

  const logout = () => {
    localStorage.clear();
    setUser(null);
    setDropOpen(false);
    setMenuOpen(false);
    navigate('/');
  };

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const initials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  };

  const isHospital = user?.role === 'hospital';
  const isPatient  = user && !isHospital;

  return (
    <>
      <style>{css}</style>

      <nav className={`tw-nav ${scrolled ? 'scrolled' : 'transparent'}`}>
        <div className="tw-nav-inner">

          {/* Brand */}
          <Link to="/" className="tw-nav-brand">
            <div className="tw-nav-logo">
              <img src="/logo.png" alt="TokenWalla" />
            </div>
            <span className="tw-nav-wordmark">
              <span className="blue">Token</span>walla
            </span>
          </Link>

          {/* Desktop links — hide for hospital users */}
          {!isHospital && (
            <ul className="tw-nav-links">
              {NAV_LINKS.map(link => (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    className={`tw-nav-link ${isActive(link.to) ? 'active' : ''}`}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {/* Right section */}
          <div className="tw-nav-right">

            {/* ── HOSPITAL USER ── */}
            {isHospital && (
              <>
                {/* Hospital name badge */}
                <div className="tw-hospital-badge">
                  <span className="dot" />
                  🏥 {user?.hospital?.name || user?.name || 'Hospital'}
                </div>

                {/* Dashboard button */}
                <Link to="/Hdashboard" className="tw-hospital-dash-btn">
                  📊 Dashboard
                </Link>

                {/* Logout */}
                <button className="tw-hospital-logout" onClick={logout}>
                  🚪 Logout
                </button>
              </>
            )}

            {/* ── PATIENT USER ── */}
            {isPatient && (
              <div style={{ position: 'relative' }} ref={dropRef}>
                <div
                  className="tw-user-trigger"
                  onClick={() => setDropOpen(p => !p)}
                >
                  <div className="tw-user-avatar">
                    {initials(user.name || user.username)}
                  </div>
                  <span className="tw-user-name">{user.name || user.username}</span>
                  <span className={`tw-chevron ${dropOpen ? 'open' : ''}`}>▼</span>
                </div>

                {dropOpen && (
                  <div className="tw-dropdown">
                    <div className="tw-dropdown-header">
                      <div className="tw-dropdown-name">{user.name || user.username}</div>
                      <div className="tw-dropdown-role">{user.role || 'Patient'}</div>
                    </div>

                    <Link to="/my-bookings" className="tw-dropdown-item">
                      <div className="tw-dropdown-icon">🎫</div>
                      My Bookings
                    </Link>

                    <Link to="/alldoctor" className="tw-dropdown-item">
                      <div className="tw-dropdown-icon">🩺</div>
                      Find Doctors
                    </Link>

                    {user.role === 'admin' && (
                      <Link to="/Adashboard" className="tw-dropdown-item">
                        <div className="tw-dropdown-icon">⚙️</div>
                        Admin Panel
                      </Link>
                    )}

                    <div className="tw-dropdown-divider" />

                    <button className="tw-dropdown-item danger" onClick={logout}>
                      <div className="tw-dropdown-icon" style={{ background: 'rgba(255,80,80,0.1)' }}>
                        🚪
                      </div>
                      Logout
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── NOT LOGGED IN ── */}
            {!user && (
              <Link to="/login" className="tw-nav-login">
                Login →
              </Link>
            )}

            {/* Hamburger — only for non-hospital */}
            {!isHospital && (
              <button
                className={`tw-hamburger ${menuOpen ? 'open' : ''}`}
                onClick={() => setMenuOpen(p => !p)}
                aria-label="Toggle menu"
              >
                <span /><span /><span />
              </button>
            )}

          </div>
        </div>

        {/* Scroll progress bar */}
        <div className="tw-scroll-bar" style={{ width: `${scrollPct}%` }} />
      </nav>

      {/* Mobile drawer — only for non-hospital */}
      {menuOpen && !isHospital && (
        <div className="tw-mobile-drawer">

          {isPatient && (
            <div className="tw-mobile-user-card">
              <div className="tw-mobile-avatar">
                {initials(user.name || user.username)}
              </div>
              <div>
                <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 15, color: 'white' }}>
                  {user.name || user.username}
                </div>
                <div style={{ fontSize: 12, color: '#00D4FF', textTransform: 'uppercase', letterSpacing: 1 }}>
                  {user.role || 'Patient'}
                </div>
              </div>
            </div>
          )}

          {NAV_LINKS.map(link => (
            <Link
              key={link.to}
              to={link.to}
              className={`tw-mobile-link ${isActive(link.to) ? 'active' : ''}`}
            >
              <div className="icon">{link.icon}</div>
              {link.label}
            </Link>
          ))}

          <div className="tw-mobile-divider" />

          {isPatient ? (
            <>
              <Link to="/my-bookings" className="tw-mobile-link">
                <div className="icon">🎫</div>
                My Bookings
              </Link>
              {user.role === 'admin' && (
                <Link to="/Adashboard" className="tw-mobile-link">
                  <div className="icon">⚙️</div>
                  Admin Panel
                </Link>
              )}
              <div className="tw-mobile-divider" />
              <button
                className="tw-mobile-link"
                style={{ border: '1px solid rgba(255,80,80,0.15)', background: 'rgba(255,80,80,0.08)', color: '#FF8080', cursor: 'pointer', width: '100%', textAlign: 'left' }}
                onClick={logout}
              >
                <div className="icon" style={{ background: 'rgba(255,80,80,0.1)' }}>🚪</div>
                Logout
              </button>
            </>
          ) : (
            <Link to="/login" className="tw-nav-login" style={{ justifyContent: 'center', borderRadius: 14, padding: '14px' }}>
              Login to TokenWalla →
            </Link>
          )}
        </div>
      )}

      <div className="tw-nav-spacer" />
    </>
  );
}