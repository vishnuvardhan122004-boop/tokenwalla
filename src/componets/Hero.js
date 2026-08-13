import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import API from '../services/api';
import { filterTestDoctors } from '../services/testHospitals';
import SEO from './SEO';

const STEP_ICONS = ['bi-search', 'bi-calendar-check', 'bi-credit-card', 'bi-hospital'];
const FEATURE_ICONS = ['bi-geo-alt', 'bi-shield-lock', 'bi-hospital', 'bi-arrow-repeat', 'bi-clipboard-pulse', 'bi-phone'];

// Inline vector logos for each specialty chip. Crisp on every device (no emoji
// tofu), inherit the chip's text color via currentColor, and scale cleanly.
// Keys match SPECIALTIES[].key below.
const SPEC_ICONS = {
  general: (
    <>
      <path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6 6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3" />
      <path d="M8 15v1a6 6 0 0 0 6 6 6 6 0 0 0 6-6v-4" />
      <circle cx="20" cy="10" r="2" />
    </>
  ),
  heart: (
    <>
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
      <path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27" />
    </>
  ),
  skin: (
    <>
      <rect x="2.5" y="8" width="19" height="8" rx="4" transform="rotate(45 12 12)" />
      <path d="M9.5 9.5v5M14.5 9.5v5" />
    </>
  ),
  dental: (
    <path d="M7.5 3.5C5.5 3.5 3.5 5 3.5 8c0 1.8.5 3.3 1 5.5.4 1.8.6 4 1.5 5.5.6 1 1.6.8 2-.5l1-3.5c.2-.7.4-1 1-1s.8.3 1 1l1 3.5c.4 1.3 1.4 1.5 2 .5.9-1.5 1.1-3.7 1.5-5.5.5-2.2 1-3.7 1-5.5 0-3-2-4.5-4-4.5-1.6 0-2.8.8-4 1.8-1.2-1-2.4-1.8-4-1.8Z" />
  ),
  child: (
    <>
      <path d="M9 12h.01M15 12h.01" />
      <path d="M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5" />
      <path d="M19 6.3a9 9 0 0 1 1.8 3.9 2 2 0 0 1 0 3.6 9 9 0 0 1-17.6 0 2 2 0 0 1 0-3.6A9 9 0 0 1 12 3c2 0 3.5 1.1 3.5 2.5S14.5 8 13 8s-2.5-1.1-2.5-2.5" />
    </>
  ),
  bones: (
    <path d="M17 10c.7-.7 1.69 0 2.5 0a2.5 2.5 0 1 0 0-5 .5.5 0 0 1-.5-.5 2.5 2.5 0 1 0-5 0c0 .81.7 1.8 0 2.5l-7 7c-.7.7-1.69 0-2.5 0a2.5 2.5 0 0 0 0 5c.28 0 .5.22.5.5a2.5 2.5 0 1 0 5 0c0-.81-.7-1.8 0-2.5Z" />
  ),
  eye: (
    <>
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  ent: (
    <>
      <path d="M6 8.5a6.5 6.5 0 1 1 13 0c0 6-6 6-6 10a3.5 3.5 0 1 1-7 0" />
      <path d="M15 8.5a2.5 2.5 0 0 0-5 0v1a2 2 0 1 1 0 4" />
    </>
  ),
  women: (
    <>
      <circle cx="12" cy="9" r="6" />
      <path d="M12 15v7M9 19h6" />
    </>
  ),
  neuro: (
    <>
      <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
      <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
      <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" />
    </>
  ),
  mental: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <path d="M9 9h.01M15 9h.01" />
    </>
  ),
  diabetes: (
    <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7Z" />
  ),
  kidney: (
    <path d="M14.5 4C10 4 6 7 6 12s4 8 8.5 8c2 0 3.5-1.2 3.5-3 0-1.5-1-2.2-1-3.5 0-1 .8-1.5 1.5-2 .7-.5 1.5-1.2 1.5-2.5C20 6 17.5 4 14.5 4Z" />
  ),
  stomach: (
    <path d="M8 3v5a5 5 0 0 0 5 5 3 3 0 0 1 3 3 4 4 0 0 1-8 0" />
  ),
  lungs: (
    <>
      <path d="M12 4v7" />
      <path d="M9 11a3 3 0 0 0-3 3v3a2 2 0 0 0 4 0v-4a2 2 0 0 0-1-2Z" />
      <path d="M15 11a3 3 0 0 1 3 3v3a2 2 0 0 1-4 0v-4a2 2 0 0 1 1-2Z" />
    </>
  ),
  physio: (
    <>
      <path d="m6.5 6.5 11 11" />
      <path d="m21 21-1-1M3 3l1 1" />
      <path d="m18 22 4-4M2 6l4-4" />
      <path d="m3 10 7-7M14 21l7-7" />
    </>
  ),
};

// Renders a specialty logo as inline SVG. Inherits color/size from CSS.
function SpecIcon({ name }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {SPEC_ICONS[name]}
    </svg>
  );
}

const DEMO_QUEUE = [
  { initials: 'RK', name: 'Ravi K.',  token: 'TW-001', statusKey: 'inConsultation', active: true  },
  { initials: 'PS', name: 'Priya S.', token: 'TW-002', statusKey: 'waiting',        active: false },
  { initials: 'AM', name: 'Arjun M.', token: 'TW-003', statusKey: 'waiting',        active: false },
];

// Quick-access specialty chips. `key` is the search term passed to /alldoctor
// (`?q=key`); AllDoctor expands it via SPEC_SYNONYMS so e.g. "skin" also finds
// doctors stored as "Dermatologist". Labels are translated (hero.specialties.*).
const SPECIALTIES = [
  { key: 'general'  },
  { key: 'heart'    },
  { key: 'skin'     },
  { key: 'dental'   },
  { key: 'child'    },
  { key: 'bones'    },
  { key: 'eye'      },
  { key: 'ent'      },
  { key: 'women'    },
  { key: 'neuro'    },
  { key: 'mental'   },
  { key: 'diabetes' },
  { key: 'kidney'   },
  { key: 'stomach'  },
  { key: 'lungs'    },
  { key: 'physio'   },
];

export default function Hero() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [doctors,   setDoctors]   = useState([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [heroSearch, setHeroSearch] = useState('');

  const handleHeroSearch = (e) => {
    e.preventDefault();
    const q = heroSearch.trim();
    navigate(q ? `/alldoctor?q=${encodeURIComponent(q)}` : '/alldoctor');
  };

  const STATS = [
    { num: '2,400+', label: t('hero.stats.tokensIssued') },
    { num: '18',     label: t('hero.stats.hospitals') },
    { num: '94%',    label: t('hero.stats.onTimeRate') },
    { num: '4.8',   label: t('hero.stats.patientRating') },
  ];

  const STEPS = t('hero.process.steps', { returnObjects: true }).map((s, i) => ({ ...s, icon: STEP_ICONS[i] }));
  const FEATURES = t('hero.features.items', { returnObjects: true }).map((f, i) => ({ ...f, icon: FEATURE_ICONS[i] }));

  useEffect(() => {
API.get('/doctors/').then(({ data }) => {
  const doctors = Array.isArray(data) ? data : (data.results || []);
  setDoctors(filterTestDoctors(doctors).slice(0, 6));
}).catch(() => {});
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setActiveIdx(p => (p + 1) % 3), 2600);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
    <SEO
      title="Book Doctor Appointments Online — Skip Hospital Queue"
    description="TokenWalla lets you book doctor appointments online in Andhra Pradesh & Telangana. Get a digital OPD token, track your live queue position, and walk in right on time. No more waiting rooms."
    keywords="book doctor appointment online, hospital token booking AP, skip hospital queue, OPD booking Telangana, doctor appointment Hindupur"
    url="/"
    /> 
      <style>{`
        .hero-root { font-family: var(--font-body); background: #fff; color: var(--gray-900); }

        /* ── HERO ── */
        .hero-section {
          position: relative; overflow: hidden;
          padding: 76px 0 72px; min-height: 84vh;
          display: flex; align-items: center;
          background: linear-gradient(180deg, var(--blue-50) 0%, #FFFFFF 62%);
        }
        .hero-glow {
          position: absolute; top: -160px; right: -140px;
          width: 560px; height: 560px; border-radius: 50%;
          background: radial-gradient(circle, rgba(55,138,221,0.10) 0%, transparent 70%);
          pointer-events: none;
        }
        .hero-badge {
          display: inline-flex; align-items: center; gap: 8px;
          background: #fff; border: 1px solid var(--blue-100);
          border-radius: 100px; padding: 6px 16px;
          font-size: 13px; font-weight: 500; color: var(--blue-700);
          box-shadow: var(--shadow-sm); margin-bottom: 24px;
        }

        /* Hero search bar */
        .hero-search {
          display: flex; align-items: center; gap: 8px;
          background: #fff; border: 1px solid var(--blue-100);
          border-radius: 16px; padding: 8px 8px 8px 18px;
          box-shadow: var(--shadow-md); max-width: 520px; margin-bottom: 18px;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .hero-search:focus-within { border-color: var(--blue-300); box-shadow: var(--shadow-lg); }
        .hero-search-icon { font-size: 17px; color: var(--gray-400); line-height: 1; }
        .hero-search-input {
          flex: 1; border: none; outline: none; background: transparent;
          font-family: var(--font-body); font-size: 15px; color: var(--gray-900);
          padding: 12px 4px; min-width: 0;
        }
        .hero-search-input::placeholder { color: var(--gray-400); }
        .hero-search-btn {
          flex-shrink: 0; border: none; cursor: pointer;
          background: var(--blue-600); color: #fff;
          font-family: var(--font-body); font-size: 14.5px; font-weight: 600;
          border-radius: 11px; padding: 12px 22px; transition: background 0.15s;
        }
        .hero-search-btn:hover { background: var(--blue-700); }
        .hero-badge-dot {
          width: 7px; height: 7px; border-radius: 50%; background: var(--color-success-text);
          animation: twPulse 2s ease-in-out infinite;
        }
        .hero-title {
          font-family: var(--font-display);
          font-size: clamp(2.4rem, 5.5vw, 4rem);
          font-weight: 800; line-height: 1.1; margin-bottom: 20px; color: var(--gray-900);
        }
        .hero-title .accent { color: var(--blue-600); }
        .hero-sub {
          font-size: 1.05rem; color: var(--gray-600); line-height: 1.7;
          max-width: 500px; margin-bottom: 36px; font-weight: 400;
        }
        .hero-actions { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; margin-bottom: 30px; }
        .hero-book-btn { padding: 14px 30px; font-size: 15px; font-weight: 600; box-shadow: var(--shadow-md); }
        .hero-browse-link {
          font-size: 14.5px; font-weight: 600; color: var(--blue-600);
          text-decoration: none; border-bottom: 1px solid transparent; transition: border-color 0.15s;
        }
        .hero-browse-link:hover { border-bottom-color: var(--blue-400); }

        /* Specialty quick-filter chips */
        .hero-specs { margin-bottom: 48px; }
        .hero-specs-label {
          font-size: 12px; font-weight: 700; letter-spacing: 0.6px;
          text-transform: uppercase; color: var(--gray-400); margin-bottom: 12px;
        }
        .hero-specs-row { display: flex; flex-wrap: wrap; gap: 10px; }
        .hero-spec-chip {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 8px 15px; border-radius: 100px;
          background: #fff; border: 1px solid var(--blue-100);
          font-size: 13.5px; font-weight: 600; color: var(--gray-900);
          text-decoration: none; cursor: pointer;
          transition: border-color 0.15s, background 0.15s, transform 0.15s, box-shadow 0.15s;
        }
        .hero-spec-chip:hover {
          border-color: var(--blue-300); background: var(--blue-50);
          transform: translateY(-1px); box-shadow: 0 4px 14px rgba(37, 99, 235, 0.10);
        }
        .hero-spec-icon {
          display: inline-flex; align-items: center; justify-content: center;
          color: var(--blue-600, #2563eb);
        }
        .hero-spec-icon svg { width: 17px; height: 17px; display: block; }
        .hero-spec-chip:hover .hero-spec-icon { color: var(--blue-700, #1d4ed8); }

        /* Stats strip */
        .stats-strip {
          display: flex; gap: 0; border-top: 1px solid var(--blue-100);
          padding-top: 32px;
        }
        .stat-item {
          flex: 1; padding-right: 24px;
          border-left: 2px solid var(--blue-200); padding-left: 20px;
        }
        .stat-item:first-child { border-left: none; padding-left: 0; }
        .stat-num {
          font-family: var(--font-display);
          font-size: 1.7rem; font-weight: 800; color: var(--blue-600); line-height: 1;
        }
        .stat-label { font-size: 13px; color: var(--gray-500); margin-top: 3px; }

        /* Token card visual */
        .token-card-visual {
          background: #fff; border: 1px solid var(--blue-100);
          border-radius: 20px; padding: 28px;
          box-shadow: 0 18px 40px rgba(24,95,165,0.10);
          position: relative; overflow: hidden;
        }
        .token-label { font-size: 11px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; color: var(--gray-400); margin-bottom: 4px; }
        .token-live-badge {
          display: inline-flex; align-items: center; gap: 6px;
          background: var(--color-success-bg); border: 1px solid var(--color-success-border);
          border-radius: 100px; padding: 4px 12px; font-size: 12px; font-weight: 600;
          color: var(--color-success-text); margin-bottom: 10px;
        }
        .token-number {
          font-family: var(--font-mono);
          font-size: 3.5rem; font-weight: 500; color: var(--blue-600);
          line-height: 1; margin-bottom: 8px; letter-spacing: -1px;
        }
        .token-doctor-info { font-size: 14px; color: var(--gray-500); margin-bottom: 4px; }

        .demo-queue-row {
          display: flex; align-items: center; gap: 12px;
          background: var(--gray-50); border: 1px solid var(--gray-200);
          border-radius: 10px; padding: 11px 14px;
          margin-bottom: 8px; transition: all 0.3s;
        }
        .demo-queue-row.active {
          background: var(--blue-50); border-color: var(--blue-200);
        }
        .demo-avatar {
          width: 34px; height: 34px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-family: var(--font-display);
          font-size: 12px; font-weight: 700; flex-shrink: 0;
        }
        .demo-avatar.active { background: var(--blue-600); color: #fff; }
        .demo-avatar.idle   { background: var(--gray-200); color: var(--gray-600); }
        .demo-status { font-size: 12px; font-weight: 600; }
        .demo-status.active { color: var(--blue-600); }
        .demo-status.idle   { color: var(--gray-400); }

        .float-chip {
          position: absolute; background: #fff;
          border: 1px solid var(--blue-100); border-radius: 12px; padding: 9px 14px;
          font-size: 12px; color: var(--gray-700); white-space: nowrap;
          box-shadow: var(--shadow-sm);
        }
        .float-chip-1 { top: -14px; right: -10px; }
        .float-chip-2 { bottom: 16px; left: -18px; }

        /* ── STEPS ── */
        .steps-section { padding: clamp(56px, 8vw, 96px) 0; background: #fff; }
        .steps-grid {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 16px; margin-top: clamp(32px, 5vw, 52px);
        }
        .step-card {
          padding: 28px 24px; position: relative; background: #fff;
          border: 1px solid var(--blue-100); border-radius: 16px;
          transition: border-color 0.2s, box-shadow 0.2s, transform 0.2s;
        }
        .step-card:hover { border-color: var(--blue-200); box-shadow: var(--shadow-md); transform: translateY(-3px); }
        .step-num {
          font-family: var(--font-display);
          font-size: 2.4rem; font-weight: 800; color: var(--blue-100);
          line-height: 1; margin-bottom: 14px;
        }
        .step-icon-wrap {
          width: 44px; height: 44px; border-radius: 12px;
          background: var(--blue-50); border: 1px solid var(--blue-100);
          display: flex; align-items: center; justify-content: center;
          font-size: 20px; margin-bottom: 16px;
        }
        .step-title { font-family: var(--font-display); font-size: 1rem; font-weight: 700; margin-bottom: 8px; color: var(--gray-900); }
        .step-desc  { font-size: 14px; color: var(--gray-500); line-height: 1.65; }

        /* ── DOCTORS ── */
        .doctors-section { padding: 0 0 clamp(56px, 8vw, 80px); background: #fff; }
        .doctors-scroll {
          display: flex; gap: 18px; overflow-x: auto;
          padding-bottom: 10px; margin-top: 40px; scrollbar-width: none;
          -webkit-overflow-scrolling: touch;
        }
        .doctors-scroll::-webkit-scrollbar { display: none; }
        .doc-card {
          flex-shrink: 0; width: 210px;
          background: #fff; border: 1px solid var(--blue-100);
          border-radius: 18px; overflow: hidden;
          transition: all 0.25s; cursor: pointer; text-decoration: none; color: inherit;
        }
        .doc-card:hover {
          transform: translateY(-4px); border-color: var(--blue-200);
          box-shadow: var(--shadow-md); text-decoration: none; color: inherit;
        }
        .doc-img { width: 100%; height: 150px; object-fit: cover; }
        .doc-img-placeholder {
          width: 100%; height: 150px; background: var(--blue-50);
          display: flex; align-items: center; justify-content: center; font-size: 3rem;
        }
        .doc-info { padding: 14px; }
        .doc-spec { font-size: 11px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; color: var(--blue-600); margin-bottom: 4px; }
        .doc-name { font-family: var(--font-display); font-size: 14px; font-weight: 700; margin-bottom: 6px; color: var(--gray-900); }
        .doc-meta { display: flex; justify-content: space-between; font-size: 12px; color: var(--gray-500); }

        /* ── FEATURES ── */
        .features-section { padding: clamp(56px, 8vw, 88px) 0; background: var(--gray-50); border-top: 1px solid var(--blue-50); border-bottom: 1px solid var(--blue-50); }
        .features-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 18px; margin-top: clamp(32px, 5vw, 48px); }
        .feature-card {
          background: #fff; border: 1px solid var(--blue-100);
          border-radius: 16px; padding: 26px;
          transition: border-color 0.2s, box-shadow 0.2s, transform 0.2s;
        }
        .feature-card:hover { border-color: var(--blue-200); box-shadow: var(--shadow-md); transform: translateY(-3px); }
        .feature-icon {
          width: 46px; height: 46px; border-radius: 12px;
          background: var(--blue-50); border: 1px solid var(--blue-100);
          display: flex; align-items: center; justify-content: center;
          font-size: 22px; margin-bottom: 16px;
        }
        .feature-title { font-family: var(--font-display); font-size: 1rem; font-weight: 700; margin-bottom: 8px; color: var(--gray-900); }
        .feature-desc  { font-size: 14px; color: var(--gray-500); line-height: 1.65; }

        /* ── PRICING ── */
        .pricing-section { padding: clamp(56px, 8vw, 96px) 0; background: #fff; }
        .price-card {
          max-width: 380px; margin: clamp(32px, 5vw, 48px) auto 0;
          background: var(--blue-600); border-radius: 22px;
          padding: 40px 36px; color: #fff; position: relative; overflow: hidden;
          box-shadow: 0 20px 44px rgba(24,95,165,0.18);
        }
        .price-badge {
          display: inline-block;
          background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.25);
          border-radius: 100px; padding: 4px 14px; font-size: 11px;
          font-weight: 700; letter-spacing: 1px; text-transform: uppercase;
          color: rgba(255,255,255,0.9); margin-bottom: 20px;
        }
        .price-name { font-size: 14px; font-weight: 500; color: rgba(255,255,255,0.7); margin-bottom: 12px; }
        .price-amount { font-family: var(--font-display); font-size: 4rem; font-weight: 800; line-height: 1; margin-bottom: 6px; }
        .price-amount sup { font-size: 1.5rem; vertical-align: super; font-weight: 600; }
        .price-sub { font-size: 13px; color: rgba(255,255,255,0.55); margin-bottom: 4px; }
        .price-note { font-size: 12px; color: rgba(255,255,255,0.4); margin-bottom: 28px; }
        .price-features { list-style: none; padding: 0; margin: 0 0 32px; display: flex; flex-direction: column; gap: 11px; }
        .price-features li { display: flex; align-items: center; gap: 10px; font-size: 14px; color: rgba(255,255,255,0.85); }
        .price-check { color: #9FE1CB; font-size: 16px; }

        /* ── CTA ── */
        .cta-section { padding: clamp(48px, 7vw, 80px) 0 clamp(56px, 8vw, 96px); background: #fff; }
        .cta-box {
          background: linear-gradient(135deg, var(--blue-700) 0%, var(--blue-900) 100%);
          border-radius: 24px;
          padding: clamp(40px, 6vw, 64px) clamp(24px, 5vw, 48px); text-align: center; color: #fff;
          position: relative; overflow: hidden;
        }
        .cta-title { font-family: var(--font-display); font-size: clamp(1.8rem, 4vw, 3rem); font-weight: 800; margin-bottom: 16px; position: relative; }
        .cta-sub { color: rgba(255,255,255,0.65); font-size: 1.05rem; margin-bottom: 36px; position: relative; }
        .cta-actions { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; position: relative; }
        .btn-white {
          display: inline-flex; align-items: center; gap: 8px;
          background: #fff; color: var(--blue-700);
          border: none; border-radius: 12px; padding: 14px 28px;
          font-family: var(--font-body); font-size: 15px; font-weight: 600;
          cursor: pointer; text-decoration: none; transition: all 0.2s;
        }
        .btn-white:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.15); color: var(--blue-800); text-decoration: none; }
        .btn-white-outline {
          display: inline-flex; align-items: center; gap: 8px;
          background: transparent; color: rgba(255,255,255,0.9);
          border: 1px solid rgba(255,255,255,0.35); border-radius: 12px; padding: 14px 28px;
          font-family: var(--font-body); font-size: 15px; font-weight: 500;
          cursor: pointer; text-decoration: none; transition: all 0.2s;
        }
        .btn-white-outline:hover { border-color: rgba(255,255,255,0.7); background: rgba(255,255,255,0.08); color: #fff; text-decoration: none; }

        @keyframes twPulse { 0%,100%{opacity:1} 50%{opacity:0.4} }

        /* Hero product card: right-aligned beside the copy, centered when stacked */
        .hero-visual { position: relative; max-width: 420px; margin-left: auto; }

        /* ── Tablet ── */
        @media (max-width: 991px) {
          .hero-section { min-height: auto; }
          .hero-visual { margin: 44px auto 0; }
        }

        /* ── Mobile ── */
        @media (max-width: 768px) {
          .hero-section { padding: 48px 0 44px; }
          .hero-title { line-height: 1.12; }
          .hero-sub { margin-bottom: 28px; }
          .hero-search { max-width: 100%; }
          .hero-specs { margin-bottom: 36px; }
          .steps-grid { grid-template-columns: 1fr; }
          .stats-strip { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; padding-top: 24px; }
          .stat-item { border-left: none; border-top: 1px solid var(--blue-100); padding: 14px 0 0; }
        }

        /* ── Small phones ── */
        @media (max-width: 480px) {
          .hero-badge { font-size: 12px; padding: 5px 13px; }
          .hero-search { padding: 6px 6px 6px 14px; border-radius: 14px; }
          .hero-search-input { padding: 11px 4px; font-size: 14px; }
          .hero-search-btn { padding: 11px 16px; font-size: 13.5px; }
          .hero-book-btn { width: 100%; justify-content: center; }
          .hero-spec-chip { padding: 7px 12px; font-size: 12.5px; }
          .token-card-visual { padding: 22px; }
          .token-number { font-size: 3rem; }
          .price-card { padding: 32px 24px; }
          .stat-num { font-size: 1.5rem; }
        }
      `}</style>

      <div className="hero-root">

        {/* ── HERO ── */}
        <section className="hero-section">
          <div className="hero-glow" />
          <div className="tw-container" style={{ position: 'relative', width: '100%' }}>
            <div className="row align-items-center g-5">

              {/* Left */}
              <div className="col-lg-6 fade-up">
                <div className="hero-badge">
                  <span className="hero-badge-dot" />
                  {t('hero.badge')}
                </div>
                <h1 className="hero-title">
                  {t('hero.titleLine1')}<br />
                  <span className="accent">{t('hero.titleLine2')}</span><br />
                  {t('hero.titleLine3')}
                </h1>
                <p className="hero-sub">
                  {t('hero.subtitle')}
                </p>
                {/* Search */}
                <form className="hero-search" onSubmit={handleHeroSearch} role="search">
                  <span className="hero-search-icon" aria-hidden="true"><i className="bi bi-search me-1" /></span>
                  <input
                    className="hero-search-input"
                    type="text"
                    value={heroSearch}
                    onChange={e => setHeroSearch(e.target.value)}
                    placeholder={t('hero.searchPlaceholder')}
                    aria-label={t('hero.searchPlaceholder')}
                  />
                  <button type="submit" className="hero-search-btn">{t('hero.searchBtn')}</button>
                </form>

                {/* Primary CTA */}
                <div className="hero-actions">
                  <Link to="/alldoctor" className="btn-primary hero-book-btn">
                    {t('hero.bookAppointment')}
                  </Link>
                  <Link to="/alldoctor" className="hero-browse-link">
                    {t('hero.doctorsPreview.viewAll')}
                  </Link>
                </div>

                {/* Specialty quick-filters */}
                <div className="hero-specs">
                  <div className="hero-specs-label">{t('hero.specialtiesLabel')}</div>
                  <div className="hero-specs-row">
                    {SPECIALTIES.map(s => (
                      <Link key={s.key} to={`/alldoctor?q=${s.key}`} className="hero-spec-chip">
                        <span className="hero-spec-icon"><SpecIcon name={s.key} /></span>
                        {t(`hero.specialties.${s.key}`)}
                      </Link>
                    ))}
                  </div>
                </div>

                {/* Stats */}
                <div className="stats-strip">
                  {STATS.map((s, i) => (
                    <div className="stat-item" key={i}>
                      <div className="stat-num">{s.num}</div>
                      <div className="stat-label">{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right — Token card */}
              <div className="col-lg-6 fade-up" style={{ animationDelay: '0.15s' }}>
                <div className="hero-visual">
                  <div className="token-card-visual">
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
                      <div>
                        <div className="token-label">{t('hero.tokenCard.yourToken')}</div>
                        <div className="token-live-badge">
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-success-text)', animation: 'twPulse 2s infinite', flexShrink: 0 }} />
                          {t('hero.tokenCard.queueActive')}
                        </div>
                        <div className="token-number">#007</div>
                        <div className="token-doctor-info">{t('hero.tokenCard.doctorInfo')}</div>
                        <div style={{ fontSize: 13, color: 'var(--gray-400)', marginTop: 2 }}>{t('hero.tokenCard.todaySlot')}</div>
                      </div>
                      <div style={{
                        width: 60, height: 60, borderRadius: 16,
                        background: 'var(--blue-50)', border: '1px solid var(--blue-200)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, flexShrink: 0
                      }}><i className="bi bi-hospital me-1" /></div>
                    </div>

                    <div style={{ borderTop: '1px solid var(--blue-50)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {DEMO_QUEUE.map((p, i) => (
                        <div className={`demo-queue-row ${i === activeIdx ? 'active' : ''}`} key={i}>
                          <div className={`demo-avatar ${i === activeIdx ? 'active' : 'idle'}`}>
                            {p.initials}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--gray-800)' }}>{p.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>{p.token}</div>
                          </div>
                          <div className={`demo-status ${i === activeIdx ? 'active' : 'idle'}`}>
                            {t(`hero.demoStatus.${p.statusKey}`)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── HOW IT WORKS ── */}
        <section className="steps-section">
          <div className="tw-container">
            <div style={{ maxWidth: 560 }}>
              <div className="tw-section-label">{t('hero.process.label')}</div>
              <h2 style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{t('hero.process.heading')}</h2>
              <p style={{ color: 'var(--gray-500)', fontSize: '1.05rem', lineHeight: 1.7 }}>
                {t('hero.process.sub')}
              </p>
            </div>
            <div className="steps-grid">
              {STEPS.map((s, i) => (
                <div className="step-card" key={i}>
                  <div className="step-num">0{i + 1}</div>
                  <div className="step-icon-wrap"><i className={`bi ${s.icon}`} /></div>
                  <div className="step-title">{s.title}</div>
                  <div className="step-desc">{s.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── DOCTORS PREVIEW ── */}
        {doctors.length > 0 && (
          <section className="doctors-section">
            <div className="tw-container">
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
                <div>
                  <div className="tw-section-label">{t('hero.doctorsPreview.label')}</div>
                  <h2 style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', margin: 0 }}>{t('hero.doctorsPreview.heading')}</h2>
                </div>
                <Link to="/alldoctor" className="btn-outline" style={{ padding: '10px 20px', fontSize: 14 }}>
                  {t('hero.doctorsPreview.viewAll')}
                </Link>
              </div>
              <div className="doctors-scroll">
                {doctors.map(doc => (
                  <Link to={`/doctor/${doc.id}`} className="doc-card" key={doc.id}>
                    {doc.image && !doc.image.includes('placehold')
                      ? <img src={doc.image} alt={doc.name} className="doc-img" />
                      : <div className="doc-img-placeholder"><i className="bi bi-clipboard-pulse me-1" /></div>
                    }
                    <div className="doc-info">
                      <div className="doc-spec">{doc.specialization}</div>
                      <div className="doc-name">{doc.name}</div>
                      <div className="doc-meta">
                        <span><i className="bi bi-geo-alt me-1" />{doc.city}</span>
                        <span>{t('hero.doctorsPreview.yearsExp', { count: doc.experience })}</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── FEATURES ── */}
        <section className="features-section">
          <div className="tw-container">
            <div style={{ maxWidth: 560, margin: '0 auto', textAlign: 'center' }}>
              <div className="tw-section-label">{t('hero.features.label')}</div>
              <h2 style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{t('hero.features.heading')}</h2>
              <p style={{ color: 'var(--gray-500)', fontSize: '1.05rem', lineHeight: 1.7 }}>
                {t('hero.features.sub')}
              </p>
            </div>
            <div className="features-grid">
              {FEATURES.map((f, i) => (
                <div className="feature-card" key={i}>
                  <div className="feature-icon"><i className={`bi ${f.icon}`} /></div>
                  <div className="feature-title">{f.title}</div>
                  <div className="feature-desc">{f.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── PRICING ── */}
        <section className="pricing-section">
          <div className="tw-container">
            <div style={{ maxWidth: 560, margin: '0 auto', textAlign: 'center' }}>
              <div className="tw-section-label">{t('hero.pricing.label')}</div>
              <h2 style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{t('hero.pricing.heading')}</h2>
              <p style={{ color: 'var(--gray-500)' }}>{t('hero.pricing.sub')}</p>
            </div>
            <div className="price-card">
              <div className="price-badge">{t('hero.pricing.badge')}</div>
              <div className="price-name">{t('hero.pricing.planName')}</div>
              <div className="price-amount"><sup>₹</sup>20</div>
              <div className="price-sub">{t('hero.pricing.planSub')}</div>
              <div className="price-note">{t('hero.pricing.note')}</div>
              <ul className="price-features">
                {t('hero.pricing.features', { returnObjects: true }).map(f => (
                  <li key={f}><span className="price-check">✓</span> {f}</li>
                ))}
              </ul>
              <Link to="/alldoctor" className="btn-white-outline" style={{ width: '100%', justifyContent: 'center' }}>
                {t('hero.pricing.cta')}
              </Link>
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="cta-section">
          <div className="tw-container">
            <div className="cta-box">
              <h2 className="cta-title">{t('hero.cta.title')}</h2>
              <p className="cta-sub">{t('hero.cta.sub')}</p>
              <div className="cta-actions">
                <Link to="/alldoctor" className="btn-white-outline">{t('hero.cta.bookNow')}</Link>
                <Link to="/Husercreate" className="btn-white-outline">{t('hero.cta.registerHospital')}</Link>
              </div>
            </div>
          </div>
        </section>

      </div>
    </>
  );
}