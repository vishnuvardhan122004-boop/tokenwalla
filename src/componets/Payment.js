import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import API from '../services/api';
import { computeFeeBreakdown } from '../services/fees';
import { providerLabel } from '../services/providerLabel';

const inr = (n) => Number(n).toFixed(2);

export default function Payment() {
  const location = useLocation();
  const navigate  = useNavigate();
  const {
    doctorId, doctorName, hospital,
    scanId, scanName,
    date, slot,
    queue_access = true,
  } = location.state || {};

  // One screen, either provider. The server prices whichever id it is sent and
  // is the only authority on the amount — this page never computes what to
  // charge, it only previews it.
  const isScan       = !!scanId;
  const providerId   = isScan ? scanId : doctorId;
  const providerName = isScan ? scanName : doctorName;
  // What the patient reads. Kept separate from `doctorName`, which is sent
  // verbatim to /payment/verify/ — labelling that would put "Dr. " into the
  // API payload.
  const providerKind    = isScan ? 'SCAN' : 'DOCTOR';
  const providerDisplay = providerLabel(providerName, providerKind);

  // The itemised bill comes from the SERVER (doctor.fee_breakdown, computed by
  // payments/fees.py — the same code that prices the order). We don't recompute
  // it here: a client-side copy can drift from the backend, and it would get
  // SERVICE_ONLY doctors wrong (their consultation fee is paid at the clinic,
  // not online). Until it loads, the pay button stays disabled.
  const [breakdown, setBreakdown] = useState(null);
  const [feeError,  setFeeError]  = useState('');
  const total = breakdown ? breakdown.final_amount : null;

  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(false);

  // Every message on this screen used a native alert(). On the one page where a
  // patient decides whether to hand over money, an unstyled OS dialog is the
  // wrong signal — and every other screen in the product (MyBookings, the admin
  // pages) already uses this toast. Same pattern, same tokens.
  //
  // `sticky` keeps the one thing alert() was actually good at. Two of these
  // fire AFTER the card is charged ("verification failed, contact support"),
  // and a message that vanishes in four seconds is worse than a blocking dialog
  // when the patient's money has already moved. Those stay until dismissed.
  const [toast, setToast] = useState(null);
  const showToast = (msg, type = 'error', sticky = false) => {
    setToast({ msg, type, sticky });
    if (!sticky) setTimeout(() => setToast(null), 4000);
  };

  // The Appointment Pass. `passData` is the server's offer AND whatever the
  // patient is already holding ({enabled, price, bookings, days, pass}), so the
  // price is never hard-coded here — change it in payments/fees.py and this
  // screen follows. Doctors only: the pass doesn't cover scans in v1.
  const [passData, setPassData] = useState(null);
  const [buyPass,  setBuyPass]  = useState(false);

  // "Book for someone else" — when on, the appointment is for another person
  // (name + mobile). Notifications still go to the logged-in account holder.
  const [forOther,    setForOther]    = useState(false);
  const [otherName,   setOtherName]   = useState('');
  const [otherMobile, setOtherMobile] = useState('');

  const bookedForName   = forOther ? otherName.trim()   : '';
  const bookedForMobile = forOther ? otherMobile.trim() : '';
  const patientLabel    = bookedForName || user?.name || user?.username;

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (stored) setUser(JSON.parse(stored));
    else navigate('/login');
  }, [navigate]);

  useEffect(() => {
    if (!providerId) { navigate('/alldoctor'); return; }
    let cancelled = false;
    // Drop the previous provider's figures first — otherwise a slow or failed
    // load leaves the last one's price on screen as if it were this one's.
    setBreakdown(null);
    setFeeError('');
    API.get(isScan ? `/scans/${scanId}/` : `/doctors/${doctorId}/`)
      .then(({ data }) => {
        if (cancelled) return;
        // A backend that predates fee_breakdown would leave this screen stuck on
        // "Loading…" forever, so fall back to the local mirror. It's a preview
        // either way — the amount charged is the server's order amount.
        setBreakdown(data.fee_breakdown
          || computeFeeBreakdown(isScan ? data.price : data.fee, data.payment_collection_mode));
      })
      .catch(() => { if (!cancelled) setFeeError('Could not load the fee details. Check your connection and try again.'); });
    return () => { cancelled = true; };
  }, [providerId, isScan, scanId, doctorId, navigate]);

  useEffect(() => {
    if (isScan) return;                     // scans can't use a pass in v1
    let cancelled = false;
    API.get('/payment/pass/')
      .then(({ data }) => { if (!cancelled) setPassData(data); })
      // A backend without the endpoint, or an offline moment, simply means no
      // pass on offer — never a blocked checkout.
      .catch(() => { if (!cancelled) setPassData(null); });
    return () => { cancelled = true; };
  }, [isScan]);

  // The pass waives the SERVICE fee only, so it applies where nothing else is
  // charged online. `collection_mode` is the server's own verdict, not a guess
  // from the numbers.
  const passOffered  = !!passData?.enabled && !isScan
                       && breakdown?.collection_mode === 'SERVICE_ONLY';
  const creditsLeft  = passData?.pass?.remaining || 0;
  // Holding one → spend it. Otherwise → offer to buy one.
  const canRedeem    = passOffered && creditsLeft > 0;
  const canBuy       = passOffered && creditsLeft === 0;
  const passSelected = canBuy && buyPass;
  const passExpiry   = passData?.pass?.expires_at
    ? new Date(passData.pass.expires_at).toLocaleDateString('en-IN',
        { day: 'numeric', month: 'short', year: 'numeric' })
    : '';

  // What the patient is actually charged now. A redemption is free; a pass
  // purchase is the server's quoted price; everything else is the usual bill.
  const payable = canRedeem ? 0 : passSelected ? Number(passData.price) : total;

  const goToToken = (verifyData, extra = {}) => navigate('/booking-token', {
    state: {
      token:        verifyData.token,
      doctorName:   providerDisplay,
      hospital,
      doctorMobile: location.state?.doctorMobile,
      date, slot,
      paymentId:    verifyData.booking?.paymentId,
      userName:     bookedForName || user?.name || user?.username,
      queue_access,
      // >0 only for a SERVICE_ONLY doctor — the token page shows the
      // "pay the consultation fee at the hospital" note off this.
      // The verify response is authoritative; the checkout preview
      // covers the idempotent replay, which omits the breakdown.
      offlineDoctorFee: Number(
        verifyData.booking?.breakdown?.offline_doctor_fee
        ?? breakdown?.offline_doctor_fee ?? 0
      ),
      // Visits left on the pass after this booking, when one was involved.
      passRemaining: verifyData.pass?.remaining ?? null,
      ...extra,
    }
  });

  // Spending a credit: no gateway, no order, no Checkout. The server re-checks
  // the pass, the doctor and the slot — this button only asks.
  const handleRedeem = async () => {
    if (forOther) {
      if (bookedForName.length < 2) { showToast("Please enter the other person's name."); return; }
      if (!/^[6-9]\d{9}$/.test(bookedForMobile)) { showToast("Please enter a valid 10-digit mobile number for the other person."); return; }
    }
    setLoading(true);
    try {
      const { data } = await API.post('/payment/pass/redeem/', {
        doctorId, hospital, date, slot, bookedForName, bookedForMobile,
      });
      if (data.success) goToToken(data);
      else { showToast(data.message || 'Could not use your pass.'); setLoading(false); }
    } catch (err) {
      showToast(err?.response?.data?.message || 'Could not use your pass. Please try again.');
      setLoading(false);
    }
  };

  const loadScript = () => new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);

    // A tag can already be here from a load that FAILED (ad blocker, offline,
    // CSP). Its load event fired — or never will — long before we could listen,
    // so the old code's bare addEventListener('load') resolved nothing and the
    // promise hung forever. handlePayment awaits this after setLoading(true),
    // so the checkout button span permanently and the patient could not pay or
    // recover without reloading the page. Dropping the dead tag makes the retry
    // a genuine retry.
    const existing = document.getElementById('razorpay-sdk');
    if (existing) existing.remove();

    const s = document.createElement('script');
    s.id = 'razorpay-sdk';
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    // Resolve on BOTH outcomes, and only once — a promise that never settles is
    // worse than one that reports failure, because the caller can show an error.
    s.onload  = () => resolve(Boolean(window.Razorpay));
    s.onerror = () => { s.remove(); resolve(false); };
    document.body.appendChild(s);
  });

  const handlePayment = async () => {
    // Validate the "book for someone else" details before charging.
    if (forOther) {
      if (bookedForName.length < 2) { showToast("Please enter the other person's name."); return; }
      if (!/^[6-9]\d{9}$/.test(bookedForMobile)) { showToast("Please enter a valid 10-digit mobile number for the other person."); return; }
    }
    setLoading(true);
    try {
      const ready = await loadScript();
      if (!ready || !window.Razorpay) { showToast('Razorpay SDK failed. Check internet.'); setLoading(false); return; }

      // Server computes the full fee from the doctor's consultation fee — we
      // send only doctorId, never an amount. It returns a Razorpay order_id +
      // the public key id to open Checkout with.
      // date + slot let the server reject a full or expired slot BEFORE the
      // payment happens, so a collision is a clean message instead of a
      // charge-then-refund. The server re-checks after capture regardless.
      const { data: orderData } = await API.post('/payment/create-order/', {
        ...(isScan ? { scanId } : { doctorId }), date, slot,
        // Opt-in per checkout. The server prices and tags the order — this flag
        // only asks for the upgrade, it never says what it costs.
        ...(passSelected ? { buyPass: true } : {}),
      });

      const verify = async () => {
        try {
          const { data: verifyData } = await API.post('/payment/verify/', {
            order_id: orderData.order_id,
            booking: {
              ...(isScan ? { scanId, scanName } : { doctorId, doctorName }),
              hospital, date, slot, queue_access, bookedForName, bookedForMobile,
            },
          });
          if (verifyData.success) {
            goToToken(verifyData);
          } else {
            showToast(verifyData.message || 'Verification failed. Contact support.', 'error', true);
            setLoading(false);
          }
        } catch {
          showToast('Verification error. Contact support.', 'error', true);
          setLoading(false);
        }
      };

      // We ignore the razorpay_signature Checkout hands back here — the
      // server confirms the payment itself (fetches the order + its
      // payments from Razorpay) rather than trusting a client signature.
      const rzp = new window.Razorpay({
        key:      orderData.key,
        // The SERVER's amount, not our preview total — the preview is computed
        // from a client-side mirror of the fee math (services/fees.js) and would
        // be wrong the moment the two drift, or for a SERVICE_ONLY doctor.
        amount:   Math.round(Number(orderData.amount) * 100),
        currency: orderData.currency || 'INR',
        order_id: orderData.order_id,
        name:     'TokenWalla',
        description: `${isScan ? 'Test' : 'Consultation'} — ${providerDisplay}`,
        prefill: {
          name:     bookedForName || user?.name || user?.username,
          contact:  user?.mobile || '',
        },
        theme: { color: '#185FA5' },
        handler: verify,
        modal: {
          ondismiss: () => setLoading(false),
        },
      });
      rzp.on('payment.failed', (resp) => {
        showToast(resp?.error?.description || 'Payment was not completed.');
        setLoading(false);
      });
      rzp.open();
    } catch (err) {
      showToast(err?.response?.data?.message || 'Could not initiate payment.');
      setLoading(false);
    }
  };

  if (!user || !providerId) return null;

  return (
    <>
      <style>{`
        /* Toast — replaces the native alert() dialogs. Uses the shared status
           tokens so it reads the same as the toast on every other screen, and
           sits above the Razorpay overlay (z-index 9999) since two of these
           fire while checkout is still on screen. */
        .pay-toast {
          position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
          display: flex; align-items: center; gap: 4px;
          max-width: min(92vw, 520px); padding: 12px 18px;
          border-radius: var(--radius-md); border: 1px solid transparent;
          font-size: 14px; font-weight: 500; line-height: 1.45;
          box-shadow: var(--shadow-lg); z-index: 10000; cursor: pointer;
          animation: pay-toast-in 180ms cubic-bezier(.4,0,.2,1);
        }
        .pay-toast.error {
          background: var(--color-error-bg); color: var(--color-error-text);
          border-color: var(--color-error-border);
        }
        .pay-toast.success {
          background: var(--color-success-bg); color: var(--color-success-text);
          border-color: var(--color-success-border);
        }
        .pay-toast-x {
          background: none; border: 0; padding: 0 0 0 10px; margin-left: auto;
          font-size: 20px; line-height: 1; color: inherit; opacity: .65; cursor: pointer;
        }
        .pay-toast-x:hover { opacity: 1; }
        @keyframes pay-toast-in {
          from { opacity: 0; transform: translate(-50%, 8px); }
          to   { opacity: 1; transform: translate(-50%, 0); }
        }
        @media (prefers-reduced-motion: reduce) { .pay-toast { animation: none; } }
        /* Fonts + reset come from the global design system (index.css). */
        .pay-root {
          font-family: var(--font-body);
          background: linear-gradient(160deg, var(--color-surface) 0%, #EAF3FF 60%, #F8FBFF 100%);
          min-height: 100vh; padding: 60px 0 80px; position: relative;
        }
        .pay-grid {
          position: fixed; inset: 0; pointer-events: none;
          background-image:
            linear-gradient(var(--blue-100) 1px, transparent 1px),
            linear-gradient(90deg, var(--blue-100) 1px, transparent 1px);
          background-size: 52px 52px; opacity: 0.35;
        }
        .pay-inner { position: relative; z-index: 1; max-width: 580px; margin: 0 auto; padding: 0 20px; }

        .pay-back {
          display: inline-flex; align-items: center; gap: 8px;
          background: #fff; border: 1px solid var(--blue-100); border-radius: var(--radius-md);
          padding: 8px 16px; font-size: 13px; color: var(--blue-600);
          cursor: pointer; transition: all 0.2s; margin-bottom: 28px;
          font-family: var(--font-body);
        }
        .pay-back:hover { border-color: var(--blue-400); background: var(--blue-50); }

        .pay-title {
          font-family: var(--font-display);
          font-size: clamp(1.6rem, 4vw, 2rem); font-weight: 800;
          color: var(--gray-900); margin-bottom: 6px;
          animation: payUp 0.5s ease both;
        }
        .pay-sub { font-size: 14px; color: var(--gray-600); margin-bottom: 32px; animation: payUp 0.5s 0.05s ease both; }

        /* Summary card */
        .pay-card {
          background: #fff; border: 1px solid var(--blue-100);
          border-radius: var(--radius-xl); overflow: hidden; margin-bottom: 16px;
          box-shadow: 0 8px 32px rgba(24,95,165,0.08);
          animation: payUp 0.5s 0.05s ease both;
        }
        .pay-card-header {
          padding: 16px 22px; border-bottom: 1px solid var(--blue-50);
          display: flex; align-items: center; gap: 12px;
          background: linear-gradient(160deg, var(--color-surface), #EAF3FF);
          position: relative; overflow: hidden;
        }
        .pay-card-header::before {
          content:''; position:absolute; top:0;left:0;right:0;height:3px;
          background: linear-gradient(90deg, var(--blue-600), var(--blue-400), var(--blue-200));
        }
        .pay-card-header-icon {
          width: 36px; height: 36px; border-radius: var(--radius-md);
          background: var(--blue-50); display: flex; align-items: center;
          justify-content: center; font-size: 18px; flex-shrink: 0;
        }
        .pay-card-header-title {
          font-family: var(--font-display);
          font-size: 15px; font-weight: 700; color: var(--gray-900);
        }

        .pay-rows { padding: 8px 22px; }
        .pay-row {
          display: flex; justify-content: space-between; align-items: center;
          padding: 12px 0; border-bottom: 1px solid var(--gray-100); font-size: 14px;
        }
        .pay-row:last-child { border-bottom: none; }
        .pay-row-label { color: var(--gray-600); }
        .pay-row-value { font-weight: 500; color: var(--gray-900); }

        .pay-plan-badge {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 4px 12px; border-radius: 100px; font-size: 12px; font-weight: 600;
          background: var(--blue-50); border: 1px solid var(--blue-100); color: var(--blue-600);
        }

        .pay-total-row {
          display: flex; justify-content: space-between; align-items: center;
          padding: 16px 22px; border-top: 1px solid var(--blue-50);
          background: var(--color-surface);
        }
        .pay-total-label {
          font-family: var(--font-display);
          font-size: 15px; font-weight: 700; color: var(--gray-900);
        }
        .pay-total-amount {
          font-family: var(--font-display);
          font-size: 2rem; font-weight: 800; color: var(--blue-600);
        }

        /* Book for someone else */
        .pay-other-card { animation: payUp 0.5s 0.08s ease both; }

        /* ── Appointment Pass ─────────────────────────────────────────────── */
        .pay-pass-card { animation: payUp 0.5s 0.06s ease both; padding: 16px 22px 6px; }
        .pay-pass-card.pay-pass-active {
          padding-bottom: 18px;
          border: 1px solid var(--blue-100); background: var(--blue-50);
        }
        .pay-pass-badge {
          display: inline-block; margin-bottom: 10px; padding: 3px 10px;
          background: var(--blue-600); border-radius: 100px;
          font-size: 11px; font-weight: 700; letter-spacing: 0.02em; color: #fff;
        }
        .pay-pass-title {
          font-family: var(--font-display); font-size: 15px; font-weight: 700;
          color: var(--gray-900); margin-bottom: 4px;
        }
        .pay-pass-desc { font-size: 12px; color: var(--gray-600); line-height: 1.5; }
        .pay-pass-free { color: var(--blue-600); }
        .pay-pass-option {
          display: flex; align-items: flex-start; gap: 12px; cursor: pointer;
          padding: 12px 14px; margin-bottom: 10px;
          border: 1px solid var(--gray-200); border-radius: 12px;
          transition: border-color 0.15s ease, background 0.15s ease;
        }
        .pay-pass-option input { margin-top: 3px; accent-color: var(--blue-600); cursor: pointer; flex-shrink: 0; }
        .pay-pass-option.pay-pass-chosen { border-color: var(--blue-600); background: var(--blue-50); }
        .pay-pass-option-title {
          font-family: var(--font-display); font-size: 14px; font-weight: 700;
          color: var(--gray-900); margin-bottom: 2px;
        }
        .pay-pass-option-desc { font-size: 12px; color: var(--gray-600); line-height: 1.5; }
        .pay-pass-save {
          display: inline-block; margin-left: 8px; padding: 2px 8px;
          background: #E8F7EE; border: 1px solid #BFE6CE; border-radius: 100px;
          font-size: 11px; font-weight: 700; color: #1B7F45; vertical-align: middle;
        }
        .pay-for-tag {
          display: inline-block; margin-left: 8px; padding: 2px 8px;
          background: var(--blue-50); border: 1px solid var(--blue-100); border-radius: 100px;
          font-size: 11px; font-weight: 600; color: var(--blue-600); vertical-align: middle;
        }
        .pay-other-toggle {
          display: flex; align-items: center; justify-content: space-between; gap: 14px;
          padding: 16px 22px; cursor: pointer;
        }
        .pay-other-title { font-family: var(--font-display); font-size: 15px; font-weight: 700; color: var(--gray-900); margin-bottom: 2px; }
        .pay-other-desc  { font-size: 12px; color: var(--gray-600); }
        .pay-other-switch { width: 20px; height: 20px; accent-color: var(--blue-600); cursor: pointer; flex-shrink: 0; }
        .pay-other-fields { padding: 4px 22px 20px; border-top: 1px solid var(--blue-50); }
        .pay-other-field { margin-top: 14px; }
        .pay-other-label { display: block; font-size: 12px; font-weight: 600; color: var(--gray-700); margin-bottom: 6px; }
        .pay-other-input {
          width: 100%; background: var(--gray-50); border: 1px solid var(--blue-100);
          border-radius: var(--radius-md); padding: 11px 14px;
          font-family: var(--font-body); font-size: 15px; color: var(--gray-900);
          outline: none; transition: all 0.15s;
        }
        .pay-other-input:focus { border-color: var(--blue-400); background: #fff; box-shadow: 0 0 0 3px rgba(55,138,221,0.12); }
        .pay-other-note { margin: 14px 0 0; font-size: 11.5px; color: var(--gray-500); line-height: 1.5; }

        /* Secure badge */
        .pay-secure {
          display: flex; align-items: center; gap: 14px;
          background: #fff; border: 1px solid var(--blue-100);
          border-radius: var(--radius-lg); padding: 16px 20px; margin-bottom: 16px;
          animation: payUp 0.5s 0.1s ease both;
        }
        .pay-secure-icon {
          width: 44px; height: 44px; border-radius: var(--radius-lg);
          background: var(--blue-50); display: flex; align-items: center;
          justify-content: center; font-size: 22px; flex-shrink: 0;
        }
        .pay-secure-title { font-size: 14px; font-weight: 600; color: var(--gray-900); margin-bottom: 2px; }
        .pay-secure-desc { font-size: 12px; color: var(--gray-600); }
        .pay-methods { display: flex; gap: 7px; flex-wrap: wrap; margin-top: 7px; }
        .pay-method-chip {
          background: var(--blue-50); border: 1px solid var(--blue-100);
          border-radius: var(--radius-sm); padding: 3px 10px;
          font-size: 11px; color: var(--blue-600); font-weight: 500;
        }

        /* Pay button */
        .pay-btn {
          width: 100%; padding: 16px; border-radius: var(--radius-lg); border: none;
          background: var(--blue-600); color: #fff;
          font-family: var(--font-body); font-size: 16px; font-weight: 600;
          cursor: pointer; transition: all 0.25s;
          box-shadow: 0 6px 24px rgba(24,95,165,0.25);
          display: flex; align-items: center; justify-content: center; gap: 10px;
          animation: payUp 0.5s 0.15s ease both;
        }
        .pay-btn:hover:not(:disabled) {
          background: var(--blue-800);
          box-shadow: 0 12px 32px rgba(24,95,165,0.35);
          transform: translateY(-1px);
        }
        .pay-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
        .pay-spinner {
          width: 20px; height: 20px;
          border: 2px solid rgba(255,255,255,0.35); border-top-color: #fff;
          border-radius: 50%; animation: paySpin 0.7s linear infinite; flex-shrink: 0;
        }
        @keyframes paySpin { to{transform:rotate(360deg)} }

        .pay-note {
          text-align: center; margin: 14px 0 0;
          font-size: 12px; color: var(--gray-400); line-height: 1.6;
          animation: payUp 0.5s 0.2s ease both;
        }

        @keyframes payUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      <div className="pay-root">
        <div className="pay-grid" />
        <div className="pay-inner">

          <button className="pay-back" onClick={() => navigate(-1)}>← Back</button>

          <div className="pay-title">Complete Payment</div>
          <div className="pay-sub">Review your appointment details before paying</div>

          {/* Summary card */}
          <div className="pay-card">
            <div className="pay-card-header">
              <div className="pay-card-header-icon"><i className="bi bi-clipboard me-1" /></div>
              <div className="pay-card-header-title">Appointment Summary</div>
            </div>
            <div className="pay-rows">
              <div className="pay-row">
                <span className="pay-row-label">{isScan ? 'Test' : 'Doctor'}</span>
                <span className="pay-row-value">{providerDisplay}</span>
              </div>
              <div className="pay-row">
                <span className="pay-row-label">Hospital</span>
                <span className="pay-row-value"><i className="bi bi-hospital me-1" />{hospital}</span>
              </div>
              <div className="pay-row">
                <span className="pay-row-label">Date</span>
                <span className="pay-row-value">{date}</span>
              </div>
              <div className="pay-row">
                <span className="pay-row-label">Slot</span>
                <span className="pay-row-value">{slot}</span>
              </div>
              <div className="pay-row">
                <span className="pay-row-label">Patient</span>
                <span className="pay-row-value">
                  {patientLabel}
                  {forOther && bookedForName && <span className="pay-for-tag">for someone else</span>}
                </span>
              </div>
            </div>
          </div>

          {/* Fee breakdown — itemised receipt */}
          <div className="pay-card">
            <div className="pay-card-header">
              <div className="pay-card-header-icon"><i className="bi bi-receipt me-1" /></div>
              <div className="pay-card-header-title">Payment Details</div>
            </div>
            {!breakdown ? (
              <div className="pay-rows">
                <div className="pay-row">
                  <span className="pay-row-label">{feeError || 'Loading fee details…'}</span>
                  {feeError && (
                    <button className="pay-back" style={{ margin: 0 }} onClick={() => window.location.reload()}>
                      Retry
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="pay-rows">
                {/* SERVICE_ONLY doctors collect the consultation fee at the
                    clinic, so it is NOT part of the online total. */}
                {Number(breakdown.offline_doctor_fee) > 0 ? (
                  <div className="pay-row">
                    <span className="pay-row-label">
                      Doctor Consultation Fee
                      <span className="pay-for-tag">pay at clinic</span>
                    </span>
                    <span className="pay-row-value">₹{inr(breakdown.offline_doctor_fee)}</span>
                  </div>
                ) : (
                  <div className="pay-row">
                    <span className="pay-row-label">Doctor Consultation Fee</span>
                    <span className="pay-row-value">₹{inr(breakdown.doctor_fee)}</span>
                  </div>
                )}
                {/* A pass replaces the three service-fee lines with one. The
                    GST split of ₹35 is computed server-side and itemised on the
                    receipt — this screen never does money math. */}
                {canRedeem ? (
                  <div className="pay-row">
                    <span className="pay-row-label">
                      Service Fee
                      <span className="pay-for-tag">paid by your pass</span>
                    </span>
                    <span className="pay-row-value pay-pass-free">₹0.00</span>
                  </div>
                ) : passSelected ? (
                  <div className="pay-row">
                    <span className="pay-row-label">
                      Appointment Pass
                      <span className="pay-for-tag">
                        {passData.bookings} visits · {passData.days} days
                      </span>
                    </span>
                    <span className="pay-row-value">₹{inr(passData.price)}</span>
                  </div>
                ) : (
                  <>
                    <div className="pay-row">
                      <span className="pay-row-label">Platform Fee</span>
                      <span className="pay-row-value">₹{inr(breakdown.platform_fee)}</span>
                    </div>
                    <div className="pay-row">
                      <span className="pay-row-label">Payment Gateway Fee</span>
                      <span className="pay-row-value">₹{inr(breakdown.gateway_fee)}</span>
                    </div>
                    <div className="pay-row">
                      <span className="pay-row-label">GST (18%)</span>
                      <span className="pay-row-value">₹{inr(breakdown.gst_amount)}</span>
                    </div>
                  </>
                )}
              </div>
            )}
            <div className="pay-total-row">
              <span className="pay-total-label">Total Payable Now</span>
              <span className="pay-total-amount">
                {payable === null ? '—' : `₹${inr(payable)}`}
              </span>
            </div>
          </div>

          {/* The Appointment Pass — either spend one or buy one, never both. */}
          {canRedeem && (
            <div className="pay-card pay-pass-card pay-pass-active">
              <div className="pay-pass-badge"><i className="bi bi-ticket-perforated me-1" />
                Appointment Pass
              </div>
              <div className="pay-pass-title">
                This visit is covered — no payment needed.
              </div>
              <div className="pay-pass-desc">
                {creditsLeft === 1
                  ? 'This is the last visit on your pass'
                  : `${creditsLeft} visits left on your pass`}
                {passExpiry && ` · valid to ${passExpiry}`}
                {Number(breakdown?.offline_doctor_fee) > 0
                  && ` · the ₹${inr(breakdown.offline_doctor_fee)} consultation fee is still paid at the clinic`}
              </div>
            </div>
          )}

          {canBuy && (
            <div className="pay-card pay-pass-card">
              <div className="pay-pass-badge"><i className="bi bi-ticket-perforated me-1" />
                Save on your next visit
              </div>
              <label className={`pay-pass-option${!buyPass ? ' pay-pass-chosen' : ''}`}>
                <input type="radio" name="pay-pass" checked={!buyPass}
                       onChange={() => setBuyPass(false)} />
                <div>
                  <div className="pay-pass-option-title">
                    Just this visit — ₹{inr(total)}
                  </div>
                  <div className="pay-pass-option-desc">The usual service fee.</div>
                </div>
              </label>
              <label className={`pay-pass-option${buyPass ? ' pay-pass-chosen' : ''}`}>
                <input type="radio" name="pay-pass" checked={buyPass}
                       onChange={() => setBuyPass(true)} />
                <div>
                  <div className="pay-pass-option-title">
                    Appointment Pass — ₹{inr(passData.price)}
                    <span className="pay-pass-save">
                      save ₹{inr(Number(total) * passData.bookings - Number(passData.price))}
                    </span>
                  </div>
                  <div className="pay-pass-option-desc">
                    This visit plus {passData.bookings - 1} more, at any doctor,
                    within {passData.days} days. Service fee only — consultation
                    fees are still paid at the clinic.
                  </div>
                </div>
              </label>
            </div>
          )}

          {/* Book for someone else */}
          <div className="pay-card pay-other-card">
            <label className="pay-other-toggle">
              <div>
                <div className="pay-other-title"><i className="bi bi-people me-1" />Booking for someone else?</div>
                <div className="pay-other-desc">Book this appointment for a family member or friend</div>
              </div>
              <input
                type="checkbox"
                className="pay-other-switch"
                checked={forOther}
                onChange={(e) => setForOther(e.target.checked)}
              />
            </label>

            {forOther && (
              <div className="pay-other-fields">
                <div className="pay-other-field">
                  <label className="pay-other-label">Patient's full name</label>
                  <input
                    className="pay-other-input"
                    type="text"
                    placeholder="e.g. Rahul Kumar"
                    value={otherName}
                    onChange={(e) => setOtherName(e.target.value)}
                    maxLength={100}
                  />
                </div>
                <div className="pay-other-field">
                  <label className="pay-other-label">Patient's mobile number</label>
                  <input
                    className="pay-other-input"
                    type="tel"
                    inputMode="numeric"
                    placeholder="10-digit mobile number"
                    value={otherMobile}
                    onChange={(e) => setOtherMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    maxLength={10}
                  />
                </div>
                <p className="pay-other-note">
                  ℹ️ Appointment updates (SMS/WhatsApp) are sent to your account. The hospital sees this patient's name at reception.
                </p>
              </div>
            )}
          </div>

          {/* Secure badge — nothing is being charged on a pass visit, so a
              "Secured by Razorpay · UPI · Cards" panel is just noise there. */}
          {!canRedeem && (
          <div className="pay-secure">
            <div className="pay-secure-icon"><i className="bi bi-shield-lock me-1" /></div>
            <div>
              <div className="pay-secure-title">Secured by Razorpay</div>
              <div className="pay-secure-desc">256-bit SSL encrypted · PCI DSS compliant</div>
              <div className="pay-methods">
                {['UPI', 'Cards', 'Net Banking', 'Wallets'].map(m => (
                  <span className="pay-method-chip" key={m}>{m}</span>
                ))}
              </div>
            </div>
          </div>
          )}

          {/* Pay button */}
          <button
            className="pay-btn"
            onClick={canRedeem ? handleRedeem : handlePayment}
            disabled={loading || !breakdown}
          >
            {loading
              ? <><div className="pay-spinner" />
                  {canRedeem ? ' Confirming…' : ' Opening Payment Gateway…'}</>
              : !breakdown
                ? <>{feeError ? 'Fee details unavailable' : 'Loading…'}</>
                : canRedeem
                  ? <><i className="bi bi-ticket-perforated me-1" />Use your pass — Confirm Appointment</>
                  : <><i className="bi bi-credit-card me-1" />Pay ₹{inr(payable)} & Confirm Appointment</>
            }
          </button>

          <p className="pay-note">
            By paying, you agree to our Terms & Conditions.<br />
            {canRedeem
              ? 'Cancel at least 2 hours before your slot and the visit goes back on your pass.'
              : 'Refundable if cancelled at least 2 hours before your slot.'}
          </p>
        </div>
      </div>

      {toast && (
        <div
          className={`pay-toast ${toast.type}`}
          role="alert"
          aria-live="assertive"
          onClick={() => setToast(null)}
        >
          <i className={`bi ${toast.type === 'success' ? 'bi-check-circle-fill' : 'bi-exclamation-circle-fill'} me-2`} />
          <span>{toast.msg}</span>
          {toast.sticky && (
            <button
              type="button"
              className="pay-toast-x"
              aria-label="Dismiss"
              onClick={() => setToast(null)}
            >
              &times;
            </button>
          )}
        </div>
      )}
    </>
  );
}