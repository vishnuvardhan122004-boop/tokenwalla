import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import API from '../services/api';
import { authCSS } from './authStyles';
import SEO from './SEO';
export default function Login() {
  const navigate = useNavigate();
  const [details,    setDetails]    = useState({ mobile: '', password: '' })
  const [loading,    setLoading]    = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpSent,    setOtpSent]    = useState(false);
  const [error,      setError]      = useState('');

  const handleChange = e => setDetails(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const requestOTP = async () => {
    if (!details.mobile) { setError('Enter mobile number first'); return; }
    setOtpLoading(true); setError('');
    try {
      await API.post('/auth/otp/request/', { mobile: details.mobile });
      setOtpSent(true);
    } catch { setError('OTP failed. Try again.'); }
    finally { setOtpLoading(false); }
  };

  const submitHandler = async e => {
    e.preventDefault();
    if (!details.mobile || !details.password) { setError('Enter mobile & password / OTP'); return; }
    setLoading(true); setError('');
    try {
      const { data } = await API.post('/auth/login/', details);
      localStorage.setItem('access',  data.access);
      localStorage.setItem('refresh', data.refresh);
      localStorage.setItem('user',    JSON.stringify(data.user));
      navigate('/alldoctor');
    } catch (err) {
      setError(err?.response?.data?.message || 'Invalid credentials');
    } finally { setLoading(false); }
  };

  return (
    <>
    <SEO
     title="Patient Login — TokenWalla"
     description="Log in to your TokenWalla account to view bookings, track your queue position, and book new doctor appointments online."
      url="/login"
      noIndex={false}
   />
      <style>{authCSS}</style>
      <div className="auth-page">

        {/* Left */}
        <div className="auth-left">
          <div className="auth-left-grid" />
          <div className="auth-left-glow" />
          <div className="auth-left-content">
            <Link to="/" className="auth-brand">
              <div className="auth-brand-logo"><img src="/logo.png" alt="TokenWalla" /></div>
              <span className="auth-brand-name"><span className="accent">Token</span>walla</span>
            </Link>

            <div className="auth-panel-label">Patient Login</div>
            <h1 className="auth-panel-title">Welcome<br /><span className="accent">Back!</span></h1>
            <p className="auth-panel-sub">
              Log in to view your bookings, track your live queue position,
              and book new doctor appointments instantly.
            </p>

            <div className="auth-features">
              {[
                { icon: '🎫', title: 'Instant Token',       desc: 'Get your token immediately after booking'   },
                { icon: '📍', title: 'Live Queue Tracking', desc: 'Know your exact position in the queue'       },
                { icon: '🔐', title: 'Secure & Private',    desc: 'Your data is encrypted and never shared'     },
              ].map((f, i) => (
                <div className="auth-feature" key={i}>
                  <div className="auth-feature-icon">{f.icon}</div>
                  <div>
                    <div className="auth-feature-title">{f.title}</div>
                    <div className="auth-feature-desc">{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right */}
        <div className="auth-right">
          <div className="auth-form-title">Sign In</div>
          <div className="auth-form-sub">Enter your mobile number to continue</div>

          {error && (
            <div className="auth-alert-error">
              <span>⚠️</span> {error}
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
                  placeholder="10-digit mobile number"
                  value={details.mobile}
                  onChange={handleChange}
                  maxLength={10}
                />
              </div>
            </div>

            <div className="auth-field">
              <label className="auth-field-label">Password / OTP</label>
              <div className="auth-otp-row">
                <div className="auth-input-wrap">
                  <span className="auth-input-icon">🔑</span>
                  <input
                    className="auth-input"
                    type="password" name="password"
                    placeholder={otpSent ? 'Enter OTP sent to your mobile' : 'Password or OTP'}
                    value={details.password}
                    onChange={handleChange}
                  />
                </div>
                <button type="button" className="auth-otp-btn" onClick={requestOTP} disabled={otpLoading}>
                  {otpLoading ? '...' : otpSent ? 'Resend' : 'Get OTP'}
                </button>
              </div>
              {otpSent && <span className="otp-hint">✓ OTP sent to {details.mobile}</span>}
            </div>

            <button className="auth-submit" disabled={loading}>
              {loading ? <><div className="spinner" /> Signing in...</> : 'Sign In →'}
            </button>
          </form>

          <div style={{ textAlign: 'right', marginTop: 8 }}>
            <Link to="/forgot-password" style={{ fontSize: 13, color: 'var(--blue-600)' }}>
              Forgot Password?
            </Link>
          </div>

          <div className="auth-divider">or</div>

          <div className="auth-switch">
            Don't have an account? <Link to="/profilecreate">Create one free →</Link>
          </div>

          <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--blue-50)', textAlign: 'center' }}>
            <span style={{ fontSize: 13, color: 'var(--gray-400)' }}>
              Are you a hospital?{' '}
              <Link to="/Hlogin" style={{ color: 'var(--blue-600)', fontWeight: 600, textDecoration: 'none' }}>
                Hospital Login →
              </Link>
            </span>
          </div>
        </div>
      </div>
    </>
  );
}