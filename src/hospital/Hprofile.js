import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import API, { logoutUser } from "../services/api";
import LocationSearch from "../componets/LocationSearch";

// Mirrors app/(hospital)/profile.tsx — full hospital profile editor.
// Backend: PATCH /hospitals/:id/ (details + banner/logo), POST/DELETE
// /hospitals/:id/photos/ (gallery), /auth/otp/request|verify (mobile change).

const STATUS_STYLE = {
  approved: { cls: "success", label: "✅ Approved" },
  active:   { cls: "success", label: "✅ Active"   },
  pending:  { cls: "warning", label: "⏳ Pending Approval" },
  rejected: { cls: "danger",  label: "⛔ Rejected" },
};

const EMPTY_FORM = {
  name: "", city: "", address: "", location: "", mobile: "",
  latitude: null, longitude: null,
  instagram: "", youtube: "", facebook: "",
  description: "", announcement: "", open_time: "", close_time: "",
};

const Hprofile = () => {
  const navigate = useNavigate();

  const [hospital,    setHospital]    = useState(null);
  const [doctorCount, setDoctorCount] = useState(null);
  const [editing,     setEditing]     = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [form,        setForm]        = useState(EMPTY_FORM);
  const [services,    setServices]    = useState([]);
  const [newService,  setNewService]  = useState("");
  const [toast,       setToast]       = useState(null);

  // Images
  const [bannerFile,    setBannerFile]    = useState(null);
  const [bannerPreview, setBannerPreview] = useState(null);
  const [logoFile,      setLogoFile]      = useState(null);
  const [logoPreview,   setLogoPreview]   = useState(null);
  const [gallery,       setGallery]       = useState([]);
  const [photoBusy,     setPhotoBusy]     = useState(false);

  // OTP state for a mobile change
  const [origMobile,  setOrigMobile]  = useState("");
  const [otp,         setOtp]         = useState("");
  const [otpSent,     setOtpSent]     = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpLoading,  setOtpLoading]  = useState(false);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // ── Auth + load ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const token   = localStorage.getItem("access");
    const userRaw = localStorage.getItem("user");
    if (!token || !userRaw) { navigate("/Hlogin"); return; }
    let user;
    try { user = JSON.parse(userRaw); } catch { navigate("/Hlogin"); return; }
    if (user.role !== "hospital" || !user.hospital) { navigate("/Hlogin"); return; }

    // Seed from the stored (minimal) hospital for an instant render…
    const hydrate = (h) => {
      setHospital(h);
      setOrigMobile(h.mobile || "");
      setForm({
        name: h.name || "", city: h.city || "", address: h.address || "", location: h.location || "", mobile: h.mobile || "",
        latitude: h.latitude ?? null, longitude: h.longitude ?? null,
        instagram: h.instagram || "", youtube: h.youtube || "", facebook: h.facebook || "",
        description: h.description || "", announcement: h.announcement || "", open_time: h.open_time || "", close_time: h.close_time || "",
      });
      setServices(Array.isArray(h.services) ? h.services : []);
      setBannerPreview(h.image || null);
      setLogoPreview(h.logo || null);
      setGallery(Array.isArray(h.gallery) ? h.gallery : []);
    };
    hydrate(user.hospital);

    // …then fetch the FULL record. The login payload omits services,
    // description, gallery, hours, socials — without this, saving would
    // overwrite existing data with blanks.
    API.get(`/hospitals/${user.hospital.id}/`)
      .then(({ data }) => {
        hydrate(data);
        try {
          const raw = localStorage.getItem("user");
          if (raw) {
            const u = JSON.parse(raw);
            u.hospital = { ...u.hospital, ...data };
            localStorage.setItem("user", JSON.stringify(u));
          }
        } catch { /* ignore */ }
      })
      .catch(() => {});

    API.get(`/doctors/?hospital=${user.hospital.id}`)
      .then(({ data }) => setDoctorCount((Array.isArray(data) ? data : data?.results || []).length))
      .catch(() => {});
  }, [navigate]);

  const setField      = (field, value) => setForm(p => ({ ...p, [field]: value }));
  const mobileChanged = form.mobile.trim() !== origMobile;
  const isValidMobile = (m) => /^[6-9]\d{9}$/.test(m.trim());

  // ── OTP for a mobile change ─────────────────────────────────────────────────
  const sendOtp = async () => {
    if (!isValidMobile(form.mobile)) { showToast("Enter a valid 10-digit mobile number.", "error"); return; }
    setOtpLoading(true);
    try {
      await API.post("/auth/otp/request/", { mobile: form.mobile.trim(), via: "sms" });
      setOtpSent(true); setOtpVerified(false);
      showToast("OTP sent to the new number.");
    } catch (err) {
      showToast(err?.response?.data?.message || "Could not send OTP. Try again.", "error");
    } finally { setOtpLoading(false); }
  };

  const verifyOtp = async () => {
    if (!otp.trim()) return;
    setOtpLoading(true);
    try {
      const { data } = await API.post("/auth/otp/verify/", { mobile: form.mobile.trim(), otp: otp.trim() });
      if (data?.verified) { setOtpVerified(true); showToast("✅ New mobile verified."); }
      else showToast("Invalid OTP. Please check and try again.", "error");
    } catch (err) {
      showToast(err?.response?.data?.message || "Invalid OTP. Please try again.", "error");
    } finally { setOtpLoading(false); }
  };

  // ── Image pickers (banner / logo) ───────────────────────────────────────────
  const pickImage = (e, type) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { showToast("Image size must be less than 5MB", "error"); return; }
    if (!file.type.startsWith("image/")) { showToast("Please select a valid image file", "error"); return; }
    const preview = URL.createObjectURL(file);
    if (type === "banner") { setBannerFile(file); setBannerPreview(preview); }
    else                   { setLogoFile(file);   setLogoPreview(preview); }
  };

  // ── Gallery photos upload/delete immediately (separate from the text save) ──
  const addPhoto = async (e) => {
    const file = e.target.files[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file || !hospital) return;
    if (file.size > 5 * 1024 * 1024) { showToast("Image size must be less than 5MB", "error"); return; }
    setPhotoBusy(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const { data } = await API.post(`/hospitals/${hospital.id}/photos/`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setGallery(prev => [{ id: data.id, url: data.url }, ...prev]);
      showToast("Photo added.");
    } catch (err) {
      const status = err?.response?.status;
      if (status === 404 || status === 405) showToast("Photo gallery isn't enabled on the server yet.", "error");
      else showToast(err?.response?.data?.message || "Could not upload photo.", "error");
    } finally { setPhotoBusy(false); }
  };

  const removePhoto = async (photoId) => {
    if (!hospital) return;
    if (!window.confirm("Delete this photo from your gallery?")) return;
    try {
      await API.delete(`/hospitals/${hospital.id}/photos/${photoId}/`);
      setGallery(prev => prev.filter(p => p.id !== photoId));
    } catch (err) {
      showToast(err?.response?.data?.message || "Could not remove photo.", "error");
    }
  };

  // ── Services ────────────────────────────────────────────────────────────────
  const addService = () => {
    const s = newService.trim();
    if (!s) return;
    setServices(prev => (prev.includes(s) ? prev : [...prev, s]));
    setNewService("");
  };
  const removeService = (s) => setServices(prev => prev.filter(x => x !== s));

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!hospital) return;
    if (!form.name.trim()) { showToast("Hospital name is required", "error"); return; }
    if (mobileChanged && !otpVerified) { showToast("Please verify the new mobile number with OTP first.", "error"); return; }
    setSaving(true);
    try {
      const body = {
        name:      form.name.trim(),
        city:      form.city.trim(),
        address:   form.address.trim(),
        location:  form.location.trim(),
        latitude:  form.latitude,
        longitude: form.longitude,
        instagram: form.instagram.trim(),
        youtube:   form.youtube.trim(),
        facebook:  form.facebook.trim(),
        description:  form.description.trim(),
        announcement: form.announcement.trim(),
        open_time:    form.open_time.trim(),
        close_time:   form.close_time.trim(),
        services,
      };
      if (mobileChanged) body.mobile = form.mobile.trim();
      const { data } = await API.patch(`/hospitals/${hospital.id}/`, body);

      // Upload banner / logo (multipart) if changed.
      let imgData = {};
      if (bannerFile || logoFile) {
        const fd = new FormData();
        if (bannerFile) fd.append("image", bannerFile);
        if (logoFile)   fd.append("logo",  logoFile);
        const res = await API.patch(`/hospitals/${hospital.id}/`, fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        imgData = res.data || {};
        setBannerFile(null); setLogoFile(null);
      }

      const updated = { ...hospital, ...data, ...imgData, services, gallery };
      setHospital(updated);
      setOrigMobile(updated.mobile || "");
      setBannerPreview(updated.image || null);
      setLogoPreview(updated.logo || null);
      setOtpSent(false); setOtpVerified(false); setOtp("");

      // Persist back into the stored user so the dashboard shows the new name.
      try {
        const raw = localStorage.getItem("user");
        if (raw) {
          const user = JSON.parse(raw);
          user.hospital = updated;
          localStorage.setItem("user", JSON.stringify(user));
        }
      } catch { /* ignore */ }

      setEditing(false);
      showToast("✅ Hospital details updated.");
    } catch (err) {
      const status = err?.response?.status;
      if (status === 404 || status === 405 || status === 403) {
        showToast("Editing isn't enabled on the server yet. Please contact support.", "error");
      } else {
        showToast(err?.response?.data?.message || "Could not save. Please try again.", "error");
      }
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    if (!hospital) return;
    setEditing(false);
    setForm({
      name: hospital.name || "", city: hospital.city || "", address: hospital.address || "", location: hospital.location || "", mobile: hospital.mobile || "",
      latitude: hospital.latitude ?? null, longitude: hospital.longitude ?? null,
      instagram: hospital.instagram || "", youtube: hospital.youtube || "", facebook: hospital.facebook || "",
      description: hospital.description || "", announcement: hospital.announcement || "", open_time: hospital.open_time || "", close_time: hospital.close_time || "",
    });
    setServices(Array.isArray(hospital.services) ? hospital.services : []);
    setBannerFile(null); setBannerPreview(hospital.image || null);
    setLogoFile(null);   setLogoPreview(hospital.logo || null);
    setNewService("");
    setOtpSent(false); setOtpVerified(false); setOtp("");
  };

  const confirmLogout = () => {
    if (window.confirm("Are you sure you want to logout?")) logoutUser();
  };

  if (!hospital) {
    return (
      <div className="min-vh-100 d-flex align-items-center justify-content-center bg-light">
        <div className="spinner-border text-primary" />
      </div>
    );
  }

  const st = STATUS_STYLE[(hospital.status || "").toLowerCase()] || STATUS_STYLE.pending;
  const initials = (hospital.name || "H").split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
  const validImg = (u) => u && !String(u).includes("placehold");

  return (
    <div className="min-vh-100 bg-light">

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
          padding: "12px 24px", borderRadius: 12,
          background: toast.type === "error" ? "#A32D2D" : "#3B6D11",
          color: "#fff", fontSize: 14, fontWeight: 500, zIndex: 9999,
          maxWidth: "90vw", textAlign: "center",
          boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
        }}>
          {toast.msg}
        </div>
      )}

      {/* Navbar */}
      <nav className="navbar bg-white shadow-sm px-4 py-2">
        <div className="d-flex align-items-center gap-2">
          <button className="btn btn-link text-decoration-none p-0 me-2" onClick={() => navigate("/Hdashboard")}>← Back</button>
          <span className="fw-bold text-primary">Hospital Profile</span>
        </div>
        <button className="btn btn-outline-danger btn-sm" onClick={confirmLogout}>Logout</button>
      </nav>

      <div className="container py-4" style={{ maxWidth: 720 }}>

        {/* Identity card */}
        <div className="card shadow-sm border-0 p-4 mb-4 text-center">
          <div className="mx-auto mb-3 d-flex align-items-center justify-content-center"
               style={{ width: 76, height: 76, borderRadius: 20, background: "#185FA5", color: "#fff", fontSize: 26, fontWeight: 800 }}>
            {initials}
          </div>
          <h4 className="fw-bold mb-1">{hospital.name}</h4>
          <div className="text-muted mb-2">📱 {hospital.mobile || "—"}</div>
          <div>
            <span className={`badge bg-${st.cls}-subtle text-${st.cls} border border-${st.cls}-subtle px-3 py-2`}>{st.label}</span>
          </div>
        </div>

        {/* Details / edit */}
        <div className="card shadow-sm border-0 p-4 mb-4">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h6 className="fw-bold mb-0">Hospital Details</h6>
            {!editing && (
              <button className="btn btn-sm btn-outline-primary" onClick={() => setEditing(true)}>✏️ Edit</button>
            )}
          </div>

          {editing ? (
            <>
              {/* Banner + logo */}
              <label className="form-label fw-semibold small">🖼️ Banner Image (16:9)</label>
              {validImg(bannerPreview) ? (
                <img src={bannerPreview} alt="Banner" className="w-100 rounded mb-2" style={{ height: 140, objectFit: "cover" }} />
              ) : (
                <div className="rounded mb-2 d-flex align-items-center justify-content-center bg-light" style={{ height: 110, fontSize: 30 }}>🏥</div>
              )}
              <input type="file" accept="image/*" className="form-control mb-3" onChange={(e) => pickImage(e, "banner")} />

              <label className="form-label fw-semibold small">⭕ Logo (square)</label>
              <div className="d-flex align-items-center gap-3 mb-3">
                {validImg(logoPreview) ? (
                  <img src={logoPreview} alt="Logo" className="rounded" style={{ width: 60, height: 60, objectFit: "cover", border: "2px solid #cfe2f3" }} />
                ) : (
                  <div className="rounded d-flex align-items-center justify-content-center bg-light" style={{ width: 60, height: 60, fontSize: 22 }}>🏥</div>
                )}
                <input type="file" accept="image/*" className="form-control" onChange={(e) => pickImage(e, "logo")} />
              </div>

              <label className="form-label fw-semibold small">Hospital Name *</label>
              <input className="form-control mb-3" value={form.name} onChange={e => setField("name", e.target.value)} placeholder="Hospital name" />

              <label className="form-label fw-semibold small">City / Location</label>
              <LocationSearch
                value={form.city}
                inputClassName="form-control"
                icon={null}
                placeholder="Search your city or area…"
                onChangeText={(t) => setForm(prev => ({ ...prev, city: t, latitude: null, longitude: null }))}
                onPick={({ city, label, lat, lng }) => setForm(prev => ({
                  ...prev,
                  city: city || prev.city,
                  location: prev.location || label,
                  latitude: lat,
                  longitude: lng,
                }))}
              />
              {form.latitude != null && (
                <div className="text-success small mt-1 mb-2">✓ Location pinned on the map</div>
              )}
              <div className="mb-3" />

              <label className="form-label fw-semibold small">Address</label>
              <textarea className="form-control mb-3" rows={2} value={form.address} onChange={e => setField("address", e.target.value)} placeholder="Full address" />

              <label className="form-label fw-semibold small">📍 Maps Location (Google Maps link or landmark)</label>
              <input className="form-control mb-3" value={form.location} onChange={e => setField("location", e.target.value)} placeholder="https://maps.google.com/… or landmark" />

              <label className="form-label fw-semibold small">Mobile Number</label>
              <input
                className="form-control mb-2" type="tel" maxLength={10}
                value={form.mobile}
                onChange={e => { setField("mobile", e.target.value.replace(/\D/g, "").slice(0, 10)); setOtpSent(false); setOtpVerified(false); }}
                placeholder="10-digit mobile"
              />

              {mobileChanged && !otpVerified && (
                <div className="border rounded p-3 mb-3" style={{ background: "#EAF3FF", borderColor: "#cfe2f3" }}>
                  <div className="small text-primary mb-2">Changing the hospital mobile requires OTP verification.</div>
                  {!otpSent ? (
                    <button className="btn btn-primary btn-sm w-100" onClick={sendOtp} disabled={otpLoading}>
                      {otpLoading ? <span className="spinner-border spinner-border-sm" /> : "Send OTP to new number"}
                    </button>
                  ) : (
                    <>
                      <div className="d-flex gap-2 mb-2">
                        <input className="form-control" type="tel" maxLength={6} value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ""))} placeholder="Enter OTP" />
                        <button className="btn btn-primary" onClick={verifyOtp} disabled={otpLoading}>
                          {otpLoading ? <span className="spinner-border spinner-border-sm" /> : "Verify"}
                        </button>
                      </div>
                      <button className="btn btn-link btn-sm p-0" onClick={sendOtp}>Resend OTP</button>
                    </>
                  )}
                </div>
              )}
              {mobileChanged && otpVerified && <div className="text-success fw-semibold small mb-3">✓ New mobile verified</div>}

              <label className="form-label fw-semibold small">ℹ️ About the Hospital (shown to patients)</label>
              <textarea className="form-control mb-3" rows={3} value={form.description} onChange={e => setField("description", e.target.value)} placeholder="Describe your hospital, specialities and what you provide…" />

              <label className="form-label fw-semibold small">📢 Announcement / Notice (shown to patients)</label>
              <textarea className="form-control mb-3" rows={2} maxLength={300} value={form.announcement} onChange={e => setField("announcement", e.target.value)} placeholder="e.g. Dr. Ravi on leave this Friday" />

              <label className="form-label fw-semibold small">🕐 Working Hours (24h, e.g. 09:00 – 18:00)</label>
              <div className="d-flex gap-2 mb-3">
                <input className="form-control" maxLength={5} value={form.open_time} onChange={e => setField("open_time", e.target.value)} placeholder="Open 09:00" />
                <input className="form-control" maxLength={5} value={form.close_time} onChange={e => setField("close_time", e.target.value)} placeholder="Close 18:00" />
              </div>

              <label className="form-label fw-semibold small">📸 Instagram Link</label>
              <input className="form-control mb-3" value={form.instagram} onChange={e => setField("instagram", e.target.value)} placeholder="https://instagram.com/yourhospital" />
              <label className="form-label fw-semibold small">▶️ YouTube Link</label>
              <input className="form-control mb-3" value={form.youtube} onChange={e => setField("youtube", e.target.value)} placeholder="https://youtube.com/@yourhospital" />
              <label className="form-label fw-semibold small">👍 Facebook Link</label>
              <input className="form-control mb-3" value={form.facebook} onChange={e => setField("facebook", e.target.value)} placeholder="https://facebook.com/yourhospital" />

              <label className="form-label fw-semibold small">🏥 Services Offered</label>
              <div className="d-flex gap-2 mb-2">
                <input
                  className="form-control" value={newService}
                  onChange={e => setNewService(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addService(); } }}
                  placeholder="e.g. X-Ray, Pharmacy, ICU"
                />
                <button className="btn btn-primary" onClick={addService}>Add</button>
              </div>
              {services.length > 0 && (
                <div className="d-flex flex-wrap gap-2 mb-3">
                  {services.map(s => (
                    <button key={s} className="btn btn-sm btn-outline-primary rounded-pill" onClick={() => removeService(s)}>
                      {s} ✕
                    </button>
                  ))}
                </div>
              )}

              <div className="d-flex gap-2 mt-2">
                <button className="btn btn-outline-secondary flex-fill" onClick={cancelEdit} disabled={saving}>Cancel</button>
                <button className="btn btn-primary flex-fill" onClick={handleSave} disabled={saving}>
                  {saving ? <span className="spinner-border spinner-border-sm" /> : "Save"}
                </button>
              </div>
            </>
          ) : (
            <>
              {[
                { label: "City",     value: hospital.city     || "—" },
                { label: "Address",  value: hospital.address  || "—" },
                { label: "Location", value: hospital.location || "—" },
                { label: "Mobile",   value: hospital.mobile   || "—" },
                { label: "Doctors",  value: doctorCount == null ? "…" : String(doctorCount) },
                { label: "Hours",    value: (hospital.open_time || hospital.close_time) ? `${hospital.open_time || "—"} – ${hospital.close_time || "—"}` : "—" },
              ].map(({ label, value }) => (
                <div key={label} className="d-flex justify-content-between py-2 border-bottom">
                  <span className="text-muted small">{label}</span>
                  <span className="fw-semibold small text-end" style={{ maxWidth: "65%" }}>{value}</span>
                </div>
              ))}

              {hospital.description && (
                <div className="pt-3">
                  <div className="text-muted small mb-1">About</div>
                  <div className="small">{hospital.description}</div>
                </div>
              )}
              {hospital.announcement && (
                <div className="pt-3">
                  <div className="text-muted small mb-1">📢 Announcement</div>
                  <div className="small">{hospital.announcement}</div>
                </div>
              )}
              {(hospital.instagram || hospital.youtube || hospital.facebook) && (
                <div className="d-flex justify-content-between py-2 border-bottom">
                  <span className="text-muted small">Social</span>
                  <span className="small d-flex gap-2">
                    {hospital.instagram && <a href={hospital.instagram} target="_blank" rel="noreferrer">📸</a>}
                    {hospital.youtube   && <a href={hospital.youtube}   target="_blank" rel="noreferrer">▶️</a>}
                    {hospital.facebook  && <a href={hospital.facebook}  target="_blank" rel="noreferrer">👍</a>}
                  </span>
                </div>
              )}
              {Array.isArray(hospital.services) && hospital.services.length > 0 && (
                <div className="pt-3">
                  <div className="text-muted small mb-2">Services</div>
                  <div className="d-flex flex-wrap gap-2">
                    {hospital.services.map(s => (
                      <span key={s} className="badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill px-3 py-2">{s}</span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Photo gallery */}
        <div className="card shadow-sm border-0 p-4 mb-4">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h6 className="fw-bold mb-0">Photo Gallery</h6>
            <label className="btn btn-sm btn-outline-primary mb-0">
              {photoBusy ? <span className="spinner-border spinner-border-sm" /> : "＋ Add Photo"}
              <input type="file" accept="image/*" hidden onChange={addPhoto} disabled={photoBusy} />
            </label>
          </div>
          {gallery.length === 0 ? (
            <p className="text-muted small mb-0">No photos yet. Add facility photos patients can see.</p>
          ) : (
            <div className="d-flex gap-2 overflow-auto pb-2">
              {gallery.map(p => (
                <div key={p.id} style={{ position: "relative", flexShrink: 0 }}>
                  <img src={p.url} alt="Facility" className="rounded" style={{ width: 120, height: 90, objectFit: "cover", border: "1px solid #e0e0e0" }} />
                  <button
                    onClick={() => removePhoto(p.id)}
                    style={{ position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: 11, border: "none", background: "rgba(163,45,45,0.9)", color: "#fff", fontSize: 11, fontWeight: 700, lineHeight: 1 }}
                    title="Remove photo"
                  >✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Operations */}
        <div className="card shadow-sm border-0 p-4 mb-4">
          <h6 className="fw-bold mb-3">Operations</h6>
          {[
            { icon: "🏥", label: "Queue & Doctors Dashboard", onClick: () => navigate("/Hdashboard") },
            { icon: "🔑", label: "Change Password",           onClick: () => navigate("/Hforgot-password") },
            { icon: "📞", label: "Contact Support",           onClick: () => { window.location.href = "mailto:support@tokenwalla.com"; } },
          ].map(({ icon, label, onClick }) => (
            <button key={label} className="btn btn-light w-100 d-flex align-items-center gap-3 py-2 border-bottom text-start" onClick={onClick}>
              <span style={{ fontSize: 18 }}>{icon}</span>
              <span className="flex-grow-1">{label}</span>
              <span className="text-muted">›</span>
            </button>
          ))}
        </div>

        <button className="btn btn-outline-danger w-100 py-2" onClick={confirmLogout}>🚪 Logout</button>
      </div>
    </div>
  );
};

export default Hprofile;
