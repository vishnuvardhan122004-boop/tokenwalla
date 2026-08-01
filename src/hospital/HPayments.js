import { useCallback, useEffect, useMemo, useState } from "react";
import API from "../services/api";

// ── Helpers ───────────────────────────────────────────────────────────────────
const PAGE_SIZE = 8;

const COLLECTION_MODES = [
  { value: "FULL",         label: "Doctor Fee + Service Fee", hint: "Patient pays the full amount (consultation + service fee) online." },
  { value: "SERVICE_ONLY", label: "Service Fee Only",         hint: "Patient pays only the TokenWalla service fee online; the consultation fee is collected at the clinic." },
];

const PAYMENT_METHODS = [
  { value: "",     label: "— Not set —" },
  { value: "UPI",  label: "UPI" },
  { value: "BANK", label: "Bank Account" },
];

const inr = (v) => {
  const n = Number(v || 0);
  return "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const modeLabel = (m) =>
  m === "SERVICE_ONLY" ? "Service fee only" : "Doctor + service fee";

const fmtDate = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch { return "—"; }
};

const EMPTY_FORM = {
  payment_collection_mode: "FULL",
  payment_method: "",
  upi_id: "",
  account_holder_name: "",
  bank_name: "",
  account_number: "",
  ifsc_code: "",
  payout_notes: "",
};

// Mirrors the backend validation so users get instant feedback.
const validateDetails = (f) => {
  const e = {};
  if (f.payment_method === "UPI") {
    if (!f.upi_id.trim()) e.upi_id = "UPI ID is required for a UPI payout.";
    else if (!/^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/.test(f.upi_id.trim()))
      e.upi_id = "Enter a valid UPI ID (e.g. name@bank).";
  }
  if (f.payment_method === "BANK") {
    if (!f.account_holder_name.trim()) e.account_holder_name = "Account holder name is required.";
    if (!f.account_number.trim()) e.account_number = "Account number is required.";
    if (!f.ifsc_code.trim()) e.ifsc_code = "IFSC is required.";
    else if (!/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(f.ifsc_code.trim()))
      e.ifsc_code = "Enter a valid 11-character IFSC (e.g. HDFC0001234).";
  }
  if (f.ifsc_code.trim() && f.payment_method !== "BANK" &&
      !/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(f.ifsc_code.trim()))
    e.ifsc_code = "Enter a valid 11-character IFSC (e.g. HDFC0001234).";
  return e;
};

// ── Component ─────────────────────────────────────────────────────────────────
const HPayments = ({ hospital, showToast }) => {
  const [summary,   setSummary]   = useState({ doctors: [], totals: {} });
  const [loading,   setLoading]   = useState(false);
  const [search,    setSearch]    = useState("");
  const [page,      setPage]      = useState(1);

  // Update-details modal state
  const [modalDoctor, setModalDoctor] = useState(null);   // { id, name, ... } row
  const [form,        setForm]        = useState(EMPTY_FORM);
  const [formErrors,  setFormErrors]  = useState({});
  const [loadingForm, setLoadingForm] = useState(false);
  const [saving,      setSaving]      = useState(false);

  const loadSummary = useCallback(async () => {
    if (!hospital?.id) return;
    setLoading(true);
    try {
      const { data } = await API.get(`/doctors/payment-summary/?hospital=${hospital.id}`);
      setSummary({ doctors: data.doctors || [], totals: data.totals || {} });
    } catch (err) {
      console.warn("Payment summary load failed:", err?.response?.status, err?.response?.data);
      showToast?.("Could not load payments. Please try again.", "error");
    } finally {
      setLoading(false);
    }
  }, [hospital, showToast]);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  // ── Search + pagination ─────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = summary.doctors;
    if (!q) return list;
    return list.filter(
      (d) =>
        (d.name || "").toLowerCase().includes(q) ||
        (d.specialization || "").toLowerCase().includes(q)
    );
  }, [summary.doctors, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const pageRows   = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [search]);

  const totals = summary.totals || {};

  // ── Modal open / prefill ────────────────────────────────────────────────────
  const openModal = async (row) => {
    setModalDoctor(row);
    setForm(EMPTY_FORM);
    setFormErrors({});
    setLoadingForm(true);
    try {
      const { data } = await API.get(`/doctors/${row.id}/payment-details/`);
      setForm({
        payment_collection_mode: data.payment_collection_mode || "FULL",
        payment_method:          data.payment_method || "",
        upi_id:                  data.upi_id || "",
        account_holder_name:     data.account_holder_name || "",
        bank_name:               data.bank_name || "",
        account_number:          data.account_number || "",
        ifsc_code:               data.ifsc_code || "",
        payout_notes:            data.payout_notes || "",
      });
    } catch (err) {
      showToast?.("Could not load payment details.", "error");
      setModalDoctor(null);
    } finally {
      setLoadingForm(false);
    }
  };

  const closeModal = () => { if (!saving) { setModalDoctor(null); setFormErrors({}); } };

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const saveDetails = async () => {
    const errs = validateDetails(form);
    setFormErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    try {
      await API.put(`/doctors/${modalDoctor.id}/payment-details/`, {
        payment_collection_mode: form.payment_collection_mode,
        payment_method:          form.payment_method,
        upi_id:                  form.upi_id.trim(),
        account_holder_name:     form.account_holder_name.trim(),
        bank_name:               form.bank_name.trim(),
        account_number:          form.account_number.trim(),
        ifsc_code:               form.ifsc_code.trim().toUpperCase(),
        payout_notes:            form.payout_notes.trim(),
      });
      showToast?.(`Payment details updated for ${modalDoctor.name}.`, "success");
      setModalDoctor(null);
      loadSummary();
    } catch (err) {
      const apiErrs = err?.response?.data?.errors;
      if (apiErrs && typeof apiErrs === "object") {
        const flat = {};
        Object.entries(apiErrs).forEach(([k, v]) => { flat[k] = Array.isArray(v) ? v[0] : String(v); });
        setFormErrors(flat);
      } else {
        showToast?.(err?.response?.data?.message || "Could not save. Please try again.", "error");
      }
    } finally {
      setSaving(false);
    }
  };

  const cards = [
    { label: "Total Collected",  val: inr(totals.total_collected),       hex: "#16a34a", hint: "All money collected — online + at hospital", primary: true },
    { label: "Doctor Fees",      val: inr(totals.doctor_fees_collected), hex: "#7c3aed", hint: "Consultation fees (incl. collected at hospital)" },
    { label: "Service Revenue",  val: inr(totals.service_revenue),       hex: "#0d6efd", hint: "TokenWalla platform fees you've earned" },
    { label: "Pending Payout",   val: inr(totals.pending_payout),        hex: "#d97706", hint: "Accrued, not yet settled" },
    { label: "Paid Out",         val: inr(totals.paid_amount),           hex: "#0ea5e9", hint: "Settled to doctors" },
  ];

  return (
    <div className="hp-wrap">
      {/* ── Summary cards ── */}
      <div className="row g-3 mb-4">
        {cards.map((c) => (
          <div key={c.label} className="col-6 col-lg">
            <div className={`tw-stat hp-card ${c.primary ? "hp-card--primary" : ""}`}>
              <span className="tw-stat__accent" style={{ background: c.hex }} />
              <p className="tw-stat__label">{c.label}</p>
              <p className="hp-card__val" style={{ color: c.hex }}>{c.val}</p>
              <p className="hp-card__hint">{c.hint}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Header + search ── */}
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
        <div>
          <h5 className="fw-bold mb-0">💳 Doctor Payments</h5>
          <span className="text-muted small">
            {summary.doctors.length} doctor{summary.doctors.length === 1 ? "" : "s"} • payout details &amp; earnings
          </span>
        </div>
        <div className="d-flex align-items-center gap-2">
          <input
            className="form-control form-control-sm hp-search"
            placeholder="🔍 Search doctor…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="btn btn-outline-secondary btn-sm" onClick={loadSummary} title="Refresh">↻</button>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="hp-tablewrap">
        <table className="table hp-table align-middle mb-0">
          <thead>
            <tr>
              <th>Doctor</th>
              <th>Collection Mode</th>
              <th className="text-end">Appts</th>
              <th className="text-end">Total Collected</th>
              <th className="text-end">Doctor Fees</th>
              <th className="text-end">Service Rev.</th>
              <th className="text-end">Pending</th>
              <th className="text-end">Paid</th>
              <th>Last Payout</th>
              <th className="text-end">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={10} className="text-center text-muted py-4">Loading…</td></tr>
            )}
            {!loading && pageRows.length === 0 && (
              <tr><td colSpan={10} className="text-center text-muted py-4">
                {summary.doctors.length === 0 ? "No doctors yet." : "No doctors match your search."}
              </td></tr>
            )}
            {!loading && pageRows.map((d) => (
              <tr key={d.id}>
                <td>
                  <div className="fw-semibold">{d.name}</div>
                  <div className="text-muted hp-sub">{d.specialization || "—"} • {inr(d.fee)} fee</div>
                </td>
                <td>
                  <span className={`hp-badge ${d.collection_mode === "SERVICE_ONLY" ? "hp-badge--amber" : "hp-badge--blue"}`}>
                    {modeLabel(d.collection_mode)}
                  </span>
                </td>
                <td className="text-end">{d.appointments}</td>
                <td className="text-end fw-semibold">{inr(d.total_collected)}</td>
                <td className="text-end">
                  {inr(d.doctor_fees_collected)}
                  {Number(d.offline_doctor_fee) > 0 && (
                    <span className="hp-sub d-block text-muted">{inr(d.offline_doctor_fee)} at hospital</span>
                  )}
                </td>
                <td className="text-end fw-semibold text-primary">{inr(d.service_revenue)}</td>
                <td className="text-end">{inr(d.pending_payout)}</td>
                <td className="text-end">{inr(d.paid_amount)}</td>
                <td>
                  {fmtDate(d.last_payout_date)}
                  {!d.has_payout_details && (
                    <span className="hp-warn d-block" title="No payout account saved">⚠ no account</span>
                  )}
                </td>
                <td className="text-end">
                  <button className="btn btn-sm btn-primary hp-update" onClick={() => openModal(d)}>
                    Update
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="d-flex justify-content-center align-items-center gap-2 mt-3">
          <button className="btn btn-sm btn-outline-secondary" disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}>← Prev</button>
          <span className="small text-muted">Page {safePage} of {totalPages}</span>
          <button className="btn btn-sm btn-outline-secondary" disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next →</button>
        </div>
      )}

      {/* ── Update Payment Details modal ── */}
      {modalDoctor && (
        <div className="hp-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
          <div className="hp-modal">
            <div className="d-flex justify-content-between align-items-start mb-1">
              <div>
                <h5 className="fw-bold mb-0">Update Payment Details</h5>
                <span className="text-muted small">{modalDoctor.name} • {modalDoctor.specialization || "—"}</span>
              </div>
              <button className="btn-close" onClick={closeModal} disabled={saving} />
            </div>

            {loadingForm ? (
              <div className="text-center text-muted py-5">Loading details…</div>
            ) : (
              <>
                {/* Collection mode */}
                <div className="mb-3 mt-2">
                  <label className="form-label fw-semibold small mb-1">Payment Collection Mode</label>
                  <select className="form-select" value={form.payment_collection_mode}
                          onChange={(e) => setField("payment_collection_mode", e.target.value)}>
                    {COLLECTION_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                  <div className="form-text">
                    {COLLECTION_MODES.find((m) => m.value === form.payment_collection_mode)?.hint}
                  </div>
                </div>

                <hr className="my-3" />
                <p className="fw-semibold small text-uppercase text-muted mb-2" style={{ letterSpacing: ".04em" }}>
                  Payout Account
                </p>

                {/* Method */}
                <div className="mb-3">
                  <label className="form-label fw-semibold small mb-1">Payment Method</label>
                  <select className="form-select" value={form.payment_method}
                          onChange={(e) => setField("payment_method", e.target.value)}>
                    {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>

                {/* UPI */}
                {form.payment_method === "UPI" && (
                  <div className="mb-3">
                    <label className="form-label fw-semibold small mb-1">UPI ID</label>
                    <input className={`form-control ${formErrors.upi_id ? "is-invalid" : ""}`}
                           placeholder="clinic@okhdfc" value={form.upi_id}
                           onChange={(e) => setField("upi_id", e.target.value)} />
                    {formErrors.upi_id && <div className="invalid-feedback">{formErrors.upi_id}</div>}
                  </div>
                )}

                {/* Bank */}
                {form.payment_method === "BANK" && (
                  <>
                    <div className="mb-3">
                      <label className="form-label fw-semibold small mb-1">Account Holder Name</label>
                      <input className={`form-control ${formErrors.account_holder_name ? "is-invalid" : ""}`}
                             value={form.account_holder_name}
                             onChange={(e) => setField("account_holder_name", e.target.value)} />
                      {formErrors.account_holder_name && <div className="invalid-feedback">{formErrors.account_holder_name}</div>}
                    </div>
                    <div className="row g-2">
                      <div className="col-12 col-sm-6 mb-3">
                        <label className="form-label fw-semibold small mb-1">Bank Name</label>
                        <input className="form-control" value={form.bank_name}
                               onChange={(e) => setField("bank_name", e.target.value)} />
                      </div>
                      <div className="col-12 col-sm-6 mb-3">
                        <label className="form-label fw-semibold small mb-1">Account Number</label>
                        <input className={`form-control ${formErrors.account_number ? "is-invalid" : ""}`}
                               value={form.account_number}
                               onChange={(e) => setField("account_number", e.target.value)} />
                        {formErrors.account_number && <div className="invalid-feedback">{formErrors.account_number}</div>}
                      </div>
                    </div>
                    <div className="mb-3">
                      <label className="form-label fw-semibold small mb-1">IFSC Code</label>
                      <input className={`form-control text-uppercase ${formErrors.ifsc_code ? "is-invalid" : ""}`}
                             placeholder="HDFC0001234" value={form.ifsc_code}
                             onChange={(e) => setField("ifsc_code", e.target.value)} />
                      {formErrors.ifsc_code && <div className="invalid-feedback">{formErrors.ifsc_code}</div>}
                    </div>
                  </>
                )}

                {/* Notes */}
                <div className="mb-3">
                  <label className="form-label fw-semibold small mb-1">Notes <span className="text-muted fw-normal">(optional)</span></label>
                  <textarea className="form-control" rows={2} value={form.payout_notes}
                            placeholder="e.g. Settle weekly, GST invoice to accounts@…"
                            onChange={(e) => setField("payout_notes", e.target.value)} />
                </div>

                <div className="d-flex justify-content-end gap-2 mt-4">
                  <button className="btn btn-outline-secondary" onClick={closeModal} disabled={saving}>Cancel</button>
                  <button className="btn btn-primary" onClick={saveDetails} disabled={saving}>
                    {saving ? "Saving…" : "Save Details"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <style>{`
        .hp-card{padding:16px 16px 14px 20px}
        .hp-card--primary{box-shadow:0 4px 16px rgba(13,110,253,.10)}
        .hp-card__val{font-size:26px;font-weight:700;line-height:1.1;letter-spacing:-.02em;margin:0 0 4px}
        .hp-card__hint{font-size:11px;color:#8a94a1;margin:0;line-height:1.3}
        .hp-search{width:200px;max-width:52vw}

        .hp-tablewrap{background:#fff;border:1px solid #edf0f2;border-radius:16px;overflow-x:auto}
        .hp-table{font-size:14px;min-width:900px;margin:0}
        .hp-table thead th{font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#8a94a1;border-bottom:1px solid #edf0f2;white-space:nowrap;padding:12px 14px}
        .hp-table tbody td{border-bottom:1px solid #f2f4f6;padding:12px 14px;vertical-align:middle}
        .hp-table tbody tr:last-child td{border-bottom:0}
        .hp-sub{font-size:12px}
        .hp-warn{font-size:11px;color:#c2410c;font-weight:600}

        .hp-badge{display:inline-block;font-size:11px;font-weight:600;padding:3px 9px;border-radius:999px;white-space:nowrap}
        .hp-badge--blue{background:#e7f0ff;color:#0d6efd}
        .hp-badge--amber{background:#fff3e0;color:#c2410c}
        .hp-update{border-radius:8px;font-weight:600}

        .hp-modal-backdrop{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.45);display:flex;align-items:flex-start;justify-content:center;padding:24px 16px;overflow-y:auto}
        .hp-modal{background:#fff;border-radius:18px;width:100%;max-width:520px;padding:22px 22px 20px;box-shadow:0 20px 60px rgba(16,24,40,.25);margin:auto}
      `}</style>
    </div>
  );
};

export default HPayments;
