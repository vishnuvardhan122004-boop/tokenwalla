import { useEffect, useState } from 'react';
import API from '../services/api';

const Hospitals = () => {
  const [doctors,    setDoctors]    = useState([]);
  const [hospitals,  setHospitals]  = useState([]);
  const [editDoctor, setEditDoctor] = useState(null);
  const [search,     setSearch]     = useState('');
  const [loading,    setLoading]    = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState('');
  const [toast,      setToast]      = useState(null);
  const [showModal,  setShowModal]  = useState(false);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([
      API.get('/doctors/'),
      API.get('/hospitals/'),
    ])
      .then(([docRes, hospRes]) => {
        // Both endpoints may return paginated or plain arrays
        const parseDocs  = docRes.data;
        const parseHosps = hospRes.data;
        setDoctors(Array.isArray(parseDocs)  ? parseDocs  : parseDocs?.results  || []);
        setHospitals(Array.isArray(parseHosps) ? parseHosps : parseHosps?.results || []);
      })
      .catch(() => setError('Failed to fetch data.'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = doctors.filter(doc => {
    const q = search.toLowerCase();
    return !search ||
      (doc.name           || '').toLowerCase().includes(q) ||
      (doc.specialization || '').toLowerCase().includes(q) ||
      (doc.hospital_name  || '').toLowerCase().includes(q) ||
      (doc.city           || '').toLowerCase().includes(q);
  });

  const openEdit = id => {
    API.get(`/doctors/${id}/`)
      .then(({ data }) => { setEditDoctor({ ...data }); setShowModal(true); })
      .catch(() => showToast('Failed to load doctor.', 'error'));
  };

  const deleteDoctor = async id => {
    if (!window.confirm('Delete this doctor? This cannot be undone.')) return;
    try {
      await API.delete(`/doctors/${id}/`);
      setDoctors(prev => prev.filter(d => d.id !== id));
      showToast('Doctor deleted successfully.');
    } catch {
      showToast('Delete failed. The doctor may have active bookings.', 'error');
    }
  };

  const submitEdit = async e => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await API.patch(`/doctors/${editDoctor.id}/`, {
        name:           editDoctor.name,
        specialization: editDoctor.specialization,
        city:           editDoctor.city,
        experience:     Number(editDoctor.experience) || 0,
        fee:            Number(editDoctor.fee)        || 0,
        available:      editDoctor.available,
      }, { headers: { 'Content-Type': 'application/json' } });

      setDoctors(prev => prev.map(d => d.id === editDoctor.id ? { ...d, ...data } : d));
      setShowModal(false);
      setEditDoctor(null);
      showToast('Doctor updated successfully!');
    } catch (err) {
      const msg = err?.response?.data?.message || 'Update failed.';
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <style>{`
        .hp-header { margin-bottom: 24px; }
        .hp-title { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1.4rem; font-weight: 800; color: var(--gray-900); margin-bottom: 4px; }
        .hp-sub { font-size: 14px; color: var(--gray-400); }
        .hp-hosp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 14px; margin-bottom: 28px; }
        .hp-hosp-card { background: #fff; border: 1px solid var(--blue-100); border-radius: 14px; padding: 18px 20px; }
        .hp-hosp-name { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 14px; font-weight: 700; color: var(--gray-900); margin-bottom: 4px; }
        .hp-hosp-city { font-size: 13px; color: var(--gray-500); margin-bottom: 10px; }
        .hp-badge { display: inline-flex; align-items: center; padding: 3px 10px; border-radius: 100px; font-size: 12px; font-weight: 600; border: 1px solid transparent; }
        .hp-toolbar { display: flex; gap: 12px; align-items: center; margin-bottom: 16px; }
        .hp-search-wrap { position: relative; flex: 1; max-width: 320px; }
        .hp-search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); font-size: 14px; color: var(--gray-400); pointer-events: none; }
        .hp-search { width: 100%; background: #fff; border: 1px solid var(--blue-100); border-radius: 11px; padding: 10px 14px 10px 36px; font-family: 'DM Sans', sans-serif; font-size: 14px; outline: none; transition: all 0.15s; }
        .hp-search:focus { border-color: var(--blue-400); box-shadow: 0 0 0 3px rgba(55,138,221,0.12); }
        .hp-count { font-size: 13px; color: var(--gray-400); margin-left: auto; }
        .hp-card { background: #fff; border: 1px solid var(--blue-100); border-radius: 16px; overflow: hidden; }
        .hp-table { width: 100%; border-collapse: collapse; }
        .hp-table th { padding: 11px 18px; text-align: left; font-size: 11px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; color: var(--gray-400); background: var(--gray-50); border-bottom: 1px solid var(--blue-50); }
        .hp-table td { padding: 13px 18px; font-size: 14px; border-bottom: 1px solid var(--blue-50); vertical-align: middle; color: var(--gray-800); }
        .hp-table tr:last-child td { border-bottom: none; }
        .hp-table tr:hover td { background: var(--blue-50); }
        .hp-action-btn { padding: 6px 14px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.15s; font-family: 'DM Sans', sans-serif; border: 1px solid transparent; margin-right: 6px; }
        .hp-action-btn.edit { background: var(--blue-50); color: var(--blue-700); border-color: var(--blue-200); }
        .hp-action-btn.edit:hover { background: var(--blue-100); border-color: var(--blue-400); }
        .hp-action-btn.del { background: var(--color-error-bg); color: var(--color-error-text); border-color: var(--color-error-border); }
        .hp-action-btn.del:hover { background: #f7c1c1; }
        .hp-empty { text-align: center; padding: 60px 20px; color: var(--gray-400); font-size: 14px; }
        .hp-modal-overlay { position: fixed; inset: 0; z-index: 2000; background: rgba(4,44,83,0.45); backdrop-filter: blur(6px); display: flex; align-items: center; justify-content: center; padding: 16px; }
        .hp-modal { background: #fff; border: 1px solid var(--blue-100); border-radius: 20px; padding: 28px; width: 100%; max-width: 480px; box-shadow: var(--shadow-lg); position: relative; }
        .hp-modal::before { content:''; position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--blue-600),var(--blue-400));border-radius:20px 20px 0 0; }
        .hp-modal-title { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1.1rem; font-weight: 800; color: var(--gray-900); margin-bottom: 20px; }
        .hp-field { margin-bottom: 16px; }
        .hp-field label { display: block; font-size: 12px; font-weight: 600; color: var(--gray-600); margin-bottom: 6px; }
        .hp-field input, .hp-field select { width: 100%; background: var(--gray-50); border: 1px solid var(--blue-100); border-radius: 11px; padding: 11px 14px; font-family: 'DM Sans', sans-serif; font-size: 14px; color: var(--gray-900); outline: none; transition: all 0.15s; }
        .hp-field input:focus, .hp-field select:focus { border-color: var(--blue-400); background: #fff; box-shadow: 0 0 0 3px rgba(55,138,221,0.12); }
        .hp-modal-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .hp-modal-actions { display: flex; gap: 10px; margin-top: 20px; }
        .hp-modal-cancel { flex: 1; padding: 12px; border-radius: 11px; border: 1px solid var(--blue-100); background: var(--gray-50); color: var(--gray-600); font-family: 'DM Sans', sans-serif; font-size: 14px; cursor: pointer; transition: all 0.15s; }
        .hp-modal-cancel:hover { background: var(--gray-200); }
        .hp-modal-save { flex: 2; padding: 12px; border-radius: 11px; border: none; background: var(--blue-600); color: #fff; font-family: 'DM Sans', sans-serif; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.15s; }
        .hp-modal-save:hover:not(:disabled) { background: var(--blue-800); }
        .hp-modal-save:disabled { opacity: 0.5; cursor: not-allowed; }
        .hp-toast { position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%); padding: 12px 24px; border-radius: 12px; font-size: 14px; font-weight: 500; z-index: 9999; white-space: nowrap; box-shadow: var(--shadow-lg); }
        .hp-toast.success { background: var(--color-success-text); color: #fff; }
        .hp-toast.error   { background: var(--color-error-text); color: #fff; }
        @media (max-width: 700px) { .hp-modal-row { grid-template-columns: 1fr; } }
      `}</style>

      <div className="hp-header">
        <div className="hp-title">🏥 Hospitals & Doctors</div>
        <div className="hp-sub">Manage hospital accounts and doctor listings across the platform</div>
      </div>

      {error && (
        <div style={{ background: 'var(--color-error-bg)', border: '1px solid var(--color-error-border)', borderRadius: 12, padding: '12px 16px', color: 'var(--color-error-text)', fontSize: 14, marginBottom: 20 }}>
          ⚠️ {error}
        </div>
      )}

      {/* Hospital cards */}
      {hospitals.length > 0 && (
        <>
          <div style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: 13, fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
            Registered Hospitals ({hospitals.length})
          </div>
          <div className="hp-hosp-grid">
            {hospitals.map(h => (
              <div key={h.id} className="hp-hosp-card">
                <div className="hp-hosp-name">{h.name}</div>
                <div className="hp-hosp-city">📍 {h.city}</div>
                <span className="hp-badge" style={{
                  background:  h.status === 'active' ? 'var(--color-success-bg)' : 'var(--gray-100)',
                  color:       h.status === 'active' ? 'var(--color-success-text)' : 'var(--gray-500)',
                  borderColor: h.status === 'active' ? 'var(--color-success-border)' : 'var(--gray-200)',
                }}>
                  {h.status === 'active' ? '✅ Active' : '⛔ Inactive'}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Doctors table toolbar */}
      <div className="hp-toolbar">
        <div style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: 15, fontWeight: 700, color: 'var(--gray-900)' }}>
          All Doctors ({doctors.length})
        </div>
        <div className="hp-search-wrap">
          <span className="hp-search-icon">🔍</span>
          <input
            className="hp-search"
            placeholder="Search doctors…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <span className="hp-count">
          {filtered.length} result{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
          <div style={{ width: 36, height: 36, border: '3px solid var(--blue-100)', borderTopColor: 'var(--blue-600)', borderRadius: '50%', animation: 'adSpin 0.7s linear infinite' }} />
          <style>{`@keyframes adSpin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : (
        <div className="hp-card">
          <div style={{ overflowX: 'auto' }}>
            <table className="hp-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Specialization</th>
                  <th>Hospital</th>
                  <th>Exp</th>
                  <th>City</th>
                  <th>Fee</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="hp-empty">No doctors found</td></tr>
                )}
                {filtered.map(doc => (
                  <tr key={doc.id}>
                    <td style={{ fontWeight: 600 }}>Dr. {doc.name}</td>
                    <td style={{ color: 'var(--blue-700)' }}>{doc.specialization}</td>
                    <td style={{ color: 'var(--gray-500)' }}>{doc.hospital_name || '—'}</td>
                    <td>{doc.experience} yrs</td>
                    <td style={{ color: 'var(--gray-500)' }}>{doc.city || '—'}</td>
                    <td style={{ fontWeight: 600 }}>₹{doc.fee || 0}</td>
                    <td>
                      <span className="hp-badge" style={{
                        background:  doc.available ? 'var(--color-success-bg)' : 'var(--gray-100)',
                        color:       doc.available ? 'var(--color-success-text)' : 'var(--gray-500)',
                        borderColor: doc.available ? 'var(--color-success-border)' : 'var(--gray-200)',
                      }}>
                        {doc.available ? '✅ Available' : '⛔ Unavailable'}
                      </span>
                    </td>
                    <td>
                      <button className="hp-action-btn edit" onClick={() => openEdit(doc.id)}>✏️ Edit</button>
                      <button className="hp-action-btn del"  onClick={() => deleteDoctor(doc.id)}>🗑</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showModal && editDoctor && (
        <div
          className="hp-modal-overlay"
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div className="hp-modal">
            <div className="hp-modal-title">✏️ Edit Dr. {editDoctor.name}</div>
            <form onSubmit={submitEdit}>
              <div className="hp-modal-row">
                <div className="hp-field">
                  <label>Name *</label>
                  <input
                    value={editDoctor.name || ''}
                    onChange={e => setEditDoctor(p => ({ ...p, name: e.target.value }))}
                    placeholder="Doctor name"
                    required
                  />
                </div>
                <div className="hp-field">
                  <label>Specialization *</label>
                  <input
                    value={editDoctor.specialization || ''}
                    onChange={e => setEditDoctor(p => ({ ...p, specialization: e.target.value }))}
                    placeholder="Cardiologist"
                    required
                  />
                </div>
              </div>
              <div className="hp-modal-row">
                <div className="hp-field">
                  <label>City</label>
                  <input
                    value={editDoctor.city || ''}
                    onChange={e => setEditDoctor(p => ({ ...p, city: e.target.value }))}
                    placeholder="City"
                  />
                </div>
                <div className="hp-field">
                  <label>Experience (years)</label>
                  <input
                    type="number" min="0"
                    value={editDoctor.experience || ''}
                    onChange={e => setEditDoctor(p => ({ ...p, experience: e.target.value }))}
                    placeholder="5"
                  />
                </div>
              </div>
              <div className="hp-modal-row">
                <div className="hp-field">
                  <label>Fee (₹)</label>
                  <input
                    type="number" min="0"
                    value={editDoctor.fee || ''}
                    onChange={e => setEditDoctor(p => ({ ...p, fee: e.target.value }))}
                    placeholder="0"
                  />
                </div>
                <div className="hp-field">
                  <label>Availability</label>
                  <select
                    value={editDoctor.available ? 'true' : 'false'}
                    onChange={e => setEditDoctor(p => ({ ...p, available: e.target.value === 'true' }))}
                  >
                    <option value="true">✅ Available</option>
                    <option value="false">⛔ Unavailable</option>
                  </select>
                </div>
              </div>
              <div className="hp-modal-actions">
                <button type="button" className="hp-modal-cancel" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="hp-modal-save" disabled={saving}>
                  {saving ? '⏳ Saving…' : '💾 Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && <div className={`hp-toast ${toast.type}`}>{toast.msg}</div>}
    </>
  );
};

export default Hospitals;