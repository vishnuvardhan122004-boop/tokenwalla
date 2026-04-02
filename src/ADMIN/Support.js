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
    <>
      <style>{`
        .sp-header { margin-bottom: 24px; }
        .sp-title { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1.4rem; font-weight: 800; color: var(--gray-900); margin-bottom: 4px; }
        .sp-sub { font-size: 14px; color: var(--gray-400); }
        .sp-contact-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 28px; }
        .sp-contact-card { background: #fff; border: 1px solid var(--blue-100); border-radius: 16px; padding: 24px 22px; text-align: center; }
        .sp-contact-icon { font-size: 2rem; margin-bottom: 12px; display: block; }
        .sp-contact-label { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 14px; font-weight: 700; color: var(--gray-900); margin-bottom: 6px; }
        .sp-contact-value { font-size: 14px; }
        .sp-contact-value a { color: var(--blue-600); text-decoration: none; font-weight: 500; }
        .sp-contact-value a:hover { color: var(--blue-800); }
        .sp-table-card { background: #fff; border: 1px solid var(--blue-100); border-radius: 16px; overflow: hidden; }
        .sp-table-header { padding: 18px 22px; border-bottom: 1px solid var(--blue-50); }
        .sp-table-title { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 15px; font-weight: 700; color: var(--gray-900); }
        .sp-table { width: 100%; border-collapse: collapse; }
        .sp-table th { padding: 11px 20px; text-align: left; font-size: 11px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; color: var(--gray-400); background: var(--gray-50); border-bottom: 1px solid var(--blue-50); }
        .sp-table td { padding: 13px 20px; font-size: 14px; border-bottom: 1px solid var(--blue-50); vertical-align: middle; color: var(--gray-800); }
        .sp-table tr:last-child td { border-bottom: none; }
        .sp-table tr:hover td { background: var(--blue-50); }
        .sp-badge { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 100px; font-size: 12px; font-weight: 600; border: 1px solid transparent; }
        @media (max-width: 700px) { .sp-contact-grid { grid-template-columns: 1fr; } }
      `}</style>

      <div className="sp-header">
        <div className="sp-title">🎧 Support Team</div>
        <div className="sp-sub">Contact channels and support staff management</div>
      </div>

      <div className="sp-contact-grid">
        {[
          { icon: '📧', label: 'Email Support', content: <a href="mailto:tokentraq@gmail.com">tokentraq@gmail.com</a> },
          { icon: '📞', label: 'Phone Support', content: <a href="tel:+919000000001">+91-9000000001</a> },
          { icon: '🏢', label: 'Office',        content: <span style={{ color: 'var(--gray-600)' }}>Hindupur – Nimpalli Road, AP – 515201</span> },
        ].map(c => (
          <div key={c.label} className="sp-contact-card">
            <span className="sp-contact-icon">{c.icon}</span>
            <div className="sp-contact-label">{c.label}</div>
            <div className="sp-contact-value">{c.content}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
          <div style={{ width: 36, height: 36, border: '3px solid var(--blue-100)', borderTopColor: 'var(--blue-600)', borderRadius: '50%', animation: 'adSpin 0.7s linear infinite' }} />
          <style>{`@keyframes adSpin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : (
        <div className="sp-table-card">
          <div className="sp-table-header">
            <div className="sp-table-title">Support Contacts ({contacts.length})</div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="sp-table">
              <thead>
                <tr><th>Name</th><th>Role</th><th>Mobile</th><th>Status</th></tr>
              </thead>
              <tbody>
                {contacts.map(m => (
                  <tr key={m.id}>
                    <td style={{ fontWeight: 600 }}>{m.name}</td>
                    <td style={{ color: 'var(--gray-500)' }}>{m.role}</td>
                    <td><a href={`tel:${m.mobile}`} style={{ color: 'var(--blue-600)', textDecoration: 'none', fontFamily: 'DM Mono, monospace', fontSize: 13 }}>{m.mobile}</a></td>
                    <td>
                      <span className="sp-badge" style={{
                        background: m.active ? 'var(--color-success-bg)' : 'var(--gray-100)',
                        color: m.active ? 'var(--color-success-text)' : 'var(--gray-500)',
                        borderColor: m.active ? 'var(--color-success-border)' : 'var(--gray-200)',
                      }}>
                        {m.active ? '🟢 Available' : '⚫ Offline'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
};

export default Support;