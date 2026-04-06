// v2 admin login
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import API from '../services/api';

export default function Admin() {
  const navigate = useNavigate();
  const [mobile,   setMobile]   = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!mobile || !password) { setError('Enter your mobile and password'); return; }
    setLoading(true); setError('');

    try {
      const { data } = await API.post('/auth/login/', { mobile, password });

      if (data.user?.role !== 'admin') {
        setError('Access denied. This login is for admins only.');
        setLoading(false);
        return;
      }

      localStorage.setItem('access',  data.access);
      localStorage.setItem('refresh', data.refresh);
      localStorage.setItem('user',    JSON.stringify(data.user));
      navigate('/Adashboard');
    } catch (err) {
      setError(err?.response?.data?.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .al-root {
          font-family: 'DM Sans', sans-serif;
          min-height: 100vh;
          background: linear-gradient(160deg, #F4F9FF 0%, #EAF3FF 60%, #F8FBFF 100%);
          display: flex; align-items: center; justify-content: center;
          padding: 24px 16px; position: relative; overflow: hidden;
        }
        .al-grid {
          position: fixed; inset: 0; pointer-events: none;
          background-image:
            linear-gradient(#B5D4F4 1px, transparent 1px),
            linear-gradient(90deg, #B5D4F4 1px, transparent 1px);
          background-size: 52px 52px; opacity: 0.35;
        }
        .al-glow {
          position: fixed; top: -150px; right: -100px;
          width: 600px; height: 600px; border-radius: 50%;
          background: radial-gradient(circle, rgba(24,95,165,0.1) 0%, transparent 65%);
          pointer-events: none;
        }
        .al-card {
          position: relative; z-index: 1;
          width: 100%; max-width: 420px;
          background: #fff; border: 1px solid #B5D4F4;
          border-radius: 24px; padding: 40px 36px;
          box-shadow: 0 12px 48px rgba(24,95,165,0.12), 0 4px 12px rgba(0,0,0,0.04);
          animation: alUp 0.45s cubic-bezier(0.34,1.56,0.64,1) both;
        }
        @keyframes alUp { from{opacity:0;transform:translateY(18px) scale(0.98)} to{opacity:1;transform:translateY(0) scale(1)} }
        .al-card::before {
          content:''; position:absolute; top:0; left:0; right:0; height:3px;
          background: linear-gradient(90deg, #185FA5, #378ADD, #85B7EB);
          border-radius: 24px 24px 0 0;
        }

        .al-brand {
          display: flex; align-items: center; gap: 10px;
          text-decoration: none; margin-bottom: 32px; justify-content: center;
        }
        .al-logo {
          width: 40px; height: 40px; border-radius: 11px; overflow: hidden;
          box-shadow: 0 4px 14px rgba(24,95,165,0.25);
          transition: transform 0.25s cubic-bezier(0.34,1.56,0.64,1);
        }
        .al-brand:hover .al-logo { transform: rotate(-6deg) scale(1.08); }
        .al-logo img { width:100%; height:100%; object-fit:cover; display:block; }
        .al-brand-name {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 1.2rem; font-weight: 800; color: #0F172A;
        }
        .al-brand-name .acc { color: #185FA5; }

        .al-label {
          font-size: 11px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase;
          color: #185FA5; margin-bottom: 8px;
        }
        .al-title {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 1.5rem; font-weight: 800; color: #0F172A; margin-bottom: 4px;
        }
        .al-sub { font-size: 14px; color: #64748B; margin-bottom: 26px; }

        .al-error {
          background: #FCEBEB; border: 1px solid #F09595; border-radius: 11px;
          padding: 11px 14px; font-size: 14px; color: #A32D2D;
          margin-bottom: 18px; display: flex; align-items: flex-start; gap: 8px;
        }

        .al-field { margin-bottom: 16px; }
        .al-field label {
          display: block; font-size: 12px; font-weight: 600;
          color: #64748B; margin-bottom: 7px;
        }
        .al-wrap { position: relative; }
        .al-icon {
          position: absolute; left: 13px; top: 50%; transform: translateY(-50%);
          font-size: 15px; color: #94A3B8; pointer-events: none;
        }
        .al-input {
          width: 100%; background: #F8FAFC; border: 1px solid #B5D4F4;
          border-radius: 12px; padding: 12px 14px 12px 42px;
          font-family: 'DM Sans', sans-serif; font-size: 15px; color: #0F172A;
          outline: none; transition: all 0.15s;
        }
        .al-input::placeholder { color: #94A3B8; }
        .al-input:focus {
          border-color: #378ADD; background: #fff;
          box-shadow: 0 0 0 3px rgba(55,138,221,0.14);
        }

        .al-btn {
          width: 100%; padding: 14px; border-radius: 12px; border: none;
          background: #185FA5; color: #fff;
          font-family: 'DM Sans', sans-serif; font-size: 15px; font-weight: 600;
          cursor: pointer; transition: all 0.2s;
          box-shadow: 0 4px 14px rgba(24,95,165,0.22);
          display: flex; align-items: center; justify-content: center; gap: 9px;
          margin-top: 8px;
        }
        .al-btn:hover:not(:disabled) {
          background: #0C447C;
          box-shadow: 0 8px 24px rgba(24,95,165,0.32);
          transform: translateY(-1px);
        }
        .al-btn:disabled { opacity: 0.55; cursor: not-allowed; transform: none; }
        .al-spinner {
          width: 18px; height: 18px;
          border: 2px solid rgba(255,255,255,0.35); border-top-color: #fff;
          border-radius: 50%; animation: alSpin 0.7s linear infinite; flex-shrink: 0;
        }
        @keyframes alSpin { to{transform:rotate(360deg)} }

        .al-info {
          display: flex; align-items: flex-start; gap: 10px;
          background: #E6F1FB; border: 1px solid #B5D4F4;
          border-radius: 12px; padding: 12px 14px; margin-top: 22px;
          font-size: 12px; color: #185FA5; line-height: 1.6;
        }
        .al-info-icon { font-size: 16px; flex-shrink: 0; margin-top: 1px; }

        .al-footer {
          text-align: center; margin-top: 20px;
          font-size: 13px; color: #94A3B8;
        }
        .al-footer a { color: #185FA5; text-decoration: none; font-weight: 500; }
        .al-footer a:hover { color: #0C447C; }

        @media (max-width: 480px) { .al-card { padding: 28px 20px; } }
      `}</style>

      <div className="al-root">
        <div className="al-grid" />
        <div className="al-glow" />

        <div className="al-card">
          <Link to="/" className="al-brand">
            <div className="al-logo"><img src="/logo.png" alt="TokenWalla" /></div>
            <span className="al-brand-name"><span className="acc">Token</span>walla</span>
          </Link>

          <div className="al-label">Admin Access</div>
          <div className="al-title">Admin Sign In</div>
          <div className="al-sub">Use your admin account credentials to continue</div>

          {error && <div className="al-error"><span>⚠️</span> {error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="al-field">
              <label>Mobile Number</label>
              <div className="al-wrap">
                <span className="al-icon">📱</span>
                <input
                  className="al-input" type="text"
                  placeholder="Admin mobile number"
                  value={mobile}
                  onChange={e => setMobile(e.target.value.replace(/\D/, '').slice(0, 10))}
                  maxLength={10} autoFocus
                />
              </div>
            </div>

            <div className="al-field">
              <label>Password</label>
              <div className="al-wrap">
                <span className="al-icon">🔑</span>
                <input
                  className="al-input" type="password"
                  placeholder="Admin password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
              </div>
            </div>

            <button className="al-btn" type="submit" disabled={loading}>
              {loading
                ? <><div className="al-spinner" /> Signing in…</>
                : 'Sign In →'}
            </button>
          </form>

          <div className="al-info">
            <span className="al-info-icon">🛡️</span>
            <span>
              Admin accounts are created via the Django management command.<br />
              <code style={{ background: 'rgba(24,95,165,0.1)', padding: '1px 5px', borderRadius: 4, fontSize: 11 }}>
                python manage.py create_admin
              </code>
            </span>
          </div>

          <div className="al-footer">
            Not an admin? <Link to="/">Back to TokenWalla →</Link>
          </div>
        </div>
      </div>
    </>
  );
}