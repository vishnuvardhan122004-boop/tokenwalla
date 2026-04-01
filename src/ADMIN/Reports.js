import { useEffect, useState } from 'react';
import API from '../services/api';

const Reports = () => {
  const [data,    setData]    = useState({ total: 0, completed: 0, waiting: 0, bookings: [] });
  const [loading, setLoading] = useState(false);
  const [filter,  setFilter]  = useState('all');
  const [error,   setError]   = useState('');

  useEffect(() => {
    setLoading(true);
    API.get('/payment/reports/')
      .then(({ data }) => setData(data))
      .catch(() => setError('Failed to load reports.'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = data.bookings.filter(b => filter === 'all' || b.status === filter);
  const inProgress = data.bookings.filter(b => b.status === 'in_progress').length;

  const statusBadge = s => ({ completed: 'bg-success', waiting: 'bg-warning text-dark', in_progress: 'bg-info text-dark', cancelled: 'bg-danger' }[s] || 'bg-secondary');

  return (
    <div className="container-fluid p-4">
      <h4 className="mb-4 fw-bold">📋 Booking Reports</h4>
      {error && <div className="alert alert-danger">{error}</div>}

      <div className="row g-3 mb-4">
        {[
          { label: 'Total',       val: data.total,     color: 'primary', icon: '📊' },
          { label: 'Completed',   val: data.completed, color: 'success', icon: '✅' },
          { label: 'Waiting',     val: data.waiting,   color: 'warning', icon: '⏳' },
          { label: 'In Progress', val: inProgress,     color: 'info',    icon: '🔄' },
        ].map(({ label, val, color, icon }) => (
          <div key={label} className="col-6 col-md-3">
            <div className={`card border-0 shadow-sm p-3 text-center border-top border-${color}`} style={{ borderTopWidth: 3 }}>
              <div className="fs-3">{icon}</div>
              <h6 className="text-muted mb-1">{label}</h6>
              <h3 className={`fw-bold text-${color}`}>{val}</h3>
            </div>
          </div>
        ))}
      </div>

      <div className="d-flex gap-2 mb-3 flex-wrap">
        {['all', 'waiting', 'in_progress', 'completed', 'cancelled'].map(s => (
          <button key={s} className={`btn btn-sm ${filter === s ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setFilter(s)}>
            {s === 'all' ? 'All' : s.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-5"><div className="spinner-border text-primary" /></div>
      ) : (
        <div className="card border-0 shadow-sm">
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead className="table-light">
                <tr><th>Token</th><th>Patient</th><th>Doctor</th><th>Hospital</th><th>Date</th><th>Slot</th><th>Amount</th><th>Status</th></tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="text-center text-muted py-4">No bookings found</td></tr>
                )}
                {filtered.map(b => (
                  <tr key={b.id}>
                    <td><strong className="text-primary">{b.token}</strong></td>
                    <td>{b.patient_name}</td>
                    <td>{b.doctor_name}</td>
                    <td>{b.hospital_name}</td>
                    <td>{b.date}</td>
                    <td>{b.slot}</td>
                    <td>₹{b.amount}</td>
                    <td><span className={`badge ${statusBadge(b.status)}`}>{b.status?.replace('_', ' ')}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default Reports;