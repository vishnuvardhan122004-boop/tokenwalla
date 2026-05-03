import { useEffect, useState, useCallback } from 'react';
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

  const [doctor,       setDoctor]       = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [user,         setUser]         = useState(null);
  const [slotAvail,    setSlotAvail]    = useState({});   // { "09:00 AM": { booked, max, full } }
  const [availLoading, setAvailLoading] = useState(false);

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

  // Fetch slot availability whenever doctor or date changes
  const fetchAvailability = useCallback(async (doctorId, date) => {
    setAvailLoading(true);
    try {
      const { data } = await API.get(`/doctors/${doctorId}/slot-availability/?date=${date}`);
      setSlotAvail(data);
    } catch {
      setSlotAvail({});
    } finally {
      setAvailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!doctor) return;
    fetchAvailability(doctor.id, selectedDate);
  }, [doctor, selectedDate, fetchAvailability]);

  const handleDateChange = (date) => {
    setSelectedDate(date);
    setSelectedSlot('');   // clear selected slot when date changes
  };

  const handleSlotClick = (slot) => {
    const info = slotAvail[slot];
    if (info?.full) return;   // blocked — do nothing
    setSelectedSlot(slot);
  };

  const handleBook = () => {
    if (!user) { navigate('/login'); return; }
    if (!selectedSlot) { alert('Please select a time slot'); return; }
    // Double-check slot hasn't filled up since page load
    if (slotAvail[selectedSlot]?.full) {
      alert('This slot just filled up. Please choose another slot.');
      setSelectedSlot('');
      return;
    }
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

  // Returns slot visual state: 'available' | 'partial' | 'full' | 'selected'
  const slotState = (slot) => {
    if (slot === selectedSlot) return 'selected';
    const info = slotAvail[slot];
    if (!info) return 'available';
    if (info.full) return 'full';
    if (info.booked > 0) return 'partial';
    return 'available';
  };

  const slotLabel = (slot) => {
    const info = slotAvail[slot];
    if (!info || info.booked === 0) return slot;
    if (info.full) return slot;
    return `${slot}`;
  };

  const slotSubtext = (slot) => {
    const info = slotAvail[slot];
    if (!info || info.booked === 0) return null;
    if (info.full) return 'Full';
    const left = info.max - info.booked;
    return `${left} left`;
  };

  /* ── Loading skeleton ── */
  if (loading) return (
    <>
      <style>{`
        .dd-skel-root { background: #F4F9FF; min-height: 100vh; }
        .dd-skel-banner { height: 220px; background: linear-gradient(90deg,#E6F1FB 25%,#B5D4F4 50%,#E6F1FB 75%); background-size:200% 100%; animation:ddShimmer 1.4s infinite; }
        .dd-skel-body { max-width:1100px; margin:0 auto; padding:16px 12px; }
        .dd-skel-line { border-radius:10px; background:linear-gradient(90deg,#E6F1FB 25%,#B5D4F4 50%,#E6F1FB 75%); background-size:200% 100%; animation:ddShimmer 1.4s infinite; margin-bottom:14px; }
        @keyframes ddShimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
      `}</style>
      <div className="dd-skel-root">
        <div className="dd-skel-banner" />
        <div className="dd-skel-body">
          <div className="dd-skel-line" style={{height:100,borderRadius:16,marginBottom:16}} />
          <div className="dd-skel-line" style={{height:80,borderRadius:12,marginBottom:12}} />
          <div className="dd-skel-line" style={{height:300,borderRadius:16}} />
        </div>
      </div>
    </>
  );

  if (!doctor) return null;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .dd-root {
          font-family: 'DM Sans', sans-serif;
          background: #F4F9FF;
          min-height: 100vh;
          padding-bottom: 60px;
        }

        /* ── BANNER ── */
        .dd-banner {
          position: relative;
          height: 240px;
          overflow: hidden;
          background: linear-gradient(160deg, #E6F1FB 0%, #B5D4F4 100%);
        }
        .dd-banner-img {
          width: 100%; height: 100%; object-fit: cover;
          filter: brightness(0.6);
        }
        .dd-banner-placeholder {
          width: 100%; height: 100%;
          display: flex; align-items: center; justify-content: center;
          font-size: 5rem; opacity: 0.25;
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
          position: absolute; top: 14px; left: 14px; z-index: 10;
          display: inline-flex; align-items: center; gap: 6px;
          background: rgba(255,255,255,0.92); backdrop-filter: blur(12px);
          border: 1px solid #B5D4F4; border-radius: 10px;
          padding: 8px 14px; font-size: 13px; color: #185FA5;
          cursor: pointer; transition: all 0.2s;
          font-family: 'DM Sans', sans-serif;
          white-space: nowrap;
        }
        .dd-back:hover { background: #fff; border-color: #378ADD; }

        /* ── WRAPPER ── */
        .dd-wrap {
          max-width: 1100px;
          margin: 0 auto;
          padding: 0 16px;
        }

        /* ── PROFILE CARD ── */
        .dd-profile-card {
          background: #fff;
          border: 1px solid #B5D4F4;
          border-radius: 18px;
          padding: 18px;
          display: flex;
          align-items: flex-start;
          gap: 14px;
          box-shadow: 0 6px 24px rgba(24,95,165,0.09);
          margin-top: -52px;
          position: relative;
          z-index: 10;
          overflow: hidden;
        }
        .dd-profile-card::before {
          content: '';
          position: absolute; top: 0; left: 0; right: 0; height: 3px;
          background: linear-gradient(90deg, #185FA5, #378ADD, #85B7EB);
        }
        .dd-doctor-avatar {
          width: 76px; height: 76px; border-radius: 14px;
          object-fit: cover; border: 2px solid #B5D4F4; flex-shrink: 0;
        }
        .dd-doctor-avatar-placeholder {
          width: 76px; height: 76px; border-radius: 14px;
          background: #E6F1FB; border: 2px solid #B5D4F4;
          display: flex; align-items: center; justify-content: center;
          font-size: 2rem; flex-shrink: 0;
        }
        .dd-profile-info { flex: 1; min-width: 0; }
        .dd-spec-badge {
          font-size: 10px; font-weight: 600; letter-spacing: 1.8px;
          text-transform: uppercase; color: #185FA5;
          margin-bottom: 4px; display: block;
        }
        .dd-doctor-name {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 1.25rem; font-weight: 800; color: #0F172A;
          margin-bottom: 8px; line-height: 1.2;
        }
        .dd-profile-pills {
          display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px;
        }
        .dd-pill {
          display: inline-flex; align-items: center; gap: 4px;
          background: #E6F1FB; border: 1px solid #B5D4F4;
          border-radius: 100px; padding: 3px 10px;
          font-size: 11px; color: #185FA5; font-weight: 500;
          white-space: nowrap;
        }
        .dd-avail-pill {
          display: inline-flex; align-items: center; gap: 5px;
          border-radius: 100px; padding: 3px 10px;
          font-size: 11px; font-weight: 600; white-space: nowrap;
        }
        .dd-avail-pill.yes { background: #EAF3DE; border: 1px solid #97C459; color: #3B6D11; }
        .dd-avail-pill.no  { background: #FCEBEB; border: 1px solid #F09595; color: #A32D2D; }
        .dd-avail-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: currentColor; animation: ddPulse 2s infinite; flex-shrink: 0;
        }
        .dd-hospital-name { font-size: 12px; color: #64748B; margin-top: 2px; }

        /* ── STATS ── */
        .dd-stats-row {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
          margin-top: 14px;
        }
        .dd-stat-box {
          background: #fff; border: 1px solid #B5D4F4;
          border-radius: 12px; padding: 14px 10px;
          text-align: center;
        }
        .dd-stat-val {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 1.3rem; font-weight: 800; color: #185FA5; margin-bottom: 2px;
        }
        .dd-stat-lbl { font-size: 11px; color: #64748B; }

        /* ── MAIN LAYOUT ── */
        .dd-layout {
          display: grid;
          grid-template-columns: 1fr 340px;
          gap: 20px;
          align-items: start;
          margin-top: 18px;
        }

        /* ── BLOCKS ── */
        .dd-block {
          background: #fff; border: 1px solid #B5D4F4;
          border-radius: 16px; padding: 18px;
          margin-bottom: 14px;
        }
        .dd-block:last-child { margin-bottom: 0; }
        .dd-block-title {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 14px; font-weight: 700; color: #0F172A;
          margin-bottom: 14px;
          display: flex; align-items: center; gap: 8px;
        }
        .dd-block-title-icon {
          width: 28px; height: 28px; border-radius: 7px;
          background: #E6F1FB; display: flex; align-items: center;
          justify-content: center; font-size: 13px; flex-shrink: 0;
        }

        /* ── DATE CHIPS ── */
        .dd-date-row {
          display: flex; gap: 7px; overflow-x: auto;
          padding-bottom: 4px; scrollbar-width: none;
        }
        .dd-date-row::-webkit-scrollbar { display: none; }
        .dd-date-chip {
          flex-shrink: 0; display: flex; flex-direction: column;
          align-items: center; gap: 2px;
          padding: 9px 12px; border-radius: 11px;
          border: 1px solid #B5D4F4; background: #F8FAFC;
          cursor: pointer; transition: all 0.2s;
          min-width: 52px;
        }
        .dd-date-chip:hover { background: #E6F1FB; border-color: #378ADD; }
        .dd-date-chip.selected { background: #E6F1FB; border-color: #185FA5; }
        .dd-date-day {
          font-size: 9px; font-weight: 600; text-transform: uppercase;
          letter-spacing: 0.8px; color: #94A3B8;
        }
        .dd-date-chip.selected .dd-date-day { color: #185FA5; }
        .dd-date-num {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 1.1rem; font-weight: 800; color: #1E293B; line-height: 1;
        }
        .dd-date-chip.selected .dd-date-num { color: #185FA5; }
        .dd-date-month { font-size: 8px; color: #94A3B8; text-transform: uppercase; }

        /* ── SLOTS ── */
        .dd-slot-section { margin-bottom: 14px; }
        .dd-slot-section:last-child { margin-bottom: 0; }
        .dd-slot-period {
          font-size: 10px; font-weight: 600; letter-spacing: 1.2px;
          text-transform: uppercase; color: #94A3B8; margin-bottom: 8px;
          display: flex; align-items: center; gap: 7px;
        }
        .dd-slot-period::after { content:''; flex:1; height:1px; background:#E6F1FB; }
        .dd-slots-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(86px, 1fr));
          gap: 7px;
        }

        /* ── SLOT BUTTON: all states ── */
        .dd-slot {
          position: relative;
          padding: 8px 4px 6px;
          border-radius: 9px;
          border: 1px solid #B5D4F4;
          background: #F8FAFC;
          font-size: 12px;
          font-weight: 500;
          color: #64748B;
          cursor: pointer;
          transition: all 0.18s;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          font-family: 'DM Sans', sans-serif;
        }

        /* available — hover */
        .dd-slot.available:hover {
          background: #E6F1FB;
          border-color: #378ADD;
          color: #185FA5;
        }

        /* selected */
        .dd-slot.selected {
          background: #E6F1FB;
          border-color: #185FA5;
          color: #185FA5;
          font-weight: 600;
          box-shadow: 0 0 0 2px rgba(24,95,165,0.15);
        }

        /* partial — some spots left (warm amber tint) */
        .dd-slot.partial {
          background: #FFF8ED;
          border-color: #F0A030;
          color: #854F0B;
        }
        .dd-slot.partial:hover {
          background: #FFF0D6;
          border-color: #D4820A;
        }

        /* full — completely booked */
        .dd-slot.full {
          background: #F8FAFC;
          border-color: #E2E8F0;
          color: #B0BAC6;
          cursor: not-allowed;
          text-decoration: line-through;
          text-decoration-color: #C4CCDA;
          text-decoration-thickness: 1.5px;
          opacity: 0.7;
        }
        .dd-slot.full:hover {
          background: #F8FAFC;
          border-color: #E2E8F0;
          color: #B0BAC6;
          transform: none;
        }

        /* availability bar inside slot */
        .dd-slot-bar {
          width: 100%;
          height: 3px;
          border-radius: 2px;
          background: #E2E8F0;
          overflow: hidden;
          margin-top: 2px;
        }
        .dd-slot-bar-fill {
          height: 100%;
          border-radius: 2px;
          transition: width 0.3s;
        }
        .partial .dd-slot-bar-fill  { background: #F0A030; }
        .full    .dd-slot-bar-fill  { background: #E2384B; }
        .selected .dd-slot-bar-fill { background: #185FA5; }
        .available .dd-slot-bar-fill { background: #4CAF7D; }

        /* sub-label inside slot (e.g. "3 left", "Full") */
        .dd-slot-sub {
          font-size: 9px;
          font-weight: 600;
          letter-spacing: 0.3px;
          line-height: 1;
        }
        .partial  .dd-slot-sub { color: #854F0B; }
        .full     .dd-slot-sub { color: #B0BAC6; }
        .selected .dd-slot-sub { color: #185FA5; }

        /* "Full" tag badge in top-right corner */
        .dd-slot-full-tag {
          position: absolute;
          top: 3px; right: 4px;
          font-size: 7px;
          font-weight: 700;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          color: #E2384B;
          background: #FCEBEB;
          border: 1px solid #F09595;
          border-radius: 3px;
          padding: 0px 3px;
          line-height: 14px;
        }

        /* loading shimmer overlay on slots area */
        .dd-slots-loading {
          opacity: 0.5;
          pointer-events: none;
        }

        /* ── LEGEND ── */
        .dd-legend {
          display: flex; gap: 14px; flex-wrap: wrap;
          margin-bottom: 14px; padding: 10px 14px;
          background: #F8FAFC; border: 1px solid #E6F1FB;
          border-radius: 10px;
        }
        .dd-legend-item {
          display: flex; align-items: center; gap: 5px;
          font-size: 11px; color: #64748B;
        }
        .dd-legend-dot {
          width: 10px; height: 10px; border-radius: 3px; flex-shrink: 0;
        }

        .dd-no-slots { text-align: center; padding: 24px; color: #94A3B8; font-size: 13px; }

        /* ── BOOKING CARD ── */
        .dd-booking-card {
          background: #fff; border: 1px solid #B5D4F4;
          border-radius: 18px; overflow: hidden;
          box-shadow: 0 6px 24px rgba(24,95,165,0.09);
          position: sticky; top: 80px;
        }
        .dd-booking-header {
          padding: 16px 18px 12px;
          border-bottom: 1px solid #E6F1FB;
          background: linear-gradient(160deg, #F4F9FF, #EAF3FF);
          position: relative; overflow: hidden;
        }
        .dd-booking-header::before {
          content:''; position:absolute; top:0; left:0; right:0; height:3px;
          background: linear-gradient(90deg, #185FA5, #378ADD, #85B7EB);
        }
        .dd-booking-header-title {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 15px; font-weight: 800; color: #0F172A; margin-bottom: 2px;
        }
        .dd-booking-header-sub { font-size: 12px; color: #64748B; }
        .dd-booking-body { padding: 14px 18px; }

        .dd-summary-row {
          display: flex; justify-content: space-between; align-items: center;
          padding: 8px 0; border-bottom: 1px solid #F1F5F9;
          font-size: 13px; gap: 8px;
        }
        .dd-summary-row:last-of-type { border-bottom: none; }
        .dd-summary-label { color: #64748B; flex-shrink: 0; }
        .dd-summary-value { font-weight: 500; color: #0F172A; text-align: right; }
        .dd-summary-value.empty { color: #94A3B8; font-style: italic; }

        .dd-plans { display: flex; flex-direction: column; gap: 8px; margin: 12px 0; }
        .dd-plan {
          display: flex; align-items: center; gap: 10px;
          padding: 11px 12px; border-radius: 11px;
          border: 1.5px solid #B5D4F4; cursor: pointer; transition: all 0.2s;
          position: relative; background: #F8FAFC;
        }
        .dd-plan:hover { border-color: #378ADD; background: #E6F1FB; }
        .dd-plan.selected { border-color: #185FA5; background: #E6F1FB; }
        .dd-plan-radio {
          width: 17px; height: 17px; border-radius: 50%;
          border: 2px solid #B5D4F4;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0; transition: border-color 0.2s;
        }
        .dd-plan.selected .dd-plan-radio { border-color: #185FA5; }
        .dd-plan-radio-dot {
          width: 7px; height: 7px; border-radius: 50%;
          background: #185FA5; opacity: 0; transition: opacity 0.2s;
        }
        .dd-plan.selected .dd-plan-radio-dot { opacity: 1; }
        .dd-plan-info { flex: 1; min-width: 0; }
        .dd-plan-name { font-size: 12px; font-weight: 600; color: #0F172A; margin-bottom: 1px; }
        .dd-plan-desc { font-size: 11px; color: #64748B; }
        .dd-plan-price {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 1rem; font-weight: 800; color: #185FA5; flex-shrink: 0;
        }
        .dd-plan-popular {
          position: absolute; top: -8px; right: 10px;
          background: #185FA5; color: #fff;
          font-size: 9px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase;
          padding: 2px 8px; border-radius: 100px;
        }

        .dd-total-row {
          display: flex; justify-content: space-between; align-items: center;
          padding: 12px 0; border-top: 1px solid #E6F1FB; margin-bottom: 12px;
        }
        .dd-total-label { font-size: 13px; font-weight: 600; color: #64748B; }
        .dd-total-amount {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 1.4rem; font-weight: 800; color: #185FA5;
        }

        .dd-book-btn {
          width: 100%; padding: 13px; border-radius: 11px; border: none;
          background: #185FA5; color: #fff;
          font-family: 'DM Sans', sans-serif; font-size: 14px; font-weight: 600;
          cursor: pointer; transition: all 0.25s;
          box-shadow: 0 4px 14px rgba(24,95,165,0.22);
          display: flex; align-items: center; justify-content: center; gap: 7px;
        }
        .dd-book-btn:hover:not(:disabled) {
          background: #0C447C;
          box-shadow: 0 6px 20px rgba(24,95,165,0.3);
          transform: translateY(-1px);
        }
        .dd-book-btn:disabled { opacity: 0.45; cursor: not-allowed; transform: none; }
        .dd-book-btn.outline {
          background: transparent; color: #185FA5;
          border: 1.5px solid #B5D4F4; box-shadow: none;
        }
        .dd-book-btn.outline:hover {
          background: #E6F1FB; border-color: #378ADD; transform: none;
        }
        .dd-book-note {
          font-size: 11px; color: #94A3B8; text-align: center;
          margin-top: 10px; line-height: 1.6;
        }

        /* ── ANIMATIONS ── */
        @keyframes ddFadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes ddPulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }

        /* ── TABLET (≤ 960px) ── */
        @media (max-width: 960px) {
          .dd-banner { height: 220px; }
          .dd-layout {
            grid-template-columns: 1fr;
            direction: rtl;
          }
          .dd-layout > * { direction: ltr; }
          .dd-booking-card {
            position: static;
            margin-bottom: 14px;
          }
        }

        /* ── MOBILE (≤ 640px) ── */
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
          .dd-doctor-avatar,
          .dd-doctor-avatar-placeholder {
            width: 64px; height: 64px; border-radius: 11px; font-size: 1.6rem;
          }
          .dd-doctor-name { font-size: 1.05rem; margin-bottom: 6px; }
          .dd-spec-badge  { font-size: 9px; margin-bottom: 3px; }
          .dd-pill        { font-size: 10px; padding: 3px 9px; }
          .dd-avail-pill  { font-size: 10px; padding: 3px 9px; }
          .dd-hospital-name { font-size: 11px; }

          .dd-stats-row { gap: 8px; margin-top: 10px; }
          .dd-stat-box  { padding: 11px 6px; border-radius: 10px; }
          .dd-stat-val  { font-size: 1.1rem; }
          .dd-stat-lbl  { font-size: 10px; }

          .dd-layout { gap: 0; margin-top: 12px; }

          .dd-block { padding: 14px; border-radius: 12px; margin-bottom: 10px; }
          .dd-block-title { font-size: 13px; margin-bottom: 10px; }
          .dd-block-title-icon { width: 24px; height: 24px; font-size: 11px; }

          .dd-date-row { gap: 6px; }
          .dd-date-chip { padding: 8px 9px; min-width: 46px; border-radius: 9px; }
          .dd-date-num  { font-size: 1rem; }
          .dd-date-day  { font-size: 8px; }
          .dd-date-month { font-size: 7px; }

          .dd-slots-grid { grid-template-columns: repeat(auto-fill, minmax(72px, 1fr)); gap: 6px; }
          .dd-slot { padding: 8px 3px 6px; font-size: 11px; }

          .dd-booking-card   { border-radius: 14px; }
          .dd-booking-header { padding: 13px 14px 11px; }
          .dd-booking-header-title { font-size: 14px; }
          .dd-booking-body   { padding: 12px 14px; }
          .dd-summary-row    { padding: 7px 0; font-size: 12px; }
          .dd-summary-label  { font-size: 12px; }
          .dd-summary-value  { font-size: 12px; }
          .dd-plan           { padding: 10px 11px; border-radius: 10px; }
          .dd-plan-name      { font-size: 12px; }
          .dd-plan-desc      { font-size: 10px; }
          .dd-plan-price     { font-size: 15px; }
          .dd-total-amount   { font-size: 1.25rem; }
          .dd-book-btn       { padding: 12px; font-size: 14px; }

          .dd-legend { gap: 10px; padding: 8px 10px; }
          .dd-legend-item { font-size: 10px; }
        }

        /* ── VERY SMALL (≤ 360px) ── */
        @media (max-width: 360px) {
          .dd-stats-row { grid-template-columns: repeat(3, 1fr); }
          .dd-stat-val  { font-size: 0.95rem; }
          .dd-stat-lbl  { font-size: 9px; }
          .dd-slots-grid { grid-template-columns: repeat(3, 1fr); }
          .dd-doctor-name { font-size: 0.95rem; }
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

        <div className="dd-wrap">

          {/* ── PROFILE ── */}
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
              <div className="dd-block">
                <div className="dd-block-title">
                  <div className="dd-block-title-icon">📅</div>
                  Select Date
                </div>
                <div className="dd-date-row">
                  {DAYS.map(day => (
                    <button
                      key={day.full}
                      className={`dd-date-chip ${selectedDate === day.full ? 'selected' : ''}`}
                      onClick={() => handleDateChange(day.full)}
                    >
                      <span className="dd-date-day">{day.label}</span>
                      <span className="dd-date-num">{day.num}</span>
                      <span className="dd-date-month">{day.month}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Slots */}
              <div className="dd-block">
                <div className="dd-block-title">
                  <div className="dd-block-title-icon">🕐</div>
                  Select Time Slot
                  {availLoading && (
                    <span style={{ marginLeft: 8, fontSize: 11, color: '#94A3B8', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 12, height: 12, border: '2px solid #B5D4F4', borderTopColor: '#185FA5', borderRadius: '50%', display: 'inline-block', animation: 'ddSpin 0.7s linear infinite' }} />
                      Checking availability…
                    </span>
                  )}
                  {selectedSlot && !availLoading && (
                    <span style={{ marginLeft:'auto', fontSize:12, color:'#185FA5', fontWeight:600 }}>
                      ✓ {selectedSlot}
                    </span>
                  )}
                </div>

                {/* Legend */}
                {slots.length > 0 && (
                  <div className="dd-legend">
                    <div className="dd-legend-item">
                      <div className="dd-legend-dot" style={{ background: '#E6F1FB', border: '1px solid #185FA5' }} />
                      Available
                    </div>
                    <div className="dd-legend-item">
                      <div className="dd-legend-dot" style={{ background: '#FFF8ED', border: '1px solid #F0A030' }} />
                      Filling up
                    </div>
                    <div className="dd-legend-item">
                      <div className="dd-legend-dot" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', textDecoration: 'line-through' }} />
                      Fully booked
                    </div>
                  </div>
                )}

                {slots.length === 0 ? (
                  <div className="dd-no-slots">No slots configured. Contact the hospital directly.</div>
                ) : (
                  <div className={availLoading ? 'dd-slots-loading' : ''}>
                    {am.length > 0 && (
                      <div className="dd-slot-section">
                        <div className="dd-slot-period">🌅 Morning</div>
                        <div className="dd-slots-grid">
                          {am.map(s => {
                            const state = slotState(s);
                            const sub   = slotSubtext(s);
                            const info  = slotAvail[s];
                            const pct   = info ? Math.min(100, (info.booked / info.max) * 100) : 0;
                            return (
                              <button
                                key={s}
                                className={`dd-slot ${state}`}
                                onClick={() => handleSlotClick(s)}
                                disabled={state === 'full'}
                                title={state === 'full' ? 'This slot is fully booked' : sub ? `${sub} slots remaining` : ''}
                              >
                                {state === 'full' && <span className="dd-slot-full-tag">Full</span>}
                                <span>{slotLabel(s)}</span>
                                {sub && state !== 'full' && (
                                  <span className="dd-slot-sub">{sub}</span>
                                )}
                                {(state === 'partial' || state === 'selected' || (state === 'available' && pct > 0)) && (
                                  <div className="dd-slot-bar">
                                    <div className="dd-slot-bar-fill" style={{ width: `${pct}%` }} />
                                  </div>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {pm.length > 0 && (
                      <div className="dd-slot-section">
                        <div className="dd-slot-period">🌇 Afternoon / Evening</div>
                        <div className="dd-slots-grid">
                          {pm.map(s => {
                            const state = slotState(s);
                            const sub   = slotSubtext(s);
                            const info  = slotAvail[s];
                            const pct   = info ? Math.min(100, (info.booked / info.max) * 100) : 0;
                            return (
                              <button
                                key={s}
                                className={`dd-slot ${state}`}
                                onClick={() => handleSlotClick(s)}
                                disabled={state === 'full'}
                                title={state === 'full' ? 'This slot is fully booked' : sub ? `${sub} slots remaining` : ''}
                              >
                                {state === 'full' && <span className="dd-slot-full-tag">Full</span>}
                                <span>{slotLabel(s)}</span>
                                {sub && state !== 'full' && (
                                  <span className="dd-slot-sub">{sub}</span>
                                )}
                                {(state === 'partial' || state === 'selected' || (state === 'available' && pct > 0)) && (
                                  <div className="dd-slot-bar">
                                    <div className="dd-slot-bar-fill" style={{ width: `${pct}%` }} />
                                  </div>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
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

                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize:10, fontWeight:600, letterSpacing:'1.2px', textTransform:'uppercase', color:'#94A3B8', marginBottom:10 }}>
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
                          <div className="dd-plan-radio">
                            <div className="dd-plan-radio-dot" />
                          </div>
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
                      disabled={!selectedSlot || !doctor.available || (selectedSlot && slotAvail[selectedSlot]?.full)}
                    >
                      {!doctor.available
                        ? '⛔ Doctor Unavailable'
                        : !selectedSlot
                        ? 'Select a Slot First'
                        : slotAvail[selectedSlot]?.full
                        ? '⛔ Slot is Full'
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

        <style>{`@keyframes ddSpin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </>
  );
}