/* eslint-disable */
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import API from '../services/api';

/* ─── Inline styles & keyframes injected once ─── */
const css = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:ital,wght@0,300;0,400;0,500;1,300&display=swap');

  :root {
    --tw-blue:   #0057FF;
    --tw-navy:   #00133A;
    --tw-cyan:   #00D4FF;
    --tw-mint:   #00F5C4;
    --tw-light:  #F0F6FF;
    --tw-white:  #FFFFFF;
    --tw-gray:   #6B7A99;
    --tw-card:   rgba(255,255,255,0.07);
    --tw-border: rgba(255,255,255,0.12);
  }

  .tw-home * { box-sizing: border-box; }

  .tw-home {
    font-family: 'DM Sans', sans-serif;
    background: var(--tw-navy);
    color: var(--tw-white);
    overflow-x: hidden;
  }

  /* ── HERO ── */
  .tw-hero {
    min-height: 100vh;
    position: relative;
    display: flex;
    align-items: center;
    padding: 100px 0 60px;
    overflow: hidden;
  }

  .tw-hero-bg {
    position: absolute;
    inset: 0;
    background:
      radial-gradient(ellipse 80% 60% at 60% 30%, rgba(0,87,255,0.25) 0%, transparent 60%),
      radial-gradient(ellipse 50% 40% at 20% 80%, rgba(0,212,255,0.15) 0%, transparent 50%),
      radial-gradient(ellipse 40% 30% at 85% 70%, rgba(0,245,196,0.10) 0%, transparent 50%);
  }

  .tw-grid-lines {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
    background-size: 60px 60px;
  }

  .tw-hero-badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: rgba(0,87,255,0.15);
    border: 1px solid rgba(0,87,255,0.4);
    border-radius: 100px;
    padding: 6px 16px;
    font-size: 13px;
    font-weight: 500;
    color: var(--tw-cyan);
    margin-bottom: 24px;
    animation: fadeSlideUp 0.6s ease both;
  }

  .tw-badge-dot {
    width: 7px; height: 7px;
    background: var(--tw-mint);
    border-radius: 50%;
    animation: pulse 2s infinite;
  }

  .tw-hero-title {
    font-family: 'Syne', sans-serif;
    font-size: clamp(2.8rem, 6vw, 5.2rem);
    font-weight: 800;
    line-height: 1.05;
    margin-bottom: 24px;
    animation: fadeSlideUp 0.6s 0.1s ease both;
  }

  .tw-hero-title .accent {
    background: linear-gradient(135deg, var(--tw-cyan), var(--tw-mint));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .tw-hero-sub {
    font-size: clamp(1rem, 2vw, 1.2rem);
    font-weight: 300;
    color: rgba(255,255,255,0.6);
    line-height: 1.7;
    max-width: 520px;
    margin-bottom: 40px;
    animation: fadeSlideUp 0.6s 0.2s ease both;
  }

  .tw-hero-actions {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
    animation: fadeSlideUp 0.6s 0.3s ease both;
  }

  .tw-btn-primary {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    background: linear-gradient(135deg, var(--tw-blue), #0040CC);
    color: white;
    border: none;
    border-radius: 14px;
    padding: 16px 32px;
    font-family: 'DM Sans', sans-serif;
    font-size: 16px;
    font-weight: 500;
    cursor: pointer;
    text-decoration: none;
    transition: all 0.25s;
    box-shadow: 0 8px 32px rgba(0,87,255,0.35);
  }
  .tw-btn-primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 14px 40px rgba(0,87,255,0.5);
    color: white;
    text-decoration: none;
  }

  .tw-btn-ghost {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    background: transparent;
    color: white;
    border: 1px solid rgba(255,255,255,0.2);
    border-radius: 14px;
    padding: 16px 32px;
    font-family: 'DM Sans', sans-serif;
    font-size: 16px;
    font-weight: 500;
    cursor: pointer;
    text-decoration: none;
    transition: all 0.25s;
  }
  .tw-btn-ghost:hover {
    background: rgba(255,255,255,0.07);
    border-color: rgba(255,255,255,0.4);
    color: white;
    text-decoration: none;
    transform: translateY(-2px);
  }

  /* ── STATS STRIP ── */
  .tw-stats-strip {
    display: flex;
    gap: 0;
    margin-top: 64px;
    animation: fadeSlideUp 0.6s 0.4s ease both;
  }

  .tw-stat-item {
    flex: 1;
    padding: 24px 0;
    border-left: 1px solid rgba(255,255,255,0.08);
  }
  .tw-stat-item:first-child { border-left: none; }

  .tw-stat-num {
    font-family: 'Syne', sans-serif;
    font-size: 2rem;
    font-weight: 700;
    color: var(--tw-white);
  }
  .tw-stat-label {
    font-size: 13px;
    color: rgba(255,255,255,0.45);
    margin-top: 4px;
  }

  /* ── HERO VISUAL ── */
  .tw-hero-visual {
    position: relative;
    animation: fadeSlideUp 0.8s 0.3s ease both;
  }

  .tw-token-card {
    background: rgba(255,255,255,0.06);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 24px;
    padding: 32px;
    position: relative;
    overflow: hidden;
  }

  .tw-token-card::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 2px;
    background: linear-gradient(90deg, var(--tw-blue), var(--tw-cyan), var(--tw-mint));
  }

  .tw-token-number {
    font-family: 'Syne', sans-serif;
    font-size: 4rem;
    font-weight: 800;
    background: linear-gradient(135deg, var(--tw-cyan), var(--tw-mint));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    line-height: 1;
    margin: 16px 0;
  }

  .tw-queue-badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: rgba(0,245,196,0.1);
    border: 1px solid rgba(0,245,196,0.3);
    border-radius: 100px;
    padding: 6px 14px;
    font-size: 13px;
    color: var(--tw-mint);
    margin-bottom: 8px;
  }

  .tw-mini-queue {
    margin-top: 24px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .tw-queue-row {
    display: flex;
    align-items: center;
    gap: 12px;
    background: rgba(255,255,255,0.04);
    border-radius: 12px;
    padding: 12px 16px;
    border: 1px solid rgba(255,255,255,0.06);
    transition: all 0.3s;
  }

  .tw-queue-row.active {
    background: rgba(0,87,255,0.15);
    border-color: rgba(0,87,255,0.3);
  }

  .tw-queue-avatar {
    width: 36px; height: 36px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 14px;
    flex-shrink: 0;
  }

  .tw-float-card {
    position: absolute;
    background: rgba(255,255,255,0.08);
    backdrop-filter: blur(16px);
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 16px;
    padding: 14px 18px;
    font-size: 13px;
    white-space: nowrap;
    animation: floatY 4s ease-in-out infinite;
  }

  .tw-float-card-1 {
    top: -20px; right: -10px;
    animation-delay: 0s;
  }

  .tw-float-card-2 {
    bottom: 20px; left: -30px;
    animation-delay: 2s;
  }

  /* ── HOW IT WORKS ── */
  .tw-section {
    padding: 100px 0;
  }

  .tw-section-label {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 3px;
    text-transform: uppercase;
    color: var(--tw-cyan);
    margin-bottom: 16px;
  }

  .tw-section-title {
    font-family: 'Syne', sans-serif;
    font-size: clamp(2rem, 4vw, 3rem);
    font-weight: 700;
    line-height: 1.15;
    margin-bottom: 16px;
  }

  .tw-section-sub {
    color: rgba(255,255,255,0.5);
    font-size: 1.05rem;
    line-height: 1.7;
    max-width: 500px;
  }

  .tw-steps {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 2px;
    margin-top: 60px;
    background: rgba(255,255,255,0.05);
    border-radius: 24px;
    overflow: hidden;
    border: 1px solid rgba(255,255,255,0.08);
  }

  .tw-step {
    background: var(--tw-navy);
    padding: 40px 32px;
    position: relative;
    transition: background 0.3s;
  }

  .tw-step:hover {
    background: rgba(0,87,255,0.08);
  }

  .tw-step-num {
    font-family: 'Syne', sans-serif;
    font-size: 3.5rem;
    font-weight: 800;
    color: rgba(255,255,255,0.06);
    line-height: 1;
    margin-bottom: 20px;
  }

  .tw-step-icon {
    width: 48px; height: 48px;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
    margin-bottom: 20px;
  }

  .tw-step-title {
    font-family: 'Syne', sans-serif;
    font-size: 1.15rem;
    font-weight: 700;
    margin-bottom: 10px;
  }

  .tw-step-desc {
    font-size: 14px;
    color: rgba(255,255,255,0.5);
    line-height: 1.65;
  }

  /* ── FEATURES ── */
  .tw-features {
    background: rgba(255,255,255,0.02);
    border-top: 1px solid rgba(255,255,255,0.06);
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }

  .tw-feature-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 24px;
    margin-top: 60px;
  }

  .tw-feature-card {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 20px;
    padding: 32px;
    transition: all 0.3s;
    position: relative;
    overflow: hidden;
  }

  .tw-feature-card::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, rgba(0,87,255,0.05), transparent);
    opacity: 0;
    transition: opacity 0.3s;
  }

  .tw-feature-card:hover {
    border-color: rgba(0,87,255,0.3);
    transform: translateY(-4px);
    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
  }

  .tw-feature-card:hover::after { opacity: 1; }

  .tw-feature-icon {
    width: 52px; height: 52px;
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    margin-bottom: 20px;
  }

  .tw-feature-title {
    font-family: 'Syne', sans-serif;
    font-size: 1.1rem;
    font-weight: 700;
    margin-bottom: 10px;
  }

  .tw-feature-desc {
    font-size: 14px;
    color: rgba(255,255,255,0.5);
    line-height: 1.65;
  }

  /* ── DOCTORS PREVIEW ── */
  .tw-doctors-scroll {
    display: flex;
    gap: 20px;
    overflow-x: auto;
    padding-bottom: 16px;
    margin-top: 48px;
    scrollbar-width: none;
  }
  .tw-doctors-scroll::-webkit-scrollbar { display: none; }

  .tw-doctor-card {
    flex-shrink: 0;
    width: 220px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 20px;
    overflow: hidden;
    transition: all 0.3s;
    cursor: pointer;
    text-decoration: none;
    color: inherit;
  }

  .tw-doctor-card:hover {
    transform: translateY(-4px);
    border-color: rgba(0,87,255,0.3);
    box-shadow: 0 16px 40px rgba(0,0,0,0.3);
    color: inherit;
    text-decoration: none;
  }

  .tw-doctor-img {
    width: 100%;
    height: 160px;
    object-fit: cover;
    background: rgba(0,87,255,0.1);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 3rem;
  }

  .tw-doctor-info { padding: 16px; }

  .tw-doctor-name {
    font-family: 'Syne', sans-serif;
    font-weight: 700;
    font-size: 15px;
    margin-bottom: 4px;
  }

  .tw-doctor-spec {
    font-size: 12px;
    color: var(--tw-cyan);
    margin-bottom: 8px;
  }

  .tw-doctor-meta {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: rgba(255,255,255,0.4);
  }

  /* ── PRICING ── */
  .tw-pricing-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 24px;
    margin-top: 60px;
    max-width: 700px;
    margin-left: auto;
    margin-right: auto;
  }

  .tw-price-card {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 24px;
    padding: 36px 32px;
    position: relative;
    transition: all 0.3s;
  }

  .tw-price-card.featured {
    background: rgba(0,87,255,0.12);
    border-color: rgba(0,87,255,0.4);
    transform: scale(1.02);
  }

  .tw-price-card:hover { transform: translateY(-4px); }
  .tw-price-card.featured:hover { transform: scale(1.02) translateY(-4px); }

  .tw-price-badge {
    position: absolute;
    top: -12px; left: 50%;
    transform: translateX(-50%);
    background: linear-gradient(135deg, var(--tw-blue), var(--tw-cyan));
    color: white;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 1px;
    text-transform: uppercase;
    padding: 5px 16px;
    border-radius: 100px;
  }

  .tw-price-name {
    font-family: 'Syne', sans-serif;
    font-size: 1rem;
    font-weight: 700;
    color: rgba(255,255,255,0.6);
    margin-bottom: 16px;
  }

  .tw-price-amount {
    font-family: 'Syne', sans-serif;
    font-size: 3.5rem;
    font-weight: 800;
    line-height: 1;
    margin-bottom: 4px;
  }

  .tw-price-amount sup {
    font-size: 1.5rem;
    vertical-align: super;
    font-weight: 600;
  }

  .tw-price-desc {
    font-size: 13px;
    color: rgba(255,255,255,0.4);
    margin-bottom: 28px;
  }

  .tw-price-features {
    list-style: none;
    padding: 0; margin: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-bottom: 32px;
  }

  .tw-price-features li {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 14px;
    color: rgba(255,255,255,0.7);
  }

  .tw-price-features li .check {
    color: var(--tw-mint);
    font-size: 16px;
  }

  /* ── CTA ── */
  .tw-cta {
    padding: 100px 0;
    text-align: center;
    position: relative;
    overflow: hidden;
  }

  .tw-cta-bg {
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse 60% 80% at 50% 50%, rgba(0,87,255,0.2) 0%, transparent 70%);
  }

  .tw-cta-title {
    font-family: 'Syne', sans-serif;
    font-size: clamp(2.2rem, 5vw, 4rem);
    font-weight: 800;
    line-height: 1.1;
    margin-bottom: 20px;
    position: relative;
  }

  .tw-cta-sub {
    color: rgba(255,255,255,0.5);
    font-size: 1.1rem;
    margin-bottom: 40px;
    position: relative;
  }

  /* ── FOOTER ── */
  .tw-footer {
    border-top: 1px solid rgba(255,255,255,0.07);
    padding: 60px 0 32px;
  }

  .tw-footer-brand {
    font-family: 'Syne', sans-serif;
    font-size: 1.4rem;
    font-weight: 800;
    margin-bottom: 12px;
  }

  .tw-footer-desc {
    font-size: 14px;
    color: rgba(255,255,255,0.4);
    line-height: 1.65;
    max-width: 280px;
    margin-bottom: 24px;
  }

  .tw-footer-links h6 {
    font-family: 'Syne', sans-serif;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: rgba(255,255,255,0.3);
    margin-bottom: 16px;
  }

  .tw-footer-links a {
    display: block;
    font-size: 14px;
    color: rgba(255,255,255,0.55);
    text-decoration: none;
    margin-bottom: 10px;
    transition: color 0.2s;
  }

  .tw-footer-links a:hover { color: white; }

  .tw-footer-bottom {
    border-top: 1px solid rgba(255,255,255,0.06);
    padding-top: 28px;
    margin-top: 48px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 13px;
    color: rgba(255,255,255,0.3);
    flex-wrap: wrap;
    gap: 12px;
  }

  /* ── ANIMATIONS ── */
  @keyframes fadeSlideUp {
    from { opacity: 0; transform: translateY(24px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%       { opacity: 0.5; transform: scale(0.85); }
  }

  @keyframes floatY {
    0%, 100% { transform: translateY(0px); }
    50%       { transform: translateY(-12px); }
  }

  @keyframes tokenPop {
    0%   { transform: scale(0.8); opacity: 0; }
    60%  { transform: scale(1.05); }
    100% { transform: scale(1); opacity: 1; }
  }

  .tw-token-anim {
    animation: tokenPop 0.8s 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }

  /* ── RESPONSIVE ── */
  @media (max-width: 768px) {
    .tw-stats-strip { gap: 0; }
    .tw-stat-item { padding: 16px 0; }
    .tw-stat-num { font-size: 1.5rem; }
    .tw-float-card { display: none; }
    .tw-hero { padding: 80px 0 40px; }
    .tw-section { padding: 60px 0; }
    .tw-steps { grid-template-columns: 1fr; gap: 2px; }
    .tw-pricing-grid { grid-template-columns: 1fr; }
    .tw-price-card.featured { transform: scale(1); }
  }
`;

const STEPS = [
  { icon: '🔍', bg: 'rgba(0,87,255,0.15)',  title: 'Find a Doctor',      desc: 'Browse doctors by specialization or city. See live availability and slots.' },
  { icon: '📅', bg: 'rgba(0,212,255,0.15)', title: 'Book a Slot',        desc: 'Pick your preferred time slot and confirm your appointment online.' },
  { icon: '💳', bg: 'rgba(0,245,196,0.15)', title: 'Pay Securely',       desc: 'Pay ₹15 to book your token and track your live queue position.' },
  { icon: '🏥', bg: 'rgba(255,180,0,0.15)', title: 'Walk In on Time',    desc: 'Arrive when your token is called. No waiting in queues anymore.' },
];

const FEATURES = [
  { icon: '⚡', bg: 'rgba(0,87,255,0.15)',   title: 'Real-time Queue',        desc: 'Track your position in the queue live — know exactly when to arrive.' },
  { icon: '🔐', bg: 'rgba(0,212,255,0.15)',  title: 'Secure Payments',        desc: 'Razorpay-powered payments with UPI, cards, and wallets. Fully encrypted.' },
  { icon: '🏥', bg: 'rgba(0,245,196,0.15)',  title: 'Multi-Hospital',         desc: 'Works across hospitals in your city. One platform, all doctors.' },
  { icon: '📱', bg: 'rgba(255,120,50,0.15)', title: 'Mobile First',           desc: 'Designed for mobile — book appointments in under 60 seconds.' },
  { icon: '🩺', bg: 'rgba(180,0,255,0.1)',   title: 'Verified Doctors',       desc: 'All doctors are verified and managed directly by their hospitals.' },
  { icon: '♻️', bg: 'rgba(0,200,80,0.12)',   title: 'Instant Refunds',        desc: 'Cancel 2 hours before your appointment for a full hassle-free refund.' },
];

const QUEUE_DEMO = [
  { name: 'Ravi K.',   token: 'TW-001', color: 'rgba(0,87,255,0.3)',   avatar: '#0057FF', letter: 'R', status: 'In Consultation' },
  { name: 'Priya S.',  token: 'TW-002', color: 'rgba(0,212,255,0.15)', avatar: '#00D4FF', letter: 'P', status: 'Waiting' },
  { name: 'Arjun M.',  token: 'TW-003', color: 'rgba(255,255,255,0.04)', avatar: '#6B7A99', letter: 'A', status: 'Waiting' },
];

export default function Hero() {
  const navigate = useNavigate();
  const [doctors, setDoctors] = useState([]);
  const [activeQ, setActiveQ] = useState(0);

  useEffect(() => {
    API.get('/doctors/')
      .then(({ data }) => setDoctors(data.slice(0, 6)))
      .catch(() => {});
  }, []);

  // Animate queue demo
  useEffect(() => {
    const t = setInterval(() => setActiveQ(p => (p + 1) % 3), 2500);
    return () => clearInterval(t);
  }, []);

  return (
    <>
      <style>{css}</style>
      <div className="tw-home">

        {/* ── HERO ── */}
        <section className="tw-hero">
          <div className="tw-hero-bg" />
          <div className="tw-grid-lines" />

          <div className="container position-relative">
            <div className="row align-items-center g-5">

              {/* Left */}
              <div className="col-lg-6">
                <div className="tw-hero-badge">
                  <span className="tw-badge-dot" />
                  Now live in Andhra Pradesh & Telangana
                </div>

                <h1 className="tw-hero-title">
                  Skip the Queue.<br />
                  <span className="accent">Book Your Token</span><br />
                  Online.
                </h1>

                <p className="tw-hero-sub">
                  TokenWalla connects patients with doctors digitally.
                  Book a slot, get a token, walk in right on time —
                  no more waiting rooms for hours.
                </p>

                <div className="tw-hero-actions">
                  <Link to="/alldoctor" className="tw-btn-primary">
                    Book Appointment
                    <span>→</span>
                  </Link>
                  <Link to="/Hlogin" className="tw-btn-ghost">
                    Hospital Login
                  </Link>
                </div>

                <div className="tw-stats-strip">
                  {[
                    { num: '2,400+', label: 'Tokens Issued' },
                    { num: '18',     label: 'Hospitals' },
                    { num: '94%',    label: 'On-time Rate' },
                    { num: '4.8★',   label: 'Patient Rating' },
                  ].map((s, i) => (
                    <div className="tw-stat-item ps-3" key={i}>
                      <div className="tw-stat-num">{s.num}</div>
                      <div className="tw-stat-label">{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right — Token Card Visual */}
              <div className="col-lg-6">
                <div className="tw-hero-visual">

                  {/* Floating badges */}
                  <div className="tw-float-card tw-float-card-1">
                    ✅ Token confirmed · TW-2847
                  </div>
                  <div className="tw-float-card tw-float-card-2">
                    ⏱ Est. wait: ~12 mins
                  </div>

                  <div className="tw-token-card tw-token-anim">
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                      <div>
                        <div style={{ fontSize:12, color:'rgba(255,255,255,0.4)', marginBottom:4 }}>YOUR TOKEN</div>
                        <div className="tw-queue-badge">
                          <span className="tw-badge-dot" />
                          Queue Access Active
                        </div>
                        <div className="tw-token-number">#007</div>
                        <div style={{ fontSize:14, color:'rgba(255,255,255,0.5)' }}>
                          Dr. Kana · City Care Hospital
                        </div>
                        <div style={{ fontSize:13, color:'rgba(255,255,255,0.35)', marginTop:4 }}>
                          Today · 10:30 AM slot
                        </div>
                      </div>
                      <div style={{
                        width:72, height:72,
                        borderRadius:'50%',
                        background: 'linear-gradient(135deg, rgba(0,87,255,0.3), rgba(0,212,255,0.3))',
                        border: '2px solid rgba(0,212,255,0.3)',
                        display:'flex', alignItems:'center', justifyContent:'center',
                        fontSize: 28
                      }}>🏥</div>
                    </div>

                    <div className="tw-mini-queue">
                      {QUEUE_DEMO.map((p, i) => (
                        <div
                          key={i}
                          className={`tw-queue-row ${i === activeQ ? 'active' : ''}`}
                        >
                          <div
                            className="tw-queue-avatar"
                            style={{ background: p.avatar + '33', color: p.avatar }}
                          >
                            {p.letter}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize:13, fontWeight:500 }}>{p.name}</div>
                            <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)' }}>{p.token}</div>
                          </div>
                          <div style={{
                            fontSize: 11,
                            color: i === 0 ? 'var(--tw-mint)' : 'rgba(255,255,255,0.35)',
                            fontWeight: i === 0 ? 600 : 400,
                          }}>
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
        <section className="tw-section">
          <div className="container">
            <div className="row justify-content-center text-center mb-2">
              <div className="col-lg-6">
                <div className="tw-section-label">Process</div>
                <h2 className="tw-section-title">How TokenWalla Works</h2>
                <p className="tw-section-sub mx-auto">
                  From browsing doctors to walking in on time —
                  the entire process takes under 2 minutes.
                </p>
              </div>
            </div>

            <div className="tw-steps">
              {STEPS.map((s, i) => (
                <div className="tw-step" key={i}>
                  <div className="tw-step-num">0{i + 1}</div>
                  <div className="tw-step-icon" style={{ background: s.bg }}>
                    {s.icon}
                  </div>
                  <div className="tw-step-title">{s.title}</div>
                  <div className="tw-step-desc">{s.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── DOCTORS PREVIEW ── */}
        {doctors.length > 0 && (
          <section className="tw-section" style={{ paddingTop: 0 }}>
            <div className="container">
              <div className="d-flex align-items-end justify-content-between mb-2 flex-wrap gap-3">
                <div>
                  <div className="tw-section-label">Doctors</div>
                  <h2 className="tw-section-title mb-0">Available Near You</h2>
                </div>
                <Link to="/alldoctor" className="tw-btn-ghost" style={{ padding:'12px 24px', fontSize:14 }}>
                  View All →
                </Link>
              </div>

              <div className="tw-doctors-scroll">
                {doctors.map(doc => (
                  <Link
                    to={`/doctor/${doc.id}`}
                    className="tw-doctor-card"
                    key={doc.id}
                  >
                    {doc.image && !doc.image.includes('placehold') ? (
                      <img
                        src={doc.image}
                        alt={doc.name}
                        className="tw-doctor-img"
                        style={{ display:'block' }}
                      />
                    ) : (
                      <div className="tw-doctor-img">🩺</div>
                    )}
                    <div className="tw-doctor-info">
                      <div className="tw-doctor-name">Dr. {doc.name}</div>
                      <div className="tw-doctor-spec">{doc.specialization}</div>
                      <div className="tw-doctor-meta">
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
        <section className="tw-section tw-features">
          <div className="container">
            <div className="row justify-content-center text-center mb-2">
              <div className="col-lg-6">
                <div className="tw-section-label">Why TokenWalla</div>
                <h2 className="tw-section-title">Built for Modern Healthcare</h2>
                <p className="tw-section-sub mx-auto">
                  We handle the technology so hospitals can focus
                  on what matters — patient care.
                </p>
              </div>
            </div>

            <div className="tw-feature-grid">
              {FEATURES.map((f, i) => (
                <div className="tw-feature-card" key={i}>
                  <div className="tw-feature-icon" style={{ background: f.bg }}>
                    {f.icon}
                  </div>
                  <div className="tw-feature-title">{f.title}</div>
                  <div className="tw-feature-desc">{f.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── PRICING ── */}
        <section className="tw-section">
          <div className="container">
            <div className="row justify-content-center text-center mb-2">
              <div className="col-lg-6">
                <div className="tw-section-label">Pricing</div>
                <h2 className="tw-section-title">Simple, Transparent Pricing</h2>
                <p className="tw-section-sub mx-auto">
                  No hidden fees. Pay only for what you need.
                </p>
              </div>
            </div>
           <div className="tw-pricing-grid" style={{ maxWidth: 360, marginLeft: 'auto', marginRight: 'auto' }}>
  <div className="tw-price-card featured">
    <div className="tw-price-badge">BEST VALUE</div>
    <div className="tw-price-name">Queue View</div>
    <div className="tw-price-amount">
      <sup>₹</sup>15
    </div>
    <div className="tw-price-desc">Per appointment · No hidden fees</div>
    <ul className="tw-price-features">
      <li><span className="check">✓</span> Confirmed token number</li>
      <li><span className="check">✓</span> Appointment details</li>
      <li><span className="check">✓</span> Doctor &amp; hospital info</li>
      <li><span className="check">✓</span> <strong>Live queue position</strong></li>
      <li><span className="check">✓</span> Instant confirmation</li>
    </ul>
    <Link to="/alldoctor" className="tw-btn-primary" style={{ display:'block', textAlign:'center', justifyContent:'center', padding:'14px' }}>
      Book Appointment →
    </Link>
     </div>
      </div>
            
            <div className="d-flex gap-3 justify-content-center flex-wrap">
              <Link to="/alldoctor" className="tw-btn-primary" style={{ fontSize:18, padding:'18px 40px' }}>
                Book Appointment Now →
              </Link>
              <Link to="/Husercreate" className="tw-btn-ghost" style={{ fontSize:18, padding:'18px 40px' }}>
                Register Your Hospital
              </Link>
            </div>
          </div>
        </section>

        

      </div>
    </>
  );
}