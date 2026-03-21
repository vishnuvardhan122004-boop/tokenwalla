// ADMIN/Adashboard.js
import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';

const Adashboard = () => {
  const navigate = useNavigate();

  const logout = () => {
    localStorage.removeItem('access');
    localStorage.removeItem('refresh');
    localStorage.removeItem('user');
    navigate('/');
    window.location.reload();
  };

  const linkClass = ({ isActive }) =>
    `list-group-item list-group-item-action ${isActive ? 'active' : ''}`;

  return (
    <div className="d-flex min-vh-100">
      <aside className="bg-primary text-white p-3 d-flex flex-column" style={{ width: '240px', minHeight: '100vh' }}>
        <div className="text-center mb-4">
          <img src="/logo.png" alt="TokenWalla" style={{ width: 40, borderRadius: 10, marginBottom: 8 }} />
          <h5 className="mb-0 text-white">TokenWalla</h5>
          <small className="text-white-50">Admin Panel</small>
        </div>

        <div className="list-group list-group-flush flex-grow-1">
          {/* FIX: "end" prop so /Adashboard doesn't stay active on child routes */}
          {/* FIX: All child routes are relative (no leading slash) */}
          <NavLink to="user-management" className={linkClass}>👥 User Management</NavLink>
          <NavLink to="hospitals" className={linkClass}>🏥 Hospitals / Doctors</NavLink>
          <NavLink to="reports" className={linkClass}>📋 Reports</NavLink>
          <NavLink to="support" className={linkClass}>🎧 Support</NavLink>
          <NavLink to="settings" className={linkClass}>⚙️ Settings</NavLink>
        </div>

        {/* FIX: Logout is a button, not a NavLink */}
        <button className="btn btn-outline-light btn-sm mt-auto" onClick={logout}>
          🚪 Logout
        </button>
      </aside>

      <main className="flex-grow-1 bg-light p-4">
        <div className="bg-white shadow-sm p-3 rounded mb-4 d-flex justify-content-between align-items-center">
          <h5 className="mb-0 text-primary fw-bold">Admin Dashboard</h5>
          <span className="badge bg-primary">Admin</span>
        </div>
        <Outlet />
      </main>
    </div>
  );
};

export default Adashboard;