/**
 * QRScanner.js — Fixed Version
 *
 * Root causes fixed:
 * 1. API calls now use GET /bookings/scan/<token>/ and POST /bookings/scan/<token>/
 *    (was wrongly calling POST /bookings/scan/ with body)
 * 2. extractToken correctly parses JSON QR payload (token_code field)
 * 3. inversionAttempts: 'attemptBoth' so screen-displayed QR codes work
 * 4. Full video frame scanned (not just center crop)
 * 5. markAttended uses the correct PATCH /bookings/scan/<token>/ endpoint
 *    via the ScanQRView POST handler
 */

import { useEffect, useRef, useState } from 'react';
import API from '../services/api';

// ── jsQR loader ───────────────────────────────────────────────────────────────
let jsQRLoaded = false;
function loadJsQR(cb) {
  if (window.jsQR) { cb(); return; }
  if (jsQRLoaded) { setTimeout(() => loadJsQR(cb), 100); return; }
  jsQRLoaded = true;
  const s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js';
  s.onload = cb;
  s.onerror = () => { jsQRLoaded = false; console.error('jsQR failed to load'); };
  document.head.appendChild(s);
}

/**
 * Extract the booking token from a raw QR string.
 * The BookingQR component encodes JSON like:
 *   { "token_code": "TW-143052-A3F9B1", "doctor_name": "...", ... }
 * But the token may also be a plain string like "TW-143052-A3F9B1".
 */
function extractToken(raw) {
  if (!raw) return '';
  const trimmed = raw.trim();
  try {
    const parsed = JSON.parse(trimmed);
    // BookingQR.jsx uses key "token_code"
    return (parsed.token_code || parsed.token || '').trim().toUpperCase();
  } catch {
    // Not JSON — treat the whole string as the token
    return trimmed.toUpperCase();
  }
}

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
  const cooldownRef    = useRef(false);
  const frameCountRef  = useRef(0);
  const scanLoopActive = useRef(false);

  const [scanning,    setScanning]    = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [manualToken, setManualToken] = useState('');
  const [debugMsg,    setDebugMsg]    = useState('');

  const [scanResult,  setScanResult]  = useState(null);
  const [scanState,   setScanState]   = useState('idle');
  const [errorMsg,    setErrorMsg]    = useState('');
  const [confirming,  setConfirming]  = useState(false);

  // ── Camera ────────────────────────────────────────────────────────────────
  const startCamera = async () => {
    setCameraError('');
    setScanResult(null);
    setScanState('idle');
    setDebugMsg('Starting camera...');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width:  { ideal: 1280 },
          height: { ideal: 720  },
        },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setScanning(true);
      loadJsQR(() => {
        setDebugMsg('Camera ready — hold QR code in front of camera');
        startScanLoop();
      });
    } catch (err) {
      if (err.name === 'NotAllowedError')
        setCameraError('Camera access denied. Allow camera permission in browser settings.');
      else if (err.name === 'NotFoundError')
        setCameraError('No camera found. Use manual token entry below.');
      else
        setCameraError('Camera error: ' + err.message);
    }
  };

  const stopCamera = () => {
    scanLoopActive.current = false;
    setScanning(false);
    setDebugMsg('');
    cancelAnimationFrame(animFrameRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  useEffect(() => () => stopCamera(), []); // eslint-disable-line

  // ── Scan loop ─────────────────────────────────────────────────────────────
  const startScanLoop = () => {
    scanLoopActive.current = true;
    frameCountRef.current  = 0;

    const scan = () => {
      if (!scanLoopActive.current) return;

      const video  = videoRef.current;
      const canvas = canvasRef.current;

      if (!video || !canvas || video.readyState < 2 || video.videoWidth === 0) {
        animFrameRef.current = requestAnimationFrame(scan);
        return;
      }

      // Downscale for speed — jsQR works well at 640px wide
      const scale = Math.min(1, 640 / video.videoWidth);
      const w     = Math.floor(video.videoWidth  * scale);
      const h     = Math.floor(video.videoHeight * scale);

      if (canvas.width !== w || canvas.height !== h) {
        canvas.width  = w;
        canvas.height = h;
      }

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(video, 0, 0, w, h);
      const imageData = ctx.getImageData(0, 0, w, h);

      // attemptBoth = works for printed AND screen-displayed QR codes
      const code = window.jsQR?.(imageData.data, w, h, {
        inversionAttempts: 'attemptBoth',
      });

      if (code?.data && !cooldownRef.current) {
        const token = extractToken(code.data);

        if (token && token !== lastScannedRef.current) {
          lastScannedRef.current = token;
          cooldownRef.current    = true;
          setDebugMsg(`✅ QR detected: ${token}`);
          handleTokenFound(token);

          // 4 s cooldown — prevents scanning the same code repeatedly
          setTimeout(() => {
            cooldownRef.current    = false;
            lastScannedRef.current = '';
          }, 4000);
        } else if (!token) {
          setDebugMsg(`⚠️ QR read but no token found. Raw: ${code.data.slice(0, 50)}`);
        }
      } else if (!cooldownRef.current) {
        frameCountRef.current += 1;
        if (frameCountRef.current % 60 === 0) {
          setDebugMsg(`Scanning... (frame ${frameCountRef.current} · ${w}×${h})`);
        }
      }

      animFrameRef.current = requestAnimationFrame(scan);
    };

    animFrameRef.current = requestAnimationFrame(scan);
  };

  // ── Token lookup — FIX: GET /bookings/scan/<token>/ ───────────────────────
  const handleTokenFound = async (rawInput) => {
    const token = extractToken(rawInput);
    if (!token) {
      setErrorMsg('Invalid QR — could not extract a token.');
      setScanState('error');
      return;
    }

    setScanResult(null);
    setErrorMsg('');
    setScanState('fetching');

    try {
      // ✅ CORRECT: GET /api/bookings/scan/<token>/
      const { data } = await API.get(`/bookings/scan/${encodeURIComponent(token)}/`);

      setScanResult(data);
      setScanState(data.already_done ? 'already_done' : 'found');
    } catch (err) {
      const status = err?.response?.status;

      if (status === 404) {
        setErrorMsg(`Token "${token}" not found. Check the QR code.`);
        setScanState('error');
      } else if (status === 403) {
        setErrorMsg('This booking belongs to a different hospital.');
        setScanState('error');
      } else if (status === 409) {
        // Already attended — backend returns booking info in the error body
        const d = err?.response?.data;
        setScanResult({ already_done: true, booking: d?.booking || d });
        setScanState('already_done');
      } else {
        setErrorMsg(
          err?.response?.data?.message ||
          err?.response?.data?.detail  ||
          'Verification failed. Try again.'
        );
        setScanState('error');
      }
    }
  };

  // ── Mark attended — FIX: POST /bookings/scan/<token>/ ────────────────────
  const markAttended = async () => {
    const token = scanResult?.booking?.token;
    if (!token) return;

    setConfirming(true);
    try {
      // ✅ CORRECT: POST /api/bookings/scan/<token>/
      const { data } = await API.post(`/bookings/scan/${encodeURIComponent(token)}/`);

      setScanState('confirmed');
      setScanResult(prev => ({
        ...prev,
        booking: { ...(prev?.booking || {}), ...data.booking, status: 'in_progress' },
      }));
    } catch (err) {
      if (err?.response?.status === 409) {
        setScanState('already_done');
        const d = err?.response?.data;
        setScanResult(prev => ({
          ...prev,
          already_done: true,
          booking: d?.booking || prev?.booking,
        }));
      } else {
        setErrorMsg(err?.response?.data?.message || 'Failed to mark attendance.');
        setScanState('error');
      }
    } finally {
      setConfirming(false);
    }
  };

  // ── Manual entry ──────────────────────────────────────────────────────────
  const handleManualSubmit = (e) => {
    e.preventDefault();
    const t = manualToken.trim();
    if (t) handleTokenFound(t);
  };

  // ── Reset ─────────────────────────────────────────────────────────────────
  const resetScanner = () => {
    setScanResult(null);
    setScanState('idle');
    setErrorMsg('');
    setManualToken('');
    lastScannedRef.current = '';
    cooldownRef.current    = false;
    frameCountRef.current  = 0;

    if (scanning && !scanLoopActive.current) {
      setDebugMsg('Camera ready — hold QR code in front of camera');
      startScanLoop();
    }
  };

  const booking = scanResult?.booking || (scanResult?.valid === false ? null : scanResult);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        .qs-root{font-family:'DM Sans',sans-serif;max-width:680px;margin:0 auto}
        .qs-title{font-family:'Plus Jakarta Sans',sans-serif;font-size:1.4rem;font-weight:800;color:var(--gray-900);margin-bottom:4px}
        .qs-sub{font-size:14px;color:var(--gray-400);margin-bottom:24px}

        /* Camera viewport */
        .qs-cam-wrap{position:relative;border-radius:18px;overflow:hidden;background:#111;aspect-ratio:16/9;margin-bottom:8px;border:2px solid var(--blue-200);box-shadow:0 8px 32px rgba(24,95,165,0.15)}
        .qs-video{width:100%;height:100%;object-fit:cover;display:block}
        .qs-canvas{display:none}

        /* Scan overlay */
        .qs-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none}
        .qs-frame{width:220px;height:220px;position:relative}
        .qs-scan-line{position:absolute;left:0;right:0;height:3px;background:linear-gradient(90deg,transparent,#378ADD 40%,#85B7EB 60%,transparent);animation:qsScan 1.8s ease-in-out infinite;border-radius:2px;box-shadow:0 0 8px rgba(55,138,221,0.6)}
        @keyframes qsScan{0%{top:0;opacity:0}10%{opacity:1}90%{opacity:1}100%{top:calc(100% - 3px);opacity:0}}
        .qs-corner{position:absolute;width:24px;height:24px;border-color:#378ADD;border-style:solid;border-width:0}
        .qs-corner.tl{top:0;left:0;border-top-width:4px;border-left-width:4px;border-top-left-radius:6px}
        .qs-corner.tr{top:0;right:0;border-top-width:4px;border-right-width:4px;border-top-right-radius:6px}
        .qs-corner.bl{bottom:0;left:0;border-bottom-width:4px;border-left-width:4px;border-bottom-left-radius:6px}
        .qs-corner.br{bottom:0;right:0;border-bottom-width:4px;border-right-width:4px;border-bottom-right-radius:6px}
        .qs-cam-label{position:absolute;bottom:14px;left:0;right:0;text-align:center;color:rgba(255,255,255,0.85);font-size:13px;font-weight:500;letter-spacing:0.2px}
        .qs-placeholder{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:12px;padding:32px}
        .qs-placeholder-icon{font-size:3rem;opacity:0.6}
        .qs-placeholder-text{color:rgba(255,255,255,0.55);font-size:14px;text-align:center;line-height:1.6}

        /* Debug bar */
        .qs-debug{font-size:12px;color:var(--blue-700);background:var(--blue-50);border:1px solid var(--blue-100);border-radius:8px;padding:8px 12px;margin-bottom:12px;font-family:'DM Mono',monospace;min-height:34px;word-break:break-all;transition:background 0.2s}
        .qs-debug.detected{background:var(--color-success-bg);border-color:var(--color-success-border);color:var(--color-success-text)}

        /* Buttons */
        .qs-btn-row{display:flex;gap:10px;margin-bottom:20px}
        .qs-start-btn{flex:1;padding:13px;border-radius:12px;border:none;background:var(--blue-600);color:#fff;font-family:'DM Sans',sans-serif;font-size:14px;font-weight:600;cursor:pointer;transition:background 0.15s;display:flex;align-items:center;justify-content:center;gap:8px}
        .qs-start-btn:hover{background:var(--blue-800)}
        .qs-stop-btn{flex:1;padding:13px;border-radius:12px;border:1px solid var(--color-error-border);background:var(--color-error-bg);color:var(--color-error-text);font-family:'DM Sans',sans-serif;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.15s}
        .qs-stop-btn:hover{background:#f7c1c1}

        /* Manual entry */
        .qs-divider{display:flex;align-items:center;gap:14px;margin:0 0 16px;font-size:12px;color:var(--gray-400)}
        .qs-divider::before,.qs-divider::after{content:'';flex:1;height:1px;background:var(--blue-100)}
        .qs-manual-label{font-size:12px;font-weight:600;color:var(--gray-600);margin-bottom:8px;display:block;letter-spacing:0.3px}
        .qs-manual-row{display:flex;gap:8px;margin-bottom:20px}
        .qs-manual-input{flex:1;background:#fff;border:1px solid var(--blue-100);border-radius:11px;padding:11px 14px;font-family:'DM Mono',monospace;font-size:14px;color:var(--gray-900);outline:none;text-transform:uppercase;letter-spacing:0.5px;transition:all 0.15s}
        .qs-manual-input::placeholder{font-family:'DM Sans',sans-serif;letter-spacing:0;text-transform:none;color:var(--gray-400);font-size:13px}
        .qs-manual-input:focus{border-color:var(--blue-400);box-shadow:0 0 0 3px rgba(55,138,221,0.12)}
        .qs-manual-btn{padding:11px 18px;border-radius:11px;border:none;background:var(--blue-600);color:#fff;font-family:'DM Sans',sans-serif;font-size:14px;font-weight:600;cursor:pointer;transition:background 0.15s}
        .qs-manual-btn:hover:not(:disabled){background:var(--blue-800)}
        .qs-manual-btn:disabled{opacity:0.5;cursor:not-allowed}

        /* States */
        .qs-fetching{display:flex;align-items:center;gap:12px;padding:20px;background:#fff;border-radius:18px;border:1px solid var(--blue-100);animation:qsIn 0.2s ease both}
        .qs-spinner{width:22px;height:22px;border:2px solid var(--blue-100);border-top-color:var(--blue-600);border-radius:50%;animation:qsSpin 0.7s linear infinite;flex-shrink:0}
        @keyframes qsSpin{to{transform:rotate(360deg)}}
        .qs-fetching-text{font-size:14px;font-weight:500;color:var(--blue-700)}

        .qs-error-box{background:var(--color-error-bg);border:1px solid var(--color-error-border);border-radius:16px;padding:16px 20px;display:flex;align-items:flex-start;gap:12px;animation:qsIn 0.2s ease both}
        .qs-error-icon{font-size:22px;flex-shrink:0}
        .qs-error-text{font-size:14px;color:var(--color-error-text);line-height:1.5}
        .qs-error-retry{margin-top:8px;font-size:13px;font-weight:600;color:var(--color-error-text);cursor:pointer;text-decoration:underline}

        /* Result card */
        .qs-result{border-radius:18px;overflow:hidden;border:1px solid var(--blue-100);box-shadow:0 8px 32px rgba(24,95,165,0.1);animation:qsIn 0.3s cubic-bezier(0.34,1.56,0.64,1) both}
        @keyframes qsIn{from{opacity:0;transform:translateY(12px) scale(0.98)}to{opacity:1;transform:none}}
        .qs-topbar{height:4px}
        .qs-topbar.primary{background:linear-gradient(90deg,var(--blue-600),var(--blue-400))}
        .qs-topbar.warning{background:linear-gradient(90deg,#EF9F27,#f5c842)}
        .qs-topbar.confirmed{background:linear-gradient(90deg,#3B6D11,#97C459)}
        .qs-result-header{padding:18px 20px 14px;background:var(--gray-50);border-bottom:1px solid var(--blue-50);display:flex;align-items:center;gap:14px}
        .qs-result-icon{font-size:2rem}
        .qs-result-title{font-family:'Plus Jakarta Sans',sans-serif;font-size:15px;font-weight:800;color:var(--gray-900);margin-bottom:2px}
        .qs-result-sub{font-size:13px;color:var(--gray-500)}
        .qs-result-body{padding:18px 20px;background:#fff}
        .qs-row{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--blue-50);font-size:14px}
        .qs-row:last-child{border-bottom:none}
        .qs-row-label{color:var(--gray-500)}
        .qs-row-value{font-weight:600;color:var(--gray-900);text-align:right;max-width:60%}
        .qs-badge{display:inline-flex;align-items:center;padding:3px 10px;border-radius:100px;font-size:12px;font-weight:600;border:1px solid transparent}
        .qs-actions{padding:16px 20px;background:var(--gray-50);border-top:1px solid var(--blue-50);display:flex;gap:10px}
        .qs-confirm-btn{flex:1;padding:13px;border-radius:12px;border:none;background:var(--blue-600);color:#fff;font-family:'DM Sans',sans-serif;font-size:14px;font-weight:600;cursor:pointer;transition:background 0.15s;display:flex;align-items:center;justify-content:center;gap:8px}
        .qs-confirm-btn:hover:not(:disabled){background:var(--blue-800)}
        .qs-confirm-btn:disabled{opacity:0.5;cursor:not-allowed}
        .qs-reset-btn{padding:13px 18px;border-radius:12px;border:1px solid var(--blue-100);background:#fff;color:var(--gray-600);font-family:'DM Sans',sans-serif;font-size:14px;cursor:pointer;transition:all 0.15s}
        .qs-reset-btn:hover{background:var(--gray-100)}

        @media(max-width:600px){.qs-btn-row{flex-direction:column}}
      `}</style>

      <div className="qs-root">
        <div className="qs-title">📷 QR Code Scanner</div>
        <div className="qs-sub">Scan patient QR codes to verify bookings and mark attendance</div>

        {/* ── Camera viewport ── */}
        <div className="qs-cam-wrap">
          <video
            ref={videoRef}
            className="qs-video"
            playsInline muted autoPlay
            style={{ display: scanning ? 'block' : 'none' }}
          />
          {/* Hidden canvas used for frame capture — never shown */}
          <canvas ref={canvasRef} className="qs-canvas" />

          {scanning && (
            <div className="qs-overlay">
              <div className="qs-frame">
                <div className="qs-scan-line" />
                <div className="qs-corner tl" />
                <div className="qs-corner tr" />
                <div className="qs-corner bl" />
                <div className="qs-corner br" />
              </div>
            </div>
          )}
          {scanning  && <div className="qs-cam-label">Hold QR code steady — scanning full frame</div>}
          {!scanning && (
            <div className="qs-placeholder">
              <div className="qs-placeholder-icon">📷</div>
              <div className="qs-placeholder-text">{cameraError || 'Tap "Start Scanner" to activate camera'}</div>
            </div>
          )}
        </div>

        {/* ── Live debug bar (only while camera is active) ── */}
        {scanning && (
          <div className={`qs-debug ${debugMsg.startsWith('✅') ? 'detected' : ''}`}>
            {debugMsg || 'Initializing scanner...'}
          </div>
        )}

        {/* ── Camera controls ── */}
        <div className="qs-btn-row">
          {!scanning
            ? <button className="qs-start-btn" onClick={startCamera}>📷 Start Scanner</button>
            : <button className="qs-stop-btn"  onClick={stopCamera}>⏹ Stop Camera</button>
          }
        </div>

        <div className="qs-divider">or enter token manually</div>

        {/* ── Manual token entry ── */}
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

        {/* ── States ── */}
        {scanState === 'fetching' && (
          <div className="qs-fetching">
            <div className="qs-spinner" />
            <div className="qs-fetching-text">Verifying token with server...</div>
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

        {/* ── Result card ── */}
        {['found', 'already_done', 'confirmed'].includes(scanState) && booking && (() => {
          const st          = STATUS_STYLE[booking.status] || STATUS_STYLE.waiting;
          const isDone      = scanState === 'already_done';
          const isConfirmed = scanState === 'confirmed';
          const topColor    = isConfirmed ? 'confirmed' : isDone ? 'warning' : 'primary';

          return (
            <div className="qs-result">
              <div className={`qs-topbar ${topColor}`} />

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
                      : isDone   ? `Status: ${st.label}`
                      :            'Confirm below to mark patient as attended'}
                  </div>
                </div>
              </div>

              <div className="qs-result-body">
                {[
                  { label: 'Patient',        value: `👤 ${booking.patient_name || '—'}`       },
                  { label: 'Mobile',         value: booking.patient_mobile || '—', mono: true  },
                  { label: 'Doctor',         value: `Dr. ${booking.doctor_name || '—'}`        },
                  { label: 'Specialization', value: booking.specialization   || '—'            },
                  { label: 'Date',           value: `📅 ${booking.date || '—'}`                },
                  { label: 'Slot',           value: `🕐 ${booking.slot || '—'}`                },
                  { label: 'Token',          value: booking.token || '—', mono: true, blue: true },
                  { label: 'Amount Paid',    value: `₹${booking.amount ?? 0}`, blue: true, bold: true },
                ].map(({ label, value, mono, blue, bold }) => (
                  <div className="qs-row" key={label}>
                    <span className="qs-row-label">{label}</span>
                    <span
                      className="qs-row-value"
                      style={{
                        fontFamily: mono ? 'DM Mono, monospace' : undefined,
                        fontSize:   mono ? 13 : undefined,
                        color:      blue ? 'var(--blue-700)' : undefined,
                        fontWeight: bold ? 700 : undefined,
                      }}
                    >
                      {value}
                    </span>
                  </div>
                ))}
                <div className="qs-row">
                  <span className="qs-row-label">Status</span>
                  <span
                    className="qs-badge"
                    style={{ background: st.bg, color: st.text, borderColor: st.border }}
                  >
                    {st.label}
                  </span>
                </div>
              </div>

              <div className="qs-actions">
                {!isDone && !isConfirmed && (
                  <button
                    className="qs-confirm-btn"
                    onClick={markAttended}
                    disabled={confirming}
                  >
                    {confirming
                      ? <><div className="qs-spinner" style={{ borderTopColor: '#fff', width: 16, height: 16 }} /> Marking...</>
                      : '✅ Mark as In Consultation'}
                  </button>
                )}
                {isConfirmed && (
                  <div style={{
                    flex: 1, padding: 13, borderRadius: 12,
                    background: 'var(--color-success-bg)',
                    border: '1px solid var(--color-success-border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    fontSize: 14, fontWeight: 600, color: 'var(--color-success-text)',
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