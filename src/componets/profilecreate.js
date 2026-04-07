import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import API from '../services/api';
import { authCSS } from './authStyles';

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
    } finally { setOtpLoading(false); }
  };

  const verifyOTP = async () => {
    try {
      const { data } = await API.post('/auth/otp/verify/', { mobile: user.mobile, otp });
      if (data.verified) { setOtpVerified(true); }
      else { setGlobalError('Invalid OTP. Please try again.'); }
    } catch { setGlobalError('Invalid OTP. Please try again.'); }
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
      if (errData?.mobile) setErrors(prev => ({ ...prev, mobile: errData.mobile[0] }));
      else setGlobalError(errData?.message || 'Registration failed. Try again.');
    } finally { setLoading(false); }
  };

  const step = otpVerified ? 3 : otpSent ? 2 : 1;

  return (
    <>
      <style>{authCSS}</style>
      <div className="auth-page">

        {/* ── LEFT ── */}
        <div className="auth-left">
          <div className="auth-left-grid" />
          <div className="auth-left-glow" />
          <div className="auth-left-content">
            <Link to="/" className="auth-brand">
              <div className="auth-brand-logo"><img src="/logo.png" alt="TokenWalla" /></div>
              <span className="auth-brand-name"><span className="accent">Token</span>walla</span>
            </Link>

            <div className="auth-panel-label">Create Account</div>
            <h1 className="auth-panel-title">
              Join<br /><span className="accent">TokenWalla</span>
            </h1>
            <p className="auth-panel-sub">
              Create your free account and start booking doctor appointments with digital tokens — no more long queues.
            </p>

            <div className="auth-features">
              {[
                { icon: '1️⃣', title: 'Enter your details',    desc: 'Name, mobile number and password'          },
                { icon: '2️⃣', title: 'Verify mobile via OTP', desc: 'We\'ll send a 4-digit code to your number' },
                { icon: '3️⃣', title: 'Start booking',         desc: 'Find doctors and book your first appointment' },
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

        {/* ── RIGHT ── */}
        <div className="auth-right">
          {/* Progress */}
          <div className="auth-progress">
            {[1,2,3].map(n => (
              <div key={n} className={`auth-progress-step ${n < step ? 'done' : n === step ? 'active' : ''}`} />
            ))}
          </div>

          <div className="auth-form-title">Create Account</div>
          <div className="auth-form-sub">
            {step === 1 && 'Fill in your details to get started'}
            {step === 2 && `Enter the OTP sent to ${user.mobile}`}
            {step === 3 && '✓ Mobile verified — set your password'}
          </div>

          {globalError && (
            <div className="auth-alert-error"><span>⚠️</span> {globalError}</div>
          )}

          <form onSubmit={submitHandler}>

            {/* Name */}
            <div className="auth-field">
              <label className="auth-field-label">Full Name</label>
              <div className="auth-input-wrap">
                <span className="auth-input-icon">👤</span>
                <input
                  className={`auth-input ${errors.name ? 'has-error' : ''}`}
                  type="text" name="name" placeholder="Your full name"
                  value={user.name} onChange={changeUser}
                />
              </div>
              {errors.name && <span className="auth-field-error">{errors.name}</span>}
            </div>

            {/* Mobile + OTP */}
            <div className="auth-field">
              <label className="auth-field-label">Mobile Number</label>
              <div className="auth-otp-row">
                <div className="auth-input-wrap">
                  <span className="auth-input-icon">📱</span>
                  <input
                    className={`auth-input ${errors.mobile ? 'has-error' : ''}`}
                    type="text" name="mobile" placeholder="10-digit mobile"
                    value={user.mobile} onChange={changeUser} maxLength={10}
                    disabled={otpVerified}
                  />
                </div>
                {!otpVerified && (
                  <button type="button" className="auth-otp-btn" onClick={requestOTP} disabled={otpLoading}>
                    {otpLoading ? '...' : otpSent ? 'Resend' : 'Get OTP'}
                  </button>
                )}
              </div>
              {errors.mobile && <span className="auth-field-error">{errors.mobile}</span>}
            </div>

            {/* OTP input */}
            {otpSent && !otpVerified && (
              <div className="auth-field">
                <label className="auth-field-label">Enter OTP</label>
                <div className="auth-input-wrap">
                  <span className="auth-input-icon">🔢</span>
                  <input
                    className="auth-input" type="text" placeholder="4-digit OTP"
                    value={otp} onChange={e => setOtp(e.target.value)} maxLength={4}
                  />
                </div>
                <button
                  type="button"
                  style={{
                    width:'100%', padding:'11px', marginTop:8, borderRadius:11,
                    border:'1px solid var(--color-success-border)',
                    background:'var(--color-success-bg)', color:'var(--color-success-text)',
                    fontFamily:'DM Sans,sans-serif', fontSize:14, fontWeight:600,
                    cursor:'pointer', transition:'all 0.15s',
                  }}
                  onClick={verifyOTP}
                >
                  Verify OTP →
                </button>
              </div>
            )}

            {/* Verified */}
            {otpVerified && (
              <div className="auth-verified" style={{ marginBottom:14 }}>
                <span style={{ fontSize:18 }}>✅</span>
                Mobile verified — {user.mobile}
              </div>
            )}

            {/* Password */}
            <div className="auth-field">
              <label className="auth-field-label">Password</label>
              <div className="auth-input-wrap">
                <span className="auth-input-icon">🔑</span>
                <input
                  className={`auth-input ${errors.password ? 'has-error' : ''}`}
                  type="password" name="password"
                  placeholder="Min 6 chars, letters + numbers"
                  value={user.password} onChange={changeUser}
                />
              </div>
              {errors.password && <span className="auth-field-error">{errors.password}</span>}
            </div>

            {/* Confirm password */}
            <div className="auth-field">
              <label className="auth-field-label">Confirm Password</label>
              <div className="auth-input-wrap">
                <span className="auth-input-icon">🔒</span>
                <input
                  className={`auth-input ${errors.confirmPassword ? 'has-error' : ''}`}
                  type="password" name="confirmPassword"
                  placeholder="Repeat your password"
                  value={user.confirmPassword} onChange={changeUser}
                />
              </div>
              {errors.confirmPassword && <span className="auth-field-error">{errors.confirmPassword}</span>}
            </div>

            <button className="auth-submit" disabled={loading}>
              {loading ? <><div className="spinner" /> Creating account…</> : 'Create Account →'}
            </button>
          </form>

          <div className="auth-divider">or</div>
          <div className="auth-switch">
            Already have an account? <Link to="/login">Sign in →</Link>
          </div>
        </div>
      </div>
    </>
  );
}