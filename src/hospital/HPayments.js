import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import API from "../services/api";
import { computeFeeBreakdown } from "../services/fees";

// ── Helpers ───────────────────────────────────────────────────────────────────
const PAGE_SIZE = 8;

const COLLECTION_MODES = [
  { value: "FULL",         label: "Doctor Fee + Service Fee", hint: "Patient pays the full amount (consultation + service fee) online." },
  { value: "SERVICE_ONLY", label: "Service Fee Only",         hint: "Patient pays only the TokenWalla service fee online; the consultation fee is collected at the clinic." },
];

// Where this doctor's consultation fees are settled. Stored on the backend as
// the boolean Doctor.payout_to_hospital — "DOCTOR" is the default.
const PAYOUT_DESTINATIONS = [
  { value: "DOCTOR",   label: "Doctor's own account",
    hint: "Fees are paid straight to this doctor's UPI ID or bank account, set below." },
  { value: "HOSPITAL", label: "Hospital's account",
    hint: "For salaried doctors — fees are settled to the hospital's own payout account instead. Earnings are still tracked per doctor." },
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

// Reads as a SETTING, not as a description of past money — a row can show
// "Collects online" next to fees that were historically taken at the clinic,
// and "Fee paid online" made that look like a contradiction.
// Only an explicit FULL collects online — blank/unset is service-fee-only.
const modeLabel = (m) => (m === "FULL" ? "Collects online" : "Collects at clinic");

const fmtDate = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch { return "—"; }
};

const EMPTY_FORM = {
  payment_collection_mode: "SERVICE_ONLY",
  payout_to_hospital: false,
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
  // Salaried doctor: the money goes to the hospital's account, so this doctor's
  // own payout fields are never read and must not be demanded.
  if (f.payout_to_hospital) return e;
  if (f.payment_method === "UPI") {
    if (!f.upi_id.trim()) e.upi_id = "UPI ID is required for a UPI payout.";
    else if (!/^[\w.-]{2,256}@[a-zA-Z]{2,64}$/.test(f.upi_id.trim()))
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

  // showToast is rebuilt on every parent render, and `hospital` is an object —
  // depending on either made loadSummary a new function each render, so the
  // effect below re-fired forever and hammered the API. Keep the toast in a ref
  // and key the callback on the id alone.
  const toastRef = useRef(showToast);
  useEffect(() => { toastRef.current = showToast; }, [showToast]);

  const hospitalId = hospital?.id;

  const loadSummary = useCallback(async () => {
    if (!hospitalId) return;
    setLoading(true);
    try {
      const { data } = await API.get(`/doctors/payment-summary/?hospital=${hospitalId}`);
      setSummary({ doctors: data.doctors || [], totals: data.totals || {} });
    } catch (err) {
      console.warn("Payment summary load failed:", err?.response?.status, err?.response?.data);
      toastRef.current?.("Could not load payments. Please try again.", "error");
    } finally {
      setLoading(false);
    }
  }, [hospitalId]);

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

  // Doctors whose money has nowhere to go — their earnings are held until an
  // account is added, so this is worth surfacing rather than burying in a row.
  const needsSetup = summary.doctors.filter((d) => !d.has_payout_details).length;

  // ── Modal open / prefill ────────────────────────────────────────────────────
  const openModal = async (row) => {
    setModalDoctor(row);
    setForm(EMPTY_FORM);
    setFormErrors({});
    setLoadingForm(true);
    try {
      const { data } = await API.get(`/doctors/${row.id}/payment-details/`);
      setForm({
        // Unset ⇒ service fee only, matching the backend default: we never
        // collect a doctor's fee online until a hospital opts in.
        payment_collection_mode: data.payment_collection_mode || "SERVICE_ONLY",
        payout_to_hospital:      !!data.payout_to_hospital,
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
        payout_to_hospital:      form.payout_to_hospital,
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

  // Ownership is the organising idea here: the first card is everything patients
  // paid, and it splits exactly into the doctors' share and TokenWalla's. The
  // old page called the service fee revenue "you've earned" — it is charged to
  // the PATIENT and never reaches the hospital, which made the totals unreadable.
  const cards = [
    { label: "Patients Paid", icon: "💰", val: inr(totals.total_collected), hex: "#16a34a",
      hint: "Consultation fees + TokenWalla charges, net of cancellation refunds", primary: true },
    { label: "Doctor Fees",   icon: "🩺", val: inr(totals.doctor_fees_collected), hex: "#7c3aed",
      hint: "Your doctors' consultation fees, paid to them in full" },
    { label: "Pending Payout", icon: "⏳", val: inr(totals.pending_payout), hex: "#d97706",
      hint: "Earned on completed visits, not yet transferred" },
    { label: "Paid Out",      icon: "✅", val: inr(totals.paid_amount), hex: "#0ea5e9",
      hint: "Already transferred to doctor / hospital accounts" },
    { label: "TokenWalla Charges", icon: "🏷️", val: inr(totals.service_total), hex: "#64748b",
      hint: "Service fee + GST paid by patients. Not deducted from you." },
  ];

  return (
    <div className="hp-wrap">
      {/* ── How the money works — the single most asked question ── */}
      <div className="hp-explain mb-3">
        <span className="hp-explain__icon">💡</span>
        <div>
          <strong>Your doctors keep 100% of their consultation fee.</strong>{" "}
          TokenWalla charges the <em>patient</em> a service fee on top — we never
          deduct from a doctor's fee and never bill the hospital.
          <span className="hp-explain__eg">
            Example: ₹500 consultation → patient pays {inr(computeFeeBreakdown(500).final_amount)},
            doctor receives ₹500.00, TokenWalla keeps {inr(computeFeeBreakdown(500).service_total)}.
          </span>
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div className="row g-3 mb-4">
        {cards.map((c) => (
          <div key={c.label} className="col-6 col-lg">
            <div className={`tw-stat hp-card ${c.primary ? "hp-card--primary" : ""}`}>
              <span className="tw-stat__accent" style={{ background: c.hex }} />
              <p className="hp-card__label">
                <span className="hp-card__icon">{c.icon}</span>{c.label}
              </p>
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
            {summary.doctors.length} doctor{summary.doctors.length === 1 ? "" : "s"}
            {needsSetup > 0 && (
              <> • <span className="hp-warn">{needsSetup} need{needsSetup === 1 ? "s" : ""} a payout account</span></>
            )}
          </span>
        </div>
        <div className="d-flex align-items-center gap-2">
          <input
            className="form-control form-control-sm hp-search"
            placeholder="🔍 Search doctor…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="btn btn-outline-secondary btn-sm hp-refresh" onClick={loadSummary}
                  disabled={loading} title="Refresh">↻</button>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="hp-tablewrap">
        <table className="table hp-table align-middle mb-0">
          <thead>
            <tr>
              <th>Doctor</th>
              <th className="text-end">Visits</th>
              <th className="text-end">Patients Paid</th>
              <th className="text-end">Doctor Fees</th>
              <th className="text-end">Refunded</th>
              <th className="text-end">TokenWalla</th>
              <th className="text-end">Pending</th>
              <th className="text-end">Paid Out</th>
              <th className="text-end">&nbsp;</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={9} className="text-center text-muted py-5">Loading…</td></tr>
            )}
            {!loading && pageRows.length === 0 && (
              <tr><td colSpan={9} className="text-center py-5">
                {summary.doctors.length === 0 ? (
                  <>
                    <div className="hp-empty__icon">🩺</div>
                    <div className="fw-semibold">No doctors yet</div>
                    <div className="text-muted small">Add a doctor and their payout details will appear here.</div>
                  </>
                ) : (
                  <span className="text-muted">No doctors match “{search}”.</span>
                )}
              </td></tr>
            )}
            {!loading && pageRows.map((d) => (
              <tr key={d.id}>
                <td>
                  <div className="fw-semibold">{d.name}</div>
                  <div className="text-muted hp-sub mb-1">
                    {d.specialization || "—"} • {inr(d.fee)} consultation
                  </div>
                  <div className="hp-badges">
                    <span className={`hp-badge ${d.collection_mode === "FULL" ? "hp-badge--blue" : "hp-badge--amber"}`}>
                      {modeLabel(d.collection_mode)}
                    </span>
                    {d.has_payout_details ? (
                      <span className={`hp-badge ${d.payout_to_hospital ? "hp-badge--violet" : "hp-badge--slate"}`}>
                        {d.payout_to_hospital ? "→ Hospital a/c" : "→ Doctor's a/c"}
                      </span>
                    ) : (
                      <span className="hp-badge hp-badge--red"
                            title={d.payout_to_hospital
                              ? "The hospital's payout account is empty — set it under Profile."
                              : "No UPI ID or bank account saved for this doctor."}>
                        ⚠ No payout account
                      </span>
                    )}
                  </div>
                </td>
                <td className="text-end">{d.appointments}</td>
                <td className="text-end fw-semibold">{inr(d.total_collected)}</td>
                <td className="text-end">
                  {inr(d.doctor_fees_collected)}
                  {Number(d.offline_doctor_fee) > 0 && (
                    <span className="hp-sub d-block text-muted">{inr(d.offline_doctor_fee)} at clinic</span>
                  )}
                </td>
                <td className="text-end">
                  {Number(d.refunded_to_patient) > 0
                    ? <span className="hp-refunded"
                            title={`Returned to patients on cancellation: `
                                 + `${inr(d.refunded_from_doctor_fee)} of doctor fees `
                                 + `+ ${inr(d.refunded_from_service)} of our service fee. `
                                 + `Already deducted from the columns either side.`}>
                        −{inr(d.refunded_to_patient)}
                      </span>
                    : <span className="text-muted">—</span>}
                </td>
                <td className="text-end hp-muted-num"
                    title={`Service fee ${inr(d.service_revenue)} + gateway ${inr(d.gateway_fee)} `
                         + `+ GST ${inr(d.gst_collected)}`}>
                  {inr(d.service_total)}
                </td>
                <td className="text-end">
                  {Number(d.pending_payout) > 0
                    ? <span className="hp-pending">{inr(d.pending_payout)}</span>
                    : <span className="text-muted">—</span>}
                </td>
                <td className="text-end">
                  {inr(d.paid_amount)}
                  <span className="hp-sub d-block text-muted">{fmtDate(d.last_payout_date)}</span>
                </td>
                <td className="text-end">
                  <button className="btn btn-sm btn-primary hp-update" onClick={() => openModal(d)}>
                    Manage
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

                {/* Live preview — what this setting actually does to one visit */}
                {(() => {
                  const b = computeFeeBreakdown(modalDoctor.fee, form.payment_collection_mode);
                  const serviceOnly = form.payment_collection_mode !== "FULL";
                  return (
                    <div className="hp-preview mb-3">
                      <div className="hp-preview__title">
                        One {inr(modalDoctor.fee)} consultation
                      </div>
                      <div className="hp-preview__row">
                        <span>Patient pays online</span>
                        <strong>{inr(b.final_amount)}</strong>
                      </div>
                      {serviceOnly && (
                        <div className="hp-preview__row">
                          <span>Patient pays at your clinic</span>
                          <strong>{inr(b.offline_doctor_fee)}</strong>
                        </div>
                      )}
                      <div className="hp-preview__row hp-preview__row--good">
                        <span>Doctor receives</span>
                        <strong>
                          {serviceOnly ? `${inr(b.offline_doctor_fee)} at clinic` : inr(b.doctor_fee)}
                        </strong>
                      </div>
                      <div className="hp-preview__row hp-preview__row--muted">
                        <span>TokenWalla service fee + GST</span>
                        <strong>{inr(b.service_total)}</strong>
                      </div>
                      <div className="hp-preview__note">
                        Nothing is deducted from the doctor or billed to the hospital.
                      </div>
                    </div>
                  );
                })()}

                <hr className="my-3" />
                <p className="fw-semibold small text-uppercase text-muted mb-2" style={{ letterSpacing: ".04em" }}>
                  Payout Account
                </p>

                {/* Where the money goes */}
                <div className="mb-3">
                  <label className="form-label fw-semibold small mb-1">Pay Fees To</label>
                  <select className="form-select"
                          value={form.payout_to_hospital ? "HOSPITAL" : "DOCTOR"}
                          onChange={(e) => setField("payout_to_hospital", e.target.value === "HOSPITAL")}>
                    {PAYOUT_DESTINATIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                  <div className="form-text">
                    {PAYOUT_DESTINATIONS.find(
                      (d) => d.value === (form.payout_to_hospital ? "HOSPITAL" : "DOCTOR"))?.hint}
                  </div>
                </div>

                {form.payout_to_hospital ? (
                  <div className="alert alert-info py-2 small mb-3">
                    Payouts for {modalDoctor.name} go to the hospital's payout account.
                    Set it under <strong>Profile → Payout Account</strong>. Payouts are
                    held until that account is filled in.
                  </div>
                ) : (<>
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
                </>)}

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
        /* ── Explainer ── */
        .hp-explain{display:flex;gap:12px;align-items:flex-start;background:linear-gradient(180deg,#f6fbff,#f2f7ff);
          border:1px solid #dbeafe;border-radius:14px;padding:13px 16px;font-size:13px;color:#1e3a5f;line-height:1.5}
        .hp-explain__icon{font-size:16px;line-height:1.35;flex:none}
        .hp-explain__eg{display:block;margin-top:4px;font-size:12px;color:#5b7290}

        /* ── Stat cards ── */
        .hp-card{padding:16px 16px 14px 20px;height:100%}
        .hp-card--primary{box-shadow:0 4px 16px rgba(22,163,74,.10)}
        .hp-card__label{display:flex;align-items:center;gap:5px;font-size:11px;font-weight:600;
          letter-spacing:.04em;text-transform:uppercase;color:#8a94a1;margin:0 0 6px}
        .hp-card__icon{font-size:12px}
        .hp-card__val{font-size:26px;font-weight:700;line-height:1.1;letter-spacing:-.02em;margin:0 0 4px}
        .hp-card__hint{font-size:11px;color:#8a94a1;margin:0;line-height:1.35}
        .hp-search{width:200px;max-width:52vw}
        .hp-refresh{border-radius:8px;width:34px}

        /* ── Table ── */
        .hp-tablewrap{background:#fff;border:1px solid #edf0f2;border-radius:16px;overflow-x:auto}
        .hp-table{font-size:14px;min-width:940px;margin:0}
        .hp-table thead th{font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;
          color:#8a94a1;border-bottom:1px solid #edf0f2;white-space:nowrap;padding:12px 14px;background:#fcfdfe}
        .hp-table tbody td{border-bottom:1px solid #f2f4f6;padding:13px 14px;vertical-align:middle}
        .hp-table tbody tr:last-child td{border-bottom:0}
        .hp-table tbody tr{transition:background .12s ease}
        .hp-table tbody tr:hover{background:#fafcff}
        .hp-sub{font-size:12px}
        .hp-warn{color:#c2410c;font-weight:600}
        .hp-muted-num{color:#8a94a1}
        .hp-pending{color:#b45309;font-weight:600}
        .hp-refunded{color:#dc2626;font-weight:600;white-space:nowrap}
        .hp-badges{display:flex;flex-wrap:wrap;gap:4px}
        .hp-empty__icon{font-size:30px;margin-bottom:6px;opacity:.7}

        .hp-badge{display:inline-block;font-size:11px;font-weight:600;padding:3px 9px;border-radius:999px;white-space:nowrap}
        .hp-badge--blue{background:#e7f0ff;color:#0d6efd}
        .hp-badge--amber{background:#fff3e0;color:#c2410c}
        .hp-badge--violet{background:#f3e8ff;color:#7c3aed}
        .hp-badge--slate{background:#eef2f6;color:#556170}
        .hp-badge--red{background:#fee2e2;color:#b91c1c;cursor:help}
        .hp-update{border-radius:8px;font-weight:600}

        /* ── Fee preview inside the modal ── */
        .hp-preview{background:#f8fafc;border:1px solid #e8edf2;border-radius:12px;padding:12px 14px}
        .hp-preview__title{font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;
          color:#8a94a1;margin-bottom:8px}
        .hp-preview__row{display:flex;justify-content:space-between;gap:12px;font-size:13px;
          padding:3px 0;color:#334155}
        .hp-preview__row--good{color:#15803d;border-top:1px dashed #dde5ec;margin-top:4px;padding-top:7px}
        .hp-preview__row--muted{color:#8a94a1}
        .hp-preview__note{font-size:11px;color:#8a94a1;margin-top:7px;line-height:1.4}

        /* ── Modal ── */
        .hp-modal-backdrop{position:fixed;inset:0;z-index:9999;background:rgba(16,24,40,.5);
          backdrop-filter:blur(2px);display:flex;align-items:flex-start;justify-content:center;
          padding:24px 16px;overflow-y:auto}
        .hp-modal{background:#fff;border-radius:18px;width:100%;max-width:520px;padding:22px 22px 20px;
          box-shadow:0 20px 60px rgba(16,24,40,.25);margin:auto}

        @media (max-width:575px){
          .hp-card__val{font-size:21px}
          .hp-explain{font-size:12.5px;padding:11px 13px}
        }
      `}</style>
    </div>
  );
};

export default HPayments;
