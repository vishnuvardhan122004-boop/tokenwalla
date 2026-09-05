import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import API from '../services/api';
import { filterTestDoctors } from '../services/testHospitals';
import SEO from './SEO';
import { providerLabel } from '../services/providerLabel';

// Maps a hero specialty chip (and any typed word) to the substrings that may
// appear in the free-text `specialization` field hospitals enter, so e.g. the
// "Skin" chip finds a doctor stored as "Dermatologist". Words with no entry
// match themselves unchanged.
const SPEC_SYNONYMS = {
  general:  ['general', 'physician', 'family', 'medicine'],
  heart:    ['heart', 'cardio'],
  skin:     ['skin', 'dermat'],
  dental:   ['dental', 'dentist', 'tooth', 'teeth', 'oral'],
  child:    ['child', 'pediatric', 'paediatric', 'paed', 'neonat'],
  bones:    ['bone', 'ortho', 'joint'],
  eye:      ['eye', 'ophthal', 'optom', 'vision'],
  ent:      ['ent', 'ear', 'nose', 'throat', 'otolar'],
  women:    ['gyn', 'obstet', 'women', 'maternity'],
  neuro:    ['neuro', 'nuro'],
  mental:   ['psych', 'mental'],
  diabetes: ['diabet', 'endocrin'],
  kidney:   ['nephro', 'kidney', 'renal'],
  stomach:  ['gastro', 'stomach', 'digest', 'liver', 'hepat'],
  lungs:    ['pulmon', 'lung', 'chest', 'respir'],
  physio:   ['physio', 'rehab', 'physical'],
};

// The `?kind=` value each tab sends, mapped to the segment it means. The
// parameter keeps its old name so no shipped client has to change how it asks.
const KIND_TO_SEGMENT = {
  HOSPITAL: 'CONSULT', SCAN_CENTER: 'SCAN', BLOOD_CENTER: 'BLOOD',
};

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
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  // 'doctors' | 'SCAN_CENTER' | 'BLOOD_CENTER'. The doctor path below is
  // untouched by this: the centre path sits BESIDE it rather than generalising
  // it, because the doctor list is the live, working, revenue-carrying screen
  // and a shared abstraction would put every future centre change inside it.
  //
  // The two CENTRE kinds do share their path, though — same request, same card,
  // same detail page. Only the words differ, so `mode` doubles as the ?kind=.
  const [mode,       setMode]       = useState('doctors');
  // Keyed by centre kind, so the two centre tabs cannot show each other's list
  // and switching back does not refetch.
  const [centresByKind, setCentresByKind] = useState({});

  const isCentreMode = mode !== 'doctors';
  const isBlood      = mode === 'BLOOD_CENTER';
  const centres      = centresByKind[mode] || [];
  // Every label that separates the two centre kinds, in one place.
  const centreCopy = isBlood
    ? { label: 'Blood Centre', unit: 'test', icon: 'bi-droplet',
        eyebrow: 'FIND A BLOOD CENTRE', titleAccent: 'Blood Test',
        blurb: 'blood tests and full body checkups', empty: 'No blood centres yet' }
    : { label: 'Scan Centre',  unit: 'scan', icon: 'bi-activity',
        eyebrow: 'FIND A SCANNING CENTRE', titleAccent: 'Scan or Test',
        blurb: 'MRI, CT, X-ray and ultrasound', empty: 'No scanning centres yet' };
  const [scans,      setScans]      = useState([]);
  const [modality,   setModality]   = useState('All');

  const [doctors,    setDoctors]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [loadError,  setLoadError]  = useState(false);
  // Seed the search from a ?q= param (e.g. the hero specialty chips link here).
  const [search,     setSearch]     = useState(searchParams.get('q') || '');
  const [city,       setCity]       = useState('');
  const [specFilter, setSpecFilter] = useState('All');
  const [availOnly,  setAvailOnly]  = useState(false);
  const [cities,     setCities]     = useState([]);
  const [locating,   setLocating]   = useState(false);
  const [showSuggest, setShowSuggest] = useState(false);

  // "Near Me" — detect the user's city from the browser and apply the city
  // filter. Reverse-geocodes via OpenStreetMap (free, no key), then matches
  // the detected place against the cities we actually have doctors in.
  const detectCity = () => {
    if (!navigator.geolocation) { alert(t('doctors.geoNotSupported')); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const res  = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=10`, { headers: { Accept: 'application/json' } });
          const data = await res.json();
          const a = data.address || {};
          const detected = a.city || a.town || a.village || a.county || a.state_district || a.state || '';
          if (!detected) { alert(t('doctors.geoNoCityDetected')); return; }
          const match = cities.find(c => c.toLowerCase() === detected.toLowerCase())
            || cities.find(c => detected.toLowerCase().includes(c.toLowerCase()) || c.toLowerCase().includes(detected.toLowerCase()));
          if (match) { setCity(match); }
          else { setCity(''); setSearch(detected); }   // no match → search the detected place
        } catch {
          alert(t('doctors.geoFailed'));
        } finally { setLocating(false); }
      },
      (err) => {
        setLocating(false);
        alert(err.code === err.PERMISSION_DENIED
          ? t('doctors.geoDenied')
          : t('doctors.geoError'));
      },
      { timeout: 10000, enableHighAccuracy: false },
    );
  };

  useEffect(() => {
    setLoading(true);
    setLoadError(false);
    API.get('/doctors/')
      .then(({ data }) => {
        const all  = Array.isArray(data) ? data : (data.results || []);
        // Hide test hospitals from the public list (production only).
        const list = filterTestDoctors(all);
        setDoctors(list);
        setCities([...new Set(list.map(d => d.city).filter(Boolean))]);
      })
      .catch(() => {
        // `.catch(() => {})` swallowed this entirely, so a dropped connection
        // or a 500 left `doctors` empty and the UI rendered the ordinary
        // "no results, adjust your filters" state — telling a patient the
        // catalogue is empty when in fact we never reached the server. Clearing
        // filters, which is what that state invites, then changes nothing.
        setLoadError(true);
      })
      .finally(() => setLoading(false));
  }, []);

  // Centres. Fetched lazily — a patient who never switches modes never pays for
  // these two requests. `?kind=` is the opt-in the backend requires; without it
  // the hospitals endpoint returns hospitals only. Both centre kinds run the
  // SAME request against the same endpoints — only the kind differs.
  useEffect(() => {
    if (!isCentreMode || centresByKind[mode]) return;
    const kind = mode;
    setLoading(true);
    Promise.all([
      API.get('/hospitals/', { params: { kind } }),
      API.get('/scans/'),
    ])
      .then(([hRes, sRes]) => {
        const asList = (d) => (Array.isArray(d) ? d : (d.results || []));
        // Match on `segments` — what the provider SELLS — not on `kind`, which
        // is only who they are. A hospital with a scanning wing is
        // kind=HOSPITAL and belongs in this list; filtering on kind would drop
        // exactly the hybrids this exists to show.
        //
        // Fall back to `kind` when `segments` is absent: that is an older
        // backend, which is the deploy-order hazard this filter was written for
        // in the first place. Hybrids cannot exist there, so kind is correct.
        const want = KIND_TO_SEGMENT[kind];
        setCentresByKind(prev => ({
          ...prev,
          [kind]: asList(hRes.data).filter(h => (
            Array.isArray(h.segments) ? h.segments.includes(want) : h.kind === kind
          )),
        }));
        setScans(asList(sRes.data));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [mode, isCentreMode, centresByKind]);

  // Scans grouped by centre — drives the "N scans · from ₹X" line on each card
  // without a request per centre.
  const scansByCentre = scans.reduce((acc, sc) => {
    (acc[sc.center] = acc[sc.center] || []).push(sc);
    return acc;
  }, {});

  // Only the modalities the CURRENT tab can actually show. `/scans/` returns
  // every centre's list, so filtering on the raw response offered "MRI" and
  // "X-Ray" as filters on the blood tab — options that could only ever return
  // nothing.
  const visibleScans = centres.flatMap(c => scansByCentre[c.id] || []);
  const modalities = ['All', ...new Set(visibleScans.map(sc => sc.modality).filter(Boolean))];

  const filteredCentres = centres
    .map(c => ({ ...c, scans: scansByCentre[c.id] || [] }))
    .filter(c => {
      const haystack = [
        c.name, c.city, c.address, c.location,
        ...c.scans.map(sc => `${sc.name} ${sc.modality} ${sc.keywords}`),
      ].filter(Boolean).join(' ').toLowerCase();
      const words = search.toLowerCase().split(/\s+/).filter(Boolean);
      const matchSearch   = words.every(w => haystack.includes(w));
      const matchCity     = !city || (c.city || '').toLowerCase().includes(city.toLowerCase());
      const matchModality = modality === 'All'
        || c.scans.some(sc => (sc.modality || '').toLowerCase() === modality.toLowerCase());
      return matchSearch && matchCity && matchModality;
    })
    // A centre with nothing listed is a dead end for a patient — a card that
    // opens onto an empty menu. Ranked to the bottom rather than hidden, so the
    // centre still appears for a search by name.
    .sort((a, b) => (b.scans.length > 0) - (a.scans.length > 0) || b.scans.length - a.scans.length);

  const priceFrom = (list) => (list.length ? Math.min(...list.map(sc => sc.price || 0)) : 0);

  const actualSpecs = ['All', ...new Set(doctors.map(d => d.specialization).filter(Boolean))];

  // Keyword pool from the real data (specializations + cities + hospitals) so
  // every suggestion returns results.
  const keywordPool = [...new Set([
    ...doctors.map(d => d.specialization),
    ...doctors.map(d => d.city),
    ...doctors.map(d => d.hospital_name),
  ].filter(Boolean))];

  // Suggestions shown under the search box while typing — filtered to what the
  // user is typing and kept short (max 6).
  const suggestList = (() => {
    const q = search.trim().toLowerCase();
    return keywordPool
      .filter(kw => kw.toLowerCase() !== q && (!q || kw.toLowerCase().includes(q)))
      .slice(0, 6);
  })();

  // ── RANKING ───────────────────────────────────────────────────────────────
  // Mirrors rankDoctor() in the app's (patient)/doctors.tsx — same weights, so
  // a patient sees the same order on both. Change one, change the other.
  //
  // Popularity is bounded and log-scaled ON PURPOSE. Sorting by raw clicks
  // makes the top spot self-reinforcing: whoever is first gets clicked because
  // they are first, and no new doctor can ever climb. log10 means the 10th view
  // moves a doctor as much as the next ninety do, and the cap keeps the boost
  // below the availability weight — so a popular doctor who is unavailable
  // today never outranks one who can actually see you.
  const popularityBoost = (views) =>
    Math.min(30, Math.round(12 * Math.log10(1 + (views || 0))));

  const rankDoctor = (doc) => {
    let score = 0;
    if (doc.available) score += 100;
    if (city && (doc.city || '').toLowerCase() === city.toLowerCase()) score += 50;
    score += (doc.experience || 0);
    score += (doc.slots?.length || 0) * 2;
    score += popularityBoost(doc.view_count);
    return score;
  };

  const filtered = doctors.filter(doc => {
    // Keyword search: every space-separated word must match somewhere in the
    // doctor's searchable text (name, specialization, hospital, city, location).
    // e.g. "cardiologist mumbai" → cardiologists in Mumbai.
    const haystack = [
      doc.name, doc.specialization, doc.keywords, doc.hospital_name,
      doc.city, doc.hospital_location, doc.hospital_address,
    ].filter(Boolean).join(' ').toLowerCase();
    const keywords = search.toLowerCase().split(/\s+/).filter(Boolean);
    // A word matches if the haystack contains it OR any of its synonyms, so the
    // hero chips (skin/heart/ent/…) reach doctors named with clinical terms.
    const matchSearch = keywords.every(word =>
      (SPEC_SYNONYMS[word] || [word]).some(term => haystack.includes(term))
    );
    const matchCity  = !city || (doc.city || '').toLowerCase().includes(city.toLowerCase());
    const matchSpec  = specFilter === 'All' || (doc.specialization || '').toLowerCase().includes(specFilter.toLowerCase());
    const matchAvail = !availOnly || doc.available;
    return matchSearch && matchCity && matchSpec && matchAvail;
  })
    // Highest score first; ties keep the server's order, which is already
    // popular-first, so the sort is deterministic either way.
    .sort((a, b) => rankDoctor(b) - rankDoctor(a));


  return (
    <>
      <SEO
  title="Find Doctors Near You — Book Appointment Online"
  description="Browse doctors by specialization, city, and hospital in Andhra Pradesh & Telangana. Book your OPD slot online and get a confirmed digital token instantly."
  keywords="find doctors online AP, book doctor near me Telangana, OPD appointment booking, specialist doctor Hindupur, cardiologist appointment online"
  url="/alldoctor"
    />
      <style>{`
        .ad-root { font-family: var(--font-body); background: #fff; min-height: 100vh; }

        /* Header */
        .ad-header {
          background: linear-gradient(160deg, var(--color-surface) 0%, #EAF3FF 60%, #F8FBFF 100%);
          padding: 64px 0 0; border-bottom: 1px solid var(--blue-100);
          position: relative; overflow: hidden;
        }
        .ad-header-grid {
          position: absolute; inset: 0;
          background-image: linear-gradient(var(--blue-100) 1px, transparent 1px), linear-gradient(90deg, var(--blue-100) 1px, transparent 1px);
          background-size: 48px 48px; opacity: 0.35;
        }
        .ad-header-inner { position: relative; padding-bottom: 28px; }
        .ad-title { font-family: var(--font-display); font-size: clamp(1.8rem, 4vw, 2.8rem); font-weight: 800; color: var(--gray-900); margin-bottom: 8px; }
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
          font-family: var(--font-body); font-size: 14px; color: var(--gray-800);
          outline: none; transition: all 0.15s;
        }
        .search-input::placeholder { color: var(--gray-400); }
        .search-input:focus { border-color: var(--blue-400); background: #fff; box-shadow: 0 0 0 3px rgba(55,138,221,0.12); }
        .filter-select {
          background: var(--gray-50); border: 1px solid var(--blue-100);
          border-radius: 12px; padding: 11px 34px 11px 14px;
          font-family: var(--font-body); font-size: 14px; color: var(--gray-700);
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

        /* Near Me button */
        .near-me-btn {
          display: inline-flex; align-items: center; gap: 6px; white-space: nowrap;
          padding: 11px 16px; border-radius: 12px;
          border: 1px solid var(--blue-200); background: var(--blue-50); color: var(--blue-700);
          font-family: var(--font-body); font-size: 14px; font-weight: 600;
          cursor: pointer; transition: all 0.15s;
        }
        .near-me-btn:hover { background: var(--blue-100); border-color: var(--blue-400); }
        .near-me-btn:disabled { opacity: 0.6; cursor: default; }

        /* Search suggestions dropdown */
        .search-suggest {
          position: absolute; top: calc(100% + 6px); left: 0; right: 0; z-index: 120;
          background: #fff; border: 1px solid var(--blue-100); border-radius: 12px;
          padding: 6px; box-shadow: 0 8px 28px rgba(24,95,165,0.14);
        }
        .suggest-item {
          display: flex; align-items: center; gap: 10px; width: 100%;
          padding: 9px 12px; border: none; background: none; border-radius: 8px;
          font-family: var(--font-body); font-size: 14px; color: var(--gray-700);
          cursor: pointer; text-align: left; transition: all 0.12s;
        }
        .suggest-item:hover { background: var(--blue-50); color: var(--blue-800); }
        .suggest-icon { font-size: 12px; opacity: 0.7; }
        .suggest-text { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

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
        .card-name { font-family: var(--font-display); font-size: 1.1rem; font-weight: 700; color: var(--gray-900); margin-bottom: 12px; }
        .card-meta { display: flex; gap: 14px; margin-bottom: 14px; }
        .meta-item { display: flex; align-items: center; gap: 5px; font-size: 13px; color: var(--gray-500); }
        .meta-icon { width: 24px; height: 24px; border-radius: 6px; background: var(--blue-50); display: flex; align-items: center; justify-content: center; font-size: 12px; flex-shrink: 0; }
        .slot-chips { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 16px; }
        .slot-chip { font-size: 11px; background: var(--blue-50); border: 1px solid var(--blue-200); border-radius: 6px; padding: 3px 8px; color: var(--blue-700); }
        .slot-more { font-size: 11px; color: var(--blue-500); padding: 3px 4px; }
        .card-footer { display: flex; align-items: center; justify-content: space-between; margin-top: auto; padding-top: 14px; border-top: 1px solid var(--blue-50); }
        .card-slots-count { font-size: 12px; color: var(--gray-400); margin-bottom: 10px; }
        .card-fee { display: flex; flex-direction: column; line-height: 1.1; }
        .card-fee-amount { font-family: var(--font-display); font-size: 1.25rem; font-weight: 800; color: var(--blue-600); }
        .card-fee-sub { font-size: 10px; color: var(--gray-400); }
        .book-btn {
          display: inline-flex; align-items: center; gap: 6px;
          background: var(--blue-600); color: #fff;
          border: none; border-radius: 10px; padding: 9px 18px;
          font-family: var(--font-body); font-size: 13px; font-weight: 500;
          cursor: pointer; transition: all 0.15s;
        }
        .book-btn:hover { background: var(--blue-800); }

        /* Empty */
        .empty-state { text-align: center; padding: 80px 20px; }
        .empty-icon { font-size: 4rem; opacity: 0.35; margin-bottom: 16px; display: block; }
        .empty-title { font-family: var(--font-display); font-size: 1.4rem; font-weight: 700; color: var(--gray-500); margin-bottom: 8px; }
        .empty-sub { color: var(--gray-400); font-size: 15px; }

        @keyframes twPulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        /* ── Doctors ⇄ Scan Centres switch ── */
        .mode-switch {
          display: inline-flex; gap: 4px; padding: 4px; margin-bottom: 10px;
          background: var(--gray-100, #F1F5F9); border-radius: 999px;
        }
        .mode-btn {
          border: none; background: transparent; cursor: pointer;
          padding: 7px 16px; border-radius: 999px;
          font-size: 13px; font-weight: 600; color: var(--gray-500, #64748B);
          transition: background .15s, color .15s, box-shadow .15s;
        }
        .mode-btn:hover { color: var(--gray-800, #1E293B); }
        .mode-btn.is-active {
          background: #fff; color: var(--blue-700, #12497F);
          box-shadow: 0 1px 3px rgba(15,23,42,.12);
        }

        .centre-empty { text-align: center; padding: 64px 24px; color: var(--gray-400, #94A3B8); }
        .centre-empty i { font-size: 34px; opacity: .5; }
        .centre-empty-title { margin-top: 12px; font-size: 17px; font-weight: 700; color: var(--gray-800, #1E293B); }
        .centre-empty-sub { margin-top: 4px; font-size: 13.5px; }

        @media (max-width: 600px) { .doc-grid { grid-template-columns: 1fr; } .filter-row { flex-wrap: wrap; } }
      `}</style>

      <div className="ad-root">

        {/* Header */}
        <div className="ad-header">
          <div className="ad-header-grid" />
          <div className="tw-container ad-header-inner">
            {/* The hero follows the mode. Leaving "Book a Doctor Appointment"
                above a list of diagnostic centres reads as a broken page, and
                the specialisation pills are meaningless there — a centre has
                modalities, not specialisations. Not translated yet: the scan
                strings have no i18n keys, and inventing keys the translation
                files do not carry would render blank in te/hi. */}
            {mode === 'doctors' ? (
              <>
                <div className="tw-section-label">{t('doctors.findYourDoctor')}</div>
                <h1 className="ad-title">{t('doctors.titlePrefix')} <span style={{ color: 'var(--blue-600)' }}>{t('doctors.titleAccent')}</span></h1>
                <p className="ad-sub">
                  {loading ? t('doctors.loading') : t('doctors.summary', { count: doctors.length, cities: cities.length })}
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
              </>
            ) : (
              <>
                <div className="tw-section-label">{centreCopy.eyebrow}</div>
                <h1 className="ad-title">
                  Book a <span style={{ color: 'var(--blue-600)' }}>{centreCopy.titleAccent}</span>
                </h1>
                <p className="ad-sub">
                  {loading
                    ? t('doctors.loading')
                    : `${centres.length} centre${centres.length === 1 ? '' : 's'} · ${centreCopy.blurb}`}
                </p>
                <div className="spec-pills">
                  {modalities.map(m => (
                    <button
                      key={m}
                      className={`spec-pill ${modality === m ? 'active' : ''}`}
                      onClick={() => setModality(m)}
                    >
                      {m === 'All' ? 'All' : m}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Sticky filters */}
        <div className="ad-filters">
          <div className="tw-container">
            {/* Doctors ⇄ Scan Centres ⇄ Blood Tests. A patient looking for an
                MRI, one wanting a CBC and one looking for a paediatrician are
                on three different errands; this is the switch between them.
                Modality resets on switch — a leftover "MRI" would filter the
                blood tab down to nothing and read as an empty segment. */}
            <div className="mode-switch">
              {[
                { key: 'doctors', icon: 'bi-clipboard-pulse', label: 'Doctors' },
                { key: 'SCAN_CENTER',  icon: 'bi-activity', label: 'Scan Centres' },
                { key: 'BLOOD_CENTER', icon: 'bi-droplet',  label: 'Blood Tests' },
              ].map(m => (
                <button
                  key={m.key}
                  type="button"
                  className={`mode-btn ${mode === m.key ? 'is-active' : ''}`}
                  aria-pressed={mode === m.key}
                  onClick={() => { setMode(m.key); setModality('All'); }}
                >
                  <i className={`bi ${m.icon} me-1`} />{m.label}
                </button>
              ))}
            </div>

            <div className="filter-row">
              <div className="search-wrap">
                <span className="search-icon"><i className="bi bi-search me-1" /></span>
                <input
                  className="search-input"
                  placeholder={t('doctors.searchPlaceholder')}
                  value={search}
                  onChange={e => { setSearch(e.target.value); setShowSuggest(true); }}
                  onFocus={() => setShowSuggest(true)}
                  onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
                />
                {/* Keyword suggestions while searching */}
                {showSuggest && suggestList.length > 0 && (
                  <div className="search-suggest">
                    {suggestList.map(kw => (
                      <button
                        key={kw}
                        type="button"
                        className="suggest-item"
                        onMouseDown={() => { setSearch(kw); setShowSuggest(false); }}
                      >
                        <span className="suggest-icon"><i className="bi bi-search me-1" /></span>
                        <span className="suggest-text">{kw}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <select className="filter-select" value={city} onChange={e => setCity(e.target.value)}>
                <option value="">{t('doctors.allCities')}</option>
                {cities.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <button className="near-me-btn" onClick={detectCity} disabled={locating} title={t('doctors.nearMeTitle')}>
                <i className={`bi ${locating ? 'bi-arrow-repeat' : 'bi-geo-alt'} me-1`} />
                {locating ? t('doctors.locating') : t('doctors.nearMe')}
              </button>
              {mode === 'doctors' ? (
                <button className={`avail-toggle ${availOnly ? 'active' : ''}`} onClick={() => setAvailOnly(p => !p)}>
                  <span className="toggle-dot" />
                  {t('doctors.availableOnly')}
                </button>
              ) : (
                /* "Available today" is a doctor concept — a centre's machines
                   are not on leave. Modality is the filter that matters here. */
                <select className="filter-select" value={modality} onChange={e => setModality(e.target.value)}>
                  {modalities.map(m => (
                    <option key={m} value={m}>{m === 'All' ? `All ${centreCopy.unit} types` : m}</option>
                  ))}
                </select>
              )}
              <span className="results-count">
                {loading
                  ? '...'
                  : mode === 'doctors'
                    ? t('doctors.results', { count: filtered.length })
                    : `${filteredCentres.length} centre${filteredCentres.length === 1 ? '' : 's'}`}
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

            {!loading && loadError && (
              <div className="empty-state">
                <span className="empty-icon"><i className="bi bi-wifi-off me-1" /></span>
                <div className="empty-title">Couldn't load doctors</div>
                <p className="empty-sub">
                  We couldn't reach the server. Check your connection and try again.
                </p>
                <button
                  className="btn-outline"
                  style={{ marginTop: 20 }}
                  onClick={() => window.location.reload()}
                >
                  Try again
                </button>
              </div>
            )}

            {!loading && !loadError && mode === 'doctors' && filtered.length === 0 && (
              <div className="empty-state">
                <span className="empty-icon"><i className="bi bi-search me-1" /></span>
                <div className="empty-title">{t('doctors.noResults')}</div>
                <p className="empty-sub">{t('doctors.adjustFilters')}</p>
                <button
                  className="btn-outline"
                  style={{ marginTop: 20 }}
                  onClick={() => { setSearch(''); setCity(''); setSpecFilter('All'); setAvailOnly(false); }}
                >
                  {t('doctors.clearFilters')}
                </button>
              </div>
            )}

            {/* ── SCAN CENTRES ── */}
            {!loading && isCentreMode && filteredCentres.length === 0 && (
              <div className="centre-empty">
                <i className={`bi ${centreCopy.icon}`} />
                <div className="centre-empty-title">{centreCopy.empty}</div>
                <div className="centre-empty-sub">
                  We're onboarding diagnostic partners now. Try the Doctors tab.
                </div>
              </div>
            )}

            {!loading && isCentreMode && filteredCentres.length > 0 && (
              <div className="doc-grid">
                {filteredCentres.map((c, idx) => (
                  <Link
                    to={`/scan-center/${c.id}`}   /* one detail page serves both kinds */
                    className="doc-card fade-up"
                    key={c.id}
                    style={{ animationDelay: `${idx * 0.05}s` }}
                  >
                    <div className="card-img-wrap">
                      {c.image && !c.image.includes('placehold')
                        ? <img className="card-img" src={c.image} alt={c.name} />
                        : <div className="card-img-placeholder"><i className={`bi ${centreCopy.icon}`} /></div>
                      }
                      <div className="card-avail yes">
                        <span className="avail-dot" />
                        {centreCopy.label}
                      </div>
                      {(c.open_time || c.close_time) && (
                        <div className="hospital-tag">
                          <i className="bi bi-clock me-1" />{c.open_time || '—'} – {c.close_time || '—'}
                        </div>
                      )}
                    </div>

                    <div className="card-body">
                      <div className="card-spec">
                        {[...new Set(c.scans.map(sc => sc.modality).filter(Boolean))].slice(0, 3).join(' · ') || 'Diagnostics'}
                      </div>
                      <div className="card-name">{c.name}</div>
                      <div className="card-meta">
                        <div className="meta-item">
                          <div className="meta-icon"><i className="bi bi-geo-alt me-1" /></div>
                          {c.city}
                        </div>
                        <div className="meta-item">
                          <div className="meta-icon"><i className="bi bi-clipboard2-pulse me-1" /></div>
                          {c.scans.length} {centreCopy.unit}{c.scans.length === 1 ? '' : 's'}
                        </div>
                      </div>
                      {c.scans.length > 0 && (
                        <div className="slot-chips">
                          {c.scans.slice(0, 3).map(sc => (
                            <span className="slot-chip" key={sc.id}>{sc.name}</span>
                          ))}
                          {c.scans.length > 3 && <span className="slot-more">+{c.scans.length - 3}</span>}
                        </div>
                      )}
                      <div className="card-slots-count">
                        {c.scans.length > 0
                          ? `${c.scans.length} ${centreCopy.unit}${c.scans.length === 1 ? '' : 's'} available`
                          : 'Contact the centre directly'}
                      </div>
                      <div className="card-footer">
                        <div className="card-fee">
                          {c.scans.length > 0 ? (
                            <>
                              <span className="card-fee-amount">from ₹{priceFrom(c.scans)}</span>
                              <span className="card-fee-sub">per {centreCopy.unit}</span>
                            </>
                          ) : (
                            <span className="card-fee-sub">Prices on request</span>
                          )}
                        </div>
                        <span className="book-btn">View {centreCopy.unit}s</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {!loading && mode === 'doctors' && filtered.length > 0 && (
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
                        ? <img className="card-img" src={doc.image} alt={providerLabel(doc.name)} />
                        : <div className="card-img-placeholder"><i className="bi bi-clipboard-pulse me-1" /></div>
                      }
                      <div className={`card-avail ${doc.available ? 'yes' : 'no'}`}>
                        <span className="avail-dot" />
                        {doc.available ? t('doctors.available') : t('doctors.unavailable')}
                      </div>
                      <div className="hospital-tag"><i className="bi bi-hospital me-1" />{doc.hospital_name || t('footer.hospital')}</div>
                    </div>

                    <div className="card-body">
                      <div className="card-spec">{doc.specialization}</div>
                      <div className="card-name">{providerLabel(doc.name)}</div>
                      <div className="card-meta">
                        <div className="meta-item">
                          <div className="meta-icon"><i className="bi bi-geo-alt me-1" /></div>
                          {doc.city}
                        </div>
                        <div className="meta-item">
                          <div className="meta-icon"><i className="bi bi-hourglass-split me-1" /></div>
                          {t('doctors.yearsExp', { count: doc.experience })}
                        </div>
                      </div>
                      {doc.slots && doc.slots.length > 0 && (
                        <div className="slot-chips">
                          {doc.slots.slice(0, 3).map(s => <span className="slot-chip" key={s}>{s}</span>)}
                          {doc.slots.length > 3 && <span className="slot-more">+{doc.slots.length - 3}</span>}
                        </div>
                      )}
                      <div className="card-slots-count">
                        {doc.slots?.length > 0 ? t('doctors.slotsToday', { count: doc.slots.length }) : t('doctors.contactHospital')}
                      </div>
                      <div className="card-footer">
                        <div className="card-fee">
                          <span className="card-fee-amount">₹{doc.fee || 15}</span>
                          <span className="card-fee-sub">{t('doctors.perVisit')}</span>
                        </div>
                        <span className="book-btn">{t('doctors.bookNow')}</span>
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