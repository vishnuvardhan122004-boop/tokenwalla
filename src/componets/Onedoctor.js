import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import API from '../services/api';

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&display=swap');

  .od-wrap {
    font-family: 'DM Sans', sans-serif;
    background: #00133A;
    min-height: 100vh;
    color: white;
    padding-bottom: 120px;
  }

  /* BANNER */
  .od-banner {
    position: relative;
    height: 280px;
    overflow: hidden;
  }

  .od-banner-img {
    width: 100%; height: 100%;
    object-fit: cover;
    filter: brightness(0.4);
  }

  .od-banner-placeholder {
    width: 100%; height: 100%;
    background: linear-gradient(135deg, rgba(0,87,255,0.3), rgba(0,19,58,0.9));
    display: flex; align-items: center; justify-content: center;
    font-size: 5rem; opacity: 0.4;
  }

  .od-banner-overlay {
    position: absolute; inset: 0;
    background: linear-gradient(to bottom, transparent 0%, rgba(0,19,58,0.5) 60%, #00133A 100%);
  }

  .od-back {
    position: absolute;
    top: 16px; left: 16px;
    background: rgba(0,19,58,0.6);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 10px;
    padding: 8px 16px;
    font-size: 13px; color: rgba(255,255,255,0.8);
    cursor: pointer; transition: all 0.2s;
    z-index: 10; display: flex; align-items: center; gap: 6px;
    font-family: 'DM Sans', sans-serif;
  }
  .od-back:hover { background: rgba(0,87,255,0.25); color: white; }

  /* PROFILE CARD */
  .od-profile {
    position: relative;
    margin-top: -60px;
    z-index: 10;
    padding: 0 16px;
  }

  .od-profile-card {
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
  }

  .od-profile-card::before {
    content: '';
    position: absolute; top: 0; left: 0; right: 0; height: 2px;
    background: linear-gradient(90deg, #0057FF, #00D4FF, #00F5C4);
  }

  .od-avatar {
    width: 80px; height: 80px;
    border-radius: 16px;
    object-fit: cover;
    border: 2px solid rgba(0,212,255,0.3);
    flex-shrink: 0;
  }

  .od-avatar-placeholder {
    width: 80px; height: 80px;
    border-radius: 16px;
    background: rgba(0,87,255,0.2);
    display: flex; align-items: center; justify-content: center;
    font-size: 2rem; flex-shrink: 0;
  }

  .od-spec {
    font-size: 11px; font-weight: 600;
    letter-spacing: 2px; text-transform: uppercase;
    color: #00D4FF; margin-bottom: 4px;
  }

  .od-name {
    font-family: 'Syne', sans-serif;
    font-size: clamp(1.2rem, 4vw, 1.6rem);
    font-weight: 800; line-height: 1.1;
    margin-bottom: 10px;
  }

  .od-pills {
    display: flex; flex-wrap: wrap; gap: 6px;
    margin-bottom: 10px;
  }

  .od-pill {
    display: flex; align-items: center; gap: 4px;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 100px;
    padding: 4px 10px;
    font-size: 12px; color: rgba(255,255,255,0.6);
  }

  .od-avail {
    display: inline-flex; align-items: center; gap: 6px;
    border-radius: 100px; padding: 4px 12px;
    font-size: 12px; font-weight: 600;
  }
  .od-avail.yes { background: rgba(0,245,196,0.1); border: 1px solid rgba(0,245,196,0.3); color: #00F5C4; }
  .od-avail.no  { background: rgba(255,80,80,0.1);  border: 1px solid rgba(255,80,80,0.2);  color: #FF8080; }

  /* STATS */
  .od-stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    padding: 16px;
    margin-top: 8px;
  }

  .od-stat {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 14px;
    padding: 14px 10px;
    text-align: center;
  }

  .od-stat-val {
    font-family: 'Syne', sans-serif;
    font-size: 1.3rem; font-weight: 800;
    background: linear-gradient(135deg, #00D4FF, #00F5C4);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .od-stat-lbl {
    font-size: 11px; color: rgba(255,255,255,0.4); margin-top: 2px;
  }

  /* SECTION BLOCK */
  .od-block {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 18px;
    padding: 20px;
    margin: 0 16px 16px;
  }

  .od-block-title {
    font-family: 'Syne', sans-serif;
    font-size: 0.95rem; font-weight: 700;
    margin-bottom: 16px;
    display: flex; align-items: center; gap: 8px;
    color: rgba(255,255,255,0.85);
  }

  .od-block-icon {
    width: 30px; height: 30px; border-radius: 8px;
    background: rgba(0,87,255,0.15);
    display: flex; align-items: center; justify-content: center;
    font-size: 14px;
  }

  /* SLOTS */
  .od-slots-grid {
    display: flex; flex-wrap: wrap; gap: 8px;
  }

  .od-slot {
    padding: 8px 14px;
    border-radius: 10px;
    border: 1px solid rgba(255,255,255,0.1);
    background: transparent;
    color: rgba(255,255,255,0.6);
    font-size: 13px; font-family: 'DM Sans', sans-serif;
    cursor: pointer; transition: all 0.2s;
  }

  .od-slot:hover {
    border-color: rgba(0,212,255,0.4);
    color: white; background: rgba(0,212,255,0.08);
  }

  .od-slot.selected {
    background: rgba(0,87,255,0.25);
    border-color: rgba(0,87,255,0.6);
    color: white; font-weight: 600;
  }

  .od-slot-period {
    font-size: 11px; font-weight: 600;
    letter-spacing: 1.5px; text-transform: uppercase;
    color: rgba(255,255,255,0.3); margin-bottom: 10px; margin-top: 4px;
  }

  /* DATE INPUT */
  .od-date-input {
    width: 100%;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 12px;
    padding: 12px 16px;
    color: white;
    font-family: 'DM Sans', sans-serif;
    font-size: 15px;
    outline: none;
    transition: all 0.2s;
    color-scheme: dark;
  }

  .od-date-input:focus {
    border-color: rgba(0,87,255,0.5);
    background: rgba(0,87,255,0.07);
    box-shadow: 0 0 0 3px rgba(0,87,255,0.12);
  }

  /* BOOKING SUMMARY */
  .od-summary-row {
    display: flex; justify-content: space-between; align-items: center;
    padding: 10px 0;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    font-size: 14px;
  }
  .od-summary-row:last-child { border-bottom: none; }
  .od-summary-label { color: rgba(255,255,255,0.45); }
  .od-summary-value { color: white; font-weight: 500; }
  .od-summary-value.empty { color: rgba(255,255,255,0.2); font-style: italic; }

  .od-total {
    display: flex; justify-content: space-between; align-items: center;
    padding: 14px 0 0;
    margin-top: 4px;
    border-top: 1px solid rgba(255,255,255,0.1);
  }

  .od-total-label { font-size: 15px; font-weight: 600; color: rgba(255,255,255,0.7); }

  .od-total-amount {
    font-family: 'Syne', sans-serif;
    font-size: 1.6rem; font-weight: 800;
    background: linear-gradient(135deg, #00D4FF, #00F5C4);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  /* BOOK BUTTON */
  .od-book-btn {
    width: 100%;
    padding: 16px;
    border-radius: 14px; border: none;
    background: linear-gradient(135deg, #0057FF, #0040CC);
    color: white;
    font-family: 'DM Sans', sans-serif;
    font-size: 16px; font-weight: 600;
    cursor: pointer; transition: all 0.25s;
    box-shadow: 0 6px 24px rgba(0,87,255,0.3);
    margin-top: 16px;
  }

  .od-book-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 12px 32px rgba(0,87,255,0.45);
  }

  .od-book-btn:disabled {
    opacity: 0.5; cursor: not-allowed; transform: none;
  }

  .od-book-note {
    text-align: center; font-size: 12px;
    color: rgba(255,255,255,0.25); margin-top: 10px; line-height: 1.6;
  }

  /* UNAVAILABLE */
  .od-unavail {
    background: rgba(255,80,80,0.08);
    border: 1px solid rgba(255,80,80,0.2);
    border-radius: 12px; padding: 16px;
    text-align: center; color: #FF8080; font-size: 14px;
  }

  /* DESKTOP LAYOUT */
  @media (min-width: 900px) {
    .od-banner { height: 340px; }
    .od-profile { padding: 0 32px; margin-top: -80px; }
    .od-profile-card { padding: 28px 32px; gap: 24px; }
    .od-avatar { width: 100px; height: 100px; }
    .od-avatar-placeholder { width: 100px; height: 100px; font-size: 3rem; }
    .od-stats { grid-template-columns: repeat(4, 1fr); padding: 20px 32px; }
    .od-block { margin: 0 32px 20px; padding: 24px; }
    .od-layout {
      display: grid;
      grid-template-columns: 1fr 360px;
      gap: 24px;
      padding: 0 32px;
      align-items: start;
    }
    .od-layout .od-block { margin: 0 0 20px; }
    .od-sidebar { position: sticky; top: 88px; }
  }

  @media (max-width: 899px) {
    .od-stats { grid-template-columns: repeat(2, 1fr); }
    .od-layout { display: flex; flex-direction: column; }
    .od-name { font-size: 1.2rem; }
  }

  /* SPINNER */
  .od-spinner {
    display: flex; align-items: center; justify-content: center;
    min-height: 60vh;
  }

  .od-spin {
    width: 40px; height: 40px;
    border: 3px solid rgba(255,255,255,0.1);
    border-top-color: #00D4FF;
    border-radius: 50%;
    animation: odSpin 0.8s linear infinite;
  }

  @keyframes odSpin { to { transform: rotate(360deg); } }
`;

const Onedoctor = () => {
  const { id }    = useParams();
  const navigate  = useNavigate();
  const [doctor,  setDoctor]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [slot,    setSlot]    = useState('');
  const [date,    setDate]    = useState('');
  const [booking, setBooking] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    API.get(`/doctors/${id}/`)
      .then(({ data }) => setDoctor(data))
      .catch(() => { alert('Doctor not found'); navigate('/alldoctor'); })
      .finally(() => setLoading(false));
  }, [id, navigate]);

  const handleBook = () => {
    const user = localStorage.getItem('user');
    if (!user) { alert('Please login to book'); navigate('/login'); return; }
    if (!date) { alert('Select a date'); return; }
    if (!slot) { alert('Select a time slot'); return; }
    navigate('/payment', {
      state: {
        doctorId:   doctor.id,
        doctorName: doctor.name,
        hospital:   doctor.hospital_name,
        date,
        slot,
        fee:        doctor.fee,
      }
    });
  };

  if (loading) return (
    <>
      <style>{css}</style>
      <div className="od-wrap">
        <div className="od-spinner"><div className="od-spin" /></div>
      </div>
    </>
  );

  if (!doctor) return null;

  const slots    = doctor.slots || [];
  const amSlots  = slots.filter(s => s.includes('AM'));
  const pmSlots  = slots.filter(s => s.includes('PM'));

  return (
    <>
      <style>{css}</style>
      <div className="od-wrap">

        {/* Banner */}
        <div className="od-banner">
          {doctor.hospital_image
            ? <img src={doctor.hospital_image} alt="Hospital" className="od-banner-img" />
            : <div className="od-banner-placeholder">🏥</div>
          }
          <div className="od-banner-overlay" />
          <button className="od-back" onClick={() => navigate(-1)}>
            ← Back
          </button>
        </div>

        {/* Profile Card */}
        <div className="od-profile">
          <div className="od-profile-card">
            {doctor.image
              ? <img src={doctor.image} alt={doctor.name} className="od-avatar" />
              : <div className="od-avatar-placeholder">👨‍⚕️</div>
            }
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="od-spec">{doctor.specialization}</div>
              <div className="od-name">Dr. {doctor.name}</div>
              <div className="od-pills">
                <div className="od-pill">📍 {doctor.city}</div>
                <div className="od-pill">⏳ {doctor.experience} yrs</div>
                <div className="od-pill">📞 {doctor.mobile}</div>
              </div>
              <div className={`od-avail ${doctor.available ? 'yes' : 'no'}`}>
                <span style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: 'currentColor', display: 'inline-block',
                  animation: doctor.available ? 'odPulse 2s infinite' : 'none'
                }} />
                {doctor.available ? 'Available Today' : 'Unavailable'}
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="od-stats">
          {[
            { val: `${doctor.experience}+`, lbl: 'Years Exp' },
            { val: `₹${doctor.fee}`,        lbl: 'Fee' },
            { val: slots.length,             lbl: 'Daily Slots' },
            { val: doctor.max_per_slot || 10, lbl: 'Per Slot' },
          ].map(({ val, lbl }) => (
            <div key={lbl} className="od-stat">
              <div className="od-stat-val">{val}</div>
              <div className="od-stat-lbl">{lbl}</div>
            </div>
          ))}
        </div>

        {/* Main Layout */}
        <div className="od-layout">

          {/* Left — About + Slots + Date */}
          <div>

            {/* About */}
            <div className="od-block">
              <div className="od-block-title">
                <div className="od-block-icon">👨‍⚕️</div>
                About the Doctor
              </div>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, margin: 0 }}>
                Dr. {doctor.name} is a specialist in {doctor.specialization} with {doctor.experience} years
                of experience at {doctor.hospital_name}, {doctor.city}. Book an appointment online
                and receive a token for hassle-free queue management.
              </p>
            </div>

            {/* Date Picker */}
            <div className="od-block">
              <div className="od-block-title">
                <div className="od-block-icon">📅</div>
                Select Date
              </div>
              <input
                type="date"
                className="od-date-input"
                min={today}
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            </div>

            {/* Slots */}
            <div className="od-block">
              <div className="od-block-title">
                <div className="od-block-icon">🕐</div>
                Select Time Slot
                {slot && (
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: '#00D4FF', fontWeight: 500 }}>
                    ✓ {slot}
                  </span>
                )}
              </div>

              {slots.length === 0 ? (
                <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14, textAlign: 'center', margin: 0 }}>
                  No slots configured. Contact the hospital directly.
                </p>
              ) : (
                <>
                  {amSlots.length > 0 && (
                    <>
                      <div className="od-slot-period">🌅 Morning</div>
                      <div className="od-slots-grid" style={{ marginBottom: 16 }}>
                        {amSlots.map(s => (
                          <button key={s} className={`od-slot ${slot === s ? 'selected' : ''}`}
                            onClick={() => setSlot(s)}>{s}</button>
                        ))}
                      </div>
                    </>
                  )}
                  {pmSlots.length > 0 && (
                    <>
                      <div className="od-slot-period">🌇 Afternoon / Evening</div>
                      <div className="od-slots-grid">
                        {pmSlots.map(s => (
                          <button key={s} className={`od-slot ${slot === s ? 'selected' : ''}`}
                            onClick={() => setSlot(s)}>{s}</button>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

          </div>

          {/* Right — Booking sidebar */}
          <div className="od-sidebar">
            <div className="od-block">
              <div className="od-block-title">
                <div className="od-block-icon">💳</div>
                Book Appointment
              </div>

              {!doctor.available ? (
                <div className="od-unavail">
                  ❌ This doctor is currently unavailable for bookings.
                </div>
              ) : (
                <>
                  <div className="od-summary-row">
                    <span className="od-summary-label">Doctor</span>
                    <span className="od-summary-value">Dr. {doctor.name}</span>
                  </div>
                  <div className="od-summary-row">
                    <span className="od-summary-label">Date</span>
                    <span className={`od-summary-value ${!date ? 'empty' : ''}`}>
                      {date || 'Not selected'}
                    </span>
                  </div>
                  <div className="od-summary-row">
                    <span className="od-summary-label">Slot</span>
                    <span className={`od-summary-value ${!slot ? 'empty' : ''}`}>
                      {slot || 'Not selected'}
                    </span>
                  </div>
                  <div className="od-summary-row">
                    <span className="od-summary-label">Consultation Fee</span>
                    <span className="od-summary-value">₹{doctor.fee}</span>
                  </div>
                  <div className="od-total">
                    <span className="od-total-label">Total</span>
                    <span className="od-total-amount">₹{doctor.fee}</span>
                  </div>

                  <button
                    className="od-book-btn"
                    onClick={handleBook}
                    disabled={booking || !date || !slot}
                  >
                    {booking
                      ? 'Processing...'
                      : !date || !slot
                      ? 'Select Date & Slot'
                      : `💳 Pay ₹${doctor.fee} & Book`}
                  </button>

                  <p className="od-book-note">
                    You'll receive a token after payment<br />
                    Secured booking · Instant confirmation
                  </p>
                </>
              )}
            </div>
          </div>

        </div>
      </div>
    </>
  );
};

export default Onedoctor;