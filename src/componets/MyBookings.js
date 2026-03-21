import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router';
import API from '../services/api';

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&display=swap');

  .mb-wrap {
    font-family: 'DM Sans', sans-serif;
    background: #00133A;
    min-height: 100vh;
    color: #fff;
    padding-bottom: 80px;
  }

  .mb-header {
    position: relative;
    padding: 60px 0 48px;
    overflow: hidden;
  }

  .mb-header-bg {
    position: absolute; inset: 0;
    background:
      radial-gradient(ellipse 60% 80% at 20% 50%, rgba(0,87,255,0.15) 0%, transparent 60%),
      radial-gradient(ellipse 40% 50% at 80% 30%, rgba(0,212,255,0.08) 0%, transparent 50%);
  }

  .mb-grid {
    position: absolute; inset: 0;
    background-image:
      linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
    background-size: 60px 60px;
  }

  .mb-header-label {
    font-size: 11px; font-weight: 600;
    letter-spacing: 3px; text-transform: uppercase;
    color: #00D4FF; margin-bottom: 10px;
    animation: mbFadeUp 0.5s ease both;
  }

  .mb-header-title {
    font-family: 'Syne', sans-serif;
    font-size: clamp(1.8rem, 4vw, 2.8rem);
    font-weight: 800; line-height: 1.1;
    margin-bottom: 8px;
    animation: mbFadeUp 0.5s 0.05s ease both;
  }

  .mb-header-title span {
    background: linear-gradient(135deg, #00D4FF, #00F5C4);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .mb-header-sub {
    font-size: 15px; color: rgba(255,255,255,0.4);
    animation: mbFadeUp 0.5s 0.1s ease both;
  }

  .mb-tabs {
    display: flex; gap: 4px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 14px;
    padding: 4px;
    width: fit-content;
    margin-bottom: 36px;
  }

  .mb-tab {
    padding: 9px 22px;
    border-radius: 10px;
    font-size: 14px; font-weight: 500;
    border: none; background: none;
    color: rgba(255,255,255,0.45);
    cursor: pointer; transition: all 0.2s;
    font-family: 'DM Sans', sans-serif;
    white-space: nowrap;
  }

  .mb-tab.active {
    background: rgba(0,87,255,0.25);
    color: #00D4FF;
    border: 1px solid rgba(0,87,255,0.35);
  }

  .mb-tab:hover:not(.active) { color: white; background: rgba(255,255,255,0.05); }

  .mb-card-list { display: flex; flex-direction: column; gap: 20px; }

  .mb-card {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 22px;
    overflow: hidden;
    transition: border-color 0.3s;
    animation: mbFadeUp 0.5s ease both;
  }

  .mb-card:hover { border-color: rgba(0,87,255,0.25); }

  .mb-card-top { display: flex; align-items: stretch; }

  .mb-token-col {
    width: 120px; flex-shrink: 0;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    padding: 24px 16px;
    border-right: 1px solid rgba(255,255,255,0.06);
    position: relative; overflow: hidden;
  }

  .mb-token-col::before {
    content: '';
    position: absolute; inset: 0;
    background: linear-gradient(135deg, rgba(0,87,255,0.12), rgba(0,212,255,0.06));
  }

  .mb-token-label {
    font-size: 10px; font-weight: 600;
    letter-spacing: 2px; text-transform: uppercase;
    color: rgba(255,255,255,0.3); margin-bottom: 6px; position: relative;
  }

  .mb-token-num {
    font-family: 'Syne', sans-serif;
    font-size: 1.5rem; font-weight: 800;
    background: linear-gradient(135deg, #00D4FF, #00F5C4);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    background-clip: text; line-height: 1;
    position: relative; text-align: center; word-break: break-all;
  }

  .mb-info-col { flex: 1; padding: 20px 24px; min-width: 0; }

  .mb-card-status {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 4px 12px; border-radius: 100px;
    font-size: 11px; font-weight: 600; margin-bottom: 10px;
  }

  .mb-status-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
  .mb-status-dot.pulse { animation: mbPulse 2s infinite; }

  .status-waiting    { background: rgba(255,180,0,0.12);  border: 1px solid rgba(255,180,0,0.3);  color: #FFB400; }
  .status-inprogress { background: rgba(0,212,255,0.12);  border: 1px solid rgba(0,212,255,0.3);  color: #00D4FF; }
  .status-completed  { background: rgba(0,245,196,0.12);  border: 1px solid rgba(0,245,196,0.3);  color: #00F5C4; }
  .status-cancelled  { background: rgba(255,80,80,0.1);   border: 1px solid rgba(255,80,80,0.2);  color: #FF8080; }

  .mb-card-doctor {
    font-family: 'Syne', sans-serif;
    font-size: 1.1rem; font-weight: 700; margin-bottom: 4px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  .mb-card-hospital {
    font-size: 13px; color: rgba(255,255,255,0.45); margin-bottom: 12px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  .mb-card-meta { display: flex; flex-wrap: wrap; gap: 16px; }

  .mb-meta-chip { display: flex; align-items: center; gap: 6px; font-size: 13px; color: rgba(255,255,255,0.5); }

  .mb-meta-icon {
    width: 24px; height: 24px; border-radius: 6px;
    background: rgba(255,255,255,0.06);
    display: flex; align-items: center; justify-content: center;
    font-size: 12px; flex-shrink: 0;
  }

  .mb-amount-badge {
    display: inline-flex; align-items: center; gap: 6px;
    background: rgba(0,87,255,0.1); border: 1px solid rgba(0,87,255,0.2);
    border-radius: 8px; padding: 5px 12px;
    font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.6);
  }

  /* QUEUE PANEL */
  .mb-queue-panel {
    border-top: 1px solid rgba(255,255,255,0.06);
    padding: 16px 24px;
    display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
    background: rgba(0,212,255,0.04);
  }

  .mb-queue-position { display: flex; align-items: center; gap: 12px; flex: 1; }

  .mb-queue-num-wrap { position: relative; width: 52px; height: 52px; flex-shrink: 0; }

  .mb-queue-circle {
    width: 52px; height: 52px; border-radius: 50%;
    background: rgba(0,212,255,0.1); border: 2px solid rgba(0,212,255,0.3);
    display: flex; align-items: center; justify-content: center;
    font-family: 'Syne', sans-serif; font-size: 1.2rem; font-weight: 800; color: #00D4FF;
  }

  .mb-queue-ring {
    position: absolute; inset: -4px; border-radius: 50%;
    border: 2px solid rgba(0,212,255,0.15);
    animation: mbRing 2s ease-in-out infinite;
  }

  .mb-queue-label { font-size: 12px; color: rgba(255,255,255,0.35); margin-bottom: 2px; }
  .mb-queue-desc  { font-size: 14px; font-weight: 500; color: #00D4FF; }

  /* RESCHEDULE PANEL */
  .mb-reschedule-panel {
    border-top: 1px solid rgba(255,255,255,0.06);
    padding: 14px 20px;
    display: flex; align-items: center; justify-content: space-between;
    gap: 12px; flex-wrap: wrap;
    background: rgba(0,87,255,0.03);
  }

  .mb-cancel-panel {
    border-top: 1px solid rgba(255,255,255,0.06);
    padding: 14px 20px;
    display: flex; align-items: center; justify-content: space-between;
    gap: 12px; flex-wrap: wrap;
    background: rgba(255,80,80,0.02);
  }

  .mb-cancel-info { flex: 1; }

  .mb-cancel-title {
    font-size: 14px; font-weight: 600; margin-bottom: 2px;
    color: rgba(255,255,255,0.7);
  }

  .mb-cancel-desc { font-size: 12px; color: rgba(255,255,255,0.3); }

  .mb-cancel-btn {
    display: inline-flex; align-items: center; gap: 6px;
    background: rgba(255,80,80,0.1);
    border: 1px solid rgba(255,80,80,0.3);
    border-radius: 10px; padding: 9px 18px;
    font-family: 'DM Sans', sans-serif;
    font-size: 13px; font-weight: 600;
    color: #FF8080; cursor: pointer; transition: all 0.2s; white-space: nowrap;
  }

  .mb-cancel-btn:hover {
    background: rgba(255,80,80,0.2);
    border-color: rgba(255,80,80,0.5);
    color: #FF6060; transform: translateY(-1px);
  }

  .mb-cancel-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

  .mb-reschedule-info { flex: 1; }

  .mb-reschedule-title {
    font-size: 14px; font-weight: 600; margin-bottom: 2px;
    color: rgba(255,255,255,0.8);
  }

  .mb-reschedule-desc { font-size: 12px; color: rgba(255,255,255,0.35); }

  .mb-reschedule-btn {
    display: inline-flex; align-items: center; gap: 8px;
    background: rgba(0,87,255,0.15);
    border: 1px solid rgba(0,87,255,0.35);
    border-radius: 10px; padding: 10px 20px;
    font-family: 'DM Sans', sans-serif;
    font-size: 13px; font-weight: 600;
    color: #00D4FF; cursor: pointer; transition: all 0.2s; white-space: nowrap;
  }

  .mb-reschedule-btn:hover {
    background: rgba(0,87,255,0.25); border-color: rgba(0,87,255,0.55);
    transform: translateY(-1px); box-shadow: 0 6px 20px rgba(0,87,255,0.2);
  }

  .mb-reschedule-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

  /* RESCHEDULE MODAL */
  .mb-modal-overlay {
    position: fixed; inset: 0; z-index: 2000;
    background: rgba(0,0,0,0.7);
    backdrop-filter: blur(8px);
    display: flex; align-items: center; justify-content: center;
    padding: 16px;
    animation: mbFadeIn 0.2s ease both;
  }

  .mb-modal {
    background: #001030;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 24px;
    padding: 28px;
    width: 100%; max-width: 480px;
    position: relative;
    animation: mbSlideUp 0.3s cubic-bezier(0.34,1.56,0.64,1) both;
  }

  .mb-modal::before {
    content: '';
    position: absolute; top: 0; left: 0; right: 0; height: 2px;
    background: linear-gradient(90deg, #0057FF, #00D4FF, #00F5C4);
    border-radius: 24px 24px 0 0;
  }

  .mb-modal-title {
    font-family: 'Syne', sans-serif;
    font-size: 1.2rem; font-weight: 800; margin-bottom: 4px;
  }

  .mb-modal-sub { font-size: 13px; color: rgba(255,255,255,0.4); margin-bottom: 24px; }

  .mb-modal-label {
    font-size: 12px; font-weight: 600; letter-spacing: 0.5px;
    color: rgba(255,255,255,0.5); margin-bottom: 8px; display: block;
  }

  .mb-modal-input {
    width: 100%;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 12px; padding: 12px 16px;
    color: white; font-family: 'DM Sans', sans-serif;
    font-size: 15px; outline: none; transition: all 0.2s;
    color-scheme: dark; margin-bottom: 18px;
  }

  .mb-modal-input:focus {
    border-color: rgba(0,87,255,0.5);
    background: rgba(0,87,255,0.07);
    box-shadow: 0 0 0 3px rgba(0,87,255,0.12);
  }

  .mb-slots-grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
    gap: 8px; margin-bottom: 20px; max-height: 200px;
    overflow-y: auto; padding-right: 4px;
  }

  .mb-slot-btn {
    padding: 9px 6px; border-radius: 10px;
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.03);
    font-size: 12px; font-weight: 500;
    color: rgba(255,255,255,0.6);
    cursor: pointer; transition: all 0.2s; text-align: center;
    font-family: 'DM Sans', sans-serif;
  }

  .mb-slot-btn:hover { background: rgba(0,87,255,0.1); border-color: rgba(0,87,255,0.35); color: white; }

  .mb-slot-btn.selected {
    background: rgba(0,87,255,0.22); border-color: #0057FF;
    color: #00D4FF; font-weight: 600;
  }

  .mb-modal-actions { display: flex; gap: 10px; margin-top: 4px; }

  .mb-modal-cancel {
    flex: 1; padding: 13px;
    border-radius: 12px; border: 1px solid rgba(255,255,255,0.1);
    background: rgba(255,255,255,0.05);
    color: rgba(255,255,255,0.6);
    font-family: 'DM Sans', sans-serif; font-size: 14px; font-weight: 500;
    cursor: pointer; transition: all 0.2s;
  }

  .mb-modal-cancel:hover { background: rgba(255,255,255,0.08); color: white; }

  .mb-modal-confirm {
    flex: 2; padding: 13px;
    border-radius: 12px; border: none;
    background: linear-gradient(135deg, #0057FF, #0040CC);
    color: white; font-family: 'DM Sans', sans-serif;
    font-size: 14px; font-weight: 600;
    cursor: pointer; transition: all 0.2s;
    box-shadow: 0 4px 16px rgba(0,87,255,0.3);
  }

  .mb-modal-confirm:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(0,87,255,0.4); }
  .mb-modal-confirm:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

  /* EMPTY */
  .mb-empty { text-align: center; padding: 80px 20px; }

  .mb-empty-icon { font-size: 4.5rem; margin-bottom: 20px; display: block; opacity: 0.5; }

  .mb-empty-title {
    font-family: 'Syne', sans-serif; font-size: 1.5rem; font-weight: 700;
    margin-bottom: 10px; color: rgba(255,255,255,0.6);
  }

  .mb-empty-sub { color: rgba(255,255,255,0.3); font-size: 15px; margin-bottom: 28px; }

  .mb-find-btn {
    display: inline-flex; align-items: center; gap: 8px;
    background: linear-gradient(135deg, #0057FF, #0040CC);
    color: white; border: none; border-radius: 14px; padding: 14px 32px;
    font-family: 'DM Sans', sans-serif; font-size: 15px; font-weight: 500;
    cursor: pointer; text-decoration: none; transition: all 0.25s;
    box-shadow: 0 6px 24px rgba(0,87,255,0.3);
  }

  .mb-find-btn:hover { transform: translateY(-2px); box-shadow: 0 12px 32px rgba(0,87,255,0.45); color: white; text-decoration: none; }

  /* SKELETON */
  .mb-skel { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06); border-radius: 22px; overflow: hidden; height: 140px; }

  .mb-skel-shine {
    height: 100%;
    background: linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.07) 50%, rgba(255,255,255,0.03) 75%);
    background-size: 200% 100%; animation: mbShimmer 1.4s infinite;
  }

  .mb-refresh-btn {
    display: flex; align-items: center; gap: 8px;
    background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
    border-radius: 10px; padding: 8px 16px;
    font-family: 'DM Sans', sans-serif; font-size: 13px; color: rgba(255,255,255,0.5);
    cursor: pointer; transition: all 0.2s;
  }

  .mb-refresh-btn:hover { background: rgba(255,255,255,0.08); color: white; }
  .mb-refresh-btn.spinning svg { animation: mbSpin 1s linear infinite; }

  @keyframes mbFadeUp   { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes mbFadeIn   { from { opacity: 0; } to { opacity: 1; } }
  @keyframes mbSlideUp  { from { opacity: 0; transform: translateY(30px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
  @keyframes mbPulse    { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
  @keyframes mbRing     { 0% { transform: scale(1); opacity: 0.6; } 100% { transform: scale(1.5); opacity: 0; } }
  @keyframes mbShimmer  { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
  @keyframes mbSpin     { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

  @media (max-width: 600px) {
    .mb-token-col { width: 86px; padding: 16px 10px; }
    .mb-info-col  { padding: 14px; }
    .mb-card-doctor { font-size: 0.95rem; }
    .mb-queue-panel, .mb-reschedule-panel { padding: 12px 14px; }
    .mb-modal { padding: 22px 18px; }
  }
`;

const STATUS_MAP = {
  waiting:     { label: 'Waiting',          cls: 'status-waiting',    pulse: true  },
  in_progress: { label: 'In Consultation',  cls: 'status-inprogress', pulse: true  },
  completed:   { label: 'Completed',        cls: 'status-completed',  pulse: false },
  cancelled:   { label: 'Cancelled',        cls: 'status-cancelled',  pulse: false },
};

const TABS = [
  { key: 'all',       label: 'All'       },
  { key: 'active',    label: 'Active'    },
  { key: 'completed', label: 'Completed' },
];

function filterBookings(bookings, tab) {
  if (tab === 'active')    return bookings.filter(b => b.status === 'waiting' || b.status === 'in_progress');
  if (tab === 'completed') return bookings.filter(b => b.status === 'completed' || b.status === 'cancelled');
  return bookings;
}

const today = new Date().toISOString().split('T')[0];

export default function MyBookings() {
  const navigate = useNavigate();

  const [user,       setUser]       = useState(null);
  const [bookings,   setBookings]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab,        setTab]        = useState('all');
  const [cancelling, setCancelling] = useState(null); // booking id being cancelled

  // Reschedule modal state
  const [rescheduleBooking, setRescheduleBooking] = useState(null);
  const [newDate,           setNewDate]           = useState('');
  const [newSlot,           setNewSlot]           = useState('');
  const [rescheduling,      setRescheduling]      = useState(false);
  const [doctorSlots,       setDoctorSlots]       = useState([]);

  // Auth check
  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (!stored) { navigate('/login'); return; }
    try { setUser(JSON.parse(stored)); } catch { navigate('/login'); }
  }, [navigate]);

  const fetchBookings = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const { data } = await API.get('/bookings/my/');
      setBookings(data);
    } catch {
      if (!silent) alert('Failed to load bookings');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchBookings(); }, [fetchBookings]);

  // Auto-refresh active bookings every 15s
  useEffect(() => {
    const hasActive = bookings.some(b => b.status === 'waiting' || b.status === 'in_progress');
    if (!hasActive) return;
    const t = setInterval(() => fetchBookings(true), 15000);
    return () => clearInterval(t);
  }, [bookings, fetchBookings]);

  // Cancel booking
  const handleCancel = async (booking) => {
    if (!window.confirm(`Cancel appointment with Dr. ${booking.doctor_name}?\n\nThis cannot be undone.`)) return;
    setCancelling(booking.id);
    try {
      await API.patch(`/bookings/cancel/${booking.id}/`);
      await fetchBookings(true);
    } catch (err) {
      alert(err?.response?.data?.message || 'Failed to cancel booking.');
    } finally {
      setCancelling(null);
    }
  };

  // Open reschedule modal — load doctor slots
  const openReschedule = async (booking) => {
    setRescheduleBooking(booking);
    setNewDate('');
    setNewSlot('');
    try {
      const { data } = await API.get(`/doctors/${booking.doctor}/`);
      setDoctorSlots(data.slots || []);
    } catch {
      setDoctorSlots([]);
    }
  };

  const closeReschedule = () => {
    setRescheduleBooking(null);
    setNewDate('');
    setNewSlot('');
    setDoctorSlots([]);
  };

  // Load Razorpay script
  const loadScript = () => new Promise((resolve) => {
    if (document.getElementById('razorpay-script')) return resolve(true);
    const s = document.createElement('script');
    s.id = 'razorpay-script';
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload  = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });

  // Submit reschedule — ₹5 payment via Razorpay first
  const handleReschedule = async () => {
    if (!newDate) { alert('Please select a new date'); return; }
    if (!newSlot) { alert('Please select a new time slot'); return; }
    setRescheduling(true);

    try {
      const ready = await loadScript();
      if (!ready) { alert('Razorpay failed to load. Check internet.'); setRescheduling(false); return; }

      // Create Razorpay order for ₹5 (500 paise)
      const { data: order } = await API.post('/payment/create-order/', {
        amount: 500,
        currency: 'INR',
        notes: { bookingId: rescheduleBooking.id, type: 'reschedule' },
      });

      const options = {
        key:         process.env.REACT_APP_RAZORPAY_KEY_ID || 'rzp_test_XXXXXXXXXXXXXXXX',
        amount:      order.amount,
        currency:    order.currency,
        name:        'TokenWalla',
        description: 'Reschedule Fee — ₹5',
        order_id:    order.order_id,
        prefill:     { name: user?.name || '', contact: user?.mobile || '' },
        theme:       { color: '#0057FF' },
        handler: async (response) => {
          try {
            // Payment success — now reschedule the booking
            await API.patch(`/bookings/reschedule/${rescheduleBooking.id}/`, {
              date:                 newDate,
              slot:                 newSlot,
              razorpay_order_id:   response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature:  response.razorpay_signature,
            });
            closeReschedule();
            await fetchBookings(true);
            alert('✅ Appointment rescheduled successfully!');
          } catch (err) {
            alert(err?.response?.data?.message || 'Reschedule failed after payment. Contact support.');
          } finally {
            setRescheduling(false);
          }
        },
        modal: { ondismiss: () => setRescheduling(false) },
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', () => { alert('Payment failed. Try again.'); setRescheduling(false); });
      rzp.open();

    } catch (err) {
      alert(err?.response?.data?.message || 'Could not initiate payment. Try again.');
      setRescheduling(false);
    }
  };

  const visible     = filterBookings(bookings, tab);
  const activeCount = bookings.filter(b => b.status === 'waiting' || b.status === 'in_progress').length;
  const amSlots     = doctorSlots.filter(s => s.includes('AM'));
  const pmSlots     = doctorSlots.filter(s => s.includes('PM'));

  return (
    <>
      <style>{css}</style>
      <div className="mb-wrap">

        {/* HEADER */}
        <div className="mb-header">
          <div className="mb-header-bg" />
          <div className="mb-grid" />
          <div className="container position-relative">
            <div className="mb-header-label">Patient Portal</div>
            <h1 className="mb-header-title">My <span>Bookings</span></h1>
            <p className="mb-header-sub">
              {loading ? 'Loading...' : `${bookings.length} total · ${activeCount} active`}
            </p>
          </div>
        </div>

        <div className="container">

          {/* Tabs + Refresh */}
          <div className="d-flex align-items-center justify-content-between flex-wrap gap-3 mb-4">
            <div className="mb-tabs">
              {TABS.map(t => (
                <button
                  key={t.key}
                  className={`mb-tab ${tab === t.key ? 'active' : ''}`}
                  onClick={() => setTab(t.key)}
                >
                  {t.label}
                  {t.key === 'active' && activeCount > 0 && (
                    <span style={{
                      marginLeft: 6,
                      background: 'rgba(0,212,255,0.25)', color: '#00D4FF',
                      fontSize: 11, fontWeight: 700,
                      padding: '1px 7px', borderRadius: 100,
                    }}>
                      {activeCount}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <button
              className={`mb-refresh-btn ${refreshing ? 'spinning' : ''}`}
              onClick={() => fetchBookings(true)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M23 4v6h-6M1 20v-6h6"/>
                <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
              </svg>
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          {/* Skeleton */}
          {loading && (
            <div className="mb-card-list">
              {[...Array(3)].map((_, i) => (
                <div className="mb-skel" key={i}><div className="mb-skel-shine" /></div>
              ))}
            </div>
          )}

          {/* Empty */}
          {!loading && visible.length === 0 && (
            <div className="mb-empty">
              <span className="mb-empty-icon">🎫</span>
              <div className="mb-empty-title">
                {tab === 'active' ? 'No active bookings' : 'No bookings yet'}
              </div>
              <p className="mb-empty-sub">
                {tab === 'active'
                  ? 'Your active appointments will appear here'
                  : 'Book your first appointment and get a token instantly'}
              </p>
              <Link to="/alldoctor" className="mb-find-btn">Find Doctors →</Link>
            </div>
          )}

          {/* Cards */}
          {!loading && visible.length > 0 && (
            <div className="mb-card-list">
              {visible.map((booking, idx) => {
                const st       = STATUS_MAP[booking.status] || STATUS_MAP.waiting;
                const isActive = booking.status === 'waiting' || booking.status === 'in_progress';

                return (
                  <div className="mb-card" key={booking.id} style={{ animationDelay: `${idx * 0.06}s` }}>
                    <div className="mb-card-top">

                      {/* Token */}
                      <div className="mb-token-col">
                        <div className="mb-token-label">Token</div>
                        <div className="mb-token-num">{booking.token?.replace('TW-', '#') || '#—'}</div>
                      </div>

                      {/* Info */}
                      <div className="mb-info-col">
                        <div className={`mb-card-status ${st.cls}`}>
                          <span className={`mb-status-dot ${st.pulse ? 'pulse' : ''}`} />
                          {st.label}
                        </div>
                        <div className="mb-card-doctor">Dr. {booking.doctor_name || '—'}</div>
                        <div className="mb-card-hospital">🏥 {booking.hospital_name || '—'}</div>
                        <div className="mb-card-meta">
                          <div className="mb-meta-chip">
                            <div className="mb-meta-icon">📅</div>
                            {booking.date || '—'}
                          </div>
                          <div className="mb-meta-chip">
                            <div className="mb-meta-icon">🕐</div>
                            {booking.slot || '—'}
                          </div>
                          <div className="mb-amount-badge">💳 ₹{booking.amount || 0}</div>
                        </div>
                      </div>
                    </div>

                    {/* Queue position */}
                    {isActive && booking.queue_access && (
                      <div className="mb-queue-panel">
                        <div className="mb-queue-position">
                          <div className="mb-queue-num-wrap">
                            <div className="mb-queue-circle">{booking.queue_position ?? '?'}</div>
                            <div className="mb-queue-ring" />
                          </div>
                          <div className="mb-queue-text">
                            <div className="mb-queue-label">Your position in queue</div>
                            <div className="mb-queue-desc">
                              {booking.queue_position === 1
                                ? '🎉 You\'re next! Head to the clinic'
                                : booking.queue_position === 0
                                ? '✅ Your turn — please go in'
                                : `${booking.queue_position - 1} patient${booking.queue_position > 2 ? 's' : ''} ahead of you`}
                            </div>
                          </div>
                        </div>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', flexShrink: 0 }}>
                          Auto-refreshes every 15s
                        </div>
                      </div>
                    )}

                    {/* Reschedule panel — only for waiting bookings */}
                    {booking.status === 'waiting' && (
                      <div className="mb-reschedule-panel">
                        <div className="mb-reschedule-info">
                          <div className="mb-reschedule-title">📅 Reschedule Appointment</div>
                          <div className="mb-reschedule-desc">Change your date or time slot for just ₹5</div>
                        </div>
                        <button
                          className="mb-reschedule-btn"
                          onClick={() => openReschedule(booking)}
                        >
                          Reschedule →
                        </button>
                      </div>
                    )}

                    {/* Cancel panel — only for waiting bookings */}
                    {booking.status === 'waiting' && (
                      <div className="mb-cancel-panel">
                        <div className="mb-cancel-info">
                          <div className="mb-cancel-title">❌ Cancel Appointment</div>
                          <div className="mb-cancel-desc">Cancel before your turn · Refund in 5–7 days</div>
                        </div>
                        <button
                          className="mb-cancel-btn"
                          onClick={() => handleCancel(booking)}
                          disabled={cancelling === booking.id}
                        >
                          {cancelling === booking.id ? '⏳ Cancelling...' : 'Cancel →'}
                        </button>
                      </div>
                    )}

                  </div>
                );
              })}
            </div>
          )}

        </div>
      </div>

      {/* RESCHEDULE MODAL */}
      {rescheduleBooking && (
        <div className="mb-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeReschedule(); }}>
          <div className="mb-modal">
            <div className="mb-modal-title">📅 Reschedule Appointment</div>
            <div className="mb-modal-sub">
              Dr. {rescheduleBooking.doctor_name} · {rescheduleBooking.hospital_name}
            </div>

            {/* Date */}
            <label className="mb-modal-label">Select New Date</label>
            <input
              type="date"
              className="mb-modal-input"
              min={today}
              value={newDate}
              onChange={e => { setNewDate(e.target.value); setNewSlot(''); }}
            />

            {/* Slots */}
            <label className="mb-modal-label">
              Select New Time Slot
              {newSlot && <span style={{ color: '#00D4FF', marginLeft: 8 }}>✓ {newSlot}</span>}
            </label>

            {doctorSlots.length === 0 ? (
              <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, marginBottom: 18 }}>
                No slots available for this doctor.
              </p>
            ) : (
              <div className="mb-slots-grid">
                {amSlots.length > 0 && (
                  <>
                    <div style={{ gridColumn: '1/-1', fontSize: 10, fontWeight: 600, letterSpacing: 1.5, textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: 2 }}>
                      🌅 Morning
                    </div>
                    {amSlots.map(s => (
                      <button key={s} className={`mb-slot-btn ${newSlot === s ? 'selected' : ''}`}
                        onClick={() => setNewSlot(s)}>{s}</button>
                    ))}
                  </>
                )}
                {pmSlots.length > 0 && (
                  <>
                    <div style={{ gridColumn: '1/-1', fontSize: 10, fontWeight: 600, letterSpacing: 1.5, textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: 2, marginTop: 8 }}>
                      🌇 Afternoon / Evening
                    </div>
                    {pmSlots.map(s => (
                      <button key={s} className={`mb-slot-btn ${newSlot === s ? 'selected' : ''}`}
                        onClick={() => setNewSlot(s)}>{s}</button>
                    ))}
                  </>
                )}
              </div>
            )}

            <div className="mb-modal-actions">
              <button className="mb-modal-cancel" onClick={closeReschedule}>Cancel</button>
              <button
                className="mb-modal-confirm"
                onClick={handleReschedule}
                disabled={rescheduling || !newDate || !newSlot}
              >
                {rescheduling ? '⏳ Processing...' : '💳 Pay ₹5 & Reschedule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}