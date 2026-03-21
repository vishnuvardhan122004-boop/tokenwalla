// ADMIN/Hospitals.js  — Admin view for all Doctors across all hospitals
import { useEffect, useState } from 'react';
import API from '../services/api';

const Hospitals = () => {
  const [doctors,    setDoctors]    = useState([]);
  const [hospitals,  setHospitals]  = useState([]);
  const [editDoctor, setEditDoctor] = useState(null);
  const [search,     setSearch]     = useState('');
  const [loading,    setLoading]    = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      API.get('/doctors/'),
      API.get('/hospitals/'),
    ])
      .then(([docRes, hospRes]) => {
        setDoctors(docRes.data);
        setHospitals(hospRes.data);
      })
      .catch(() => alert('Failed to fetch data'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = doctors.filter(doc =>
    (doc.name           || '').toLowerCase().includes(search.toLowerCase()) ||
    (doc.specialization || '').toLowerCase().includes(search.toLowerCase()) ||
    (doc.hospital_name  || '').toLowerCase().includes(search.toLowerCase()) ||
    (doc.city           || '').toLowerCase().includes(search.toLowerCase())
  );

  const openEdit = (id) => {
    API.get(`/doctors/${id}/`)
      .then(({ data }) => setEditDoctor(data))
      .catch(() => alert('Failed to load doctor'));
  };

  const deleteDoctor = async (id) => {
    if (!window.confirm('Delete this doctor?')) return;
    try {
      await API.delete(`/doctors/${id}/`);
      setDoctors(prev => prev.filter(d => d.id !== id));
    } catch { alert('Delete failed'); }
  };

  const submitEdit = async (e) => {
    e.preventDefault();
    try {
      const { data } = await API.patch(`/doctors/${editDoctor.id}/`, editDoctor);
      setDoctors(prev => prev.map(d => d.id === editDoctor.id ? data : d));
      setEditDoctor(null);
      // Close Bootstrap modal
      const modal = window.bootstrap?.Modal.getInstance(document.getElementById('editModal'));
      modal?.hide();
    } catch { alert('Update failed'); }
  };

  return (
    <div className="container-fluid p-4">
      <h4 className="mb-4 fw-bold">🏥 Hospitals & Doctors</h4>

      {/* Hospital Summary Cards */}
      <div className="row g-3 mb-4">
        {hospitals.slice(0, 4).map(h => (
          <div key={h.id} className="col-md-3">
            <div className="card border-0 shadow-sm p-3">
              <h6 className="fw-bold mb-1">{h.name}</h6>
              <small className="text-muted">📍 {h.city}</small>
              <div className="mt-2">
                <span className={`badge ${h.status === 'active' ? 'bg-success' : 'bg-secondary'}`}>
                  {h.status}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="d-flex justify-content-between align-items-center mb-3">
        <h5 className="fw-bold mb-0">All Doctors ({doctors.length})</h5>
        <input
          type="text"
          placeholder="Search doctors..."
          className="form-control"
          style={{ maxWidth: 280 }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="text-center py-5"><div className="spinner-border text-primary" /></div>
      ) : (
        <div className="card shadow-sm border-0">
          <table className="table table-hover mb-0">
            <thead className="table-light">
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
                <tr><td colSpan={8} className="text-center text-muted py-4">No doctors found</td></tr>
              )}
              {filtered.map(doc => (
                <tr key={doc.id}>
                  <td className="fw-semibold">Dr. {doc.name}</td>
                  <td>{doc.specialization}</td>
                  <td>{doc.hospital_name}</td>
                  <td>{doc.experience} yrs</td>
                  <td>{doc.city}</td>
                  <td>₹{doc.fee}</td>
                  <td>
                    <span className={`badge ${doc.available ? 'bg-success' : 'bg-secondary'}`}>
                      {doc.available ? 'Available' : 'Unavailable'}
                    </span>
                  </td>
                  <td>
                    <button
                      className="btn btn-primary btn-sm me-2"
                      data-bs-toggle="modal"
                      data-bs-target="#editModal"
                      onClick={() => openEdit(doc.id)}
                    >
                      Edit
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => deleteDoctor(doc.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Modal */}
      <div className="modal fade" id="editModal" tabIndex="-1">
        <div className="modal-dialog">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">Edit Doctor</h5>
              <button type="button" className="btn-close" data-bs-dismiss="modal" />
            </div>
            <div className="modal-body">
              {editDoctor && (
                <form onSubmit={submitEdit}>
                  {['name', 'specialization', 'city', 'experience', 'fee'].map(field => (
                    <div className="mb-2" key={field}>
                      <label className="form-label text-capitalize">{field}</label>
                      <input
                        name={field}
                        value={editDoctor[field] || ''}
                        onChange={(e) =>
                          setEditDoctor(prev => ({ ...prev, [e.target.name]: e.target.value }))
                        }
                        className="form-control"
                        placeholder={field}
                      />
                    </div>
                  ))}
                  <div className="mb-3">
                    <label className="form-label">Available</label>
                    <select
                      className="form-select"
                      value={editDoctor.available ? 'true' : 'false'}
                      onChange={(e) =>
                        setEditDoctor(prev => ({ ...prev, available: e.target.value === 'true' }))
                      }
                    >
                      <option value="true">Available</option>
                      <option value="false">Unavailable</option>
                    </select>
                  </div>
                  <button className="btn btn-primary w-100">Update Doctor</button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Hospitals;