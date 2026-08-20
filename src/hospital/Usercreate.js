import { lazy, Suspense, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router';
import API from '../services/api';
import { authCSS } from '../componets/authStyles';
import useAuthKeyboard from '../componets/useAuthKeyboard';
import LocationSearch from '../componets/LocationSearch';

// Leaflet is ~47kB gzipped — keep it out of the bundle until someone opens it.
const LocationPicker = lazy(() => import('../componets/LocationPicker'));

const Husercreate = () => {
  const navigate = useNavigate();
  useAuthKeyboard();

  // ?kind=SCAN_CENTER lands a centre on the centre form. Whitelisted against
  // the one value we accept rather than trusted: this is a URL, anyone can
  // write it, and the toggle above stays the real control either way.
  const [params] = useSearchParams();
  const initialKind = params.get('kind') === 'SCAN_CENTER' ? 'SCAN_CENTER' : 'HOSPITAL';

  const [hospital, setHospital] = useState({
    kind: initialKind,
    name: '', city: '', address: '', location: '', mobile: '', password: '', confirmPassword: '',
    latitude: null, longitude: null,
  });

  // One flag drives every label on this page. A scanning centre registers
  // through the same form, the same OTP and the same admin approval as a
  // hospital — only the wording and the bookable unit differ.
  const isCentre = hospital.kind === 'SCAN_CENTER';
  const noun     = isCentre ? 'Scanning Centre' : 'Hospital';

  const [loading,     setLoading]     = useState(false);
  const [otpLoading,  setOtpLoading]  = useState(false);
  const [otp,         setOtp]         = useState('');
  const [otpSent,     setOtpSent]     = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [showPass,    setShowPass]    = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errors,      setErrors]      = useState({});
  const [pickerOpen,  setPickerOpen]  = useState(false);
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
    if (!hospital.name.trim())    newErrors.name    = `${noun} name is required`;
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
        kind:      hospital.kind,
        name:      hospital.name.trim(),
        city:      hospital.city.trim(),
        address:   hospital.address.trim(),
        location:  hospital.location.trim(),
        latitude:  hospital.latitude,
        longitude: hospital.longitude,
        mobile:    hospital.mobile,
        password:  hospital.password,
      });
      setSuccess(`${noun} registered! Your account is under review — you can log in once an admin approves it.`);
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
      <style>{`
        .kind-choice { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 4px 0 22px; }
        .kind-card {
          display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
          padding: 13px 14px; border-radius: 12px; cursor: pointer; text-align: left;
          background: #fff; border: 1.5px solid var(--blue-50, #E6F0FA);
          transition: border-color .15s, background .15s, box-shadow .15s;
        }
        .kind-card:hover { border-color: var(--blue-200, #A9CCEC); }
        .kind-card.is-active {
          border-color: var(--blue-600, #1565C0); background: var(--blue-50, #E6F0FA);
          box-shadow: 0 0 0 3px rgba(21,101,192,.10);
        }
        .kind-card-icon  { font-size: 20px; line-height: 1.2; }
        .kind-card-label { font-size: 13.5px; font-weight: 700; color: var(--gray-800, #1E293B); }
        .kind-card-sub   { font-size: 11.5px; color: var(--gray-400, #94A3B8); line-height: 1.35; }
        @media (max-width: 420px) { .kind-choice { grid-template-columns: 1fr; } }
      `}</style>
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

            <div className="auth-panel-label">{noun} Registration</div>
            <h1 className="auth-panel-title">
              List Your<br />
              <span className="accent">{isCentre ? 'Centre Online' : 'Hospital Online'}</span>
            </h1>
            <p className="auth-panel-sub">
              {isCentre
                ? 'Join TokenWalla to let patients discover your scans, see your prices, book a slot and manage your live queue — all in one place.'
                : 'Join TokenWalla to let patients discover your doctors, book OPD slots, and manage your live queue — all in one place.'}
            </p>

            <div className="auth-features">
              {[
                isCentre
                  ? { icon: '🔬', title: 'Get Discovered', desc: 'Patients across AP & Telangana find your scans and prices' }
                  : { icon: '🩺', title: 'Get Discovered', desc: 'Patients across AP & Telangana find and book your doctors' },
                { icon: '🎫', title: 'Digital Tokens',    desc: 'Replace paper queues with live, trackable tokens' },
                { icon: '✅', title: 'Verified & Trusted', desc: `Every ${noun.toLowerCase()} is admin-verified before going live` },
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
          <div className="auth-form-title">Create {noun} Account</div>
          <div className="auth-form-sub">Register in a minute — it's free to join</div>

          {/* What are you registering? First question on the page, because it
              changes what the account can do: a hospital lists doctors and OPD
              slots, a centre lists scans and their prices. Switching it later
              means an admin edit, so it is asked up front rather than buried. */}
          <div className="kind-choice">
            {[
              { value: 'HOSPITAL',    icon: '🏥', label: 'Hospital / Clinic',  sub: 'You have doctors and OPD slots' },
              { value: 'SCAN_CENTER', icon: '🔬', label: 'Scanning Centre',    sub: 'MRI, CT, X-ray, blood tests' },
            ].map(opt => (
              <button
                type="button"
                key={opt.value}
                className={`kind-card ${hospital.kind === opt.value ? 'is-active' : ''}`}
                aria-pressed={hospital.kind === opt.value}
                onClick={() => setHospital(prev => ({ ...prev, kind: opt.value }))}
              >
                <span className="kind-card-icon">{opt.icon}</span>
                <span className="kind-card-label">{opt.label}</span>
                <span className="kind-card-sub">{opt.sub}</span>
              </button>
            ))}
          </div>

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
              <label className="auth-field-label">{noun} Name</label>
              <div className="auth-input-wrap">
                <span className="auth-input-icon">{isCentre ? '🔬' : '🏥'}</span>
                <input
                  className={`auth-input ${errors.name ? 'has-error' : ''}`}
                  name="name"
                  placeholder={isCentre ? 'e.g. Vijaya Diagnostics' : 'e.g. City Care Hospital'}
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
              {hospital.latitude != null ? (
                <div className="auth-verified" style={{ marginTop: 10, marginBottom: 0 }}>
                  <span>✅</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>Pinned on the map</div>
                    <div style={{ fontSize: 11.5, opacity: 0.75 }}>
                      {hospital.latitude.toFixed(6)}, {hospital.longitude.toFixed(6)}
                    </div>
                  </div>
                  <button type="button" className="auth-otp-btn" style={{ padding: '7px 12px' }}
                          onClick={() => setPickerOpen(true)}>Change</button>
                </div>
              ) : (
                <button type="button" className="auth-otp-btn"
                        style={{ width: '100%', marginTop: 10 }}
                        onClick={() => setPickerOpen(true)}>
                  🗺️ Pin exact location on map
                </button>
              )}
              <span className="otp-hint" style={{ color: 'var(--gray-500)' }}>
                An exact pin helps patients find your entrance and get directions.
              </span>
              {errors.city && <span className="auth-field-error">{errors.city}</span>}

              {pickerOpen && (
                <Suspense fallback={null}>
                  <LocationPicker
                    open
                    initial={hospital.latitude != null
                      ? { lat: hospital.latitude, lng: hospital.longitude }
                      : null}
                    onClose={() => setPickerOpen(false)}
                    onPick={({ city, label, lat, lng }) => {
                      setHospital(prev => ({
                        ...prev,
                        city: prev.city || city,
                        location: prev.location || label,
                        latitude: lat,
                        longitude: lng,
                      }));
                      setErrors(prev => ({ ...prev, city: '' }));
                    }}
                  />
                </Suspense>
              )}
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
                  className={`auth-input has-eye ${errors.password ? 'has-error' : ''}`}
                  type={showPass ? 'text' : 'password'} name="password" placeholder="Min 6 characters"
                  value={hospital.password} onChange={handleChange}
                />
                <button
                  type="button" className="auth-eye"
                  onClick={() => setShowPass(p => !p)}
                  aria-label={showPass ? 'Hide password' : 'Show password'}
                >
                  {showPass ? '🙈' : '👁️'}
                </button>
              </div>
              {errors.password && <span className="auth-field-error">{errors.password}</span>}
            </div>

            {/* Confirm password */}
            <div className="auth-field">
              <label className="auth-field-label">Confirm Password</label>
              <div className="auth-input-wrap">
                <span className="auth-input-icon">🔒</span>
                <input
                  className={`auth-input has-eye ${errors.confirmPassword ? 'has-error' : ''}`}
                  type={showConfirm ? 'text' : 'password'} name="confirmPassword" placeholder="Re-enter password"
                  value={hospital.confirmPassword} onChange={handleChange}
                />
                <button
                  type="button" className="auth-eye"
                  onClick={() => setShowConfirm(p => !p)}
                  aria-label={showConfirm ? 'Hide password' : 'Show password'}
                >
                  {showConfirm ? '🙈' : '👁️'}
                </button>
              </div>
              {errors.confirmPassword && <span className="auth-field-error">{errors.confirmPassword}</span>}
            </div>

            <button className="auth-submit" disabled={loading || !!success}>
              {loading ? <><div className="spinner" /> Registering...</> : `Register ${noun} →`}
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
