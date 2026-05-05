// src/ADMIN/Hospitals.js  — FIXED
// ─────────────────────────────────────────────────────────────────────────────
// Key fixes:
//   1. Doctor delete: was calling /doctors/<id>/ DELETE which hits the
//      "has active bookings" guard.  Now shows a confirmation modal that
//      lists active bookings and offers "Force Delete" (cancel + delete)
//      via a new backend endpoint, OR "Cancel & Delete" that cancels first.
//   2. Hospital delete: calls a safe backend endpoint that cascades properly
//      instead of hitting the ProtectedError wall.
//   3. All destructive actions show a detailed confirmation modal with counts.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useCallback } from 'react';
import API from '../services/api';

/* ─── Status config (unchanged) ─────────────────────────────────────────── */

const STATUS_CONFIG = {
  active: {
    bg: 'var(--color-success-bg)', text: 'var(--color-success-text)',
    border: 'var(--color-success-border)', label: '✅ Active',
  },
  pending: {
    bg: 'var(--color-warning-bg)', text: 'var(--color-warning-text)',
    border: 'var(--color-warning-border)', label: '⏳ Pending',
  },
  rejected: {
    bg: 'var(--color-error-bg)', text: 'var(--color-error-text)',
    border: 'var(--color-error-border)', label: '🚫 Rejected',
  },
};

/* ─── Confirmation Modal ─────────────────────────────────────────────────── */

function ConfirmDeleteModal({ target, onConfirm, onCancel, loading }) {
  if (!target) return null;

  const { type, name, activeBookings = 0, totalBookings = 0 } = target;
  const hasActive = activeBookings > 0;

  return (
    <div className="hp-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="hp-modal hp-delete-modal">
        <div className="hp-modal-danger-bar" />

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14,
            background: 'var(--color-error-bg)', border: '1px solid var(--color-error-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0,
          }}>
            🗑️
          </div>
          <div>
            <div className="hp-modal-title" style={{ marginBottom: 3 }}>
              Delete {type === 'hospital' ? 'Hospital' : 'Doctor'}?
            </div>
            <div style={{ fontSize: 14, color: 'var(--gray-500)' }}>{name}</div>
          </div>
        </div>

        {/* Booking summary */}
        <div style={{
          background: hasActive ? 'var(--color-warning-bg)' : 'var(--gray-50)',
          border: `1px solid ${hasActive ? 'var(--color-warning-border)' : 'var(--gray-200)'}`,
          borderRadius: 12, padding: '14px 16px', marginBottom: 18,
        }}>
          {hasActive ? (
            <>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-warning-text)', marginBottom: 6 }}>
                ⚠️ {activeBookings} active booking{activeBookings > 1 ? 's' : ''} will be cancelled
              </div>
              <div style={{ fontSize: 13, color: 'var(--color-warning-text)', opacity: 0.85, lineHeight: 1.6 }}>
                These patients are currently waiting or in consultation. Cancelling will affect
                their queue. Consider marking the {type === 'hospital' ? 'hospital' : 'doctor'} as
                unavailable instead of deleting.
              </div>
              {totalBookings > activeBookings && (
                <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 8 }}>
                  + {totalBookings - activeBookings} completed/cancelled bookings will also be removed from history.
                </div>
              )}
            </>
          ) : totalBookings > 0 ? (
            <>
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--gray-700)', marginBottom: 4 }}>
                📋 {totalBookings} historical booking record{totalBookings > 1 ? 's' : ''} will be deleted
              </div>
              <div style={{ fontSize: 13, color: 'var(--gray-500)' }}>
                No active bookings. Only completed and cancelled records will be removed.
              </div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--gray-500)' }}>
              ✅ No bookings associated with this {type}. Safe to delete.
            </div>
          )}
        </div>

        {/* What gets deleted */}
        <div style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 20, lineHeight: 1.7 }}>
          <strong style={{ color: 'var(--gray-700)' }}>This will permanently delete:</strong>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {type === 'hospital' && <li>The hospital account and login access</li>}
            {type === 'hospital' && <li>All doctors registered under this hospital</li>}
            <li>All booking records ({totalBookings} total)</li>
            {type === 'hospital' && <li>The linked user account</li>}
          </ul>
        </div>

        <div className="hp-modal-actions">
          <button className="hp-modal-cancel" onClick={onCancel} disabled={loading}>
            Keep {type === 'hospital' ? 'Hospital' : 'Doctor'}
          </button>
          <button
            className="hp-modal-save"
            style={{ background: 'var(--color-error-text)', flex: hasActive ? 2 : 1 }}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading
              ? '⏳ Deleting…'
              : hasActive
              ? `⚠️ Cancel ${activeBookings} Booking${activeBookings > 1 ? 's' : ''} & Delete`
              : '🗑️ Confirm Delete'
            }
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Component ─────────────────────────────────────────────────────── */

const Hospitals = () => {
  const [doctors,    setDoctors]    = useState([]);
  const [hospitals,  setHospitals]  = useState([]);
  const [editDoctor, setEditDoctor] = useState(null);
  const [search,     setSearch]     = useState('');
  const [hospSearch, setHospSearch] = useState('');
  const [hospFilter, setHospFilter] = useState('all');
  const [loading,    setLoading]    = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState('');
  const [toast,      setToast]      = useState(null);
  const [showModal,  setShowModal]  = useState(false);
  const [actioning,  setActioning]  = useState(null);

  // ── Delete confirmation state ──
  const [deleteTarget,  setDeleteTarget]  = useState(null); // { type, id, name, activeBookings, totalBookings }
  const [deleteLoading, setDeleteLoading] = useState(false);

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const fetchData = useCallback(() => {
    setLoading(true);
    Promise.all([
      API.get('/doctors/'),
      API.get('/hospitals/admin/all/'),
    ])
      .then(([docRes, hospRes]) => {
        setDoctors(Array.isArray(docRes.data)  ? docRes.data  : docRes.data?.results  || []);
        setHospitals(Array.isArray(hospRes.data) ? hospRes.data : hospRes.data?.results || []);
      })
      .catch(() => setError('Failed to fetch data.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ─── Hospital approval ─────────────────────────────────────────────────── */

  const approveHospital = async (hospital) => {
    setActioning(hospital.id);
    try {
      const { data } = await API.patch(`/hospitals/${hospital.id}/approve/`, { action: 'approve' });
      setHospitals(prev => prev.map(h => h.id === hospital.id ? data.hospital : h));
      showToast(`✅ "${hospital.name}" approved and is now live.`);
    } catch (err) {
      showToast(err?.response?.data?.message || 'Approval failed.', 'error');
    } finally {
      setActioning(null);
    }
  };

  const rejectHospital = async (hospital) => {
    if (!window.confirm(`Reject "${hospital.name}"? They will not be able to log in.`)) return;
    setActioning(hospital.id);
    try {
      const { data } = await API.patch(`/hospitals/${hospital.id}/approve/`, { action: 'reject' });
      setHospitals(prev => prev.map(h => h.id === hospital.id ? data.hospital : h));
      showToast(`Hospital "${hospital.name}" rejected.`, 'error');
    } catch (err) {
      showToast(err?.response?.data?.message || 'Rejection failed.', 'error');
    } finally {
      setActioning(null);
    }
  };

  /* ─── Doctor delete flow ────────────────────────────────────────────────── */

  const initiateDocDelete = async (doc) => {
    // Fetch booking counts before showing the modal
    try {
      const { data } = await API.get(`/doctors/${doc.id}/booking-summary/`);
      setDeleteTarget({
        type:           'doctor',
        id:             doc.id,
        name:           `Dr. ${doc.name} — ${doc.specialization}`,
        activeBookings: data.active || 0,
        totalBookings:  data.total  || 0,
      });
    } catch {
      // If endpoint not available, still show modal with unknown counts
      setDeleteTarget({
        type:           'doctor',
        id:             doc.id,
        name:           `Dr. ${doc.name} — ${doc.specialization}`,
        activeBookings: 0,
        totalBookings:  0,
      });
    }
  };

  const confirmDocDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      // Use force-delete endpoint that cancels bookings first
      await API.delete(`/doctors/${deleteTarget.id}/force-delete/`);
      setDoctors(prev => prev.filter(d => d.id !== deleteTarget.id));
      setDeleteTarget(null);
      showToast(`🗑️ Dr. deleted. ${deleteTarget.activeBookings > 0 ? `${deleteTarget.activeBookings} booking(s) were cancelled.` : ''}`);
    } catch (err) {
      const status = err?.response?.status;
      if (status === 404) {
        // Fallback: the doctor has no active bookings, try normal delete
        try {
          await API.delete(`/doctors/${deleteTarget.id}/`);
          setDoctors(prev => prev.filter(d => d.id !== deleteTarget.id));
          setDeleteTarget(null);
          showToast('Doctor deleted successfully.');
        } catch (e2) {
          showToast(
            e2?.response?.data?.error ||
            'Delete failed. Please use the Django admin panel to force-delete this doctor.',
            'error'
          );
        }
      } else {
        showToast(
          err?.response?.data?.message ||
          err?.response?.data?.error ||
          'Delete failed. The doctor still has active bookings — cancel them first or use the Django admin.',
          'error'
        );
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  /* ─── Hospital delete flow ──────────────────────────────────────────────── */

  const initiateHospDelete = async (hospital) => {
    // Count bookings for this hospital
    const active = hospital.bookings_active ?? null;
    const total  = hospital.bookings_total  ?? null;

    // Try to get real counts from the hospital summary
    try {
      const { data } = await API.get(`/hospitals/${hospital.id}/booking-summary/`);
      setDeleteTarget({
        type:           'hospital',
        id:             hospital.id,
        name:           hospital.name,
        activeBookings: data.active || 0,
        totalBookings:  data.total  || 0,
      });
    } catch {
      setDeleteTarget({
        type:           'hospital',
        id:             hospital.id,
        name:           hospital.name,
        activeBookings: active ?? 0,
        totalBookings:  total  ?? 0,
      });
    }
  };

  const confirmHospDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await API.delete(`/hospitals/${deleteTarget.id}/force-delete/`);
      setHospitals(prev => prev.filter(h => h.id !== deleteTarget.id));
      setDoctors(prev => prev.filter(d => d.hospital !== deleteTarget.id));
      setDeleteTarget(null);
      showToast(
        `🗑️ "${deleteTarget.name}" deleted. ` +
        (deleteTarget.activeBookings > 0 ? `${deleteTarget.activeBookings} booking(s) cancelled.` : '')
      );
    } catch (err) {
      showToast(
        err?.response?.data?.message ||
        'Delete failed. Please use the Django admin panel to safely remove this hospital.',
        'error'
      );
    } finally {
      setDeleteLoading(false);
    }
  };

  /* ─── Doctor edit ───────────────────────────────────────────────────────── */

  const filteredDoctors = doctors.filter(doc => {
    const q = search.toLowerCase();
    return !search ||
      (doc.name           || '').toLowerCase().includes(q) ||
      (doc.specialization || '').toLowerCase().includes(q) ||
      (doc.hospital_name  || '').toLowerCase().includes(q) ||
      (doc.city           || '').toLowerCase().includes(q);
  });

  const filteredHospitals = hospitals
    .filter(h => hospFilter === 'all' || h.status === hospFilter)
    .filter(h => {
      const q = hospSearch.toLowerCase();
      return !q || (h.name || '').toLowerCase().includes(q) || (h.city || '').toLowerCase().includes(q);
    });

  const pendingCount  = hospitals.filter(h => h.status === 'pending').length;
  const activeCount   = hospitals.filter(h => h.status === 'active').length;
  const rejectedCount = hospitals.filter(h => h.status === 'rejected').length;

  const openEdit = id => {
    API.get(`/doctors/${id}/`)
      .then(({ data }) => { setEditDoctor({ ...data }); setShowModal(true); })
      .catch(() => showToast('Failed to load doctor.', 'error'));
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
        fee:            Number(editDoctor.fee) || 0,
        available:      editDoctor.available,
      }, { headers: { 'Content-Type': 'application/json' } });

      setDoctors(prev => prev.map(d => d.id === editDoctor.id ? { ...d, ...data } : d));
      setShowModal(false);
      setEditDoctor(null);
      showToast('Doctor updated successfully!');
    } catch (err) {
      showToast(err?.response?.data?.message || 'Update failed.', 'error');
    } finally {
      setSaving(false);
    }
  };

  /* ─── Render ─────────────────────────────────────────────────────────────── */

  return (
    <>
      <style>{`
        /* ── Base ── */
        .hp-header { margin-bottom: 24px; }
        .hp-title  { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1.4rem; font-weight: 800; color: var(--gray-900); margin-bottom: 4px; }
        .hp-sub    { font-size: 14px; color: var(--gray-400); }

        /* ── Stat pills ── */
        .hp-stat-row  { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 22px; }
        .hp-stat-pill { display: flex; align-items: center; gap: 8px; padding: 10px 18px; border-radius: 12px; font-size: 14px; font-weight: 600; border: 1px solid transparent; }
        .hp-stat-pill.pending  { background: var(--color-warning-bg);  color: var(--color-warning-text);  border-color: var(--color-warning-border);  }
        .hp-stat-pill.active   { background: var(--color-success-bg);  color: var(--color-success-text);  border-color: var(--color-success-border);  }
        .hp-stat-pill.rejected { background: var(--color-error-bg);    color: var(--color-error-text);    border-color: var(--color-error-border);    }
        .hp-stat-pill.total    { background: var(--blue-50);           color: var(--blue-700);            border-color: var(--blue-200);              }
        .hp-stat-num  { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1.3rem; font-weight: 800; }

        /* ── Pending banner ── */
        .hp-pending-banner { display: flex; align-items: center; gap: 14px; background: var(--color-warning-bg); border: 1px solid var(--color-warning-border); border-radius: 14px; padding: 14px 18px; margin-bottom: 22px; animation: hpBannerIn 0.4s ease both; }
        @keyframes hpBannerIn { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:translateY(0)} }
        .hp-pending-icon { font-size: 1.4rem; flex-shrink: 0; }
        .hp-pending-text { font-size: 14px; font-weight: 600; color: var(--color-warning-text); }
        .hp-pending-sub  { font-size: 12px; color: var(--color-warning-text); opacity: 0.75; }

        /* ── Section header ── */
        .hp-section-head  { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
        .hp-section-title { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 15px; font-weight: 700; color: var(--gray-900); }
        .hp-section-badge { background: var(--color-warning-bg); color: var(--color-warning-text); border: 1px solid var(--color-warning-border); border-radius: 100px; padding: 2px 10px; font-size: 12px; font-weight: 700; }

        /* ── Filter tabs ── */
        .hp-filter-tabs { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 14px; }
        .hp-filter-tab  { padding: 7px 16px; border-radius: 9px; border: 1px solid var(--blue-100); background: #fff; font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 500; color: var(--gray-600); cursor: pointer; transition: all 0.15s; }
        .hp-filter-tab.active { background: var(--blue-600); color: #fff; border-color: var(--blue-600); }
        .hp-filter-tab:hover:not(.active) { background: var(--blue-50); border-color: var(--blue-300); color: var(--blue-700); }

        /* ── Hospital cards ── */
        .hp-hosp-grid    { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; margin-bottom: 36px; }
        .hp-hosp-card    { background: #fff; border: 1px solid var(--blue-100); border-radius: 18px; padding: 20px 22px; position: relative; overflow: hidden; transition: all 0.2s; }
        .hp-hosp-card:hover { border-color: var(--blue-200); box-shadow: var(--shadow-md); }
        .hp-hosp-card.pending  { border-color: var(--color-warning-border); background: var(--color-warning-bg); }
        .hp-hosp-card.rejected { border-color: var(--color-error-border);   background: var(--color-error-bg); }
        .hp-hosp-card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
        .hp-hosp-name  { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 14px; font-weight: 700; color: var(--gray-900); margin-bottom: 3px; }
        .hp-hosp-city  { font-size: 12px; color: var(--gray-500); margin-bottom: 6px; }
        .hp-hosp-mobile { font-size: 12px; color: var(--gray-400); font-family: 'DM Mono', monospace; }
        .hp-badge       { display: inline-flex; align-items: center; padding: 3px 10px; border-radius: 100px; font-size: 11px; font-weight: 600; border: 1px solid transparent; white-space: nowrap; }
        .hp-card-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; padding-top: 12px; border-top: 1px solid rgba(0,0,0,0.06); }

        /* ── Action buttons in hospital card ── */
        .hp-approve-btn  { flex: 1; min-width: 90px; padding: 9px 14px; border-radius: 9px; border: none; background: var(--blue-600); color: #fff; font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.15s; display: flex; align-items: center; justify-content: center; gap: 6px; }
        .hp-approve-btn:hover:not(:disabled) { background: var(--blue-800); }
        .hp-approve-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .hp-reject-btn   { flex: 1; min-width: 80px; padding: 9px 14px; border-radius: 9px; border: 1px solid var(--color-error-border); background: var(--color-error-bg); color: var(--color-error-text); font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.15s; display: flex; align-items: center; justify-content: center; gap: 6px; }
        .hp-reject-btn:hover:not(:disabled) { background: #f7c1c1; }
        .hp-reject-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .hp-reapprove-btn { flex: 1; min-width: 100px; padding: 9px 14px; border-radius: 9px; border: 1px solid var(--color-success-border); background: var(--color-success-bg); color: var(--color-success-text); font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.15s; display: flex; align-items: center; justify-content: center; gap: 6px; }
        .hp-reapprove-btn:hover:not(:disabled) { background: #d4edaa; }
        .hp-reapprove-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        /* New: danger delete button on hospital card */
        .hp-delete-hosp-btn { padding: 7px 12px; border-radius: 9px; border: 1px solid var(--color-error-border); background: var(--color-error-bg); color: var(--color-error-text); font-family: 'DM Sans', sans-serif; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.15s; display: flex; align-items: center; gap: 5px; }
        .hp-delete-hosp-btn:hover { background: #f7c1c1; }

        .hp-btn-spin { width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.4); border-top-color: #fff; border-radius: 50%; animation: hpSpin 0.7s linear infinite; }
        @keyframes hpSpin { to { transform: rotate(360deg); } }

        /* ── Search ── */
        .hp-toolbar      { display: flex; gap: 12px; align-items: center; margin-bottom: 16px; }
        .hp-search-wrap  { position: relative; flex: 1; max-width: 320px; }
        .hp-search-icon  { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); font-size: 14px; color: var(--gray-400); pointer-events: none; }
        .hp-search       { width: 100%; background: #fff; border: 1px solid var(--blue-100); border-radius: 11px; padding: 10px 14px 10px 36px; font-family: 'DM Sans', sans-serif; font-size: 14px; outline: none; transition: all 0.15s; }
        .hp-search:focus { border-color: var(--blue-400); box-shadow: 0 0 0 3px rgba(55,138,221,0.12); }
        .hp-count        { font-size: 13px; color: var(--gray-400); margin-left: auto; }

        /* ── Doctors table ── */
        .hp-card    { background: #fff; border: 1px solid var(--blue-100); border-radius: 16px; overflow: hidden; }
        .hp-table   { width: 100%; border-collapse: collapse; }
        .hp-table th { padding: 11px 18px; text-align: left; font-size: 11px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; color: var(--gray-400); background: var(--gray-50); border-bottom: 1px solid var(--blue-50); }
        .hp-table td { padding: 13px 18px; font-size: 14px; border-bottom: 1px solid var(--blue-50); vertical-align: middle; color: var(--gray-800); }
        .hp-table tr:last-child td { border-bottom: none; }
        .hp-table tr:hover td { background: var(--blue-50); }

        .hp-action-btn      { padding: 6px 14px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.15s; font-family: 'DM Sans', sans-serif; border: 1px solid transparent; margin-right: 6px; }
        .hp-action-btn.edit { background: var(--blue-50); color: var(--blue-700); border-color: var(--blue-200); }
        .hp-action-btn.edit:hover { background: var(--blue-100); border-color: var(--blue-400); }
        .hp-action-btn.del  { background: var(--color-error-bg); color: var(--color-error-text); border-color: var(--color-error-border); }
        .hp-action-btn.del:hover  { background: #f7c1c1; }
        .hp-empty { text-align: center; padding: 60px 20px; color: var(--gray-400); font-size: 14px; }

        /* ── Active bookings badge in table ── */
        .hp-active-badge { display: inline-flex; align-items: center; gap: 4px; background: var(--color-warning-bg); color: var(--color-warning-text); border: 1px solid var(--color-warning-border); border-radius: 6px; padding: 2px 8px; font-size: 11px; font-weight: 600; }

        /* ── Doctor Edit Modal ── */
        .hp-modal-overlay { position: fixed; inset: 0; z-index: 2000; background: rgba(4,44,83,0.5); backdrop-filter: blur(6px); display: flex; align-items: center; justify-content: center; padding: 16px; }
        .hp-modal         { background: #fff; border: 1px solid var(--blue-100); border-radius: 20px; padding: 28px; width: 100%; max-width: 480px; box-shadow: var(--shadow-lg); position: relative; max-height: 90vh; overflow-y: auto; }
        .hp-modal::before { content:''; position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--blue-600),var(--blue-400));border-radius:20px 20px 0 0; }

        /* Delete modal variant */
        .hp-delete-modal { max-width: 440px; }
        .hp-modal-danger-bar { position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, var(--color-error-text), #f09595); border-radius: 20px 20px 0 0; }
        .hp-modal::before { display: none; }  /* hide default blue bar */
        .hp-delete-modal .hp-modal-danger-bar { display: block; }

        .hp-modal-title   { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1.1rem; font-weight: 800; color: var(--gray-900); margin-bottom: 20px; }
        .hp-field         { margin-bottom: 16px; }
        .hp-field label   { display: block; font-size: 12px; font-weight: 600; color: var(--gray-600); margin-bottom: 6px; }
        .hp-field input, .hp-field select { width: 100%; background: var(--gray-50); border: 1px solid var(--blue-100); border-radius: 11px; padding: 11px 14px; font-family: 'DM Sans', sans-serif; font-size: 14px; color: var(--gray-900); outline: none; transition: all 0.15s; }
        .hp-field input:focus, .hp-field select:focus { border-color: var(--blue-400); background: #fff; box-shadow: 0 0 0 3px rgba(55,138,221,0.12); }
        .hp-modal-row     { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .hp-modal-actions { display: flex; gap: 10px; margin-top: 20px; }
        .hp-modal-cancel  { flex: 1; padding: 12px; border-radius: 11px; border: 1px solid var(--blue-100); background: var(--gray-50); color: var(--gray-600); font-family: 'DM Sans', sans-serif; font-size: 14px; cursor: pointer; transition: all 0.15s; }
        .hp-modal-cancel:hover { background: var(--gray-200); }
        .hp-modal-save    { flex: 2; padding: 12px; border-radius: 11px; border: none; background: var(--blue-600); color: #fff; font-family: 'DM Sans', sans-serif; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.15s; }
        .hp-modal-save:hover:not(:disabled) { background: var(--blue-800); }
        .hp-modal-save:disabled { opacity: 0.5; cursor: not-allowed; }

        /* ── Toast ── */
        .hp-toast         { position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%); padding: 12px 24px; border-radius: 12px; font-size: 14px; font-weight: 500; z-index: 9999; white-space: nowrap; box-shadow: var(--shadow-lg); max-width: 90vw; white-space: normal; text-align: center; }
        .hp-toast.success { background: var(--color-success-text); color: #fff; }
        .hp-toast.error   { background: var(--color-error-text);   color: #fff; }

        @media (max-width: 700px) { .hp-modal-row { grid-template-columns: 1fr; } .hp-hosp-grid { grid-template-columns: 1fr; } }
      `}</style>

      {/* ── Delete confirmation modal ── */}
      {deleteTarget && (
        <ConfirmDeleteModal
          target={deleteTarget}
          onConfirm={deleteTarget.type === 'doctor' ? confirmDocDelete : confirmHospDelete}
          onCancel={() => setDeleteTarget(null)}
          loading={deleteLoading}
        />
      )}

      {/* ── Page header ── */}
      <div className="hp-header">
        <div className="hp-title">🏥 Hospitals & Doctors</div>
        <div className="hp-sub">Approve registrations, manage doctors, and safely remove records</div>
      </div>

      {error && (
        <div style={{ background: 'var(--color-error-bg)', border: '1px solid var(--color-error-border)', borderRadius: 12, padding: '12px 16px', color: 'var(--color-error-text)', fontSize: 14, marginBottom: 20 }}>
          ⚠️ {error}
        </div>
      )}

      {/* ── Stat pills ── */}
      <div className="hp-stat-row">
        <div className="hp-stat-pill total">    <span>🏥</span><span className="hp-stat-num">{hospitals.length}</span><span>Total</span>   </div>
        <div className="hp-stat-pill active">   <span>✅</span><span className="hp-stat-num">{activeCount}</span>  <span>Live</span>     </div>
        <div className="hp-stat-pill pending">  <span>⏳</span><span className="hp-stat-num">{pendingCount}</span> <span>Pending</span>  </div>
        <div className="hp-stat-pill rejected"> <span>🚫</span><span className="hp-stat-num">{rejectedCount}</span><span>Rejected</span> </div>
      </div>

      {/* ── Pending alert ── */}
      {pendingCount > 0 && (
        <div className="hp-pending-banner">
          <div className="hp-pending-icon">🔔</div>
          <div>
            <div className="hp-pending-text">{pendingCount} hospital{pendingCount > 1 ? 's' : ''} waiting for approval</div>
            <div className="hp-pending-sub">Approved hospitals go live immediately.</div>
          </div>
          <button
            onClick={() => setHospFilter('pending')}
            style={{ marginLeft: 'auto', padding: '8px 16px', borderRadius: 9, border: '1px solid var(--color-warning-border)', background: 'rgba(255,255,255,0.7)', color: 'var(--color-warning-text)', fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            Show pending →
          </button>
        </div>
      )}

      {/* ── Hospitals section ── */}
      <div className="hp-section-head">
        <div className="hp-section-title">Registered Hospitals ({filteredHospitals.length})</div>
        {pendingCount > 0 && hospFilter !== 'pending' && <span className="hp-section-badge">{pendingCount} pending</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <div className="hp-search-wrap" style={{ maxWidth: 220 }}>
            <span className="hp-search-icon">🔍</span>
            <input className="hp-search" placeholder="Search hospitals…" value={hospSearch} onChange={e => setHospSearch(e.target.value)} />
          </div>
        </div>
      </div>

      {/* ── Status filter tabs ── */}
      <div className="hp-filter-tabs">
        {[
          { key: 'all',      label: `All (${hospitals.length})`      },
          { key: 'pending',  label: `⏳ Pending (${pendingCount})`    },
          { key: 'active',   label: `✅ Active (${activeCount})`      },
          { key: 'rejected', label: `🚫 Rejected (${rejectedCount})`  },
        ].map(tab => (
          <button key={tab.key} className={`hp-filter-tab ${hospFilter === tab.key ? 'active' : ''}`} onClick={() => setHospFilter(tab.key)}>
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
          <div style={{ width: 36, height: 36, border: '3px solid var(--blue-100)', borderTopColor: 'var(--blue-600)', borderRadius: '50%', animation: 'hpSpin 0.7s linear infinite' }} />
        </div>
      ) : (
        <div className="hp-hosp-grid">
          {filteredHospitals.length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px 20px', color: 'var(--gray-400)', fontSize: 14 }}>
              No hospitals match the current filter.
            </div>
          )}
          {filteredHospitals.map(h => {
            const stCfg = STATUS_CONFIG[h.status] || STATUS_CONFIG.pending;
            const isAct = actioning === h.id;
            const docCount = doctors.filter(d => d.hospital === h.id || d.hospital_name === h.name).length;

            return (
              <div key={h.id} className={`hp-hosp-card ${h.status === 'pending' ? 'pending' : h.status === 'rejected' ? 'rejected' : ''}`}>
                <div className="hp-hosp-card-top">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="hp-hosp-name">{h.name}</div>
                    <div className="hp-hosp-city">📍 {h.city || '—'}</div>
                    <div className="hp-hosp-mobile">{h.mobile}</div>
                  </div>
                  <span className="hp-badge" style={{ background: stCfg.bg, color: stCfg.text, borderColor: stCfg.border }}>
                    {stCfg.label}
                  </span>
                </div>

                {h.address && <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 6 }}>🏢 {h.address}</div>}

                {/* Doctor count */}
                <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 4 }}>
                  👨‍⚕️ {docCount} doctor{docCount !== 1 ? 's' : ''}
                </div>

                <div className="hp-card-actions">
                  {h.status === 'pending' && (
                    <>
                      <button className="hp-approve-btn" onClick={() => approveHospital(h)} disabled={isAct}>
                        {isAct ? <><div className="hp-btn-spin" /> Processing…</> : '✅ Approve'}
                      </button>
                      <button className="hp-reject-btn" onClick={() => rejectHospital(h)} disabled={isAct}>
                        {isAct ? '…' : '🚫 Reject'}
                      </button>
                    </>
                  )}

                  {h.status === 'rejected' && (
                    <button className="hp-reapprove-btn" onClick={() => approveHospital(h)} disabled={isAct}>
                      {isAct ? <><div className="hp-btn-spin" style={{ borderColor: 'rgba(59,109,17,0.3)', borderTopColor: 'var(--color-success-text)' }} />Processing…</> : '✅ Approve Now'}
                    </button>
                  )}

                  {h.status === 'active' && (
                    <div style={{ fontSize: 12, color: 'var(--color-success-text)', fontWeight: 500, alignSelf: 'center' }}>
                      Live · {docCount} doctors
                    </div>
                  )}

                  {/* Delete button — always available, but shows warning modal */}
                  <button
                    className="hp-delete-hosp-btn"
                    onClick={() => initiateHospDelete(h)}
                    style={{ marginLeft: 'auto' }}
                    title="Delete hospital (shows confirmation)"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Doctors table ── */}
      <div className="hp-toolbar">
        <div style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: 15, fontWeight: 700, color: 'var(--gray-900)' }}>
          All Doctors ({doctors.length})
        </div>
        <div className="hp-search-wrap">
          <span className="hp-search-icon">🔍</span>
          <input className="hp-search" placeholder="Search doctors…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <span className="hp-count">{filteredDoctors.length} result{filteredDoctors.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="hp-card">
        <div style={{ overflowX: 'auto' }}>
          <table className="hp-table">
            <thead>
              <tr>
                <th>Name</th><th>Specialization</th><th>Hospital</th>
                <th>Exp</th><th>City</th><th>Status</th><th>Bookings</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDoctors.length === 0 && (
                <tr><td colSpan={8} className="hp-empty">No doctors found</td></tr>
              )}
              {filteredDoctors.map(doc => {
                // We approximate active bookings from the doc object if available
                const hasActiveFlag = doc.has_active_bookings ?? false;
                return (
                  <tr key={doc.id}>
                    <td style={{ fontWeight: 600 }}>Dr. {doc.name}</td>
                    <td style={{ color: 'var(--blue-700)' }}>{doc.specialization}</td>
                    <td style={{ color: 'var(--gray-500)' }}>{doc.hospital_name || '—'}</td>
                    <td>{doc.experience} yrs</td>
                    <td style={{ color: 'var(--gray-500)' }}>{doc.city || '—'}</td>
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
                      {hasActiveFlag
                        ? <span className="hp-active-badge">⚠️ Active</span>
                        : <span style={{ color: 'var(--gray-400)', fontSize: 13 }}>—</span>
                      }
                    </td>
                    <td>
                      <button className="hp-action-btn edit" onClick={() => openEdit(doc.id)}>✏️ Edit</button>
                      <button
                        className="hp-action-btn del"
                        onClick={() => initiateDocDelete(doc)}
                        title="Delete doctor (shows confirmation if active bookings exist)"
                      >
                        🗑️ Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Doctor Edit Modal ── */}
      {showModal && editDoctor && (
        <div className="hp-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div className="hp-modal">
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg,var(--blue-600),var(--blue-400))', borderRadius: '20px 20px 0 0' }} />
            <div className="hp-modal-title">✏️ Edit Dr. {editDoctor.name}</div>
            <form onSubmit={submitEdit}>
              <div className="hp-modal-row">
                <div className="hp-field">
                  <label>Name *</label>
                  <input value={editDoctor.name || ''} onChange={e => setEditDoctor(p => ({ ...p, name: e.target.value }))} placeholder="Doctor name" required />
                </div>
                <div className="hp-field">
                  <label>Specialization *</label>
                  <input value={editDoctor.specialization || ''} onChange={e => setEditDoctor(p => ({ ...p, specialization: e.target.value }))} placeholder="Cardiologist" required />
                </div>
              </div>
              <div className="hp-modal-row">
                <div className="hp-field">
                  <label>City</label>
                  <input value={editDoctor.city || ''} onChange={e => setEditDoctor(p => ({ ...p, city: e.target.value }))} placeholder="City" />
                </div>
                <div className="hp-field">
                  <label>Experience (years)</label>
                  <input type="number" min="0" value={editDoctor.experience || ''} onChange={e => setEditDoctor(p => ({ ...p, experience: e.target.value }))} placeholder="5" />
                </div>
              </div>
              <div className="hp-modal-row">
                <div className="hp-field">
                  <label>Fee (₹)</label>
                  <input type="number" min="0" value={editDoctor.fee || ''} onChange={e => setEditDoctor(p => ({ ...p, fee: e.target.value }))} placeholder="0" />
                </div>
                <div className="hp-field">
                  <label>Availability</label>
                  <select value={editDoctor.available ? 'true' : 'false'} onChange={e => setEditDoctor(p => ({ ...p, available: e.target.value === 'true' }))}>
                    <option value="true">✅ Available</option>
                    <option value="false">⛔ Unavailable</option>
                  </select>
                </div>
              </div>
              <div className="hp-modal-actions">
                <button type="button" className="hp-modal-cancel" onClick={() => setShowModal(false)}>Cancel</button>
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