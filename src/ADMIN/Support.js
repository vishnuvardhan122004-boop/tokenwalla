import { useEffect, useState } from 'react';
import API from '../services/api';

const staticContacts = [
  { id: 's1', name: 'TokenWalla Support',  role: 'Technical Support', mobile: '+91-9000000001', active: true  },
  { id: 's2', name: 'Billing Team',        role: 'Payment Issues',    mobile: '+91-9000000002', active: true  },
  { id: 's3', name: 'Hospital Onboarding', role: 'Hospital Support',  mobile: '+91-9000000003', active: false },
];

const Support = () => {
  const [contacts, setContacts] = useState(staticContacts);
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    setLoading(true);
    API.get('/auth/users/')
      .then(({ data }) => {
        const staff = data.filter(u => u.role === 'admin');
        if (staff.length > 0) {
          setContacts(staff.map(u => ({ id: u.id, name: u.name, role: 'Admin', mobile: u.mobile, active: u.status === 'active' })));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="container-fluid p-4">
      <h4 className="mb-1 fw-bold">🎧 Support Team</h4>
      <p className="text-muted mb-4">Contact the support staff for system issues.</p>

      <div className="row g-3 mb-4">
        {[
          { icon: '📧', label: 'Email Support', content: <a href="mailto:tokentraq@gmail.com" className="text-primary small">tokentraq@gmail.com</a> },
          { icon: '📞', label: 'Phone Support', content: <a href="tel:+919000000001" className="text-primary small">+91-9000000001</a> },
          { icon: '🏢', label: 'Office',        content: <small className="text-muted">Hindupur – Nimpalli Road, AP – 515201</small> },
        ].map(c => (
          <div key={c.label} className="col-md-4">
            <div className="card border-0 shadow-sm p-3 text-center">
              <div className="fs-2 mb-1">{c.icon}</div>
              <h6 className="fw-bold">{c.label}</h6>
              {c.content}
            </div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-4"><div className="spinner-border text-primary" /></div>
      ) : (
        <div className="card shadow-sm border-0">
          <div className="card-header bg-light fw-semibold">Support Contacts</div>
          <table className="table table-hover mb-0">
            <thead className="table-light">
              <tr><th>Name</th><th>Role</th><th>Mobile</th><th>Status</th></tr>
            </thead>
            <tbody>
              {contacts.map(m => (
                <tr key={m.id}>
                  <td className="fw-semibold">{m.name}</td>
                  <td>{m.role}</td>
                  <td><a href={`tel:${m.mobile}`} className="text-primary">{m.mobile}</a></td>
                  <td><span className={`badge ${m.active ? 'bg-success' : 'bg-secondary'}`}>{m.active ? 'Available' : 'Offline'}</span></td>
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