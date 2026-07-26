import { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { logoutUser } from '../services/api';
import { SUPPORTED_LANGS } from '../i18n';

const NAV_LINKS = [
  { to: '/',          key: 'nav.home',         icon: '🏠' },
  { to: '/alldoctor', key: 'nav.findDoctors', icon: '🩺' },
  { to: '/about',     key: 'nav.about',        icon: 'ℹ️' },
  { to: '/contact',   key: 'nav.contact',      icon: '📬' },
];

function LanguageSwitcher({ variant, onNavigate }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const fn = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  const changeLang = (lng) => {
    i18n.changeLanguage(lng);
    setOpen(false);
    if (onNavigate) onNavigate();
  };

  if (variant === 'mobile') {
    return (
      <div className="lang-switch-mobile">
        <div className="mobile-lang-label">🌐 {t('nav.language')}</div>
        <div className="mobile-lang-options">
          {SUPPORTED_LANGS.map(lng => (
            <button
              key={lng}
              className={`mobile-lang-pill ${i18n.resolvedLanguage === lng ? 'active' : ''}`}
              onClick={() => changeLang(lng)}
            >
              {t(`languages.${lng}`)}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="lang-switch" ref={ref}>
      <button className="lang-trigger" onClick={() => setOpen(p => !p)} aria-label={t('nav.language')}>
        <span className="lang-globe">🌐</span>
        <span className="lang-code">{i18n.resolvedLanguage}</span>
        <span className={`lang-chevron ${open ? 'open' : ''}`}>▼</span>
      </button>
      {open && (
        <div className="nav-dropdown lang-dropdown">
          {SUPPORTED_LANGS.map(lng => (
            <button
              key={lng}
              className={`nav-drop-item ${i18n.resolvedLanguage === lng ? 'lang-active' : ''}`}
              onClick={() => changeLang(lng)}
            >
              <div className="nav-drop-icon">🌐</div> {t(`languages.${lng}`)}
              {i18n.resolvedLanguage === lng && <span className="lang-check">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Navbar() {
  const { t } = useTranslation();
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

  useEffect(() => {
    const fn = e => { if (dropRef.current && !dropRef.current.contains(e.target)) setDropOpen(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  useEffect(() => {
    const fn = e => { if (hospDropRef.current && !hospDropRef.current.contains(e.target)) setHospDrop(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
    setDropOpen(false);
    setHospDrop(false);
  }, [location]);

  // logoutUser blacklists token server-side then clears localStorage and redirects
  const logout = () => logoutUser();

  const isActive = p => p === '/' ? location.pathname === '/' : location.pathname.startsWith(p);
  const initials = name => name ? name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) : '?';

  const isHospital = user?.role === 'hospital';
  const isPatient  = user?.role === 'patient';
  const isAdmin    = user?.role === 'admin';
  const hospName   = user?.hospital?.name || (isHospital ? user?.name : null) || 'Hospital';

  return (
    <>
      <style>{`
        .nav-root {
          position: fixed; top: 0; left: 0; right: 0; z-index: 1000;
          background: rgba(255,255,255,0.97);
          border-bottom: 1px solid transparent;
          transition: border-color 0.2s, box-shadow 0.2s;
          font-family: 'DM Sans', 'Noto Sans Devanagari', 'Noto Sans Telugu', 'Noto Sans Kannada', sans-serif;
        }
        .nav-root.scrolled { border-color: var(--blue-100); box-shadow: 0 1px 16px rgba(24,95,165,0.08); }
        .nav-inner { max-width: 1200px; margin: 0 auto; padding: 0 24px; height: 64px; display: flex; align-items: center; justify-content: space-between; gap: 24px; }
        .nav-brand { display: flex; align-items: center; gap: 10px; text-decoration: none; flex-shrink: 0; }
        .nav-logo { width: 36px; height: 36px; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 8px rgba(24,95,165,0.2); transition: transform 0.25s cubic-bezier(0.34,1.56,0.64,1); }
        .nav-brand:hover .nav-logo { transform: rotate(-6deg) scale(1.08); }
        .nav-logo img { width:100%;height:100%;object-fit:cover;display:block; }
        .nav-wordmark { font-family: 'Plus Jakarta Sans', 'Noto Sans Devanagari', 'Noto Sans Telugu', 'Noto Sans Kannada', sans-serif; font-size: 1.15rem; font-weight: 800; color: var(--gray-900); }
        .nav-wordmark .accent { color: var(--blue-600); }
        .nav-links { display: flex; align-items: center; gap: 2px; list-style: none; margin: 0; padding: 0; }
        .nav-link { padding: 7px 14px; border-radius: 8px; font-size: 14px; font-weight: 500; color: var(--gray-600); text-decoration: none; transition: all 0.15s; white-space: nowrap; }
        .nav-link:hover { color: var(--blue-600); background: var(--blue-50); text-decoration: none; }
        .nav-link.active { color: var(--blue-600); background: var(--blue-50); font-weight: 600; }
        .nav-right { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
        .hosp-badge { display: flex; align-items: center; gap: 7px; padding: 5px 12px 5px 8px; background: var(--blue-50); border: 1px solid var(--blue-200); border-radius: 100px; font-size: 13px; color: var(--blue-800); white-space: nowrap; max-width: 200px; overflow: hidden; text-overflow: ellipsis; }
        .hosp-dot { width: 7px; height: 7px; border-radius: 50%; background: #3B6D11; flex-shrink: 0; animation: twPulse 2s ease-in-out infinite; }
        .hosp-profile-trigger { display: flex; align-items: center; gap: 9px; padding: 5px 12px 5px 5px; background: #fff; border: 1px solid var(--blue-100); border-radius: 100px; cursor: pointer; transition: all 0.15s; }
        .hosp-profile-trigger:hover { border-color: var(--blue-300); background: var(--blue-50); }
        .hosp-avatar { width: 28px; height: 28px; border-radius: 50%; background: var(--blue-600); color: #fff; display: flex; align-items: center; justify-content: center; font-family: 'Plus Jakarta Sans', 'Noto Sans Devanagari', 'Noto Sans Telugu', 'Noto Sans Kannada', sans-serif; font-size: 11px; font-weight: 700; flex-shrink: 0; }
        .hosp-name { font-size: 13px; font-weight: 500; color: var(--gray-800); max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .hosp-chevron { font-size: 9px; color: var(--gray-400); transition: transform 0.2s; }
        .hosp-chevron.open { transform: rotate(180deg); }
        .user-trigger { display: flex; align-items: center; gap: 9px; padding: 5px 12px 5px 5px; background: #fff; border: 1px solid var(--blue-100); border-radius: 100px; cursor: pointer; transition: all 0.15s; }
        .user-trigger:hover { border-color: var(--blue-300); background: var(--blue-50); }
        .user-avatar { width: 28px; height: 28px; border-radius: 50%; background: var(--blue-600); color: #fff; display: flex; align-items: center; justify-content: center; font-family: 'Plus Jakarta Sans', 'Noto Sans Devanagari', 'Noto Sans Telugu', 'Noto Sans Kannada', sans-serif; font-size: 11px; font-weight: 700; flex-shrink: 0; }
        .user-name { font-size: 13px; font-weight: 500; color: var(--gray-800); max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .user-chevron { font-size: 9px; color: var(--gray-400); transition: transform 0.2s; }
        .user-chevron.open { transform: rotate(180deg); }
        .nav-dropdown { position: absolute; top: calc(100% + 8px); right: 0; width: 220px; background: #fff; border: 1px solid var(--blue-100); border-radius: 14px; padding: 6px; z-index: 1100; box-shadow: 0 8px 32px rgba(24,95,165,0.14); animation: dropIn 0.18s cubic-bezier(0.34,1.56,0.64,1) both; }
        @keyframes dropIn { from{opacity:0;transform:translateY(-6px) scale(0.97)} to{opacity:1;transform:translateY(0) scale(1)} }
        .nav-drop-header { padding: 10px 12px; border-bottom: 1px solid var(--blue-50); margin-bottom: 4px; }
        .nav-drop-name { font-family: 'Plus Jakarta Sans', 'Noto Sans Devanagari', 'Noto Sans Telugu', 'Noto Sans Kannada', sans-serif; font-weight: 700; font-size: 14px; color: var(--gray-900); margin-bottom: 2px; }
        .nav-drop-role { font-size: 11px; color: var(--blue-600); text-transform: uppercase; letter-spacing: 1px; font-weight: 600; }
        .nav-drop-item { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 8px; font-size: 14px; color: var(--gray-700); text-decoration: none; cursor: pointer; transition: all 0.12s; border: none; background: none; width: 100%; text-align: left; font-family: 'DM Sans', 'Noto Sans Devanagari', 'Noto Sans Telugu', 'Noto Sans Kannada', sans-serif; }
        .nav-drop-item:hover { background: var(--blue-50); color: var(--blue-800); text-decoration: none; }
        .nav-drop-item.danger { color: var(--color-error-text); }
        .nav-drop-item.danger:hover { background: var(--color-error-bg); }
        .nav-drop-icon { width: 26px; height: 26px; border-radius: 7px; background: var(--gray-100); display: flex; align-items: center; justify-content: center; font-size: 13px; flex-shrink: 0; }
        .nav-drop-divider { height: 1px; background: var(--blue-50); margin: 4px 0; }
        .lang-switch { position: relative; }
        .lang-trigger { display: flex; align-items: center; gap: 6px; padding: 6px 12px; background: #fff; border: 1px solid var(--blue-100); border-radius: 100px; cursor: pointer; transition: all 0.15s; font-family: 'DM Sans', 'Noto Sans Devanagari', 'Noto Sans Telugu', 'Noto Sans Kannada', sans-serif; }
        .lang-trigger:hover { border-color: var(--blue-300); background: var(--blue-50); }
        .lang-globe { font-size: 14px; line-height: 1; }
        .lang-code { font-size: 12px; font-weight: 700; color: var(--blue-600); text-transform: uppercase; letter-spacing: 0.5px; }
        .lang-chevron { font-size: 9px; color: var(--gray-400); transition: transform 0.2s; }
        .lang-chevron.open { transform: rotate(180deg); }
        .lang-dropdown { width: 170px; }
        .nav-drop-item.lang-active { background: var(--blue-50); color: var(--blue-800); font-weight: 600; }
        .lang-check { margin-left: auto; color: var(--blue-600); font-weight: 700; }
        .lang-switch-mobile { padding: 8px 4px 12px; }
        .mobile-lang-label { font-size: 12px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: var(--gray-400); margin-bottom: 10px; }
        .mobile-lang-options { display: flex; gap: 8px; flex-wrap: wrap; }
        .mobile-lang-pill { padding: 9px 16px; border-radius: 100px; border: 1px solid var(--blue-100); background: var(--gray-50); color: var(--gray-700); font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.15s; font-family: 'DM Sans', 'Noto Sans Devanagari', 'Noto Sans Telugu', 'Noto Sans Kannada', sans-serif; }
        .mobile-lang-pill:hover { border-color: var(--blue-300); background: var(--blue-50); }
        .mobile-lang-pill.active { background: var(--blue-600); border-color: var(--blue-600); color: #fff; font-weight: 700; }
        .hamburger { display: none; flex-direction: column; gap: 5px; background: none; border: none; cursor: pointer; padding: 8px; border-radius: 8px; }
        .hamburger:hover { background: var(--blue-50); }
        .hamburger span { display: block; width: 20px; height: 2px; background: var(--gray-700); border-radius: 2px; transition: all 0.25s; transform-origin: center; }
        .hamburger.open span:nth-child(1) { transform: translateY(7px) rotate(45deg); }
        .hamburger.open span:nth-child(2) { opacity:0; transform: scaleX(0); }
        .hamburger.open span:nth-child(3) { transform: translateY(-7px) rotate(-45deg); }
        .mobile-drawer { position: fixed; top: 64px; left:0; right:0; bottom:0; z-index: 999; background: #fff; padding: 16px 20px; display: flex; flex-direction: column; gap: 4px; overflow-y: auto; border-top: 1px solid var(--blue-100); }
        .mobile-link { display: flex; align-items: center; gap: 12px; padding: 13px 16px; border-radius: 12px; font-size: 15px; font-weight: 500; color: var(--gray-700); text-decoration: none; transition: all 0.15s; border: 1px solid transparent; }
        .mobile-link:hover, .mobile-link.active { background: var(--blue-50); border-color: var(--blue-200); color: var(--blue-700); text-decoration: none; }
        .mobile-link-icon { width: 34px; height: 34px; border-radius: 9px; background: var(--gray-100); display: flex; align-items: center; justify-content: center; font-size: 16px; }
        .mobile-divider { height: 1px; background: var(--blue-50); margin: 6px 0; }
        .mobile-user-card { display: flex; align-items: center; gap: 12px; padding: 14px; background: var(--blue-50); border: 1px solid var(--blue-200); border-radius: 14px; margin-bottom: 6px; }
        .mobile-avatar { width: 42px; height: 42px; border-radius: 50%; background: var(--blue-600); color: #fff; display: flex; align-items: center; justify-content: center; font-family: 'Plus Jakarta Sans', 'Noto Sans Devanagari', 'Noto Sans Telugu', 'Noto Sans Kannada', sans-serif; font-size: 16px; font-weight: 800; }
        @keyframes twPulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @media (max-width: 860px) { .nav-links { display: none; } .hamburger { display: flex; } .hosp-badge { display: none; } }
        @media (max-width: 480px) { .nav-inner { padding: 0 16px; } }
        .nav-spacer { height: 64px; }
      `}</style>

      <nav className={`nav-root ${scrolled ? 'scrolled' : ''}`}>
        <div className="nav-inner">
          <Link to="/" className="nav-brand">
            <div className="nav-logo"><img src="/logo.png" alt="TokenWalla" /></div>
            <span className="nav-wordmark"><span className="accent">Token</span>walla</span>
          </Link>

          {!isHospital && (
            <ul className="nav-links">
              {NAV_LINKS.map(l => (
                <li key={l.to}>
                  <Link to={l.to} className={`nav-link ${isActive(l.to) ? 'active' : ''}`}>{t(l.key)}</Link>
                </li>
              ))}
            </ul>
          )}

          <div className="nav-right">
            <LanguageSwitcher />

            {isHospital && (
              <>
                <div className="hosp-badge">
                  <span className="hosp-dot" />🏥 {hospName}
                </div>
                <div style={{ position: 'relative' }} ref={hospDropRef}>
                  <div className="hosp-profile-trigger" onClick={() => setHospDrop(p => !p)}>
                    <div className="hosp-avatar">{initials(hospName)}</div>
                    <span className="hosp-name">{hospName}</span>
                    <span className={`hosp-chevron ${hospDrop ? 'open' : ''}`}>▼</span>
                  </div>
                  {hospDrop && (
                    <div className="nav-dropdown">
                      <div className="nav-drop-header">
                        <div className="nav-drop-name">{hospName}</div>
                        <div className="nav-drop-role">{t('nav.hospitalAdminRole')}</div>
                      </div>
                      <Link to="/Hdashboard" className="nav-drop-item" onClick={() => setHospDrop(false)}>
                        <div className="nav-drop-icon">🏥</div> {t('nav.dashboard')}
                      </Link>
                      <Link to="/Hprofile" className="nav-drop-item" onClick={() => setHospDrop(false)}>
                        <div className="nav-drop-icon">👤</div> {t('nav.profile')}
                      </Link>
                      <div className="nav-drop-divider" />
                      <button className="nav-drop-item danger" onClick={logout}>
                        <div className="nav-drop-icon" style={{ background: 'var(--color-error-bg)' }}>🚪</div>
                        {t('nav.logout')}
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}

            {(isPatient || isAdmin) && (
              <div style={{ position: 'relative' }} ref={dropRef}>
                <div className="user-trigger" onClick={() => setDropOpen(p => !p)}>
                  <div className="user-avatar">{initials(user.name || user.username)}</div>
                  <span className="user-name">{user.name || user.username}</span>
                  <span className={`user-chevron ${dropOpen ? 'open' : ''}`}>▼</span>
                </div>
                {dropOpen && (
                  <div className="nav-dropdown">
                    <div className="nav-drop-header">
                      <div className="nav-drop-name">{user.name || user.username}</div>
                      <div className="nav-drop-role">{user.role || t('nav.patientRole')}</div>
                    </div>
                    <Link to="/my-bookings" className="nav-drop-item" onClick={() => setDropOpen(false)}>
                      <div className="nav-drop-icon">🎫</div> {t('nav.myBookings')}
                    </Link>
                    <Link to="/alldoctor" className="nav-drop-item" onClick={() => setDropOpen(false)}>
                      <div className="nav-drop-icon">🩺</div> {t('nav.findDoctors')}
                    </Link>
                    {isAdmin && (
                      <Link to="/Adashboard" className="nav-drop-item" onClick={() => setDropOpen(false)}>
                        <div className="nav-drop-icon">⚙️</div> {t('nav.adminPanel')}
                      </Link>
                    )}
                    <div className="nav-drop-divider" />
                    <Link to="/Hlogin" className="nav-drop-item" onClick={() => setDropOpen(false)}>
                      <div className="nav-drop-icon">🏥</div> {t('nav.hospitalLogin')}
                    </Link>
                    <div className="nav-drop-divider" />
                    <button className="nav-drop-item danger" onClick={logout}>
                      <div className="nav-drop-icon" style={{ background: 'var(--color-error-bg)' }}>🚪</div>
                      {t('nav.logout')}
                    </button>
                  </div>
                )}
              </div>
            )}

            {!user && (
              <Link to="/login" className="btn-primary" style={{ padding: '9px 20px', fontSize: 14 }}>{t('nav.login')}</Link>
            )}

            {!isHospital && (
              <button className={`hamburger ${menuOpen ? 'open' : ''}`} onClick={() => setMenuOpen(p => !p)} aria-label="Menu">
                <span /><span /><span />
              </button>
            )}
          </div>
        </div>
      </nav>

      {menuOpen && !isHospital && (
        <div className="mobile-drawer">
          {(isPatient || isAdmin) && (
            <div className="mobile-user-card">
              <div className="mobile-avatar">{initials(user.name || user.username)}</div>
              <div>
                <div style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 700, fontSize: 14, color: 'var(--gray-900)' }}>
                  {user.name || user.username}
                </div>
                <div style={{ fontSize: 12, color: 'var(--blue-600)', fontWeight: 600, textTransform: 'capitalize' }}>
                  {user.role || t('nav.patientRole')}
                </div>
              </div>
            </div>
          )}

          {NAV_LINKS.map(l => (
            <Link key={l.to} to={l.to} className={`mobile-link ${isActive(l.to) ? 'active' : ''}`}>
              <div className="mobile-link-icon">{l.icon}</div>{t(l.key)}
            </Link>
          ))}

          <div className="mobile-divider" />

          <LanguageSwitcher variant="mobile" onNavigate={() => setMenuOpen(false)} />

          <div className="mobile-divider" />

          {(isPatient || isAdmin) ? (
            <>
              <Link to="/my-bookings" className="mobile-link">
                <div className="mobile-link-icon">🎫</div> {t('nav.myBookings')}
              </Link>
              {isAdmin && (
                <Link to="/Adashboard" className="mobile-link">
                  <div className="mobile-link-icon">⚙️</div> {t('nav.adminPanel')}
                </Link>
              )}
              <div className="mobile-divider" />
              <Link to="/Hlogin" className="mobile-link">
                <div className="mobile-link-icon">🏥</div> {t('nav.hospitalLogin')}
              </Link>
              <div className="mobile-divider" />
              <button
                className="mobile-link"
                style={{ color: 'var(--color-error-text)', background: 'var(--color-error-bg)', border: '1px solid var(--color-error-border)', cursor: 'pointer', width: '100%', textAlign: 'left' }}
                onClick={logout}
              >
                <div className="mobile-link-icon" style={{ background: 'var(--color-error-bg)' }}>🚪</div>
                {t('nav.logout')}
              </button>
            </>
          ) : (
            <Link to="/login" className="btn-primary" style={{ justifyContent: 'center', padding: 14, borderRadius: 12, marginTop: 8 }}>
              {t('nav.loginMobile')}
            </Link>
          )}
        </div>
      )}

      <div className="nav-spacer" />
    </>
  );
}