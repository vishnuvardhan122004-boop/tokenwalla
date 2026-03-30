import { Link } from 'react-router';

export default function Footer() {
  return (
    <>
      <style>{`
        .footer-root {
          background: var(--gray-900);
          color: rgba(255,255,255,0.7);
          font-family: 'DM Sans', sans-serif;
          border-top: 3px solid var(--blue-600);
        }
        .footer-inner {
          max-width: 1200px; margin: 0 auto; padding: 56px 24px 32px;
        }
        .footer-brand-name {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 1.3rem; font-weight: 800; color: #fff; margin-bottom: 10px;
        }
        .footer-brand-name .accent { color: var(--blue-400); }
        .footer-desc { font-size: 14px; line-height: 1.7; max-width: 260px; margin-bottom: 22px; }
        .footer-badge {
          display: inline-flex; align-items: center; gap: 7px;
          background: rgba(120, 142, 163, 0.15); border: 1px solid rgba(147, 181, 215, 0.3);
          border-radius: 100px; padding: 5px 14px; font-size: 12px; color: var(--blue-200);
        }

        .footer-col h6 {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 12px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase;
          color: rgba(255,255,255,0.4); margin-bottom: 16px;
        }
        .footer-col a {
          display: block; font-size: 14px; color: rgba(255,255,255,0.55);
          text-decoration: none; margin-bottom: 10px; transition: color 0.15s;
        }
        .footer-col a:hover { color: #fff; }

        .footer-bottom {
          border-top: 1px solid rgba(255,255,255,0.08);
          padding-top: 24px; margin-top: 48px;
          display: flex; justify-content: space-between; align-items: center;
          font-size: 13px; color: rgba(255,255,255,0.3); flex-wrap: wrap; gap: 10px;
        }
        .footer-divider { display: block; }
        @media (max-width: 600px) { .footer-cols { flex-direction: column; gap: 32px; } }
      `}</style>

      <footer className="footer-root">
        <div className="footer-inner">
          <div style={{ display: 'flex', gap: 48, flexWrap: 'wrap' }} className="footer-cols">

            {/* Brand */}
            <div style={{ minWidth: 200, flex: '1 1 200px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
                <img src="/logo.png" alt="TokenWalla" style={{ width: 34, height: 34, borderRadius: 9, boxShadow: '0 2px 8px rgba(55,138,221,0.3)' }} />
                <span className="footer-brand-name"><span className="accent">Token</span>walla</span>
              </div>
              <p className="footer-desc">
                Smart hospital token & queue management platform helping patients and hospitals reduce waiting time.
              </p>
              <div className="footer-badge">
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3B6D11', animation: 'twPulse 2s infinite' }} />
                Live in AP & Telangana
              </div>
            </div>

            {/* Product */}
            <div className="footer-col" style={{ minWidth: 120, flex: '1 1 120px' }}>
              <h6>Product</h6>
              <Link to="/alldoctor">Find Doctors</Link>
              <Link to="/login">Patient Login</Link>
              <Link to="/profilecreate">Register</Link>
              <Link to="/my-bookings">My Bookings</Link>
            </div>

            {/* Hospital */}
            <div className="footer-col" style={{ minWidth: 120, flex: '1 1 120px' }}>
              <h6>Hospital</h6>
              <Link to="/Hlogin">Hospital Login</Link>
              <Link to="/Husercreate">Register Hospital</Link>
              <Link to="/Hdashboard">Dashboard</Link>
            </div>

            {/* Company */}
            <div className="footer-col" style={{ minWidth: 120, flex: '1 1 120px' }}>
              <h6>Company</h6>
              <Link to="/about">About Us</Link>
              <Link to="/contact">Contact</Link>
              <Link to="/terms">Terms</Link>
              <Link to="/privacy">Privacy</Link>
              <Link to="/refund">Refund Policy</Link>
            </div>

          </div>

          <div className="footer-bottom">
            <span>© {new Date().getFullYear()} TokenWalla. All rights reserved.</span>
            <span>Built with ❤ for better healthcare</span>
          </div>
        </div>
      </footer>

      <style>{`@keyframes twPulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </>
  );
}