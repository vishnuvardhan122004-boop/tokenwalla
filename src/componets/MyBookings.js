import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router';
import API from '../services/api';
import { useVisiblePolling } from '../services/useVisiblePolling';
import { downloadBookingTicket } from '../services/downloadTicket';
import { downloadReport as fetchReportFile } from '../services/downloadReport';
import BookingQR from './BookingQR';

const STATUS_MAP = {
  CONFIRMED:   { label: 'Confirmed',       cls: 'badge-amber',  pulse: true  },
  ON_HOLD:     { label: 'On Hold',         cls: 'badge-amber',  pulse: false },
  IN_PROGRESS: { label: 'In Consultation', cls: 'badge-blue',   pulse: true  },
  COMPLETED:   { label: 'Completed',       cls: 'badge-green',  pulse: false },
  CANCELLED:   { label: 'Cancelled',       cls: 'badge-red',    pulse: false },
  NO_SHOW:     { label: 'No Show',         cls: 'badge-red',    pulse: false },
};

const TABS = [
  { key: 'all',       label: 'All'       },
  { key: 'active',    label: 'Active'    },
  { key: 'completed', label: 'Completed' },
];

// ── Reschedule payment constants (mirrors mobile RescheduleModal.tsx) ──────
const RESCHEDULE_AMOUNT = 5;   // ₹5 (rupees) — must match backend VALID_PLAN_AMOUNTS
const RESCHEDULE_FEE    = 5;   // display only

function filterBookings(bookings, tab) {
  if (tab === 'active')    return bookings.filter(b => b.status === 'CONFIRMED' || b.status === 'IN_PROGRESS');
  if (tab === 'completed') return bookings.filter(b => b.status === 'COMPLETED' || b.status === 'CANCELLED');
  return bookings;
}

function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const existing = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(true));
      existing.addEventListener('error', () => resolve(false));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

// Local YYYY-MM-DD (avoid toISOString — it uses UTC and shifts the date back
// a day for IST users at night, which would let a past date be picked).
const today = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();

export default function MyBookings() {
  const navigate = useNavigate();
  const [bookings,          setBookings]          = useState([]);
  const [loading,           setLoading]           = useState(true);
  const [refreshing,        setRefreshing]        = useState(false);
  const [tab,               setTab]               = useState('all');
  const [cancelling,        setCancelling]        = useState(null);
  const [toast,             setToast]             = useState(null);
  const [rescheduleBooking, setRescheduleBooking] = useState(null);
  const [newDate,           setNewDate]           = useState('');
  const [newSlot,           setNewSlot]           = useState('');
  const [rescheduling,      setRescheduling]      = useState(false);
  const [payingReschedule,  setPayingReschedule]  = useState(false);
  const [doctorSlots,       setDoctorSlots]       = useState([]);
  const [waOptIn,           setWaOptIn]           = useState(true);
  // { [bookingId]: report[] }. Fetched only for completed SCAN bookings —
  // a consultation has no report, and asking for one on every card would be a
  // request per booking for nothing.
  const [reports,           setReports]           = useState({});
  const [downloading,       setDownloading]       = useState(null);
  const [downloadingId,     setDownloadingId]     = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (!stored) { navigate('/login'); }
  }, [navigate]);

  const fetchBookings = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const { data } = await API.get('/bookings/my/');
      setBookings(data);
    } catch {
      if (!silent) showToast('Failed to load bookings. Please refresh.', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchBookings(); }, [fetchBookings]);

  // Auto-refresh only when there are active bookings, pauses when tab hidden
  const hasActive = bookings.some(b => b.status === 'CONFIRMED' || b.status === 'IN_PROGRESS');
  useVisiblePolling(() => fetchBookings(true), 15000, hasActive);

  useEffect(() => {
    API.get('/auth/me/').then(({ data }) => setWaOptIn(data.whatsapp_opt_in ?? true)).catch(() => {});
  }, []);

  const toggleWaOptIn = async () => {
    const next = !waOptIn;
    setWaOptIn(next);
    try {
      await API.patch('/auth/me/whatsapp-opt-in/', { whatsapp_opt_in: next });
    } catch {
      setWaOptIn(!next);
      showToast('Failed to update WhatsApp preference.', 'error');
    }
  };

  const handleDownload = async (booking) => {
    // Prefer the booking's patient name (the beneficiary when booked for
    // someone else); fall back to the logged-in account holder.
    let patientName = booking.patient_name || '';
    if (!patientName) {
      try {
        const u = JSON.parse(localStorage.getItem('user') || '{}');
        patientName = u?.name || u?.username || '';
      } catch { patientName = ''; }
    }

    setDownloadingId(booking.id);
    try {
      await downloadBookingTicket({
        token:       booking.token,
        doctorName:  booking.doctor_name,
        hospital:    booking.hospital_name,
        patientName,
        date:        booking.date,
        slot:        booking.slot,
        amount:      booking.amount,
      });
    } catch {
      showToast('Could not prepare the ticket. Please try again.', 'error');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleCancel = async (booking) => {
    if (!window.confirm(`Cancel appointment with ${booking.doctor_name}?\n\nRefunds are processed within 5–7 business days.`)) return;
    setCancelling(booking.id);
    try {
      await API.patch(`/bookings/cancel/${booking.id}/`);
      await fetchBookings(true);
      showToast('Appointment cancelled. Refund will be processed in 5–7 days.');
    } catch (err) {
      showToast(err?.response?.data?.message || 'Failed to cancel booking.', 'error');
    } finally {
      setCancelling(null);
    }
  };

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

  // ── Reschedule: create ₹5 order → Razorpay Checkout → verify → confirm ──
  const handleReschedule = async () => {
    if (!rescheduleBooking) return;
    if (!newDate) { showToast('Please select a new date', 'error'); return; }
    if (!newSlot) { showToast('Please select a time slot', 'error'); return; }

    // ── Free path: hospital marked the doctor unavailable, so the ₹5 fee is
    // waived. Skip Razorpay and call the no-payment reschedule endpoint. ──
    if (rescheduleBooking.free_reschedule) {
      setRescheduling(true);
      try {
        await API.patch(`/bookings/reschedule/${rescheduleBooking.id}/`, {
          date: newDate,
          slot: newSlot,
        });
        setRescheduleBooking(null);
        await fetchBookings(true);
        showToast('Appointment rescheduled at no charge.');
      } catch (err) {
        showToast(err?.response?.data?.message || 'Could not reschedule. Please try again.', 'error');
      } finally {
        setRescheduling(false);
      }
      return;
    }

    setRescheduling(true);
    try {
      const loaded = await loadRazorpayScript();
      if (!loaded || !window.Razorpay) {
        showToast('Could not load payment gateway. Check your connection.', 'error');
        setRescheduling(false);
        return;
      }

      // Step 1: create the ₹5 order (amount in rupees now).
      const { data: order } = await API.post('/payment/create-order/', {
        amount: RESCHEDULE_AMOUNT,
      });
      if (!order?.order_id) throw new Error('No order returned from server.');

      setPayingReschedule(true);

      // Step 2: open Razorpay checkout, then confirm server-side (the server
      // re-fetches the order from Razorpay — no client signature is trusted).
      const finish = () => { setPayingReschedule(false); setRescheduling(false); };
      const rzp = new window.Razorpay({
        key:      order.key,
        amount:   Math.round(Number(order.amount) * 100),   // server's amount, not ours
        currency: order.currency || 'INR',
        order_id: order.order_id,
        name:     'TokenWalla',
        description: 'Appointment reschedule fee',
        theme: { color: '#185FA5' },
        handler: async () => {
          try {
            const { data } = await API.post('/payment/verify/', {
              order_id: order.order_id,
              booking: {
                booking_id: rescheduleBooking.id,
                date:       newDate,
                slot:       newSlot,
              },
            });

            if (data.success) {
              setRescheduleBooking(null);
              await fetchBookings(true);
              showToast('Appointment rescheduled successfully!');
            } else {
              showToast(data.message || 'Reschedule verification failed. Contact support.', 'error');
            }
          } catch (err) {
            showToast(err?.response?.data?.message || 'Verification error. Contact support.', 'error');
          } finally {
            finish();
          }
        },
        modal: { ondismiss: finish },
      });
      rzp.on('payment.failed', (resp) => {
        showToast(resp?.error?.description || 'Payment cancelled.', 'error');
        finish();
      });
      rzp.open();
    } catch (err) {
      showToast(err?.response?.data?.message || err?.message || 'Could not create payment order.', 'error');
      setRescheduling(false);
      setPayingReschedule(false);
    }
  };

  const queueMsg = (pos) => {
    if (pos === null || pos === undefined) return 'Loading queue position…';
    if (pos === 0)  return 'Your turn — please go in now!';
    if (pos === 1)  return "You're next! Head to the clinic.";
    return `${pos - 1} patient${pos > 2 ? 's' : ''} ahead of you`;
  };

  const visible     = filterBookings(bookings, tab);
  // A scan's journey does not end at the visit: the report comes back hours or
  // days later. This is the only place in the product where something arrives
  // AFTER a booking is COMPLETED.
  useEffect(() => {
    // Any provider may share a document now — a hospital's discharge summary,
    // not just a centre's scan PDF — so this asks every completed booking.
    const done = bookings.filter(b => b.status === 'COMPLETED');
    if (done.length === 0) return;
    let cancelled = false;
    Promise.all(done.map(b =>
      API.get(`/bookings/${b.id}/reports/`)
        .then(({ data }) => [b.id, Array.isArray(data) ? data : []])
        .catch(() => [b.id, []])          // 404 on a backend without reports yet
    )).then(pairs => {
      if (!cancelled) setReports(Object.fromEntries(pairs));
    });
    return () => { cancelled = true; };
  }, [bookings]);

  const downloadReport = async (bookingId, report) => {
    setDownloading(report.id);
    try {
      await fetchReportFile(report);
    } catch {
      setToast({ type: 'error', msg: 'Could not download the file. Please try again.' });
    } finally {
      setDownloading(null);
    }
  };

  const activeCount = bookings.filter(b => b.status === 'CONFIRMED' || b.status === 'IN_PROGRESS').length;
  const amSlots     = doctorSlots.filter(s => s.includes('AM'));
  const pmSlots     = doctorSlots.filter(s => s.includes('PM'));

  return (
    <>
      <style>{`
        .mb-root { font-family: var(--font-body); background: var(--gray-50); min-height: 100vh; padding-bottom: 80px; }
        .mb-header { background: linear-gradient(160deg, var(--blue-50) 0%, #EAF3FF 60%, #F8FBFF 100%); border-bottom: 1px solid var(--blue-100); padding: 52px 0 36px; position: relative; overflow: hidden; }
        .mb-header-grid { position: absolute; inset: 0; background-image: linear-gradient(var(--blue-100) 1px, transparent 1px), linear-gradient(90deg, var(--blue-100) 1px, transparent 1px); background-size: 48px 48px; opacity: 0.4; }
        .mb-header-inner { position: relative; }
        .mb-title { font-family: var(--font-display); font-size: clamp(1.7rem, 4vw, 2.4rem); font-weight: 800; color: var(--gray-900); margin-bottom: 6px; }
        .mb-title .accent { color: var(--blue-600); }
        .mb-sub { font-size: 15px; color: var(--gray-500); }
        .mb-tabs { display: flex; gap: 4px; background: var(--blue-50); border: 1px solid var(--blue-100); border-radius: 12px; padding: 4px; width: fit-content; }
        .mb-tab { padding: 8px 18px; border-radius: 9px; font-size: 14px; font-weight: 500; border: none; background: none; color: var(--gray-500); cursor: pointer; transition: all 0.15s; font-family: var(--font-body); white-space: nowrap; }
        .mb-tab.active { background: #fff; color: var(--blue-700); font-weight: 600; box-shadow: var(--shadow-sm); }
        .mb-tab:hover:not(.active) { color: var(--blue-600); }
        .mb-tab-badge { display: inline-block; margin-left: 6px; background: var(--blue-100); color: var(--blue-700); font-size: 11px; font-weight: 700; padding: 1px 7px; border-radius: 100px; }
        .mb-refresh { display: flex; align-items: center; gap: 7px; background: #fff; border: 1px solid var(--blue-100); border-radius: 10px; padding: 8px 14px; font-family: var(--font-body); font-size: 13px; color: var(--gray-500); cursor: pointer; transition: all 0.15s; }
        .mb-refresh:hover { border-color: var(--blue-300); color: var(--blue-700); }
        .mb-refresh.spinning svg { animation: mbSpin 0.9s linear infinite; }
        @keyframes mbSpin { to { transform: rotate(360deg); } }
        .mb-card { background: #fff; border: 1px solid var(--blue-100); border-radius: 18px; overflow: hidden; transition: border-color 0.2s, box-shadow 0.2s; box-shadow: var(--shadow-sm); }
        .mb-card:hover { border-color: var(--blue-200); box-shadow: var(--shadow-md); }
        .mb-card-top { display: flex; align-items: stretch; }
        .mb-reports { padding: 14px 18px; border-top: 1px solid var(--blue-50); background: #F8FAFC; }
        .mb-reports-title { font-size: 12.5px; font-weight: 700; color: var(--gray-700); margin-bottom: 8px; }
        .mb-report-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 7px 0; }
        .mb-report-name { font-size: 13.5px; color: var(--gray-800); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .mb-report-btn { border: 1px solid var(--blue-200); background: #fff; color: var(--blue-700); font-size: 12.5px; font-weight: 700; padding: 6px 13px; border-radius: 9px; cursor: pointer; flex-shrink: 0; }
        .mb-report-btn:disabled { opacity: .6; cursor: default; }
        .mb-report-pending { font-size: 12.5px; color: var(--gray-500); }
        .mb-token-col { width: 110px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px 14px; border-right: 1px solid var(--blue-50); background: var(--blue-50); }
        .mb-token-label { font-size: 10px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; color: var(--blue-400); margin-bottom: 6px; }
        .mb-token-num { font-family: var(--font-mono); font-size: 1.4rem; font-weight: 500; color: var(--blue-700); line-height: 1; text-align: center; word-break: break-all; }
        .mb-info-col { flex: 1; padding: 18px 22px; min-width: 0; }
        .mb-doctor-name { font-family: var(--font-display); font-size: 1.05rem; font-weight: 700; color: var(--gray-900); margin-bottom: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .mb-hospital-name { font-size: 13px; color: var(--gray-500); margin-bottom: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .mb-for-other { display: inline-block; margin-bottom: 12px; padding: 3px 10px; background: var(--blue-50); border: 1px solid var(--blue-200); border-radius: 100px; font-size: 12px; font-weight: 600; color: var(--blue-700); }
        .mb-meta { display: flex; flex-wrap: wrap; gap: 12px; }
        .mb-meta-chip { display: flex; align-items: center; gap: 5px; font-size: 13px; color: var(--gray-500); }
        .mb-meta-icon { width: 22px; height: 22px; border-radius: 5px; background: var(--blue-50); display: flex; align-items: center; justify-content: center; font-size: 11px; }
        .mb-amount { font-size: 13px; font-weight: 600; color: var(--blue-600); background: var(--blue-50); border: 1px solid var(--blue-200); border-radius: 7px; padding: 3px 10px; }
        .mb-queue-panel { border-top: 1px solid var(--blue-50); padding: 14px 20px; display: flex; align-items: center; gap: 14px; flex-wrap: wrap; background: #F0F9FF; }
        .mb-queue-circle { width: 48px; height: 48px; border-radius: 50%; background: var(--blue-50); border: 2px solid var(--blue-300); display: flex; align-items: center; justify-content: center; font-family: var(--font-display); font-size: 1.2rem; font-weight: 800; color: var(--blue-600); flex-shrink: 0; }
        .mb-queue-label { font-size: 12px; color: var(--gray-400); margin-bottom: 2px; }
        .mb-queue-desc { font-size: 14px; font-weight: 500; color: var(--blue-700); }
        .mb-action-panel { border-top: 1px solid var(--blue-50); padding: 12px 20px; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
        .mb-action-title { font-size: 14px; font-weight: 600; color: var(--gray-700); margin-bottom: 2px; }
        .mb-action-desc { font-size: 12px; color: var(--gray-400); }
        .mb-cancel-btn { display: inline-flex; align-items: center; gap: 6px; background: var(--color-error-bg); border: 1px solid var(--color-error-border); border-radius: 9px; padding: 8px 16px; font-family: var(--font-body); font-size: 13px; font-weight: 600; color: var(--color-error-text); cursor: pointer; transition: all 0.15s; }
        .mb-cancel-btn:hover { background: #f7c1c1; }
        .mb-cancel-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .mb-reschedule-btn { display: inline-flex; align-items: center; gap: 6px; background: var(--blue-50); border: 1px solid var(--blue-200); border-radius: 9px; padding: 8px 16px; font-family: var(--font-body); font-size: 13px; font-weight: 600; color: var(--blue-700); cursor: pointer; transition: all 0.15s; }
        .mb-reschedule-btn:hover { background: var(--blue-100); border-color: var(--blue-400); }
        .mb-reschedule-btn.free { background: var(--color-success-bg); border-color: var(--color-success-border); color: var(--color-success-text); }
        .mb-reschedule-btn.free:hover { background: #cdeed7; border-color: var(--color-success-text); }
        .mb-unavail-banner { border-top: 1px solid var(--blue-50); padding: 12px 20px; background: #FFF6E5; color: #8A6100; font-size: 13px; font-weight: 600; }
        .mb-empty { text-align: center; padding: 80px 20px; }
        .mb-empty-icon { font-size: 4rem; opacity: 0.35; margin-bottom: 16px; display: block; }
        .mb-empty-title { font-family: var(--font-display); font-size: 1.3rem; font-weight: 700; color: var(--gray-500); margin-bottom: 8px; }
        .mb-skel { background: #fff; border: 1px solid var(--blue-100); border-radius: 18px; overflow: hidden; height: 140px; }
        .mb-skel-shine { height: 100%; background: linear-gradient(90deg, var(--gray-100) 25%, var(--gray-200) 50%, var(--gray-100) 75%); background-size: 200% 100%; animation: shimmer 1.4s infinite; }
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        .mb-modal-overlay { position: fixed; inset: 0; z-index: 2000; background: rgba(4,44,83,0.45); backdrop-filter: blur(6px); display: flex; align-items: center; justify-content: center; padding: 16px; }
        .mb-modal { background: #fff; border: 1px solid var(--blue-100); border-radius: 22px; padding: 28px; width: 100%; max-width: 480px; position: relative; box-shadow: var(--shadow-lg); }
        .mb-modal::before { content:''; position:absolute; top:0;left:0;right:0;height:3px; background: linear-gradient(90deg, var(--blue-600), var(--blue-400)); border-radius:22px 22px 0 0; }
        .mb-modal-title { font-family: var(--font-display); font-size: 1.15rem; font-weight: 800; color: var(--gray-900); margin-bottom: 4px; }
        .mb-modal-sub { font-size: 13px; color: var(--gray-400); margin-bottom: 22px; }
        .mb-modal-label { font-size: 12px; font-weight: 600; color: var(--gray-600); margin-bottom: 7px; display: block; }
        .mb-modal-input { width: 100%; background: var(--gray-50); border: 1px solid var(--blue-100); border-radius: 11px; padding: 11px 14px; font-family: var(--font-body); font-size: 15px; color: var(--gray-900); outline: none; transition: all 0.15s; color-scheme: light; margin-bottom: 18px; }
        .mb-modal-input:focus { border-color: var(--blue-400); background: #fff; box-shadow: 0 0 0 3px rgba(55,138,221,0.12); }
        .mb-slots-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(86px, 1fr)); gap: 7px; margin-bottom: 20px; max-height: 200px; overflow-y: auto; }
        .mb-slot-btn { padding: 8px 4px; border-radius: 9px; border: 1px solid var(--blue-100); background: var(--gray-50); font-size: 12px; font-weight: 500; color: var(--gray-600); cursor: pointer; transition: all 0.15s; text-align: center; font-family: var(--font-body); }
        .mb-slot-btn:hover { background: var(--blue-50); border-color: var(--blue-300); color: var(--blue-700); }
        .mb-slot-btn.selected { background: var(--blue-50); border-color: var(--blue-500); color: var(--blue-700); font-weight: 600; }
        .mb-fee-note { background: var(--blue-50); border: 1px solid var(--blue-200); border-radius: 10px; padding: 12px 14px; margin-bottom: 18px; font-size: 12px; color: var(--blue-700); line-height: 1.5; }
        .mb-modal-actions { display: flex; gap: 10px; }
        .mb-modal-cancel { flex: 1; padding: 12px; border-radius: 11px; border: 1px solid var(--blue-100); background: var(--gray-50); color: var(--gray-600); font-family: var(--font-body); font-size: 14px; cursor: pointer; }
        .mb-modal-confirm { flex: 2; padding: 12px; border-radius: 11px; border: none; background: var(--blue-600); color: #fff; font-family: var(--font-body); font-size: 14px; font-weight: 600; cursor: pointer; }
        .mb-modal-confirm:hover:not(:disabled) { background: var(--blue-800); }
        .mb-modal-confirm:disabled { opacity: 0.5; cursor: not-allowed; }
        .mb-toast { position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%); padding: 12px 24px; border-radius: 12px; font-size: 14px; font-weight: 500; z-index: 9999; white-space: nowrap; box-shadow: var(--shadow-lg); }
        .mb-toast.success { background: var(--color-success-text); color: #fff; }
        .mb-toast.error   { background: var(--color-error-text);   color: #fff; }
        @keyframes twPulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @media (max-width: 600px) { .mb-token-col { width: 84px; padding: 16px 10px; } .mb-info-col { padding: 14px; } }
      `}</style>

      <div className="mb-root">
        <div className="mb-header">
          <div className="mb-header-grid" />
          <div className="tw-container mb-header-inner">
           <div className="tw-container" style={{ paddingTop: 32 }}></div>
            <div className="tw-section-label">Patient Portal</div>
            <h1 className="mb-title">My <span className="accent">Bookings</span></h1>
            <p className="mb-sub">
              {loading ? 'Loading…' : `${bookings.length} total · ${activeCount} active`}
            </p>
          </div>
        </div>

        <div className="tw-container" style={{ paddingTop: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14, marginBottom: 28 }}>
            <div className="mb-tabs">
              {TABS.map(t => (
                <button key={t.key} className={`mb-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
                  {t.label}
                  {t.key === 'active' && activeCount > 0 && (
                    <span className="mb-tab-badge">{activeCount}</span>
                  )}
                </button>
              ))}
            </div>
            <button className={`mb-refresh ${refreshing ? 'spinning' : ''}`} onClick={() => fetchBookings(true)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M23 4v6h-6M1 20v-6h6"/>
                <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
              </svg>
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>

          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {[...Array(3)].map((_, i) => (
                <div key={i} className="mb-skel"><div className="mb-skel-shine" /></div>
              ))}
            </div>
          )}

          {!loading && visible.length === 0 && (
            <div className="mb-empty">
              <span className="mb-empty-icon"><i className="bi bi-ticket-perforated me-1" /></span>
              <div className="mb-empty-title">{tab === 'active' ? 'No active bookings' : 'No bookings yet'}</div>
              <p style={{ color: 'var(--gray-400)', marginBottom: 24 }}>
                {tab === 'active' ? 'Your active appointments will appear here' : 'Book your first appointment and get a token instantly'}
              </p>
              <Link to="/alldoctor" className="btn-primary" style={{ display: 'inline-flex' }}>Find Doctors →</Link>
            </div>
          )}

          {!loading && visible.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {visible.map((booking, idx) => {
                const st       = STATUS_MAP[booking.status] || STATUS_MAP.CONFIRMED;
                const isActive = booking.status === 'CONFIRMED' || booking.status === 'IN_PROGRESS';
                const qPos     = booking.queue_position;

                return (
                  <div className="mb-card fade-up" key={booking.id} style={{ animationDelay: `${idx * 0.06}s` }}>
                    <div className="mb-card-top">
                      <div className="mb-token-col">
                        <div className="mb-token-label">Token</div>
                        <div className="mb-token-num">{booking.token?.replace('TW-', '#') || '#—'}</div>
                      </div>
                      <div className="mb-info-col">
                        <div style={{ marginBottom: 8 }}>
                          <span className={`badge ${st.cls}`} style={{ marginBottom: 8, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            {st.pulse && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', animation: 'twPulse 2s infinite', flexShrink: 0 }} />}
                            {st.label}
                          </span>
                        </div>
                        <div className="mb-doctor-name">{booking.doctor_name || '—'}</div>
                        <div className="mb-hospital-name"><i className="bi bi-hospital me-1" />{booking.hospital_name || '—'}</div>
                        {booking.is_for_other && (
                          <div className="mb-for-other"><i className="bi bi-people me-1" />For {booking.patient_name}</div>
                        )}
                        <div className="mb-meta">
                          <div className="mb-meta-chip"><div className="mb-meta-icon"><i className="bi bi-calendar-event me-1" /></div>{booking.date || '—'}</div>
                          <div className="mb-meta-chip"><div className="mb-meta-icon"><i className="bi bi-clock me-1" /></div>{booking.slot || '—'}</div>
                          <span className="mb-amount">₹{booking.amount || 0}</span>
                        </div>
                      </div>
                    </div>

                    {/* ── QUEUE PANEL ── */}
                    {isActive && booking.queue_access && (
                      <div className="mb-queue-panel">
                        <div className="mb-queue-circle">
                          {booking.status === 'IN_PROGRESS' ? <i className="bi bi-bell-fill" /> : (qPos ?? '…')}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div className="mb-queue-label">Your position in queue</div>
                          <div className="mb-queue-desc">
                            {booking.status === 'IN_PROGRESS' ? 'Your turn — please go in now!' : queueMsg(qPos)}
                          </div>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>Auto-refreshes every 15s</div>
                      </div>
                    )}

                    {/* ── SHARED DOCUMENTS ──
                        A scan is ALWAYS expected to produce one, so it gets the
                        "not ready yet" reassurance. A consultation usually
                        produces nothing, so it only appears if a file exists —
                        otherwise every completed visit would nag about a
                        document nobody is waiting for. */}
                    {booking.status === 'COMPLETED'
                      && (booking.provider_kind === 'SCAN'
                          || (reports[booking.id] || []).length > 0) && (
                      <div className="mb-reports">
                        {(reports[booking.id] || []).length > 0 ? (
                          <>
                            <div className="mb-reports-title">
                              <i className="bi bi-file-earmark-medical me-1" />Your documents
                            </div>
                            {reports[booking.id].map(r => (
                              <div className="mb-report-row" key={r.id}>
                                <span className="mb-report-name">{r.title || 'Report'}</span>
                                <button
                                  className="mb-report-btn"
                                  disabled={downloading === r.id}
                                  onClick={() => downloadReport(booking.id, r)}
                                >
                                  {downloading === r.id
                                    ? 'Downloading…'
                                    : <><i className="bi bi-download me-1" />Download</>}
                                </button>
                              </div>
                            ))}
                          </>
                        ) : (
                          <div className="mb-report-pending">
                            <i className="bi bi-hourglass-split me-1" />
                            Your report isn&apos;t ready yet. We&apos;ll message you the moment it is.
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── QR CODE PANEL (waiting or in_progress) ── */}
                    {(booking.status === 'CONFIRMED' || booking.status === 'IN_PROGRESS') && (
                      <div className="mb-action-panel">
                        <div>
                          <div className="mb-action-title"><i className="bi bi-square-fill me-1" />Show / Download Token</div>
                          <div className="mb-action-desc">Scan at reception, or download your ticket to keep it offline</div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <BookingQR
                            token={booking.token}
                            doctorName={booking.doctor_name}
                            hospital={booking.hospital_name}
                            date={booking.date}
                            slot={booking.slot}
                            variant="button"
                          />
                          <button
                            type="button"
                            className="mb-reschedule-btn"
                            onClick={() => handleDownload(booking)}
                            disabled={downloadingId === booking.id}
                          >
                            {downloadingId === booking.id ? '⏳ Preparing…' : 'Download'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* ── DOCTOR-UNAVAILABLE BANNER ── */}
                    {booking.status === 'CONFIRMED' && booking.free_reschedule && (
                      <div className="mb-unavail-banner">
                        <i className="bi bi-exclamation-triangle me-1" />{booking.doctor_name} is unavailable. Reschedule below at no charge.
                      </div>
                    )}

                    {/* ── RESCHEDULE PANEL ── */}
                    {booking.status === 'CONFIRMED' && (
                      <div className="mb-action-panel">
                        <div>
                          <div className="mb-action-title"><i className="bi bi-calendar-event me-1" />Reschedule Appointment</div>
                          <div className="mb-action-desc">
                            {booking.free_reschedule
                              ? 'Change your date or time slot — no charge'
                              : `Change your date or time slot — ₹${RESCHEDULE_FEE} fee`}
                          </div>
                        </div>
                        <button
                          className={`mb-reschedule-btn ${booking.free_reschedule ? 'free' : ''}`}
                          onClick={() => openReschedule(booking)}
                        >
                          {booking.free_reschedule ? 'Reschedule FREE →' : 'Reschedule →'}
                        </button>
                      </div>
                    )}

                    {/* ── CANCEL PANEL ── */}
                    {booking.status === 'CONFIRMED' && (
                      <div className="mb-action-panel">
                        <div>
                          <div className="mb-action-title"><i className="bi bi-x-circle me-1" />Cancel Appointment</div>
                          <div className="mb-action-desc">Cancel before your turn · Refund in 5–7 days</div>
                        </div>
                        <button
                          className="mb-cancel-btn"
                          onClick={() => handleCancel(booking)}
                          disabled={cancelling === booking.id}
                        >
                          {cancelling === booking.id ? '⏳ Cancelling…' : 'Cancel →'}
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

      {/* ── RESCHEDULE MODAL ── */}
      {rescheduleBooking && (
        <div className="mb-modal-overlay" onClick={e => { if (e.target === e.currentTarget && !rescheduling) setRescheduleBooking(null); }}>
          <div className="mb-modal">
            <div className="mb-modal-title"><i className="bi bi-calendar-event me-1" />Reschedule Appointment</div>
            <div className="mb-modal-sub">{rescheduleBooking.doctor_name} · {rescheduleBooking.hospital_name}</div>
            <label className="mb-modal-label">Select New Date</label>
            <input
              type="date" className="mb-modal-input" min={today} value={newDate}
              onChange={e => { setNewDate(e.target.value); setNewSlot(''); }}
              disabled={rescheduling}
            />
            <label className="mb-modal-label">
              Select New Time Slot
              {newSlot && <span style={{ color: 'var(--blue-600)', marginLeft: 8, fontWeight: 600 }}>✓ {newSlot}</span>}
            </label>
            {doctorSlots.length === 0 ? (
              <p style={{ color: 'var(--gray-400)', fontSize: 13, marginBottom: 18 }}>No slots available for this doctor.</p>
            ) : (
              <div className="mb-slots-grid">
                {amSlots.length > 0 && <>
                  <div style={{ gridColumn: '1/-1', fontSize: 11, fontWeight: 600, color: 'var(--gray-400)', letterSpacing: 1 }}><i className="bi bi-sunrise me-1" />Morning</div>
                  {amSlots.map(s => (
                    <button
                      key={s}
                      className={`mb-slot-btn ${newSlot === s ? 'selected' : ''}`}
                      onClick={() => setNewSlot(s)}
                      disabled={rescheduling}
                    >
                      {s}
                    </button>
                  ))}
                </>}
                {pmSlots.length > 0 && <>
                  <div style={{ gridColumn: '1/-1', fontSize: 11, fontWeight: 600, color: 'var(--gray-400)', letterSpacing: 1, marginTop: 8 }}><i className="bi bi-sunset me-1" />Afternoon / Evening</div>
                  {pmSlots.map(s => (
                    <button
                      key={s}
                      className={`mb-slot-btn ${newSlot === s ? 'selected' : ''}`}
                      onClick={() => setNewSlot(s)}
                      disabled={rescheduling}
                    >
                      {s}
                    </button>
                  ))}
                </>}
              </div>
            )}

            <div className="mb-fee-note">
              {rescheduleBooking.free_reschedule
                ? 'Free reschedule — your doctor was marked unavailable, so there is no charge.'
                : `A ₹${RESCHEDULE_FEE} reschedule fee applies. Razorpay will open after you confirm.`}
            </div>

            <div className="mb-modal-actions">
              <button className="mb-modal-cancel" onClick={() => setRescheduleBooking(null)} disabled={rescheduling}>
                Cancel
              </button>
              <button
                className="mb-modal-confirm"
                onClick={handleReschedule}
                disabled={rescheduling || !newDate || !newSlot}
              >
                {payingReschedule
                  ? '⏳ Opening Razorpay…'
                  : rescheduling
                    ? '⏳ Processing…'
                    : rescheduleBooking.free_reschedule
                      ? 'Confirm Reschedule (FREE)'
                      : `Pay ₹${RESCHEDULE_FEE} & Reschedule`}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`mb-toast ${toast.type}`}>{toast.msg}</div>}
    </>
  );
}