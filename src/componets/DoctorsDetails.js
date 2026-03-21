import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import API from '../services/api';

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&display=swap');

  .dd-wrap {
    font-family: 'DM Sans', sans-serif;
    background: #00133A;
    min-height: 100vh;
    color: #fff;
    padding-bottom: 100px;
  }

  /* BANNER */
  .dd-banner {
    position: relative;
    height: 300px;
    overflow: hidden;
  }

  .dd-banner-img {
    width: 100%; height: 100%;
    object-fit: cover;
    filter: brightness(0.45);
    transition: transform 8s ease;
  }

  .dd-banner:hover .dd-banner-img { transform: scale(1.04); }

  .dd-banner-placeholder {
    width: 100%; height: 100%;
    background: linear-gradient(135deg, rgba(0,87,255,0.25) 0%, rgba(0,19,58,0.9) 60%, rgba(0,212,255,0.1) 100%);
    display: flex; align-items: center; justify-content: center;
    font-size: 6rem; opacity: 0.4;
  }

  .dd-banner-overlay {
    position: absolute; inset: 0;
    background: linear-gradient(to bottom, transparent 0%, rgba(0,19,58,0.4) 50%, #00133A 100%);
  }

  .dd-banner-grid {
    position: absolute; inset: 0;
    background-image:
      linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px);
    background-size: 60px 60px;
  }

  .dd-back {
    position: absolute;
    top: 16px; left: 16px;
    display: flex; align-items: center; gap: 8px;
    background: rgba(0,19,58,0.6);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 10px;
    padding: 8px 16px;
    font-family: 'DM Sans', sans-serif;
    font-size: 13px; color: rgba(255,255,255,0.7);
    cursor: pointer; transition: all 0.2s;
    z-index: 10;
  }
  .dd-back:hover { background: rgba(0,87,255,0.2); color: white; }

  /* PROFILE CARD */
  .dd-profile-wrap {
    position: relative;
    margin-top: -70px;
    z-index: 10;
    padding: 0 16px;
  }

  .dd-profile-card {
    background: rgba(255,255,255,0.05);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 20px;
    padding: 20px;
    display: flex;
    align-items: flex-start;
    gap: 16px;
    position: relative;
    overflow: hidden;
    animation: ddFadeUp 0.5s ease both;
  }

  .dd-profile-card::before {
    content: '';
    position: absolute; top: 0; left: 0; right: 0; height: 2px;
    background: linear-gradient(90deg, #0057FF, #00D4FF, #00F5C4);
  }

  .dd-doctor-avatar {
    width: 80px; height: 80px;
    border-radius: 18px;
    object-fit: cover;
    border: 2px solid rgba(0,212,255,0.3);
    flex-shrink: 0;
  }

  .dd-doctor-avatar-placeholder {
    width: 80px; height: 80px;
    border-radius: 18px;
    background: linear-gradient(135deg, rgba(0,87,255,0.25), rgba(0,212,255,0.15));
    border: 2px solid rgba(0,212,255,0.25);
    display: flex; align-items: center; justify-content: center;
    font-size: 2rem; flex-shrink: 0;
  }

  .dd-profile-info { flex: 1; min-width: 0; }

  .dd-spec-badge {
    display: inline-block;
    font-size: 10px; font-weight: 600;
    letter-spacing: 2px; text-transform: uppercase;
    color: #00D4FF; margin-bottom: 4px;
  }

  .dd-doctor-name {
    font-family: 'Syne', sans-serif;
    font-size: clamp(1.1rem, 4vw, 1.7rem);
    font-weight: 800; line-height: 1.1;
    margin-bottom: 8px;
  }

  .dd-profile-pills {
    display: flex; flex-wrap: wrap; gap: 6px;
    margin-bottom: 10px;
  }

  .dd-pill {
    display: flex; align-items: center; gap: 4px;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.09);
    border-radius: 100px;
    padding: 4px 10px;
    font-size: 12px; color: rgba(255,255,255,0.6);
  }

  .dd-avail-pill {
    display: inline-flex; align-items: center; gap: 6px;
    border-radius: 100px; padding: 4px 12px;
    font-size: 12px; font-weight: 600;
  }
  .dd-avail-pill.yes { background: rgba(0,245,196,0.1); border: 1px solid rgba(0,245,196,0.3); color: #00F5C4; }
  .dd-avail-pill.no  { background: rgba(255,80,80,0.1);  border: 1px solid rgba(255,80,80,0.2);  color: #FF8080; }

  .dd-avail-dot {
    width: 7px; height: 7px; border-radius: 50%;
    background: currentColor;
    animation: ddPulse 2s infinite;
  }

  .dd-hospital-name { font-size: 12px; color: rgba(255,255,255,0.35); margin-top: 6px; }

  /* STATS */
  .dd-stats-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    padding: 16px 16px 0;
    margin-top: 8px;
  }

  .dd-stat-box {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 14px;
    padding: 14px 10px;
    text-align: center;
  }

  .dd-stat-val {
    font-family: 'Syne', sans-serif;
    font-size: 1.3rem; font-weight: 800;
    background: linear-gradient(135deg, #00D4FF, #00F5C4);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    background-clip: text; margin-bottom: 4px;
  }

  .dd-stat-lbl { font-size: 11px; color: rgba(255,255,255,0.35); }

  /* LAYOUT */
  .dd-layout {
    display: flex;
    flex-direction: column;
    gap: 0;
    margin-top: 16px;
    padding: 0 16px;
  }

  /* BLOCK */
  .dd-block {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 18px;
    padding: 20px;
    margin-bottom: 14px;
    animation: ddFadeUp 0.5s ease both;
  }

  .dd-block-title {
    font-family: 'Syne', sans-serif;
    font-size: 0.95rem; font-weight: 700;
    margin-bottom: 16px;
    display: flex; align-items: center; gap: 8px;
    color: rgba(255,255,255,0.85);
  }

  .dd-block-title-icon {
    width: 30px; height: 30px; border-radius: 8px;
    background: rgba(0,87,255,0.15);
    display: flex; align-items: center; justify-content: center;
    font-size: 14px;
  }

  /* DATE CHIPS */
  .dd-date-row {
    display: flex; gap: 8px;
    overflow-x: auto;
    padding-bottom: 6px;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
  }
  .dd-date-row::-webkit-scrollbar { display: none; }

  .dd-date-chip {
    flex-shrink: 0;
    display: flex; flex-direction: column; align-items: center;
    gap: 2px;
    padding: 10px 14px;
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,0.08);
    background: transparent;
    cursor: pointer; transition: all 0.2s;
    font-family: 'DM Sans', sans-serif;
    min-width: 54px;
  }
  .dd-date-chip:hover { background: rgba(0,87,255,0.1); border-color: rgba(0,87,255,0.3); }
  .dd-date-chip.selected { background: rgba(0,87,255,0.2); border-color: rgba(0,87,255,0.5); }

  .dd-date-day {
    font-size: 10px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 1px;
    color: rgba(255,255,255,0.4);
  }
  .dd-date-chip.selected .dd-date-day { color: #00D4FF; }

  .dd-date-num {
    font-family: 'Syne', sans-serif;
    font-size: 1.2rem; font-weight: 800;
    color: rgba(255,255,255,0.7); line-height: 1;
  }
  .dd-date-chip.selected .dd-date-num { color: white; }

  .dd-date-month { font-size: 9px; color: rgba(255,255,255,0.3); text-transform: uppercase; }

  /* SLOTS */
  .dd-slot-section { margin-bottom: 14px; }

  .dd-slot-period {
    font-size: 10px; font-weight: 600;
    letter-spacing: 1.5px; text-transform: uppercase;
    color: rgba(255,255,255,0.3); margin-bottom: 8px;
    display: flex; align-items: center; gap: 8px;
  }
  .dd-slot-period::after { content: ''; flex: 1; height: 1px; background: rgba(255,255,255,0.06); }

  .dd-slots-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(82px, 1fr));
    gap: 8px;
  }

  .dd-slot {
    padding: 10px 6px;
    border-radius: 10px;
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.03);
    font-size: 12px; font-weight: 500;
    color: rgba(255,255,255,0.6);
    cursor: pointer; transition: all 0.2s;
    text-align: center;
    font-family: 'DM Sans', sans-serif;
  }
  .dd-slot:hover { background: rgba(0,87,255,0.1); border-color: rgba(0,87,255,0.35); color: white; }
  .dd-slot.selected {
    background: rgba(0,87,255,0.22); border-color: #0057FF;
    color: #00D4FF; font-weight: 600;
    box-shadow: 0 0 0 2px rgba(0,87,255,0.2);
  }

  .dd-no-slots {
    text-align: center; padding: 24px;
    color: rgba(255,255,255,0.25); font-size: 14px;
  }

  /* BOOKING CARD */
  .dd-booking-card {
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.09);
    border-radius: 20px;
    overflow: hidden;
    margin-bottom: 14px;
  }

  .dd-booking-header {
    padding: 18px 20px 14px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    background: rgba(0,87,255,0.06);
  }

  .dd-booking-header-title {
    font-family: 'Syne', sans-serif;
    font-size: 1rem; font-weight: 700; margin-bottom: 2px;
  }

  .dd-booking-header-sub { font-size: 12px; color: rgba(255,255,255,0.35); }

  .dd-booking-body { padding: 16px 20px; }

  .dd-summary-row {
    display: flex; justify-content: space-between; align-items: center;
    padding: 9px 0;
    border-bottom: 1px solid rgba(255,255,255,0.05);
    font-size: 13px;
  }
  .dd-summary-row:last-of-type { border-bottom: none; }
  .dd-summary-label { color: rgba(255,255,255,0.4); }
  .dd-summary-value { font-weight: 500; color: rgba(255,255,255,0.85); text-align: right; max-width: 60%; }
  .dd-summary-value.empty { color: rgba(255,255,255,0.2); font-style: italic; }

  /* PLANS */
  .dd-plans { display: flex; flex-direction: column; gap: 8px; margin: 16px 0; }

  .dd-plan {
    display: flex; align-items: center; gap: 12px;
    padding: 12px 14px;
    border-radius: 12px;
    border: 1.5px solid rgba(255,255,255,0.08);
    cursor: pointer; transition: all 0.2s;
    position: relative;
  }
  .dd-plan:hover { border-color: rgba(0,87,255,0.3); }
  .dd-plan.selected { border-color: #0057FF; background: rgba(0,87,255,0.1); }

  .dd-plan-radio {
    width: 18px; height: 18px; border-radius: 50%;
    border: 2px solid rgba(255,255,255,0.2);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; transition: all 0.2s;
  }
  .dd-plan.selected .dd-plan-radio { border-color: #0057FF; background: rgba(0,87,255,0.2); }

  .dd-plan-radio-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: #00D4FF; opacity: 0; transition: opacity 0.2s;
  }
  .dd-plan.selected .dd-plan-radio-dot { opacity: 1; }

  .dd-plan-info { flex: 1; min-width: 0; }
  .dd-plan-name { font-size: 13px; font-weight: 600; margin-bottom: 2px; }
  .dd-plan-desc { font-size: 11px; color: rgba(255,255,255,0.35); }

  .dd-plan-price {
    font-family: 'Syne', sans-serif;
    font-size: 1.1rem; font-weight: 800; color: white; flex-shrink: 0;
  }
  .dd-plan.selected .dd-plan-price { color: #00D4FF; }

  .dd-plan-popular {
    position: absolute; top: -8px; right: 10px;
    background: linear-gradient(135deg, #0057FF, #00D4FF);
    color: white; font-size: 9px; font-weight: 700;
    letter-spacing: 1px; text-transform: uppercase;
    padding: 2px 8px; border-radius: 100px;
  }

  /* TOTAL */
  .dd-total-row {
    display: flex; justify-content: space-between; align-items: center;
    padding: 12px 0;
    border-top: 1px solid rgba(255,255,255,0.07);
    margin-bottom: 14px;
  }

  .dd-total-label { font-size: 14px; font-weight: 600; color: rgba(255,255,255,0.7); }

  .dd-total-amount {
    font-family: 'Syne', sans-serif;
    font-size: 1.5rem; font-weight: 800;
    background: linear-gradient(135deg, #00D4FF, #00F5C4);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  /* BOOK BUTTON */
  .dd-book-btn {
    width: 100%; padding: 15px;
    border-radius: 14px; border: none;
    background: linear-gradient(135deg, #0057FF, #0040CC);
    color: white;
    font-family: 'DM Sans', sans-serif;
    font-size: 15px; font-weight: 600;
    cursor: pointer; transition: all 0.25s;
    box-shadow: 0 6px 24px rgba(0,87,255,0.3);
    display: flex; align-items: center; justify-content: center; gap: 8px;
  }
  .dd-book-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 12px 32px rgba(0,87,255,0.45); }
  .dd-book-btn:disabled { opacity: 0.45; cursor: not-allowed; transform: none; }

  .dd-book-note {
    font-size: 11px; color: rgba(255,255,255,0.22);
    text-align: center; margin-top: 10px; line-height: 1.6;
  }

  /* SKELETON */
  .dd-skel-line {
    border-radius: 8px; margin-bottom: 12px;
    background: linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%);
    background-size: 200% 100%;
    animation: ddShimmer 1.4s infinite;
  }

  /* ANIMATIONS */
  @keyframes ddFadeUp {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes ddPulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.35; }
  }
  @keyframes ddShimmer {
    0%   { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  /* DESKTOP — switch to side-by-side layout */
  @media (min-width: 900px) {
    .dd-banner { height: 340px; }
    .dd-profile-wrap { padding: 0 32px; margin-top: -90px; }
    .dd-profile-card { padding: 28px 32px; gap: 24px; }
    .dd-doctor-avatar { width: 90px; height: 90px; border-radius: 20px; }
    .dd-doctor-avatar-placeholder { width: 90px; height: 90px; font-size: 2.5rem; }
    .dd-doctor-name { font-size: 1.8rem; }
    .dd-pill { font-size: 13px; }
    .dd-stats-row { padding: 20px 32px 0; gap: 14px; }
    .dd-stat-box { padding: 18px 14px; }
    .dd-layout {
      display: grid;
      grid-template-columns: 1fr 360px;
      gap: 24px;
      padding: 20px 32px 0;
      align-items: start;
    }
    .dd-block { padding: 26px; margin-bottom: 20px; }
    .dd-booking-card { margin-bottom: 0; }
    .dd-sidebar { position: sticky; top: 88px; }
    .dd-slots-grid { grid-template-columns: repeat(auto-fill, minmax(90px, 1fr)); }
  }
`;

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
  { key: 'queue', name: 'Queue View',   desc: 'Token + live queue position tracking',       price: 15, fee: 1500, popular: true },
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
        hospital:     doctor.hospital_name,
        date:         selectedDate,
        slot:         selectedSlot,
        fee:          plan.price,
        amount:       plan.fee,
        queue_access: selectedPlan === 'queue',
      }
    });
  };

  const slots = doctor?.slots || [];
  const am    = slots.filter(s => s.includes('AM'));
  const pm    = slots.filter(s => s.includes('PM'));
  const plan  = PLANS.find(p => p.key === selectedPlan);
  const dateLabel = DAYS.find(d => d.full === selectedDate);

  if (loading) return (
    <>
      <style>{css}</style>
      <div className="dd-wrap">
        <div style={{ height: 300, background: 'rgba(0,87,255,0.08)' }} />
        <div style={{ padding: '0 16px', marginTop: -70 }}>
          <div className="dd-block">
            {[80,50,65,40].map((w,i) => (
              <div key={i} className="dd-skel-line" style={{ width: `${w}%`, height: i===1 ? 28 : 14 }} />
            ))}
          </div>
        </div>
      </div>
    </>
  );

  if (!doctor) return null;

  return (
    <>
      <style>{css}</style>
      <div className="dd-wrap">

        {/* BANNER */}
        <div className="dd-banner">
          {doctor.hospital_image
            ? <img className="dd-banner-img" src={doctor.hospital_image} alt={doctor.hospital_name} />
            : <div className="dd-banner-placeholder">🏥</div>
          }
          <div className="dd-banner-grid" />
          <div className="dd-banner-overlay" />
          <button className="dd-back" onClick={() => navigate(-1)}>← Back</button>
        </div>

        {/* PROFILE */}
        <div className="dd-profile-wrap">
          <div className="dd-profile-card">
            {doctor.image
              ? <img className="dd-doctor-avatar" src={doctor.image} alt={`Dr. ${doctor.name}`} />
              : <div className="dd-doctor-avatar-placeholder">🩺</div>
            }
            <div className="dd-profile-info">
              <div className="dd-spec-badge">{doctor.specialization}</div>
              <div className="dd-doctor-name">Dr. {doctor.name}</div>
              <div className="dd-profile-pills">
                <div className="dd-pill">📍 {doctor.city}</div>
                <div className="dd-pill">⏳ {doctor.experience} yrs</div>
                <div className="dd-pill">📞 {doctor.mobile}</div>
                <div className={`dd-avail-pill ${doctor.available ? 'yes' : 'no'}`}>
                  <span className="dd-avail-dot" />
                  {doctor.available ? 'Available Today' : 'Unavailable'}
                </div>
              </div>
              <div className="dd-hospital-name">🏥 {doctor.hospital_name}</div>
            </div>
          </div>
        </div>

        {/* STATS */}
        <div className="dd-stats-row">
          {[
            { val: `${doctor.experience}+`, lbl: 'Years Exp' },
            { val: slots.length,             lbl: 'Daily Slots' },
            { val: doctor.max_per_slot || 10, lbl: 'Per Slot' },
          ].map(({ val, lbl }) => (
            <div key={lbl} className="dd-stat-box">
              <div className="dd-stat-val">{val}</div>
              <div className="dd-stat-lbl">{lbl}</div>
            </div>
          ))}
        </div>

        {/* MAIN LAYOUT */}
        <div className="dd-layout">

          {/* LEFT */}
          <div>

            {/* Date */}
            <div className="dd-block" style={{ animationDelay: '0.05s' }}>
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
            <div className="dd-block" style={{ animationDelay: '0.1s' }}>
              <div className="dd-block-title">
                <div className="dd-block-title-icon">🕐</div>
                Select Time Slot
                {selectedSlot && (
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: '#00D4FF', fontWeight: 500 }}>
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
                          <button key={s} className={`dd-slot ${selectedSlot === s ? 'selected' : ''}`}
                            onClick={() => setSelectedSlot(s)}>{s}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  {pm.length > 0 && (
                    <div className="dd-slot-section">
                      <div className="dd-slot-period">🌇 Afternoon / Evening</div>
                      <div className="dd-slots-grid">
                        {pm.map(s => (
                          <button key={s} className={`dd-slot ${selectedSlot === s ? 'selected' : ''}`}
                            onClick={() => setSelectedSlot(s)}>{s}</button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

          </div>

          {/* RIGHT — Booking */}
          <div className="dd-sidebar">
            <div className="dd-booking-card">
              <div className="dd-booking-header">
                <div className="dd-booking-header-title">Book Appointment</div>
                <div className="dd-booking-header-sub">Instant confirmation · Secure payment</div>
              </div>

              <div className="dd-booking-body">
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

                {/* Plan selector */}
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1.5, textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: 10 }}>
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

                <div className="dd-total-row">
                  <span className="dd-total-label">Total Amount</span>
                  <span className="dd-total-amount">₹{plan?.price}</span>
                </div>

                {user ? (
                  <button
                    className="dd-book-btn"
                    onClick={handleBook}
                    disabled={!selectedSlot || !doctor.available}
                  >
                    {!doctor.available
                      ? 'Doctor Unavailable'
                      : !selectedSlot
                      ? 'Select a Slot First'
                      : `💳 Pay ₹${plan?.price} & Book`}
                  </button>
                ) : (
                  <button className="dd-book-btn" onClick={() => navigate('/login')}>
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
    </>
  );
}