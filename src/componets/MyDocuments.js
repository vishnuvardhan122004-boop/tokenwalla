// Every document a provider has shared with me, in one list.
//
// The same rows the booking cards already show, but flattened across bookings
// and ordered newest-first — because a patient looking for "my blood report
// from March" does not remember which booking it hung off.
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import API from '../services/api';
import { downloadReport } from '../services/downloadReport';

const fmt = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
};

export default function MyDocuments() {
  const [docs,        setDocs]        = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [downloading, setDownloading] = useState(null);

  useEffect(() => {
    API.get('/bookings/reports/mine/')
      .then(({ data }) => setDocs(Array.isArray(data) ? data : []))
      .catch(() => setError('Could not load your documents. Please try again.'))
      .finally(() => setLoading(false));
  }, []);

  const open = async (doc) => {
    setDownloading(doc.id);
    try {
      await downloadReport(doc);
    } catch {
      setError('Could not download the file. Please try again.');
    } finally {
      setDownloading(null);
    }
  };

  return (
    <>
      <style>{`
        .md-root { font-family: var(--font-body); background: var(--gray-50); min-height: 100vh; padding: 40px 0 80px; }
        .md-head { max-width: 760px; margin: 0 auto 22px; padding: 0 16px; }
        .md-title { font-size: 26px; font-weight: 800; color: var(--gray-900); margin: 0; }
        .md-sub { font-size: 14px; color: var(--gray-500); margin-top: 6px; }
        .md-list { max-width: 760px; margin: 0 auto; padding: 0 16px; display: grid; gap: 10px; }
        .md-card { display: flex; align-items: center; gap: 14px; background: #fff; border: 1px solid var(--blue-100); border-radius: 14px; padding: 14px 16px; }
        .md-icon { width: 40px; height: 40px; flex: none; display: grid; place-items: center; border-radius: 10px; background: var(--blue-50); color: var(--blue-600); font-size: 19px; }
        .md-name { font-size: 14.5px; font-weight: 700; color: var(--gray-900); }
        .md-meta { font-size: 12.5px; color: var(--gray-500); margin-top: 2px; }
        .md-btn { margin-left: auto; flex: none; border: 1px solid var(--blue-200); background: #fff; color: var(--blue-600); border-radius: 100px; font-size: 12.5px; font-weight: 700; padding: 6px 14px; cursor: pointer; }
        .md-btn:disabled { opacity: 0.6; cursor: default; }
        .md-empty { text-align: center; color: var(--gray-500); background: #fff; border: 1px dashed var(--blue-100); border-radius: 14px; padding: 40px 20px; }
      `}</style>

      <div className="md-root">
        <div className="md-head">
          <h1 className="md-title">My documents</h1>
          <div className="md-sub">
            Reports, prescriptions and files shared with you by hospitals, scanning
            centres and blood centres.
          </div>
        </div>

        <div className="md-list">
          {loading && <div className="md-empty">Loading…</div>}
          {!loading && error && <div className="md-empty">{error}</div>}

          {!loading && !error && docs.length === 0 && (
            <div className="md-empty">
              <i className="bi bi-file-earmark-medical" style={{ fontSize: 28, display: 'block', marginBottom: 10 }} />
              Nothing here yet. When a hospital or centre shares a report with you,
              it appears here — and we&apos;ll message you.
              <div style={{ marginTop: 14 }}>
                <Link to="/my-bookings" className="md-btn" style={{ textDecoration: 'none' }}>
                  View my bookings
                </Link>
              </div>
            </div>
          )}

          {docs.map(d => (
            <div className="md-card" key={d.id}>
              <div className="md-icon"><i className="bi bi-file-earmark-medical" /></div>
              <div style={{ minWidth: 0 }}>
                <div className="md-name">{d.title || 'Document'}</div>
                <div className="md-meta">
                  {[d.hospital_name, d.provider_name].filter(Boolean).join(' · ')}
                  {d.created ? ` · ${fmt(d.created)}` : ''}
                </div>
              </div>
              <button className="md-btn" disabled={downloading === d.id} onClick={() => open(d)}>
                {downloading === d.id
                  ? 'Opening…'
                  : <><i className="bi bi-download me-1" />Download</>}
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
