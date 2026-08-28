/**
 * "About the …" panel — logo, hours, blurb, socials, services and photos for a
 * provider, whatever kind it is.
 *
 * Lifted out of DoctorsDetails so the scanning-centre and blood-centre pages
 * get the same panel instead of a second copy that drifts. Centres are Hospital
 * rows and their detail pages already fetch /hospitals/<id>/, so every field
 * here was being returned and thrown away.
 *
 * Renders nothing at all when the provider has filled none of it in — an empty
 * "About" heading reads as something failing to load.
 */
import React from 'react';

// Is it open right now? true/false, or null when the hours are unknown.
// Handles overnight ranges (22:00 – 06:00).
function hmToMinutes(hm) {
  if (!hm || typeof hm !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function isOpenNow(open, close, now = new Date()) {
  const o = hmToMinutes(open);
  const c = hmToMinutes(close);
  if (o == null || c == null) return null;
  const cur = now.getHours() * 60 + now.getMinutes();
  return o <= c ? (cur >= o && cur < c) : (cur >= o || cur < c);
}

// A placeholder URL is worse than no image — it renders a grey box that looks
// like a broken upload.
const validImg = (u) => u && String(u).startsWith('http') && !String(u).includes('placehold');

const socialBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  background: '#EAF3FF', border: '1px solid #cfe2f3', color: '#185FA5',
  borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 600, textDecoration: 'none',
};
const sectionLabel = {
  fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: 1, marginBottom: 8, marginTop: 4,
};

export default function ProviderAboutPanel({ info, title = 'About the Hospital', icon = 'bi-hospital' }) {
  if (!info) return null;

  const hasAnything = info.description || info.open_time || info.instagram || info.youtube
    || info.facebook || info.services?.length > 0 || info.gallery?.length > 0;
  if (!hasAnything) return null;

  const openNow = isOpenNow(info.open_time, info.close_time);

  return (
    <div className="pap">
      <style>{`
        .pap {
          background: #fff; border: 1px solid var(--blue-100);
          border-radius: 16px; padding: 18px; margin-bottom: 16px;
        }
        .pap-title {
          font-family: var(--font-display);
          font-size: 14px; font-weight: 700; color: var(--gray-900);
          display: flex; align-items: center; gap: 8px;
        }
        .pap-title-icon {
          width: 28px; height: 28px; border-radius: 7px; background: var(--blue-50);
          display: flex; align-items: center; justify-content: center;
          font-size: 13px; flex-shrink: 0;
        }
        @media (max-width: 640px) {
          .pap { padding: 14px; border-radius: 12px; }
          .pap-title { font-size: 13px; }
        }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {validImg(info.logo) && (
            <img src={info.logo} alt="Logo" style={{ width: 38, height: 38, borderRadius: 10, objectFit: 'cover', border: '1px solid #cfe2f3' }} />
          )}
          <div className="pap-title">
            <div className="pap-title-icon"><i className={`bi ${icon}`} /></div>
            {title}
          </div>
        </div>
        {openNow != null && (
          <span style={{
            fontSize: 12, fontWeight: 700, borderRadius: 100, padding: '4px 12px', whiteSpace: 'nowrap',
            background: openNow ? '#EAF3DE' : '#FCEBEB',
            color: openNow ? '#3B6D11' : '#A32D2D',
            border: `1px solid ${openNow ? '#97C459' : '#F09595'}`,
          }}>
            {openNow ? 'Open now' : 'Closed'}
          </span>
        )}
      </div>

      {info.open_time && info.close_time && (
        <div style={{ fontSize: 14, color: '#475569', marginBottom: 10 }}>
          <i className="bi bi-clock me-1" />{info.open_time} – {info.close_time}
        </div>
      )}

      {info.description && (
        <p style={{ fontSize: 14, color: '#334155', lineHeight: 1.55, margin: '0 0 12px' }}>{info.description}</p>
      )}

      {(info.instagram || info.youtube || info.facebook) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          {info.instagram && <a href={info.instagram} target="_blank" rel="noreferrer" className="dd-social-btn" style={socialBtn}><i className="bi bi-instagram me-1" />Instagram</a>}
          {info.youtube   && <a href={info.youtube}   target="_blank" rel="noreferrer" className="dd-social-btn" style={socialBtn}><i className="bi bi-youtube me-1" />YouTube</a>}
          {info.facebook  && <a href={info.facebook}  target="_blank" rel="noreferrer" className="dd-social-btn" style={socialBtn}><i className="bi bi-facebook me-1" />Facebook</a>}
        </div>
      )}

      {info.services?.length > 0 && (
        <>
          <div style={sectionLabel}>SERVICES</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {info.services.map(s => (
              <span key={s} style={{ background: '#EAF3FF', border: '1px solid #cfe2f3', color: '#185FA5', borderRadius: 100, padding: '5px 12px', fontSize: 12, fontWeight: 600 }}>{s}</span>
            ))}
          </div>
        </>
      )}

      {info.gallery?.length > 0 && (
        <>
          <div style={sectionLabel}>PHOTOS</div>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
            {info.gallery.map(p => (
              <img key={p.id} src={p.url} alt="Facility" style={{ width: 150, height: 110, objectFit: 'cover', borderRadius: 12, border: '1px solid #e0e0e0', flexShrink: 0 }} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
