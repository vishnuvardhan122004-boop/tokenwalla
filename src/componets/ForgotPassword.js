import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import API from '../services/api';

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&display=swap');

  .fp-wrap {
    font-family: 'DM Sans', sans-serif;
    min-height: 100vh;
    background: #00133A;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px 16px;
    color: white;
    position: relative;
    overflow: hidden;
  }

  .fp-bg {
    position: absolute; inset: 0;
    background:
      radial-gradient(ellipse 70% 60% at 30% 40%, rgba(0,87,255,0.18) 0%, transparent 60%),
      radial-gradient(ellipse 50% 50% at 80% 70%, rgba(0,212,255,0.1) 0%, transparent 50%);
  }

  .fp-grid {
    position: absolute; inset: 0;
    background-image:
      linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
    background-size: 60px 60px;
  }

  .fp-card {
    position: relative;
    width: 100%; max-width: 440px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 24px;
    padding: 36px 32px;
    overflow: hidden;
  }

  .fp-card::before {
    content: '';
    position: absolute; top: 0; left: 0; right: 0; height: 2px;
    background: linear-gradient(90deg, #0057FF, #00D4FF, #00F5C4);
  }

  .fp-logo {
    display: flex; align-items: center; gap: 10px;
    text-decoration: none; margin-bottom: 28px;
  }

  .fp-logo img {
    width: 36px; height: 36px; border-radius: 10px;
    box-shadow: 0 4px 16px rgba(0,87,255,0.4);
  }

  .fp-logo-name {
    font-family: 'Syne', sans-serif;
    font-size: 1.2rem; font-weight: 800; color: white;
  }

  .fp-logo-name span { color: #00D4FF; }

  .fp-step-badge {
    display: inline-flex; align-items: center; gap: 6px;
    background: rgba(0,87,255,0.12);
    border: 1px solid rgba(0,87,255,0.25);
    border-radius: 100px; padding: 4px 12px;
    font-size: 11px; font-weight: 600; letter-spacing: 1px;
    text-transform: uppercase; color: #00D4FF;
    margin-bottom: 12px;
  }

  .fp-title {
    font-family: 'Syne', sans-serif;
    font-size: 1.6rem; font-weight: 800;
    margin-bottom: 6px; line-height: 1.1;
  }

  .fp-sub {
    font-size: 14px; color: rgba(255,255,255,0.4);
    margin-bottom: 28px; line-height: 1.6;
  }

  .fp-label {
    font-size: 12px; font-weight: 600; letter-spacing: 0.5px;
    color: rgba(255,255,255,0.5); margin-bottom: 8px; display: block;
  }

  .fp-input-wrap { position: relative; margin-bottom: 18px; }

  .fp-input-icon {
    position: absolute; left: 14px; top: 50%;
    transform: translateY(-50%);
    font-size: 16px; pointer-events: none; opacity: 0.4;
  }

  .fp-input {
    width: 100%;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 14px;
    padding: 14px 14px 14px 44px;
    color: white; font-family: 'DM Sans', sans-serif;
    font-size: 15px; outline: none; transition: all 0.2s;
  }

  .fp-input::placeholder { color: rgba(255,255,255,0.2); }

  .fp-input:focus {
    border-color: rgba(0,87,255,0.55);
    background: rgba(0,87,255,0.07);
    box-shadow: 0 0 0 3px rgba(0,87,255,0.12);
  }

  .fp-btn {
    width: 100%; padding: 15px;
    border-radius: 14px; border: none;
    background: linear-gradient(135deg, #0057FF, #0040CC);
    color: white; font-family: 'DM Sans', sans-serif;
    font-size: 15px; font-weight: 600;
    cursor: pointer; transition: all 0.25s;
    box-shadow: 0 6px 24px rgba(0,87,255,0.3);
    display: flex; align-items: center; justify-content: center; gap: 8px;
  }

  .fp-btn:hover:not(:disabled) {
    transform: translateY(-2px); box-shadow: 0 12px 32px rgba(0,87,255,0.45);
  }

  .fp-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

  .fp-btn-ghost {
    width: 100%; padding: 13px;
    border-radius: 14px;
    border: 1px solid rgba(255,255,255,0.1);
    background: rgba(255,255,255,0.04);
    color: rgba(255,255,255,0.6);
    font-family: 'DM Sans', sans-serif; font-size: 14px; font-weight: 500;
    cursor: pointer; transition: all 0.2s; margin-top: 10px;
  }

  .fp-btn-ghost:hover { background: rgba(255,255,255,0.08); color: white; }

  .fp-error {
    background: rgba(255,80,80,0.1);
    border: 1px solid rgba(255,80,80,0.25);
    border-radius: 12px; padding: 12px 16px;
    font-size: 14px; color: #FF8080; margin-bottom: 18px;
  }

  .fp-success {
    background: rgba(0,245,196,0.08);
    border: 1px solid rgba(0,245,196,0.25);
    border-radius: 12px; padding: 12px 16px;
    font-size: 14px; color: #00F5C4; margin-bottom: 18px;
  }

  .fp-call-info {
    display: flex; align-items: flex-start; gap: 12px;
    background: rgba(0,87,255,0.08);
    border: 1px solid rgba(0,87,255,0.2);
    border-radius: 12px; padding: 14px 16px;
    margin-bottom: 20px; font-size: 13px;
    color: rgba(255,255,255,0.6); line-height: 1.6;
  }

  .fp-call-icon {
    font-size: 20px; flex-shrink: 0; margin-top: 1px;
  }

  .fp-spinner {
    width: 18px; height: 18px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: fpSpin 0.7s linear infinite;
  }

  .fp-steps-indicator {
    display: flex; gap: 6px; margin-bottom: 24px;
  }

  .fp-step-dot {
    flex: 1; height: 3px; border-radius: 3px;
    background: rgba(255,255,255,0.1); transition: all 0.3s;
  }

  .fp-step-dot.active   { background: #0057FF; }
  .fp-step-dot.done     { background: #00F5C4; }

  .fp-back-link {
    display: flex; align-items: center; gap: 6px;
    color: rgba(255,255,255,0.4); font-size: 13px;
    text-decoration: none; margin-top: 20px;
    justify-content: center; transition: color 0.2s;
  }

  .fp-back-link:hover { color: white; text-decoration: none; }

  @keyframes fpSpin { to { transform: rotate(360deg); } }

  @media (max-width: 480px) {
    .fp-card { padding: 28px 20px; }
    .fp-title { font-size: 1.4rem; }
  }
`;

// STEP 1 → enter mobile
// STEP 2 → OTP received via voice call, enter it
// STEP 3 → enter new password

export default function ForgotPassword({ type = 'patient' }) {
  const navigate  = useNavigate();
  const isHospital = type === 'hospital';

  const [step,        setStep]        = useState(1); // 1 | 2 | 3
  const [mobile,      setMobile]      = useState('');
  const [otp,         setOtp]         = useState('');
  const [password,    setPassword]    = useState('');
  const [confirm,     setConfirm]     = useState('');
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [success,     setSuccess]     = useState('');

  // ── Step 1: Request OTP via voice call ────────────────────────────────────
  const requestOTP = async () => {
    if (!mobile || mobile.length !== 10) { setError('Enter a valid 10-digit mobile number'); return; }
    setLoading(true); setError('');
    try {
      await API.post('/auth/otp/request/', {
        mobile,
        via: 'voice',   // backend sends voice call OTP
      });
      setSuccess(`📞 A voice call is being placed to ${mobile} with your OTP.`);
      setStep(2);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to send OTP. Try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: Verify OTP ────────────────────────────────────────────────────
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
    } catch {
      setError('Invalid OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 3: Reset password ────────────────────────────────────────────────
  const resetPassword = async () => {
    if (!password || password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setLoading(true); setError(''); setSuccess('');
    try {
      const endpoint = isHospital
        ? '/hospitals/reset-password/'
        : '/auth/reset-password/';
      await API.post(endpoint, { mobile, otp, password });
      setSuccess('🎉 Password reset successfully!');
      setTimeout(() => navigate(isHospital ? '/Hlogin' : '/login'), 1500);
    } catch (err) {
      setError(err?.response?.data?.message || 'Reset failed. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const stepLabels = ['Mobile', 'Verify OTP', 'New Password'];

  return (
    <>
      <style>{css}</style>
      <div className="fp-wrap">
        <div className="fp-bg" />
        <div className="fp-grid" />

        <div className="fp-card">

          {/* Logo */}
          <Link to="/" className="fp-logo">
            <img src="/logo.png" alt="TokenWalla" />
            <span className="fp-logo-name"><span>Token</span>walla</span>
          </Link>

          {/* Step indicator */}
          <div className="fp-steps-indicator">
            {[1, 2, 3].map(n => (
              <div
                key={n}
                className={`fp-step-dot ${n < step ? 'done' : n === step ? 'active' : ''}`}
              />
            ))}
          </div>

          <div className="fp-step-badge">
            Step {step} of 3 — {stepLabels[step - 1]}
          </div>

          {/* ── STEP 1: Enter Mobile ── */}
          {step === 1 && (
            <>
              <div className="fp-title">Forgot Password?</div>
              <div className="fp-sub">
                Enter your registered mobile number. We'll call you with an OTP to verify your identity.
              </div>

              {error   && <div className="fp-error">⚠️ {error}</div>}

              <label className="fp-label">Mobile Number</label>
              <div className="fp-input-wrap">
                <span className="fp-input-icon">📱</span>
                <input
                  className="fp-input" type="text"
                  placeholder="10-digit mobile number"
                  value={mobile}
                  onChange={e => setMobile(e.target.value.replace(/\D/, '').slice(0, 10))}
                  maxLength={10}
                />
              </div>

              <div className="fp-call-info">
                <span className="fp-call-icon">📞</span>
                <span>We'll place a <strong style={{ color: 'white' }}>voice call</strong> to your mobile. Answer the call and note down the OTP spoken to you.</span>
              </div>

              <button className="fp-btn" onClick={requestOTP} disabled={loading}>
                {loading ? <><div className="fp-spinner" /> Calling...</> : '📞 Call Me with OTP →'}
              </button>
            </>
          )}

          {/* ── STEP 2: Enter OTP ── */}
          {step === 2 && (
            <>
              <div className="fp-title">Enter OTP</div>
              <div className="fp-sub">
                Answer the call to <strong style={{ color: 'white' }}>{mobile}</strong> and enter the OTP you heard.
              </div>

              {error   && <div className="fp-error">⚠️ {error}</div>}
              {success && <div className="fp-success">{success}</div>}

              <label className="fp-label">OTP from Voice Call</label>
              <div className="fp-input-wrap">
                <span className="fp-input-icon">🔢</span>
                <input
                  className="fp-input" type="text"
                  placeholder="Enter 4-digit OTP"
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/, '').slice(0, 6))}
                  maxLength={6}
                />
              </div>

              <button className="fp-btn" onClick={verifyOTP} disabled={loading}>
                {loading ? <><div className="fp-spinner" /> Verifying...</> : '✅ Verify OTP →'}
              </button>

              <button className="fp-btn-ghost" onClick={() => { setStep(1); setError(''); setSuccess(''); setOtp(''); }}>
                ← Change Mobile Number
              </button>

              <button
                className="fp-btn-ghost"
                style={{ marginTop: 6 }}
                onClick={requestOTP}
                disabled={loading}
              >
                📞 Call Me Again
              </button>
            </>
          )}

          {/* ── STEP 3: New Password ── */}
          {step === 3 && (
            <>
              <div className="fp-title">Set New Password</div>
              <div className="fp-sub">
                Choose a strong password for your account.
              </div>

              {error   && <div className="fp-error">⚠️ {error}</div>}
              {success && <div className="fp-success">{success}</div>}

              <label className="fp-label">New Password</label>
              <div className="fp-input-wrap">
                <span className="fp-input-icon">🔑</span>
                <input
                  className="fp-input" type="password"
                  placeholder="Minimum 6 characters"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
              </div>

              <label className="fp-label">Confirm Password</label>
              <div className="fp-input-wrap">
                <span className="fp-input-icon">🔒</span>
                <input
                  className="fp-input" type="password"
                  placeholder="Re-enter your new password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                />
              </div>

              <button className="fp-btn" onClick={resetPassword} disabled={loading}>
                {loading ? <><div className="fp-spinner" /> Saving...</> : '🔐 Reset Password →'}
              </button>
            </>
          )}

          {/* Back to login */}
          <Link
            to={isHospital ? '/Hlogin' : '/login'}
            className="fp-back-link"
          >
            ← Back to {isHospital ? 'Hospital ' : ''}Login
          </Link>

        </div>
      </div>
    </>
  );
}