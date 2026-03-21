// ADMIN/Settings.js
import { useState, useEffect } from 'react';

const Settings = () => {
  const [user, setUser] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (stored) setUser(JSON.parse(stored));
  }, []);

  const handleSave = (e) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="container-fluid p-4">
      <h4 className="mb-4 fw-bold">⚙️ Admin Settings</h4>

      <div className="row g-4">

        {/* Profile Info */}
        <div className="col-md-6">
          <div className="card border-0 shadow-sm p-4">
            <h6 className="fw-bold mb-3">👤 Admin Profile</h6>
            {saved && (
              <div className="alert alert-success py-2">Settings saved successfully!</div>
            )}
            <form onSubmit={handleSave}>
              <div className="mb-3">
                <label className="form-label">Name</label>
                <input type="text" className="form-control"
                  defaultValue={user?.name || ''} />
              </div>
              <div className="mb-3">
                <label className="form-label">Mobile</label>
                <input type="text" className="form-control"
                  defaultValue={user?.mobile || ''} readOnly />
              </div>
              <div className="mb-3">
                <label className="form-label">Role</label>
                <input type="text" className="form-control"
                  value="Admin" readOnly />
              </div>
              <button className="btn btn-primary">Save Changes</button>
            </form>
          </div>
        </div>

        {/* System Info */}
        <div className="col-md-6">
          <div className="card border-0 shadow-sm p-4">
            <h6 className="fw-bold mb-3">🖥️ System Information</h6>
            <div className="d-flex justify-content-between border-bottom py-2">
              <span className="text-muted">Platform</span>
              <strong>TokenWalla</strong>
            </div>
            <div className="d-flex justify-content-between border-bottom py-2">
              <span className="text-muted">Version</span>
              <strong>v1.0.0</strong>
            </div>
            <div className="d-flex justify-content-between border-bottom py-2">
              <span className="text-muted">Backend</span>
              <strong>Django REST Framework</strong>
            </div>
            <div className="d-flex justify-content-between border-bottom py-2">
              <span className="text-muted">Payment Gateway</span>
              <strong>Razorpay</strong>
            </div>
            <div className="d-flex justify-content-between py-2">
              <span className="text-muted">Database</span>
              <strong>PostgreSQL</strong>
            </div>
          </div>
        </div>

        {/* Security */}
        <div className="col-md-6">
          <div className="card border-0 shadow-sm p-4">
            <h6 className="fw-bold mb-3">🔐 Security</h6>
            <form>
              <div className="mb-3">
                <label className="form-label">Current Password</label>
                <input type="password" className="form-control" placeholder="Enter current password" />
              </div>
              <div className="mb-3">
                <label className="form-label">New Password</label>
                <input type="password" className="form-control" placeholder="Enter new password" />
              </div>
              <div className="mb-3">
                <label className="form-label">Confirm New Password</label>
                <input type="password" className="form-control" placeholder="Confirm new password" />
              </div>
              <button type="button" className="btn btn-warning">Update Password</button>
            </form>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="col-md-6">
          <div className="card border-0 shadow-sm p-4 border-danger" style={{ borderLeft: '4px solid #dc3545 !important' }}>
            <h6 className="fw-bold mb-3 text-danger">⚠️ Danger Zone</h6>
            <p className="text-muted small">These actions are irreversible. Proceed with caution.</p>
            <button
              className="btn btn-outline-danger btn-sm me-2"
              onClick={() => alert('Feature coming soon')}
            >
              Clear All Cache
            </button>
            <button
              className="btn btn-outline-danger btn-sm"
              onClick={() => alert('Feature coming soon')}
            >
              Export All Data
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Settings;