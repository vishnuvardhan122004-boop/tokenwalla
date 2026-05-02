// src/ADMIN/Admin.js — v3
// ─────────────────────────────────────────────────────────────────────────────
// Admin login page (/2004) with integrated "Create Admin Account" panel.
// The create-admin flow is protected by a ADMIN_SETUP_KEY that must be
// configured in the Django backend's environment variables.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import API from '../services/api';

const TABS = { login: 'login', create: 'create' };

export default function Admin() {
  const navigate = useNavigate();

  // ── Tab ──────────────────────────────────────────────────────────────────
  const [tab, setTab] = useState(TABS.login);

  // ── Login state ───────────────────────────────────────────────────────────
  const [mobile,      setMobile]      = useState('');
  const [password,    setPassword]    = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError,   setLoginError]   = useState('');

  // ── Create-admin state ────────────────────────────────────────────────────
  const [setupKey,       setSetupKey]       = useState('');
  const [newName,        setNewName]        = useState('');
  const [newMobile,      setNewMobile]      = useState('');
  const [newPassword,    setNewPassword]    = useState('');
  const [confirmPass,    setConfirmPass]    = useState('');
  const [createLoading,  setCreateLoading]  = useState(false);
  const [createError,    setCreateError]    = useState('');
  const [createSuccess,  setCreateSuccess]  = useState('');
  const [showSetupKey,   setShowSetupKey]   = useState(false);
  const [showNewPass,    setShowNewPass]    = useState(false);

  // ── Login handler ─────────────────────────────────────────────────────────
  const handleLogin = async (e) => {
    e.preventDefault();
    if (!mobile || !password) { setLoginError('Enter your mobile and password'); return; }
    setLoginLoading(true);
    setLoginError('');
    try {
      const { data } = await API.post('/auth/login/', { mobile, password });
      if (data.user?.role !== 'admin') {
        setLoginError('Access denied. This login is for admins only.');
        return;
      }
      localStorage.setItem('access',  data.access);
      localStorage.setItem('refresh', data.refresh);
      localStorage.setItem('user',    JSON.stringify(data.user));
      navigate('/Adashboard');
    } catch (err) {
      setLoginError(err?.response?.data?.message || 'Invalid credentials');
    } finally {
      setLoginLoading(false);
    }
  };

  // ── Create-admin handler ──────────────────────────────────────────────────
  const handleCreate = async (e) => {
    e.preventDefault();
    setCreateError('');
    setCreateSuccess('');

    if (!setupKey.trim())              { setCreateError('Setup key is required.'); return; }
    if (!newName.trim() || newName.trim().length < 2)
                                       { setCreateError('Name must be at least 2 characters.'); return; }
    if (!/^\d{10}$/.test(newMobile))   { setCreateError('Mobile must be exactly 10 digits.'); return; }
    if (newPassword.length < 8)        { setCreateError('Password must be at least 8 characters.'); return; }
    if (newPassword !== confirmPass)   { setCreateError('Passwords do not match.'); return; }

    setCreateLoading(true);
    try {
      const { data } = await API.post('/auth/create-admin/', {
        setup_key: setupKey.trim(),
        mobile:    newMobile,
        password:  newPassword,
        name:      newName.trim(),
      });
      setCreateSuccess(data.message || 'Admin account created! You can now log in.');
      // Pre-fill the login form for convenience
      setMobile(newMobile);
      setPassword('');
      // Clear create form
      setSetupKey('');
      setNewName('');
      setNewMobile('');
      setNewPassword('');
      setConfirmPass('');
    } catch (err) {
      const msg = err?.response?.data?.message;
      if (err?.response?.status === 503) {
        setCreateError('Admin setup is not enabled on the server. Set ADMIN_SETUP_KEY in your backend .env file.');
      } else if (err?.response?.status === 403) {
        setCreateError('Invalid setup key. Check your ADMIN_SETUP_KEY value.');
      } else {
        setCreateError(msg || 'Failed to create admin account. Try again.');
      }
    } finally {
      setCreateLoading(false);
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

        /* ── Card ── */
        .al-card {
          position: relative; z-index: 1;
          width: 100%; max-width: 440px;
          background: #fff; border: 1px solid #B5D4F4;
          border-radius: 24px;
          box-shadow: 0 12px 48px rgba(24,95,165,0.12), 0 4px 12px rgba(0,0,0,0.04);
          animation: alUp 0.45s cubic-bezier(0.34,1.56,0.64,1) both;
          overflow: hidden;
        }
        @keyframes alUp {
          from { opacity:0; transform:translateY(18px) scale(0.98); }
          to   { opacity:1; transform:translateY(0) scale(1); }
        }
        .al-topbar {
          height: 3px;
          background: linear-gradient(90deg, #185FA5, #378ADD, #85B7EB);
        }
        .al-inner { padding: 32px 36px 36px; }

        /* ── Brand ── */
        .al-brand {
          display: flex; align-items: center; gap: 10px;
          text-decoration: none; margin-bottom: 28px; justify-content: center;
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

        /* ── Tab switcher ── */
        .al-tabs {
          display: flex; gap: 0;
          background: #F4F9FF; border: 1px solid #B5D4F4;
          border-radius: 12px; padding: 4px; margin-bottom: 26px;
        }
        .al-tab {
          flex: 1; padding: 9px 12px; border-radius: 9px;
          border: none; background: none;
          font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 500;
          color: #64748B; cursor: pointer; transition: all 0.2s;
          display: flex; align-items: center; justify-content: center; gap: 6px;
        }
        .al-tab.active {
          background: #fff; color: #185FA5; font-weight: 600;
          box-shadow: 0 1px 6px rgba(24,95,165,0.12);
        }

        /* ── Labels & headings ── */
        .al-label {
          font-size: 11px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase;
          color: #185FA5; margin-bottom: 6px;
        }
        .al-title {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 1.4rem; font-weight: 800; color: #0F172A; margin-bottom: 4px;
        }
        .al-sub { font-size: 13px; color: #64748B; margin-bottom: 22px; line-height: 1.5; }

        /* ── Alerts ── */
        .al-error {
          background: #FCEBEB; border: 1px solid #F09595; border-radius: 11px;
          padding: 11px 14px; font-size: 13px; color: #A32D2D;
          margin-bottom: 16px; display: flex; align-items: flex-start; gap: 8px;
          line-height: 1.5;
        }
        .al-success {
          background: #EAF3DE; border: 1px solid #97C459; border-radius: 11px;
          padding: 11px 14px; font-size: 13px; color: #3B6D11;
          margin-bottom: 16px; line-height: 1.5;
        }

        /* ── Fields ── */
        .al-field { margin-bottom: 14px; }
        .al-field label {
          display: block; font-size: 12px; font-weight: 600;
          color: #64748B; margin-bottom: 6px;
        }
        .al-wrap { position: relative; }
        .al-icon {
          position: absolute; left: 13px; top: 50%; transform: translateY(-50%);
          font-size: 15px; color: #94A3B8; pointer-events: none;
        }
        .al-eye {
          position: absolute; right: 13px; top: 50%; transform: translateY(-50%);
          font-size: 14px; color: #94A3B8; cursor: pointer; user-select: none;
          background: none; border: none; padding: 0;
        }
        .al-input {
          width: 100%; background: #F8FAFC; border: 1px solid #B5D4F4;
          border-radius: 12px; padding: 12px 14px 12px 42px;
          font-family: 'DM Sans', sans-serif; font-size: 14px; color: #0F172A;
          outline: none; transition: all 0.15s;
        }
        .al-input.has-eye { padding-right: 42px; }
        .al-input::placeholder { color: #94A3B8; }
        .al-input:focus {
          border-color: #378ADD; background: #fff;
          box-shadow: 0 0 0 3px rgba(55,138,221,0.14);
        }

        /* ── Setup-key hint box ── */
        .al-hint {
          display: flex; align-items: flex-start; gap: 10px;
          background: #E6F1FB; border: 1px solid #B5D4F4;
          border-radius: 11px; padding: 12px 14px; margin-bottom: 18px;
          font-size: 12px; color: #185FA5; line-height: 1.6;
        }
        .al-hint-icon { font-size: 16px; flex-shrink: 0; margin-top: 1px; }
        .al-hint code {
          background: rgba(24,95,165,0.1); padding: 1px 5px;
          border-radius: 4px; font-size: 11px;
        }

        /* ── Divider ── */
        .al-divider {
          display: flex; align-items: center; gap: 10px;
          font-size: 11px; color: #94A3B8; margin: 14px 0 16px;
        }
        .al-divider::before, .al-divider::after {
          content: ''; flex: 1; height: 1px; background: #E6F1FB;
        }

        /* ── Submit ── */
        .al-btn {
          width: 100%; padding: 13px; border-radius: 12px; border: none;
          background: #185FA5; color: #fff;
          font-family: 'DM Sans', sans-serif; font-size: 15px; font-weight: 600;
          cursor: pointer; transition: all 0.2s;
          box-shadow: 0 4px 14px rgba(24,95,165,0.22);
          display: flex; align-items: center; justify-content: center; gap: 9px;
          margin-top: 4px;
        }
        .al-btn:hover:not(:disabled) {
          background: #0C447C;
          box-shadow: 0 8px 24px rgba(24,95,165,0.32);
          transform: translateY(-1px);
        }
        .al-btn:disabled { opacity: 0.55; cursor: not-allowed; transform: none; }
        .al-btn.secondary {
          background: transparent; color: #185FA5;
          border: 1px solid #B5D4F4; box-shadow: none; margin-top: 8px;
        }
        .al-btn.secondary:hover:not(:disabled) {
          background: #E6F1FB; border-color: #378ADD; transform: none; box-shadow: none;
        }
        .al-spinner {
          width: 18px; height: 18px;
          border: 2px solid rgba(255,255,255,0.35); border-top-color: #fff;
          border-radius: 50%; animation: alSpin 0.7s linear infinite; flex-shrink: 0;
        }
        @keyframes alSpin { to { transform: rotate(360deg); } }

        /* ── Footer ── */
        .al-footer {
          text-align: center; margin-top: 22px;
          font-size: 13px; color: #94A3B8;
        }
        .al-footer a { color: #185FA5; text-decoration: none; font-weight: 500; }
        .al-footer a:hover { color: #0C447C; }

        .al-password-strength {
          display: flex; gap: 4px; margin-top: 6px;
        }
        .al-ps-bar {
          flex: 1; height: 3px; border-radius: 2px; background: #E2E8F0;
          transition: background 0.3s;
        }

        @media (max-width: 480px) {
          .al-inner { padding: 24px 20px 28px; }
          .al-card  { border-radius: 20px; }
        }
      `}</style>

      <div className="al-root">
        <div className="al-grid" />
        <div className="al-glow" />

        <div className="al-card">
          <div className="al-topbar" />
          <div className="al-inner">

            {/* Brand */}
            <Link to="/" className="al-brand">
              <div className="al-logo"><img src="/logo.png" alt="TokenWalla" /></div>
              <span className="al-brand-name"><span className="acc">Token</span>walla</span>
            </Link>

            {/* Tab switcher */}
            <div className="al-tabs">
              <button
                className={`al-tab ${tab === TABS.login ? 'active' : ''}`}
                onClick={() => { setTab(TABS.login); setLoginError(''); setCreateSuccess(''); }}
              >
                🔐 Admin Login
              </button>
              <button
                className={`al-tab ${tab === TABS.create ? 'active' : ''}`}
                onClick={() => { setTab(TABS.create); setCreateError(''); setCreateSuccess(''); }}
              >
                ➕ Create Admin
              </button>
            </div>

            {/* ── LOGIN TAB ── */}
            {tab === TABS.login && (
              <>
                <div className="al-label">Admin Access</div>
                <div className="al-title">Sign In</div>
                <div className="al-sub">Use your admin credentials to access the dashboard.</div>

                {loginError && (
                  <div className="al-error"><span>⚠️</span> {loginError}</div>
                )}
                {createSuccess && (
                  <div className="al-success">
                    ✅ {createSuccess} — Enter your credentials below.
                  </div>
                )}

                <form onSubmit={handleLogin}>
                  <div className="al-field">
                    <label>Mobile Number</label>
                    <div className="al-wrap">
                      <span className="al-icon">📱</span>
                      <input
                        className="al-input" type="text"
                        placeholder="10-digit mobile"
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

                  <button className="al-btn" type="submit" disabled={loginLoading}>
                    {loginLoading
                      ? <><div className="al-spinner" /> Signing in…</>
                      : 'Sign In →'}
                  </button>
                </form>

                <div className="al-footer" style={{ marginTop: 20 }}>
                  Don't have an admin account?{' '}
                  <span
                    style={{ color: '#185FA5', cursor: 'pointer', fontWeight: 500 }}
                    onClick={() => setTab(TABS.create)}
                  >
                    Create one →
                  </span>
                </div>
              </>
            )}

            {/* ── CREATE ADMIN TAB ── */}
            {tab === TABS.create && (
              <>
                <div className="al-label">Setup</div>
                <div className="al-title">Create Admin Account</div>
                <div className="al-sub">
                  Requires the <strong>ADMIN_SETUP_KEY</strong> from your backend environment.
                </div>

                <div className="al-hint">
                  <span className="al-hint-icon">🛡️</span>
                  <span>
                    Add <code>ADMIN_SETUP_KEY=your-secret-key</code> to your backend
                    <code>.env</code> file and restart the server. Then enter that key below.
                  </span>
                </div>

                {createError   && <div className="al-error"><span>⚠️</span> {createError}</div>}
                {createSuccess && <div className="al-success">✅ {createSuccess}</div>}

                {!createSuccess && (
                  <form onSubmit={handleCreate}>
                    <div className="al-field">
                      <label>Setup Key <span style={{ color: '#A32D2D' }}>*</span></label>
                      <div className="al-wrap">
                        <span className="al-icon">🔒</span>
                        <input
                          className={`al-input ${showSetupKey ? '' : 'has-eye'}`}
                          type={showSetupKey ? 'text' : 'password'}
                          placeholder="Your ADMIN_SETUP_KEY value"
                          value={setupKey}
                          onChange={e => setSetupKey(e.target.value)}
                          autoFocus
                        />
                        <button
                          type="button"
                          className="al-eye"
                          onClick={() => setShowSetupKey(p => !p)}
                        >
                          {showSetupKey ? '🙈' : '👁️'}
                        </button>
                      </div>
                    </div>

                    <div className="al-divider">admin details</div>

                    <div className="al-field">
                      <label>Full Name <span style={{ color: '#A32D2D' }}>*</span></label>
                      <div className="al-wrap">
                        <span className="al-icon">👤</span>
                        <input
                          className="al-input" type="text"
                          placeholder="e.g. Site Administrator"
                          value={newName}
                          onChange={e => setNewName(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="al-field">
                      <label>Mobile Number <span style={{ color: '#A32D2D' }}>*</span></label>
                      <div className="al-wrap">
                        <span className="al-icon">📱</span>
                        <input
                          className="al-input" type="text"
                          placeholder="10-digit mobile number"
                          value={newMobile}
                          onChange={e => setNewMobile(e.target.value.replace(/\D/, '').slice(0, 10))}
                          maxLength={10}
                        />
                      </div>
                    </div>

                    <div className="al-field">
                      <label>Password <span style={{ color: '#A32D2D' }}>*</span></label>
                      <div className="al-wrap">
                        <span className="al-icon">🔑</span>
                        <input
                          className={`al-input has-eye`}
                          type={showNewPass ? 'text' : 'password'}
                          placeholder="Minimum 8 characters"
                          value={newPassword}
                          onChange={e => setNewPassword(e.target.value)}
                        />
                        <button
                          type="button"
                          className="al-eye"
                          onClick={() => setShowNewPass(p => !p)}
                        >
                          {showNewPass ? '🙈' : '👁️'}
                        </button>
                      </div>
                      {/* Password strength bars */}
                      {newPassword.length > 0 && (
                        <div className="al-password-strength">
                          {[1,2,3,4].map(i => {
                            const strength = Math.min(Math.floor(newPassword.length / 3), 4);
                            const colors   = ['#F09595', '#EF9F27', '#97C459', '#3B6D11'];
                            return (
                              <div
                                key={i}
                                className="al-ps-bar"
                                style={{ background: i <= strength ? colors[strength - 1] : '#E2E8F0' }}
                              />
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="al-field">
                      <label>Confirm Password <span style={{ color: '#A32D2D' }}>*</span></label>
                      <div className="al-wrap">
                        <span className="al-icon">🔒</span>
                        <input
                          className="al-input" type="password"
                          placeholder="Re-enter your password"
                          value={confirmPass}
                          onChange={e => setConfirmPass(e.target.value)}
                        />
                      </div>
                      {confirmPass && newPassword !== confirmPass && (
                        <div style={{ fontSize: 11, color: '#A32D2D', marginTop: 4 }}>
                          ⚠️ Passwords don't match
                        </div>
                      )}
                    </div>

                    <button className="al-btn" type="submit" disabled={createLoading}>
                      {createLoading
                        ? <><div className="al-spinner" /> Creating account…</>
                        : '✅ Create Admin Account'}
                    </button>
                  </form>
                )}

                {createSuccess && (
                  <button
                    className="al-btn"
                    onClick={() => { setTab(TABS.login); setCreateSuccess(''); }}
                  >
                    Go to Login →
                  </button>
                )}

                <div className="al-footer" style={{ marginTop: 20 }}>
                  Already have an account?{' '}
                  <span
                    style={{ color: '#185FA5', cursor: 'pointer', fontWeight: 500 }}
                    onClick={() => setTab(TABS.login)}
                  >
                    Sign in →
                  </span>
                </div>
              </>
            )}

          </div>
        </div>

        <div style={{
          position: 'fixed', bottom: 16, left: 0, right: 0,
          textAlign: 'center', zIndex: 1, fontSize: 12, color: '#94A3B8',
        }}>
          <Link to="/" style={{ color: '#94A3B8', textDecoration: 'none' }}>
            ← Back to TokenWalla
          </Link>
        </div>
      </div>
    </>
  );
}