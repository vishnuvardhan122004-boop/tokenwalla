import { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import LocationSearch from './LocationSearch';

/**
 * Map location picker in a modal — Google-Maps-style: the pin is fixed at the
 * centre of the screen and you drag the map underneath it.
 *
 * Free and key-less on purpose, matching LocationSearch: OpenStreetMap tiles +
 * Photon for forward/reverse geocoding. No API key, no billing account.
 *
 * ponytail: OSM's public tile server is fine at hospital-signup volume; move to
 * a paid tile host (or self-host) if this ever gets embedded on a patient page.
 *
 * Props:
 *   open      — render the modal
 *   initial   — { lat, lng } to open on, or null
 *   onClose   — () => void
 *   onPick    — ({ city, label, lat, lng }) => void, "Confirm" pressed
 */
export default function LocationPicker({ open, initial, onClose, onPick }) {
  const holderRef = useRef(null);
  const mapRef    = useRef(null);
  const revRef    = useRef(null);
  const seqRef    = useRef(0);

  const [center,   setCenter]   = useState(null);   // { lat, lng }
  const [place,    setPlace]    = useState(null);   // { city, label }
  const [loading,  setLoading]  = useState(false);
  const [locating, setLocating] = useState(false);
  const [error,    setError]    = useState('');
  const [search,   setSearch]   = useState('');
  const [dragging, setDragging] = useState(false);

  // Reverse-geocode the map centre, debounced — the label under the pin.
  const reverse = useCallback((lat, lng) => {
    if (revRef.current) clearTimeout(revRef.current);
    setLoading(true);
    const seq = ++seqRef.current;
    revRef.current = setTimeout(async () => {
      try {
        const res  = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&lang=en`);
        const data = await res.json();
        if (seq !== seqRef.current) return;      // a newer move won
        setPlace(describe(data.features?.[0]));
      } catch {
        if (seq === seqRef.current) setPlace(null);
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }
    }, 450);
  }, []);

  // Build the map once the modal is on screen; tear it down on close.
  useEffect(() => {
    if (!open || !holderRef.current) return;

    const start = initial?.lat != null && initial?.lng != null
      ? { lat: initial.lat, lng: initial.lng }
      : { lat: 16.5, lng: 79.5 };                // same AP/Telangana bias as LocationSearch
    const zoom = initial?.lat != null ? 16 : 6;

    const map = L.map(holderRef.current, { zoomControl: false, attributionControl: true })
      .setView([start.lat, start.lng], zoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);
    L.control.zoom({ position: 'bottomleft' }).addTo(map);

    map.on('movestart', () => setDragging(true));
    map.on('moveend', () => {
      setDragging(false);
      const c = map.getCenter();
      setCenter({ lat: c.lat, lng: c.lng });
      reverse(c.lat, c.lng);
    });

    mapRef.current = map;
    setCenter(start);
    reverse(start.lat, start.lng);

    // Leaflet measures the container once, at build time. Inside a modal that
    // is still laying out (fonts, the flex footer) it latches a too-small size
    // and leaves half the panel grey. Re-measure whenever the box changes —
    // this also covers window resize and phone rotation.
    const ro = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    ro.observe(holderRef.current);

    return () => {
      if (revRef.current) clearTimeout(revRef.current);
      seqRef.current++;
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Escape closes.
  useEffect(() => {
    if (!open) return;
    const fn = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [open, onClose]);

  const flyTo = (lat, lng, zoom = 17) => mapRef.current?.flyTo([lat, lng], zoom, { duration: 0.8 });

  const useMyLocation = () => {
    if (!navigator.geolocation) { setError('This browser cannot share your location.'); return; }
    setError('');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        flyTo(pos.coords.latitude, pos.coords.longitude, 17);
      },
      (err) => {
        setLocating(false);
        setError(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission was blocked. Allow it in your browser, or search and drag the pin instead.'
            : 'Could not get your location. Search and drag the pin instead.'
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const confirm = () => {
    if (!center) return;
    onPick({
      city:  place?.city || '',
      label: place?.label || '',
      lat:   center.lat,
      lng:   center.lng,
    });
    onClose();
  };

  if (!open) return null;

  return (
    <div style={S.backdrop} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={S.sheet} role="dialog" aria-modal="true" aria-label="Set hospital location">

        <div style={S.head}>
          <div>
            <div style={S.title}>Set hospital location</div>
            <div style={S.sub}>Drag the map so the pin sits on your entrance</div>
          </div>
          <button type="button" onClick={onClose} style={S.close} aria-label="Close">✕</button>
        </div>

        <div style={S.mapWrap}>
          <div ref={holderRef} style={S.map} />

          {/* Floating search, like Maps */}
          <div style={S.searchFloat}>
            <LocationSearch
              value={search}
              inputClassName="form-control"
              placeholder="Search area, landmark or pincode…"
              onChangeText={setSearch}
              onPick={({ lat, lng, label }) => { setSearch(label); if (lat != null) flyTo(lat, lng); }}
            />
          </div>

          {/* Centre pin — sits above the map, never intercepts drags */}
          <div style={S.pinWrap}>
            <div style={{ ...S.pin, transform: dragging ? 'translateY(-10px)' : 'translateY(0)' }}>📍</div>
            <div style={{ ...S.pinShadow, opacity: dragging ? 0.25 : 0.45 }} />
          </div>

          <button
            type="button"
            onClick={useMyLocation}
            disabled={locating}
            style={S.locate}
            title="Use my current location"
          >
            {locating ? <span style={S.spin} /> : '◎'}
          </button>
        </div>

        <div style={S.foot}>
          {error && <div style={S.error}>{error}</div>}

          <div style={S.addrRow}>
            <span style={{ fontSize: 18, lineHeight: '22px' }}>📍</span>
            <div style={{ minWidth: 0 }}>
              <div style={S.addr}>
                {loading ? 'Locating…' : (place?.label || 'Move the map to choose a spot')}
              </div>
              {center && (
                <div style={S.coords}>
                  {center.lat.toFixed(6)}, {center.lng.toFixed(6)}
                </div>
              )}
            </div>
          </div>

          <div style={S.actions}>
            <button type="button" className="btn btn-light" style={S.btnGhost} onClick={onClose}>Cancel</button>
            <button type="button" style={S.btnPrimary} onClick={confirm} disabled={!center}>
              Confirm location
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Photon feature → { city, label } readable address. Exported for tests. */
export function describe(feature) {
  if (!feature) return null;
  const p = feature.properties || {};
  const street = [p.housenumber, p.street].filter(Boolean).join(' ');
  const city   = p.city || p.town || p.village || p.county || '';
  const label  = [
    p.name && p.name !== street ? p.name : null,
    street || null,
    p.district && p.district !== city ? p.district : null,
    city || null,
    p.state || null,
    p.postcode || null,
  ].filter(Boolean).join(', ');
  return { city, label };
}

const BLUE = '#185FA5';

const S = {
  backdrop: {
    position: 'fixed', inset: 0, zIndex: 1080, background: 'rgba(15,23,42,0.55)',
    backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
  },
  sheet: {
    width: '100%', maxWidth: 560, background: '#fff', borderRadius: 18, overflow: 'hidden',
    boxShadow: '0 24px 64px rgba(15,23,42,0.35)', display: 'flex', flexDirection: 'column',
    maxHeight: 'calc(100vh - 32px)', fontFamily: "'DM Sans', sans-serif",
  },
  head: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
    gap: 12, padding: '16px 18px 12px',
  },
  title: { fontWeight: 700, fontSize: 17, color: '#0F172A' },
  sub:   { fontSize: 12.5, color: '#64748B', marginTop: 2 },
  close: {
    border: 'none', background: '#F1F5F9', color: '#475569', width: 32, height: 32,
    borderRadius: '50%', fontSize: 14, cursor: 'pointer', flexShrink: 0,
  },
  mapWrap: { position: 'relative', height: 'min(52vh, 380px)', background: '#E2E8F0' },
  map:     { position: 'absolute', inset: 0 },
  searchFloat: {
    position: 'absolute', top: 12, left: 12, right: 12, zIndex: 500,
    boxShadow: '0 6px 20px rgba(15,23,42,0.18)', borderRadius: 12,
  },
  pinWrap: {
    position: 'absolute', left: '50%', top: '50%', zIndex: 450,
    transform: 'translate(-50%, -100%)', pointerEvents: 'none', textAlign: 'center',
  },
  pin: {
    fontSize: 34, lineHeight: '34px', transition: 'transform 140ms ease-out',
    filter: 'drop-shadow(0 3px 4px rgba(15,23,42,0.3))',
  },
  pinShadow: {
    width: 10, height: 5, margin: '2px auto 0', borderRadius: '50%',
    background: '#0F172A', transition: 'opacity 140ms ease-out',
  },
  locate: {
    position: 'absolute', right: 12, bottom: 12, zIndex: 500,
    width: 42, height: 42, borderRadius: '50%', border: 'none', background: '#fff',
    color: BLUE, fontSize: 20, cursor: 'pointer',
    boxShadow: '0 4px 14px rgba(15,23,42,0.25)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  spin: {
    width: 16, height: 16, borderRadius: '50%',
    border: `2px solid ${BLUE}`, borderTopColor: 'transparent',
    animation: 'spin 0.7s linear infinite', display: 'inline-block',
  },
  foot:    { padding: '14px 18px 16px', borderTop: '1px solid #E2E8F0' },
  error:   { fontSize: 12.5, color: '#B42318', background: '#FEF3F2', border: '1px solid #FEE4E2', borderRadius: 10, padding: '8px 10px', marginBottom: 10 },
  addrRow: { display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 14 },
  addr:    { fontSize: 14, color: '#0F172A', fontWeight: 600, lineHeight: '20px' },
  coords:  { fontSize: 11.5, color: '#94A3B8', marginTop: 2, fontVariantNumeric: 'tabular-nums' },
  actions: { display: 'flex', gap: 10, justifyContent: 'flex-end' },
  btnGhost: { borderRadius: 10, padding: '9px 16px', fontWeight: 600, fontSize: 14 },
  btnPrimary: {
    border: 'none', borderRadius: 10, padding: '9px 18px', fontWeight: 700, fontSize: 14,
    background: BLUE, color: '#fff', cursor: 'pointer',
    boxShadow: '0 4px 14px rgba(24,95,165,0.3)',
  },
};
