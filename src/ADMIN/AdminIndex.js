// ADMIN/AdminIndex.js — default landing when /Adashboard is visited
import { useEffect, useState } from 'react';
import API from '../services/api';

const STATUS_BADGE = {
  completed:   'bg-success',
  waiting:     'bg-warning text-dark',
  in_progress: 'bg-info text-dark',
  cancelled:   'bg-secondary',
};

const AdminIndex = () => {
  const [stats,   setStats]   = useState({ total: 0, completed: 0, waiting: 0, bookings: [] });
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    Promise.all([
      API.get('/payment/reports/'),
      API.get('/auth/users/'),
    ])
      .then(([repRes, usrRes]) => {
        setStats(repRes.data);
        setUsers(usrRes.data);
      })
      .catch(() => setError('Failed to load dashboard data. Check your connection.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="text-center py-5">
      <div className="spinner-border text-primary" />
      <p className="text-muted mt-3 small">Loading dashboard…</p>
    </div>
  );

  if (error) return (
    <div className="alert alert-danger m-3">⚠️ {error}</div>
  );

  const inProgress = stats.bookings.filter((b) => b.status === 'in_progress').length;

  return (
    <div>
      {/* Stat cards */}
      <div className="row g-3 mb-4">
        {[
          { icon: '👥', label: 'Total Users',    val: users.length,    color: 'primary' },
          { icon: '🏥', label: 'Total Bookings', val: stats.total,     color: 'info'    },
          { icon: '✅', label: 'Completed',      val: stats.completed, color: 'success' },
          { icon: '⏳', label: 'Waiting',        val: stats.waiting,   color: 'warning' },
        ].map(({ icon, label, val, color }) => (
          <div key={label} className="col-6 col-md-3">
            <div className={`card border-0 shadow-sm p-3 text-center border-top border-${color}`}
              style={{ borderTopWidth: 3 }}>
              <div className="fs-2">{icon}</div>
              <h6 className="text-muted mb-1 small">{label}</h6>
              <h3 className={`fw-bold text-${color} mb-0`}>{val}</h3>
            </div>
          </div>
        ))}
      </div>

      {/* Quick summary row */}
      <div className="row g-3 mb-4">
        <div className="col-md-4">
          <div className="card border-0 shadow-sm p-3 text-center">
            <div className="text-muted small mb-1">In Progress</div>
            <h4 className="fw-bold text-info mb-0">{inProgress}</h4>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card border-0 shadow-sm p-3 text-center">
            <div className="text-muted small mb-1">Patients</div>
            <h4 className="fw-bold text-primary mb-0">
              {users.filter((u) => u.role === 'patient').length}
            </h4>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card border-0 shadow-sm p-3 text-center">
            <div className="text-muted small mb-1">Hospitals</div>
            <h4 className="fw-bold text-success mb-0">
              {users.filter((u) => u.role === 'hospital').length}
            </h4>
          </div>
        </div>
      </div>

      {/* Recent bookings */}
      <div className="card border-0 shadow-sm p-4">
        <h6 className="fw-bold mb-3">🕐 Recent Bookings</h6>
        {stats.bookings.length === 0 ? (
          <p className="text-muted text-center py-3 mb-0">No bookings yet.</p>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover mb-0 align-middle">
              <thead className="table-light">
                <tr>
                  <th>Token</th>
                  <th>Patient</th>
                  <th>Doctor</th>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {stats.bookings.slice(0, 10).map((b) => (
                  <tr key={b.id}>
                    <td><strong className="text-primary">{b.token}</strong></td>
                    <td>{b.patient_name}</td>
                    <td>{b.doctor_name}</td>
                    <td>{b.date}</td>
                    <td>₹{b.amount}</td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[b.status] || 'bg-secondary'}`}>
                        {b.status?.replace('_', ' ')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminIndex;