import { useState } from 'react';
import { useNavigate, Link } from 'react-router';
import API from '../services/api';

const Husercreate = () => {
  const navigate = useNavigate();

  const [hospital, setHospital] = useState({
    name: '', city: '', address: '', mobile: '', password: '', confirmPassword: '',
  });

  const [loading,     setLoading]     = useState(false);
  const [otpLoading,  setOtpLoading]  = useState(false);
  const [otp,         setOtp]         = useState('');
  const [otpSent,     setOtpSent]     = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [errors,      setErrors]      = useState({});

  const handleChange = (e) => {
    const { name, value } = e.target;
    setHospital(prev => ({ ...prev, [name]: value }));
  };

  const validate = () => {
    let newErrors = {};
    if (!hospital.name.trim())    newErrors.name    = 'Hospital name required';
    if (!hospital.city.trim())    newErrors.city    = 'City required';
    if (!hospital.address.trim()) newErrors.address = 'Address required';
    if (!/^[6-9]\d{9}$/.test(hospital.mobile)) newErrors.mobile = 'Enter valid mobile';
    if (hospital.password.length < 6) newErrors.password = 'Min 6 characters';
    if (hospital.password !== hospital.confirmPassword)
      newErrors.confirmPassword = 'Passwords do not match';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const requestOTP = async () => {
    if (!/^[6-9]\d{9}$/.test(hospital.mobile)) {
      setErrors(prev => ({ ...prev, mobile: 'Enter valid mobile first' }));
      return;
    }
    setOtpLoading(true);
    try {
      await API.post('/auth/otp/request/', { mobile: hospital.mobile });
      setOtpSent(true);
      alert('OTP sent to ' + hospital.mobile);
    } catch {
      alert('OTP failed. Try again.');
    } finally {
      setOtpLoading(false);
    }
  };

  const verifyOTP = async () => {
    try {
      const { data } = await API.post('/auth/otp/verify/', {
        mobile: hospital.mobile, otp,
      });
      if (data.verified) { setOtpVerified(true); }
      else               { alert('Invalid OTP'); }
    } catch {
      alert('Invalid OTP');
    }
  };

  const submitHandler = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    if (!otpVerified) { alert('Please verify OTP first'); return; }

    setLoading(true);
    try {
      await API.post('/hospitals/register/', {
        name:     hospital.name,
        city:     hospital.city,
        address:  hospital.address,
        mobile:   hospital.mobile,
        password: hospital.password,
      });
      alert('Hospital registered successfully! Please login.');
      navigate('/Hlogin');
    } catch (err) {
      alert(err?.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container py-5">
      <div className="col-lg-6 mx-auto shadow-lg p-5 bg-white rounded">

        <div className="text-center mb-4">
          <img src="/logo.png" alt="TokenWalla"
            style={{ width: '48px', borderRadius: '12px', marginBottom: '10px' }} />
          <h3 className="mb-0">Register Hospital</h3>
          <small className="text-muted">Create your hospital account</small>
        </div>

        <form onSubmit={submitHandler}>

          <input type="text" name="name" className="form-control mb-1"
            placeholder="Hospital Name" value={hospital.name} onChange={handleChange} />
          <small className="text-danger d-block mb-2">{errors.name}</small>

          <input type="text" name="city" className="form-control mb-1"
            placeholder="City" value={hospital.city} onChange={handleChange} />
          <small className="text-danger d-block mb-2">{errors.city}</small>

          <textarea name="address" className="form-control mb-1"
            placeholder="Full Address" rows="2"
            value={hospital.address} onChange={handleChange} />
          <small className="text-danger d-block mb-2">{errors.address}</small>

          <input type="text" name="mobile" className="form-control mb-1"
            placeholder="Mobile Number" value={hospital.mobile} onChange={handleChange} />
          <small className="text-danger d-block mb-2">{errors.mobile}</small>

          <button type="button" className="btn btn-outline-primary w-100 mb-3"
            onClick={requestOTP} disabled={otpLoading}>
            {otpLoading ? 'Sending…' : otpSent ? 'OTP Sent ✓  Resend?' : 'Request OTP'}
          </button>

          {otpSent && !otpVerified && (
            <>
              <input type="text" className="form-control mb-2" placeholder="Enter OTP"
                value={otp} onChange={(e) => setOtp(e.target.value)} />
              <button type="button" className="btn btn-success w-100 mb-3" onClick={verifyOTP}>
                Verify OTP
              </button>
            </>
          )}

          {otpVerified && (
            <p className="text-success mb-3 fw-semibold">✓ Mobile verified</p>
          )}

          <input type="password" name="password" className="form-control mb-1"
            placeholder="Set Password" value={hospital.password} onChange={handleChange} />
          <small className="text-danger d-block mb-2">{errors.password}</small>

          <input type="password" name="confirmPassword" className="form-control mb-1"
            placeholder="Confirm Password" value={hospital.confirmPassword} onChange={handleChange} />
          <small className="text-danger d-block mb-2">{errors.confirmPassword}</small>

          <button className="btn btn-primary w-100 mt-2" disabled={loading}>
            {loading ? 'Registering…' : 'Register Hospital'}
          </button>

          <p className="text-center mt-3 text-muted small">
            Already registered?{' '}
            <Link to="/Hlogin" className="text-primary">Login here</Link>
          </p>

        </form>
      </div>
    </div>
  );
};

export default Husercreate;