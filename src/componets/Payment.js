import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import API from '../services/api';

const RAZORPAY_KEY_ID = process.env.REACT_APP_RAZORPAY_KEY_ID || 'rzp_test_XXXXXXXXXXXXXXXX';

export default function Payment() {
  const location = useLocation();
  const navigate  = useNavigate();
  const {
    doctorId, doctorName, hospital,
    date, slot, fee = 15, amount = 1500,
    queue_access = true,
  } = location.state || {};

  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (stored) setUser(JSON.parse(stored));
    else navigate('/login');
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
        amount, currency: 'INR',
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
        theme:       { color: '#185FA5' },
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
                  doctorMobile: location.state?.doctorMobile,
                  date, slot,
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
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .pay-root {
          font-family: 'DM Sans', sans-serif;
          background: linear-gradient(160deg, #F4F9FF 0%, #EAF3FF 60%, #F8FBFF 100%);
          min-height: 100vh; padding: 60px 0 80px; position: relative;
        }
        .pay-grid {
          position: fixed; inset: 0; pointer-events: none;
          background-image:
            linear-gradient(#B5D4F4 1px, transparent 1px),
            linear-gradient(90deg, #B5D4F4 1px, transparent 1px);
          background-size: 52px 52px; opacity: 0.35;
        }
        .pay-inner { position: relative; z-index: 1; max-width: 580px; margin: 0 auto; padding: 0 20px; }

        .pay-back {
          display: inline-flex; align-items: center; gap: 8px;
          background: #fff; border: 1px solid #B5D4F4; border-radius: 10px;
          padding: 8px 16px; font-size: 13px; color: #185FA5;
          cursor: pointer; transition: all 0.2s; margin-bottom: 28px;
          font-family: 'DM Sans', sans-serif;
        }
        .pay-back:hover { border-color: #378ADD; background: #E6F1FB; }

        .pay-title {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: clamp(1.6rem, 4vw, 2rem); font-weight: 800;
          color: #0F172A; margin-bottom: 6px;
          animation: payUp 0.5s ease both;
        }
        .pay-sub { font-size: 14px; color: #64748B; margin-bottom: 32px; animation: payUp 0.5s 0.05s ease both; }

        /* Summary card */
        .pay-card {
          background: #fff; border: 1px solid #B5D4F4;
          border-radius: 20px; overflow: hidden; margin-bottom: 16px;
          box-shadow: 0 8px 32px rgba(24,95,165,0.08);
          animation: payUp 0.5s 0.05s ease both;
        }
        .pay-card-header {
          padding: 16px 22px; border-bottom: 1px solid #E6F1FB;
          display: flex; align-items: center; gap: 12px;
          background: linear-gradient(160deg, #F4F9FF, #EAF3FF);
          position: relative; overflow: hidden;
        }
        .pay-card-header::before {
          content:''; position:absolute; top:0;left:0;right:0;height:3px;
          background: linear-gradient(90deg, #185FA5, #378ADD, #85B7EB);
        }
        .pay-card-header-icon {
          width: 36px; height: 36px; border-radius: 10px;
          background: #E6F1FB; display: flex; align-items: center;
          justify-content: center; font-size: 18px; flex-shrink: 0;
        }
        .pay-card-header-title {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 15px; font-weight: 700; color: #0F172A;
        }

        .pay-rows { padding: 8px 22px; }
        .pay-row {
          display: flex; justify-content: space-between; align-items: center;
          padding: 12px 0; border-bottom: 1px solid #F1F5F9; font-size: 14px;
        }
        .pay-row:last-child { border-bottom: none; }
        .pay-row-label { color: #64748B; }
        .pay-row-value { font-weight: 500; color: #0F172A; }

        .pay-plan-badge {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 4px 12px; border-radius: 100px; font-size: 12px; font-weight: 600;
          background: #E6F1FB; border: 1px solid #B5D4F4; color: #185FA5;
        }

        .pay-total-row {
          display: flex; justify-content: space-between; align-items: center;
          padding: 16px 22px; border-top: 1px solid #E6F1FB;
          background: #F4F9FF;
        }
        .pay-total-label {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 15px; font-weight: 700; color: #0F172A;
        }
        .pay-total-amount {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 2rem; font-weight: 800; color: #185FA5;
        }

        /* Secure badge */
        .pay-secure {
          display: flex; align-items: center; gap: 14px;
          background: #fff; border: 1px solid #B5D4F4;
          border-radius: 16px; padding: 16px 20px; margin-bottom: 16px;
          animation: payUp 0.5s 0.1s ease both;
        }
        .pay-secure-icon {
          width: 44px; height: 44px; border-radius: 12px;
          background: #E6F1FB; display: flex; align-items: center;
          justify-content: center; font-size: 22px; flex-shrink: 0;
        }
        .pay-secure-title { font-size: 14px; font-weight: 600; color: #0F172A; margin-bottom: 2px; }
        .pay-secure-desc { font-size: 12px; color: #64748B; }
        .pay-methods { display: flex; gap: 7px; flex-wrap: wrap; margin-top: 7px; }
        .pay-method-chip {
          background: #E6F1FB; border: 1px solid #B5D4F4;
          border-radius: 7px; padding: 3px 10px;
          font-size: 11px; color: #185FA5; font-weight: 500;
        }

        /* Pay button */
        .pay-btn {
          width: 100%; padding: 16px; border-radius: 14px; border: none;
          background: #185FA5; color: #fff;
          font-family: 'DM Sans', sans-serif; font-size: 16px; font-weight: 600;
          cursor: pointer; transition: all 0.25s;
          box-shadow: 0 6px 24px rgba(24,95,165,0.25);
          display: flex; align-items: center; justify-content: center; gap: 10px;
          animation: payUp 0.5s 0.15s ease both;
        }
        .pay-btn:hover:not(:disabled) {
          background: #0C447C;
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
          text-align: center; margin-top: 14px;
          font-size: 12px; color: #94A3B8; line-height: 1.6;
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
              <div className="pay-card-header-icon">📋</div>
              <div className="pay-card-header-title">Appointment Summary</div>
            </div>
            <div className="pay-rows">
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
                <span className="pay-plan-badge">📍 Queue View</span>
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
            {loading
              ? <><div className="pay-spinner" /> Opening Payment Gateway…</>
              : <>💳 Pay ₹{fee} & Confirm Appointment</>
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