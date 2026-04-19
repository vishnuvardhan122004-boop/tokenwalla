import { useEffect, useState } from 'react';
import API from '../services/api';

const UserManagement = () => {
  const [users,      setUsers]      = useState([]);
  const [search,     setSearch]     = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');
  const [toast,      setToast]      = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    setLoading(true);
    API.get('/auth/users/?page_size=500')
      .then(({ data }) => {
        // Handle both paginated { count, results: [] } and plain []
        if (Array.isArray(data)) {
          setUsers(data);
        } else if (data?.results) {
          setUsers(data.results);
        } else {
          setUsers([]);
        }
      })
      .catch(() => setError('Failed to load users.'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = users.filter(u => {
    const q          = search.toLowerCase();
    const matchSearch = !search ||
      (u.name   || '').toLowerCase().includes(q) ||
      (u.mobile || '').includes(q);
    const matchRole  = roleFilter === 'all' || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  const toggleStatus = async (id, currentStatus) => {
    const newStatus = currentStatus === 'blocked' ? 'active' : 'blocked';
    try {
      await API.patch(`/auth/users/${id}/block/`, { status: newStatus });
      setUsers(prev => prev.map(u => u.id === id ? { ...u, status: newStatus } : u));
      showToast(`User ${newStatus === 'blocked' ? 'blocked' : 'activated'} successfully.`);
    } catch {
      showToast('Action failed. Try again.', 'error');
    }
  };

  const ROLE_COLORS = {
    admin:    { bg: 'var(--color-error-bg)',    text: 'var(--color-error-text)',    border: 'var(--color-error-border)'    },
    hospital: { bg: 'var(--blue-50)',           text: 'var(--blue-700)',            border: 'var(--blue-200)'              },
    patient:  { bg: 'var(--color-success-bg)',  text: 'var(--color-success-text)',  border: 'var(--color-success-border)'  },
  };

  return (
    <>
      <style>{`
        .um-header { margin-bottom: 24px; }
        .um-title { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1.4rem; font-weight: 800; color: var(--gray-900); margin-bottom: 4px; }
        .um-sub { font-size: 14px; color: var(--gray-400); }
        .um-filters { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 20px; align-items: center; }
        .um-search-wrap { position: relative; flex: 1; min-width: 200px; max-width: 340px; }
        .um-search-icon { position: absolute; left: 13px; top: 50%; transform: translateY(-50%); font-size: 14px; color: var(--gray-400); pointer-events: none; }
        .um-search { width: 100%; background: #fff; border: 1px solid var(--blue-100); border-radius: 11px; padding: 10px 14px 10px 38px; font-family: 'DM Sans', sans-serif; font-size: 14px; color: var(--gray-800); outline: none; transition: all 0.15s; }
        .um-search:focus { border-color: var(--blue-400); box-shadow: 0 0 0 3px rgba(55,138,221,0.12); }
        .um-filter-btn { padding: 9px 16px; border-radius: 10px; border: 1px solid var(--blue-100); background: #fff; font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 500; color: var(--gray-600); cursor: pointer; transition: all 0.15s; }
        .um-filter-btn.active { background: var(--blue-600); color: #fff; border-color: var(--blue-600); }
        .um-filter-btn:hover:not(.active) { border-color: var(--blue-300); color: var(--blue-700); background: var(--blue-50); }
        .um-count { font-size: 13px; color: var(--gray-400); margin-left: auto; }
        .um-card { background: #fff; border: 1px solid var(--blue-100); border-radius: 16px; overflow: hidden; }
        .um-table { width: 100%; border-collapse: collapse; }
        .um-table th { padding: 11px 20px; text-align: left; font-size: 11px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; color: var(--gray-400); background: var(--gray-50); border-bottom: 1px solid var(--blue-50); }
        .um-table td { padding: 13px 20px; font-size: 14px; border-bottom: 1px solid var(--blue-50); vertical-align: middle; }
        .um-table tr:last-child td { border-bottom: none; }
        .um-table tr:hover td { background: var(--blue-50); }
        .um-badge { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 100px; font-size: 12px; font-weight: 600; border: 1px solid transparent; }
        .um-action-btn { padding: 6px 14px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.15s; font-family: 'DM Sans', sans-serif; border: 1px solid transparent; }
        .um-action-btn.block { background: var(--color-error-bg); color: var(--color-error-text); border-color: var(--color-error-border); }
        .um-action-btn.block:hover { background: #f7c1c1; }
        .um-action-btn.unblock { background: var(--color-success-bg); color: var(--color-success-text); border-color: var(--color-success-border); }
        .um-action-btn.unblock:hover { background: #d4edaa; }
        .um-empty { text-align: center; padding: 60px 20px; color: var(--gray-400); font-size: 14px; }
        .um-toast { position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%); padding: 12px 24px; border-radius: 12px; font-size: 14px; font-weight: 500; z-index: 9999; white-space: nowrap; box-shadow: var(--shadow-lg); animation: toastIn 0.3s ease both; }
        @keyframes toastIn { from{opacity:0;transform:translateX(-50%) translateY(10px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
        .um-toast.success { background: var(--color-success-text); color: #fff; }
        .um-toast.error   { background: var(--color-error-text); color: #fff; }
        @media (max-width: 700px) { .um-table th:nth-child(4), .um-table td:nth-child(4) { display: none; } }
      `}</style>

      <div className="um-header">
        <div className="um-title">👥 User Management</div>
        <div className="um-sub">Manage patient and hospital accounts across the platform</div>
      </div>

      {error && (
        <div style={{ background: 'var(--color-error-bg)', border: '1px solid var(--color-error-border)', borderRadius: 12, padding: '12px 16px', color: 'var(--color-error-text)', fontSize: 14, marginBottom: 20 }}>
          ⚠️ {error}
        </div>
      )}

      <div className="um-filters">
        <div className="um-search-wrap">
          <span className="um-search-icon">🔍</span>
          <input
            className="um-search"
            type="text"
            placeholder="Search by name or mobile…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {['all', 'patient', 'hospital', 'admin'].map(role => (
          <button
            key={role}
            className={`um-filter-btn ${roleFilter === role ? 'active' : ''}`}
            onClick={() => setRoleFilter(role)}
          >
            {role === 'all' ? 'All' : role.charAt(0).toUpperCase() + role.slice(1)}
          </button>
        ))}
        <span className="um-count">
          {filtered.length} result{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
          <div style={{ width: 36, height: 36, border: '3px solid var(--blue-100)', borderTopColor: 'var(--blue-600)', borderRadius: '50%', animation: 'adSpin 0.7s linear infinite' }} />
          <style>{`@keyframes adSpin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : (
        <div className="um-card">
          <div style={{ overflowX: 'auto' }}>
            <table className="um-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Name</th>
                  <th>Mobile</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="um-empty">No users found</td></tr>
                )}
                {filtered.map((user, i) => {
                  const roleStyle = ROLE_COLORS[user.role] || ROLE_COLORS.patient;
                  const isBlocked = user.status === 'blocked';
                  return (
                    <tr key={user.id}>
                      <td style={{ color: 'var(--gray-400)', fontFamily: 'DM Mono, monospace', fontSize: 13 }}>
                        {i + 1}
                      </td>
                      <td style={{ fontWeight: 600, color: 'var(--gray-900)' }}>
                        {user.name || '—'}
                      </td>
                      <td style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, color: 'var(--gray-600)' }}>
                        {user.mobile}
                      </td>
                      <td>
                        <span className="um-badge" style={{ background: roleStyle.bg, color: roleStyle.text, borderColor: roleStyle.border }}>
                          {user.role}
                        </span>
                      </td>
                      <td>
                        <span className="um-badge" style={{
                          background:  isBlocked ? 'var(--color-error-bg)'      : 'var(--color-success-bg)',
                          color:       isBlocked ? 'var(--color-error-text)'    : 'var(--color-success-text)',
                          borderColor: isBlocked ? 'var(--color-error-border)'  : 'var(--color-success-border)',
                        }}>
                          {isBlocked ? '🚫 Blocked' : '✅ Active'}
                        </span>
                      </td>
                      <td>
                        <button
                          className={`um-action-btn ${isBlocked ? 'unblock' : 'block'}`}
                          onClick={() => toggleStatus(user.id, user.status)}
                        >
                          {isBlocked ? 'Activate' : 'Block'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {toast && <div className={`um-toast ${toast.type}`}>{toast.msg}</div>}
    </>
  );
};

export default UserManagement;