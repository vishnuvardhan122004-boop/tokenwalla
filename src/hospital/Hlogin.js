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
      radial-gradient(ellipse 80% 70% at 30% 40%, rgba(0,87,255,0.2) 0%, transparent 60%),
      radial-gradient(ellipse 50% 50% at 80% 80%, rgba(0,212,255,0.1) 0%, transparent 50%);
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
    font-size: 1.3rem; font-weight: 800;
    color: white;
  }

  .auth-brand-name span { color: #00D4FF; }

  .auth-left-label {
    font-size: 11px; font-weight: 600;
    letter-spacing: 3px; text-transform: uppercase;
    color: #00D4FF; margin-bottom: 14px;
  }

  .auth-left-title {
    font-family: 'Syne', sans-serif;
    font-size: clamp(2rem, 3.5vw, 3rem);
    font-weight: 800; line-height: 1.1;
    margin-bottom: 18px;
  }

  .auth-left-title span {
    background: linear-gradient(135deg, #00D4FF, #00F5C4);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .auth-left-sub {
    font-size: 15px; color: rgba(255,255,255,0.45);
    line-height: 1.7; margin-bottom: 48px;
    max-width: 380px;
  }

  .auth-features { display: flex; flex-direction: column; gap: 16px; }

  .auth-feature { display: flex; align-items: center; gap: 14px; }

  .auth-feature-icon {
    width: 40px; height: 40px; border-radius: 12px;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.08);
    display: flex; align-items: center; justify-content: center;
    font-size: 18px; flex-shrink: 0;
  }

  .auth-feature-text { font-size: 14px; color: rgba(255,255,255,0.55); }
  .auth-feature-text strong { color: rgba(255,255,255,0.85); display: block; margin-bottom: 1px; }

  .auth-right {
    width: 480px;
    flex-shrink: 0;
    background: rgba(255,255,255,0.03);
    border-left: 1px solid rgba(255,255,255,0.06);
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 60px 48px;
    position: relative;
  }

  .auth-form-title {
    font-family: 'Syne', sans-serif;
    font-size: 1.6rem; font-weight: 800;
    margin-bottom: 6px;
  }

  .auth-form-sub {
    font-size: 14px; color: rgba(255,255,255,0.4);
    margin-bottom: 36px;
  }

  .auth-field { margin-bottom: 18px; }

  .auth-field-label {
    font-size: 12px; font-weight: 600;
    letter-spacing: 0.5px;
    color: rgba(255,255,255,0.5);
    margin-bottom: 8px;
    display: block;
  }

  .auth-input-wrap { position: relative; }

  .auth-input-icon {
    position: absolute; left: 14px; top: 50%;
    transform: translateY(-50%);
    font-size: 16px; pointer-events: none;
    opacity: 0.4;
  }

  .auth-input {
    width: 100%;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 14px;
    padding: 14px 14px 14px 44px;
    color: white;
    font-family: 'DM Sans', sans-serif;
    font-size: 15px;
    outline: none;
    transition: all 0.2s;
  }

  .auth-input::placeholder { color: rgba(255,255,255,0.2); }

  .auth-input:focus {
    border-color: rgba(0,87,255,0.55);
    background: rgba(0,87,255,0.07);
    box-shadow: 0 0 0 3px rgba(0,87,255,0.12);
  }

  .auth-otp-row { display: flex; gap: 10px; }
  .auth-otp-row .auth-input { flex: 1; }

  .auth-otp-btn {
    flex-shrink: 0;
    background: rgba(0,87,255,0.15);
    border: 1px solid rgba(0,87,255,0.35);
    border-radius: 14px;
    padding: 14px 18px;
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

  .auth-submit {
    width: 100%;
    padding: 16px;
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

  .auth-divider {
    display: flex; align-items: center; gap: 16px;
    margin: 24px 0;
    font-size: 12px; color: rgba(255,255,255,0.2);
  }

  .auth-divider::before,
  .auth-divider::after {
    content: ''; flex: 1; height: 1px;
    background: rgba(255,255,255,0.07);
  }

  .auth-switch {
    text-align: center;
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
    from { opacity: 0; transform: translateY(16px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .auth-right > * { animation: authFadeUp 0.5s ease both; }

  @media (max-width: 900px) {
    .auth-left { display: none; }
    .auth-right {
      width: 100%; border-left: none;
      padding: 40px 24px;
      justify-content: flex-start;
      padding-top: 80px;
    }
  }
`;

export default function Hlogin() {
  const navigate = useNavigate();
  const [details,    setDetails]    = useState({ mobile: '', password: '' });
  const [loading,    setLoading]    = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpSent,    setOtpSent]    = useState(false);
  const [error,      setError]      = useState('');

  const handleChange = (e) =>
    setDetails(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const requestOTP = async () => {
    if (!details.mobile) { setError('Enter mobile number first'); return; }
    setOtpLoading(true); setError('');
    try {
      await API.post('/auth/otp/request/', { mobile: details.mobile });
      setOtpSent(true);
    } catch (err) {
      setError(err?.response?.data?.message || 'OTP failed. Try again.');
    } finally {
      setOtpLoading(false);
    }
  };

  const submitHandler = async (e) => {
    e.preventDefault();
    if (!details.mobile || !details.password) { setError('Enter mobile & password / OTP'); return; }
    setLoading(true); setError('');
    try {
      const { data } = await API.post('/hospitals/login/', details);

      // Clear any previously logged-in patient session first
      localStorage.clear();

      // Store hospital session
      localStorage.setItem('access',  data.access);
      localStorage.setItem('refresh', data.refresh);
      localStorage.setItem('user',    JSON.stringify(data.user));

      // Use navigate only — no reload needed, avoids re-running auth check
      navigate('/Hdashboard');
    } catch (err) {
      setError(err?.response?.data?.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

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
              <span className="auth-brand-name"><span>Token</span>walla</span>
            </Link>

            <div className="auth-left-label">Hospital Login</div>
            <h1 className="auth-left-title">
              Manage Your<br /><span>Hospital Queue</span>
            </h1>
            <p className="auth-left-sub">
              Log in to manage your doctors, view the live patient queue,
              and keep your hospital running smoothly.
            </p>

            <div className="auth-features">
              {[
                { icon: '🏥', title: 'Queue Management',   desc: 'View and manage waiting, in-progress & completed patients' },
                { icon: '👨‍⚕️', title: 'Doctor Management', desc: 'Add doctors, set slots and manage availability' },
                { icon: '📊', title: 'Live Dashboard',     desc: 'Real-time stats updated every 10 seconds' },
              ].map((f, i) => (
                <div className="auth-feature" key={i}>
                  <div className="auth-feature-icon">{f.icon}</div>
                  <div className="auth-feature-text">
                    <strong>{f.title}</strong>
                    {f.desc}
                  </div>
                </div>
              ))}
            </div>

          </div>
        </div>

        {/* RIGHT */}
        <div className="auth-right">
          <div className="auth-form-title">Hospital Sign In</div>
          <div className="auth-form-sub">Enter your registered mobile to continue</div>

          {error && (
            <div style={{
              background: 'rgba(255,80,80,0.1)',
              border: '1px solid rgba(255,80,80,0.25)',
              borderRadius: 12, padding: '12px 16px',
              fontSize: 14, color: '#FF8080',
              marginBottom: 20,
            }}>
              ⚠️ {error}
            </div>
          )}

          <form onSubmit={submitHandler}>

            <div className="auth-field">
              <label className="auth-field-label">Mobile Number</label>
              <div className="auth-input-wrap">
                <span className="auth-input-icon">📱</span>
                <input
                  className="auth-input"
                  type="text" name="mobile"
                  placeholder="Registered mobile number"
                  value={details.mobile}
                  onChange={handleChange}
                  maxLength={10}
                />
              </div>
            </div>

            <div className="auth-field">
              <label className="auth-field-label">Password / OTP</label>
              <div className="auth-otp-row">
                <div className="auth-input-wrap" style={{ flex: 1 }}>
                  <span className="auth-input-icon">🔑</span>
                  <input
                    className="auth-input"
                    type="password" name="password"
                    placeholder={otpSent ? 'Enter OTP sent to your mobile' : 'Password or OTP'}
                    value={details.password}
                    onChange={handleChange}
                  />
                </div>
                <button
                  type="button"
                  className="auth-otp-btn"
                  onClick={requestOTP}
                  disabled={otpLoading}
                >
                  {otpLoading ? '...' : otpSent ? 'Resend' : 'Get OTP'}
                </button>
              </div>
              {otpSent && (
                <span style={{ fontSize: 12, color: '#00F5C4', marginTop: 6, display: 'block' }}>
                  ✓ OTP sent to {details.mobile}
                </span>
              )}
            </div>

            <button className="auth-submit" disabled={loading}>
              {loading ? <><div className="auth-spinner" /> Signing in...</> : 'Sign In →'}
            </button>

          </form>

          <div className="auth-divider">or</div>

          <div className="auth-switch">
            New hospital?{' '}
            <Link to="/Husercreate">Register here →</Link>
          </div>
          <div className="auth-switch">
          <Link to="/forgot-password" style={{ color: '#00D4FF', fontSize: 13 }}>
               Forgot Password?
            </Link>
          </div>  

          <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', textAlign: 'center', lineHeight: 1.6 }}>
              Are you a patient?{' '}
              <Link to="/login" style={{ color: 'rgba(255,255,255,0.45)', textDecoration: 'none' }}>
                Patient Login →
              </Link>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}