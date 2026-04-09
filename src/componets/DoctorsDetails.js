import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import API from '../services/api';

function getNext7Days() {
  const days   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return {
      label: i === 0 ? 'Today' : days[d.getDay()],
      num:   d.getDate(),
      month: months[d.getMonth()],
      full:  d.toISOString().split('T')[0],
    };
  });
}

const DAYS = getNext7Days();

const PLANS = [
  { key: 'queue', name: 'Queue View', desc: 'Token + live queue position tracking', price: 15, fee: 1500, popular: true },
];

export default function DoctorDetails() {
  const { id }   = useParams();
  const navigate = useNavigate();

  const [doctor,  setDoctor]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [user,    setUser]    = useState(null);

  const [selectedDate, setSelectedDate] = useState(DAYS[0].full);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [selectedPlan, setSelectedPlan] = useState('queue');

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (stored) { try { setUser(JSON.parse(stored)); } catch {} }
  }, []);

  useEffect(() => {
    setLoading(true);
    API.get(`/doctors/${id}/`)
      .then(({ data }) => setDoctor(data))
      .catch(() => navigate('/alldoctor'))
      .finally(() => setLoading(false));
  }, [id, navigate]);

  const handleBook = () => {
    if (!user) { navigate('/login'); return; }
    if (!selectedSlot) { alert('Please select a time slot'); return; }
    const plan = PLANS.find(p => p.key === selectedPlan);
    navigate('/payment', {
      state: {
        doctorId:     doctor.id,
        doctorName:   doctor.name,
        doctorMobile: doctor.mobile,
        hospital:     doctor.hospital_name,
        date:         selectedDate,
        slot:         selectedSlot,
        fee:          plan.price,
        amount:       plan.fee,
        queue_access: selectedPlan === 'queue',
      }
    });
  };

  const slots    = doctor?.slots || [];
  const am       = slots.filter(s => s.includes('AM'));
  const pm       = slots.filter(s => s.includes('PM'));
  const plan     = PLANS.find(p => p.key === selectedPlan);
  const dateLabel = DAYS.find(d => d.full === selectedDate);

  /* ── Loading skeleton ── */
  if (loading) return (
    <>
      <style>{`
        .dd-skel-root { background: #F4F9FF; min-height: 100vh; }
        .dd-skel-banner { height: 280px; background: linear-gradient(90deg,#E6F1FB 25%,#B5D4F4 50%,#E6F1FB 75%); background-size:200% 100%; animation:ddShimmer 1.4s infinite; }
        .dd-skel-body { max-width:1100px; margin:0 auto; padding:24px 20px; display:grid; grid-template-columns:1fr 340px; gap:24px; }
        .dd-skel-line { border-radius:10px; background:linear-gradient(90deg,#E6F1FB 25%,#B5D4F4 50%,#E6F1FB 75%); background-size:200% 100%; animation:ddShimmer 1.4s infinite; margin-bottom:14px; }
        @keyframes ddShimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
        @media(max-width:860px){.dd-skel-body{grid-template-columns:1fr;}}
      `}</style>
      <div className="dd-skel-root">
        <div className="dd-skel-banner" />
        <div className="dd-skel-body">
          <div>
            <div className="dd-skel-line" style={{height:18,width:'40%'}} />
            <div className="dd-skel-line" style={{height:28,width:'65%'}} />
            <div className="dd-skel-line" style={{height:14,width:'55%'}} />
            <div className="dd-skel-line" style={{height:14,width:'80%'}} />
          </div>
          <div className="dd-skel-line" style={{height:400,borderRadius:18}} />
        </div>
      </div>
    </>
  );

  if (!doctor) return null;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap');

        *, *::before, *::after { box-sizing: border-box; }

        .dd-root {
          font-family: 'DM Sans', sans-serif;
          background: #F4F9FF;
          min-height: 100vh;
          padding-bottom: 80px;
        }

        /* ── BANNER ── */
        .dd-banner {
          position: relative; height: 280px; overflow: hidden;
          background: linear-gradient(160deg, #E6F1FB 0%, #B5D4F4 100%);
        }
        .dd-banner-img {
          width: 100%; height: 100%; object-fit: cover;
          filter: brightness(0.6);
          transition: transform 8s ease;
        }
        .dd-banner:hover .dd-banner-img { transform: scale(1.04); }
        .dd-banner-placeholder {
          width: 100%; height: 100%;
          display: flex; align-items: center; justify-content: center;
          font-size: 5rem; opacity: 0.25;
          background: linear-gradient(160deg, #E6F1FB 0%, #B5D4F4 100%);
        }
        .dd-banner-overlay {
          position: absolute; inset: 0;
          background: linear-gradient(to bottom, transparent 30%, rgba(244,249,255,0.95) 100%);
        }
        .dd-banner-grid {
          position: absolute; inset: 0;
          background-image:
            linear-gradient(rgba(24,95,165,0.08) 1px, transparent 1px),
            linear-gradient(90deg, rgba(24,95,165,0.08) 1px, transparent 1px);
          background-size: 48px 48px;
        }
        .dd-back {
          position: absolute; top: 16px; left: 16px; z-index: 10;
          display: flex; align-items: center; gap: 8px;
          background: rgba(255,255,255,0.9); backdrop-filter: blur(12px);
          border: 1px solid #B5D4F4; border-radius: 10px;
          padding: 8px 16px; font-size: 13px; color: #185FA5;
          cursor: pointer; transition: all 0.2s;
          font-family: 'DM Sans', sans-serif;
        }
        .dd-back:hover { background: #fff; border-color: #378ADD; }

        /* ── PROFILE CARD ── */
        .dd-profile-wrap {
          max-width: 1100px; margin: -60px auto 0;
          padding: 0 20px; position: relative; z-index: 10;
        }
        .dd-profile-card {
          background: #fff; border: 1px solid #B5D4F4;
          border-radius: 20px; padding: 22px 26px;
          display: flex; align-items: flex-start; gap: 18px;
          box-shadow: 0 8px 32px rgba(24,95,165,0.1);
          animation: ddFadeUp 0.5s ease both;
          position: relative; overflow: hidden;
        }
        .dd-profile-card::before {
          content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
          background: linear-gradient(90deg, #185FA5, #378ADD, #85B7EB);
        }
        .dd-doctor-avatar {
          width: 84px; height: 84px; border-radius: 16px;
          object-fit: cover; border: 2px solid #B5D4F4; flex-shrink: 0;
        }
        .dd-doctor-avatar-placeholder {
          width: 84px; height: 84px; border-radius: 16px;
          background: #E6F1FB; border: 2px solid #B5D4F4;
          display: flex; align-items: center; justify-content: center;
          font-size: 2.2rem; flex-shrink: 0;
        }
        .dd-profile-info { flex: 1; min-width: 0; }
        .dd-spec-badge {
          font-size: 11px; font-weight: 600; letter-spacing: 2px;
          text-transform: uppercase; color: #185FA5; margin-bottom: 5px; display: block;
        }
        .dd-doctor-name {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: clamp(1.2rem, 3vw, 1.7rem);
          font-weight: 800; color: #0F172A; margin-bottom: 10px; line-height: 1.1;
        }
        .dd-profile-pills { display: flex; flex-wrap: wrap; gap: 7px; margin-bottom: 8px; }
        .dd-pill {
          display: flex; align-items: center; gap: 5px;
          background: #E6F1FB; border: 1px solid #B5D4F4;
          border-radius: 100px; padding: 4px 12px;
          font-size: 12px; color: #185FA5; font-weight: 500;
        }
        .dd-avail-pill {
          display: inline-flex; align-items: center; gap: 6px;
          border-radius: 100px; padding: 4px 12px;
          font-size: 12px; font-weight: 600;
        }
        .dd-avail-pill.yes {
          background: #EAF3DE; border: 1px solid #97C459; color: #3B6D11;
        }
        .dd-avail-pill.no {
          background: #FCEBEB; border: 1px solid #F09595; color: #A32D2D;
        }
        .dd-avail-dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; animation: ddPulse 2s infinite; }
        .dd-hospital-name { font-size: 13px; color: #64748B; margin-top: 4px; }

        /* ── STATS ── */
        .dd-stats-row {
          max-width: 1100px; margin: 16px auto 0;
          padding: 0 20px;
          display: grid; grid-template-columns: repeat(3,1fr); gap: 12px;
        }
        .dd-stat-box {
          background: #fff; border: 1px solid #B5D4F4;
          border-radius: 14px; padding: 16px;
          text-align: center;
        }
        .dd-stat-val {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 1.4rem; font-weight: 800; color: #185FA5;
          margin-bottom: 3px;
        }
        .dd-stat-lbl { font-size: 12px; color: #64748B; }

        /* ── MAIN LAYOUT ── */
        .dd-layout {
          max-width: 1100px; margin: 20px auto 0;
          padding: 0 20px;
          display: grid; grid-template-columns: 1fr 340px;
          gap: 24px; align-items: start;
        }

        /* ── BLOCKS ── */
        .dd-block {
          background: #fff; border: 1px solid #B5D4F4;
          border-radius: 18px; padding: 22px;
          margin-bottom: 16px;
          animation: ddFadeUp 0.5s ease both;
        }
        .dd-block-title {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 15px; font-weight: 700; color: #0F172A;
          margin-bottom: 16px;
          display: flex; align-items: center; gap: 9px;
        }
        .dd-block-title-icon {
          width: 30px; height: 30px; border-radius: 8px;
          background: #E6F1FB; display: flex; align-items: center;
          justify-content: center; font-size: 14px; flex-shrink: 0;
        }

        /* ── DATE CHIPS ── */
        .dd-date-row {
          display: flex; gap: 8px; overflow-x: auto;
          padding-bottom: 6px; scrollbar-width: none;
        }
        .dd-date-row::-webkit-scrollbar { display: none; }
        .dd-date-chip {
          flex-shrink: 0; display: flex; flex-direction: column;
          align-items: center; gap: 2px;
          padding: 10px 14px; border-radius: 12px;
          border: 1px solid #B5D4F4; background: #F8FAFC;
          cursor: pointer; transition: all 0.2s;
          font-family: 'DM Sans', sans-serif; min-width: 58px;
        }
        .dd-date-chip:hover { background: #E6F1FB; border-color: #378ADD; }
        .dd-date-chip.selected { background: #E6F1FB; border-color: #185FA5; }
        .dd-date-day { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: #94A3B8; }
        .dd-date-chip.selected .dd-date-day { color: #185FA5; }
        .dd-date-num { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1.2rem; font-weight: 800; color: #1E293B; line-height: 1; }
        .dd-date-chip.selected .dd-date-num { color: #185FA5; }
        .dd-date-month { font-size: 9px; color: #94A3B8; text-transform: uppercase; }

        /* ── SLOTS ── */
        .dd-slot-section { margin-bottom: 16px; }
        .dd-slot-period {
          font-size: 10px; font-weight: 600; letter-spacing: 1.5px;
          text-transform: uppercase; color: #94A3B8; margin-bottom: 8px;
          display: flex; align-items: center; gap: 8px;
        }
        .dd-slot-period::after { content:''; flex:1; height:1px; background:#E6F1FB; }
        .dd-slots-grid {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(88px,1fr)); gap: 8px;
        }
        .dd-slot {
          padding: 10px 6px; border-radius: 10px;
          border: 1px solid #B5D4F4; background: #F8FAFC;
          font-size: 12px; font-weight: 500; color: #64748B;
          cursor: pointer; transition: all 0.2s; text-align: center;
          font-family: 'DM Sans', sans-serif;
        }
        .dd-slot:hover { background: #E6F1FB; border-color: #378ADD; color: #185FA5; }
        .dd-slot.selected { background: #E6F1FB; border-color: #185FA5; color: #185FA5; font-weight: 600; box-shadow: 0 0 0 2px rgba(24,95,165,0.15); }
        .dd-no-slots { text-align: center; padding: 28px; color: #94A3B8; font-size: 14px; }

        /* ── BOOKING SIDEBAR ── */
        .dd-booking-card {
          background: #fff; border: 1px solid #B5D4F4;
          border-radius: 20px; overflow: hidden;
          box-shadow: 0 8px 32px rgba(24,95,165,0.1);
          position: sticky; top: 84px;
        }
        .dd-booking-header {
          padding: 18px 20px 14px;
          border-bottom: 1px solid #E6F1FB;
          background: linear-gradient(160deg, #F4F9FF, #EAF3FF);
          position: relative; overflow: hidden;
        }
        .dd-booking-header::before {
          content:''; position:absolute; top:0;left:0;right:0;height:3px;
          background: linear-gradient(90deg, #185FA5, #378ADD, #85B7EB);
        }
        .dd-booking-header-title {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 1rem; font-weight: 800; color: #0F172A; margin-bottom: 2px;
        }
        .dd-booking-header-sub { font-size: 12px; color: #64748B; }
        .dd-booking-body { padding: 16px 20px; }

        /* Summary rows */
        .dd-summary-row {
          display: flex; justify-content: space-between; align-items: center;
          padding: 9px 0; border-bottom: 1px solid #F1F5F9;
          font-size: 13px;
        }
        .dd-summary-row:last-of-type { border-bottom: none; }
        .dd-summary-label { color: #64748B; }
        .dd-summary-value { font-weight: 500; color: #0F172A; text-align: right; max-width: 60%; }
        .dd-summary-value.empty { color: #94A3B8; font-style: italic; }

        /* Plans */
        .dd-plans { display: flex; flex-direction: column; gap: 8px; margin: 14px 0; }
        .dd-plan {
          display: flex; align-items: center; gap: 12px;
          padding: 12px 14px; border-radius: 12px;
          border: 1.5px solid #B5D4F4; cursor: pointer; transition: all 0.2s;
          position: relative; background: #F8FAFC;
        }
        .dd-plan:hover { border-color: #378ADD; background: #E6F1FB; }
        .dd-plan.selected { border-color: #185FA5; background: #E6F1FB; }
        .dd-plan-radio {
          width: 18px; height: 18px; border-radius: 50%;
          border: 2px solid #B5D4F4;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0; transition: all 0.2s;
        }
        .dd-plan.selected .dd-plan-radio { border-color: #185FA5; background: #E6F1FB; }
        .dd-plan-radio-dot { width: 8px; height: 8px; border-radius: 50%; background: #185FA5; opacity: 0; transition: opacity 0.2s; }
        .dd-plan.selected .dd-plan-radio-dot { opacity: 1; }
        .dd-plan-info { flex: 1; min-width: 0; }
        .dd-plan-name { font-size: 13px; font-weight: 600; color: #0F172A; margin-bottom: 2px; }
        .dd-plan-desc { font-size: 11px; color: #64748B; }
        .dd-plan-price { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1.1rem; font-weight: 800; color: #185FA5; flex-shrink: 0; }
        .dd-plan-popular {
          position: absolute; top: -8px; right: 10px;
          background: #185FA5; color: #fff;
          font-size: 9px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;
          padding: 2px 8px; border-radius: 100px;
        }

        /* Total */
        .dd-total-row {
          display: flex; justify-content: space-between; align-items: center;
          padding: 12px 0; border-top: 1px solid #E6F1FB; margin-bottom: 14px;
        }
        .dd-total-label { font-size: 14px; font-weight: 600; color: #64748B; }
        .dd-total-amount {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 1.5rem; font-weight: 800; color: #185FA5;
        }

        /* Book button */
        .dd-book-btn {
          width: 100%; padding: 14px; border-radius: 12px; border: none;
          background: #185FA5; color: #fff;
          font-family: 'DM Sans', sans-serif; font-size: 15px; font-weight: 600;
          cursor: pointer; transition: all 0.25s;
          box-shadow: 0 4px 14px rgba(24,95,165,0.25);
          display: flex; align-items: center; justify-content: center; gap: 8px;
        }
        .dd-book-btn:hover:not(:disabled) {
          background: #0C447C;
          box-shadow: 0 8px 24px rgba(24,95,165,0.35);
          transform: translateY(-1px);
        }
        .dd-book-btn:disabled { opacity: 0.45; cursor: not-allowed; transform: none; }
        .dd-book-btn.outline {
          background: transparent; color: #185FA5;
          border: 1px solid #B5D4F4; box-shadow: none;
        }
        .dd-book-btn.outline:hover { background: #E6F1FB; border-color: #378ADD; transform: none; }

        .dd-book-note {
          font-size: 11px; color: #94A3B8; text-align: center;
          margin-top: 10px; line-height: 1.6;
        }

        /* Animations */
        @keyframes ddFadeUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        @keyframes ddPulse  { 0%,100%{opacity:1} 50%{opacity:0.4} }

        /* ── STICKY MOBILE BOOK BUTTON ── */
        .dd-sticky-bar {
          display: none;
          position: fixed; bottom: 0; left: 0; right: 0; z-index: 500;
          background: rgba(255,255,255,0.97); backdrop-filter: blur(12px);
          border-top: 1px solid #B5D4F4;
          padding: 12px 16px;
          box-shadow: 0 -4px 20px rgba(24,95,165,0.1);
        }
        .dd-sticky-bar-inner {
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          max-width: 600px; margin: 0 auto;
        }
        .dd-sticky-info { flex: 1; min-width: 0; }
        .dd-sticky-slot {
          font-size: 13px; font-weight: 600; color: #185FA5;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .dd-sticky-price { font-size: 12px; color: #64748B; }
        .dd-sticky-btn {
          flex-shrink: 0; padding: 12px 24px; border-radius: 12px; border: none;
          background: #185FA5; color: #fff;
          font-family: 'DM Sans', sans-serif; font-size: 14px; font-weight: 600;
          cursor: pointer; transition: all 0.2s;
          box-shadow: 0 4px 14px rgba(24,95,165,0.25);
        }
        .dd-sticky-btn:disabled { background: #94A3B8; box-shadow: none; cursor: not-allowed; }
        .dd-sticky-btn:not(:disabled):hover { background: #0C447C; }

        /* ── RESPONSIVE ── */

        /* Tablet */
        @media (max-width: 960px) {
          .dd-layout { grid-template-columns: 1fr; gap: 0; }
          .dd-booking-card { position: static; margin-bottom: 80px; }
          .dd-stats-row { gap: 10px; }
          .dd-profile-card { padding: 18px 20px; gap: 14px; }
          .dd-sticky-bar { display: block; }
        }

        /* Mobile */
        @media (max-width: 640px) {
          .dd-banner { height: 180px; }
          .dd-back { top: 10px; left: 10px; padding: 7px 12px; font-size: 12px; }

          .dd-wrap { padding: 0 12px; }

          .dd-profile-card {
            margin-top: -44px;
            border-radius: 14px;
            padding: 14px;
            gap: 12px;
          } 
            
          /* Stats */
          .dd-stats-row { padding: 0 12px; margin-top: 10px; gap: 8px; }
          .dd-stat-box { padding: 12px 6px; border-radius: 12px; }
          .dd-stat-val { font-size: 1.1rem; }
          .dd-stat-lbl { font-size: 11px; }

          /* Layout */
          .dd-layout { padding: 0 12px; margin-top: 12px; }

          /* Blocks */
          .dd-block { padding: 14px; border-radius: 14px; margin-bottom: 10px; }
          .dd-block-title { font-size: 14px; margin-bottom: 12px; }
          .dd-block-title-icon { width: 26px; height: 26px; font-size: 12px; }

          /* Date chips — scrollable row */
          .dd-date-row { gap: 6px; padding-bottom: 4px; }
          .dd-date-chip { padding: 8px 10px; min-width: 48px; border-radius: 10px; }
          .dd-date-num { font-size: 0.95rem; }
          .dd-date-day { font-size: 9px; }
          .dd-date-month { font-size: 8px; }

          /* Slots — 3 columns on mobile */
          .dd-slots-grid { grid-template-columns: repeat(3, 1fr); gap: 6px; }
          .dd-slot { padding: 10px 4px; font-size: 12px; border-radius: 9px; }

          /* Booking card — hide on mobile (use sticky bar) */
          .dd-booking-card .dd-booking-body .dd-plans,
          .dd-booking-card .dd-total-row { display: none; }
          .dd-booking-card { border-radius: 14px; margin-bottom: 80px; }
          .dd-booking-header { padding: 14px 16px 12px; }
          .dd-booking-header-title { font-size: 15px; }
          .dd-booking-body { padding: 12px 16px; }
          .dd-summary-row { padding: 8px 0; font-size: 13px; }
          .dd-book-btn { padding: 12px; font-size: 14px; }
          .dd-book-note { font-size: 11px; margin-top: 8px; }
        }

        /* Very small phones */
        @media (max-width: 360px) {
          .dd-profile-card { flex-direction: column; }
          .dd-stats-row { grid-template-columns: repeat(3,1fr); }
          .dd-slots-grid { grid-template-columns: repeat(3,1fr); }
        }
      `}</style>

      <div className="dd-root">

        {/* ── BANNER ── */}
        <div className="dd-banner">
          {doctor.hospital_image && !doctor.hospital_image.includes('placehold')
            ? <img className="dd-banner-img" src={doctor.hospital_image} alt={doctor.hospital_name} />
            : <div className="dd-banner-placeholder">🏥</div>
          }
          <div className="dd-banner-grid" />
          <div className="dd-banner-overlay" />
          <button className="dd-back" onClick={() => navigate(-1)}>← Back</button>
        </div>

        {/* ── PROFILE ── */}
        <div className="dd-profile-wrap">
          <div className="dd-profile-card">
            {doctor.image && !doctor.image.includes('placehold')
              ? <img className="dd-doctor-avatar" src={doctor.image} alt={`Dr. ${doctor.name}`} />
              : <div className="dd-doctor-avatar-placeholder">🩺</div>
            }
            <div className="dd-profile-info">
              <span className="dd-spec-badge">{doctor.specialization}</span>
              <div className="dd-doctor-name">Dr. {doctor.name}</div>
              <div className="dd-profile-pills">
                <span className="dd-pill">📍 {doctor.city}</span>
                <span className="dd-pill">⏳ {doctor.experience} yrs exp</span>
                <span className={`dd-avail-pill ${doctor.available ? 'yes' : 'no'}`}>
                  <span className="dd-avail-dot" />
                  {doctor.available ? 'Available Today' : 'Unavailable'}
                </span>
              </div>
              <div className="dd-hospital-name">🏥 {doctor.hospital_name}</div>
            </div>
          </div>
        </div>

        {/* ── STATS ── */}
        <div className="dd-stats-row">
          {[
            { val: `${doctor.experience}+`, lbl: 'Years Exp'   },
            { val: slots.length,             lbl: 'Daily Slots' },
            { val: doctor.max_per_slot || 10, lbl: 'Per Slot'  },
          ].map(({ val, lbl }) => (
            <div key={lbl} className="dd-stat-box">
              <div className="dd-stat-val">{val}</div>
              <div className="dd-stat-lbl">{lbl}</div>
            </div>
          ))}
        </div>

        {/* ── MAIN LAYOUT ── */}
        <div className="dd-layout">

          {/* LEFT — Date + Slots */}
          <div>
            {/* Date picker */}
            <div className="dd-block" style={{ animationDelay:'0.05s' }}>
              <div className="dd-block-title">
                <div className="dd-block-title-icon">📅</div>
                Select Date
              </div>
              <div className="dd-date-row">
                {DAYS.map(day => (
                  <button
                    key={day.full}
                    className={`dd-date-chip ${selectedDate === day.full ? 'selected' : ''}`}
                    onClick={() => { setSelectedDate(day.full); setSelectedSlot(''); }}
                  >
                    <span className="dd-date-day">{day.label}</span>
                    <span className="dd-date-num">{day.num}</span>
                    <span className="dd-date-month">{day.month}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Slots */}
            <div className="dd-block" style={{ animationDelay:'0.1s' }}>
              <div className="dd-block-title">
                <div className="dd-block-title-icon">🕐</div>
                Select Time Slot
                {selectedSlot && (
                  <span style={{ marginLeft:'auto', fontSize:12, color:'#185FA5', fontWeight:600 }}>
                    ✓ {selectedSlot}
                  </span>
                )}
              </div>

              {slots.length === 0 ? (
                <div className="dd-no-slots">No slots configured. Contact the hospital directly.</div>
              ) : (
                <>
                  {am.length > 0 && (
                    <div className="dd-slot-section">
                      <div className="dd-slot-period">🌅 Morning</div>
                      <div className="dd-slots-grid">
                        {am.map(s => (
                          <button
                            key={s}
                            className={`dd-slot ${selectedSlot === s ? 'selected' : ''}`}
                            onClick={() => setSelectedSlot(s)}
                          >{s}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  {pm.length > 0 && (
                    <div className="dd-slot-section">
                      <div className="dd-slot-period">🌇 Afternoon / Evening</div>
                      <div className="dd-slots-grid">
                        {pm.map(s => (
                          <button
                            key={s}
                            className={`dd-slot ${selectedSlot === s ? 'selected' : ''}`}
                            onClick={() => setSelectedSlot(s)}
                          >{s}</button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* RIGHT — Booking card */}
          <div>
            <div className="dd-booking-card">
              <div className="dd-booking-header">
                <div className="dd-booking-header-title">Book Appointment</div>
                <div className="dd-booking-header-sub">Instant confirmation · Secure payment</div>
              </div>

              <div className="dd-booking-body">
                {/* Summary */}
                <div className="dd-summary-row">
                  <span className="dd-summary-label">Doctor</span>
                  <span className="dd-summary-value">Dr. {doctor.name}</span>
                </div>
                <div className="dd-summary-row">
                  <span className="dd-summary-label">Date</span>
                  <span className="dd-summary-value">
                    {dateLabel ? `${dateLabel.label}, ${dateLabel.num} ${dateLabel.month}` : '—'}
                  </span>
                </div>
                <div className="dd-summary-row">
                  <span className="dd-summary-label">Slot</span>
                  <span className={`dd-summary-value ${!selectedSlot ? 'empty' : ''}`}>
                    {selectedSlot || 'Not selected'}
                  </span>
                </div>

                {/* Plan */}
                <div style={{ marginTop:14 }}>
                  <div style={{ fontSize:11, fontWeight:600, letterSpacing:1.5, textTransform:'uppercase', color:'#94A3B8', marginBottom:10 }}>
                    Choose Plan
                  </div>
                  <div className="dd-plans">
                    {PLANS.map(p => (
                      <div
                        key={p.key}
                        className={`dd-plan ${selectedPlan === p.key ? 'selected' : ''}`}
                        onClick={() => setSelectedPlan(p.key)}
                      >
                        {p.popular && <div className="dd-plan-popular">Popular</div>}
                        <div className="dd-plan-radio"><div className="dd-plan-radio-dot" /></div>
                        <div className="dd-plan-info">
                          <div className="dd-plan-name">{p.name}</div>
                          <div className="dd-plan-desc">{p.desc}</div>
                        </div>
                        <div className="dd-plan-price">₹{p.price}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Total */}
                <div className="dd-total-row">
                  <span className="dd-total-label">Total Amount</span>
                  <span className="dd-total-amount">₹{plan?.price}</span>
                </div>

                {/* Book button */}
                {user ? (
                  <button
                    className="dd-book-btn"
                    onClick={handleBook}
                    disabled={!selectedSlot || !doctor.available}
                  >
                    {!doctor.available
                      ? '⛔ Doctor Unavailable'
                      : !selectedSlot
                      ? 'Select a Slot First'
                      : `💳 Pay ₹${plan?.price} & Book`}
                  </button>
                ) : (
                  <button className="dd-book-btn outline" onClick={() => navigate('/login')}>
                    Login to Book →
                  </button>
                )}

                <p className="dd-book-note">
                  Secured by Razorpay · UPI · Cards · Wallets<br />
                  Refundable if cancelled 2hrs before slot
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── STICKY MOBILE BOOK BAR ── */}
      <div className="dd-sticky-bar">
        <div className="dd-sticky-bar-inner">
          <div className="dd-sticky-info">
            <div className="dd-sticky-slot">
              {selectedSlot ? `⏰ ${selectedSlot}` : 'Select a time slot above'}
            </div>
            <div className="dd-sticky-price">₹{plan?.price} · Queue View</div>
          </div>
          {user ? (
            <button
              className="dd-sticky-btn"
              onClick={handleBook}
              disabled={!selectedSlot || !doctor.available}
            >
              {!doctor.available ? 'Unavailable' : !selectedSlot ? 'Pick Slot' : `Pay ₹${plan?.price}`}
            </button>
          ) : (
            <button className="dd-sticky-btn" onClick={() => navigate('/login')}>
              Login to Book
            </button>
          )}
        </div>
      </div>
    </>
  );
}