import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router';
import API from '../services/api';
import SEO from './SEO';
import ProviderAboutPanel from './ProviderAboutPanel';

/**
 * /scan-center/:id — a scanning centre and its menu of scans.
 *
 * The one structural difference from DoctorsDetails: a doctor IS the service
 * (one name, one fee, straight to slots), while a centre offers many services
 * at many prices. So there is a step in between — pick the scan, THEN the slot.
 *
 * The scan is selected in place and the slot grid expands underneath it rather
 * than navigating to a second page. Back still works, nothing has to be carried
 * across a navigation, and on a phone it is one scroll instead of a page load.
 */
// Enabled 2026-08-18 with item 8 slice 3: /api/payment/create-order/ branches
// on scanId, /verify/ binds the scan from the ORDER TAGS, and the capacity
// backstop refunds a slot that fills after capture.
//
// BOTH collection modes now check out online — a centre chooses per scan the
// way a doctor chooses per doctor. The phone fallback below survives only for
// a centre with checkout switched off entirely; it is no longer keyed to the
// collection mode.
const SCAN_CHECKOUT_ENABLED = true;

export default function ScanCenterDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [centre,  setCentre]  = useState(null);
  const [scans,   setScans]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  // This one page serves both centre kinds — the flow is identical (pick the
  // service, then the slot), only the noun differs. Derived from the fetched
  // centre, so a blood centre says "Tests" no matter which link got here.
  const noun = centre?.kind === 'BLOOD_CENTER'
    ? { Title: 'Tests', plural: 'tests', one: 'test',
        label: 'Blood Centre',    icon: 'bi-droplet' }
    : { Title: 'Scans', plural: 'scans', one: 'scan',
        label: 'Scanning Centre', icon: 'bi-activity' };

  const [selectedScan, setSelectedScan] = useState(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedSlot, setSelectedSlot] = useState('');
  const [slotAvail,    setSlotAvail]    = useState({});
  const [availLoading, setAvailLoading] = useState(false);

  const user = JSON.parse(localStorage.getItem('user') || 'null');

  // ── Load the centre and its scans ─────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      API.get(`/hospitals/${id}/`),
      API.get('/scans/', { params: { center: id } }),
    ])
      .then(([cRes, sRes]) => {
        if (cancelled) return;
        setCentre(cRes.data);
        setScans(Array.isArray(sRes.data) ? sRes.data : (sRes.data.results || []));
      })
      .catch(() => { if (!cancelled) setError('We could not load this centre.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  // Next 7 days, computed — never hard-coded, so the page cannot rot into the past.
  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return {
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      label: d.toLocaleDateString('en-IN', { weekday: 'short' }),
      num:   d.getDate(),
      month: d.toLocaleDateString('en-IN', { month: 'short' }),
    };
  });

  // ── Availability for the selected scan + date ─────────────────────────────
  useEffect(() => {
    if (!selectedScan || !selectedDate) { setSlotAvail({}); return; }
    let cancelled = false;
    setAvailLoading(true);
    API.get(`/scans/${selectedScan.id}/slot-availability/`, { params: { date: selectedDate } })
      .then(({ data }) => { if (!cancelled) setSlotAvail(data || {}); })
      .catch(() => { if (!cancelled) setSlotAvail({}); })
      .finally(() => { if (!cancelled) setAvailLoading(false); });
    return () => { cancelled = true; };
  }, [selectedScan, selectedDate]);

  const pickScan = (scan) => {
    // Re-tapping the open scan closes it; picking a different one resets the
    // slot, because a slot chosen for an MRI means nothing for a blood draw.
    const same = selectedScan?.id === scan.id;
    setSelectedScan(same ? null : scan);
    setSelectedSlot('');
    setSelectedDate(same ? '' : dates[0].value);
    if (!same) API.post(`/scans/${scan.id}/view/`).catch(() => {});
  };

  const handleBook = () => {
    if (!user) { navigate('/login'); return; }
    if (!selectedScan || !selectedSlot) return;
    if (slotAvail[selectedSlot]?.full) {
      alert('That slot just filled up. Please choose another.');
      setSelectedSlot('');
      return;
    }
    navigate('/payment', {
      state: {
        scanId:   selectedScan.id,
        scanName: selectedScan.name,
        hospital: centre.name,
        date:     selectedDate,
        slot:     selectedSlot,
        // Server recomputes the authoritative total — this is for display only.
        scanFee:  selectedScan.price,
        queue_access: true,
      },
    });
  };

  const callNumber = centre?.landline || centre?.mobile;

  if (loading) return <div className="sc-state">Loading…</div>;
  if (error || !centre) {
    return (
      <div className="sc-state">
        {error || 'Centre not found.'}
        <div><Link to="/alldoctor" className="sc-back-link">← Back to browse</Link></div>
      </div>
    );
  }

  return (
    <>
      <SEO
        title={`${centre.name} — ${noun.plural} & prices | TokenWalla`}
        description={`Book MRI, CT, X-ray and blood tests at ${centre.name}, ${centre.city}. See prices and available slots.`}
      />
      <style>{css}</style>

      <div className="sc-page">
        <div className="tw-container">
          <button className="sc-back" onClick={() => navigate(-1)}>← Back</button>

          {/* ── Header ── */}
          <div className="sc-header">
            <div className="sc-header-main">
              <div className="sc-kind"><i className={`bi ${noun.icon} me-1`} /> {noun.label}</div>
              <h1 className="sc-name">{centre.name}</h1>
              <div className="sc-meta">
                {centre.city && <span><i className="bi bi-geo-alt me-1" />{centre.city}</span>}
                {(centre.open_time || centre.close_time) && (
                  <span><i className="bi bi-clock me-1" />{centre.open_time || '—'} – {centre.close_time || '—'}</span>
                )}
                <span><i className="bi bi-clipboard2-pulse me-1" />{scans.length} {noun.one}{scans.length === 1 ? '' : 's'}</span>
              </div>
              {centre.address && <div className="sc-address">{centre.address}</div>}
            </div>

            <div className="sc-header-actions">
              {callNumber && (
                <a className="sc-call" href={`tel:${callNumber}`}>
                  <i className="bi bi-telephone me-1" />Call {callNumber}
                </a>
              )}
              {centre.latitude != null && centre.longitude != null && (
                <a
                  className="sc-map"
                  target="_blank"
                  rel="noreferrer"
                  href={`https://www.google.com/maps/search/?api=1&query=${centre.latitude},${centre.longitude}`}
                >
                  <i className="bi bi-geo-alt me-1" />View on Map
                </a>
              )}
            </div>
          </div>

          {centre.announcement_active && centre.announcement && (
            <div className="sc-announce"><i className="bi bi-megaphone me-1" />{centre.announcement}</div>
          )}

          {/* Photos, hours, blurb and socials — the same panel the doctor page
              shows, and the same data: a centre IS a Hospital row, and this
              page already fetches /hospitals/<id>/. It was all being returned
              and thrown away. */}
          <ProviderAboutPanel
            info={centre}
            title={`About the ${noun.label}`}
            icon={noun.icon}
          />

          {/* ── The menu ── */}
          <h2 className="sc-section-title">{noun.Title} &amp; Prices</h2>

          {scans.length === 0 && (
            <div className="sc-empty">
              This centre has not listed its {noun.plural} yet.
              {callNumber && <> Call <a href={`tel:${callNumber}`}>{callNumber}</a> to ask what they offer.</>}
            </div>
          )}

          <div className="sc-menu">
            {scans.map(scan => {
              const open = selectedScan?.id === scan.id;
              return (
                <div className={`sc-item ${open ? 'is-open' : ''}`} key={scan.id}>
                  <button className="sc-item-row" onClick={() => pickScan(scan)} aria-expanded={open}>
                    <span className="sc-item-main">
                      <span className="sc-item-name">{scan.name}</span>
                      <span className="sc-item-tags">
                        {scan.modality && <span className="sc-tag">{scan.modality}</span>}
                        <span className="sc-dur">{scan.duration_minutes} min</span>
                      </span>
                    </span>
                    <span className="sc-item-right">
                      <span className="sc-price">₹{scan.price}</span>
                      <span className="sc-select">{open ? 'Close' : 'Select'}</span>
                    </span>
                  </button>

                  {open && (
                    <div className="sc-expand">
                      {scan.description && <p className="sc-desc">{scan.description}</p>}

                      {/* Prep is the highest-value scan-only field there is: a
                          patient who arrives unfasted has burned the slot and
                          the machine time. Shown before the slots, not after. */}
                      {scan.prep_instructions && (
                        <div className="sc-prep">
                          <div className="sc-prep-title"><i className="bi bi-exclamation-triangle me-1" />Before you come</div>
                          <div className="sc-prep-body">{scan.prep_instructions}</div>
                        </div>
                      )}

                      {scan.days?.length > 0 && (
                        <div className="sc-days"><strong>Available days:</strong> {scan.days.join(', ')}</div>
                      )}

                      {scan.slots?.length > 0 ? (
                        <>
                          <div className="sc-sub">Pick a date</div>
                          <div className="sc-dates">
                            {dates.map(d => (
                              <button
                                key={d.value}
                                className={`sc-date ${selectedDate === d.value ? 'is-active' : ''}`}
                                onClick={() => { setSelectedDate(d.value); setSelectedSlot(''); }}
                              >
                                <span className="sc-date-lbl">{d.label}</span>
                                <span className="sc-date-num">{d.num}</span>
                                <span className="sc-date-mon">{d.month}</span>
                              </button>
                            ))}
                          </div>

                          <div className="sc-sub">Pick a time</div>
                          <div className={`sc-slots ${availLoading ? 'is-loading' : ''}`}>
                            {scan.slots.map(sl => {
                              const info = slotAvail[sl];
                              const full = info?.full;
                              const left = info ? info.max - info.booked : null;
                              return (
                                <button
                                  key={sl}
                                  className={`sc-slot ${selectedSlot === sl ? 'is-active' : ''} ${full ? 'is-full' : ''}`}
                                  disabled={full}
                                  title={full ? 'This slot is full or too close to start' : left != null ? `${left} left` : ''}
                                  onClick={() => !full && setSelectedSlot(sl)}
                                >
                                  {sl}
                                </button>
                              );
                            })}
                          </div>

                          {/* No slot to sell means no token to sell. The CTA
                              stays disabled rather than taking money for a slot
                              that was never chosen. */}
                          {SCAN_CHECKOUT_ENABLED ? (
                            <>
                              <button
                                className="sc-book"
                                disabled={!selectedSlot || !scan.available}
                                onClick={handleBook}
                              >
                                {!scan.available
                                  ? 'Currently unavailable'
                                  : !selectedSlot
                                    ? 'Select a time slot'
                                    : user
                                      ? `Book ${scan.name} →`
                                      : 'Login to Book →'}
                              </button>
                              <p className="sc-note">
                                {scan.fee_breakdown?.collection_mode === 'FULL'
                                  ? `${noun.Title.slice(0, -1)} price + service fee payable now`
                                  : `Pay the ₹${scan.price} ${noun.one} price at the centre — only the service fee is paid online`}
                              </p>
                            </>
                          ) : callNumber ? (
                            <>
                              <a className="sc-book sc-book-call" href={`tel:${callNumber}`}>
                                <i className="bi bi-telephone me-1" />Call {callNumber} to book
                              </a>
                              <p className="sc-note">
                                {selectedSlot
                                  ? `Ask for ${scan.name} at ${selectedSlot}.`
                                  : 'This scan is booked over the phone.'}
                              </p>
                            </>
                          ) : (
                            <p className="sc-note">
                              Contact the centre directly to book this scan.
                            </p>
                          )}
                        </>
                      ) : (
                        <div className="sc-walkin">
                          No online slots for this scan.
                          {callNumber && <> Call <a href={`tel:${callNumber}`}>{callNumber}</a> to arrange a visit.</>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

const css = `
.sc-page { padding: 24px 0 64px; background: var(--gray-50, #F8FAFC); min-height: 70vh; }
.sc-state { padding: 80px 24px; text-align: center; color: var(--gray-500, #64748B); }
.sc-back-link { display: inline-block; margin-top: 12px; color: var(--blue-600, #1565C0); }
.sc-back { background: none; border: none; cursor: pointer; color: var(--gray-500,#64748B); font-size: 14px; padding: 0 0 14px; }

.sc-header { display: flex; gap: 20px; flex-wrap: wrap; justify-content: space-between; align-items: flex-start;
  background: #fff; border: 1px solid var(--gray-200,#E2E8F0); border-radius: 16px; padding: 20px 22px; }
.sc-kind { display: inline-block; font-size: 11.5px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;
  color: var(--blue-700,#12497F); background: var(--blue-50,#E6F0FA); padding: 4px 10px; border-radius: 999px; }
.sc-name { font-size: 26px; font-weight: 800; color: var(--gray-900,#0F172A); margin: 10px 0 6px; }
.sc-meta { display: flex; gap: 16px; flex-wrap: wrap; font-size: 13.5px; color: var(--gray-500,#64748B); }
.sc-address { margin-top: 8px; font-size: 13px; color: var(--gray-400,#94A3B8); }
.sc-header-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.sc-call, .sc-map { display: inline-flex; align-items: center; text-decoration: none; font-size: 13.5px; font-weight: 700;
  padding: 9px 16px; border-radius: 10px; }
.sc-call { background: var(--blue-600,#1565C0); color: #fff; }
.sc-map  { background: #fff; color: var(--blue-700,#12497F); border: 1px solid var(--blue-200,#A9CCEC); }

.sc-announce { margin-top: 14px; padding: 11px 14px; border-radius: 10px; font-size: 13.5px;
  background: #FFF7ED; border: 1px solid #FED7AA; color: #9A3412; }

.sc-section-title { font-size: 18px; font-weight: 800; color: var(--gray-900,#0F172A); margin: 28px 0 12px; }
.sc-empty { background: #fff; border: 1px dashed var(--gray-200,#E2E8F0); border-radius: 14px;
  padding: 28px; text-align: center; color: var(--gray-500,#64748B); font-size: 14px; }

.sc-menu { display: flex; flex-direction: column; gap: 10px; }
.sc-item { background: #fff; border: 1px solid var(--gray-200,#E2E8F0); border-radius: 14px; overflow: hidden; }
.sc-item.is-open { border-color: var(--blue-400,#4C8FD6); box-shadow: 0 0 0 3px rgba(21,101,192,.08); }
.sc-item-row { width: 100%; display: flex; justify-content: space-between; align-items: center; gap: 16px;
  padding: 15px 18px; background: none; border: none; cursor: pointer; text-align: left; }
.sc-item-main { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.sc-item-name { font-size: 15px; font-weight: 700; color: var(--gray-900,#0F172A); }
.sc-item-tags { display: flex; gap: 8px; align-items: center; }
.sc-tag { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .03em;
  background: var(--blue-50,#E6F0FA); color: var(--blue-700,#12497F); padding: 2px 8px; border-radius: 6px; }
.sc-dur { font-size: 12px; color: var(--gray-400,#94A3B8); }
.sc-item-right { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; flex-shrink: 0; }
.sc-price { font-size: 17px; font-weight: 800; color: var(--gray-900,#0F172A); }
.sc-select { font-size: 12px; font-weight: 700; color: var(--blue-600,#1565C0); }

.sc-expand { padding: 4px 18px 18px; border-top: 1px solid var(--gray-100,#F1F5F9); }
.sc-desc { font-size: 13.5px; color: var(--gray-500,#64748B); margin: 12px 0 0; }
.sc-prep { margin-top: 12px; padding: 11px 13px; border-radius: 10px;
  background: #FFFBEB; border: 1px solid #FDE68A; }
.sc-prep-title { font-size: 12.5px; font-weight: 800; color: #92400E; }
.sc-prep-body { font-size: 13px; color: #78350F; margin-top: 3px; white-space: pre-wrap; }
.sc-days { margin-top: 12px; font-size: 13px; color: var(--gray-500,#64748B); }
.sc-sub { margin: 16px 0 8px; font-size: 12.5px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .04em; color: var(--gray-400,#94A3B8); }

.sc-dates { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; }
.sc-date { flex: 0 0 auto; width: 62px; padding: 8px 0; border-radius: 10px; cursor: pointer;
  background: #fff; border: 1.5px solid var(--gray-200,#E2E8F0); display: flex; flex-direction: column; align-items: center; }
.sc-date.is-active { background: var(--blue-600,#1565C0); border-color: var(--blue-600,#1565C0); color: #fff; }
.sc-date-lbl { font-size: 11px; opacity: .8; }
.sc-date-num { font-size: 17px; font-weight: 800; }
.sc-date-mon { font-size: 10.5px; opacity: .8; }

.sc-slots { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 8px; }
.sc-slots.is-loading { opacity: .5; pointer-events: none; }
.sc-slot { padding: 9px 6px; border-radius: 9px; cursor: pointer; font-size: 13px; font-weight: 600;
  background: #fff; border: 1.5px solid var(--gray-200,#E2E8F0); color: var(--gray-800,#1E293B); }
.sc-slot.is-active { background: var(--blue-600,#1565C0); border-color: var(--blue-600,#1565C0); color: #fff; }
.sc-slot.is-full { opacity: .45; cursor: not-allowed; text-decoration: line-through; }

.sc-book { margin-top: 18px; width: 100%; padding: 13px; border: none; border-radius: 12px; cursor: pointer;
  font-size: 15px; font-weight: 800; color: #fff; background: var(--blue-600,#1565C0); }
.sc-book:disabled { background: var(--gray-200,#E2E8F0); color: var(--gray-400,#94A3B8); cursor: not-allowed; }
.sc-book-call { display: block; text-align: center; text-decoration: none; }
.sc-note { margin: 8px 0 0; font-size: 12px; color: var(--gray-400,#94A3B8); text-align: center; }
.sc-walkin { margin-top: 14px; font-size: 13.5px; color: var(--gray-500,#64748B); }

@media (max-width: 600px) {
  .sc-header { padding: 16px; }
  .sc-name { font-size: 21px; }
  .sc-slots { grid-template-columns: repeat(3, 1fr); }
}
`;
