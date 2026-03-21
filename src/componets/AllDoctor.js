/* eslint-disable */
import { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router';
import API from '../services/api';

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:ital,wght@0,300;0,400;0,500;1,300&display=swap');

  .ad-wrap {
    font-family: 'DM Sans', sans-serif;
    background: #00133A;
    min-height: 100vh;
    color: #fff;
  }

  /* ── HERO HEADER ── */
  .ad-header {
    position: relative;
    padding: 72px 0 56px;
    overflow: hidden;
  }

  .ad-header-bg {
    position: absolute;
    inset: 0;
    background:
      radial-gradient(ellipse 70% 80% at 30% 50%, rgba(0,87,255,0.18) 0%, transparent 60%),
      radial-gradient(ellipse 40% 60% at 80% 30%, rgba(0,212,255,0.10) 0%, transparent 50%);
  }

  .ad-grid-lines {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
    background-size: 60px 60px;
  }

  .ad-header-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 3px;
    text-transform: uppercase;
    color: #00D4FF;
    margin-bottom: 12px;
    animation: adFadeUp 0.5s ease both;
  }

  .ad-header-title {
    font-family: 'Syne', sans-serif;
    font-size: clamp(2rem, 5vw, 3.4rem);
    font-weight: 800;
    line-height: 1.1;
    margin-bottom: 12px;
    animation: adFadeUp 0.5s 0.05s ease both;
  }

  .ad-header-title span {
    background: linear-gradient(135deg, #00D4FF, #00F5C4);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .ad-header-sub {
    font-size: 1rem;
    color: rgba(255,255,255,0.45);
    animation: adFadeUp 0.5s 0.1s ease both;
  }

  /* ── SEARCH & FILTERS ── */
  .ad-filters {
    padding: 28px 0 36px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    position: sticky;
    top: 0;
    z-index: 100;
    background: rgba(0,19,58,0.92);
    backdrop-filter: blur(20px);
  }

  .ad-search-wrap {
    position: relative;
    flex: 1;
    max-width: 420px;
  }

  .ad-search-icon {
    position: absolute;
    left: 16px;
    top: 50%;
    transform: translateY(-50%);
    color: rgba(255,255,255,0.35);
    font-size: 16px;
    pointer-events: none;
  }

  .ad-search {
    width: 100%;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 14px;
    padding: 14px 16px 14px 44px;
    color: white;
    font-family: 'DM Sans', sans-serif;
    font-size: 15px;
    outline: none;
    transition: all 0.2s;
  }

  .ad-search::placeholder { color: rgba(255,255,255,0.3); }

  .ad-search:focus {
    border-color: rgba(0,87,255,0.5);
    background: rgba(0,87,255,0.08);
    box-shadow: 0 0 0 3px rgba(0,87,255,0.12);
  }

  .ad-filter-select {
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 14px;
    padding: 14px 20px;
    color: white;
    font-family: 'DM Sans', sans-serif;
    font-size: 14px;
    outline: none;
    cursor: pointer;
    transition: all 0.2s;
    min-width: 160px;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='rgba(255,255,255,0.4)' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 14px center;
    padding-right: 36px;
  }

  .ad-filter-select:focus {
    border-color: rgba(0,87,255,0.5);
    background-color: rgba(0,87,255,0.08);
  }

  .ad-filter-select option {
    background: #001333;
    color: white;
  }

  .ad-avail-toggle {
    display: flex;
    align-items: center;
    gap: 10px;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 14px;
    padding: 12px 18px;
    cursor: pointer;
    font-size: 14px;
    color: rgba(255,255,255,0.6);
    transition: all 0.2s;
    user-select: none;
    white-space: nowrap;
  }

  .ad-avail-toggle.active {
    background: rgba(0,245,196,0.1);
    border-color: rgba(0,245,196,0.35);
    color: #00F5C4;
  }

  .ad-toggle-dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: currentColor;
    flex-shrink: 0;
  }

  .ad-results-count {
    font-size: 13px;
    color: rgba(255,255,255,0.35);
    white-space: nowrap;
    align-self: center;
  }

  /* ── RESULTS AREA ── */
  .ad-body { padding: 48px 0 80px; }

  /* ── DOCTOR CARD ── */
  .ad-card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 24px;
  }

  .ad-card {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 22px;
    overflow: hidden;
    cursor: pointer;
    text-decoration: none;
    color: inherit;
    display: flex;
    flex-direction: column;
    transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    animation: adCardIn 0.5s ease both;
  }

  .ad-card:hover {
    transform: translateY(-6px) scale(1.01);
    border-color: rgba(0,87,255,0.35);
    box-shadow: 0 24px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(0,87,255,0.15);
    color: inherit;
    text-decoration: none;
  }

  .ad-card-img-wrap {
    position: relative;
    height: 180px;
    overflow: hidden;
    background: rgba(0,87,255,0.08);
  }

  .ad-card-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.4s ease;
  }

  .ad-card:hover .ad-card-img { transform: scale(1.05); }

  .ad-card-img-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 4rem;
    background: linear-gradient(135deg, rgba(0,87,255,0.15), rgba(0,212,255,0.08));
  }

  .ad-card-avail {
    position: absolute;
    top: 14px;
    right: 14px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 12px;
    border-radius: 100px;
    font-size: 11px;
    font-weight: 600;
    backdrop-filter: blur(10px);
  }

  .ad-card-avail.yes {
    background: rgba(0,245,196,0.15);
    border: 1px solid rgba(0,245,196,0.35);
    color: #00F5C4;
  }

  .ad-card-avail.no {
    background: rgba(255,80,80,0.12);
    border: 1px solid rgba(255,80,80,0.25);
    color: #FF8080;
  }

  .ad-avail-dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: currentColor;
    animation: adPulse 2s infinite;
  }

  .ad-card-hospital-tag {
    position: absolute;
    bottom: 0; left: 0; right: 0;
    padding: 10px 14px 10px;
    background: linear-gradient(to top, rgba(0,13,40,0.85), transparent);
    font-size: 11px;
    color: rgba(255,255,255,0.5);
    display: flex;
    align-items: center;
    gap: 6px;
  }

  /* Card Body */
  .ad-card-body {
    padding: 20px 22px 22px;
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .ad-card-spec {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: #00D4FF;
    margin-bottom: 6px;
  }

  .ad-card-name {
    font-family: 'Syne', sans-serif;
    font-size: 1.2rem;
    font-weight: 700;
    margin-bottom: 14px;
    line-height: 1.2;
  }

  .ad-card-meta {
    display: flex;
    gap: 16px;
    margin-bottom: 18px;
  }

  .ad-meta-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: rgba(255,255,255,0.45);
  }

  .ad-meta-icon {
    width: 28px; height: 28px;
    border-radius: 8px;
    background: rgba(255,255,255,0.06);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    flex-shrink: 0;
  }

  .ad-card-slots {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 18px;
  }

  .ad-slot-chip {
    font-size: 11px;
    background: rgba(0,87,255,0.1);
    border: 1px solid rgba(0,87,255,0.2);
    border-radius: 6px;
    padding: 3px 9px;
    color: rgba(255,255,255,0.5);
  }

  .ad-slot-more {
    font-size: 11px;
    color: #00D4FF;
    padding: 3px 6px;
    align-self: center;
  }

  .ad-card-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: auto;
    padding-top: 16px;
    border-top: 1px solid rgba(255,255,255,0.06);
  }

  .ad-book-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: linear-gradient(135deg, #0057FF, #0040CC);
    color: white;
    border: none;
    border-radius: 10px;
    padding: 10px 20px;
    font-family: 'DM Sans', sans-serif;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    text-decoration: none;
  }

  .ad-book-btn:hover {
    box-shadow: 0 6px 20px rgba(0,87,255,0.4);
    transform: translateY(-1px);
    color: white;
    text-decoration: none;
  }

  .ad-exp-badge {
    font-size: 13px;
    color: rgba(255,255,255,0.35);
  }

  /* ── EMPTY STATE ── */
  .ad-empty {
    text-align: center;
    padding: 80px 20px;
    color: rgba(255,255,255,0.3);
  }

  .ad-empty-icon {
    font-size: 4rem;
    margin-bottom: 20px;
    opacity: 0.4;
  }

  .ad-empty-title {
    font-family: 'Syne', sans-serif;
    font-size: 1.4rem;
    font-weight: 700;
    margin-bottom: 8px;
    color: rgba(255,255,255,0.5);
  }

  /* ── SKELETON ── */
  .ad-skeleton {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 22px;
    overflow: hidden;
  }

  .ad-skel-img {
    height: 180px;
    background: linear-gradient(90deg,
      rgba(255,255,255,0.04) 25%,
      rgba(255,255,255,0.08) 50%,
      rgba(255,255,255,0.04) 75%
    );
    background-size: 200% 100%;
    animation: adShimmer 1.4s infinite;
  }

  .ad-skel-body { padding: 20px 22px; }

  .ad-skel-line {
    height: 12px;
    border-radius: 6px;
    margin-bottom: 12px;
    background: linear-gradient(90deg,
      rgba(255,255,255,0.04) 25%,
      rgba(255,255,255,0.08) 50%,
      rgba(255,255,255,0.04) 75%
    );
    background-size: 200% 100%;
    animation: adShimmer 1.4s infinite;
  }

  /* ── SPECIALIZATION PILLS ── */
  .ad-spec-pills {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding-bottom: 4px;
    scrollbar-width: none;
    margin-top: 16px;
  }
  .ad-spec-pills::-webkit-scrollbar { display: none; }

  .ad-spec-pill {
    flex-shrink: 0;
    padding: 7px 16px;
    border-radius: 100px;
    font-size: 13px;
    font-weight: 500;
    border: 1px solid rgba(255,255,255,0.1);
    background: transparent;
    color: rgba(255,255,255,0.5);
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
  }

  .ad-spec-pill:hover {
    border-color: rgba(0,87,255,0.4);
    color: white;
    background: rgba(0,87,255,0.08);
  }

  .ad-spec-pill.active {
    background: rgba(0,87,255,0.2);
    border-color: rgba(0,87,255,0.5);
    color: #00D4FF;
  }

  /* ── ANIMATIONS ── */
  @keyframes adFadeUp {
    from { opacity: 0; transform: translateY(16px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  @keyframes adCardIn {
    from { opacity: 0; transform: translateY(20px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  @keyframes adShimmer {
    0%   { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  @keyframes adPulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.4; }
  }

  @media (max-width: 768px) {
    .ad-header { padding: 48px 0 32px; }
    .ad-card-grid { grid-template-columns: 1fr; }
    .ad-filter-row { flex-wrap: wrap; }
  }
`;

const SPECIALIZATIONS = [
  'All', 'Cardiologist', 'Dermatologist', 'Neurologist',
  'Orthopedic', 'Pediatrician', 'General Physician', 'ENT', 'Gynecologist',
];

const SkeletonCard = () => (
  <div className="ad-skeleton">
    <div className="ad-skel-img" />
    <div className="ad-skel-body">
      <div className="ad-skel-line" style={{ width: '40%', height: 8 }} />
      <div className="ad-skel-line" style={{ width: '70%', height: 16, marginBottom: 20 }} />
      <div className="ad-skel-line" style={{ width: '55%' }} />
      <div className="ad-skel-line" style={{ width: '80%' }} />
      <div className="ad-skel-line" style={{ width: '45%', marginTop: 16 }} />
    </div>
  </div>
);

export default function AllDoctor() {
  const navigate = useNavigate();
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
        // Extract unique cities
        const uniqueCities = [...new Set(data.map(d => d.city).filter(Boolean))];
        setCities(uniqueCities);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = doctors.filter(doc => {
    const q = search.toLowerCase();
    const matchSearch =
      !search ||
      (doc.name           || '').toLowerCase().includes(q) ||
      (doc.specialization || '').toLowerCase().includes(q) ||
      (doc.hospital_name  || '').toLowerCase().includes(q) ||
      (doc.city           || '').toLowerCase().includes(q);

    const matchCity   = !city || (doc.city || '').toLowerCase().includes(city.toLowerCase());
    const matchSpec   = specFilter === 'All' || (doc.specialization || '').toLowerCase().includes(specFilter.toLowerCase());
    const matchAvail  = !availOnly || doc.available;

    return matchSearch && matchCity && matchSpec && matchAvail;
  });

  // Get unique specs from actual data
  const actualSpecs = ['All', ...new Set(doctors.map(d => d.specialization).filter(Boolean))];

  return (
    <>
      <style>{css}</style>
      <div className="ad-wrap">

        {/* ── HEADER ── */}
        <div className="ad-header">
          <div className="ad-header-bg" />
          <div className="ad-grid-lines" />
          <div className="container position-relative">
            <div className="ad-header-label">Find Your Doctor</div>
            <h1 className="ad-header-title">
              Book a <span>Doctor Appointment</span><br />
              Near You
            </h1>
            <p className="ad-header-sub">
              {loading ? 'Loading doctors...' : `${doctors.length} doctors across ${cities.length} cities`}
            </p>

            {/* Specialization pills */}
            <div className="ad-spec-pills">
              {actualSpecs.map(spec => (
                <button
                  key={spec}
                  className={`ad-spec-pill ${specFilter === spec ? 'active' : ''}`}
                  onClick={() => setSpecFilter(spec)}
                >
                  {spec}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── STICKY FILTERS ── */}
        <div className="ad-filters">
          <div className="container">
            <div className="d-flex gap-3 align-items-center ad-filter-row flex-wrap">

              {/* Search */}
              <div className="ad-search-wrap">
                <span className="ad-search-icon">🔍</span>
                <input
                  className="ad-search"
                  placeholder="Search doctor, specialization, hospital..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>

              {/* City filter */}
              <select
                className="ad-filter-select"
                value={city}
                onChange={e => setCity(e.target.value)}
              >
                <option value="">All Cities</option>
                {cities.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>

              {/* Available toggle */}
              <button
                className={`ad-avail-toggle ${availOnly ? 'active' : ''}`}
                onClick={() => setAvailOnly(p => !p)}
              >
                <span className="ad-toggle-dot" />
                Available Only
              </button>

              {/* Results count */}
              <span className="ad-results-count ms-auto">
                {loading ? '...' : `${filtered.length} result${filtered.length !== 1 ? 's' : ''}`}
              </span>
            </div>
          </div>
        </div>

        {/* ── BODY ── */}
        <div className="ad-body">
          <div className="container">

            {/* Skeletons while loading */}
            {loading && (
              <div className="ad-card-grid">
                {[...Array(6)].map((_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            )}

            {/* Empty state */}
            {!loading && filtered.length === 0 && (
              <div className="ad-empty">
                <div className="ad-empty-icon">🔍</div>
                <div className="ad-empty-title">No doctors found</div>
                <p>Try adjusting your search or filters</p>
                <button
                  className="ad-avail-toggle mt-3"
                  onClick={() => { setSearch(''); setCity(''); setSpecFilter('All'); setAvailOnly(false); }}
                >
                  Clear all filters
                </button>
              </div>
            )}

            {/* Doctor cards */}
            {!loading && filtered.length > 0 && (
              <div className="ad-card-grid">
                {filtered.map((doc, idx) => (
                  <Link
                    to={`/doctor/${doc.id}`}
                    className="ad-card"
                    key={doc.id}
                    style={{ animationDelay: `${idx * 0.05}s` }}
                  >
                    {/* Image */}
                    <div className="ad-card-img-wrap">
                      {doc.image && !doc.image.includes('placehold') ? (
                        <img
                          className="ad-card-img"
                          src={doc.image}
                          alt={`Dr. ${doc.name}`}
                        />
                      ) : (
                        <div className="ad-card-img-placeholder">🩺</div>
                      )}

                      {/* Availability badge */}
                      <div className={`ad-card-avail ${doc.available ? 'yes' : 'no'}`}>
                        <span className="ad-avail-dot" />
                        {doc.available ? 'Available' : 'Unavailable'}
                      </div>

                      {/* Hospital tag */}
                      <div className="ad-card-hospital-tag">
                        🏥 {doc.hospital_name || 'Hospital'}
                      </div>
                    </div>

                    {/* Body */}
                    <div className="ad-card-body">
                      <div className="ad-card-spec">{doc.specialization}</div>
                      <div className="ad-card-name">Dr. {doc.name}</div>

                      <div className="ad-card-meta">
                        <div className="ad-meta-item">
                          <div className="ad-meta-icon">📍</div>
                          {doc.city}
                        </div>
                        <div className="ad-meta-item">
                          <div className="ad-meta-icon">⏳</div>
                          {doc.experience} yrs exp
                        </div>
                      </div>

                      {/* Slots preview */}
                      {doc.slots && doc.slots.length > 0 && (
                        <div className="ad-card-slots">
                          {doc.slots.slice(0, 3).map(slot => (
                            <span className="ad-slot-chip" key={slot}>{slot}</span>
                          ))}
                          {doc.slots.length > 3 && (
                            <span className="ad-slot-more">+{doc.slots.length - 3} more</span>
                          )}
                        </div>
                      )}

                      {/* Footer */}
                      <div className="ad-card-footer">
                        <span className="ad-exp-badge">
                          {doc.slots?.length > 0
                            ? `${doc.slots.length} slots today`
                            : 'Contact hospital'}
                        </span>
                        <span className="ad-book-btn">
                          Book Now →
                        </span>
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