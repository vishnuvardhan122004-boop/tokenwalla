import SEO from './SEO';
const About = () => {
  const stats = [
    { num: '2,400+', label: 'Tokens issued' },
    { num: '18',     label: 'Partner hospitals' },
    { num: '94%',    label: 'On-time rate' },
    { num: '4.8★',   label: 'Patient rating' },
  ];

  const values = [
    { icon: '♻️', title: 'Zero waiting rooms',  desc: 'Patients arrive when their number is close. Hospitals run on schedule.' },
    { icon: '🔐', title: 'Privacy first',       desc: 'Patient data is encrypted and never sold. Period.' },
    { icon: '🌐', title: 'Accessible anywhere', desc: 'Works on any device. No app download required.' },
    { icon: '⚡', title: 'Real-time queue',     desc: 'Live position tracking refreshed every 15 seconds.' },
  ];
 
  return (
    <>
       <SEO
  title="About TokenWalla — Smart Hospital Queue Management"
  description="Learn about TokenWalla — the platform that digitises hospital OPD queues in Andhra Pradesh and Telangana, helping patients skip waiting rooms and hospitals run on schedule."
  url="/about"
      />
      <style>{`
        .ab-root { font-family: 'DM Sans', sans-serif; background: #fff; }

        .ab-hero {
          background: linear-gradient(160deg, #F4F9FF 0%, #EAF3FF 60%, #F8FBFF 100%);
          padding: 88px 0 72px; border-bottom: 1px solid var(--blue-100);
          position: relative; overflow: hidden;
        }
        .ab-hero-grid {
          position: absolute; inset: 0;
          background-image: linear-gradient(var(--blue-100) 1px, transparent 1px),
            linear-gradient(90deg, var(--blue-100) 1px, transparent 1px);
          background-size: 48px 48px; opacity: 0.35;
        }
        .ab-hero-inner { position: relative; max-width: 700px; margin: 0 auto; padding: 0 24px; text-align: center; }
        .ab-label { font-size: 11px; font-weight: 600; letter-spacing: 2.5px; text-transform: uppercase; color: var(--blue-600); margin-bottom: 14px; }
        .ab-title { font-family: 'Plus Jakarta Sans', sans-serif; font-size: clamp(2rem, 4vw, 3rem); font-weight: 800; color: var(--gray-900); margin-bottom: 18px; line-height: 1.1; }
        .ab-title .accent { color: var(--blue-600); }
        .ab-sub { font-size: 1.05rem; color: var(--gray-500); line-height: 1.75; max-width: 560px; margin: 0 auto; }

        .ab-stats {
          display: grid; grid-template-columns: repeat(4, 1fr);
          gap: 0; border-top: 1px solid var(--blue-100); border-bottom: 1px solid var(--blue-100);
          background: #fff;
        }
        .ab-stat {
          padding: 36px 24px; text-align: center;
          border-right: 1px solid var(--blue-100);
        }
        .ab-stat:last-child { border-right: none; }
        .ab-stat-num { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 2rem; font-weight: 800; color: var(--blue-600); margin-bottom: 4px; }
        .ab-stat-label { font-size: 14px; color: var(--gray-500); }

        .ab-section { max-width: 900px; margin: 0 auto; padding: 80px 24px; }
        .ab-section-label { font-size: 11px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; color: var(--blue-600); margin-bottom: 12px; }
        .ab-section-title { font-family: 'Plus Jakarta Sans', sans-serif; font-size: clamp(1.5rem, 3vw, 2rem); font-weight: 800; color: var(--gray-900); margin-bottom: 18px; }
        .ab-section-body { font-size: 15px; color: var(--gray-600); line-height: 1.8; }
        .ab-section-body p { margin-bottom: 16px; }
        .ab-section-body p:last-child { margin-bottom: 0; }

        .ab-values-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; margin-top: 40px; }
        .ab-value-card { background: #fff; border: 1px solid var(--blue-100); border-radius: 18px; padding: 28px; transition: all 0.2s; }
        .ab-value-card:hover { border-color: var(--blue-300); box-shadow: var(--shadow-md); transform: translateY(-3px); }
        .ab-value-icon { width: 48px; height: 48px; border-radius: 13px; background: var(--blue-50); border: 1px solid var(--blue-200); display: flex; align-items: center; justify-content: center; font-size: 22px; margin-bottom: 16px; }
        .ab-value-title { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1rem; font-weight: 700; color: var(--gray-900); margin-bottom: 8px; }
        .ab-value-desc { font-size: 14px; color: var(--gray-500); line-height: 1.65; }

        .ab-divider { height: 1px; background: var(--blue-100); margin: 0 24px; }

        .ab-cta {
          background: var(--blue-600); margin: 0 24px 80px;
          border-radius: 22px; padding: 56px 48px; text-align: center;
          color: #fff; position: relative; overflow: hidden;
        }
        .ab-cta::before {
          content: ''; position: absolute; inset: 0;
          background-image: linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px);
          background-size: 48px 48px;
        }
        .ab-cta-title { font-family: 'Plus Jakarta Sans', sans-serif; font-size: clamp(1.5rem, 3vw, 2rem); font-weight: 800; margin-bottom: 12px; position: relative; }
        .ab-cta-sub { font-size: 15px; color: rgba(255,255,255,0.7); margin-bottom: 28px; position: relative; }
        .ab-cta-btn {
          display: inline-flex; align-items: center; gap: 8px;
          background: #fff; color: var(--blue-700); border: none;
          border-radius: 12px; padding: 13px 28px;
          font-family: 'DM Sans', sans-serif; font-size: 15px; font-weight: 600;
          cursor: pointer; text-decoration: none; transition: all 0.2s; position: relative;
        }
        .ab-cta-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.15); color: var(--blue-800); text-decoration: none; }

        @media (max-width: 640px) {
          .ab-stats { grid-template-columns: 1fr 1fr; }
          .ab-stat { border-bottom: 1px solid var(--blue-100); }
          .ab-cta { padding: 36px 24px; margin: 0 0 60px; border-radius: 0; }
        }
      `}</style>

      <div className="ab-root">
        {/* Hero */}
        <div className="ab-hero">
          <div className="ab-hero-grid" />
          <div className="ab-hero-inner">
            <div className="ab-label">About TokenWalla</div>
            <h1 className="ab-title">
              We built a smarter way<br />to see a <span className="accent">doctor</span>
            </h1>
            <p className="ab-sub">
              TokenWalla replaces chaotic hospital waiting rooms with digital
              tokens and live queue tracking — so patients arrive on time
              and hospitals run smoothly.
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="ab-stats">
          {stats.map((s) => (
            <div className="ab-stat" key={s.label}>
              <div className="ab-stat-num">{s.num}</div>
              <div className="ab-stat-label">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Mission */}
        <div className="ab-section">
          <div className="ab-section-label">Our mission</div>
          <h2 className="ab-section-title">Healthcare that respects your time</h2>
          <div className="ab-section-body">
            <p>
              TokenWalla is a smart hospital token and queue management platform
              designed to close the gap between patients and doctors. We believe
              nobody should spend hours sitting in a waiting room when a mobile
              notification can tell you exactly when to arrive.
            </p>
            <p>
              We help hospitals move away from manual queues and enable patients
              to book appointments from anywhere — with a token issued instantly
              on payment and a live queue position refreshed every 15 seconds.
            </p>
            <p>
              Currently live in Andhra Pradesh and Telangana, we're expanding
              hospital by hospital, city by city, focused on making every visit
              predictable, fair, and stress-free.
            </p>
          </div>
        </div>

        <div className="ab-divider" />

        {/* Values */}
        <div className="ab-section">
          <div className="ab-section-label">Why TokenWalla</div>
          <h2 className="ab-section-title">Built for real healthcare environments</h2>
          <div className="ab-values-grid">
            {values.map((v) => (
              <div className="ab-value-card" key={v.title}>
                <div className="ab-value-icon">{v.icon}</div>
                <div className="ab-value-title">{v.title}</div>
                <p className="ab-value-desc">{v.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="ab-cta">
          <div className="ab-cta-title">Ready to try TokenWalla?</div>
          <p className="ab-cta-sub">Book your first appointment in under 2 minutes.</p>
          <a href="/alldoctor" className="ab-cta-btn">Find a Doctor →</a>
        </div>
      </div>
    </>
  );
};

export default About;