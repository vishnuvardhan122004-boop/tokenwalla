// ADMIN/Support.js
import { useEffect, useState } from 'react';
import API from '../services/api';

const Support = () => {
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // FIX: Fetch admin users from real API endpoint as support contacts
    setLoading(true);
    API.get('/auth/users/')
      .then(({ data }) => {
        // Filter to show only admin/staff users as support contacts
        const staff = data.filter(u => u.role === 'admin');
        setUsers(staff);
      })
      .catch(() => {
        // Fallback static support info if endpoint fails
        setUsers([]);
      })
      .finally(() => setLoading(false));
  }, []);

  // Static fallback contacts always shown
  const staticContacts = [
    { id: 's1', name: 'TokenWalla Support',  role: 'Technical Support', mobile: '+91-9000000001', active: true },
    { id: 's2', name: 'Billing Team',        role: 'Payment Issues',    mobile: '+91-9000000002', active: true },
    { id: 's3', name: 'Hospital Onboarding', role: 'Hospital Support',  mobile: '+91-9000000003', active: false },
  ];

  const displayContacts = users.length > 0
    ? users.map(u => ({
        id: u.id, name: u.name, role: 'Admin', mobile: u.mobile, active: u.status === 'active'
      }))
    : staticContacts;

  return (
    <div className="container-fluid p-4">
      <h4 className="mb-1 fw-bold">🎧 Support Team</h4>
      <p className="text-muted mb-4">Contact the support staff in case of system issues.</p>

      {/* Quick contact cards */}
      <div className="row g-3 mb-4">
        <div className="col-md-4">
          <div className="card border-0 shadow-sm p-3 text-center">
            <div className="fs-2 mb-1">📧</div>
            <h6 className="fw-bold">Email Support</h6>
            <a href="mailto:tokentraq@gmail.com" className="text-primary small">
              tokentraq@gmail.com
            </a>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card border-0 shadow-sm p-3 text-center">
            <div className="fs-2 mb-1">📞</div>
            <h6 className="fw-bold">Phone Support</h6>
            <a href="tel:+919000000001" className="text-primary small">+91-9000000001</a>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card border-0 shadow-sm p-3 text-center">
            <div className="fs-2 mb-1">🏢</div>
            <h6 className="fw-bold">Office</h6>
            <small className="text-muted">Hindupur - Nimpalli Road, AP - 515201</small>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-4"><div className="spinner-border text-primary" /></div>
      ) : (
        <div className="card shadow-sm border-0">
          <div className="card-header bg-light fw-semibold">Support Contacts</div>
          <table className="table table-hover mb-0">
            <thead className="table-light">
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Mobile</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {displayContacts.map(member => (
                <tr key={member.id}>
                  <td className="fw-semibold">{member.name}</td>
                  <td>{member.role}</td>
                  <td>
                    <a href={`tel:${member.mobile}`} className="text-primary">
                      {member.mobile}
                    </a>
                  </td>
                  <td>
                    <span className={`badge ${member.active ? 'bg-success' : 'bg-secondary'}`}>
                      {member.active ? 'Available' : 'Offline'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Support;