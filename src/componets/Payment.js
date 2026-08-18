import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import API from '../services/api';
import { computeFeeBreakdown } from '../services/fees';

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

  const loadScript = () => new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const existing = document.getElementById('razorpay-sdk');
    if (existing) {
      existing.addEventListener('load', () => resolve(true), { once: true });
      return;
    }
    const s = document.createElement('script');
    s.id = 'razorpay-sdk';
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload  = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });

  const handlePayment = async () => {
    // Validate the "book for someone else" details before charging.
    if (forOther) {
      if (bookedForName.length < 2) { alert("Please enter the other person's name."); return; }
      if (!/^[6-9]\d{9}$/.test(bookedForMobile)) { alert("Please enter a valid 10-digit mobile number for the other person."); return; }
    }
    setLoading(true);
    try {
      const ready = await loadScript();
      if (!ready || !window.Razorpay) { alert('Razorpay SDK failed. Check internet.'); setLoading(false); return; }

      // Server computes the full fee from the doctor's consultation fee — we
      // send only doctorId, never an amount. It returns a Razorpay order_id +
      // the public key id to open Checkout with.
      // date + slot let the server reject a full or expired slot BEFORE the
      // payment happens, so a collision is a clean message instead of a
      // charge-then-refund. The server re-checks after capture regardless.
      const { data: orderData } = await API.post('/payment/create-order/', {
        ...(isScan ? { scanId } : { doctorId }), date, slot,
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
            navigate('/booking-token', {
              state: {
                token:        verifyData.token,
                doctorName,
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
              }
            });
          } else {
            alert(verifyData.message || 'Verification failed. Contact support.');
            setLoading(false);
          }
        } catch {
          alert('Verification error. Contact support.');
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
        description: `Consultation with ${providerName}`,
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
        alert(resp?.error?.description || 'Payment was not completed.');
        setLoading(false);
      });
      rzp.open();
    } catch (err) {
      alert(err?.response?.data?.message || 'Could not initiate payment.');
      setLoading(false);
    }
  };

  if (!user || !providerId) return null;

  return (
    <>
      <style>{`
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
                <span className="pay-row-label">Doctor</span>
                <span className="pay-row-value">{providerName}</span>
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
              </div>
            )}
            <div className="pay-total-row">
              <span className="pay-total-label">Total Payable Now</span>
              <span className="pay-total-amount">{total === null ? '—' : `₹${inr(total)}`}</span>
            </div>
          </div>

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

          {/* Secure badge */}
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

          {/* Pay button */}
          <button className="pay-btn" onClick={handlePayment} disabled={loading || !breakdown}>
            {loading
              ? <><div className="pay-spinner" /> Opening Payment Gateway…</>
              : !breakdown
                ? <>{feeError ? 'Fee details unavailable' : 'Loading…'}</>
                : <><i className="bi bi-credit-card me-1" />Pay ₹{inr(total)} & Confirm Appointment</>
            }
          </button>

          <p className="pay-note">
            By paying, you agree to our Terms & Conditions.<br />
            Refundable if cancelled at least 2 hours before your slot.
          </p>
        </div>
      </div>
    </>
  );
}