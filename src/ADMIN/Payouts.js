import { useCallback, useEffect, useState } from 'react';
import API from '../services/api';

// Doctors we owe money to. Payouts are manual: you wire the money from
// TokenWalla's own bank account / UPI, then mark it paid here so the ledger
// stops showing it as outstanding.

const CSV_COLS = ['Recipient', 'Mode', 'UPI ID', 'Account Number', 'IFSC', 'Amount', 'Remarks'];

// A name a doctor typed themselves lands in a file a human opens in Excel, so
// neutralise the formula-trigger characters before quoting.
const csvCell = (v) => {
  const s = String(v ?? '');
  return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
};

// Bulk-transfer file for the bank's upload. Rows with no rail (`mode` null)
// have nowhere to send the money, so they stay off the file — same rows the
// table badges as "No details on file".
export const buildPayoutCsv = (rows) => [
  CSV_COLS,
  ...rows.filter(r => r.mode).map(r => [
    r.recipient_name,
    r.mode,
    r.upi_vpa || '',
    r.account_number || '',
    r.ifsc || '',
    Number(r.pending_amount).toFixed(2),
    `TokenWalla payout ${r.doctor_name}`,
  ]),
].map(cols => cols.map(csvCell).join(',')).join('\r\n');

const Payouts = () => {
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [paying,  setPaying]  = useState(null);   // doctor_id being marked paid

  const fetchPending = useCallback(() => {
    setLoading(true);
    API.get('/payment/payouts/pending/')
      .then(({ data }) => { setRows(data.payouts || []); setError(''); })
      .catch(() => setError('Failed to load pending payouts.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(fetchPending, [fetchPending]);

  const total = rows.reduce((a, r) => a + Number(r.pending_amount || 0), 0);

  const copy = (text) => navigator.clipboard?.writeText(text);

  const payable = rows.filter(r => r.mode).length;

  const downloadCsv = () => {
    const url = URL.createObjectURL(
      new Blob([buildPayoutCsv(rows)], { type: 'text/csv;charset=utf-8' })
    );
    const a = Object.assign(document.createElement('a'), {
      href: url,
      download: `tokenwalla-payouts-${new Date().toISOString().slice(0, 10)}.csv`,
    });
    a.click();
    URL.revokeObjectURL(url);
  };

  const markPaid = async (row) => {
    const ok = window.confirm(
      `Confirm you have ALREADY transferred ₹${row.pending_amount} to ${row.recipient_name}.\n\n` +
      `This only records the payment — it does not send any money.`
    );
    if (!ok) return;
    const reference = window.prompt('UTR / transaction reference (optional):', '') ?? '';

    setPaying(row.doctor_id);
    try {
      await API.post('/payment/payouts/mark-paid/', {
        doctor_id: row.doctor_id,
        reference: reference.trim(),
      });
      fetchPending();
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not record the payout.');
    } finally {
      setPaying(null);
    }
  };

  return (
    <>
      <style>{`
        .po-header { margin-bottom: 24px; }
        .po-title { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1.4rem; font-weight: 800; color: var(--gray-900); margin-bottom: 4px; }
        .po-sub { font-size: 14px; color: var(--gray-400); }
        .po-note { display: flex; gap: 10px; background: var(--blue-50); border: 1px solid var(--blue-100); border-radius: 12px; padding: 12px 16px; font-size: 13px; color: var(--blue-700); line-height: 1.6; margin-bottom: 20px; }
        .po-stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 24px; max-width: 520px; }
        .po-stat { background: #fff; border: 1px solid var(--blue-100); border-radius: 16px; padding: 20px 22px; position: relative; overflow: hidden; }
        .po-stat::before { content:''; position:absolute; top:0;left:0;right:0;height:3px; background: var(--blue-600); }
        .po-stat.due::before { background: var(--color-warning-text); }
        .po-stat-val { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1.8rem; font-weight: 800; color: var(--gray-900); line-height: 1; margin-bottom: 4px; }
        .po-stat-label { font-size: 13px; color: var(--gray-500); }
        .po-card { background: #fff; border: 1px solid var(--blue-100); border-radius: 16px; overflow: hidden; }
        .po-table { width: 100%; border-collapse: collapse; }
        .po-table th { padding: 11px 18px; text-align: left; font-size: 11px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; color: var(--gray-400); background: var(--gray-50); border-bottom: 1px solid var(--blue-50); }
        .po-table td { padding: 12px 18px; font-size: 14px; border-bottom: 1px solid var(--blue-50); vertical-align: middle; color: var(--gray-800); }
        .po-table tr:last-child td { border-bottom: none; }
        .po-table tr:hover td { background: var(--blue-50); }
        .po-badge { display: inline-flex; align-items: center; padding: 3px 10px; border-radius: 100px; font-size: 12px; font-weight: 600; background: var(--blue-50); color: var(--blue-700); border: 1px solid var(--blue-200); }
        .po-badge.none { background: var(--color-warning-bg); color: var(--color-warning-text); border-color: var(--color-warning-border); }
        .po-acct { margin-top: 6px; font-size: 12px; line-height: 1.5; color: var(--gray-600); font-family: ui-monospace, monospace; cursor: pointer; }
        .po-acct:hover { color: var(--blue-700); }
        .po-amount { font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 800; color: var(--blue-600); }
        .po-btn { padding: 8px 14px; border-radius: 10px; border: none; background: var(--blue-600); color: #fff; font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.15s; white-space: nowrap; }
        .po-btn:hover:not(:disabled) { background: var(--blue-800); }
        .po-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .po-btn.ghost { background: #fff; color: var(--blue-700); border: 1px solid var(--blue-200); }
        .po-btn.ghost:hover:not(:disabled) { background: var(--blue-50); }
        .po-toolbar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 12px 18px; border-bottom: 1px solid var(--blue-50); }
        .po-toolbar-note { font-size: 12px; color: var(--gray-400); }
        .po-empty { text-align: center; padding: 60px 20px; color: var(--gray-400); font-size: 14px; }
        @media (max-width: 700px) { .po-stats { grid-template-columns: 1fr; } }
      `}</style>

      <div className="po-header">
        <div className="po-title"><i className="bi bi-cash-stack me-1" />Doctor Payouts</div>
        <div className="po-sub">Money TokenWalla owes each doctor for completed consultations</div>
      </div>

      <div className="po-note">
        <span>ℹ️</span>
        <span>
          Payouts are <strong>manual</strong>. Transfer the amount from TokenWalla's
          bank account or UPI yourself, then click <strong>Mark Paid</strong> so the
          ledger clears. Nothing on this page moves money.
        </span>
      </div>

      {error && (
        <div style={{ background: 'var(--color-error-bg)', border: '1px solid var(--color-error-border)', borderRadius: 12, padding: '12px 16px', color: 'var(--color-error-text)', fontSize: 14, marginBottom: 20 }}>
          <i className="bi bi-exclamation-triangle me-1" />{error}
        </div>
      )}

      <div className="po-stats">
        <div className="po-stat due">
          <div style={{ fontSize: '1.4rem', marginBottom: 8 }}><i className="bi bi-cash-coin me-1" /></div>
          <div className="po-stat-val">₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          <div className="po-stat-label">Total Outstanding</div>
        </div>
        <div className="po-stat">
          <div style={{ fontSize: '1.4rem', marginBottom: 8 }}><i className="bi bi-clipboard-pulse me-1" /></div>
          <div className="po-stat-val">{rows.length}</div>
          <div className="po-stat-label">Doctors Awaiting Payment</div>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
          <div style={{ width: 36, height: 36, border: '3px solid var(--blue-100)', borderTopColor: 'var(--blue-600)', borderRadius: '50%', animation: 'poSpin 0.7s linear infinite' }} />
          <style>{`@keyframes poSpin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : (
        <div className="po-card">
          <div className="po-toolbar">
            <button className="po-btn ghost" onClick={downloadCsv} disabled={!payable}>
              <i className="bi bi-download me-1" />Export bulk-transfer CSV
            </button>
            <span className="po-toolbar-note">
              {payable} of {rows.length} payable
              {payable < rows.length && ' — the rest have no account on file'}
            </span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="po-table">
              <thead>
                <tr>
                  <th>Doctor</th>
                  <th>Hospital</th>
                  <th>Pay To</th>
                  <th>Pay Into</th>
                  <th>Amount Due</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={6} className="po-empty"><i className="bi bi-stars me-1" />Everyone is paid up — nothing outstanding</td></tr>
                )}
                {rows.map(r => (
                  <tr key={r.doctor_id}>
                    <td style={{ fontWeight: 500 }}>{r.doctor_name}</td>
                    <td style={{ color: 'var(--gray-500)' }}>{r.hospital_name || '—'}</td>
                    <td>
                      {r.recipient_name}
                      {r.pay_to === 'hospital' && (
                        <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--gray-400)' }}>
                          (hospital account)
                        </span>
                      )}
                    </td>
                    <td>
                      {r.mode
                        ? <span className="po-badge">{r.mode}</span>
                        : <span className="po-badge none">No details on file</span>}
                      {r.mode === 'UPI' && r.upi_vpa && (
                        <div className="po-acct" title="Click to copy" onClick={() => copy(r.upi_vpa)}>
                          {r.upi_vpa}
                        </div>
                      )}
                      {r.mode === 'IMPS' && (
                        <div className="po-acct" title="Click to copy" onClick={() => copy(`${r.account_number} ${r.ifsc}`)}>
                          {r.bank_name && <>{r.bank_name}<br /></>}
                          A/C {r.account_number}<br />
                          IFSC {r.ifsc}
                        </div>
                      )}
                    </td>
                    <td className="po-amount">₹{Number(r.pending_amount).toFixed(2)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="po-btn"
                        onClick={() => markPaid(r)}
                        disabled={paying === r.doctor_id}
                      >
                        {paying === r.doctor_id ? 'Recording…' : 'Mark Paid'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
};

export default Payouts;
