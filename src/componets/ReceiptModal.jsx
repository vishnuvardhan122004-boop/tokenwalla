import { useEffect, useState } from 'react';
import API from '../services/api';

// GST-compliant receipt viewer for GET /api/payment/receipt/<bookingId>/ —
// the backend already computes and marks up every line (SAC codes, the
// doctor-fee GST exemption, the combined GST on platform+gateway); this only
// renders it and offers a print/Save-as-PDF path via the browser's own print
// dialog, so no PDF library is needed.
export default function ReceiptModal({ booking, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setData(null);
    setError('');
    API.get(`/payment/receipt/${booking.id}/`)
      .then((res) => { if (alive) setData(res.data); })
      .catch((err) => {
        if (!alive) return;
        setError(err.response?.data?.message || 'Could not load the receipt.');
      });
    return () => { alive = false; };
  }, [booking.id]);

  return (
    <div className="rc-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rc-modal">
        <div className="rc-modal-inner">
          {!data && !error && <div className="rc-status">Loading receipt…</div>}
          {error && <div className="rc-status rc-error">{error}</div>}
          {data && (
            <>
              <div className="rc-head">
                <div>
                  <div className="rc-brand">Token<span>walla</span></div>
                  {data.seller.gstin && <div className="rc-gstin">GSTIN: {data.seller.gstin}</div>}
                </div>
                <div className="rc-head-right">
                  <div className="rc-receipt-no">{data.receipt_no}</div>
                  <div className="rc-issued">{data.issued_at}</div>
                </div>
              </div>

              <div className="rc-booking-grid">
                <div><span>Patient</span><strong>{data.booking.patient}</strong></div>
                <div><span>Provider</span><strong>{data.booking.doctor}</strong></div>
                <div><span>Hospital</span><strong>{data.booking.hospital}</strong></div>
                <div><span>Date &amp; slot</span><strong>{data.booking.date} · {data.booking.slot}</strong></div>
                <div><span>Token</span><strong>{data.booking.token}</strong></div>
                <div><span>Payment ID</span><strong className="rc-mono">{data.payment_id || '—'}</strong></div>
              </div>

              <div className="rc-table-wrap">
                <table className="rc-table">
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th>SAC</th>
                      <th>Taxable value</th>
                      <th>GST</th>
                      <th>GST amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.line_items.map((li, i) => (
                      <tr key={i}>
                        <td>
                          {li.description}
                          {li.note && <div className="rc-note">{li.note}</div>}
                        </td>
                        <td>{li.sac_code || '—'}</td>
                        <td>₹{li.taxable_value}</td>
                        <td>{li.gst_rate}</td>
                        <td>{li.gst_amount == null ? '—' : `₹${li.gst_amount}`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="rc-summary">
                <div><span>Taxable value</span><span>₹{data.taxable_value}</span></div>
                <div><span>GST ({data.gst.rate})</span><span>₹{data.gst.amount}</span></div>
                <div className="rc-total"><span>Total</span><span>₹{data.total}</span></div>
              </div>

              {data.pass && (
                <div className="rc-pass-note">
                  Appointment Pass #{data.pass.id} —{' '}
                  {data.pass.role === 'purchase' ? 'purchased with this booking' : 'redeemed against this booking'}
                </div>
              )}
              {data.note && <div className="rc-pass-note">{data.note}</div>}

              <div className="rc-footer">Computer-generated receipt · support@tokenwalla.com</div>
            </>
          )}
        </div>

        <div className="rc-actions">
          <button type="button" className="rc-btn rc-btn-ghost" onClick={onClose}>Close</button>
          <button
            type="button"
            className="rc-btn rc-btn-primary"
            disabled={!data}
            onClick={() => window.print()}
          >
            <i className="bi bi-printer me-1" />Print / Save PDF
          </button>
        </div>
      </div>

      <style>{`
        .rc-overlay { position: fixed; inset: 0; z-index: 2100; background: rgba(4,44,83,0.45); backdrop-filter: blur(6px); display: flex; align-items: center; justify-content: center; padding: 16px; box-sizing: border-box; }
        .rc-modal { background: #fff; border: 1px solid var(--blue-100); border-radius: 20px; width: 100%; max-width: 560px; max-height: 90vh; display: flex; flex-direction: column; box-shadow: var(--shadow-lg); box-sizing: border-box; min-width: 0; }
        .rc-modal-inner { padding: 22px 20px; overflow-y: auto; min-width: 0; }
        .rc-table-wrap { overflow-x: auto; margin-bottom: 16px; }
        .rc-status { padding: 40px 0; text-align: center; color: var(--gray-500); font-size: 14px; }
        .rc-error { color: #B91C1C; }
        .rc-head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px dashed var(--blue-100); padding-bottom: 16px; margin-bottom: 16px; }
        .rc-brand { font-family: var(--font-display); font-size: 18px; font-weight: 800; color: var(--blue-700, #185FA5); }
        .rc-brand span { color: var(--gray-900); }
        .rc-gstin { font-size: 11.5px; color: var(--gray-500); margin-top: 3px; }
        .rc-head-right { text-align: right; }
        .rc-receipt-no { font-size: 13px; font-weight: 700; color: var(--gray-900); font-family: monospace; }
        .rc-issued { font-size: 11.5px; color: var(--gray-500); margin-top: 3px; }
        .rc-booking-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 16px; margin-bottom: 20px; }
        .rc-booking-grid div { display: flex; flex-direction: column; gap: 2px; }
        .rc-booking-grid span { font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: .4px; color: var(--gray-400); }
        .rc-booking-grid strong { font-size: 13.5px; color: var(--gray-800); font-weight: 600; }
        .rc-mono { font-family: monospace; font-size: 12px !important; }
        .rc-table { width: 100%; min-width: 440px; border-collapse: collapse; font-size: 12.5px; }
        .rc-table th { text-align: left; font-size: 10.5px; text-transform: uppercase; letter-spacing: .4px; color: var(--gray-400); padding: 6px 8px; border-bottom: 1px solid var(--blue-100); }
        .rc-table td { padding: 8px; border-bottom: 1px solid var(--gray-50, #F8FAFC); vertical-align: top; color: var(--gray-800); }
        .rc-table th:nth-child(n+3), .rc-table td:nth-child(n+3) { text-align: right; }
        .rc-note { font-size: 11px; color: var(--gray-400); margin-top: 2px; }
        .rc-summary { margin-left: auto; width: 220px; display: flex; flex-direction: column; gap: 6px; font-size: 13px; margin-bottom: 16px; }
        .rc-summary > div { display: flex; justify-content: space-between; color: var(--gray-600); }
        .rc-total { border-top: 1px solid var(--blue-100); margin-top: 4px; padding-top: 8px; font-weight: 800; font-size: 15px; color: var(--gray-900); }
        .rc-pass-note { font-size: 12px; color: var(--blue-700, #1D4ED8); background: var(--blue-50, #EFF6FF); border-radius: 9px; padding: 9px 12px; margin-bottom: 10px; }
        .rc-footer { text-align: center; font-size: 11px; color: var(--gray-400); margin-top: 10px; }
        .rc-actions { display: flex; gap: 10px; padding: 16px 28px; border-top: 1px solid var(--blue-50, #EFF6FF); }
        .rc-btn { flex: 1; padding: 11px; border-radius: 11px; font-size: 14px; font-weight: 600; cursor: pointer; font-family: inherit; border: none; }
        .rc-btn-ghost { border: 1px solid var(--blue-100); background: var(--gray-50, #F8FAFC); color: var(--gray-600); }
        .rc-btn-primary { background: var(--blue-600, #185FA5); color: #fff; }
        .rc-btn-primary:hover:not(:disabled) { background: var(--blue-800, #124A82); }
        .rc-btn-primary:disabled { opacity: .5; cursor: not-allowed; }

        @media print {
          body * { visibility: hidden; }
          .rc-modal, .rc-modal * { visibility: visible; }
          .rc-overlay { position: absolute; inset: auto; background: none; backdrop-filter: none; padding: 0; }
          .rc-modal { position: absolute; top: 0; left: 0; box-shadow: none; border: none; max-width: 100%; max-height: none; }
          .rc-actions { display: none; }
        }
      `}</style>
    </div>
  );
}
