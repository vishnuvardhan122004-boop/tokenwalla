import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';

export default function Footer() {
  const { t } = useTranslation();
  return (
    <>
      <style>{`
        .footer-root {
          background: var(--blue-900);
          color: rgba(255,255,255,0.7);
          font-family: var(--font-body);
          border-top: 3px solid var(--blue-600);
        }
        .footer-inner {
          max-width: 1200px; margin: 0 auto; padding: 56px 24px 32px;
        }
        .footer-brand-name {
          font-family: var(--font-display);
          font-size: 1.3rem; font-weight: 800; color: #fff; margin-bottom: 10px;
        }
        .footer-brand-name .accent { color: var(--blue-400); }
        .footer-desc {
          font-size: 14px; line-height: 1.7; max-width: 260px;
          margin-bottom: 22px; color: rgba(255,255,255,0.55);
        }
        .footer-badge {
          display: inline-flex; align-items: center; gap: 7px;
          background: rgba(120,142,163,0.15);
          border: 1px solid rgba(147,181,215,0.3);
          border-radius: 100px; padding: 5px 14px;
          font-size: 12px; color: var(--blue-200);
          margin-bottom: 16px;
        }
        .footer-playstore img {
          height: 44px;
          display: block;
          transition: opacity 0.15s;
        }
        .footer-playstore:hover img { opacity: 0.85; }
        .footer-col h6 {
          font-family: var(--font-display);
          font-size: 12px; font-weight: 700; letter-spacing: 1.5px;
          text-transform: uppercase; color: rgba(255,255,255,0.4); margin-bottom: 16px;
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
          font-size: 13px; color: rgba(255,255,255,0.3);
          flex-wrap: wrap; gap: 10px;
        }
        @media (max-width: 600px) {
          .footer-cols { flex-direction: column; gap: 32px; }
          .footer-bottom { flex-direction: column; text-align: center; gap: 6px; }
        }
        @keyframes twPulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>

      <footer className="footer-root">
        <div className="footer-inner">
          <div style={{ display: 'flex', gap: 48, flexWrap: 'wrap' }} className="footer-cols">

            {/* Brand */}
            <div style={{ minWidth: 200, flex: '1 1 200px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
                <img
                  src="/logo.png" alt="TokenWalla"
                  style={{ width: 34, height: 34, borderRadius: 9, boxShadow: '0 2px 8px rgba(55,138,221,0.3)' }}
                />
                <span className="footer-brand-name"><span className="accent">Token</span>walla</span>
              </div>
              <p className="footer-desc">
                {t('footer.desc')}
              </p>
              <div className="footer-badge">
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-success-text)', animation: 'twPulse 2s infinite' }} />
                {t('footer.liveBadge')}
              </div>

              {/* Play Store link */}
              <a
                href="https://play.google.com/store/apps/details?id=com.vishnu2004.Tokenwalla"
                target="_blank"
                rel="noopener noreferrer"
                className="footer-playstore"
                style={{ display: 'inline-block' }}
              >
                <img
                  src="https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png"
                  alt="Get it on Google Play"
                />
              </a>
            </div>

            {/* Product */}
            <div className="footer-col" style={{ minWidth: 120, flex: '1 1 120px' }}>
              <h6>{t('footer.product')}</h6>
              <Link to="/alldoctor">{t('footer.findDoctors')}</Link>
              <Link to="/login">{t('footer.patientLogin')}</Link>
              <Link to="/profilecreate">{t('footer.register')}</Link>
              <Link to="/my-bookings">{t('footer.myBookings')}</Link>
            </div>

            {/* Hospital */}
            <div className="footer-col" style={{ minWidth: 120, flex: '1 1 120px' }}>
              <h6>{t('footer.hospital')}</h6>
              <Link to="/Hlogin">{t('footer.hospitalLogin')}</Link>
              <Link to="/Husercreate">{t('footer.registerHospital')}</Link>
              <Link to="/Hdashboard">{t('footer.dashboard')}</Link>
            </div>

            {/* Company */}
            <div className="footer-col" style={{ minWidth: 120, flex: '1 1 120px' }}>
              <h6>{t('footer.company')}</h6>
              <Link to="/about">{t('footer.aboutUs')}</Link>
              <Link to="/contact">{t('footer.contact')}</Link>
              <Link to="/terms">{t('footer.terms')}</Link>
              <Link to="/privacy">{t('footer.privacy')}</Link>
              <Link to="/refund">{t('footer.refundPolicy')}</Link>
            </div>

          </div>

          <div className="footer-bottom">
            <span>{t('footer.rights', { year: new Date().getFullYear() })}</span>
            <span>{t('footer.tagline')}</span>
          </div>
        </div>
      </footer>
    </>
  );
}