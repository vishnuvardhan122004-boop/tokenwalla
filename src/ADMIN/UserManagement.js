// ADMIN/UserManagement.js
import { useEffect, useState } from 'react';
import API from '../services/api';

const UserManagement = () => {
  const [users,   setUsers]   = useState([]);
  const [search,  setSearch]  = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    API.get('/auth/users/')
      .then(({ data }) => setUsers(data))
      .catch(() => alert('Failed to load users'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = users.filter(u =>
    // FIX: UserSerializer returns "name" not "username"
    (u.name   || '').toLowerCase().includes(search.toLowerCase()) ||
    (u.mobile || '').includes(search)
  );

  const blockUser = async (id) => {
    if (!window.confirm('Block this user?')) return;
    try {
      await API.patch(`/auth/users/${id}/block/`, { status: 'blocked' });
      setUsers(prev => prev.map(u => u.id === id ? { ...u, status: 'blocked' } : u));
    } catch { alert('Action failed'); }
  };

  const activateUser = async (id) => {
    try {
      await API.patch(`/auth/users/${id}/block/`, { status: 'active' });
      setUsers(prev => prev.map(u => u.id === id ? { ...u, status: 'active' } : u));
    } catch { alert('Action failed'); }
  };

  return (
    <div className="container-fluid p-4">
      <h4 className="mb-4 fw-bold">👥 User Management</h4>
      <input type="text" className="form-control mb-3"
        placeholder="Search by Name or Mobile"
        value={search} onChange={(e) => setSearch(e.target.value)} />

      {loading ? (
        <div className="text-center py-4"><div className="spinner-border text-primary" /></div>
      ) : (
        <div className="card shadow-sm border-0">
          <table className="table table-hover mb-0">
            <thead className="table-light">
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
                <tr><td colSpan={6} className="text-center text-muted py-4">No users found</td></tr>
              )}
              {filtered.map((user, i) => (
                <tr key={user.id}>
                  <td className="text-muted">{i + 1}</td>
                  {/* FIX: use user.name (from get_name serializer method) */}
                  <td className="fw-semibold">{user.name}</td>
                  <td>{user.mobile}</td>
                  <td>
                    <span className={`badge ${user.role === 'admin' ? 'bg-danger' : 'bg-secondary'}`}>
                      {user.role}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${user.status === 'blocked' ? 'bg-danger' : 'bg-success'}`}>
                      {user.status || 'active'}
                    </span>
                  </td>
                  <td>
                    {user.status === 'blocked' ? (
                      <button className="btn btn-success btn-sm" onClick={() => activateUser(user.id)}>
                        ✅ Activate
                      </button>
                    ) : (
                      <button className="btn btn-danger btn-sm" onClick={() => blockUser(user.id)}>
                        🚫 Block
                      </button>
                    )}
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

export default UserManagement;