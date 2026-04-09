import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import API from '../services/api';

function getNext7Days() {
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return {
      label: i === 0 ? 'Today' : days[d.getDay()],
      num: d.getDate(),
      month: months[d.getMonth()],
      full: d.toISOString().split('T')[0],
    };
  });
}

const DAYS = getNext7Days();

const PLANS = [
  { key: 'queue', name: 'Queue View', desc: 'Token + live queue tracking', price: 15, fee: 1500 }
];

export default function DoctorDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [doctor, setDoctor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  const [selectedDate, setSelectedDate] = useState(DAYS[0].full);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [selectedPlan] = useState('queue');

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (stored) {
      try { setUser(JSON.parse(stored)); } catch {}
    }
  }, []);

  useEffect(() => {
    API.get(`/doctors/${id}/`)
      .then(({ data }) => setDoctor(data))
      .catch(() => navigate('/alldoctor'))
      .finally(() => setLoading(false));
  }, [id, navigate]);

  const handleBook = () => {
    if (!user) return navigate('/login');
    if (!selectedSlot) return alert('Select slot');

    const plan = PLANS[0];

    navigate('/payment', {
      state: {
        doctorId: doctor.id,
        doctorName: doctor.name,
        hospital: doctor.hospital_name,
        date: selectedDate,
        slot: selectedSlot,
        fee: plan.price,
        amount: plan.fee
      }
    });
  };

  const slots = doctor?.slots || [];
  const am = slots.filter(s => s.includes('AM'));
  const pm = slots.filter(s => s.includes('PM'));
  const plan = PLANS[0];

  /* ── LOADING ── */
  if (loading) {
    return (
      <div style={{ padding: 20 }}>
        <h2>Loading Doctor...</h2>
      </div>
    );
  }

  if (!doctor) return null;

  return (
    <>
      <style>{`
        body { margin: 0; font-family: sans-serif; }
        .dd-root { background: #F4F9FF; min-height: 100vh; }

        .dd-banner {
          height: 200px;
          background: #E6F1FB;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 3rem;
        }

        .dd-wrap { max-width: 1100px; margin: auto; padding: 16px; }

        .dd-card {
          background: white;
          padding: 16px;
          border-radius: 12px;
          margin-top: -40px;
        }

        .dd-layout {
          display: grid;
          grid-template-columns: 1fr 300px;
          gap: 20px;
          margin-top: 20px;
        }

        .dd-slot {
          padding: 8px;
          border: 1px solid #ccc;
          margin: 4px;
          cursor: pointer;
        }

        .dd-slot.selected {
          background: #185FA5;
          color: white;
        }

        .dd-book {
          padding: 12px;
          background: #185FA5;
          color: white;
          border: none;
          width: 100%;
          cursor: pointer;
        }

        /* Sticky mobile bar */
        .dd-sticky {
          display: none;
        }

        @media(max-width:640px){
          .dd-layout { grid-template-columns: 1fr; }

          .dd-sticky {
            display: flex;
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            background: white;
            border-top: 1px solid #ccc;
            padding: 10px;
            justify-content: space-between;
          }
        }
      `}</style>

      <div className="dd-root">

        <div className="dd-banner">🏥</div>

        <div className="dd-wrap">
          <div className="dd-card">
            <h2>Dr. {doctor.name}</h2>
            <p>{doctor.specialization}</p>
            <p>{doctor.hospital_name}</p>
          </div>

          <div className="dd-layout">

            {/* LEFT */}
            <div>
              <h3>Select Slot</h3>

              <div>
                {am.map(s => (
                  <button
                    key={s}
                    className={`dd-slot ${selectedSlot===s?'selected':''}`}
                    onClick={() => setSelectedSlot(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>

              <div>
                {pm.map(s => (
                  <button
                    key={s}
                    className={`dd-slot ${selectedSlot===s?'selected':''}`}
                    onClick={() => setSelectedSlot(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* RIGHT */}
            <div>
              <h3>Booking</h3>
              <p>Slot: {selectedSlot || 'Not selected'}</p>
              <p>Price: ₹{plan.price}</p>

              <button className="dd-book" onClick={handleBook}>
                Book Now
              </button>
            </div>

          </div>
        </div>

        {/* MOBILE STICKY */}
        <div className="dd-sticky">
          <span>{selectedSlot || 'Pick slot'}</span>
          <button onClick={handleBook}>Pay ₹{plan.price}</button>
        </div>

      </div>
    </>
  );
}