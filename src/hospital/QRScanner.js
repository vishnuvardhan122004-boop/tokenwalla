/**
 * QRScanner.js — Hospital QR Code Scanner Tab (FIXED)
 * Place at: src/hospital/QRScanner.js
 */

import { useEffect, useRef, useState } from 'react';
import API from '../services/api';

// ── Load jsQR from CDN ────────────────────────────────────────────────────
let jsQRLoaded = false;
function loadJsQR(cb) {
  if (window.jsQR) { cb(); return; }
  if (jsQRLoaded) { setTimeout(() => loadJsQR(cb), 200); return; }
  jsQRLoaded = true;
  const s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js';
  s.onload = cb;
  document.head.appendChild(s);
}

// ── Extract token_code from QR data ──────────────────────────────────────
// QR contains JSON: { token_code, doctor_name, hospital, date, slot }
// OR plain token string as fallback
function extractToken(raw) {
  const trimmed = raw.trim();
  try {
    const parsed = JSON.parse(trimmed);
    // Support both token_code and token field names
    return (parsed.token_code || parsed.token || '').trim().toUpperCase();
  } catch {
    // Not JSON — treat as plain token string
    return trimmed.toUpperCase();
  }
}

// ── Status badge styles ───────────────────────────────────────────────────
const STATUS_STYLE = {
  waiting:     { bg: 'var(--color-warning-bg)',  text: 'var(--color-warning-text)',  border: 'var(--color-warning-border)',  label: 'Waiting'         },
  in_progress: { bg: 'var(--blue-50)',           text: 'var(--blue-700)',            border: 'var(--blue-200)',              label: 'In Consultation' },
  completed:   { bg: 'var(--color-success-bg)',  text: 'var(--color-success-text)',  border: 'var(--color-success-border)', label: 'Completed'       },
  cancelled:   { bg: 'var(--gray-100)',          text: 'var(--gray-600)',            border: 'var(--gray-200)',             label: 'Cancelled'       },
};

export default function QRScanner() {
  const videoRef       = useRef(null);
  const canvasRef      = useRef(null);
  const animFrameRef   = useRef(null);
  const streamRef      = useRef(null);
  const lastScannedRef = useRef('');
  const scanCooldown   = useRef(false);

  const [scanning,    setScanning]    = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [manualToken, setManualToken] = useState('');

  const [scanResult,  setScanResult]  = useState(null);
  const [scanState,   setScanState]   = useState('idle'); // idle | fetching | found | error | already_done | confirmed
  const [errorMsg,    setErrorMsg]    = useState('');
  const [confirming,  setConfirming]  = useState(false);

  // ── Start camera ─────────────────────────────────────────────────────────
  const startCamera = async () => {
    setCameraError('');
    setScanResult(null);
    setScanState('idle');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width:  { ideal: 1280 },
          height: { ideal: 720  },
        }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setScanning(true);
      loadJsQR(startScanLoop);
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setCameraError('Camera access denied. Please allow camera permission in your browser settings.');
      } else if (err.name === 'NotFoundError') {
        setCameraError('No camera found. Use manual token entry below.');
      } else {
        setCameraError('Could not start camera: ' + err.message);
      }
    }
  };

  // ── Stop camera ──────────────────────────────────────────────────────────
  const stopCamera = () => {
    setScanning(false);
    cancelAnimationFrame(animFrameRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  useEffect(() => () => stopCamera(), []);

  // ── Scan loop ─────────────────────────────────────────────────────────────
  const startScanLoop = () => {
    const scan = () => {
      const video  = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
        animFrameRef.current = requestAnimationFrame(scan);
        return;
      }

      const ctx = canvas.getContext('2d');
      canvas.width  = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = window.jsQR?.(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert',
      });

      if (code?.data && !scanCooldown.current) {
        // ── FIX 1: Extract token_code from JSON QR data ──
        const token = extractToken(code.data);

        if (token && token !== lastScannedRef.current) {
          lastScannedRef.current = token;
          scanCooldown.current   = true;
          handleTokenFound(token);
          setTimeout(() => { scanCooldown.current = false; }, 4000);
        }
      }

      animFrameRef.current = requestAnimationFrame(scan);
    };
    animFrameRef.current = requestAnimationFrame(scan);
  };

  // ── Handle found token ────────────────────────────────────────────────────
  const handleTokenFound = async (rawToken) => {
    // ── FIX 2: Extract token in case manual input also has JSON ──
    const token = extractToken(rawToken);

    if (!token) {
      setErrorMsg('Invalid QR code — no token found.');
      setScanState('error');
      return;
    }

    setScanResult(null);
    setErrorMsg('');
    setScanState('fetching');

    await new Promise(r => setTimeout(r, 300));

    try {
      // ── FIX 3: Use POST with body { token_code } not GET with URL param ──
     const { data } = await API.get(`/bookings/scan/${token}/`);

      setScanResult(data);
      // If backend already marked attended, show already_done
      setScanState(data.already_done || data.status === 'completed' ? 'already_done' : 'found');

    } catch (err) {
      const status = err?.response?.status;
      if (status === 409) {
        // Already attended — still show the booking info
        const data = err?.response?.data;
        if (data?.booking) {
          setScanResult(data);
          setScanState('already_done');
        } else {
          setErrorMsg('This patient has already been attended.');
          setScanState('error');
        }
      } else if (status === 404) {
        setErrorMsg(`Token "${token}" not found. Please check and try again.`);
        setScanState('error');
      } else {
        const msg = err?.response?.data?.message
          || err?.response?.data?.detail
          || err?.response?.data?.error
          || 'Verification failed. Please try again.';
        setErrorMsg(msg);
        setScanState('error');
      }
    }
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    const t = manualToken.trim();
    if (!t) return;
    handleTokenFound(t);
  };

  // ── Mark as In Consultation ───────────────────────────────────────────────
  const markAttended = async () => {
   const token = scanResult?.booking?.token;
    if (!token) return;

    setConfirming(true);
    try {
      // PATCH to update status to in_progress
      await API.post(`/bookings/scan/${token}/`);
      setScanState('confirmed');
      setScanResult(prev => ({
        ...prev,
        booking: { ...(prev.booking || prev), status: 'in_progress' }
      }));
    } catch (err) {
      if (err?.response?.status === 409) {
        setScanState('already_done');
      } else {
        setErrorMsg(err?.response?.data?.message || 'Failed to mark attendance. Try again.');
        setScanState('error');
      }
    } finally {
      setConfirming(false);
    }
  };

  const resetScanner = () => {
    setScanResult(null);
    setScanState('idle');
    setErrorMsg('');
    setManualToken('');
    lastScannedRef.current = '';
    scanCooldown.current   = false;
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const booking = scanResult?.booking || scanResult;

  return (
    <>
      <style>{`
        .qs-root { font-family: 'DM Sans', sans-serif; max-width: 680px; margin: 0 auto; }
        .qs-header { margin-bottom: 24px; }
        .qs-title { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1.4rem; font-weight: 800; color: var(--gray-900); margin-bottom: 4px; }
        .qs-sub { font-size: 14px; color: var(--gray-400); }
        .qs-cam-wrap { position: relative; border-radius: 18px; overflow: hidden; background: #000; aspect-ratio: 16/9; margin-bottom: 16px; border: 2px solid var(--blue-200); box-shadow: 0 8px 32px rgba(24,95,165,0.15); }
        .qs-video { width: 100%; height: 100%; object-fit: cover; display: block; }
        .qs-canvas { display: none; }
        .qs-scan-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; }
        .qs-scan-frame { width: 200px; height: 200px; border: 3px solid rgba(55,138,221,0.9); border-radius: 16px; box-shadow: 0 0 0 4000px rgba(0,0,0,0.35); position: relative; }
        .qs-scan-line { position: absolute; left: 0; right: 0; height: 2px; background: linear-gradient(90deg, transparent, #378ADD, transparent); animation: qsScan 1.8s ease-in-out infinite; }
        @keyframes qsScan { 0%{top:0;opacity:0} 10%{opacity:1} 90%{opacity:1} 100%{top:calc(100% - 2px);opacity:0} }
        .qs-scan-corner { position: absolute; width: 20px; height: 20px; border-color: #378ADD; border-style: solid; border-width: 0; }
        .qs-scan-corner.tl { top:-2px; left:-2px; border-top-width:3px; border-left-width:3px; border-top-left-radius:6px; }
        .qs-scan-corner.tr { top:-2px; right:-2px; border-top-width:3px; border-right-width:3px; border-top-right-radius:6px; }
        .qs-scan-corner.bl { bottom:-2px; left:-2px; border-bottom-width:3px; border-left-width:3px; border-bottom-left-radius:6px; }
        .qs-scan-corner.br { bottom:-2px; right:-2px; border-bottom-width:3px; border-right-width:3px; border-bottom-right-radius:6px; }
        .qs-cam-label { position: absolute; bottom: 14px; left: 0; right: 0; text-align: center; color: rgba(255,255,255,0.8); font-size: 13px; font-weight: 500; }
        .qs-cam-placeholder { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 12px; padding: 32px; }
        .qs-cam-placeholder-icon { font-size: 3rem; }
        .qs-cam-placeholder-text { color: rgba(255,255,255,0.6); font-size: 14px; text-align: center; line-height: 1.6; }
        .qs-btn-row { display: flex; gap: 10px; margin-bottom: 20px; }
        .qs-start-btn { flex:1; padding:13px; border-radius:12px; border:none; background:var(--blue-600); color:#fff; font-family:'DM Sans',sans-serif; font-size:14px; font-weight:600; cursor:pointer; transition:all 0.2s; display:flex; align-items:center; justify-content:center; gap:8px; }
        .qs-start-btn:hover { background: var(--blue-800); }
        .qs-stop-btn { flex:1; padding:13px; border-radius:12px; border:1px solid var(--color-error-border); background:var(--color-error-bg); color:var(--color-error-text); font-family:'DM Sans',sans-serif; font-size:14px; font-weight:600; cursor:pointer; }
        .qs-manual { margin-bottom: 20px; }
        .qs-manual-label { font-size:12px; font-weight:600; color:var(--gray-600); margin-bottom:8px; display:block; letter-spacing:0.3px; }
        .qs-manual-row { display: flex; gap: 8px; }
        .qs-manual-input { flex:1; background:#fff; border:1px solid var(--blue-100); border-radius:11px; padding:11px 14px; font-family:'DM Mono',monospace; font-size:14px; color:var(--gray-900); outline:none; transition:all 0.15s; text-transform:uppercase; letter-spacing:0.5px; }
        .qs-manual-input::placeholder { font-family:'DM Sans',sans-serif; letter-spacing:0; text-transform:none; color:var(--gray-400); font-size:13px; }
        .qs-manual-input:focus { border-color:var(--blue-400); box-shadow:0 0 0 3px rgba(55,138,221,0.12); }
        .qs-manual-btn { padding:11px 18px; border-radius:11px; border:none; background:var(--blue-600); color:#fff; font-family:'DM Sans',sans-serif; font-size:14px; font-weight:600; cursor:pointer; }
        .qs-manual-btn:disabled { opacity:0.5; cursor:not-allowed; }
        .qs-divider { display:flex; align-items:center; gap:14px; margin:0 0 20px; font-size:12px; color:var(--gray-400); }
        .qs-divider::before,.qs-divider::after { content:''; flex:1; height:1px; background:var(--blue-100); }
        .qs-result { border-radius:18px; overflow:hidden; border:1px solid var(--blue-100); box-shadow:0 8px 32px rgba(24,95,165,0.1); animation:qsResultIn 0.3s cubic-bezier(0.34,1.56,0.64,1) both; }
        @keyframes qsResultIn { from{opacity:0;transform:translateY(12px) scale(0.98)} to{opacity:1;transform:translateY(0) scale(1)} }
        .qs-result-topbar { height: 4px; }
        .qs-result-topbar.success   { background: linear-gradient(90deg,var(--color-success-text),#97C459); }
        .qs-result-topbar.warning   { background: linear-gradient(90deg,#EF9F27,#f5c842); }
        .qs-result-topbar.error     { background: linear-gradient(90deg,var(--color-error-text),#f09595); }
        .qs-result-topbar.primary   { background: linear-gradient(90deg,var(--blue-600),var(--blue-400)); }
        .qs-result-topbar.confirmed { background: linear-gradient(90deg,#3B6D11,#97C459); }
        .qs-result-header { padding:18px 20px 14px; background:var(--gray-50); border-bottom:1px solid var(--blue-50); display:flex; align-items:center; gap:14px; }
        .qs-result-icon { font-size: 2rem; }
        .qs-result-title { font-family:'Plus Jakarta Sans',sans-serif; font-size:15px; font-weight:800; color:var(--gray-900); margin-bottom:2px; }
        .qs-result-sub { font-size:13px; color:var(--gray-500); }
        .qs-result-body { padding:18px 20px; background:#fff; }
        .qs-result-row { display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid var(--blue-50); font-size:14px; }
        .qs-result-row:last-child { border-bottom: none; }
        .qs-result-label { color: var(--gray-500); }
        .qs-result-value { font-weight:600; color:var(--gray-900); text-align:right; }
        .qs-status-badge { display:inline-flex; align-items:center; padding:3px 10px; border-radius:100px; font-size:12px; font-weight:600; border:1px solid transparent; }
        .qs-result-actions { padding:16px 20px; background:var(--gray-50); border-top:1px solid var(--blue-50); display:flex; gap:10px; }
        .qs-confirm-btn { flex:1; padding:13px; border-radius:12px; border:none; background:var(--blue-600); color:#fff; font-family:'DM Sans',sans-serif; font-size:14px; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px; }
        .qs-confirm-btn:disabled { opacity:0.5; cursor:not-allowed; }
        .qs-reset-btn { padding:13px 18px; border-radius:12px; border:1px solid var(--blue-100); background:#fff; color:var(--gray-600); font-family:'DM Sans',sans-serif; font-size:14px; font-weight:500; cursor:pointer; }
        .qs-fetching { display:flex; align-items:center; gap:12px; padding:20px; background:#fff; border-radius:18px; border:1px solid var(--blue-100); animation:qsResultIn 0.2s ease both; }
        .qs-spinner { width:22px; height:22px; border:2px solid var(--blue-100); border-top-color:var(--blue-600); border-radius:50%; animation:qsSpin 0.7s linear infinite; flex-shrink:0; }
        @keyframes qsSpin { to { transform: rotate(360deg); } }
        .qs-fetching-text { font-size:14px; font-weight:500; color:var(--blue-700); }
        .qs-error-box { background:var(--color-error-bg); border:1px solid var(--color-error-border); border-radius:16px; padding:16px 20px; display:flex; align-items:flex-start; gap:12px; animation:qsResultIn 0.2s ease both; }
        .qs-error-icon { font-size:22px; flex-shrink:0; }
        .qs-error-text { font-size:14px; color:var(--color-error-text); line-height:1.5; }
        .qs-error-retry { margin-top:8px; font-size:13px; font-weight:600; color:var(--color-error-text); cursor:pointer; text-decoration:underline; }
        @media (max-width:600px) { .qs-btn-row { flex-direction: column; } }
      `}</style>

      <div className="qs-root">
        <div className="qs-header">
          <div className="qs-title">📷 QR Code Scanner</div>
          <div className="qs-sub">Scan patient QR codes to verify bookings and mark attendance</div>
        </div>

        {/* Camera */}
        <div className="qs-cam-wrap">
          <video
            ref={videoRef}
            className="qs-video"
            playsInline muted autoPlay
            style={{ display: scanning ? 'block' : 'none' }}
          />
          <canvas ref={canvasRef} className="qs-canvas" />

          {scanning && (
            <div className="qs-scan-overlay">
              <div className="qs-scan-frame">
                <div className="qs-scan-line" />
                <div className="qs-scan-corner tl" />
                <div className="qs-scan-corner tr" />
                <div className="qs-scan-corner bl" />
                <div className="qs-scan-corner br" />
              </div>
            </div>
          )}
          {scanning && <div className="qs-cam-label">Point camera at patient's QR code</div>}
          {!scanning && (
            <div className="qs-cam-placeholder">
              <div className="qs-cam-placeholder-icon">📷</div>
              <div className="qs-cam-placeholder-text">
                {cameraError || 'Tap "Start Scanner" to activate camera'}
              </div>
            </div>
          )}
        </div>

        {/* Camera controls */}
        <div className="qs-btn-row">
          {!scanning
            ? <button className="qs-start-btn" onClick={startCamera}>📷 Start Scanner</button>
            : <button className="qs-stop-btn"  onClick={stopCamera}>⏹ Stop Camera</button>
          }
        </div>

        <div className="qs-divider">or enter token manually</div>

        {/* Manual entry */}
        <div className="qs-manual">
          <label className="qs-manual-label">Enter Booking Token</label>
          <form className="qs-manual-row" onSubmit={handleManualSubmit}>
            <input
              className="qs-manual-input"
              value={manualToken}
              onChange={e => setManualToken(e.target.value)}
              placeholder="e.g. TW-143052-A3F9B1"
            />
            <button
              type="submit"
              className="qs-manual-btn"
              disabled={!manualToken.trim() || scanState === 'fetching'}
            >
              Verify
            </button>
          </form>
        </div>

        {/* ── States ── */}
        {scanState === 'fetching' && (
          <div className="qs-fetching">
            <div className="qs-spinner" />
            <div className="qs-fetching-text">Verifying token...</div>
          </div>
        )}

        {scanState === 'error' && (
          <div className="qs-error-box">
            <div className="qs-error-icon">❌</div>
            <div>
              <div className="qs-error-text">{errorMsg}</div>
              <div className="qs-error-retry" onClick={resetScanner}>Try another token</div>
            </div>
          </div>
        )}

        {['found', 'already_done', 'confirmed'].includes(scanState) && booking && (() => {
          const st          = STATUS_STYLE[booking.status] || STATUS_STYLE.waiting;
          const isDone      = scanState === 'already_done';
          const isConfirmed = scanState === 'confirmed';
          const topColor    = isConfirmed ? 'confirmed' : isDone ? 'warning' : 'primary';

          return (
            <div className="qs-result">
              <div className={`qs-result-topbar ${topColor}`} />

              <div className="qs-result-header">
                <div className="qs-result-icon">
                  {isConfirmed ? '✅' : isDone ? '⚠️' : '🎫'}
                </div>
                <div>
                  <div className="qs-result-title">
                    {isConfirmed ? 'Marked as In Consultation!'
                      : isDone   ? 'Already Attended'
                      :            'Booking Verified ✓'}
                  </div>
                  <div className="qs-result-sub">
                    {isConfirmed ? `${booking.patient_name} has been called in`
                      : isDone   ? `Status is already: ${st.label}`
                      :            'Booking found — confirm to mark attendance'}
                  </div>
                </div>
              </div>

              <div className="qs-result-body">
                {[
                  { label: 'Patient',        value: `👤 ${booking.patient_name}`                                          },
                  { label: 'Mobile',         value: booking.patient_mobile,        mono: true                             },
                  { label: 'Doctor',         value: `Dr. ${booking.doctor_name}`                                          },
                  { label: 'Specialization', value: booking.specialization                                                },
                  { label: 'Date',           value: `📅 ${booking.date}`                                                  },
                  { label: 'Slot',           value: `🕐 ${booking.slot}`                                                  },
                  { label: 'Token',          value: booking.token,                 mono: true, blue: true                 },
                  { label: 'Amount Paid',    value: `₹${booking.amount}`,          bold: true, blue: true                 },
                ].map(({ label, value, mono, blue, bold }) => (
                  <div className="qs-result-row" key={label}>
                    <span className="qs-result-label">{label}</span>
                    <span className="qs-result-value" style={{
                      fontFamily: mono ? 'DM Mono, monospace' : undefined,
                      fontSize:   mono ? 13 : undefined,
                      color:      blue ? 'var(--blue-700)' : undefined,
                      fontWeight: bold ? 700 : undefined,
                    }}>
                      {value}
                    </span>
                  </div>
                ))}
                <div className="qs-result-row">
                  <span className="qs-result-label">Status</span>
                  <span className="qs-status-badge" style={{ background: st.bg, color: st.text, borderColor: st.border }}>
                    {st.label}
                  </span>
                </div>
              </div>

              <div className="qs-result-actions">
                {!isDone && !isConfirmed && (
                  <button className="qs-confirm-btn" onClick={markAttended} disabled={confirming}>
                    {confirming
                      ? <><div className="qs-spinner" style={{ borderTopColor: '#fff', width: 16, height: 16 }} /> Marking...</>
                      : '✅ Mark as In Consultation'
                    }
                  </button>
                )}
                {isConfirmed && (
                  <div style={{
                    flex: 1, padding: 13, borderRadius: 12,
                    background: 'var(--color-success-bg)', border: '1px solid var(--color-success-border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    fontSize: 14, fontWeight: 600, color: 'var(--color-success-text)'
                  }}>
                    ✅ Patient marked In Consultation
                  </div>
                )}
                <button className="qs-reset-btn" onClick={resetScanner}>
                  {isConfirmed || isDone ? 'Scan Next' : 'Cancel'}
                </button>
              </div>
            </div>
          );
        })()}
      </div>
    </>
  );
}