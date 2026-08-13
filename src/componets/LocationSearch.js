import { useEffect, useRef, useState } from 'react';

/**
 * Free place autocomplete via Photon (OpenStreetMap) — no API key.
 * As the user types, suggests real places and, on pick, returns the place's
 * city + latitude/longitude so we can store an accurate map location.
 *
 * Props:
 *   value          — current text in the box
 *   onChangeText   — (text) => void, free typing
 *   onPick         — ({ city, label, lat, lng }) => void, a suggestion chosen
 *   placeholder, inputClassName, icon, disabled
 */
export default function LocationSearch({
  value,
  onChangeText,
  onPick,
  placeholder = 'Search your city or area…',
  inputClassName = '',
  icon = 'bi-geo-alt',
  disabled = false,
}) {
  const [results, setResults] = useState([]);
  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef      = useRef(null);
  const debounceRef = useRef(null);
  const lastQuery   = useRef('');

  // Debounced Photon lookup, biased toward Andhra Pradesh / Telangana.
  useEffect(() => {
    const q = (value || '').trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 3) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        setLoading(true);
        lastQuery.current = q;
        const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&lang=en&lat=16.5&lon=79.5`;
        const res  = await fetch(url);
        const data = await res.json();
        if (lastQuery.current !== q) return; // a newer query is in flight
        setResults(Array.isArray(data.features) ? data.features : []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [value]);

  // Close on outside click.
  useEffect(() => {
    const fn = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  const labelFor = (f) => {
    const p = f.properties || {};
    return [p.name, p.city && p.city !== p.name ? p.city : null, p.state]
      .filter(Boolean).join(', ');
  };

  const handlePick = (f) => {
    const p = f.properties || {};
    const coords = f.geometry?.coordinates || [];
    const city = p.city || (p.osm_value === 'city' || p.osm_value === 'town' ? p.name : '') || p.county || p.name || '';
    onPick({
      city,
      label: labelFor(f),
      lat: typeof coords[1] === 'number' ? coords[1] : null,
      lng: typeof coords[0] === 'number' ? coords[0] : null,
    });
    setOpen(false);
    setResults([]);
  };

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      {icon && (
        <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 15, color: '#94A3B8', pointerEvents: 'none', zIndex: 1 }}><i className={`bi ${icon}`} /></span>
      )}
      <input
        className={inputClassName}
        style={icon ? { paddingLeft: 40 } : undefined}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        autoComplete="off"
        onChange={(e) => { onChangeText(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {open && (results.length > 0 || loading) && (
        <div style={dropStyle}>
          {loading && results.length === 0 && (
            <div style={{ ...itemStyle, color: '#94A3B8', cursor: 'default' }}>Searching…</div>
          )}
          {results.map((f, i) => (
            <button
              key={i}
              type="button"
              style={itemStyle}
              onMouseDown={() => handlePick(f)}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#EAF3FF'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <i className="bi bi-geo-alt me-1" />{labelFor(f)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const dropStyle = {
  position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 200,
  background: '#fff', border: '1px solid #cfe2f3', borderRadius: 12, padding: 6,
  boxShadow: '0 8px 28px rgba(24,95,165,0.16)', maxHeight: 260, overflowY: 'auto',
};
const itemStyle = {
  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
  padding: '9px 12px', border: 'none', background: 'transparent', borderRadius: 8,
  fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: '#334155',
  cursor: 'pointer', textAlign: 'left',
};
