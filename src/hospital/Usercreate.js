import { useState } from 'react';
import { useNavigate, Link } from 'react-router';
import API from '../services/api';
import { authCSS } from '../componets/authStyles';
import LocationSearch from '../componets/LocationSearch';

const Husercreate = () => {
  const navigate = useNavigate();

  const [hospital, setHospital] = useState({
    name: '', city: '', address: '', location: '', mobile: '', password: '', confirmPassword: '',
    latitude: null, longitude: null,
  });

  const [loading,     setLoading]     = useState(false);
  const [otpLoading,  setOtpLoading]  = useState(false);
  const [otp,         setOtp]         = useState('');
  const [otpSent,     setOtpSent]     = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [errors,      setErrors]      = useState({});
  const [error,       setError]       = useState('');
  const [success,     setSuccess]     = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    const v = name === 'mobile' ? value.replace(/\D/g, '').slice(0, 10) : value;
    setHospital(prev => ({ ...prev, [name]: v }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
    // Editing the mobile invalidates a prior verification.
    if (name === 'mobile') { setOtpSent(false); setOtpVerified(false); setOtp(''); }
  };

  const validate = () => {
    const newErrors = {};
    if (!hospital.name.trim())    newErrors.name    = 'Hospital name is required';
    if (!hospital.city.trim())    newErrors.city    = 'City is required';
    if (!hospital.address.trim()) newErrors.address = 'Address is required';
    if (!/^[6-9]\d{9}$/.test(hospital.mobile)) newErrors.mobile = 'Enter a valid 10-digit mobile';
    if (hospital.password.length < 6) newErrors.password = 'Minimum 6 characters';
    if (hospital.password !== hospital.confirmPassword)
      newErrors.confirmPassword = 'Passwords do not match';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const requestOTP = async () => {
    setError('');
    if (!/^[6-9]\d{9}$/.test(hospital.mobile)) {
      setErrors(prev => ({ ...prev, mobile: 'Enter a valid mobile first' }));
      return;
    }
    setOtpLoading(true);
    try {
      await API.post('/auth/otp/request/', { mobile: hospital.mobile });
      setOtpSent(true);
    } catch {
      setError('Could not send OTP. Please try again.');
    } finally {
      setOtpLoading(false);
    }
  };

  const verifyOTP = async () => {
    setError('');
    if (!otp.trim()) return;
    setOtpLoading(true);
    try {
      const { data } = await API.post('/auth/otp/verify/', { mobile: hospital.mobile, otp });
      if (data.verified) setOtpVerified(true);
      else setError('Invalid OTP. Please check and try again.');
    } catch {
      setError('Invalid OTP. Please try again.');
    } finally {
      setOtpLoading(false);
    }
  };

  const submitHandler = async (e) => {
    e.preventDefault();
    setError('');
    if (!validate()) return;
    if (!otpVerified) { setError('Please verify your mobile number with OTP first.'); return; }

    setLoading(true);
    try {
      await API.post('/hospitals/register/', {
        name:      hospital.name.trim(),
        city:      hospital.city.trim(),
        address:   hospital.address.trim(),
        location:  hospital.location.trim(),
        latitude:  hospital.latitude,
        longitude: hospital.longitude,
        mobile:    hospital.mobile,
        password:  hospital.password,
      });
      setSuccess('Hospital registered! Your account is under review — you can log in once an admin approves it.');
      setTimeout(() => navigate('/Hlogin'), 2200);
    } catch (err) {
      setError(err?.response?.data?.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const basicsFilled = hospital.name && hospital.city && hospital.address && /^[6-9]\d{9}$/.test(hospital.mobile);

  return (
    <>
      <style>{authCSS}</style>
      <div className="auth-page">

        {/* ── Left panel ── */}
        <div className="auth-left">
          <div className="auth-left-grid" />
          <div className="auth-left-glow" />
          <div className="auth-left-content">
            <Link to="/" className="auth-brand">
              <div className="auth-brand-logo"><img src="/logo.png" alt="TokenWalla" /></div>
              <span className="auth-brand-name"><span className="accent">Token</span>walla</span>
            </Link>

            <div className="auth-panel-label">Hospital Registration</div>
            <h1 className="auth-panel-title">List Your<br /><span className="accent">Hospital Online</span></h1>
            <p className="auth-panel-sub">
              Join TokenWalla to let patients discover your doctors, book OPD slots,
              and manage your live queue — all in one place.
            </p>

            <div className="auth-features">
              {[
                { icon: '🩺', title: 'Get Discovered',    desc: 'Patients across AP & Telangana find and book your doctors' },
                { icon: '🎫', title: 'Digital Tokens',    desc: 'Replace paper queues with live, trackable tokens' },
                { icon: '✅', title: 'Verified & Trusted', desc: 'Every hospital is admin-verified before going live' },
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

        {/* ── Right panel (form) ── */}
        <div className="auth-right">
          <div className="auth-form-title">Create Hospital Account</div>
          <div className="auth-form-sub">Register in a minute — it's free to join</div>

          {/* Progress */}
          <div className="auth-progress">
            <div className={`auth-progress-step ${basicsFilled ? 'done' : 'active'}`} />
            <div className={`auth-progress-step ${otpVerified ? 'done' : basicsFilled ? 'active' : ''}`} />
            <div className={`auth-progress-step ${otpVerified ? 'active' : ''}`} />
          </div>

          {error   && <div className="auth-alert-error"><span>⚠️</span> {error}</div>}
          {success && <div className="auth-alert-success">✅ {success}</div>}

          <form onSubmit={submitHandler} noValidate>

            {/* Hospital name */}
            <div className="auth-field">
              <label className="auth-field-label">Hospital Name</label>
              <div className="auth-input-wrap">
                <span className="auth-input-icon">🏥</span>
                <input
                  className={`auth-input ${errors.name ? 'has-error' : ''}`}
                  name="name" placeholder="e.g. City Care Hospital"
                  value={hospital.name} onChange={handleChange}
                />
              </div>
              {errors.name && <span className="auth-field-error">{errors.name}</span>}
            </div>

            {/* City / location — real place autocomplete (captures coordinates) */}
            <div className="auth-field">
              <label className="auth-field-label">City / Location</label>
              <LocationSearch
                value={hospital.city}
                inputClassName={`auth-input ${errors.city ? 'has-error' : ''}`}
                placeholder="Search your city or area…"
                onChangeText={(t) => {
                  // Free typing clears any previously picked coordinates.
                  setHospital(prev => ({ ...prev, city: t, latitude: null, longitude: null }));
                  if (errors.city) setErrors(prev => ({ ...prev, city: '' }));
                }}
                onPick={({ city, label, lat, lng }) => {
                  setHospital(prev => ({
                    ...prev,
                    city: city || prev.city,
                    location: prev.location || label,
                    latitude: lat,
                    longitude: lng,
                  }));
                  setErrors(prev => ({ ...prev, city: '' }));
                }}
              />
              {hospital.latitude != null && (
                <span className="otp-hint">✓ Location pinned on the map</span>
              )}
              {errors.city && <span className="auth-field-error">{errors.city}</span>}
            </div>

            {/* Address */}
            <div className="auth-field">
              <label className="auth-field-label">Full Address</label>
              <textarea
                className={`auth-input ${errors.address ? 'has-error' : ''}`}
                name="address" placeholder="Building, street, area, PIN code" rows="2"
                style={{ paddingLeft: 14, resize: 'vertical' }}
                value={hospital.address} onChange={handleChange}
              />
              {errors.address && <span className="auth-field-error">{errors.address}</span>}
            </div>

            {/* Maps location (optional) */}
            <div className="auth-field">
              <label className="auth-field-label">Maps Location <span style={{ color: 'var(--gray-400)', fontWeight: 400 }}>(optional)</span></label>
              <div className="auth-input-wrap">
                <span className="auth-input-icon">🔗</span>
                <input
                  className="auth-input"
                  name="location" placeholder="Google Maps link or landmark"
                  value={hospital.location} onChange={handleChange}
                />
              </div>
              <span style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 5, display: 'block' }}>
                Helps patients find you and get directions.
              </span>
            </div>

            {/* Mobile + OTP */}
            <div className="auth-field">
              <label className="auth-field-label">Mobile Number</label>
              <div className="auth-otp-row">
                <div className="auth-input-wrap">
                  <span className="auth-input-icon">📱</span>
                  <input
                    className={`auth-input ${errors.mobile ? 'has-error' : ''}`}
                    name="mobile" placeholder="10-digit mobile" maxLength={10} inputMode="numeric"
                    value={hospital.mobile} onChange={handleChange} disabled={otpVerified}
                  />
                </div>
                {!otpVerified && (
                  <button type="button" className="auth-otp-btn" onClick={requestOTP} disabled={otpLoading}>
                    {otpLoading ? '...' : otpSent ? 'Resend' : 'Get OTP'}
                  </button>
                )}
              </div>
              {errors.mobile && <span className="auth-field-error">{errors.mobile}</span>}
              {otpSent && !otpVerified && <span className="otp-hint">✓ OTP sent to {hospital.mobile}</span>}
            </div>

            {/* OTP entry */}
            {otpSent && !otpVerified && (
              <div className="auth-field">
                <label className="auth-field-label">Enter OTP</label>
                <div className="auth-otp-row">
                  <div className="auth-input-wrap">
                    <span className="auth-input-icon">🔢</span>
                    <input
                      className="auth-input"
                      placeholder="6-digit code" maxLength={6} inputMode="numeric"
                      value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    />
                  </div>
                  <button type="button" className="auth-otp-btn" onClick={verifyOTP} disabled={otpLoading || !otp}>
                    {otpLoading ? '...' : 'Verify'}
                  </button>
                </div>
              </div>
            )}

            {otpVerified && <div className="auth-verified">✓ Mobile number verified</div>}

            {/* Password */}
            <div className="auth-field">
              <label className="auth-field-label">Set Password</label>
              <div className="auth-input-wrap">
                <span className="auth-input-icon">🔑</span>
                <input
                  className={`auth-input ${errors.password ? 'has-error' : ''}`}
                  type="password" name="password" placeholder="Min 6 characters"
                  value={hospital.password} onChange={handleChange}
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
                  type="password" name="confirmPassword" placeholder="Re-enter password"
                  value={hospital.confirmPassword} onChange={handleChange}
                />
              </div>
              {errors.confirmPassword && <span className="auth-field-error">{errors.confirmPassword}</span>}
            </div>

            <button className="auth-submit" disabled={loading || !!success}>
              {loading ? <><div className="spinner" /> Registering...</> : 'Register Hospital →'}
            </button>
          </form>

          <div className="auth-divider">or</div>

          <div className="auth-switch">
            Already registered? <Link to="/Hlogin">Login here →</Link>
          </div>

          <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--blue-50)', textAlign: 'center' }}>
            <span style={{ fontSize: 13, color: 'var(--gray-400)' }}>
              Are you a patient?{' '}
              <Link to="/login" style={{ color: 'var(--blue-600)', fontWeight: 600, textDecoration: 'none' }}>
                Patient Login →
              </Link>
            </span>
          </div>
        </div>
      </div>
    </>
  );
};

export default Husercreate;
