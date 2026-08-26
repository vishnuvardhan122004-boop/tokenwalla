import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import API from "../services/api";
import { logoutUser } from "../services/api";
import QRScanner from './QRScanner';
import HPayments from './HPayments';
import SPECIALIZATION_OPTIONS from '../services/specializations';
import { useVisiblePolling } from '../services/useVisiblePolling';

// Icon stylesheet, pulled in dynamically so its ~14 kB gzip stays out of the
// bundle every patient downloads. See the longer note in Hprofile.js.
import("bootstrap-icons/font/bootstrap-icons.css");

const DEFAULT_SLOTS = [
  "12:00 AM","12:30 AM","01:00 AM","01:30 AM","02:00 AM","02:30 AM",
  "03:00 AM","03:30 AM","04:00 AM","04:30 AM","05:00 AM","05:30 AM",
  "06:00 AM","06:30 AM","07:00 AM","07:30 AM","08:00 AM","08:30 AM",
  "09:00 AM","09:30 AM","10:00 AM","10:30 AM","11:00 AM","11:30 AM",
  "12:00 PM","12:30 PM","01:00 PM","01:30 PM","02:00 PM","02:30 PM",
  "03:00 PM","03:30 PM","04:00 PM","04:30 PM","05:00 PM","05:30 PM",
  "06:00 PM","06:30 PM","07:00 PM","07:30 PM","08:00 PM","08:30 PM",
  "09:00 PM","09:30 PM","10:00 PM","10:30 PM","11:00 PM","11:30 PM",
];

// `label` is plain text and `icon` a Bootstrap Icons class, kept apart so the
// label can still be a React key.
const SLOT_SECTIONS = [
  { label: "Late Night / Early Morning", icon: "bi-moon",       slots: DEFAULT_SLOTS.slice(0, 12) },
  { label: "Morning",                    icon: "bi-sunrise",    slots: DEFAULT_SLOTS.slice(12, 24) },
  { label: "Afternoon",                  icon: "bi-sun",        slots: DEFAULT_SLOTS.slice(24, 32) },
  { label: "Evening",                    icon: "bi-sunset",     slots: DEFAULT_SLOTS.slice(32, 40) },
  { label: "Night",                      icon: "bi-moon-stars", slots: DEFAULT_SLOTS.slice(40, 48) },
];

const DAYS_OF_WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Mirrors backend/tokenwalla/utils.py — a mobile is the only thing WhatsApp can
// reach; a landline is a call-us number for clinics that have nothing else.
const MOBILE_RE   = /^[6-9][0-9]{9}$/;
const LANDLINE_RE = /^0[1-9][0-9]{1,3}[- ]?[0-9]{6,8}$/;

const EMPTY_DOCTOR = {
  name: "", specialization: "", keywords: "", experience: "",
  mobile: "", landline: "", available: true, fee: "", slots: [], days: [], max_per_slot: 10,
};

const EMPTY_ERRORS = {
  name: "", specialization: "", mobile: "", landline: "", experience: "",
  fee: "", max_per_slot: "", slots: "", days: "",
};

const validate = (formData) => {
  const errors = { ...EMPTY_ERRORS };
  let valid = true;
  if (!formData.name.trim()) { errors.name = "Doctor name is required"; valid = false; }
  else if (formData.name.trim().length < 2) { errors.name = "Name must be at least 2 characters"; valid = false; }
  if (!formData.specialization.trim()) { errors.specialization = "Specialization is required"; valid = false; }
  const mobile   = formData.mobile.trim();
  const landline = formData.landline.trim();
  if (mobile && !MOBILE_RE.test(mobile)) { errors.mobile = "Enter a valid 10-digit Indian mobile number"; valid = false; }
  if (landline && !LANDLINE_RE.test(landline)) { errors.landline = "Enter a valid landline with the STD code, e.g. 08812-234567"; valid = false; }
  if (!mobile && !landline) { errors.mobile = "Enter a mobile number or a landline"; valid = false; }
  if (formData.experience !== "" && (isNaN(formData.experience) || Number(formData.experience) < 0))
    { errors.experience = "Experience must be a positive number"; valid = false; }
  if (formData.fee !== "" && (isNaN(formData.fee) || Number(formData.fee) < 0))
    { errors.fee = "Fee must be a positive number"; valid = false; }
  if (formData.max_per_slot !== "" && (isNaN(formData.max_per_slot) || Number(formData.max_per_slot) < 1))
    { errors.max_per_slot = "Must be at least 1 patient per slot"; valid = false; }
  // No slot requirement on purpose: a single-doctor clinic that runs on walk-ins
  // cannot promise a time. Zero slots lists the doctor without online booking —
  // patients see the hospital's hours and call. Days still matter (which days
  // the doctor sits at all), so they stay required.
  if (formData.days.length === 0) { errors.days = "Select at least one available day"; valid = false; }
  return { errors, valid };
};

const Hdashboard = () => {
  const navigate = useNavigate();

  const [hospital,             setHospital]             = useState(null);
  const [activeTab,            setActiveTab]            = useState("queue");
  // Which day's bookings the queue shows. The queue endpoint returns bookings
  // from ALL dates mixed together, so staff need to split them by day.
  const [dayFilter,            setDayFilter]            = useState("today");
  const [tokenDetail,          setTokenDetail]          = useState(null);
  const [queue,                setQueue]                = useState({ waiting: [], onHold: [], inProgress: [], completed: [] });
  const [doctors,              setDoctors]              = useState([]);
  const [scans,                setScans]                = useState([]);
  const [scanForm,             setScanForm]             = useState(null);   // null = closed
  const [scanSaving,           setScanSaving]           = useState(false);
  const [uploadingFor,         setUploadingFor]         = useState(null);
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
  const [toggling,             setToggling]             = useState(new Set());
  const [toast,                setToast]                = useState(null);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // ── Auth check ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const token   = localStorage.getItem("access");
    const userRaw = localStorage.getItem("user");
    if (!token || !userRaw) { navigate("/Hlogin"); return; }
    try {
      const user = JSON.parse(userRaw);
      if (user.role !== "hospital") { navigate("/Hlogin"); return; }
      if (!user.hospital) { navigate("/Hlogin"); return; }
      setHospital(user.hospital);
    } catch { navigate("/Hlogin"); }
  }, [navigate]);

  // ── Load Queue ──────────────────────────────────────────────────────────────
  const loadQueue = async () => {
    if (!hospital) return;
    try {
      const { data } = await API.get(`/bookings/queue/${hospital.id}/`);
      setQueue({
        waiting:    data.waiting    || [],
        onHold:     data.onHold     || [],
        inProgress: data.inProgress || [],
        completed:  data.completed  || [],
      });
    } catch (err) {
      console.warn("Queue load failed:", err?.response?.status, err?.response?.data);
    }
  };

  // ── Load Doctors ────────────────────────────────────────────────────────────
  const loadDoctors = async () => {
    if (!hospital) return;
    setLoading(true);
    try {
      const { data } = await API.get(`/doctors/?hospital=${hospital.id}`);
      setDoctors(Array.isArray(data) ? data : data?.results || []);
    } catch {
      console.warn("Doctors load failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!hospital) return;
    loadQueue();
    loadDoctors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hospital]);

  // What this account SELLS, from the login payload. Falls back to the segment
  // its `kind` implies, so a session opened against an older backend — which
  // sends no `segments` — behaves exactly as it did before capabilities.
  const KIND_TO_SEGMENT = { HOSPITAL: 'CONSULT', SCAN_CENTER: 'SCAN', BLOOD_CENTER: 'BLOOD' };
  const segments = Array.isArray(hospital?.segments) && hospital.segments.length
    ? hospital.segments
    : [KIND_TO_SEGMENT[hospital?.kind] || 'CONSULT'];

  const sellsConsults = segments.includes('CONSULT');
  const sellsScans    = segments.includes('SCAN');
  const sellsBlood    = segments.includes('BLOOD');

  // SCAN and BLOOD collapse into ONE switcher entry: a Scan row carries no
  // segment of its own, so splitting them here would show the same rows twice.
  // The patient-facing lists still tell them apart — that is answered on the
  // server from the capabilities — and this is only about editing the price list.
  const scanLabel = sellsScans && sellsBlood ? 'Scans & Tests'
                  : sellsBlood               ? 'Tests'
                  : 'Scans';
  const providerTabs = [
    ...(sellsConsults ? [{ key: 'CONSULT', label: 'Doctors', icon: 'bi-person-badge' }] : []),
    ...(sellsScans || sellsBlood
      ? [{ key: 'SERVICES', label: scanLabel,
           icon: sellsBlood && !sellsScans ? 'bi-droplet' : 'bi-clipboard2-pulse' }]
      : []),
  ];
  const [segTab, setSegTab] = useState(providerTabs[0]?.key || 'CONSULT');
  // Never leave the switcher pointing at something no longer sold.
  const seg = providerTabs.some(t => t.key === segTab)
    ? segTab : (providerTabs[0]?.key || 'CONSULT');

  const isCentre = seg !== 'CONSULT';     // this tab manages Scans, not Doctors
  const isHybrid = providerTabs.length > 1;
  // Blood-only accounts say "test"; anyone selling scans at all says "scan".
  const unit = sellsBlood && !sellsScans
    ? { one: 'test', many: 'Tests', icon: 'bi-droplet',
        eg: 'e.g. Complete Blood Count', egType: 'Blood Test',
        egPrep: 'e.g. 12 hours fasting. Water is fine.' }
    : { one: 'scan', many: 'Scans', icon: 'bi-clipboard2-pulse',
        eg: 'e.g. MRI Brain', egType: 'MRI',
        egPrep: 'e.g. Do not eat for 8 hours. Remove all metal objects.' };
  const Unit = unit.one[0].toUpperCase() + unit.one.slice(1);

  const fetchScans = async () => {
    if (!hospital?.id) return;
    try {
      const { data } = await API.get('/scans/', { params: { center: hospital.id } });
      setScans(Array.isArray(data) ? data : (data.results || []));
    } catch {
      setScans([]);
    }
  };

  useEffect(() => {
    if ((sellsScans || sellsBlood) && activeTab === 'doctors') fetchScans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCentre, activeTab, hospital?.id]);

  const saveScan = async (e) => {
    e.preventDefault();
    if (!scanForm) return;
    setScanSaving(true);
    const payload = {
      center: hospital.id,
      name: (scanForm.name || '').trim(),
      modality: (scanForm.modality || '').trim(),
      price: Number(scanForm.price) || 0,
      duration_minutes: Number(scanForm.duration_minutes) || 15,
      max_per_slot: Number(scanForm.max_per_slot) || 1,
      prep_instructions: scanForm.prep_instructions || '',
      available: scanForm.available !== false,
      payment_collection_mode:
        scanForm.payment_collection_mode === 'FULL' ? 'FULL' : 'SERVICE_ONLY',
      // Comma-separated in the form, arrays on the wire — same shapes as Doctor.
      slots: (scanForm.slotsText || '').split(',').map(v => v.trim()).filter(Boolean),
      days:  (scanForm.daysText  || '').split(',').map(v => v.trim()).filter(Boolean),
    };
    try {
      if (scanForm.id) await API.patch(`/scans/${scanForm.id}/`, payload);
      else             await API.post('/scans/', payload);
      setScanForm(null);
      await fetchScans();
      setToast({ type: 'success', msg: scanForm.id ? 'Scan updated' : 'Scan added' });
    } catch (err) {
      const errs = err?.response?.data?.errors;
      setToast({
        type: 'error',
        msg: errs ? Object.values(errs).flat().join(' ') : 'Could not save the scan.',
      });
    } finally {
      setScanSaving(false);
    }
  };

  // Upload a result file for a completed scan booking. The patient is notified
  // by the server (push now, WhatsApp once the template is approved); this
  // screen never sees the file again — reports are served only through the
  // ownership-checked download endpoint.
  const uploadReport = async (booking, file) => {
    if (!file) return;
    setUploadingFor(booking.id);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('title', `${booking.doctor_name || 'Scan'} report`);
    try {
      await API.post(`/bookings/${booking.id}/reports/`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setToast({ type: 'success', msg: 'Report uploaded — the patient has been notified.' });
    } catch (err) {
      setToast({
        type: 'error',
        msg: err?.response?.data?.message || 'Could not upload the report.',
      });
    } finally {
      setUploadingFor(null);
    }
  };

  const deleteScan = async (scan) => {
    if (!window.confirm(`Remove "${scan.name}" from your list?`)) return;
    try {
      await API.delete(`/scans/${scan.id}/`);
      await fetchScans();
      setToast({ type: 'success', msg: 'Scan removed' });
    } catch {
      setToast({ type: 'error', msg: 'Could not remove the scan.' });
    }
  };

  // Poll the queue only while the tab is actually being looked at. A reception
  // desk leaves this dashboard open all day behind other windows; a plain
  // setInterval kept hitting /bookings/queue/:id/ every 10s regardless, and
  // polling — not bookings — is the dominant load (CAPACITY.md §2).
  // The hook keeps its own ref to the callback, so passing a fresh function
  // each render doesn't restart the timer.
  useVisiblePolling(loadQueue, 10000, !!hospital);

  // ── Queue Actions ───────────────────────────────────────────────────────────
  const handleCall     = async (id) => {
    try { await API.patch(`/bookings/call/${id}/`);     loadQueue(); }
    catch (err) { showToast(err?.response?.data?.message || "Failed to call patient", "error"); }
  };
  const handleComplete = async (id) => {
    try { await API.patch(`/bookings/complete/${id}/`); loadQueue(); }
    catch (err) { showToast(err?.response?.data?.message || "Failed to complete booking", "error"); }
  };
  // Skip a patient who isn't ready without cancelling them. The same endpoint
  // toggles: waiting → held (hold), held → waiting (resume).
  const handleHold    = async (id) => {
    try { await API.patch(`/bookings/hold/${id}/`); loadQueue(); }
    catch (err) { showToast(err?.response?.data?.message || "Failed to update hold status", "error"); }
  };
  // Patient never turned up — drops them from the queue (can't be undone here).
  const handleNoShow  = async (id) => {
    if (!window.confirm("Mark this patient as no-show?\nThey will be removed from the queue.")) return;
    try {
      await API.patch(`/bookings/no-show/${id}/`);
      setTokenDetail(null);
      loadQueue();
      showToast("Marked as no-show.");
    } catch (err) { showToast(err?.response?.data?.message || "Failed to mark no-show", "error"); }
  };

  // ── Toggle Availability ─────────────────────────────────────────────────────
  const toggleAvailability = async (doctor) => {
    const newVal = !doctor.available;
    const docId  = doctor.id;

    setDoctors(prev => prev.map(d => d.id === docId ? { ...d, available: newVal } : d));
    setToggling(prev => new Set(prev).add(docId));

    try {
      const { data } = await API.patch(
        `/doctors/${docId}/`,
        { available: newVal },
        { headers: { "Content-Type": "application/json" } }
      );
      setDoctors(prev => prev.map(d => d.id === docId ? { ...d, ...data } : d));
      showToast(`${doctor.name} is now ${newVal ? "available" : "unavailable"}`);
    } catch (err) {
      setDoctors(prev => prev.map(d => d.id === docId ? { ...d, available: !newVal } : d));
      showToast(err?.response?.data?.message || "Failed to update availability.", "error");
    } finally {
      setToggling(prev => { const s = new Set(prev); s.delete(docId); return s; });
    }
  };

  // ── Image Change ────────────────────────────────────────────────────────────
  const handleImageChange = (e, type) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { showToast("Image size must be less than 5MB", "error"); return; }
    if (!file.type.startsWith("image/")) { showToast("Please select a valid image file", "error"); return; }
    const preview = URL.createObjectURL(file);
    if (type === "doctor") { setDoctorImage(file);   setDoctorImagePreview(preview); }
    else                   { setHospitalImage(file); setHospitalImagePreview(preview); }
  };

  // ── Open Forms ──────────────────────────────────────────────────────────────
  const openAddForm = () => {
    setEditDoctor(null);
    setFormData(EMPTY_DOCTOR);
    setErrors(EMPTY_ERRORS);
    setDoctorImage(null);       setDoctorImagePreview(null);
    setHospitalImage(null);     setHospitalImagePreview(null);
    setShowForm(true);
  };

  const openEditForm = (doctor) => {
    setEditDoctor(doctor);
    setFormData({
      name:           doctor.name           || "",
      specialization: doctor.specialization || "",
      keywords:       doctor.keywords       || "",
      experience:     doctor.experience     || "",
      mobile:         doctor.mobile         || "",
      landline:       doctor.landline       || "",
      available:      doctor.available      ?? true,
      fee:            doctor.fee            ?? "",
      slots:          doctor.slots          || [],
      days:           doctor.days           || [],
      max_per_slot:   doctor.max_per_slot   || 10,
    });
    setErrors(EMPTY_ERRORS);
    setDoctorImagePreview(doctor.image          || null);
    setHospitalImagePreview(doctor.hospital_image || null);
    setDoctorImage(null);
    setHospitalImage(null);
    setShowForm(true);
  };

  const toggleSlot = (slot) => {
    setFormData(prev => ({
      ...prev,
      slots: prev.slots.includes(slot)
        ? prev.slots.filter(s => s !== slot)
        : [...prev.slots, slot],
    }));
    if (errors.slots) setErrors(prev => ({ ...prev, slots: "" }));
  };

  const toggleDay = (day) => {
    setFormData(prev => ({
      ...prev,
      days: prev.days.includes(day)
        ? prev.days.filter(d => d !== day)
        : [...prev.days, day],
    }));
    if (errors.days) setErrors(prev => ({ ...prev, days: "" }));
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: "" }));
  };

  // ── Submit Doctor Form ──────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    const { errors: newErrors, valid } = validate(formData);
    if (!valid) { setErrors(newErrors); return; }

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("name",           formData.name.trim());
      fd.append("specialization", formData.specialization.trim());
      fd.append("keywords",       formData.keywords.trim());
      fd.append("experience",     Number(formData.experience)  || 0);
      fd.append("mobile",         formData.mobile.trim());
      fd.append("landline",       formData.landline.trim());
      fd.append("available",      formData.available);
      fd.append("fee",            Number(formData.fee) || 0);
      fd.append("max_per_slot",   Number(formData.max_per_slot) || 10);
      fd.append("slots",          JSON.stringify(formData.slots));
      fd.append("days",           JSON.stringify(formData.days));

      if (!editDoctor) {
        fd.append("hospital", hospital.id);
        fd.append("city",     hospital.city || "");
      }

      if (doctorImage)   fd.append("image",          doctorImage);
      if (hospitalImage) fd.append("hospital_image", hospitalImage);

      if (editDoctor) {
        await API.patch(`/doctors/${editDoctor.id}/`, fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        showToast("Doctor updated successfully!");
      } else {
        await API.post("/doctors/", fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        showToast("Doctor added successfully!");
      }

      setShowForm(false);
      setFormData(EMPTY_DOCTOR);
      setErrors(EMPTY_ERRORS);
      setEditDoctor(null);
      setDoctorImage(null);     setDoctorImagePreview(null);
      setHospitalImage(null);   setHospitalImagePreview(null);
      loadDoctors();

    } catch (err) {
      const apiErrors = err?.response?.data?.errors;
      if (apiErrors) {
        const msg = Object.entries(apiErrors)
          .map(([field, msgs]) => `${field}: ${Array.isArray(msgs) ? msgs.join(", ") : msgs}`)
          .join("\n");
        showToast("Validation errors:\n" + msg, "error");
      } else {
        showToast(err?.response?.data?.message || "Failed to save doctor", "error");
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ── Delete ──────────────────────────────────────────────────────────────────
  const handleDelete = async (id) => {
    if (!window.confirm("Delete this doctor?")) return;
    try {
      await API.delete(`/doctors/${id}/`);
      loadDoctors();
      showToast("Doctor deleted.");
    } catch (err) {
      const data = err?.response?.data;
      showToast(data?.message || data?.error || "Failed to delete doctor", "error");
    }
  };

  const logout      = () => logoutUser();

  // ── Day filtering (Today / Tomorrow / All) ──────────────────────────────────
  // Local calendar dates as "YYYY-MM-DD" to match the backend's date strings.
  const toYMD       = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const todayYMD    = toYMD(new Date());
  const tomorrowYMD = toYMD(new Date(Date.now() + 86400000));

  const dayLabelFor = (date) => {
    if (!date) return "No date";
    if (date === todayYMD)    return "Today";
    if (date === tomorrowYMD) return "Tomorrow";
    return date;
  };
  const matchesDay  = (p) => dayFilter === "all"
    ? true
    : (p.date || "") === (dayFilter === "today" ? todayYMD : tomorrowYMD);

  const countForDay = (day) => {
    const all = [...queue.waiting, ...queue.onHold, ...queue.inProgress, ...queue.completed];
    if (day === "all") return all.length;
    const target = day === "today" ? todayYMD : tomorrowYMD;
    return all.filter(p => (p.date || "") === target).length;
  };

  const fWaiting    = queue.waiting.filter(matchesDay);
  const fOnHold     = queue.onHold.filter(matchesDay);
  const fInProgress = queue.inProgress.filter(matchesDay);
  const fCompleted  = queue.completed.filter(matchesDay);
  const filteredTotal = fWaiting.length + fOnHold.length + fInProgress.length + fCompleted.length;
  const dayWord     = dayFilter === "all" ? "All" : dayFilter === "today" ? "Today" : "Tomorrow";

  const FieldError  = ({ msg }) => msg
    ? <small style={{ color: '#dc3545', display: 'block', marginTop: 3 }}><i className="bi bi-exclamation-triangle me-1" />{msg}</small>
    : null;

  return (
    <div className="min-vh-100 bg-light tw-dash">

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
          padding: "12px 24px", borderRadius: 12,
          background: toast.type === "error" ? "#A32D2D" : "#3B6D11",
          color: "#fff", fontSize: 14, fontWeight: 500,
          zIndex: 9999, whiteSpace: "nowrap",
          boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
          animation: "fadeInToast 0.3s ease",
        }}>
          {toast.msg}
        </div>
      )}
      <style>{`
        /* Segment switcher — a hybrid manages more than one thing from one tab.
           flex-basis + wrap rather than fixed columns, so a long label like
           "Scans & Tests" takes its own line instead of being squeezed. */
        .seg-switch { display: flex; flex-wrap: wrap; gap: 8px; }
        .seg-btn {
          display: inline-flex; align-items: center; justify-content: center;
          flex: 1 1 140px; border: 1px solid var(--gray-200,#E2E8F0); background: #fff;
          border-radius: 999px; padding: 8px 14px; font-size: 12.5px; font-weight: 700;
          color: var(--gray-500,#64748B); cursor: pointer;
        }
        .seg-btn.is-active { border-color: var(--blue-600,#1565C0); background: var(--blue-50,#EFF6FF); color: var(--blue-700,#12497F); }
        @keyframes fadeInToast{from{opacity:0;transform:translateX(-50%) translateY(8px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}

        /* ── Cleaner navbar ── */
        .tw-navbar{position:sticky;top:0;z-index:1020;background:rgba(255,255,255,.85);backdrop-filter:saturate(180%) blur(8px);-webkit-backdrop-filter:saturate(180%) blur(8px);border-bottom:1px solid #eceef1}
        .tw-back{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border:1px solid #e4e8ec;background:#fff;color:#5b6672;border-radius:10px;font-size:18px;line-height:1;transition:all .15s ease;cursor:pointer}
        .tw-back:hover{background:#f4f6f8;color:#0d6efd;border-color:#d4dbe1}
        .tw-brand{font-weight:700;letter-spacing:-.02em;color:#0d6efd;font-size:16px}
        .tw-hosp{display:inline-flex;align-items:center;gap:6px;background:#f4f6f8;color:#5b6672;font-size:13px;font-weight:500;padding:6px 13px;border-radius:999px}
        .tw-nav-btn{display:inline-flex;align-items:center;gap:5px;border:1px solid #e4e8ec;background:#fff;color:#5b6672;font-size:13px;font-weight:600;padding:7px 15px;border-radius:10px;transition:all .15s ease;cursor:pointer}
        .tw-nav-btn:hover{background:#f4f6f8;color:#212529}
        .tw-nav-btn--danger{color:#A32D2D}
        .tw-nav-btn--danger:hover{background:#fdecec;border-color:#f3c9c9}

        /* ── Cleaner stat cards ── */
        .tw-stat{position:relative;background:#fff;border:1px solid #edf0f2;border-radius:16px;padding:18px 18px 16px 22px;overflow:hidden;transition:transform .15s ease,box-shadow .15s ease}
        .tw-stat:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(16,24,40,.06)}
        .tw-stat__accent{position:absolute;left:0;top:0;bottom:0;width:4px}
        .tw-stat__label{font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#8a94a1;margin:0 0 6px}
        .tw-stat__val{font-size:32px;font-weight:700;line-height:1;letter-spacing:-.02em;margin:0}

        /* ── Segmented tabs ── */
        .tw-tabs{display:inline-flex;gap:4px;background:#f1f3f5;border-radius:12px;padding:4px;flex-wrap:wrap}
        .tw-tab{border:0;background:transparent;color:#5b6672;font-size:14px;font-weight:600;padding:8px 16px;border-radius:9px;transition:all .15s ease;white-space:nowrap;cursor:pointer}
        .tw-tab:hover{color:#212529}
        .tw-tab--active{background:#fff;color:#0d6efd;box-shadow:0 1px 3px rgba(16,24,40,.12)}

        /* Slot picker. Its own class rather than Bootstrap's .d-flex, so the
           mobile grid below can override it without an !important fight. */
        .tw-slotgrid{display:flex;flex-wrap:wrap;gap:.5rem}

        /* ══ MOBILE ══════════════════════════════════════════════════════════
           This screen is run one-handed at a reception desk, so the phone
           layout is the real one, not a fallback. Measured before changing
           anything: 90 tap targets under the 44px minimum (71 of them 31px),
           and the doctor form was 2262px tall with Save at the very bottom. */
        @media (max-width: 767.98px) {
          /* 1. Tap targets. Bootstrap's own sizing is desktop-mouse sized;
                44px is the documented finger minimum on iOS and Android. */
          .tw-dash .btn,
          .tw-dash .form-control,
          .tw-dash .form-select,
          .tw-dash .tw-nav-btn,
          .tw-dash .tw-tab { min-height: 44px; }
          .tw-dash .tw-back { width: 44px; height: 44px; }
          /* The Available switch is the one control staff flip most often. */
          .tw-dash .form-switch .form-check-input { width: 52px; height: 28px; margin-top: 0; }
          .tw-dash .form-switch { display: flex; align-items: center; gap: 10px; min-height: 44px; }
          .tw-dash .btn-sm { min-height: 44px; padding-inline: 14px; }
          .tw-dash .input-group > .form-control { min-height: 44px; }

          /* 2. Tabs as a 2x2 grid rather than a ragged wrap — same height as
                before, nothing pushed off-screen, and each is a full target. */
          .tw-tabs { display: grid; grid-template-columns: 1fr 1fr; width: 100%; gap: 6px; }
          .tw-tab { padding: 10px 8px; font-size: 13px; white-space: normal; }

          /* 3. Header: the hospital name is which ACCOUNT you are logged into,
                which matters more on a shared phone than the wordmark does.
                It was hidden below 576px; show it, truncated. */
          .tw-navbar { padding-inline: 1rem !important; }
          .tw-hosp { display: inline-flex !important; max-width: 42vw; padding: 5px 10px; font-size: 12px; }
          .tw-hosp span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .tw-brand { display: none; }          /* logo already says it */
          .tw-nav-btn { padding: 7px 11px; font-size: 12px; }

          /* 4. Stat cards: 2x2 already, just less air so the queue starts
                above the fold instead of below it. */
          .tw-stat { padding: 13px 13px 12px 17px; border-radius: 13px; }
          .tw-stat__val { font-size: 26px; }
          .tw-stat__label { font-size: 11px; }

          /* 5. Slot picker: 48 chips at 79x31 was the worst offender on the
                page. A fixed grid gives even, thumb-sized targets. */
          .tw-slotgrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
          .tw-slotgrid .btn { min-height: 44px; padding: 6px 4px; font-size: 13px; }

          /* 5b. Day filter: three equal columns so it stays one row once the
                 pills are finger-sized. */
          .tw-dayfilter { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
          .tw-dayfilter .btn { padding-inline: 6px; font-size: 13px; }

          /* 6. Save without scrolling 2,000px back down. */
          .tw-formactions {
            position: sticky; bottom: 0; z-index: 5;
            margin: 0 -1rem -1rem; padding: 12px 1rem;
            background: rgba(255,255,255,.96);
            backdrop-filter: saturate(180%) blur(8px);
            -webkit-backdrop-filter: saturate(180%) blur(8px);
            border-top: 1px solid #eceef1;
          }
          .tw-formactions .btn { width: 100%; }

          /* 7. Doctor cards: the banner ate a third of the screen each, so
                barely one card fit. Half height shows two. */
          .tw-doccard-banner { height: 64px !important; }
          .tw-doccard-banner .tw-doccard-avatar { width: 48px !important; height: 48px !important; bottom: -24px !important; }
        }
      `}</style>

      {/* Token detail popup — handy for reading the token aloud or confirming
          the patient at the counter. */}
      {tokenDetail && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setTokenDetail(null); }}
          style={{
            position: "fixed", inset: 0, zIndex: 9998,
            background: "rgba(0,0,0,0.45)", display: "flex",
            alignItems: "center", justifyContent: "center", padding: 16,
          }}
        >
          <div className="card border-0 shadow-lg p-4" style={{ width: "100%", maxWidth: 360, borderRadius: 16 }}>
            <div className="d-flex justify-content-between align-items-start mb-3">
              <h5 className="fw-bold mb-0 text-primary"><i className="bi bi-ticket-perforated me-2" />Token {tokenDetail.token ?? "—"}</h5>
              <button className="btn-close" onClick={() => setTokenDetail(null)} />
            </div>
            <div className="small mb-1"><span className="text-muted">Patient:</span> <strong>{tokenDetail.user_name || "Patient"}</strong></div>
            {tokenDetail.user_mobile && <div className="small mb-1"><span className="text-muted">Mobile:</span> {tokenDetail.user_mobile}</div>}
            {tokenDetail.doctor_name && <div className="small mb-1"><span className="text-muted">Doctor:</span> {tokenDetail.doctor_name}</div>}
            {tokenDetail.slot && <div className="small mb-1"><span className="text-muted">Slot:</span> {tokenDetail.slot}</div>}
            <div className="small mb-3"><span className="text-muted">Day:</span> {dayLabelFor(tokenDetail.date)}</div>
            {tokenDetail.status !== "COMPLETED" && (
              <button className="btn btn-outline-danger btn-sm w-100" onClick={() => handleNoShow(tokenDetail.id)}>
                <i className="bi bi-slash-circle me-1" />Mark as No-show
              </button>
            )}
          </div>
        </div>
      )}

      {/* Navbar */}
      <nav className="tw-navbar navbar px-4 py-2">
        <div className="d-flex align-items-center gap-2">
          <button className="tw-back" onClick={() => navigate("/")} title="Back to home" aria-label="Back to home">←</button>
          <img src="/logo.png" alt="TW" style={{ width: 32, borderRadius: 8 }} />
          <span className="tw-brand">TokenWalla</span>
        </div>
        <div className="d-flex align-items-center gap-2 gap-md-3">
          <span className="tw-hosp" title={hospital?.name}><i className="bi bi-hospital" /> <span>{hospital?.name}</span></span>
          <button className="tw-nav-btn" onClick={() => navigate("/Hprofile")}><i className="bi bi-person-circle me-1" />Profile</button>
          <button className="tw-nav-btn tw-nav-btn--danger" onClick={logout}>Logout</button>
        </div>
      </nav>

      <div className="container py-4">

        {/* Stats */}
        <div className="row g-3 mb-4">
          {[
            { label: `${dayWord} Total`, val: filteredTotal,  hex: "#2563eb" },
            { label: "Waiting",      val: fWaiting.length,    hex: "#d97706" },
            { label: "In Progress",  val: fInProgress.length, hex: "#0ea5e9" },
            { label: "Completed",    val: fCompleted.length,  hex: "#16a34a" },
          ].map(({ label, val, hex }) => (
            <div key={label} className="col-6 col-md-3">
              <div className="tw-stat">
                <span className="tw-stat__accent" style={{ background: hex }} />
                <p className="tw-stat__label">{label}</p>
                <p className="tw-stat__val" style={{ color: hex }}>{val}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Tabs ── */}
        <div className="tw-tabs mb-4">
          {[
            { key: "queue",    label: <><i className="bi bi-people me-1" />Queue</> },
            isHybrid
              ? { key: "doctors", label: <><i className="bi bi-grid me-1" />Services</> }
              : isCentre
                ? { key: "doctors", label: <><i className={`bi ${unit.icon} me-1`} />{unit.many}</> }
                : { key: "doctors", label: <><i className="bi bi-person-badge me-1" />Doctors</> },
            { key: "payments", label: <><i className="bi bi-credit-card me-1" />Payments</> },
            { key: "scanner",  label: <><i className="bi bi-qr-code-scan me-1" />Scanner</> },
          ].map(({ key, label }) => (
            <button
              key={key}
              className={`tw-tab ${activeTab === key ? "tw-tab--active" : ""}`}
              onClick={() => setActiveTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Queue Tab ── */}
        {activeTab === "queue" && (
          <>
            {/* Day filter: Today / Tomorrow / All — the queue mixes dates, so
                split them for clarity. Each pill shows its count. */}
            <div className="d-flex flex-wrap gap-2 mb-3 tw-dayfilter">
              {[
                { key: "today",    label: <><i className="bi bi-calendar-day me-1" />Today</>,    cls: "primary" },
                { key: "tomorrow", label: <><i className="bi bi-calendar-plus me-1" />Tomorrow</>, cls: "info"    },
                { key: "all",      label: <><i className="bi bi-calendar3 me-1" />All</>,          cls: "secondary" },
              ].map(({ key, label, cls }) => {
                const active = dayFilter === key;
                return (
                  <button
                    key={key}
                    className={`btn btn-sm ${active ? `btn-${cls}` : `btn-outline-${cls}`}`}
                    onClick={() => setDayFilter(key)}
                  >
                    {label}
                    <span className={`badge ms-2 ${active ? "bg-white text-dark" : `bg-${cls}`} ${active ? "" : "text-white"}`}>
                      {countForDay(key)}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="row g-3">
              {/* ── Waiting ── */}
              <div className="col-md-4">
                <div className="card border-0 shadow-sm h-100">
                  <div className="card-header bg-warning text-white fw-bold">
                    <i className="bi bi-hourglass-split me-2" />Waiting ({fWaiting.length})
                  </div>
                  <div className="card-body p-2">
                    {fWaiting.length === 0 && (
                      <p className="text-muted text-center small mt-3">No patients</p>
                    )}
                    {fWaiting.map(p => (
                      <div key={p.id} className="border rounded p-2 mb-2 bg-light">
                        <div className="fw-semibold">{p.user_name || "Patient"}</div>
                        <div className="small text-muted"><i className="bi bi-telephone me-1" />{p.user_mobile || "N/A"}</div>
                        <div className="small text-muted"><i className="bi bi-person-badge me-1" />{p.doctor_name}</div>
                        <div className="small text-muted"><i className="bi bi-clock me-1" />{p.slot}  ·  <i className="bi bi-calendar-event me-1" />{dayLabelFor(p.date)}</div>
                        <button
                          className="btn btn-sm btn-outline-primary py-0 px-2 mt-1"
                          onClick={() => setTokenDetail(p)}
                          title="Tap for details"
                        >
                          <i className="bi bi-ticket-perforated me-1" />Token: {p.token}
                        </button>
                        <button className="btn btn-primary btn-sm w-100 mt-2" onClick={() => handleCall(p.id)}>
                          Call Patient
                        </button>
                        <div className="d-flex gap-1 mt-1">
                          <button className="btn btn-outline-secondary btn-sm flex-grow-1" onClick={() => handleHold(p.id)} title="Skip to next patient">
                            <i className="bi bi-pause me-1" />Hold
                          </button>
                          <button className="btn btn-outline-secondary btn-sm flex-grow-1" onClick={() => setActiveTab("scanner")} title="Open QR Scanner">
                            <i className="bi bi-qr-code-scan me-1" />Scan
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── In Progress ── */}
              <div className="col-md-4">
                <div className="card border-0 shadow-sm h-100">
                  <div className="card-header bg-info text-white fw-bold">
                    <i className="bi bi-arrow-repeat me-2" />In Progress ({fInProgress.length})
                  </div>
                  <div className="card-body p-2">
                    {fInProgress.length === 0 && (
                      <p className="text-muted text-center small mt-3">No patients</p>
                    )}
                    {fInProgress.map(p => (
                      <div key={p.id} className="border rounded p-2 mb-2 bg-light">
                        <div className="fw-semibold">{p.user_name || "Patient"}</div>
                        <div className="small text-muted"><i className="bi bi-person-badge me-1" />{p.doctor_name}</div>
                        <div className="small text-muted"><i className="bi bi-clock me-1" />{p.slot}  ·  <i className="bi bi-calendar-event me-1" />{dayLabelFor(p.date)}</div>
                        <button
                          className="btn btn-sm btn-outline-primary py-0 px-2 mt-1"
                          onClick={() => setTokenDetail(p)}
                          title="Tap for details"
                        >
                          <i className="bi bi-ticket-perforated me-1" />Token: {p.token}
                        </button>
                        <button className="btn btn-success btn-sm w-100 mt-2" onClick={() => handleComplete(p.id)}>
                          Mark Complete
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── Completed ── */}
              <div className="col-md-4">
                <div className="card border-0 shadow-sm h-100">
                  <div className="card-header bg-success text-white fw-bold">
                    <i className="bi bi-check-circle me-2" />Completed ({fCompleted.length})
                  </div>
                  <div className="card-body p-2">
                    {fCompleted.length === 0 && (
                      <p className="text-muted text-center small mt-3">No patients</p>
                    )}
                    {fCompleted.map(p => (
                      <div key={p.id} className="border rounded p-2 mb-2 bg-light">
                        <div className="fw-semibold">{p.user_name || "Patient"}</div>
                        <div className="small text-muted"><i className="bi bi-person-badge me-1" />{p.doctor_name}</div>
                        <div className="small text-muted"><i className="bi bi-clock me-1" />{p.slot}  ·  <i className="bi bi-calendar-event me-1" />{dayLabelFor(p.date)}</div>
                        <button
                          className="btn btn-sm btn-outline-primary py-0 px-2 mt-1"
                          onClick={() => setTokenDetail(p)}
                          title="Tap for details"
                        >
                          <i className="bi bi-ticket-perforated me-1" />Token: {p.token}
                        </button>

                        {/* A scan's journey doesn't end at the visit — the
                            report comes back later. Only offered for scan
                            bookings; a consultation has nothing to upload. */}
                        {isCentre && p.provider_kind === 'SCAN' && (
                          <div className="mt-2">
                            <label className="btn btn-sm btn-outline-success py-0 px-2 mb-0">
                              {uploadingFor === p.id
                                ? 'Uploading…'
                                : <><i className="bi bi-upload me-1" />Upload report</>}
                              <input
                                type="file"
                                accept=".pdf,.jpg,.jpeg,.png"
                                hidden
                                disabled={uploadingFor === p.id}
                                onChange={e => {
                                  uploadReport(p, e.target.files?.[0]);
                                  e.target.value = '';   // allow re-picking the same file
                                }}
                              />
                            </label>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── On Hold (only when someone is held) ── */}
              {fOnHold.length > 0 && (
                <div className="col-12">
                  <div className="card border-0 shadow-sm">
                    <div className="card-header bg-secondary text-white fw-bold">
                      <i className="bi bi-pause-circle me-2" />On Hold ({fOnHold.length})
                    </div>
                    <div className="card-body p-2">
                      <div className="row g-2">
                        {fOnHold.map(p => (
                          <div key={p.id} className="col-md-4">
                            <div className="border rounded p-2 bg-light h-100">
                              <div className="fw-semibold">{p.user_name || "Patient"}</div>
                              <div className="small text-muted"><i className="bi bi-person-badge me-1" />{p.doctor_name}</div>
                              <div className="small text-muted"><i className="bi bi-clock me-1" />{p.slot}  ·  <i className="bi bi-calendar-event me-1" />{dayLabelFor(p.date)}</div>
                              <button
                                className="btn btn-sm btn-outline-primary py-0 px-2 mt-1"
                                onClick={() => setTokenDetail(p)}
                                title="Tap for details"
                              >
                                <i className="bi bi-ticket-perforated me-1" />Token: {p.token}
                              </button>
                              <button className="btn btn-outline-success btn-sm w-100 mt-2" onClick={() => handleHold(p.id)}>
                                ▶ Resume
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Doctors Tab ── */}
        {/* ── Scans Tab (a scanning centre's version of the Doctors tab) ── */}
        {activeTab === "doctors" && isHybrid && (
          <div className="seg-switch mb-3">
            {providerTabs.map(t => (
              <button
                key={t.key}
                type="button"
                className={`seg-btn ${t.key === seg ? 'is-active' : ''}`}
                aria-pressed={t.key === seg}
                onClick={() => setSegTab(t.key)}
              >
                <i className={`bi ${t.icon} me-1`} />
                {t.label} {t.key === 'CONSULT' ? doctors.length : scans.length}
              </button>
            ))}
          </div>
        )}

        {activeTab === "doctors" && isCentre && (
          <>
            <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
              <div>
                <h5 className="mb-0 fw-bold">Your {unit.many.toLowerCase()}</h5>
                <small className="text-muted">
                  Patients see these, with prices, on your centre page.
                </small>
              </div>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => setScanForm({
                  name: '', modality: '', price: '', duration_minutes: 15,
                  max_per_slot: 1, prep_instructions: '', available: true,
                  slotsText: '', daysText: '',
                  // Never default to FULL: that would have us holding a centre's
                  // money before anyone chose it, with no payout account on file.
                  payment_collection_mode: 'SERVICE_ONLY',
                })}
              >
                <i className="bi bi-plus-lg me-1" />Add a {unit.one}
              </button>
            </div>

            {scanForm && (
              <form className="card p-3 mb-3 shadow-sm" onSubmit={saveScan}>
                <div className="row g-2">
                  <div className="col-md-6">
                    <label className="form-label small fw-semibold">{Unit} name</label>
                    <input className="form-control" required placeholder={unit.eg}
                      value={scanForm.name}
                      onChange={e => setScanForm(f => ({ ...f, name: e.target.value }))} />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label small fw-semibold">Type</label>
                    <input className="form-control" placeholder={unit.egType}
                      value={scanForm.modality}
                      onChange={e => setScanForm(f => ({ ...f, modality: e.target.value }))} />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label small fw-semibold">Price (₹)</label>
                    <input className="form-control" type="number" min="0" required
                      value={scanForm.price}
                      onChange={e => setScanForm(f => ({ ...f, price: e.target.value }))} />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label small fw-semibold">Minutes</label>
                    <input className="form-control" type="number" min="1"
                      value={scanForm.duration_minutes}
                      onChange={e => setScanForm(f => ({ ...f, duration_minutes: e.target.value }))} />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label small fw-semibold">Patients per slot</label>
                    <input className="form-control" type="number" min="1"
                      value={scanForm.max_per_slot}
                      onChange={e => setScanForm(f => ({ ...f, max_per_slot: e.target.value }))} />
                    <small className="text-muted">Usually 1 — one machine, one patient.</small>
                  </div>
                  <div className="col-md-6">
                    <label className="form-label small fw-semibold">Days</label>
                    <input className="form-control" placeholder="Mon, Tue, Wed"
                      value={scanForm.daysText}
                      onChange={e => setScanForm(f => ({ ...f, daysText: e.target.value }))} />
                  </div>
                  <div className="col-12">
                    <label className="form-label small fw-semibold">Time slots</label>
                    <input className="form-control" placeholder="09:00 AM, 09:30 AM, 10:00 AM"
                      value={scanForm.slotsText}
                      onChange={e => setScanForm(f => ({ ...f, slotsText: e.target.value }))} />
                    <small className="text-muted">Comma separated. Leave empty if you take walk-ins only.</small>
                  </div>
                  <div className="col-12">
                    <label className="form-label small fw-semibold">How the patient pays</label>
                    <select
                      className="form-select"
                      value={scanForm.payment_collection_mode === 'FULL' ? 'FULL' : 'SERVICE_ONLY'}
                      onChange={e => setScanForm(f => ({ ...f, payment_collection_mode: e.target.value }))}
                    >
                      <option value="SERVICE_ONLY">Service fee only — {unit.one} price paid at your centre</option>
                      <option value="FULL">{Unit} price + service fee — paid online</option>
                    </select>
                    <small className="text-muted">
                      {scanForm.payment_collection_mode === 'FULL'
                        ? `We collect the ${unit.one} price and settle it to your payout account — add one on your Profile if you have not.`
                        : `Nothing is owed to you by us; the patient settles the ${unit.one} price at your counter.`}
                    </small>
                  </div>
                  <div className="col-12">
                    <label className="form-label small fw-semibold">Before you come</label>
                    <textarea className="form-control" rows={2}
                      placeholder={unit.egPrep}
                      value={scanForm.prep_instructions}
                      onChange={e => setScanForm(f => ({ ...f, prep_instructions: e.target.value }))} />
                    <small className="text-muted">
                      Shown to the patient before they book and again on their token.
                    </small>
                  </div>
                </div>
                <div className="d-flex gap-2 mt-3">
                  <button className="btn btn-primary btn-sm" disabled={scanSaving}>
                    {scanSaving ? 'Saving…' : scanForm.id ? 'Save changes' : `Add ${unit.one}`}
                  </button>
                  <button type="button" className="btn btn-light btn-sm" onClick={() => setScanForm(null)}>
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {scans.length === 0 && !scanForm && (
              <div className="card p-4 text-center text-muted">
                No scans listed yet. Patients can find your centre but cannot see
                what you offer until you add one.
              </div>
            )}

            <div className="row g-2">
              {scans.map(sc => (
                <div className="col-md-6" key={sc.id}>
                  <div className="card p-3 h-100 shadow-sm">
                    <div className="d-flex justify-content-between align-items-start gap-2">
                      <div className="min-w-0">
                        <div className="fw-bold">{sc.name}</div>
                        <div className="small text-muted">
                          {sc.modality && <span className="me-2">{sc.modality}</span>}
                          {sc.duration_minutes} min · {sc.slots?.length || 0} slot{sc.slots?.length === 1 ? '' : 's'}
                        </div>
                        {sc.prep_instructions && (
                          <div className="small text-warning-emphasis mt-1">
                            <i className="bi bi-exclamation-triangle me-1" />{sc.prep_instructions}
                          </div>
                        )}
                      </div>
                      <div className="text-end flex-shrink-0">
                        <div className="fw-bold">₹{sc.price}</div>
                        <span className={`badge ${sc.available ? 'bg-success' : 'bg-secondary'}`}>
                          {sc.available ? 'Listed' : 'Hidden'}
                        </span>
                      </div>
                    </div>
                    <div className="d-flex gap-2 mt-2">
                      <button
                        className="btn btn-outline-primary btn-sm"
                        onClick={() => setScanForm({
                          ...sc,
                          slotsText: (sc.slots || []).join(', '),
                          daysText:  (sc.days  || []).join(', '),
                        })}
                      >
                        Edit
                      </button>
                      <button className="btn btn-outline-danger btn-sm" onClick={() => deleteScan(sc)}>
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {activeTab === "doctors" && !isCentre && (
          <div>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h5 className="mb-0 fw-bold">Our Doctors ({doctors.length})</h5>
              <button className="btn btn-primary btn-sm" onClick={openAddForm}>
                + Add Doctor
              </button>
            </div>

            {/* Add/Edit Form */}
            {showForm && (
              <div className="card shadow-sm border-0 p-4 mb-4">
                <div className="d-flex justify-content-between align-items-center mb-4">
                  <h6 className="fw-bold mb-0">
                    {editDoctor ? <><i className="bi bi-pencil-square me-1" />Edit Doctor</> : <><i className="bi bi-plus-lg me-1" />Add New Doctor</>}
                  </h6>
                  <button
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() => { setShowForm(false); setEditDoctor(null); setErrors(EMPTY_ERRORS); }}
                  >
                    Cancel
                  </button>
                </div>

                <form onSubmit={handleSubmit} noValidate>
                  <div className="row g-3">

                    {/* Images */}
                    <div className="col-12">
                      <div className="row g-3">
                        <div className="col-md-6">
                          <label className="form-label fw-semibold"><i className="bi bi-person-square me-1" />Doctor Profile Image</label>
                          <input
                            type="file" accept="image/*" className="form-control mb-2"
                            onChange={(e) => handleImageChange(e, "doctor")}
                          />
                          <small className="text-muted">Max 5MB · JPG, PNG, WebP</small>
                          {doctorImagePreview && (
                            <div className="mt-2 text-center">
                              <img
                                src={doctorImagePreview} alt="Doctor Preview"
                                className="rounded-circle border border-3 border-primary"
                                style={{ width: 100, height: 100, objectFit: "cover" }}
                              />
                            </div>
                          )}
                        </div>
                        <div className="col-md-6">
                          <label className="form-label fw-semibold"><i className="bi bi-image me-1" />Hospital Banner Image</label>
                          <input
                            type="file" accept="image/*" className="form-control mb-2"
                            onChange={(e) => handleImageChange(e, "hospital")}
                          />
                          <small className="text-muted">Max 5MB · JPG, PNG, WebP</small>
                          {hospitalImagePreview && (
                            <div className="mt-2">
                              <img
                                src={hospitalImagePreview} alt="Hospital Banner Preview"
                                className="rounded w-100"
                                style={{ height: 100, objectFit: "cover" }}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="col-md-6">
                      <label className="form-label fw-semibold">Doctor Name *</label>
                      <input
                        className={`form-control ${errors.name ? "is-invalid" : ""}`}
                        placeholder="John Smith"
                        value={formData.name}
                        onChange={e => handleChange("name", e.target.value)}
                      />
                      <FieldError msg={errors.name} />
                    </div>

                    <div className="col-md-6">
                      <label className="form-label fw-semibold">Specialization *</label>
                      <input
                        className={`form-control ${errors.specialization ? "is-invalid" : ""}`}
                        placeholder="Cardiologist"
                        list="specialization-options"
                        value={formData.specialization}
                        onChange={e => handleChange("specialization", e.target.value)}
                      />
                      <datalist id="specialization-options">
                        {SPECIALIZATION_OPTIONS.map(s => <option key={s} value={s} />)}
                      </datalist>
                      <FieldError msg={errors.specialization} />
                    </div>

                    <div className="col-12">
                      <label className="form-label fw-semibold">Search Keywords</label>
                      <input
                        className="form-control"
                        placeholder="e.g. heart, chest pain, BP, ECG"
                        value={formData.keywords}
                        onChange={e => handleChange("keywords", e.target.value)}
                      />
                      <small className="text-muted">
                        Comma-separated terms patients might search — helps this doctor show up in results.
                      </small>
                    </div>

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

                    <div className="col-md-4">
                      <label className="form-label fw-semibold">Consultation Fee (₹)</label>
                      <div className="input-group">
                        <span className="input-group-text text-muted">₹</span>
                        <input
                          className={`form-control ${errors.fee ? "is-invalid" : ""}`}
                          type="number" min="0" step="1" placeholder="500"
                          value={formData.fee}
                          onChange={e => handleChange("fee", e.target.value)}
                        />
                      </div>
                      <FieldError msg={errors.fee} />
                    </div>

                    <div className="col-md-4">
                      <label className="form-label fw-semibold">
                        Mobile <small className="text-muted">(10-digit)</small>
                      </label>
                      <div className="input-group">
                        <span className="input-group-text text-muted">+91</span>
                        <input
                          className={`form-control ${errors.mobile ? "is-invalid" : formData.mobile && MOBILE_RE.test(formData.mobile) ? "is-valid" : ""}`}
                          type="tel" placeholder="9000000000" maxLength={10}
                          value={formData.mobile}
                          onChange={e => handleChange("mobile", e.target.value.replace(/\D/, "").slice(0, 10))}
                        />
                      </div>
                      <FieldError msg={errors.mobile} />
                    </div>

                    <div className="col-md-4">
                      <label className="form-label fw-semibold">
                        Landline <small className="text-muted">(with STD code)</small>
                      </label>
                      <input
                        className={`form-control ${errors.landline ? "is-invalid" : formData.landline && LANDLINE_RE.test(formData.landline) ? "is-valid" : ""}`}
                        type="tel" placeholder="08812-234567" maxLength={15}
                        value={formData.landline}
                        onChange={e => handleChange("landline", e.target.value.replace(/[^\d\-\s]/g, "").slice(0, 15))}
                      />
                      <FieldError msg={errors.landline} />
                      <div className="form-text">
                        Mobile or landline — at least one. Only a mobile receives WhatsApp updates.
                      </div>
                    </div>

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

                    <div className="col-12">
                      <div className="form-check form-switch">
                        <input
                          className="form-check-input" type="checkbox"
                          checked={formData.available}
                          onChange={e => handleChange("available", e.target.checked)}
                        />
                        <label className="form-check-label fw-semibold">
                          {formData.available ? <><i className="bi bi-check-circle me-1" />Available</> : <><i className="bi bi-x-circle me-1" />Unavailable</>}
                        </label>
                      </div>
                    </div>

                    {/* Days Selector */}
                    <div className="col-12">
                      <label className="form-label fw-semibold">
                        <i className="bi bi-calendar-week me-1" />Available Days *
                        <small className="text-muted ms-2">
                          ({formData.days.length} of {DAYS_OF_WEEK.length} selected)
                        </small>
                      </label>
                      <div className="d-flex flex-wrap gap-2">
                        {DAYS_OF_WEEK.map(day => (
                          <button
                            key={day} type="button"
                            className={`btn btn-sm ${formData.days.includes(day) ? "btn-primary" : "btn-outline-secondary"}`}
                            onClick={() => toggleDay(day)}
                          >
                            {day}
                          </button>
                        ))}
                      </div>
                      <FieldError msg={errors.days} />
                    </div>

                    {/* Slot Selector — optional. No slots = walk-in listing. */}
                    <div className="col-12">
                      <label className="form-label fw-semibold">
                        <i className="bi bi-clock me-1" />Select Time Slots
                        <small className="text-muted ms-2">
                          ({formData.slots.length} of {DEFAULT_SLOTS.length} selected)
                        </small>
                      </label>

                      {formData.slots.length === 0 && (
                        <div className="alert alert-info py-2 px-3 small mb-3">
                          <strong>Walk-in mode.</strong> With no slots selected, patients see
                          this doctor as available along with your hospital timings and notice,
                          and call you to visit — there is no online token booking.
                        </div>
                      )}

                      {SLOT_SECTIONS.map(section => (
                        <div className="mb-3" key={section.label}>
                          <small className="text-muted fw-semibold d-block mb-1">
                            <i className={`bi ${section.icon} me-1`} />{section.label}
                          </small>
                          <div className="tw-slotgrid">
                            {section.slots.map(slot => (
                              <button
                                key={slot} type="button"
                                className={`btn btn-sm ${formData.slots.includes(slot) ? "btn-primary" : "btn-outline-secondary"}`}
                                onClick={() => toggleSlot(slot)}
                              >
                                {slot}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}

                      <div className="d-flex gap-2 mt-2">
                        <button
                          type="button" className="btn btn-sm btn-outline-primary"
                          onClick={() => { setFormData(p => ({ ...p, slots: [...DEFAULT_SLOTS] })); setErrors(p => ({ ...p, slots: "" })); }}
                        >
                          Select All
                        </button>
                        <button
                          type="button" className="btn btn-sm btn-outline-danger"
                          onClick={() => setFormData(p => ({ ...p, slots: [] }))}
                        >
                          Clear All
                        </button>
                      </div>
                      <FieldError msg={errors.slots} />
                    </div>

                    {/* Sticky on mobile — the form is ~2,200px tall and Save
                        used to sit at the very bottom of all of it. */}
                    <div className="col-12 tw-formactions">
                      <button type="submit" className="btn btn-primary px-4" disabled={submitting}>
                        {submitting
                          ? <><span className="spinner-border spinner-border-sm me-2" />Saving...</>
                          : editDoctor ? <><i className="bi bi-save me-1" />Update Doctor</> : <><i className="bi bi-plus-lg me-1" />Add Doctor</>
                        }
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            )}

            {/* Doctors Grid */}
            {loading ? (
              <div className="text-center py-4">
                <div className="spinner-border text-primary" />
              </div>
            ) : (
              <div className="row g-3">
                {doctors.length === 0 && (
                  <div className="col-12">
                    <p className="text-muted text-center py-4">
                      No doctors added yet. Click + Add Doctor to get started.
                    </p>
                  </div>
                )}
                {doctors.map(doc => {
                  const isToggling = toggling.has(doc.id);
                  return (
                    <div key={doc.id} className="col-md-6 col-lg-4">
                      <div className="card border-0 shadow-sm h-100">
                        <div className="tw-doccard-banner" style={{ position: "relative", height: 100 }}>
                          {doc.hospital_image && !doc.hospital_image.includes("placehold") ? (
                            <img
                              src={doc.hospital_image} alt="Hospital"
                              className="w-100 h-100"
                              style={{ objectFit: "cover", borderRadius: "8px 8px 0 0" }}
                            />
                          ) : (
                            <div style={{ width: "100%", height: "100%", background: "#e9ecef", borderRadius: "8px 8px 0 0", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <i className="bi bi-hospital text-secondary" style={{ fontSize: 28 }} />
                            </div>
                          )}
                          {doc.image && !doc.image.includes("placehold") ? (
                            <img
                              src={doc.image} alt={doc.name}
                              className="rounded-circle border border-3 border-white position-absolute tw-doccard-avatar"
                              style={{ width: 60, height: 60, objectFit: "cover", bottom: -30, left: 16 }}
                            />
                          ) : (
                            <div
                              className="rounded-circle border border-3 border-white position-absolute d-flex align-items-center justify-content-center bg-light tw-doccard-avatar"
                              style={{ width: 60, height: 60, bottom: -30, left: 16 }}
                            >
                              <i className="bi bi-person-badge text-secondary" style={{ fontSize: 22 }} />
                            </div>
                          )}
                        </div>
                        <div className="p-3 pt-4 mt-2">
                          <div className="fw-semibold">{doc.name}</div>
                          <div className="small text-primary mb-1">{doc.specialization}</div>
                          <div className="small text-muted mb-1"><i className="bi bi-telephone me-1" />{doc.mobile || doc.landline || "—"}</div>
                          <div className="small text-muted mb-1"><i className="bi bi-hourglass me-1" />{doc.experience} yrs exp</div>
                          <div className="small text-muted mb-2">
                            <i className="bi bi-people me-1" />Max {doc.max_per_slot || 10} patients/slot
                          </div>
                          <div className="mb-2">
                            <small className="fw-semibold text-muted d-block mb-1">
                              <i className="bi bi-calendar-week me-1" />Days ({doc.days?.length || 0})
                            </small>
                            <div className="d-flex flex-wrap gap-1">
                              {(doc.days || []).map(d => (
                                <span key={d} className="badge bg-light text-dark border small">{d}</span>
                              ))}
                              {(doc.days || []).length === 0 && (
                                <span className="text-danger small">No days set</span>
                              )}
                            </div>
                          </div>
                          <div className="mb-3">
                            <small className="fw-semibold text-muted d-block mb-1">
                              <i className="bi bi-clock me-1" />Slots ({doc.slots?.length || 0})
                            </small>
                            <div className="d-flex flex-wrap gap-1">
                              {(doc.slots || []).slice(0, 3).map(s => (
                                <span key={s} className="badge bg-light text-dark border small">{s}</span>
                              ))}
                              {(doc.slots || []).length > 3 && (
                                <span className="badge bg-secondary small">+{doc.slots.length - 3} more</span>
                              )}
                              {(doc.slots || []).length === 0 && (
                                <span className="badge bg-info-subtle text-info-emphasis border small">
                                  Walk-in — no online booking
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="d-flex gap-2">
                            <button
                              className={`btn btn-sm flex-grow-1 ${doc.available ? "btn-success" : "btn-secondary"}`}
                              onClick={() => toggleAvailability(doc)}
                              disabled={isToggling}
                              title={isToggling ? "Updating…" : doc.available ? "Click to mark unavailable" : "Click to mark available"}
                            >
                              {isToggling
                                ? <><span className="spinner-border spinner-border-sm me-1" style={{ width: 12, height: 12, borderWidth: 2 }} />Updating…</>
                                : doc.available ? <><i className="bi bi-check-circle me-1" />Available</> : <><i className="bi bi-x-circle me-1" />Unavailable</>
                              }
                            </button>
                            <button className="btn btn-sm btn-outline-primary" onClick={() => openEditForm(doc)} title="Edit doctor" aria-label="Edit doctor"><i className="bi bi-pencil" /></button>
                            <button className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(doc.id)} title="Delete doctor" aria-label="Delete doctor"><i className="bi bi-trash" /></button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Doctor Payments Tab ── */}
        {activeTab === "payments" && (
          <HPayments hospital={hospital} showToast={showToast} />
        )}

        {/* ── QR Scanner Tab ── */}
        {activeTab === "scanner" && (
          <QRScanner />
        )}

      </div>
    </div>
  );
};

export default Hdashboard;