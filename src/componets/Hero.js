import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import API from '../services/api';

const STEPS = [
  { icon: '🔍', title: 'Find a Doctor',   desc: 'Browse by specialization, city, or hospital. See real-time availability and time slots.' },
  { icon: '📅', title: 'Pick a Slot',     desc: 'Choose your preferred date and time. Confirm your appointment in under 60 seconds.' },
  { icon: '💳', title: 'Pay Securely',    desc: 'Pay ₹15 via UPI, cards or wallets. Your token and queue position are confirmed instantly.' },
  { icon: '🏥', title: 'Walk In on Time', desc: 'Arrive when your number is called. Track live position from anywhere.' },
];

const FEATURES = [
  { icon: '📍', title: 'Live Queue Tracking',   desc: 'See your exact position in real time. No more guessing when to arrive.' },
  { icon: '🔐', title: 'Secure Payments',        desc: 'Razorpay-powered. UPI, cards, net banking, wallets — all encrypted.' },
  { icon: '🏥', title: 'Multi-Hospital Network', desc: 'Works across hospitals in your city. One platform, all doctors.' },
  { icon: '♻️', title: 'Easy Cancellation',     desc: 'Cancel 2 hours before your slot for a full refund — no questions asked.' },
  { icon: '🩺', title: 'Verified Doctors',       desc: 'All doctors are registered and managed by their hospitals directly.' },
  { icon: '📱', title: 'Works on Any Device',    desc: 'Fully responsive — book from your phone, tablet, or desktop in seconds.' },
];

const DEMO_QUEUE = [
  { initials: 'RK', name: 'Ravi K.',  token: 'TW-001', status: 'In Consultation', active: true  },
  { initials: 'PS', name: 'Priya S.', token: 'TW-002', status: 'Waiting',         active: false },
  { initials: 'AM', name: 'Arjun M.', token: 'TW-003', status: 'Waiting',         active: false },
];

const STATS = [
  { num: '2,400+', label: 'Tokens Issued'  },
  { num: '18',     label: 'Hospitals'      },
  { num: '94%',    label: 'On-time Rate'   },
  { num: '4.8★',   label: 'Patient Rating' },
];

export default function Hero() {
  const [doctors,   setDoctors]   = useState([]);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    API.get('/doctors/').then(({ data }) => setDoctors(data.slice(0, 6))).catch(() => {});
  }, []);

  useEffect(() => {
    const t = setInterval(() => setActiveIdx(p => (p + 1) % 3), 2600);
    return () => clearInterval(t);
  }, []);

  return (
    <>
      <style>{`
        .hero-root { font-family: 'DM Sans', sans-serif; background: #fff; color: var(--gray-900); }

        /* ── HERO ── */
        .hero-section {
          position: relative; overflow: hidden;
          padding: 90px 0 80px; min-height: 90vh;
          display: flex; align-items: center;
          background: linear-gradient(160deg, #F4F9FF 0%, #EAF3FF 50%, #F8FBFF 100%);
        }
        .hero-grid-bg {
          position: absolute; inset: 0;
          background-image:
            linear-gradient(var(--blue-100) 1px, transparent 1px),
            linear-gradient(90deg, var(--blue-100) 1px, transparent 1px);
          background-size: 48px 48px; opacity: 0.4;
        }
        .hero-glow {
          position: absolute; top: -120px; right: -80px;
          width: 600px; height: 600px; border-radius: 50%;
          background: radial-gradient(circle, rgba(55,138,221,0.12) 0%, transparent 70%);
          pointer-events: none;
        }
        .hero-badge {
          display: inline-flex; align-items: center; gap: 8px;
          background: var(--blue-50); border: 1px solid var(--blue-200);
          border-radius: 100px; padding: 6px 16px;
          font-size: 13px; font-weight: 500; color: var(--blue-700);
          margin-bottom: 22px;
        }
        .hero-badge-dot {
          width: 7px; height: 7px; border-radius: 50%; background: #3B6D11;
          animation: twPulse 2s ease-in-out infinite;
        }
        .hero-title {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: clamp(2.4rem, 5.5vw, 4rem);
          font-weight: 800; line-height: 1.1; margin-bottom: 20px; color: var(--gray-900);
        }
        .hero-title .accent { color: var(--blue-600); }
        .hero-sub {
          font-size: 1.05rem; color: var(--gray-600); line-height: 1.7;
          max-width: 500px; margin-bottom: 36px; font-weight: 400;
        }
        .hero-actions { display: flex; gap: 14px; flex-wrap: wrap; margin-bottom: 52px; }

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
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 1.7rem; font-weight: 800; color: var(--blue-600); line-height: 1;
        }
        .stat-label { font-size: 13px; color: var(--gray-500); margin-top: 3px; }

        /* Token card visual */
        .token-card-visual {
          background: #fff; border: 1px solid var(--blue-100);
          border-radius: 22px; padding: 28px;
          box-shadow: 0 12px 48px rgba(24,95,165,0.12), 0 4px 12px rgba(0,0,0,0.04);
          position: relative; overflow: hidden;
        }
        .token-card-visual::before {
          content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
          background: linear-gradient(90deg, var(--blue-600), var(--blue-400), #85B7EB);
        }
        .token-label { font-size: 11px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; color: var(--gray-400); margin-bottom: 4px; }
        .token-live-badge {
          display: inline-flex; align-items: center; gap: 6px;
          background: var(--color-success-bg); border: 1px solid var(--color-success-border);
          border-radius: 100px; padding: 4px 12px; font-size: 12px; font-weight: 600;
          color: var(--color-success-text); margin-bottom: 10px;
        }
        .token-number {
          font-family: 'DM Mono', monospace;
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
          font-family: 'Plus Jakarta Sans', sans-serif;
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
        .steps-section {
          padding: 96px 0; background: #fff;
        }
        .steps-grid {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 0; margin-top: 56px;
          border: 1px solid var(--blue-100); border-radius: 20px; overflow: hidden;
        }
        .step-card {
          padding: 36px 28px; position: relative; background: #fff;
          border-right: 1px solid var(--blue-100); transition: background 0.2s;
        }
        .step-card:last-child { border-right: none; }
        .step-card:hover { background: var(--blue-50); }
        .step-num {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 3rem; font-weight: 800; color: var(--blue-100);
          line-height: 1; margin-bottom: 16px;
        }
        .step-icon-wrap {
          width: 46px; height: 46px; border-radius: 13px;
          background: var(--blue-50); border: 1px solid var(--blue-200);
          display: flex; align-items: center; justify-content: center;
          font-size: 20px; margin-bottom: 18px;
        }
        .step-title { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1rem; font-weight: 700; margin-bottom: 8px; color: var(--gray-900); }
        .step-desc  { font-size: 14px; color: var(--gray-500); line-height: 1.65; }

        /* ── DOCTORS ── */
        .doctors-section { padding: 0 0 80px; background: #fff; }
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
          transform: translateY(-4px); border-color: var(--blue-300);
          box-shadow: var(--shadow-md); text-decoration: none; color: inherit;
        }
        .doc-img { width: 100%; height: 150px; object-fit: cover; }
        .doc-img-placeholder {
          width: 100%; height: 150px; background: var(--blue-50);
          display: flex; align-items: center; justify-content: center; font-size: 3rem;
        }
        .doc-info { padding: 14px; }
        .doc-spec { font-size: 11px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; color: var(--blue-600); margin-bottom: 4px; }
        .doc-name { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 14px; font-weight: 700; margin-bottom: 6px; color: var(--gray-900); }
        .doc-meta { display: flex; justify-content: space-between; font-size: 12px; color: var(--gray-500); }

        /* ── FEATURES ── */
        .features-section { padding: 80px 0; background: var(--blue-50); border-top: 1px solid var(--blue-100); border-bottom: 1px solid var(--blue-100); }
        .features-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; margin-top: 52px; }
        .feature-card {
          background: #fff; border: 1px solid var(--blue-100);
          border-radius: 18px; padding: 28px;
          transition: all 0.2s;
        }
        .feature-card:hover { border-color: var(--blue-300); box-shadow: var(--shadow-md); transform: translateY(-3px); }
        .feature-icon {
          width: 48px; height: 48px; border-radius: 13px;
          background: var(--blue-50); border: 1px solid var(--blue-200);
          display: flex; align-items: center; justify-content: center;
          font-size: 22px; margin-bottom: 18px;
        }
        .feature-title { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1rem; font-weight: 700; margin-bottom: 8px; color: var(--gray-900); }
        .feature-desc  { font-size: 14px; color: var(--gray-500); line-height: 1.65; }

        /* ── PRICING ── */
        .pricing-section { padding: 96px 0; background: #fff; }
        .price-card {
          max-width: 360px; margin: 48px auto 0;
          background: var(--blue-600); border-radius: 22px;
          padding: 40px 36px; color: #fff; position: relative; overflow: hidden;
        }
        .price-card::before {
          content: ''; position: absolute; top: -60px; right: -60px;
          width: 200px; height: 200px; border-radius: 50%;
          background: rgba(255,255,255,0.06);
        }
        .price-badge {
          display: inline-block;
          background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.25);
          border-radius: 100px; padding: 4px 14px; font-size: 11px;
          font-weight: 700; letter-spacing: 1px; text-transform: uppercase;
          color: rgba(255,255,255,0.9); margin-bottom: 20px;
        }
        .price-name { font-size: 14px; font-weight: 500; color: rgba(255,255,255,0.7); margin-bottom: 12px; }
        .price-amount { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 4rem; font-weight: 800; line-height: 1; margin-bottom: 6px; }
        .price-amount sup { font-size: 1.5rem; vertical-align: super; font-weight: 600; }
        .price-sub { font-size: 13px; color: rgba(255,255,255,0.55); margin-bottom: 28px; }
        .price-features { list-style: none; padding: 0; margin: 0 0 32px; display: flex; flex-direction: column; gap: 11px; }
        .price-features li { display: flex; align-items: center; gap: 10px; font-size: 14px; color: rgba(255,255,255,0.85); }
        .price-check { color: #9FE1CB; font-size: 16px; }

        /* ── CTA ── */
        .cta-section { padding: 80px 0 96px; background: var(--blue-50); }
        .cta-box {
          background: var(--blue-600); border-radius: 24px;
          padding: 64px 48px; text-align: center; color: #fff;
          position: relative; overflow: hidden;
        }
        .cta-box::before {
          content: ''; position: absolute; inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px);
          background-size: 48px 48px;
        }
        .cta-title { font-family: 'Plus Jakarta Sans', sans-serif; font-size: clamp(1.8rem, 4vw, 3rem); font-weight: 800; margin-bottom: 16px; position: relative; }
        .cta-sub { color: rgba(255,255,255,0.65); font-size: 1.05rem; margin-bottom: 36px; position: relative; }
        .cta-actions { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; position: relative; }
        .btn-white {
          display: inline-flex; align-items: center; gap: 8px;
          background: #fff; color: var(--blue-700);
          border: none; border-radius: 12px; padding: 14px 28px;
          font-family: 'DM Sans', sans-serif; font-size: 15px; font-weight: 600;
          cursor: pointer; text-decoration: none; transition: all 0.2s;
        }
        .btn-white:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.15); color: var(--blue-800); text-decoration: none; }
        .btn-white-outline {
          display: inline-flex; align-items: center; gap: 8px;
          background: transparent; color: rgba(255,255,255,0.9);
          border: 1px solid rgba(255,255,255,0.35); border-radius: 12px; padding: 14px 28px;
          font-family: 'DM Sans', sans-serif; font-size: 15px; font-weight: 500;
          cursor: pointer; text-decoration: none; transition: all 0.2s;
        }
        .btn-white-outline:hover { border-color: rgba(255,255,255,0.7); background: rgba(255,255,255,0.08); color: #fff; text-decoration: none; }

        @keyframes twPulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @media (max-width: 768px) {
          .hero-section { padding: 60px 0 48px; min-height: auto; }
          .hero-actions { flex-direction: column; }
          .steps-grid { grid-template-columns: 1fr; }
          .step-card { border-right: none; border-bottom: 1px solid var(--blue-100); }
          .step-card:last-child { border-bottom: none; }
          .stats-strip { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; padding-top: 24px; }
          .stat-item { border-left: none; border-top: 2px solid var(--blue-200); padding: 12px 0 0; }
          .float-chip { display: none; }
          .cta-box { padding: 40px 24px; }
        }
      `}</style>

      <div className="hero-root">

        {/* ── HERO ── */}
        <section className="hero-section">
          <div className="hero-grid-bg" />
          <div className="hero-glow" />
          <div className="tw-container" style={{ position: 'relative', width: '100%' }}>
            <div className="row align-items-center g-5">

              {/* Left */}
              <div className="col-lg-6 fade-up">
                <div className="hero-badge">
                  <span className="hero-badge-dot" />
                  Now live in Andhra Pradesh & Telangana
                </div>
                <h1 className="hero-title">
                  Skip the Queue.<br />
                  <span className="accent">Book Your Token</span><br />
                  Online.
                </h1>
                <p className="hero-sub">
                  TokenWalla connects patients with doctors digitally.
                  Book a slot, get a token, walk in right on time —
                  no more waiting rooms for hours.
                </p>
                <div className="hero-actions">
                  <Link to="/alldoctor" className="btn-primary" style={{ padding: '14px 28px', fontSize: 15 }}>
                    Book Appointment →
                  </Link>
                  <Link to="/Hlogin" className="btn-outline" style={{ padding: '14px 28px', fontSize: 15 }}>
                    Hospital Login
                  </Link>
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
                <div style={{ position: 'relative', maxWidth: 420, marginLeft: 'auto' }}>
                  <div className="float-chip float-chip-1">✅ Confirmed · TW-2847</div>
                  <div className="float-chip float-chip-2">⏱ Est. wait: ~12 mins</div>

                  <div className="token-card-visual">
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
                      <div>
                        <div className="token-label">Your Token</div>
                        <div className="token-live-badge">
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3B6D11', animation: 'twPulse 2s infinite', flexShrink: 0 }} />
                          Queue Access Active
                        </div>
                        <div className="token-number">#007</div>
                        <div className="token-doctor-info">Dr. Kana · City Care Hospital</div>
                        <div style={{ fontSize: 13, color: 'var(--gray-400)', marginTop: 2 }}>Today · 10:30 AM slot</div>
                      </div>
                      <div style={{
                        width: 60, height: 60, borderRadius: 16,
                        background: 'var(--blue-50)', border: '1px solid var(--blue-200)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, flexShrink: 0
                      }}>🏥</div>
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
                            {p.status}
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
              <div className="tw-section-label">Process</div>
              <h2 style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>How TokenWalla Works</h2>
              <p style={{ color: 'var(--gray-500)', fontSize: '1.05rem', lineHeight: 1.7 }}>
                From browsing doctors to walking in on time — the entire process takes under 2 minutes.
              </p>
            </div>
            <div className="steps-grid">
              {STEPS.map((s, i) => (
                <div className="step-card" key={i}>
                  <div className="step-num">0{i + 1}</div>
                  <div className="step-icon-wrap">{s.icon}</div>
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
                  <div className="tw-section-label">Doctors</div>
                  <h2 style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', margin: 0 }}>Available Near You</h2>
                </div>
                <Link to="/alldoctor" className="btn-outline" style={{ padding: '10px 20px', fontSize: 14 }}>
                  View All →
                </Link>
              </div>
              <div className="doctors-scroll">
                {doctors.map(doc => (
                  <Link to={`/doctor/${doc.id}`} className="doc-card" key={doc.id}>
                    {doc.image && !doc.image.includes('placehold')
                      ? <img src={doc.image} alt={doc.name} className="doc-img" />
                      : <div className="doc-img-placeholder">🩺</div>
                    }
                    <div className="doc-info">
                      <div className="doc-spec">{doc.specialization}</div>
                      <div className="doc-name">Dr. {doc.name}</div>
                      <div className="doc-meta">
                        <span>📍 {doc.city}</span>
                        <span>{doc.experience}y exp</span>
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
              <div className="tw-section-label">Why TokenWalla</div>
              <h2 style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Built for Modern Healthcare</h2>
              <p style={{ color: 'var(--gray-500)', fontSize: '1.05rem', lineHeight: 1.7 }}>
                We handle the technology so hospitals can focus on what matters — patient care.
              </p>
            </div>
            <div className="features-grid">
              {FEATURES.map((f, i) => (
                <div className="feature-card" key={i}>
                  <div className="feature-icon">{f.icon}</div>
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
              <div className="tw-section-label">Pricing</div>
              <h2 style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Simple, Transparent Pricing</h2>
              <p style={{ color: 'var(--gray-500)' }}>No hidden fees. Pay only for what you need.</p>
            </div>
            <div className="price-card">
              <div className="price-badge">Best Value</div>
              <div className="price-name">Queue View</div>
              <div className="price-amount"><sup>₹</sup>15</div>
              <div className="price-sub">Per appointment · No hidden fees</div>
              <ul className="price-features">
                {['Confirmed token number', 'Appointment details', 'Doctor & hospital info', 'Live queue position', 'Instant confirmation'].map(f => (
                  <li key={f}><span className="price-check">✓</span> {f}</li>
                ))}
              </ul>
              <Link to="/alldoctor" className="btn-white-outline" style={{ width: '100%', justifyContent: 'center' }}>
                Book Appointment →
              </Link>
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="cta-section">
          <div className="tw-container">
            <div className="cta-box">
              <h2 className="cta-title">Ready to Skip the Queue?</h2>
              <p className="cta-sub">Join thousands of patients who book smarter with TokenWalla.</p>
              <div className="cta-actions">
                <Link to="/alldoctor" className="btn-white-outline">Book Appointment Now →</Link>
                <Link to="/Husercreate" className="btn-white-outline">Register Your Hospital</Link>
              </div>
            </div>
          </div>
        </section>

      </div>
    </>
  );
}