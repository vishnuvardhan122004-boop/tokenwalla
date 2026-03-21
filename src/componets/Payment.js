import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import API from '../services/api';

const RAZORPAY_KEY_ID = process.env.REACT_APP_RAZORPAY_KEY_ID || 'rzp_test_XXXXXXXXXXXXXXXX';

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&display=swap');

  .pay-wrap {
    font-family: 'DM Sans', sans-serif;
    background: #00133A;
    min-height: 100vh;
    color: white;
    padding: 60px 0 80px;
  }

  .pay-bg {
    position: fixed; inset: 0; z-index: 0;
    background:
      radial-gradient(ellipse 60% 60% at 80% 20%, rgba(0,87,255,0.15) 0%, transparent 60%),
      radial-gradient(ellipse 50% 50% at 20% 80%, rgba(0,212,255,0.08) 0%, transparent 50%);
    pointer-events: none;
  }

  .pay-grid {
    position: fixed; inset: 0; z-index: 0;
    background-image:
      linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px);
    background-size: 60px 60px;
    pointer-events: none;
  }

  .pay-inner {
    position: relative; z-index: 1;
    max-width: 600px; margin: 0 auto;
    padding: 0 20px;
  }

  /* ── BACK ── */
  .pay-back {
    display: inline-flex; align-items: center; gap: 8px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 10px; padding: 8px 16px;
    font-size: 13px; color: rgba(255,255,255,0.5);
    cursor: pointer; transition: all 0.2s;
    margin-bottom: 32px;
    font-family: 'DM Sans', sans-serif;
  }

  .pay-back:hover { background: rgba(255,255,255,0.08); color: white; }

  /* ── PAGE TITLE ── */
  .pay-title {
    font-family: 'Syne', sans-serif;
    font-size: clamp(1.6rem, 4vw, 2.2rem);
    font-weight: 800; margin-bottom: 6px;
    animation: payFadeUp 0.5s ease both;
  }

  .pay-sub {
    font-size: 14px; color: rgba(255,255,255,0.4);
    margin-bottom: 36px;
    animation: payFadeUp 0.5s 0.05s ease both;
  }

  /* ── CARD ── */
  .pay-card {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 22px;
    overflow: hidden;
    margin-bottom: 20px;
    animation: payFadeUp 0.5s ease both;
  }

  .pay-card-header {
    padding: 18px 24px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    display: flex; align-items: center; gap: 12px;
    background: rgba(0,87,255,0.05);
  }

  .pay-card-header-icon {
    width: 36px; height: 36px; border-radius: 10px;
    background: rgba(0,87,255,0.15);
    display: flex; align-items: center; justify-content: center;
    font-size: 18px;
  }

  .pay-card-header-title {
    font-family: 'Syne', sans-serif;
    font-size: 15px; font-weight: 700;
  }

  /* ── SUMMARY ROWS ── */
  .pay-summary-body { padding: 8px 24px; }

  .pay-row {
    display: flex; justify-content: space-between;
    align-items: center;
    padding: 13px 0;
    border-bottom: 1px solid rgba(255,255,255,0.04);
    font-size: 14px;
  }

  .pay-row:last-child { border-bottom: none; }
  .pay-row-label { color: rgba(255,255,255,0.4); }
  .pay-row-value { font-weight: 500; color: rgba(255,255,255,0.85); }

  /* ── PLAN BADGE ── */
  .pay-plan-badge {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 5px 12px; border-radius: 100px;
    font-size: 12px; font-weight: 600;
  }

  .pay-plan-badge.basic {
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.1);
    color: rgba(255,255,255,0.6);
  }

  .pay-plan-badge.queue {
    background: rgba(0,212,255,0.1);
    border: 1px solid rgba(0,212,255,0.25);
    color: #00D4FF;
  }

  /* ── TOTAL ── */
  .pay-total-row {
    display: flex; justify-content: space-between;
    align-items: center;
    padding: 18px 24px;
    border-top: 1px solid rgba(255,255,255,0.07);
    background: rgba(0,87,255,0.04);
  }

  .pay-total-label {
    font-family: 'Syne', sans-serif;
    font-size: 15px; font-weight: 700;
  }

  .pay-total-amount {
    font-family: 'Syne', sans-serif;
    font-size: 2rem; font-weight: 800;
    background: linear-gradient(135deg, #00D4FF, #00F5C4);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  /* ── SECURE BADGE ── */
  .pay-secure {
    display: flex; align-items: center; gap: 14px;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 16px;
    padding: 16px 20px;
    margin-bottom: 20px;
    animation: payFadeUp 0.5s 0.1s ease both;
  }

  .pay-secure-icon {
    width: 44px; height: 44px; border-radius: 12px;
    background: rgba(0,87,255,0.15);
    display: flex; align-items: center; justify-content: center;
    font-size: 22px; flex-shrink: 0;
  }

  .pay-secure-title {
    font-size: 14px; font-weight: 600; margin-bottom: 2px;
  }

  .pay-secure-desc { font-size: 12px; color: rgba(255,255,255,0.35); }

  .pay-methods {
    display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px;
  }

  .pay-method-chip {
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 8px; padding: 4px 10px;
    font-size: 11px; color: rgba(255,255,255,0.45);
  }

  /* ── PAY BUTTON ── */
  .pay-btn {
    width: 100%; padding: 18px;
    border-radius: 16px; border: none;
    background: linear-gradient(135deg, #0057FF, #0040CC);
    color: white;
    font-family: 'DM Sans', sans-serif;
    font-size: 17px; font-weight: 600;
    cursor: pointer; transition: all 0.25s;
    box-shadow: 0 8px 32px rgba(0,87,255,0.35);
    display: flex; align-items: center; justify-content: center; gap: 12px;
    animation: payFadeUp 0.5s 0.15s ease both;
  }

  .pay-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 16px 40px rgba(0,87,255,0.5);
  }

  .pay-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

  .pay-spinner {
    width: 20px; height: 20px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: paySpin 0.7s linear infinite;
    flex-shrink: 0;
  }

  .pay-note {
    text-align: center; margin-top: 16px;
    font-size: 12px; color: rgba(255,255,255,0.2);
    line-height: 1.6;
    animation: payFadeUp 0.5s 0.2s ease both;
  }

  /* ── ANIMATIONS ── */
  @keyframes payFadeUp {
    from { opacity: 0; transform: translateY(16px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  @keyframes paySpin {
    to { transform: rotate(360deg); }
  }
`;

export default function Payment() {
  const location = useLocation();
  const navigate  = useNavigate();
  const {
    doctorId, doctorName, hospital,
    date, slot, fee = 10, amount = 1000,
    queue_access = false,
  } = location.state || {};

  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (stored) setUser(JSON.parse(stored));
    else { navigate('/login'); }
  }, [navigate]);

  useEffect(() => {
    if (!doctorId) navigate('/alldoctor');
  }, [doctorId, navigate]);

  const loadScript = () => new Promise((resolve) => {
    if (document.getElementById('razorpay-script')) return resolve(true);
    const s = document.createElement('script');
    s.id = 'razorpay-script';
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload  = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });

  const handlePayment = async () => {
    setLoading(true);
    try {
      const ready = await loadScript();
      if (!ready) { alert('Razorpay SDK failed. Check internet.'); setLoading(false); return; }

      const { data: orderData } = await API.post('/payment/create-order/', {
        amount,
        currency: 'INR',
        notes: { doctorId, doctorName, hospital, date, slot },
      });

      const options = {
        key:         RAZORPAY_KEY_ID,
        amount:      orderData.amount,
        currency:    orderData.currency,
        name:        'TokenWalla',
        description: `Appointment — Dr. ${doctorName}`,
        order_id:    orderData.order_id,
        prefill:     { name: user?.name || '', contact: user?.mobile || '' },
        theme:       { color: '#0057FF' },

        handler: async (response) => {
          try {
            const { data: verifyData } = await API.post('/payment/verify/', {
              razorpay_order_id:   response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature:  response.razorpay_signature,
              booking: { doctorId, doctorName, hospital, date, slot, amount: fee, queue_access },
            });
            if (verifyData.success) {
              navigate('/booking-token', {
                state: {
                  token:        verifyData.token,
                  doctorName,
                  hospital,
                  date,
                  slot,
                  paymentId:    response.razorpay_payment_id,
                  userName:     user?.name || user?.username,
                  queue_access,
                }
              });
            } else {
              alert('Verification failed. Contact support.');
              setLoading(false);
            }
          } catch {
            alert('Verification error. Contact support.');
            setLoading(false);
          }
        },
        modal: { ondismiss: () => setLoading(false) },
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', (r) => {
        alert(`Payment failed: ${r.error.description}`);
        setLoading(false);
      });
      rzp.open();
    } catch (err) {
      alert(err?.response?.data?.message || 'Could not initiate payment.');
      setLoading(false);
    }
  };

  if (!user || !doctorId) return null;

  return (
    <>
      <style>{css}</style>
      <div className="pay-wrap">
        <div className="pay-bg" />
        <div className="pay-grid" />

        <div className="pay-inner">

          <button className="pay-back" onClick={() => navigate(-1)}>
            ← Back
          </button>

          <div className="pay-title">Complete Payment</div>
          <div className="pay-sub">Review your appointment details before paying</div>

          {/* Summary card */}
          <div className="pay-card" style={{ animationDelay: '0.05s' }}>
            <div className="pay-card-header">
              <div className="pay-card-header-icon">📋</div>
              <div className="pay-card-header-title">Appointment Summary</div>
            </div>

            <div className="pay-summary-body">
              <div className="pay-row">
                <span className="pay-row-label">Doctor</span>
                <span className="pay-row-value">Dr. {doctorName}</span>
              </div>
              <div className="pay-row">
                <span className="pay-row-label">Hospital</span>
                <span className="pay-row-value">🏥 {hospital}</span>
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
                <span className="pay-row-value">{user?.name || user?.username}</span>
              </div>
              <div className="pay-row">
                <span className="pay-row-label">Plan</span>
                <span className={`pay-plan-badge ${queue_access ? 'queue' : 'basic'}`}>
                  {queue_access ? '📍 Queue View' : '🎫 Basic Token'}
                </span>
              </div>
            </div>

            <div className="pay-total-row">
              <span className="pay-total-label">Total Amount</span>
              <span className="pay-total-amount">₹{fee}</span>
            </div>
          </div>

          {/* Secure badge */}
          <div className="pay-secure">
            <div className="pay-secure-icon">🔐</div>
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
          <button className="pay-btn" onClick={handlePayment} disabled={loading}>
            {loading ? (
              <><div className="pay-spinner" /> Opening Payment Gateway...</>
            ) : (
              <>💳 Pay ₹{fee} & Confirm Appointment</>
            )}
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