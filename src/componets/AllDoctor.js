import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import API from '../services/api';

function SkeletonCard() {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--blue-100)', borderRadius: 18, overflow: 'hidden' }}>
      <div className="skeleton" style={{ height: 160 }} />
      <div style={{ padding: 18 }}>
        <div className="skeleton" style={{ height: 10, width: '40%', marginBottom: 10 }} />
        <div className="skeleton" style={{ height: 16, width: '70%', marginBottom: 14 }} />
        <div className="skeleton" style={{ height: 12, width: '55%', marginBottom: 8 }} />
        <div className="skeleton" style={{ height: 12, width: '80%', marginBottom: 18 }} />
        <div className="skeleton" style={{ height: 36, borderRadius: 10 }} />
      </div>
    </div>
  );
}

export default function AllDoctor() {
  const [doctors,    setDoctors]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState('');
  const [city,       setCity]       = useState('');
  const [specFilter, setSpecFilter] = useState('All');
  const [availOnly,  setAvailOnly]  = useState(false);
  const [cities,     setCities]     = useState([]);

  useEffect(() => {
    setLoading(true);
    API.get('/doctors/')
      .then(({ data }) => {
        setDoctors(data);
        setCities([...new Set(data.map(d => d.city).filter(Boolean))]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const actualSpecs = ['All', ...new Set(doctors.map(d => d.specialization).filter(Boolean))];

  const filtered = doctors.filter(doc => {
    const q = search.toLowerCase();
    const matchSearch = !search ||
      (doc.name || '').toLowerCase().includes(q) ||
      (doc.specialization || '').toLowerCase().includes(q) ||
      (doc.hospital_name || '').toLowerCase().includes(q) ||
      (doc.city || '').toLowerCase().includes(q);
    const matchCity  = !city || (doc.city || '').toLowerCase().includes(city.toLowerCase());
    const matchSpec  = specFilter === 'All' || (doc.specialization || '').toLowerCase().includes(specFilter.toLowerCase());
    const matchAvail = !availOnly || doc.available;
    return matchSearch && matchCity && matchSpec && matchAvail;
  });

  return (
    <>
      <style>{`
        .ad-root { font-family: 'DM Sans', sans-serif; background: #fff; min-height: 100vh; }

        /* Header */
        .ad-header {
          background: linear-gradient(160deg, #F4F9FF 0%, #EAF3FF 60%, #F8FBFF 100%);
          padding: 64px 0 0; border-bottom: 1px solid var(--blue-100);
          position: relative; overflow: hidden;
        }
        .ad-header-grid {
          position: absolute; inset: 0;
          background-image: linear-gradient(var(--blue-100) 1px, transparent 1px), linear-gradient(90deg, var(--blue-100) 1px, transparent 1px);
          background-size: 48px 48px; opacity: 0.35;
        }
        .ad-header-inner { position: relative; padding-bottom: 28px; }
        .ad-title { font-family: 'Plus Jakarta Sans', sans-serif; font-size: clamp(1.8rem, 4vw, 2.8rem); font-weight: 800; color: var(--gray-900); margin-bottom: 8px; }
        .ad-sub { font-size: 15px; color: var(--gray-500); }

        /* Spec pills */
        .spec-pills { display: flex; gap: 8px; overflow-x: auto; padding: 18px 0 0; scrollbar-width: none; }
        .spec-pills::-webkit-scrollbar { display: none; }
        .spec-pill {
          flex-shrink: 0; padding: 7px 16px; border-radius: 100px;
          font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.15s;
          border: 1px solid var(--blue-200); background: #fff; color: var(--gray-600);
        }
        .spec-pill:hover { border-color: var(--blue-400); color: var(--blue-700); background: var(--blue-50); }
        .spec-pill.active { background: var(--blue-600); color: #fff; border-color: var(--blue-600); }

        /* Filters bar */
        .ad-filters {
          position: sticky; top: 64px; z-index: 90;
          background: rgba(255,255,255,0.97); backdrop-filter: blur(16px);
          border-bottom: 1px solid var(--blue-100); padding: 14px 0;
        }
        .filter-row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
        .search-wrap { position: relative; flex: 1; min-width: 200px; max-width: 380px; }
        .search-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); font-size: 15px; color: var(--gray-400); pointer-events: none; }
        .search-input {
          width: 100%; background: var(--gray-50); border: 1px solid var(--blue-100);
          border-radius: 12px; padding: 11px 14px 11px 40px;
          font-family: 'DM Sans', sans-serif; font-size: 14px; color: var(--gray-800);
          outline: none; transition: all 0.15s;
        }
        .search-input::placeholder { color: var(--gray-400); }
        .search-input:focus { border-color: var(--blue-400); background: #fff; box-shadow: 0 0 0 3px rgba(55,138,221,0.12); }
        .filter-select {
          background: var(--gray-50); border: 1px solid var(--blue-100);
          border-radius: 12px; padding: 11px 34px 11px 14px;
          font-family: 'DM Sans', sans-serif; font-size: 14px; color: var(--gray-700);
          outline: none; cursor: pointer; transition: all 0.15s; min-width: 140px;
          appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2394A3B8' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
          background-repeat: no-repeat; background-position: right 12px center;
        }
        .filter-select:focus { border-color: var(--blue-400); }
        .avail-toggle {
          display: flex; align-items: center; gap: 8px;
          padding: 10px 16px; border-radius: 12px;
          border: 1px solid var(--blue-100); background: var(--gray-50);
          font-size: 13px; color: var(--gray-600); cursor: pointer; transition: all 0.15s;
          white-space: nowrap; user-select: none;
        }
        .avail-toggle.active { background: var(--color-success-bg); border-color: var(--color-success-border); color: var(--color-success-text); }
        .toggle-dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; }
        .results-count { font-size: 13px; color: var(--gray-400); margin-left: auto; white-space: nowrap; }

        /* Grid */
        .ad-body { padding: 40px 0 80px; }
        .doc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 22px; }

        /* Card */
        .doc-card {
          background: #fff; border: 1px solid var(--blue-100);
          border-radius: 18px; overflow: hidden; cursor: pointer;
          text-decoration: none; color: inherit; display: flex; flex-direction: column;
          transition: all 0.25s cubic-bezier(0.34,1.56,0.64,1);
        }
        .doc-card:hover {
          transform: translateY(-5px); border-color: var(--blue-300);
          box-shadow: 0 16px 40px rgba(24,95,165,0.12); color: inherit; text-decoration: none;
        }
        .card-img-wrap { position: relative; height: 170px; background: var(--blue-50); overflow: hidden; }
        .card-img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.35s ease; }
        .doc-card:hover .card-img { transform: scale(1.04); }
        .card-img-placeholder { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 4rem; }
        .card-avail {
          position: absolute; top: 12px; right: 12px;
          display: flex; align-items: center; gap: 5px;
          padding: 4px 10px; border-radius: 100px; font-size: 11px; font-weight: 600;
          backdrop-filter: blur(8px);
        }
        .card-avail.yes { background: rgba(234,243,222,0.95); border: 1px solid var(--color-success-border); color: var(--color-success-text); }
        .card-avail.no  { background: rgba(252,235,235,0.95); border: 1px solid var(--color-error-border);   color: var(--color-error-text); }
        .avail-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; animation: twPulse 2s infinite; }
        .hospital-tag {
          position: absolute; bottom: 0; left: 0; right: 0;
          padding: 10px 14px;
          background: linear-gradient(to top, rgba(4,44,83,0.6), transparent);
          font-size: 11px; color: rgba(255,255,255,0.9);
        }

        .card-body { padding: 18px 20px 20px; flex: 1; display: flex; flex-direction: column; }
        .card-spec { font-size: 11px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; color: var(--blue-600); margin-bottom: 5px; }
        .card-name { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1.1rem; font-weight: 700; color: var(--gray-900); margin-bottom: 12px; }
        .card-meta { display: flex; gap: 14px; margin-bottom: 14px; }
        .meta-item { display: flex; align-items: center; gap: 5px; font-size: 13px; color: var(--gray-500); }
        .meta-icon { width: 24px; height: 24px; border-radius: 6px; background: var(--blue-50); display: flex; align-items: center; justify-content: center; font-size: 12px; flex-shrink: 0; }
        .slot-chips { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 16px; }
        .slot-chip { font-size: 11px; background: var(--blue-50); border: 1px solid var(--blue-200); border-radius: 6px; padding: 3px 8px; color: var(--blue-700); }
        .slot-more { font-size: 11px; color: var(--blue-500); padding: 3px 4px; }
        .card-footer { display: flex; align-items: center; justify-content: space-between; margin-top: auto; padding-top: 14px; border-top: 1px solid var(--blue-50); }
        .card-slots-count { font-size: 13px; color: var(--gray-400); }
        .book-btn {
          display: inline-flex; align-items: center; gap: 6px;
          background: var(--blue-600); color: #fff;
          border: none; border-radius: 10px; padding: 9px 18px;
          font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 500;
          cursor: pointer; transition: all 0.15s;
        }
        .book-btn:hover { background: var(--blue-800); }

        /* Empty */
        .empty-state { text-align: center; padding: 80px 20px; }
        .empty-icon { font-size: 4rem; opacity: 0.35; margin-bottom: 16px; display: block; }
        .empty-title { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1.4rem; font-weight: 700; color: var(--gray-500); margin-bottom: 8px; }
        .empty-sub { color: var(--gray-400); font-size: 15px; }

        @keyframes twPulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @media (max-width: 600px) { .doc-grid { grid-template-columns: 1fr; } .filter-row { flex-wrap: wrap; } }
      `}</style>

      <div className="ad-root">

        {/* Header */}
        <div className="ad-header">
          <div className="ad-header-grid" />
          <div className="tw-container ad-header-inner">
            <div className="tw-section-label">Find Your Doctor</div>
            <h1 className="ad-title">Book a <span style={{ color: 'var(--blue-600)' }}>Doctor Appointment</span></h1>
            <p className="ad-sub">
              {loading ? 'Loading doctors...' : `${doctors.length} doctors across ${cities.length} cities`}
            </p>
            <div className="spec-pills">
              {actualSpecs.map(spec => (
                <button
                  key={spec}
                  className={`spec-pill ${specFilter === spec ? 'active' : ''}`}
                  onClick={() => setSpecFilter(spec)}
                >
                  {spec}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Sticky filters */}
        <div className="ad-filters">
          <div className="tw-container">
            <div className="filter-row">
              <div className="search-wrap">
                <span className="search-icon">🔍</span>
                <input
                  className="search-input"
                  placeholder="Search doctor, specialization, hospital..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <select className="filter-select" value={city} onChange={e => setCity(e.target.value)}>
                <option value="">All Cities</option>
                {cities.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <button className={`avail-toggle ${availOnly ? 'active' : ''}`} onClick={() => setAvailOnly(p => !p)}>
                <span className="toggle-dot" />
                Available Only
              </button>
              <span className="results-count">
                {loading ? '...' : `${filtered.length} result${filtered.length !== 1 ? 's' : ''}`}
              </span>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="ad-body">
          <div className="tw-container">

            {loading && (
              <div className="doc-grid">
                {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
              </div>
            )}

            {!loading && filtered.length === 0 && (
              <div className="empty-state">
                <span className="empty-icon">🔍</span>
                <div className="empty-title">No doctors found</div>
                <p className="empty-sub">Try adjusting your search or filters</p>
                <button
                  className="btn-outline"
                  style={{ marginTop: 20 }}
                  onClick={() => { setSearch(''); setCity(''); setSpecFilter('All'); setAvailOnly(false); }}
                >
                  Clear all filters
                </button>
              </div>
            )}

            {!loading && filtered.length > 0 && (
              <div className="doc-grid">
                {filtered.map((doc, idx) => (
                  <Link
                    to={`/doctor/${doc.id}`}
                    className="doc-card fade-up"
                    key={doc.id}
                    style={{ animationDelay: `${idx * 0.05}s` }}
                  >
                    <div className="card-img-wrap">
                      {doc.image && !doc.image.includes('placehold')
                        ? <img className="card-img" src={doc.image} alt={`Dr. ${doc.name}`} />
                        : <div className="card-img-placeholder">🩺</div>
                      }
                      <div className={`card-avail ${doc.available ? 'yes' : 'no'}`}>
                        <span className="avail-dot" />
                        {doc.available ? 'Available' : 'Unavailable'}
                      </div>
                      <div className="hospital-tag">🏥 {doc.hospital_name || 'Hospital'}</div>
                    </div>

                    <div className="card-body">
                      <div className="card-spec">{doc.specialization}</div>
                      <div className="card-name">Dr. {doc.name}</div>
                      <div className="card-meta">
                        <div className="meta-item">
                          <div className="meta-icon">📍</div>
                          {doc.city}
                        </div>
                        <div className="meta-item">
                          <div className="meta-icon">⏳</div>
                          {doc.experience} yrs
                        </div>
                      </div>
                      {doc.slots && doc.slots.length > 0 && (
                        <div className="slot-chips">
                          {doc.slots.slice(0, 3).map(s => <span className="slot-chip" key={s}>{s}</span>)}
                          {doc.slots.length > 3 && <span className="slot-more">+{doc.slots.length - 3}</span>}
                        </div>
                      )}
                      <div className="card-footer">
                        <span className="card-slots-count">
                          {doc.slots?.length > 0 ? `${doc.slots.length} slots today` : 'Contact hospital'}
                        </span>
                        <span className="book-btn">Book Now →</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}