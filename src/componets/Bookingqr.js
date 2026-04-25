/**
 * BookingQR.js
 * Reusable QR code component for TokenWalla bookings.
 *
 * Generates a QR code purely in the browser using a <canvas> element.
 * No external QR library needed — uses the qrcode-generator approach
 * via a small inline implementation powered by the browser's Canvas API.
 *
 * Usage:
 *   import BookingQR from './BookingQR';
 *   <BookingQR token="TW-143052-A3F9B1" doctorName="..." hospital="..." date="..." slot="..." />
 *
 * The QR code encodes the booking token string.
 * The hospital scanner reads this token and hits GET /api/bookings/scan/<token>/
 */

import { useEffect, useRef, useState } from 'react';

// ── Tiny QR encoder (uses qrcode npm package loaded via CDN) ──────────────
// We load qrcode.js from CDN once, then use it for all instances.
let qrLoaded = false;
let qrLoadCallbacks = [];

function loadQRLib(cb) {
  if (typeof window === 'undefined') return;
  if (window.QRCode) { cb(); return; }
  if (qrLoaded) { qrLoadCallbacks.push(cb); return; }
  qrLoaded = true;
  const script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
  script.onload = () => {
    qrLoadCallbacks.forEach(fn => fn());
    qrLoadCallbacks = [];
    cb();
  };
  document.head.appendChild(script);
}

// ── Modal overlay ─────────────────────────────────────────────────────────
function QRModal({ token, doctorName, hospital, date, slot, onClose }) {
  const canvasRef = useRef(null);
  const qrRef     = useRef(null);

  useEffect(() => {
    loadQRLib(() => {
      if (!canvasRef.current || !window.QRCode) return;
      canvasRef.current.innerHTML = '';
      qrRef.current = new window.QRCode(canvasRef.current, {
        text:          token,
        width:         220,
        height:        220,
        colorDark:     '#0C447C',
        colorLight:    '#ffffff',
        correctLevel:  window.QRCode.CorrectLevel.H,
      });
    });
    return () => { if (qrRef.current) qrRef.current.clear?.(); };
  }, [token]);

  return (
    <>
      <style>{`
        .qr-overlay {
          position: fixed; inset: 0; z-index: 9999;
          background: rgba(4,44,83,0.55);
          backdrop-filter: blur(8px);
          display: flex; align-items: center; justify-content: center;
          padding: 20px;
          animation: qrFadeIn 0.2s ease both;
        }
        @keyframes qrFadeIn { from{opacity:0} to{opacity:1} }
        .qr-modal {
          background: #fff;
          border-radius: 24px;
          padding: 32px 28px;
          max-width: 340px; width: 100%;
          display: flex; flex-direction: column; align-items: center;
          box-shadow: 0 24px 64px rgba(4,44,83,0.25);
          position: relative;
          animation: qrSlideUp 0.25s cubic-bezier(0.34,1.56,0.64,1) both;
        }
        @keyframes qrSlideUp { from{opacity:0;transform:translateY(20px) scale(0.96)} to{opacity:1;transform:translateY(0) scale(1)} }
        .qr-modal::before {
          content:''; position:absolute; top:0;left:0;right:0;height:4px;
          background: linear-gradient(90deg,#185FA5,#378ADD,#85B7EB);
          border-radius:24px 24px 0 0;
        }
        .qr-close {
          position: absolute; top: 14px; right: 16px;
          width: 30px; height: 30px; border-radius: 50%;
          background: var(--gray-100,#F1F5F9);
          border: none; cursor: pointer; font-size: 16px;
          display: flex; align-items: center; justify-content: center;
          transition: background 0.15s;
        }
        .qr-close:hover { background: var(--gray-200,#E2E8F0); }
        .qr-heading {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 1.1rem; font-weight: 800;
          color: var(--gray-900,#0F172A); margin-bottom: 4px; text-align: center;
        }
        .qr-subheading {
          font-size: 13px; color: var(--gray-500,#64748B);
          margin-bottom: 22px; text-align: center;
        }
        .qr-canvas-wrap {
          background: #fff;
          border: 2px solid var(--blue-200,#85B7EB);
          border-radius: 16px;
          padding: 14px;
          margin-bottom: 20px;
          box-shadow: 0 4px 20px rgba(24,95,165,0.12);
        }
        .qr-token-pill {
          font-family: 'DM Mono', monospace;
          font-size: 13px; font-weight: 500;
          color: var(--blue-600,#185FA5);
          background: var(--blue-50,#E6F1FB);
          border: 1px solid var(--blue-200,#85B7EB);
          border-radius: 100px; padding: 5px 16px;
          margin-bottom: 18px; letter-spacing: 0.5px;
        }
        .qr-info-grid {
          width: 100%; display: flex; flex-direction: column; gap: 8px;
          background: var(--gray-50,#F8FAFC);
          border: 1px solid var(--blue-100,#B5D4F4);
          border-radius: 12px; padding: 14px;
          margin-bottom: 18px;
        }
        .qr-info-row { display: flex; justify-content: space-between; align-items: center; font-size: 13px; }
        .qr-info-label { color: var(--gray-500,#64748B); }
        .qr-info-value { font-weight: 600; color: var(--gray-800,#1E293B); text-align: right; max-width: 60%; }
        .qr-hint {
          font-size: 12px; color: var(--gray-400,#94A3B8);
          text-align: center; line-height: 1.6;
        }
        @media (max-width: 400px) {
          .qr-modal { padding: 28px 18px; }
        }
      `}</style>
      <div className="qr-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="qr-modal">
          <button className="qr-close" onClick={onClose}>✕</button>

          <div className="qr-heading">Your Booking QR</div>
          <div className="qr-subheading">Show this to hospital reception</div>

          <div className="qr-canvas-wrap">
            <div ref={canvasRef} />
          </div>

          <div className="qr-token-pill">{token}</div>

          <div className="qr-info-grid">
            <div className="qr-info-row">
              <span className="qr-info-label">Doctor</span>
              <span className="qr-info-value">Dr. {doctorName}</span>
            </div>
            <div className="qr-info-row">
              <span className="qr-info-label">Hospital</span>
              <span className="qr-info-value">🏥 {hospital}</span>
            </div>
            <div className="qr-info-row">
              <span className="qr-info-label">Date</span>
              <span className="qr-info-value">{date}</span>
            </div>
            <div className="qr-info-row">
              <span className="qr-info-label">Slot</span>
              <span className="qr-info-value">{slot}</span>
            </div>
          </div>

          <div className="qr-hint">
            📸 Hospital staff will scan this QR to verify<br />
            and mark your attendance automatically
          </div>
        </div>
      </div>
    </>
  );
}

// ── Trigger button ────────────────────────────────────────────────────────
export default function BookingQR({ token, doctorName, hospital, date, slot, variant = 'button' }) {
  const [open, setOpen] = useState(false);

  // variant="button"  → standard button (used in MyBookings)
  // variant="inline"  → full inline display (used in BookingToken)
  const canvasRef = useRef(null);
  const qrRef     = useRef(null);

  useEffect(() => {
    if (variant !== 'inline') return;
    loadQRLib(() => {
      if (!canvasRef.current || !window.QRCode) return;
      canvasRef.current.innerHTML = '';
      qrRef.current = new window.QRCode(canvasRef.current, {
        text:          token,
        width:         200,
        height:        200,
        colorDark:     '#0C447C',
        colorLight:    '#ffffff',
        correctLevel:  window.QRCode.CorrectLevel.H,
      });
    });
    return () => { if (qrRef.current) qrRef.current.clear?.(); };
  }, [token, variant]);

  if (variant === 'inline') {
    return (
      <>
        <style>{`
          .qr-inline-wrap {
            display: flex; flex-direction: column; align-items: center;
            background: #fff; border: 1px solid var(--blue-100,#B5D4F4);
            border-radius: 18px; padding: 20px;
            margin: 16px 0;
          }
          .qr-inline-label {
            font-size: 11px; font-weight: 600; letter-spacing: 2px;
            text-transform: uppercase; color: var(--gray-400,#94A3B8);
            margin-bottom: 14px;
          }
          .qr-inline-canvas {
            background: #fff;
            border: 2px solid var(--blue-200,#85B7EB);
            border-radius: 12px; padding: 12px;
            margin-bottom: 12px;
            box-shadow: 0 4px 16px rgba(24,95,165,0.1);
          }
          .qr-inline-hint {
            font-size: 12px; color: var(--gray-400,#94A3B8);
            text-align: center; line-height: 1.6;
          }
        `}</style>
        <div className="qr-inline-wrap">
          <div className="qr-inline-label">Scan at Reception</div>
          <div className="qr-inline-canvas">
            <div ref={canvasRef} />
          </div>
          <div className="qr-inline-hint">
            Hospital staff will scan this to verify &amp; mark attendance
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{`
        .qr-trigger-btn {
          display: inline-flex; align-items: center; gap: 7px;
          background: var(--blue-50,#E6F1FB);
          border: 1px solid var(--blue-200,#85B7EB);
          border-radius: 9px; padding: 8px 14px;
          font-family: 'DM Sans', sans-serif;
          font-size: 13px; font-weight: 600;
          color: var(--blue-700,#0C447C);
          cursor: pointer; transition: all 0.15s;
        }
        .qr-trigger-btn:hover { background: var(--blue-100,#B5D4F4); border-color: var(--blue-400,#378ADD); }
      `}</style>
      <button className="qr-trigger-btn" onClick={() => setOpen(true)}>
        <span>⬛</span> Show QR
      </button>
      {open && (
        <QRModal
          token={token}
          doctorName={doctorName}
          hospital={hospital}
          date={date}
          slot={slot}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}