import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import API from '../services/api';

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&display=swap');

  .auth-wrap {
    font-family: 'DM Sans', sans-serif;
    min-height: 100vh;
    background: #00133A;
    display: flex;
    align-items: stretch;
    color: white;
  }

  .auth-left {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 60px 80px;
    position: relative;
    overflow: hidden;
  }

  .auth-left-bg {
    position: absolute; inset: 0;
    background:
      radial-gradient(ellipse 80% 70% at 70% 40%, rgba(0,212,255,0.15) 0%, transparent 60%),
      radial-gradient(ellipse 50% 50% at 20% 80%, rgba(0,87,255,0.12) 0%, transparent 50%);
  }

  .auth-grid {
    position: absolute; inset: 0;
    background-image:
      linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
    background-size: 60px 60px;
  }

  .auth-left-content { position: relative; max-width: 480px; }

  .auth-brand {
    display: flex; align-items: center; gap: 12px;
    margin-bottom: 56px; text-decoration: none;
  }

  .auth-brand-logo {
    width: 40px; height: 40px; border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 4px 16px rgba(0,87,255,0.4);
  }

  .auth-brand-logo img { width: 100%; height: 100%; object-fit: cover; }

  .auth-brand-name {
    font-family: 'Syne', sans-serif;
    font-size: 1.3rem; font-weight: 800; color: white;
  }

  .auth-brand-name span { color: #00D4FF; }

  .auth-left-label {
    font-size: 11px; font-weight: 600;
    letter-spacing: 3px; text-transform: uppercase;
    color: #00F5C4; margin-bottom: 14px;
  }

  .auth-left-title {
    font-family: 'Syne', sans-serif;
    font-size: clamp(2rem, 3.5vw, 3rem);
    font-weight: 800; line-height: 1.1; margin-bottom: 18px;
  }

  .auth-left-title span {
    background: linear-gradient(135deg, #00D4FF, #00F5C4);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .auth-left-sub {
    font-size: 15px; color: rgba(255,255,255,0.45);
    line-height: 1.7; margin-bottom: 48px; max-width: 380px;
  }

  /* Steps */
  .auth-steps {
    display: flex; flex-direction: column; gap: 0;
  }

  .auth-step {
    display: flex; gap: 16px; align-items: flex-start;
    padding-bottom: 24px; position: relative;
  }

  .auth-step:not(:last-child)::before {
    content: '';
    position: absolute;
    left: 15px; top: 32px;
    width: 2px; height: calc(100% - 8px);
    background: rgba(255,255,255,0.06);
  }

  .auth-step-num {
    width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0;
    background: rgba(0,87,255,0.2);
    border: 1px solid rgba(0,87,255,0.4);
    display: flex; align-items: center; justify-content: center;
    font-family: 'Syne', sans-serif;
    font-size: 13px; font-weight: 700; color: #00D4FF;
  }

  .auth-step-text strong {
    display: block; font-size: 14px;
    color: rgba(255,255,255,0.8); margin-bottom: 2px;
  }

  .auth-step-text span {
    font-size: 13px; color: rgba(255,255,255,0.35);
  }

  /* RIGHT */
  .auth-right {
    width: 500px; flex-shrink: 0;
    background: rgba(255,255,255,0.03);
    border-left: 1px solid rgba(255,255,255,0.06);
    display: flex; flex-direction: column;
    justify-content: center;
    padding: 48px 48px;
    position: relative;
    overflow-y: auto;
  }

  .auth-form-title {
    font-family: 'Syne', sans-serif;
    font-size: 1.6rem; font-weight: 800; margin-bottom: 6px;
  }

  .auth-form-sub {
    font-size: 14px; color: rgba(255,255,255,0.4); margin-bottom: 32px;
  }

  /* FIELD */
  .auth-field { margin-bottom: 16px; }

  .auth-field-label {
    font-size: 12px; font-weight: 600;
    letter-spacing: 0.5px; color: rgba(255,255,255,0.5);
    margin-bottom: 8px; display: block;
  }

  .auth-input-wrap { position: relative; }

  .auth-input-icon {
    position: absolute; left: 14px; top: 50%;
    transform: translateY(-50%);
    font-size: 16px; pointer-events: none; opacity: 0.4;
  }

  .auth-input {
    width: 100%;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 14px;
    padding: 14px 14px 14px 44px;
    color: white;
    font-family: 'DM Sans', sans-serif;
    font-size: 15px; outline: none; transition: all 0.2s;
  }

  .auth-input::placeholder { color: rgba(255,255,255,0.2); }

  .auth-input:focus {
    border-color: rgba(0,87,255,0.55);
    background: rgba(0,87,255,0.07);
    box-shadow: 0 0 0 3px rgba(0,87,255,0.12);
  }

  .auth-input.error {
    border-color: rgba(255,80,80,0.5);
    background: rgba(255,80,80,0.05);
  }

  .auth-field-error {
    font-size: 12px; color: #FF8080;
    margin-top: 5px; display: block;
  }

  /* OTP */
  .auth-otp-row { display: flex; gap: 10px; }
  .auth-otp-row .auth-input-wrap { flex: 1; }

  .auth-otp-btn {
    flex-shrink: 0;
    background: rgba(0,87,255,0.15);
    border: 1px solid rgba(0,87,255,0.35);
    border-radius: 14px;
    padding: 14px 16px;
    font-family: 'DM Sans', sans-serif;
    font-size: 13px; font-weight: 600;
    color: #00D4FF; cursor: pointer;
    transition: all 0.2s; white-space: nowrap;
  }

  .auth-otp-btn:hover:not(:disabled) {
    background: rgba(0,87,255,0.25);
    border-color: rgba(0,87,255,0.5);
  }

  .auth-otp-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  /* Verify OTP button */
  .auth-verify-btn {
    width: 100%; padding: 13px;
    border-radius: 14px; border: 1px solid rgba(0,245,196,0.35);
    background: rgba(0,245,196,0.08);
    color: #00F5C4;
    font-family: 'DM Sans', sans-serif;
    font-size: 14px; font-weight: 600;
    cursor: pointer; transition: all 0.2s;
    margin-top: 8px;
  }

  .auth-verify-btn:hover {
    background: rgba(0,245,196,0.15);
    border-color: rgba(0,245,196,0.5);
  }

  .auth-verified {
    display: flex; align-items: center; gap: 10px;
    background: rgba(0,245,196,0.08);
    border: 1px solid rgba(0,245,196,0.25);
    border-radius: 12px;
    padding: 12px 16px;
    font-size: 13px; color: #00F5C4;
    margin-bottom: 6px;
  }

  /* Progress steps */
  .auth-progress {
    display: flex; gap: 6px; margin-bottom: 32px;
  }

  .auth-progress-step {
    flex: 1; height: 3px; border-radius: 2px;
    background: rgba(255,255,255,0.08);
    transition: background 0.3s;
  }

  .auth-progress-step.done { background: #0057FF; }
  .auth-progress-step.active {
    background: linear-gradient(90deg, #0057FF, #00D4FF);
  }

  /* Submit */
  .auth-submit {
    width: 100%; padding: 16px;
    border-radius: 14px; border: none;
    background: linear-gradient(135deg, #0057FF, #0040CC);
    color: white;
    font-family: 'DM Sans', sans-serif;
    font-size: 16px; font-weight: 600;
    cursor: pointer; transition: all 0.25s;
    box-shadow: 0 6px 24px rgba(0,87,255,0.3);
    margin-top: 8px;
    display: flex; align-items: center; justify-content: center; gap: 10px;
  }

  .auth-submit:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 12px 32px rgba(0,87,255,0.45);
  }

  .auth-submit:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

  .auth-switch {
    text-align: center; margin-top: 24px;
    font-size: 14px; color: rgba(255,255,255,0.4);
  }

  .auth-switch a {
    color: #00D4FF; font-weight: 600;
    text-decoration: none; transition: color 0.2s;
  }

  .auth-switch a:hover { color: #00F5C4; }

  .auth-spinner {
    width: 18px; height: 18px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: authSpin 0.7s linear infinite;
  }

  @keyframes authSpin { to { transform: rotate(360deg); } }

  @keyframes authFadeUp {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .auth-field { animation: authFadeUp 0.4s ease both; }

  @media (max-width: 960px) {
    .auth-left { display: none; }
    .auth-right {
      width: 100%; border-left: none;
      padding: 80px 24px 48px;
    }
  }
`;

export default function Profilecreate() {
  const navigate = useNavigate();
  const [user,        setUser]        = useState({ name: '', mobile: '', password: '', confirmPassword: '' });
  const [errors,      setErrors]      = useState({});
  const [loading,     setLoading]     = useState(false);
  const [otpSent,     setOtpSent]     = useState(false);
  const [otpLoading,  setOtpLoading]  = useState(false);
  const [otp,         setOtp]         = useState('');
  const [otpVerified, setOtpVerified] = useState(false);
  const [globalError, setGlobalError] = useState('');

  const changeUser = (e) => {
    const { name, value } = e.target;
    setUser(prev => ({ ...prev, [name]: value.trimStart() }));
    setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const validate = () => {
    let errs = {};
    if (!/^[A-Za-z\s]{2,}$/.test(user.name.trim()))
      errs.name = 'Enter your full name (letters only)';
    if (!/^[6-9]\d{9}$/.test(user.mobile.trim()))
      errs.mobile = 'Enter a valid 10-digit Indian mobile number';
    if (!/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{6,}$/.test(user.password))
      errs.password = 'Min 6 chars with at least one letter & number';
    if (user.password !== user.confirmPassword)
      errs.confirmPassword = 'Passwords do not match';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const requestOTP = async () => {
    if (!/^[6-9]\d{9}$/.test(user.mobile.trim())) {
      setErrors(prev => ({ ...prev, mobile: 'Enter valid mobile first' }));
      return;
    }
    setOtpLoading(true); setGlobalError('');
    try {
      await API.post('/auth/otp/request/', { mobile: user.mobile });
      setOtpSent(true);
    } catch (err) {
      setGlobalError(err?.response?.data?.message || 'OTP failed. Try again.');
    } finally {
      setOtpLoading(false);
    }
  };

  const verifyOTP = async () => {
    try {
      const { data } = await API.post('/auth/otp/verify/', { mobile: user.mobile, otp });
      if (data.verified) {
        setOtpVerified(true);
      } else {
        setGlobalError('Invalid OTP. Please try again.');
      }
    } catch {
      setGlobalError('Invalid OTP. Please try again.');
    }
  };

  const submitHandler = async (e) => {
    e.preventDefault();
    if (!otpVerified) { setGlobalError('Please verify your mobile number first'); return; }
    if (!validate()) return;
    setLoading(true); setGlobalError('');
    try {
      const { data } = await API.post('/auth/register/', {
        name:     user.name.trim(),
        mobile:   user.mobile.trim(),
        password: user.password,
      });
      localStorage.setItem('access',  data.access);
      localStorage.setItem('refresh', data.refresh);
      localStorage.setItem('user',    JSON.stringify(data.user));
      navigate('/alldoctor');
      window.location.reload();
    } catch (err) {
      const errData = err?.response?.data;
      if (errData?.mobile)   setErrors(prev => ({ ...prev, mobile: errData.mobile[0] }));
      else setGlobalError(errData?.message || 'Registration failed. Try again.');
    } finally {
      setLoading(false);
    }
  };

  // Progress: 1=details, 2=verify, 3=done
  const step = otpVerified ? 3 : otpSent ? 2 : 1;

  return (
    <>
      <style>{css}</style>
      <div className="auth-wrap">

        {/* LEFT */}
        <div className="auth-left">
          <div className="auth-left-bg" />
          <div className="auth-grid" />
          <div className="auth-left-content">

            <Link to="/" className="auth-brand">
              <div className="auth-brand-logo">
                <img src="/logo.png" alt="TokenWalla" />
              </div>
              <span className="auth-brand-name">
                <span>Token</span>walla
              </span>
            </Link>

            <div className="auth-left-label">Create Account</div>
            <h1 className="auth-left-title">
              Join<br />
              <span>TokenWalla</span>
            </h1>
            <p className="auth-left-sub">
              Create your free account and start booking doctor
              appointments with digital tokens — no more long queues.
            </p>

            <div className="auth-steps">
              {[
                { title: 'Enter your details',    desc: 'Name, mobile number and password' },
                { title: 'Verify mobile via OTP', desc: 'We\'ll send a 4-digit code to your number' },
                { title: 'Start booking',         desc: 'Find doctors and book your first appointment' },
              ].map((s, i) => (
                <div className="auth-step" key={i}>
                  <div className="auth-step-num">{i + 1}</div>
                  <div className="auth-step-text">
                    <strong>{s.title}</strong>
                    <span>{s.desc}</span>
                  </div>
                </div>
              ))}
            </div>

          </div>
        </div>

        {/* RIGHT */}
        <div className="auth-right">

          {/* Progress bar */}
          <div className="auth-progress">
            {[1,2,3].map(n => (
              <div
                key={n}
                className={`auth-progress-step ${n < step ? 'done' : n === step ? 'active' : ''}`}
              />
            ))}
          </div>

          <div className="auth-form-title">Create Account</div>
          <div className="auth-form-sub">
            {step === 1 && 'Fill in your details to get started'}
            {step === 2 && `Enter the OTP sent to ${user.mobile}`}
            {step === 3 && '✓ Mobile verified — set your password'}
          </div>

          {globalError && (
            <div style={{
              background: 'rgba(255,80,80,0.1)',
              border: '1px solid rgba(255,80,80,0.25)',
              borderRadius: 12, padding: '12px 16px',
              fontSize: 14, color: '#FF8080', marginBottom: 20,
            }}>
              ⚠️ {globalError}
            </div>
          )}

          <form onSubmit={submitHandler}>

            {/* Name */}
            <div className="auth-field" style={{ animationDelay: '0s' }}>
              <label className="auth-field-label">Full Name</label>
              <div className="auth-input-wrap">
                <span className="auth-input-icon">👤</span>
                <input
                  className={`auth-input ${errors.name ? 'error' : ''}`}
                  type="text" name="name"
                  placeholder="Your full name"
                  value={user.name} onChange={changeUser}
                />
              </div>
              {errors.name && <span className="auth-field-error">{errors.name}</span>}
            </div>

            {/* Mobile + OTP */}
            <div className="auth-field" style={{ animationDelay: '0.05s' }}>
              <label className="auth-field-label">Mobile Number</label>
              <div className="auth-otp-row">
                <div className="auth-input-wrap">
                  <span className="auth-input-icon">📱</span>
                  <input
                    className={`auth-input ${errors.mobile ? 'error' : ''}`}
                    type="text" name="mobile"
                    placeholder="10-digit mobile"
                    value={user.mobile} onChange={changeUser}
                    maxLength={10}
                    disabled={otpVerified}
                  />
                </div>
                {!otpVerified && (
                  <button
                    type="button"
                    className="auth-otp-btn"
                    onClick={requestOTP}
                    disabled={otpLoading}
                  >
                    {otpLoading ? '...' : otpSent ? 'Resend' : 'Get OTP'}
                  </button>
                )}
              </div>
              {errors.mobile && <span className="auth-field-error">{errors.mobile}</span>}
            </div>

            {/* OTP input */}
            {otpSent && !otpVerified && (
              <div className="auth-field" style={{ animationDelay: '0.1s' }}>
                <label className="auth-field-label">Enter OTP</label>
                <div className="auth-input-wrap">
                  <span className="auth-input-icon">🔢</span>
                  <input
                    className="auth-input"
                    type="text" placeholder="4-digit OTP"
                    value={otp}
                    onChange={e => setOtp(e.target.value)}
                    maxLength={4}
                  />
                </div>
                <button type="button" className="auth-verify-btn" onClick={verifyOTP}>
                  Verify OTP →
                </button>
              </div>
            )}

            {/* Verified */}
            {otpVerified && (
              <div className="auth-verified" style={{ marginBottom: 16 }}>
                <span style={{ fontSize: 18 }}>✅</span>
                Mobile verified — {user.mobile}
              </div>
            )}

            {/* Password */}
            <div className="auth-field" style={{ animationDelay: '0.1s' }}>
              <label className="auth-field-label">Password</label>
              <div className="auth-input-wrap">
                <span className="auth-input-icon">🔑</span>
                <input
                  className={`auth-input ${errors.password ? 'error' : ''}`}
                  type="password" name="password"
                  placeholder="Min 6 chars, letters + numbers"
                  value={user.password} onChange={changeUser}
                />
              </div>
              {errors.password && <span className="auth-field-error">{errors.password}</span>}
            </div>

            {/* Confirm Password */}
            <div className="auth-field" style={{ animationDelay: '0.15s' }}>
              <label className="auth-field-label">Confirm Password</label>
              <div className="auth-input-wrap">
                <span className="auth-input-icon">🔒</span>
                <input
                  className={`auth-input ${errors.confirmPassword ? 'error' : ''}`}
                  type="password" name="confirmPassword"
                  placeholder="Repeat your password"
                  value={user.confirmPassword} onChange={changeUser}
                />
              </div>
              {errors.confirmPassword && <span className="auth-field-error">{errors.confirmPassword}</span>}
            </div>

            <button className="auth-submit" disabled={loading}>
              {loading
                ? <><div className="auth-spinner" /> Creating account...</>
                : 'Create Account →'}
            </button>

          </form>

          <div className="auth-switch">
            Already have an account? <Link to="/login">Sign in →</Link>
          </div>

        </div>
      </div>
    </>
  );
}