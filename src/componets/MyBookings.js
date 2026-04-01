import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router';
import API from '../services/api';

const STATUS_MAP = {
  waiting:     { label: 'Waiting',         cls: 'badge-amber',  pulse: true  },
  in_progress: { label: 'In Consultation', cls: 'badge-blue',   pulse: true  },
  completed:   { label: 'Completed',       cls: 'badge-green',  pulse: false },
  cancelled:   { label: 'Cancelled',       cls: 'badge-red',    pulse: false },
};

const TABS = [
  { key: 'all',       label: 'All'       },
  { key: 'active',    label: 'Active'    },
  { key: 'completed', label: 'Completed' },
];

function filterBookings(bookings, tab) {
  if (tab === 'active')    return bookings.filter((b) => b.status === 'waiting' || b.status === 'in_progress');
  if (tab === 'completed') return bookings.filter((b) => b.status === 'completed' || b.status === 'cancelled');
  return bookings;
}

const today = new Date().toISOString().split('T')[0];

export default function MyBookings() {
  const navigate = useNavigate();
  const [bookings,   setBookings]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab,        setTab]        = useState('all');
  const [cancelling, setCancelling] = useState(null);
  const [user,       setUser]       = useState(null);
  const [toast,      setToast]      = useState(null);

  // Reschedule state
  const [rescheduleBooking, setRescheduleBooking] = useState(null);
  const [newDate,           setNewDate]           = useState('');
  const [newSlot,           setNewSlot]           = useState('');
  const [rescheduling,      setRescheduling]      = useState(false);
  const [doctorSlots,       setDoctorSlots]       = useState([]);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (!stored) { navigate('/login'); return; }
    try { setUser(JSON.parse(stored)); } catch { navigate('/login'); }
  }, [navigate]);

  const fetchBookings = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const { data } = await API.get('/bookings/my/');
      setBookings(data);
    } catch (err) {
      if (!silent) showToast('Failed to load bookings. Please refresh.', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchBookings(); }, [fetchBookings]);

  // Auto-refresh when there are active bookings
  useEffect(() => {
    const hasActive = bookings.some((b) => b.status === 'waiting' || b.status === 'in_progress');
    if (!hasActive) return;
    const t = setInterval(() => fetchBookings(true), 15000);
    return () => clearInterval(t);
  }, [bookings, fetchBookings]);

  const handleCancel = async (booking) => {
    if (!window.confirm(`Cancel appointment with Dr. ${booking.doctor_name}?\n\nRefunds are processed within 5–7 business days.`)) return;
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

  const handleReschedule = async () => {
    if (!newDate) { showToast('Please select a new date', 'error'); return; }
    if (!newSlot) { showToast('Please select a time slot', 'error'); return; }
    setRescheduling(true);
    try {
      await API.patch(`/bookings/reschedule/${rescheduleBooking.id}/`, { date: newDate, slot: newSlot });
      setRescheduleBooking(null);
      await fetchBookings(true);
      showToast('Appointment rescheduled successfully!');
    } catch (err) {
      showToast(err?.response?.data?.message || 'Reschedule failed.', 'error');
    } finally {
      setRescheduling(false);
    }
  };

  const queueMsg = (pos) => {
    if (pos === null || pos === undefined) return 'Loading queue position…';
    if (pos === 0)  return '✅ Your turn — please go in now!';
    if (pos === 1)  return "You're next! Head to the clinic.";
    return `${pos - 1} patient${pos > 2 ? 's' : ''} ahead of you`;
  };

  const visible     = filterBookings(bookings, tab);
  const activeCount = bookings.filter((b) => b.status === 'waiting' || b.status === 'in_progress').length;
  const amSlots     = doctorSlots.filter((s) => s.includes('AM'));
  const pmSlots     = doctorSlots.filter((s) => s.includes('PM'));

  return (
    <>
      <style>{`
        .mb-root { font-family: 'DM Sans', sans-serif; background: var(--gray-50); min-height: 100vh; padding-bottom: 80px; }
        .mb-header {
          background: linear-gradient(160deg, var(--blue-50) 0%, #EAF3FF 60%, #F8FBFF 100%);
          border-bottom: 1px solid var(--blue-100); padding: 52px 0 36px;
          position: relative; overflow: hidden;
        }
        .mb-header-grid {
          position: absolute; inset: 0;
          background-image: linear-gradient(var(--blue-100) 1px, transparent 1px), linear-gradient(90deg, var(--blue-100) 1px, transparent 1px);
          background-size: 48px 48px; opacity: 0.4;
        }
        .mb-header-inner { position: relative; }
        .mb-title { font-family: 'Plus Jakarta Sans', sans-serif; font-size: clamp(1.7rem, 4vw, 2.4rem); font-weight: 800; color: var(--gray-900); margin-bottom: 6px; }
        .mb-title .accent { color: var(--blue-600); }
        .mb-sub { font-size: 15px; color: var(--gray-500); }
        .mb-tabs { display: flex; gap: 4px; background: var(--blue-50); border: 1px solid var(--blue-100); border-radius: 12px; padding: 4px; width: fit-content; }
        .mb-tab { padding: 8px 18px; border-radius: 9px; font-size: 14px; font-weight: 500; border: none; background: none; color: var(--gray-500); cursor: pointer; transition: all 0.15s; font-family: 'DM Sans', sans-serif; white-space: nowrap; }
        .mb-tab.active { background: #fff; color: var(--blue-700); font-weight: 600; box-shadow: var(--shadow-sm); }
        .mb-tab:hover:not(.active) { color: var(--blue-600); }
        .mb-tab-badge { display: inline-block; margin-left: 6px; background: var(--blue-100); color: var(--blue-700); font-size: 11px; font-weight: 700; padding: 1px 7px; border-radius: 100px; }
        .mb-refresh { display: flex; align-items: center; gap: 7px; background: #fff; border: 1px solid var(--blue-100); border-radius: 10px; padding: 8px 14px; font-family: 'DM Sans', sans-serif; font-size: 13px; color: var(--gray-500); cursor: pointer; transition: all 0.15s; }
        .mb-refresh:hover { border-color: var(--blue-300); color: var(--blue-700); }
        .mb-refresh.spinning svg { animation: mbSpin 0.9s linear infinite; }
        @keyframes mbSpin { to { transform: rotate(360deg); } }
        .mb-card { background: #fff; border: 1px solid var(--blue-100); border-radius: 18px; overflow: hidden; transition: border-color 0.2s, box-shadow 0.2s; box-shadow: var(--shadow-sm); }
        .mb-card:hover { border-color: var(--blue-200); box-shadow: var(--shadow-md); }
        .mb-card-top { display: flex; align-items: stretch; }
        .mb-token-col { width: 110px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px 14px; border-right: 1px solid var(--blue-50); background: var(--blue-50); }
        .mb-token-label { font-size: 10px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; color: var(--blue-400); margin-bottom: 6px; }
        .mb-token-num { font-family: 'DM Mono', monospace; font-size: 1.4rem; font-weight: 500; color: var(--blue-700); line-height: 1; text-align: center; word-break: break-all; }
        .mb-info-col { flex: 1; padding: 18px 22px; min-width: 0; }
        .mb-doctor-name { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1.05rem; font-weight: 700; color: var(--gray-900); margin-bottom: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .mb-hospital-name { font-size: 13px; color: var(--gray-500); margin-bottom: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .mb-meta { display: flex; flex-wrap: wrap; gap: 12px; }
        .mb-meta-chip { display: flex; align-items: center; gap: 5px; font-size: 13px; color: var(--gray-500); }
        .mb-meta-icon { width: 22px; height: 22px; border-radius: 5px; background: var(--blue-50); display: flex; align-items: center; justify-content: center; font-size: 11px; }
        .mb-amount { font-size: 13px; font-weight: 600; color: var(--blue-600); background: var(--blue-50); border: 1px solid var(--blue-200); border-radius: 7px; padding: 3px 10px; }
        .mb-queue-panel { border-top: 1px solid var(--blue-50); padding: 14px 20px; display: flex; align-items: center; gap: 14px; flex-wrap: wrap; background: #F0F9FF; }
        .mb-queue-circle { width: 48px; height: 48px; border-radius: 50%; background: var(--blue-50); border: 2px solid var(--blue-300); display: flex; align-items: center; justify-content: center; font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1.2rem; font-weight: 800; color: var(--blue-600); flex-shrink: 0; }
        .mb-queue-label { font-size: 12px; color: var(--gray-400); margin-bottom: 2px; }
        .mb-queue-desc { font-size: 14px; font-weight: 500; color: var(--blue-700); }
        .mb-action-panel { border-top: 1px solid var(--blue-50); padding: 12px 20px; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
        .mb-action-title { font-size: 14px; font-weight: 600; color: var(--gray-700); margin-bottom: 2px; }
        .mb-action-desc { font-size: 12px; color: var(--gray-400); }
        .mb-cancel-btn { display: inline-flex; align-items: center; gap: 6px; background: var(--color-error-bg); border: 1px solid var(--color-error-border); border-radius: 9px; padding: 8px 16px; font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 600; color: var(--color-error-text); cursor: pointer; transition: all 0.15s; }
        .mb-cancel-btn:hover { background: #f7c1c1; }
        .mb-cancel-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .mb-reschedule-btn { display: inline-flex; align-items: center; gap: 6px; background: var(--blue-50); border: 1px solid var(--blue-200); border-radius: 9px; padding: 8px 16px; font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 600; color: var(--blue-700); cursor: pointer; transition: all 0.15s; }
        .mb-reschedule-btn:hover { background: var(--blue-100); border-color: var(--blue-400); }
        .mb-empty { text-align: center; padding: 80px 20px; }
        .mb-empty-icon { font-size: 4rem; opacity: 0.35; margin-bottom: 16px; display: block; }
        .mb-empty-title { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1.3rem; font-weight: 700; color: var(--gray-500); margin-bottom: 8px; }
        .mb-skel { background: #fff; border: 1px solid var(--blue-100); border-radius: 18px; overflow: hidden; height: 140px; }
        .mb-skel-shine { height: 100%; background: linear-gradient(90deg, var(--gray-100) 25%, var(--gray-200) 50%, var(--gray-100) 75%); background-size: 200% 100%; animation: shimmer 1.4s infinite; }
        .mb-modal-overlay { position: fixed; inset: 0; z-index: 2000; background: rgba(4,44,83,0.45); backdrop-filter: blur(6px); display: flex; align-items: center; justify-content: center; padding: 16px; animation: fadeIn 0.18s ease both; }
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        .mb-modal { background: #fff; border: 1px solid var(--blue-100); border-radius: 22px; padding: 28px; width: 100%; max-width: 480px; position: relative; box-shadow: var(--shadow-lg); animation: slideUp 0.25s cubic-bezier(0.34,1.56,0.64,1) both; }
        @keyframes slideUp { from{opacity:0;transform:translateY(24px) scale(0.97)} to{opacity:1;transform:translateY(0) scale(1)} }
        .mb-modal::before { content:''; position:absolute; top:0;left:0;right:0;height:3px; background: linear-gradient(90deg, var(--blue-600), var(--blue-400)); border-radius:22px 22px 0 0; }
        .mb-modal-title { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1.15rem; font-weight: 800; color: var(--gray-900); margin-bottom: 4px; }
        .mb-modal-sub { font-size: 13px; color: var(--gray-400); margin-bottom: 22px; }
        .mb-modal-label { font-size: 12px; font-weight: 600; color: var(--gray-600); margin-bottom: 7px; display: block; }
        .mb-modal-input { width: 100%; background: var(--gray-50); border: 1px solid var(--blue-100); border-radius: 11px; padding: 11px 14px; font-family: 'DM Sans', sans-serif; font-size: 15px; color: var(--gray-900); outline: none; transition: all 0.15s; color-scheme: light; margin-bottom: 18px; }
        .mb-modal-input:focus { border-color: var(--blue-400); background: #fff; box-shadow: 0 0 0 3px rgba(55,138,221,0.12); }
        .mb-slots-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(86px, 1fr)); gap: 7px; margin-bottom: 20px; max-height: 200px; overflow-y: auto; }
        .mb-slot-btn { padding: 8px 4px; border-radius: 9px; border: 1px solid var(--blue-100); background: var(--gray-50); font-size: 12px; font-weight: 500; color: var(--gray-600); cursor: pointer; transition: all 0.15s; text-align: center; font-family: 'DM Sans', sans-serif; }
        .mb-slot-btn:hover { background: var(--blue-50); border-color: var(--blue-300); color: var(--blue-700); }
        .mb-slot-btn.selected { background: var(--blue-50); border-color: var(--blue-500); color: var(--blue-700); font-weight: 600; }
        .mb-modal-actions { display: flex; gap: 10px; }
        .mb-modal-cancel { flex: 1; padding: 12px; border-radius: 11px; border: 1px solid var(--blue-100); background: var(--gray-50); color: var(--gray-600); font-family: 'DM Sans', sans-serif; font-size: 14px; cursor: pointer; transition: all 0.15s; }
        .mb-modal-cancel:hover { background: var(--gray-200); }
        .mb-modal-confirm { flex: 2; padding: 12px; border-radius: 11px; border: none; background: var(--blue-600); color: #fff; font-family: 'DM Sans', sans-serif; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.15s; }
        .mb-modal-confirm:hover:not(:disabled) { background: var(--blue-800); }
        .mb-modal-confirm:disabled { opacity: 0.5; cursor: not-allowed; }
        .mb-toast { position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%); padding: 12px 24px; border-radius: 12px; font-size: 14px; font-weight: 500; z-index: 9999; white-space: nowrap; box-shadow: var(--shadow-lg); animation: toastIn 0.3s ease both; }
        @keyframes toastIn { from{opacity:0;transform:translateX(-50%) translateY(10px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
        .mb-toast.success { background: var(--color-success-text); color: #fff; }
        .mb-toast.error   { background: var(--color-error-text);   color: #fff; }
        @keyframes twPulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @media (max-width: 600px) { .mb-token-col { width: 84px; padding: 16px 10px; } .mb-info-col { padding: 14px; } .mb-action-panel { padding: 11px 14px; } }
      `}</style>

      <div className="mb-root">
        <div className="mb-header">
          <div className="mb-header-grid" />
          <div className="tw-container mb-header-inner">
            <div className="tw-section-label">Patient Portal</div>
            <h1 className="mb-title">My <span className="accent">Bookings</span></h1>
            <p className="mb-sub">
              {loading ? 'Loading…' : `${bookings.length} total · ${activeCount} active`}
            </p>
          </div>
        </div>

        <div className="tw-container" style={{ paddingTop: 32 }}>
          {/* Tabs + refresh */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14, marginBottom: 28 }}>
            <div className="mb-tabs">
              {TABS.map((t) => (
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

          {/* Skeletons */}
          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {[...Array(3)].map((_, i) => (
                <div key={i} className="mb-skel"><div className="mb-skel-shine" /></div>
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
              <p style={{ color: 'var(--gray-400)', marginBottom: 24 }}>
                {tab === 'active'
                  ? 'Your active appointments will appear here'
                  : 'Book your first appointment and get a token instantly'}
              </p>
              <Link to="/alldoctor" className="btn-primary" style={{ display: 'inline-flex' }}>
                Find Doctors →
              </Link>
            </div>
          )}

          {/* Cards */}
          {!loading && visible.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {visible.map((booking, idx) => {
                const st = STATUS_MAP[booking.status] || STATUS_MAP.waiting;
                const isActive = booking.status === 'waiting' || booking.status === 'in_progress';
                const qPos = booking.queue_position;

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
                            {st.pulse && (
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', animation: 'twPulse 2s infinite', flexShrink: 0 }} />
                            )}
                            {st.label}
                          </span>
                        </div>
                        <div className="mb-doctor-name">Dr. {booking.doctor_name || '—'}</div>
                        <div className="mb-hospital-name">🏥 {booking.hospital_name || '—'}</div>
                        <div className="mb-meta">
                          <div className="mb-meta-chip"><div className="mb-meta-icon">📅</div>{booking.date || '—'}</div>
                          <div className="mb-meta-chip"><div className="mb-meta-icon">🕐</div>{booking.slot || '—'}</div>
                          <span className="mb-amount">₹{booking.amount || 0}</span>
                        </div>
                      </div>
                    </div>

                    {/* Queue position — shown if active and queue_access */}
                    {isActive && booking.queue_access && (
                      <div className="mb-queue-panel">
                        <div className="mb-queue-circle">
                          {booking.status === 'in_progress' ? '🔔' : (qPos ?? '…')}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div className="mb-queue-label">Your position in queue</div>
                          <div className="mb-queue-desc">
                            {booking.status === 'in_progress'
                              ? '✅ Your turn — please go in now!'
                              : queueMsg(qPos)}
                          </div>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>Auto-refreshes every 15s</div>
                      </div>
                    )}

                    {/* Reschedule */}
                    {booking.status === 'waiting' && (
                      <div className="mb-action-panel">
                        <div>
                          <div className="mb-action-title">📅 Reschedule Appointment</div>
                          <div className="mb-action-desc">Change your date or time slot — free</div>
                        </div>
                        <button className="mb-reschedule-btn" onClick={() => openReschedule(booking)}>
                          Reschedule →
                        </button>
                      </div>
                    )}

                    {/* Cancel */}
                    {booking.status === 'waiting' && (
                      <div className="mb-action-panel">
                        <div>
                          <div className="mb-action-title">❌ Cancel Appointment</div>
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

      {/* Reschedule Modal */}
      {rescheduleBooking && (
        <div className="mb-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setRescheduleBooking(null); }}>
          <div className="mb-modal">
            <div className="mb-modal-title">📅 Reschedule Appointment</div>
            <div className="mb-modal-sub">Dr. {rescheduleBooking.doctor_name} · {rescheduleBooking.hospital_name}</div>

            <label className="mb-modal-label">Select New Date</label>
            <input
              type="date" className="mb-modal-input" min={today} value={newDate}
              onChange={(e) => { setNewDate(e.target.value); setNewSlot(''); }}
            />

            <label className="mb-modal-label">
              Select New Time Slot
              {newSlot && <span style={{ color: 'var(--blue-600)', marginLeft: 8, fontWeight: 600 }}>✓ {newSlot}</span>}
            </label>

            {doctorSlots.length === 0 ? (
              <p style={{ color: 'var(--gray-400)', fontSize: 13, marginBottom: 18 }}>
                No slots available for this doctor.
              </p>
            ) : (
              <div className="mb-slots-grid">
                {amSlots.length > 0 && (
                  <>
                    <div style={{ gridColumn: '1/-1', fontSize: 11, fontWeight: 600, color: 'var(--gray-400)', letterSpacing: 1 }}>🌅 Morning</div>
                    {amSlots.map((s) => (
                      <button key={s} className={`mb-slot-btn ${newSlot === s ? 'selected' : ''}`} onClick={() => setNewSlot(s)}>{s}</button>
                    ))}
                  </>
                )}
                {pmSlots.length > 0 && (
                  <>
                    <div style={{ gridColumn: '1/-1', fontSize: 11, fontWeight: 600, color: 'var(--gray-400)', letterSpacing: 1, marginTop: 8 }}>🌇 Afternoon / Evening</div>
                    {pmSlots.map((s) => (
                      <button key={s} className={`mb-slot-btn ${newSlot === s ? 'selected' : ''}`} onClick={() => setNewSlot(s)}>{s}</button>
                    ))}
                  </>
                )}
              </div>
            )}

            <div className="mb-modal-actions">
              <button className="mb-modal-cancel" onClick={() => setRescheduleBooking(null)}>Cancel</button>
              <button
                className="mb-modal-confirm"
                onClick={handleReschedule}
                disabled={rescheduling || !newDate || !newSlot}
              >
                {rescheduling ? '⏳ Saving…' : '✓ Confirm Reschedule'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`mb-toast ${toast.type}`}>{toast.msg}</div>}
    </>
  );
}