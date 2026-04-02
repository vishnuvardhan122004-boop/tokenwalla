import { useState, useEffect } from 'react';

const Settings = () => {
  const [user,  setUser]  = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (stored) setUser(JSON.parse(stored));
  }, []);

  const handleSave = e => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <>
      <style>{`
        .st-header { margin-bottom: 24px; }
        .st-title { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1.4rem; font-weight: 800; color: var(--gray-900); margin-bottom: 4px; }
        .st-sub { font-size: 14px; color: var(--gray-400); }
        .st-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .st-card { background: #fff; border: 1px solid var(--blue-100); border-radius: 16px; padding: 24px; }
        .st-card-title { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 15px; font-weight: 700; color: var(--gray-900); margin-bottom: 20px; padding-bottom: 14px; border-bottom: 1px solid var(--blue-50); }
        .st-field { margin-bottom: 16px; }
        .st-field label { display: block; font-size: 12px; font-weight: 600; color: var(--gray-600); margin-bottom: 6px; }
        .st-field input { width: 100%; background: var(--gray-50); border: 1px solid var(--blue-100); border-radius: 11px; padding: 11px 14px; font-family: 'DM Sans', sans-serif; font-size: 14px; color: var(--gray-900); outline: none; transition: all 0.15s; }
        .st-field input:focus { border-color: var(--blue-400); background: #fff; box-shadow: 0 0 0 3px rgba(55,138,221,0.12); }
        .st-field input[readonly], .st-field input:disabled { background: var(--gray-100); color: var(--gray-400); cursor: not-allowed; }
        .st-save-btn { padding: 11px 24px; border-radius: 11px; border: none; background: var(--blue-600); color: #fff; font-family: 'DM Sans', sans-serif; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.15s; }
        .st-save-btn:hover { background: var(--blue-800); }
        .st-warn-btn { padding: 10px 18px; border-radius: 10px; border: 1px solid var(--color-error-border); background: var(--color-error-bg); color: var(--color-error-text); font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.15s; margin-right: 8px; }
        .st-warn-btn:hover { background: #f7c1c1; }
        .st-sys-row { display: flex; justify-content: space-between; align-items: center; padding: 11px 0; border-bottom: 1px solid var(--blue-50); font-size: 14px; }
        .st-sys-row:last-child { border-bottom: none; }
        .st-sys-label { color: var(--gray-500); }
        .st-sys-val { font-weight: 600; color: var(--gray-900); }
        .st-success { background: var(--color-success-bg); border: 1px solid var(--color-success-border); border-radius: 11px; padding: 11px 16px; font-size: 14px; color: var(--color-success-text); margin-bottom: 16px; }
        .st-danger-zone { border: 1px solid var(--color-error-border); border-radius: 16px; padding: 20px 24px; background: var(--color-error-bg); }
        .st-danger-title { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 14px; font-weight: 700; color: var(--color-error-text); margin-bottom: 8px; }
        .st-danger-sub { font-size: 13px; color: var(--color-error-text); opacity: 0.7; margin-bottom: 16px; }
        @media (max-width: 800px) { .st-grid { grid-template-columns: 1fr; } }
      `}</style>

      <div className="st-header">
        <div className="st-title">⚙️ Settings</div>
        <div className="st-sub">Manage your admin profile and system configuration</div>
      </div>

      <div className="st-grid">
        {/* Profile */}
        <div className="st-card">
          <div className="st-card-title">👤 Admin Profile</div>
          {saved && <div className="st-success">✅ Settings saved successfully!</div>}
          <form onSubmit={handleSave}>
            <div className="st-field">
              <label>Full Name</label>
              <input type="text" defaultValue={user?.name || ''} placeholder="Your name" />
            </div>
            <div className="st-field">
              <label>Mobile Number</label>
              <input type="text" defaultValue={user?.mobile || ''} readOnly />
            </div>
            <div className="st-field">
              <label>Role</label>
              <input type="text" value="Administrator" disabled />
            </div>
            <button type="submit" className="st-save-btn">Save Changes</button>
          </form>
        </div>

        {/* System Info */}
        <div className="st-card">
          <div className="st-card-title">🖥️ System Information</div>
          {[
            { label: 'Platform',        value: 'TokenWalla'            },
            { label: 'Version',         value: 'v1.0.0'                },
            { label: 'Backend',         value: 'Django REST Framework' },
            { label: 'Payment Gateway', value: 'Razorpay'              },
            { label: 'Database',        value: 'PostgreSQL'            },
            { label: 'Media Storage',   value: 'Cloudinary'            },
          ].map(({ label, value }) => (
            <div className="st-sys-row" key={label}>
              <span className="st-sys-label">{label}</span>
              <span className="st-sys-val">{value}</span>
            </div>
          ))}
        </div>

        {/* Password */}
        <div className="st-card">
          <div className="st-card-title">🔐 Change Password</div>
          <div className="st-field">
            <label>Current Password</label>
            <input type="password" placeholder="Enter current password" />
          </div>
          <div className="st-field">
            <label>New Password</label>
            <input type="password" placeholder="Enter new password (min 6 chars)" />
          </div>
          <div className="st-field">
            <label>Confirm New Password</label>
            <input type="password" placeholder="Confirm new password" />
          </div>
          <button type="button" className="st-save-btn" style={{ background: 'var(--color-warning-text)' }}>
            Update Password
          </button>
        </div>

        {/* Danger Zone */}
        <div>
          <div className="st-danger-zone">
            <div className="st-danger-title">⚠️ Danger Zone</div>
            <div className="st-danger-sub">These actions are irreversible. Proceed with extreme caution.</div>
            <button className="st-warn-btn" onClick={() => alert('Feature coming soon')}>Clear Cache</button>
            <button className="st-warn-btn" onClick={() => alert('Feature coming soon')}>Export Data</button>
          </div>
        </div>
      </div>
    </>
  );
};

export default Settings;