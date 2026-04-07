import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import API from '../services/api';

export default function ForgotPassword({ type = 'patient' }) {
  const navigate   = useNavigate();
  const isHospital = type === 'hospital';

  const [step,     setStep]     = useState(1);
  const [mobile,   setMobile]   = useState('');
  const [otp,      setOtp]      = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState('');

  const requestOTP = async () => {
    if (!mobile || mobile.length !== 10) { setError('Enter a valid 10-digit mobile number'); return; }
    setLoading(true); setError('');
    try {
      await API.post('/auth/otp/request/', { mobile, via: 'voice' });
      setSuccess(`📞 A voice call is being placed to ${mobile} with your OTP.`);
      setStep(2);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to send OTP. Try again.');
    } finally { setLoading(false); }
  };

  const verifyOTP = async () => {
    if (!otp || otp.length < 4) { setError('Enter the OTP from the call'); return; }
    setLoading(true); setError(''); setSuccess('');
    try {
      const { data } = await API.post('/auth/otp/verify/', { mobile, otp });
      if (data.verified) {
        setSuccess('✅ OTP verified! Set your new password.');
        setStep(3);
      } else {
        setError('Invalid OTP. Please try again.');
      }
    } catch { setError('Invalid OTP. Please try again.'); }
    finally { setLoading(false); }
  };

  const resetPassword = async () => {
    if (!password || password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setLoading(true); setError(''); setSuccess('');
    try {
      const endpoint = isHospital ? '/hospitals/reset-password/' : '/auth/reset-password/';
      await API.post(endpoint, { mobile, otp, password });
      setSuccess('🎉 Password reset successfully!');
      setTimeout(() => navigate(isHospital ? '/Hlogin' : '/login'), 1500);
    } catch (err) {
      setError(err?.response?.data?.message || 'Reset failed. Try again.');
    } finally { setLoading(false); }
  };

  const stepLabels = ['Mobile', 'Verify OTP', 'New Password'];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .fp-root {
          font-family: 'DM Sans', sans-serif;
          min-height: 100vh;
          background: linear-gradient(160deg, #F4F9FF 0%, #EAF3FF 60%, #F8FBFF 100%);
          display: flex; align-items: center; justify-content: center;
          padding: 24px 16px; position: relative; overflow: hidden;
        }
        .fp-grid {
          position: fixed; inset: 0; pointer-events: none;
          background-image:
            linear-gradient(#B5D4F4 1px, transparent 1px),
            linear-gradient(90deg, #B5D4F4 1px, transparent 1px);
          background-size: 52px 52px; opacity: 0.35;
        }
        .fp-glow {
          position: fixed; top: -150px; right: -100px;
          width: 500px; height: 500px; border-radius: 50%;
          background: radial-gradient(circle, rgba(24,95,165,0.1) 0%, transparent 65%);
          pointer-events: none;
        }

        .fp-card {
          position: relative; z-index: 1;
          width: 100%; max-width: 440px;
          background: #fff; border: 1px solid #B5D4F4;
          border-radius: 24px; padding: 38px 34px;
          box-shadow: 0 12px 48px rgba(24,95,165,0.1), 0 4px 12px rgba(0,0,0,0.04);
          animation: fpUp 0.45s cubic-bezier(0.34,1.56,0.64,1) both;
        }
        @keyframes fpUp { from{opacity:0;transform:translateY(18px) scale(0.98)} to{opacity:1;transform:translateY(0) scale(1)} }
        .fp-card::before {
          content:''; position:absolute; top:0;left:0;right:0;height:3px;
          background: linear-gradient(90deg, #185FA5, #378ADD, #85B7EB);
          border-radius:24px 24px 0 0;
        }

        .fp-brand {
          display: flex; align-items: center; gap: 10px;
          text-decoration: none; margin-bottom: 28px; justify-content: center;
        }
        .fp-brand-logo {
          width: 38px; height: 38px; border-radius: 10px; overflow: hidden;
          box-shadow: 0 4px 14px rgba(24,95,165,0.2);
          transition: transform 0.25s cubic-bezier(0.34,1.56,0.64,1);
        }
        .fp-brand:hover .fp-brand-logo { transform: rotate(-6deg) scale(1.08); }
        .fp-brand-logo img { width:100%; height:100%; object-fit:cover; display:block; }
        .fp-brand-name {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 1.15rem; font-weight: 800; color: #0F172A;
        }
        .fp-brand-name .acc { color: #185FA5; }

        .fp-steps { display: flex; gap: 6px; margin-bottom: 24px; }
        .fp-step { flex: 1; height: 3px; border-radius: 3px; background: #E6F1FB; transition: background 0.3s; }
        .fp-step.done   { background: #185FA5; }
        .fp-step.active { background: #378ADD; }

        .fp-step-label {
          font-size: 11px; font-weight: 600; letter-spacing: 2px;
          text-transform: uppercase; color: #185FA5; margin-bottom: 8px;
        }
        .fp-title {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 1.45rem; font-weight: 800; color: #0F172A; margin-bottom: 4px;
        }
        .fp-sub { font-size: 14px; color: #64748B; margin-bottom: 24px; line-height: 1.6; }

        .fp-error {
          background: #FCEBEB; border: 1px solid #F09595; border-radius: 11px;
          padding: 11px 14px; font-size: 14px; color: #A32D2D;
          margin-bottom: 16px; display: flex; gap: 8px;
        }
        .fp-success {
          background: #EAF3DE; border: 1px solid #97C459; border-radius: 11px;
          padding: 11px 14px; font-size: 14px; color: #3B6D11; margin-bottom: 16px;
        }

        .fp-field { margin-bottom: 16px; }
        .fp-field label { display:block; font-size:12px; font-weight:600; color:#64748B; margin-bottom:7px; }
        .fp-wrap { position: relative; }
        .fp-icon { position:absolute; left:13px; top:50%; transform:translateY(-50%); font-size:15px; color:#94A3B8; pointer-events:none; }
        .fp-input {
          width: 100%; background: #F8FAFC; border: 1px solid #B5D4F4;
          border-radius: 12px; padding: 12px 14px 12px 42px;
          font-family: 'DM Sans', sans-serif; font-size: 15px; color: #0F172A;
          outline: none; transition: all 0.15s;
        }
        .fp-input::placeholder { color: #94A3B8; }
        .fp-input:focus { border-color: #378ADD; background: #fff; box-shadow: 0 0 0 3px rgba(55,138,221,0.14); }

        .fp-btn {
          width: 100%; padding: 14px; border-radius: 12px; border: none;
          background: #185FA5; color: #fff;
          font-family: 'DM Sans', sans-serif; font-size: 15px; font-weight: 600;
          cursor: pointer; transition: all 0.2s;
          box-shadow: 0 4px 14px rgba(24,95,165,0.22);
          display: flex; align-items: center; justify-content: center; gap: 8px;
        }
        .fp-btn:hover:not(:disabled) { background: #0C447C; box-shadow: 0 8px 24px rgba(24,95,165,0.32); transform: translateY(-1px); }
        .fp-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

        .fp-btn-ghost {
          width: 100%; padding: 12px; border-radius: 12px;
          border: 1px solid #B5D4F4; background: #F8FAFC;
          color: #64748B; font-family: 'DM Sans', sans-serif;
          font-size: 14px; cursor: pointer; transition: all 0.15s; margin-top: 8px;
        }
        .fp-btn-ghost:hover { background: #E6F1FB; border-color: #378ADD; color: #185FA5; }

        .fp-spinner {
          width: 18px; height: 18px;
          border: 2px solid rgba(255,255,255,0.35); border-top-color: #fff;
          border-radius: 50%; animation: fpSpin 0.7s linear infinite; flex-shrink: 0;
        }
        @keyframes fpSpin { to{transform:rotate(360deg)} }

        .fp-call-info {
          display: flex; align-items: flex-start; gap: 12px;
          background: #E6F1FB; border: 1px solid #B5D4F4;
          border-radius: 12px; padding: 14px 16px; margin-bottom: 18px;
          font-size: 13px; color: #185FA5; line-height: 1.6;
        }
        .fp-call-icon { font-size: 20px; flex-shrink: 0; margin-top: 1px; }

        .fp-back-link {
          display: flex; align-items: center; justify-content: center; gap: 6px;
          margin-top: 18px; font-size: 13px; color: #94A3B8;
          text-decoration: none; transition: color 0.15s;
        }
        .fp-back-link:hover { color: #185FA5; }

        @media (max-width: 480px) { .fp-card { padding: 28px 20px; } }
      `}</style>

      <div className="fp-root">
        <div className="fp-grid" />
        <div className="fp-glow" />

        <div className="fp-card">
          <Link to="/" className="fp-brand">
            <div className="fp-brand-logo"><img src="/logo.png" alt="TokenWalla" /></div>
            <span className="fp-brand-name"><span className="acc">Token</span>walla</span>
          </Link>

          <div className="fp-steps">
            {[1,2,3].map(n => (
              <div key={n} className={`fp-step ${n < step ? 'done' : n === step ? 'active' : ''}`} />
            ))}
          </div>

          <div className="fp-step-label">Step {step} of 3 — {stepLabels[step-1]}</div>

          {/* ── STEP 1 ── */}
          {step === 1 && (
            <>
              <div className="fp-title">Forgot Password?</div>
              <div className="fp-sub">Enter your registered mobile. We'll call you with an OTP.</div>
              {error && <div className="fp-error"><span>⚠️</span> {error}</div>}
              <div className="fp-field">
                <label>Mobile Number</label>
                <div className="fp-wrap">
                  <span className="fp-icon">📱</span>
                  <input className="fp-input" type="text" placeholder="10-digit mobile number"
                    value={mobile} onChange={e => setMobile(e.target.value.replace(/\D/,'').slice(0,10))} maxLength={10} />
                </div>
              </div>
              <div className="fp-call-info">
                <span className="fp-call-icon">📞</span>
                <span>We'll place a <strong>voice call</strong> to your mobile. Note down the OTP spoken to you.</span>
              </div>
              <button className="fp-btn" onClick={requestOTP} disabled={loading}>
                {loading ? <><div className="fp-spinner" /> Calling…</> : '📞 Call Me with OTP →'}
              </button>
            </>
          )}

          {/* ── STEP 2 ── */}
          {step === 2 && (
            <>
              <div className="fp-title">Enter OTP</div>
              <div className="fp-sub">Answer the call to <strong>{mobile}</strong> and enter the OTP you heard.</div>
              {error   && <div className="fp-error"><span>⚠️</span> {error}</div>}
              {success && <div className="fp-success">{success}</div>}
              <div className="fp-field">
                <label>OTP from Voice Call</label>
                <div className="fp-wrap">
                  <span className="fp-icon">🔢</span>
                  <input className="fp-input" type="text" placeholder="Enter 4-digit OTP"
                    value={otp} onChange={e => setOtp(e.target.value.replace(/\D/,'').slice(0,6))} maxLength={6} />
                </div>
              </div>
              <button className="fp-btn" onClick={verifyOTP} disabled={loading}>
                {loading ? <><div className="fp-spinner" /> Verifying…</> : '✅ Verify OTP →'}
              </button>
              <button className="fp-btn-ghost" onClick={() => { setStep(1); setError(''); setSuccess(''); setOtp(''); }}>
                ← Change Mobile Number
              </button>
              <button className="fp-btn-ghost" onClick={requestOTP} disabled={loading}>📞 Call Me Again</button>
            </>
          )}

          {/* ── STEP 3 ── */}
          {step === 3 && (
            <>
              <div className="fp-title">Set New Password</div>
              <div className="fp-sub">Choose a strong password for your account.</div>
              {error   && <div className="fp-error"><span>⚠️</span> {error}</div>}
              {success && <div className="fp-success">{success}</div>}
              <div className="fp-field">
                <label>New Password</label>
                <div className="fp-wrap">
                  <span className="fp-icon">🔑</span>
                  <input className="fp-input" type="password" placeholder="Minimum 6 characters"
                    value={password} onChange={e => setPassword(e.target.value)} />
                </div>
              </div>
              <div className="fp-field">
                <label>Confirm Password</label>
                <div className="fp-wrap">
                  <span className="fp-icon">🔒</span>
                  <input className="fp-input" type="password" placeholder="Re-enter your new password"
                    value={confirm} onChange={e => setConfirm(e.target.value)} />
                </div>
              </div>
              <button className="fp-btn" onClick={resetPassword} disabled={loading}>
                {loading ? <><div className="fp-spinner" /> Saving…</> : '🔐 Reset Password →'}
              </button>
            </>
          )}

          <Link to={isHospital ? '/Hlogin' : '/login'} className="fp-back-link">
            ← Back to {isHospital ? 'Hospital ' : ''}Login
          </Link>
        </div>
      </div>
    </>
  );
}