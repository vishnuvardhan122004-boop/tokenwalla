import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import API from "../services/api";

const DEFAULT_SLOTS = [
  "09:00 AM", "09:30 AM", "10:00 AM", "10:30 AM",
  "11:00 AM", "11:30 AM", "12:00 PM", "12:30 PM",
  "01:00 PM", "01:30 PM", "02:00 PM", "02:30 PM",
  "03:00 PM", "03:30 PM", "04:00 PM", "04:30 PM",
  "05:00 PM", "05:30 PM", "06:00 PM", "06:30 PM",
  "07:00 PM", "07:30 PM", "08:00 PM", "08:30 PM",
  "09:00 PM", "09:30 PM", "10:00 PM", "10:30 PM",
  "11:00 PM", "11:30 PM", "12:00 AM", "12:30 AM",
  "01:00 AM", "01:30 AM", "02:00 AM", "02:30 AM",
  "03:00 AM", "03:30 AM", "04:00 AM", "04:30 AM",
  "05:00 AM", "05:30 AM", "06:00 AM", "06:30 AM",
  "07:00 AM", "07:30 AM", "08:00 AM", "08:30 AM",
];

const EMPTY_DOCTOR = {
  name: "", specialization: "", experience: "",
  mobile: "", available: true, slots: [], max_per_slot: 10,
};

const EMPTY_ERRORS = {
  name: "", specialization: "", mobile: "", experience: "",
  max_per_slot: "", slots: "",
};

// ── Validation ──────────────────────────────────────────────────────────────
const validate = (formData) => {
  const errors = { ...EMPTY_ERRORS };
  let valid = true;

  if (!formData.name.trim()) {
    errors.name = "Doctor name is required"; valid = false;
  } else if (formData.name.trim().length < 2) {
    errors.name = "Name must be at least 2 characters"; valid = false;
  }

  if (!formData.specialization.trim()) {
    errors.specialization = "Specialization is required"; valid = false;
  }

  if (!formData.mobile.trim()) {
    errors.mobile = "Mobile number is required"; valid = false;
  } else if (!/^[6-9]\d{9}$/.test(formData.mobile.trim())) {
    errors.mobile = "Enter a valid 10-digit Indian mobile number"; valid = false;
  }

  if (formData.experience !== "" && (isNaN(formData.experience) || Number(formData.experience) < 0)) {
    errors.experience = "Experience must be a positive number"; valid = false;
  }

  if (formData.max_per_slot !== "" && (isNaN(formData.max_per_slot) || Number(formData.max_per_slot) < 1)) {
    errors.max_per_slot = "Must be at least 1 patient per slot"; valid = false;
  }

  if (formData.slots.length === 0) {
    errors.slots = "Select at least one time slot"; valid = false;
  }

  return { errors, valid };
};

const Hdashboard = () => {
  const navigate = useNavigate();

  const [hospital,             setHospital]             = useState(null);
  const [activeTab,            setActiveTab]            = useState("queue");
  const [queue,                setQueue]                = useState({ waiting: [], inProgress: [], completed: [] });
  const [doctors,              setDoctors]              = useState([]);
  const [loading,              setLoading]              = useState(false);
  const [showForm,             setShowForm]             = useState(false);
  const [editDoctor,           setEditDoctor]           = useState(null);
  const [formData,             setFormData]             = useState(EMPTY_DOCTOR);
  const [errors,               setErrors]               = useState(EMPTY_ERRORS);
  const [doctorImage,          setDoctorImage]          = useState(null);
  const [hospitalImage,        setHospitalImage]        = useState(null);
  const [doctorImagePreview,   setDoctorImagePreview]   = useState(null);
  const [hospitalImagePreview, setHospitalImagePreview] = useState(null);
  const [submitting,           setSubmitting]           = useState(false);

  // ── Auth Check ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const token   = localStorage.getItem("access");
    const userRaw = localStorage.getItem("user");
    if (!token || !userRaw) { navigate("/Hlogin"); return; }
    try {
      const user = JSON.parse(userRaw);
      if (user.role !== "hospital" || !user.hospital) { navigate("/Hlogin"); return; }
      setHospital(user.hospital);
    } catch { navigate("/Hlogin"); }
  }, [navigate]);

  // ── Load Queue ──────────────────────────────────────────────────────────────
  const loadQueue = async () => {
    if (!hospital) return;
    try {
      const res = await API.get(`/bookings/queue/${hospital.id}/`);
      setQueue(res.data);
    } catch (err) { console.log("Queue load failed", err); }
  };

  // ── Load Doctors ────────────────────────────────────────────────────────────
  const loadDoctors = async () => {
    if (!hospital) return;
    setLoading(true);
    try {
      const res = await API.get(`/doctors/?hospital=${hospital.id}`);
      setDoctors(res.data);
    } catch { console.log("Doctors load failed"); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!hospital) return;
    loadQueue();
    loadDoctors();
    const interval = setInterval(loadQueue, 10000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hospital]);

  // ── Queue Actions ───────────────────────────────────────────────────────────
  const handleCall     = async (id) => { try { await API.patch(`/bookings/call/${id}/`);     loadQueue(); } catch { alert("Failed to call patient"); } };
  const handleComplete = async (id) => { try { await API.patch(`/bookings/complete/${id}/`); loadQueue(); } catch { alert("Failed to complete booking"); } };

  const toggleAvailability = async (doctor) => {
    try { await API.patch(`/doctors/${doctor.id}/`, { available: !doctor.available }); loadDoctors(); }
    catch { alert("Failed to update availability"); }
  };

  // ── Image Change ────────────────────────────────────────────────────────────
  const handleImageChange = (e, type) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert("Image size must be less than 5MB"); return;
    }
    // Validate file type
    if (!file.type.startsWith("image/")) {
      alert("Please select a valid image file"); return;
    }

    const preview = URL.createObjectURL(file);
    if (type === "doctor") {
      setDoctorImage(file);
      setDoctorImagePreview(preview);
    } else {
      setHospitalImage(file);
      setHospitalImagePreview(preview);
    }
  };

  // ── Open Forms ──────────────────────────────────────────────────────────────
  const openAddForm = () => {
    setEditDoctor(null);
    setFormData(EMPTY_DOCTOR);
    setErrors(EMPTY_ERRORS);
    setDoctorImage(null);
    setHospitalImage(null);
    setDoctorImagePreview(null);
    setHospitalImagePreview(null);
    setShowForm(true);
  };

  const openEditForm = (doctor) => {
    setEditDoctor(doctor);
    setFormData({
      name:           doctor.name           || "",
      specialization: doctor.specialization || "",
      experience:     doctor.experience     || "",
      mobile:         doctor.mobile         || "",
      available:      doctor.available      ?? true,
      slots:          doctor.slots          || [],
      max_per_slot:   doctor.max_per_slot   || 10,
    });
    setErrors(EMPTY_ERRORS);
    setDoctorImagePreview(doctor.image          || null);
    setHospitalImagePreview(doctor.hospital_image || null);
    setDoctorImage(null);
    setHospitalImage(null);
    setShowForm(true);
  };

  // ── Toggle Slot ─────────────────────────────────────────────────────────────
  const toggleSlot = (slot) => {
    setFormData(prev => ({
      ...prev,
      slots: prev.slots.includes(slot)
        ? prev.slots.filter(s => s !== slot)
        : [...prev.slots, slot],
    }));
    // Clear slots error when a slot is selected
    if (errors.slots) setErrors(prev => ({ ...prev, slots: "" }));
  };

  // ── Handle Field Change with live validation ─────────────────────────────
  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error for this field on change
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: "" }));
  };

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();

    const { errors: newErrors, valid } = validate(formData);
    if (!valid) { setErrors(newErrors); return; }

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("name",           formData.name.trim());
      fd.append("specialization", formData.specialization.trim());
      fd.append("experience",     Number(formData.experience) || 0);
      fd.append("mobile",         formData.mobile.trim());
      fd.append("available",      formData.available);
      fd.append("max_per_slot",   Number(formData.max_per_slot) || 10);
      fd.append("slots",          JSON.stringify(formData.slots));

      if (!editDoctor) {
        fd.append("hospital", hospital.id);
        fd.append("city",     hospital.city || "");
      }

      if (doctorImage)   fd.append("image",          doctorImage);
      if (hospitalImage) fd.append("hospital_image", hospitalImage);

      if (editDoctor) {
        await API.patch(`/doctors/${editDoctor.id}/`, fd, { headers: { "Content-Type": "multipart/form-data" } });
        alert("Doctor updated successfully!");
      } else {
        await API.post("/doctors/", fd, { headers: { "Content-Type": "multipart/form-data" } });
        alert("Doctor added successfully!");
      }

      setShowForm(false);
      setFormData(EMPTY_DOCTOR);
      setErrors(EMPTY_ERRORS);
      setEditDoctor(null);
      setDoctorImage(null);
      setHospitalImage(null);
      setDoctorImagePreview(null);
      setHospitalImagePreview(null);
      loadDoctors();

    } catch (err) {
      const apiErrors = err?.response?.data?.errors;
      if (apiErrors) {
        const msg = Object.entries(apiErrors)
          .map(([field, msgs]) => `${field}: ${Array.isArray(msgs) ? msgs.join(", ") : msgs}`)
          .join("\n");
        alert("Validation errors:\n" + msg);
      } else {
        alert(err?.response?.data?.message || "Failed to save doctor");
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ── Delete ──────────────────────────────────────────────────────────────────
  const handleDelete = async (id) => {
    if (!window.confirm("Delete this doctor?")) return;
    try { await API.delete(`/doctors/${id}/`); loadDoctors(); }
    catch { alert("Failed to delete doctor"); }
  };

  const logout = () => { localStorage.clear(); navigate("/Hlogin"); };
  const totalToday = queue.waiting.length + queue.inProgress.length + queue.completed.length;

  // ── Error field component ───────────────────────────────────────────────────
  const FieldError = ({ msg }) => msg
    ? <small className="text-danger d-block mt-1">⚠️ {msg}</small>
    : null;

  return (
    <div className="min-vh-100 bg-light">

      {/* Navbar */}
      <nav className="navbar bg-white shadow-sm px-4 py-2">
        <div className="d-flex align-items-center gap-2">
          <img src="/logo.png" alt="TW" style={{ width: 32, borderRadius: 8 }} />
          <span className="fw-bold text-primary">TokenWalla</span>
        </div>
        <div className="d-flex align-items-center gap-3">
          <span className="text-muted small">🏥 {hospital?.name}</span>
          <button className="btn btn-outline-danger btn-sm" onClick={logout}>Logout</button>
        </div>
      </nav>

      <div className="container py-4">

        {/* Stats */}
        <div className="row g-3 mb-4">
          {[
            { label: "Total Today",  val: totalToday,              color: "primary" },
            { label: "Waiting",      val: queue.waiting.length,    color: "warning" },
            { label: "In Progress",  val: queue.inProgress.length, color: "info"    },
            { label: "Completed",    val: queue.completed.length,  color: "success" },
          ].map(({ label, val, color }) => (
            <div key={label} className="col-6 col-md-3">
              <div className="card shadow-sm p-3 text-center border-0">
                <h6 className="text-muted mb-1">{label}</h6>
                <h3 className={`fw-bold text-${color}`}>{val}</h3>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <ul className="nav nav-tabs mb-4">
          <li className="nav-item">
            <button className={`nav-link ${activeTab === "queue" ? "active" : ""}`} onClick={() => setActiveTab("queue")}>
              🏥 Queue Management
            </button>
          </li>
          <li className="nav-item">
            <button className={`nav-link ${activeTab === "doctors" ? "active" : ""}`} onClick={() => setActiveTab("doctors")}>
              👨‍⚕️ Doctors
            </button>
          </li>
        </ul>

        {/* Queue Tab */}
        {activeTab === "queue" && (
          <div className="row g-3">
            {[
              { title: "⏳ Waiting",     color: "warning", items: queue.waiting,    btn: { label: "Call Patient",  action: handleCall,     cls: "btn-primary" } },
              { title: "🔄 In Progress", color: "info",    items: queue.inProgress, btn: { label: "Mark Complete", action: handleComplete, cls: "btn-success" } },
              { title: "✅ Completed",   color: "success", items: queue.completed,  btn: null },
            ].map(({ title, color, items, btn }) => (
              <div key={title} className="col-md-4">
                <div className="card border-0 shadow-sm h-100">
                  <div className={`card-header bg-${color} text-white fw-bold`}>{title} ({items.length})</div>
                  <div className="card-body p-2">
                    {items.length === 0 && <p className="text-muted text-center small mt-3">No patients</p>}
                    {items.map(p => (
                      <div key={p.id} className="border rounded p-2 mb-2 bg-light">
                        <div className="fw-semibold">{p.user_name || "Patient"}</div>
                        <div className="small text-muted">📞 {p.user_mobile || "N/A"}</div>
                        <div className="small text-muted">🩺 {p.doctor_name}</div>
                        <div className="small text-muted">🕐 {p.slot}</div>
                        <div className="small text-primary fw-bold">Token: {p.token}</div>
                        {btn && (
                          <button className={`btn ${btn.cls} btn-sm w-100 mt-2`} onClick={() => btn.action(p.id)}>
                            {btn.label}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Doctors Tab */}
        {activeTab === "doctors" && (
          <div>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h5 className="mb-0 fw-bold">Our Doctors ({doctors.length})</h5>
              <button className="btn btn-primary btn-sm" onClick={openAddForm}>+ Add Doctor</button>
            </div>

            {/* Form */}
            {showForm && (
              <div className="card shadow-sm border-0 p-4 mb-4">
                <div className="d-flex justify-content-between align-items-center mb-4">
                  <h6 className="fw-bold mb-0">{editDoctor ? "✏️ Edit Doctor" : "➕ Add New Doctor"}</h6>
                  <button className="btn btn-sm btn-outline-secondary"
                    onClick={() => { setShowForm(false); setEditDoctor(null); setErrors(EMPTY_ERRORS); }}>
                    Cancel
                  </button>
                </div>

                <form onSubmit={handleSubmit} noValidate>
                  <div className="row g-3">

                    {/* Images */}
                    <div className="col-12">
                      <div className="row g-3">
                        <div className="col-md-6">
                          <label className="form-label fw-semibold">👤 Doctor Profile Image</label>
                          <input type="file" accept="image/*" className="form-control mb-2"
                            onChange={(e) => handleImageChange(e, "doctor")} />
                          <small className="text-muted">Max 5MB · JPG, PNG, WebP</small>
                          {doctorImagePreview && (
                            <div className="mt-2 text-center">
                              <img src={doctorImagePreview} alt="Doctor Preview"
                                className="rounded-circle border border-3 border-primary"
                                style={{ width: 100, height: 100, objectFit: "cover" }} />
                              <small className="d-block text-muted mt-1">Doctor Image Preview</small>
                            </div>
                          )}
                        </div>
                        <div className="col-md-6">
                          <label className="form-label fw-semibold">🏥 Hospital Banner Image</label>
                          <input type="file" accept="image/*" className="form-control mb-2"
                            onChange={(e) => handleImageChange(e, "hospital")} />
                          <small className="text-muted">Max 5MB · JPG, PNG, WebP</small>
                          {hospitalImagePreview && (
                            <div className="mt-2">
                              <img src={hospitalImagePreview} alt="Hospital Banner Preview"
                                className="rounded w-100" style={{ height: 100, objectFit: "cover" }} />
                              <small className="d-block text-muted mt-1 text-center">Hospital Banner Preview</small>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Name */}
                    <div className="col-md-6">
                      <label className="form-label fw-semibold">Doctor Name *</label>
                      <input
                        className={`form-control ${errors.name ? "is-invalid" : ""}`}
                        placeholder="Dr. John Smith"
                        value={formData.name}
                        onChange={e => handleChange("name", e.target.value)}
                      />
                      <FieldError msg={errors.name} />
                    </div>

                    {/* Specialization */}
                    <div className="col-md-6">
                      <label className="form-label fw-semibold">Specialization *</label>
                      <input
                        className={`form-control ${errors.specialization ? "is-invalid" : ""}`}
                        placeholder="Cardiologist"
                        value={formData.specialization}
                        onChange={e => handleChange("specialization", e.target.value)}
                      />
                      <FieldError msg={errors.specialization} />
                    </div>

                    {/* Experience */}
                    <div className="col-md-4">
                      <label className="form-label fw-semibold">Experience (years)</label>
                      <input
                        className={`form-control ${errors.experience ? "is-invalid" : ""}`}
                        type="number" min="0" max="60" placeholder="5"
                        value={formData.experience}
                        onChange={e => handleChange("experience", e.target.value)}
                      />
                      <FieldError msg={errors.experience} />
                    </div>

                    {/* Mobile */}
                    <div className="col-md-4">
                      <label className="form-label fw-semibold">Mobile * <small className="text-muted">(10-digit)</small></label>
                      <div className="input-group">
                        <span className="input-group-text text-muted">+91</span>
                        <input
                          className={`form-control ${errors.mobile ? "is-invalid" : formData.mobile && /^[6-9]\d{9}$/.test(formData.mobile) ? "is-valid" : ""}`}
                          type="tel" placeholder="9000000000" maxLength={10}
                          value={formData.mobile}
                          onChange={e => handleChange("mobile", e.target.value.replace(/\D/, "").slice(0, 10))}
                        />
                      </div>
                      <FieldError msg={errors.mobile} />
                      {formData.mobile && /^[6-9]\d{9}$/.test(formData.mobile) && (
                        <small className="text-success">✓ Valid mobile number</small>
                      )}
                    </div>

                    {/* Max per slot */}
                    <div className="col-md-4">
                      <label className="form-label fw-semibold">Max Patients Per Slot</label>
                      <input
                        className={`form-control ${errors.max_per_slot ? "is-invalid" : ""}`}
                        type="number" min="1" max="100" placeholder="10"
                        value={formData.max_per_slot}
                        onChange={e => handleChange("max_per_slot", e.target.value)}
                      />
                      <FieldError msg={errors.max_per_slot} />
                    </div>

                    {/* Availability */}
                    <div className="col-12">
                      <div className="form-check form-switch">
                        <input className="form-check-input" type="checkbox"
                          checked={formData.available}
                          onChange={e => handleChange("available", e.target.checked)} />
                        <label className="form-check-label fw-semibold">
                          {formData.available ? "✅ Available" : "❌ Unavailable"}
                        </label>
                      </div>
                    </div>

                    {/* Time Slots */}
                    <div className="col-12">
                      <label className="form-label fw-semibold">
                        🕐 Select Time Slots *
                        <small className="text-muted ms-2">({formData.slots.length} selected)</small>
                      </label>
                      <div className="mb-2">
                        <small className="text-muted fw-semibold d-block mb-1">🌅 Morning</small>
                        <div className="d-flex flex-wrap gap-2">
                          {DEFAULT_SLOTS.slice(0, 8).map(slot => (
                            <button key={slot} type="button"
                              className={`btn btn-sm ${formData.slots.includes(slot) ? "btn-primary" : "btn-outline-secondary"}`}
                              onClick={() => toggleSlot(slot)}>
                              {slot}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="mb-2">
                        <small className="text-muted fw-semibold d-block mb-1">🌆 Evening & Night</small>
                        <div className="d-flex flex-wrap gap-2">
                          {DEFAULT_SLOTS.slice(8).map(slot => (
                            <button key={slot} type="button"
                              className={`btn btn-sm ${formData.slots.includes(slot) ? "btn-primary" : "btn-outline-secondary"}`}
                              onClick={() => toggleSlot(slot)}>
                              {slot}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="d-flex gap-2 mt-2">
                        <button type="button" className="btn btn-sm btn-outline-primary"
                          onClick={() => { setFormData(p => ({ ...p, slots: [...DEFAULT_SLOTS] })); setErrors(p => ({ ...p, slots: "" })); }}>
                          Select All
                        </button>
                        <button type="button" className="btn btn-sm btn-outline-danger"
                          onClick={() => setFormData(p => ({ ...p, slots: [] }))}>
                          Clear All
                        </button>
                      </div>
                      <FieldError msg={errors.slots} />
                    </div>

                    {/* Submit */}
                    <div className="col-12">
                      <button type="submit" className="btn btn-primary px-4" disabled={submitting}>
                        {submitting
                          ? <><span className="spinner-border spinner-border-sm me-2" />Saving...</>
                          : editDoctor ? "💾 Update Doctor" : "➕ Add Doctor"
                        }
                      </button>
                    </div>

                  </div>
                </form>
              </div>
            )}

            {/* Doctors List */}
            {loading ? (
              <div className="text-center py-4"><div className="spinner-border text-primary" /></div>
            ) : (
              <div className="row g-3">
                {doctors.length === 0 && (
                  <div className="col-12">
                    <p className="text-muted text-center py-4">No doctors added yet. Click + Add Doctor.</p>
                  </div>
                )}
                {doctors.map(doc => (
                  <div key={doc.id} className="col-md-6 col-lg-4">
                    <div className="card border-0 shadow-sm h-100">
                      <div style={{ position: "relative", height: 100 }}>
                        {doc.hospital_image && !doc.hospital_image.includes("placehold") ? (
                          <img src={doc.hospital_image} alt="Hospital" className="w-100 h-100"
                            style={{ objectFit: "cover", borderRadius: "8px 8px 0 0" }} />
                        ) : (
                          <div style={{ width: "100%", height: "100%", background: "#e9ecef", borderRadius: "8px 8px 0 0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>🏥</div>
                        )}
                        {doc.image && !doc.image.includes("placehold") ? (
                          <img src={doc.image} alt={doc.name}
                            className="rounded-circle border border-3 border-white position-absolute"
                            style={{ width: 60, height: 60, objectFit: "cover", bottom: -30, left: 16 }} />
                        ) : (
                          <div className="rounded-circle border border-3 border-white position-absolute d-flex align-items-center justify-content-center bg-light"
                            style={{ width: 60, height: 60, bottom: -30, left: 16, fontSize: 24 }}>👨‍⚕️</div>
                        )}
                      </div>
                      <div className="p-3 pt-4 mt-2">
                        <div className="fw-semibold">Dr. {doc.name}</div>
                        <div className="small text-primary mb-1">{doc.specialization}</div>
                        <div className="small text-muted mb-1">📞 {doc.mobile}</div>
                        <div className="small text-muted mb-1">⏳ {doc.experience} yrs exp</div>
                        <div className="small text-muted mb-2">👥 Max {doc.max_per_slot || 10} patients/slot</div>
                        <div className="mb-3">
                          <small className="fw-semibold text-muted d-block mb-1">🕐 Slots ({doc.slots?.length || 0})</small>
                          <div className="d-flex flex-wrap gap-1">
                            {(doc.slots || []).slice(0, 3).map(s => (
                              <span key={s} className="badge bg-light text-dark border small">{s}</span>
                            ))}
                            {(doc.slots || []).length > 3 && (
                              <span className="badge bg-secondary small">+{doc.slots.length - 3} more</span>
                            )}
                            {(doc.slots || []).length === 0 && <span className="text-danger small">No slots set</span>}
                          </div>
                        </div>
                        <div className="d-flex gap-2">
                          <button className={`btn btn-sm flex-grow-1 ${doc.available ? "btn-success" : "btn-secondary"}`}
                            onClick={() => toggleAvailability(doc)}>
                            {doc.available ? "✅ Available" : "❌ Unavailable"}
                          </button>
                          <button className="btn btn-sm btn-outline-primary" onClick={() => openEditForm(doc)}>✏️</button>
                          <button className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(doc.id)}>🗑</button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Hdashboard;