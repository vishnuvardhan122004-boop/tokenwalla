/**
 * QRScanner.js — Fixed with improved jsQR scanning
 * Key fixes:
 * 1. Scans full video frame (not just center box)
 * 2. Uses attemptBoth for inverted QR codes (screen display)
 * 3. Smaller canvas = faster jsQR detection
 * 4. Debug bar shows live scan activity
 */

import { useEffect, useRef, useState } from 'react';
import API from '../services/api';

let jsQRLoaded = false;
function loadJsQR(cb) {
  if (window.jsQR) { cb(); return; }
  if (jsQRLoaded) { setTimeout(() => loadJsQR(cb), 100); return; }
  jsQRLoaded = true;
  const s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js';
  s.onload = cb;
  s.onerror = () => { jsQRLoaded = false; };
  document.head.appendChild(s);
}

function extractToken(raw) {
  if (!raw) return '';
  const trimmed = raw.trim();
  try {
    const parsed = JSON.parse(trimmed);
    return (parsed.token_code || parsed.token || '').trim().toUpperCase();
  } catch {
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
  const scanCooldown   = useRef(false);
  const frameCount     = useRef(0);

  const [scanning,    setScanning]    = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [manualToken, setManualToken] = useState('');
  const [debugMsg,    setDebugMsg]    = useState('');

  const [scanResult,  setScanResult]  = useState(null);
  const [scanState,   setScanState]   = useState('idle');
  const [errorMsg,    setErrorMsg]    = useState('');
  const [confirming,  setConfirming]  = useState(false);

  const startCamera = async () => {
    setCameraError('');
    setScanResult(null);
    setScanState('idle');
    setDebugMsg('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
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
      if (err.name === 'NotAllowedError')  setCameraError('Camera access denied. Allow camera in browser settings.');
      else if (err.name === 'NotFoundError') setCameraError('No camera found. Use manual token entry.');
      else setCameraError('Camera error: ' + err.message);
    }
  };

  const stopCamera = () => {
    setScanning(false);
    setDebugMsg('');
    cancelAnimationFrame(animFrameRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  useEffect(() => () => stopCamera(), []);

  const startScanLoop = () => {
    frameCount.current = 0;

    const scan = () => {
      const video  = videoRef.current;
      const canvas = canvasRef.current;

      if (!video || !canvas || video.readyState < 2 || video.videoWidth === 0) {
        animFrameRef.current = requestAnimationFrame(scan);
        return;
      }

      // Downscale to 640px wide for faster processing
      const scale  = Math.min(1, 640 / video.videoWidth);
      const w      = Math.floor(video.videoWidth  * scale);
      const h      = Math.floor(video.videoHeight * scale);
      canvas.width  = w;
      canvas.height = h;

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(video, 0, 0, w, h);

      const imageData = ctx.getImageData(0, 0, w, h);

      // KEY: attemptBoth tries normal + inverted — essential for screen QR codes
      const code = window.jsQR?.(imageData.data, w, h, { inversionAttempts: 'attemptBoth' });

      if (code?.data && !scanCooldown.current) {
        const token = extractToken(code.data);
        setDebugMsg(`✅ QR detected! Extracting token...`);

        if (token && token !== lastScannedRef.current) {
          lastScannedRef.current = token;
          scanCooldown.current   = true;
          handleTokenFound(token);
          setTimeout(() => {
            scanCooldown.current   = false;
            lastScannedRef.current = '';
          }, 4000);
          return;
        } else if (!token) {
          setDebugMsg(`⚠️ QR read but no token_code field found. Raw: ${code.data.slice(0, 40)}`);
        }
      } else if (!scanCooldown.current) {
        frameCount.current += 1;
        if (frameCount.current % 90 === 0) {
          setDebugMsg(`Scanning... (${frameCount.current} frames • ${w}×${h})`);
        }
      }

      animFrameRef.current = requestAnimationFrame(scan);
    };

    animFrameRef.current = requestAnimationFrame(scan);
  };

  const handleTokenFound = async (rawToken) => {
    const token = extractToken(rawToken);
    if (!token) {
      setErrorMsg('Invalid QR — no token found.');
      setScanState('error');
      return;
    }

    setScanResult(null);
    setErrorMsg('');
    setScanState('fetching');

    try {
      const { data } = await API.post('/bookings/scan/', { token_code: token });
      setScanResult(data);
      setScanState(data.already_done || data.attended ? 'already_done' : 'found');
    } catch (err) {
      const status = err?.response?.status;
      if (status === 409) {
        const d = err?.response?.data;
        setScanResult(d?.booking ? d : { booking: d });
        setScanState('already_done');
      } else if (status === 404) {
        setErrorMsg(`Token "${token}" not found.`);
        setScanState('error');
      } else {
        setErrorMsg(
          err?.response?.data?.message ||
          err?.response?.data?.detail  ||
          err?.response?.data?.error   ||
          'Verification failed. Please try again.'
        );
        setScanState('error');
      }
    }
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    const t = manualToken.trim();
    if (t) handleTokenFound(t);
  };

  const markAttended = async () => {
    const id = scanResult?.booking?.id || scanResult?.id;
    if (!id) return;
    setConfirming(true);
    try {
      await API.patch(`/bookings/call/${id}/`);
      setScanState('confirmed');
      setScanResult(prev => ({ ...prev, booking: { ...(prev.booking || prev), status: 'in_progress' } }));
    } catch (err) {
      if (err?.response?.status === 409) setScanState('already_done');
      else { setErrorMsg(err?.response?.data?.message || 'Failed.'); setScanState('error'); }
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
    frameCount.current     = 0;
    if (scanning) {
      setDebugMsg('Camera ready — hold QR code in front of camera');
      startScanLoop();
    }
  };

  const booking = scanResult?.booking || scanResult;

  return (
    <>
      <style>{`
        .qs-root{font-family:'DM Sans',sans-serif;max-width:680px;margin:0 auto}
        .qs-title{font-family:'Plus Jakarta Sans',sans-serif;font-size:1.4rem;font-weight:800;color:var(--gray-900);margin-bottom:4px}
        .qs-sub{font-size:14px;color:var(--gray-400);margin-bottom:24px}
        .qs-cam-wrap{position:relative;border-radius:18px;overflow:hidden;background:#000;aspect-ratio:16/9;margin-bottom:8px;border:2px solid var(--blue-200);box-shadow:0 8px 32px rgba(24,95,165,0.15)}
        .qs-video{width:100%;height:100%;object-fit:cover;display:block}
        .qs-canvas{display:none}
        .qs-scan-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none}
        .qs-scan-frame{width:220px;height:220px;position:relative}
        .qs-scan-line{position:absolute;left:0;right:0;height:3px;background:linear-gradient(90deg,transparent,#378ADD,transparent);animation:qsScan 1.8s ease-in-out infinite;border-radius:2px}
        @keyframes qsScan{0%{top:0;opacity:0}10%{opacity:1}90%{opacity:1}100%{top:calc(100% - 3px);opacity:0}}
        .qs-corner{position:absolute;width:24px;height:24px;border-color:#378ADD;border-style:solid;border-width:0}
        .qs-corner.tl{top:0;left:0;border-top-width:4px;border-left-width:4px;border-top-left-radius:6px}
        .qs-corner.tr{top:0;right:0;border-top-width:4px;border-right-width:4px;border-top-right-radius:6px}
        .qs-corner.bl{bottom:0;left:0;border-bottom-width:4px;border-left-width:4px;border-bottom-left-radius:6px}
        .qs-corner.br{bottom:0;right:0;border-bottom-width:4px;border-right-width:4px;border-bottom-right-radius:6px}
        .qs-cam-label{position:absolute;bottom:14px;left:0;right:0;text-align:center;color:rgba(255,255,255,0.85);font-size:13px;font-weight:500}
        .qs-placeholder{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:12px;padding:32px}
        .qs-placeholder-icon{font-size:3rem}
        .qs-placeholder-text{color:rgba(255,255,255,0.6);font-size:14px;text-align:center;line-height:1.6}
        .qs-debug{font-size:12px;color:var(--blue-600);background:var(--blue-50);border:1px solid var(--blue-100);border-radius:8px;padding:8px 12px;margin-bottom:12px;font-family:'DM Mono',monospace;min-height:34px;word-break:break-all}
        .qs-btn-row{display:flex;gap:10px;margin-bottom:20px}
        .qs-start-btn{flex:1;padding:13px;border-radius:12px;border:none;background:var(--blue-600);color:#fff;font-family:'DM Sans',sans-serif;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px}
        .qs-start-btn:hover{background:var(--blue-800)}
        .qs-stop-btn{flex:1;padding:13px;border-radius:12px;border:1px solid var(--color-error-border);background:var(--color-error-bg);color:var(--color-error-text);font-family:'DM Sans',sans-serif;font-size:14px;font-weight:600;cursor:pointer}
        .qs-divider{display:flex;align-items:center;gap:14px;margin:0 0 20px;font-size:12px;color:var(--gray-400)}
        .qs-divider::before,.qs-divider::after{content:'';flex:1;height:1px;background:var(--blue-100)}
        .qs-manual-label{font-size:12px;font-weight:600;color:var(--gray-600);margin-bottom:8px;display:block}
        .qs-manual-row{display:flex;gap:8px;margin-bottom:20px}
        .qs-manual-input{flex:1;background:#fff;border:1px solid var(--blue-100);border-radius:11px;padding:11px 14px;font-family:'DM Mono',monospace;font-size:14px;color:var(--gray-900);outline:none;text-transform:uppercase;letter-spacing:0.5px}
        .qs-manual-input::placeholder{font-family:'DM Sans',sans-serif;letter-spacing:0;text-transform:none;color:var(--gray-400);font-size:13px}
        .qs-manual-input:focus{border-color:var(--blue-400);box-shadow:0 0 0 3px rgba(55,138,221,0.12)}
        .qs-manual-btn{padding:11px 18px;border-radius:11px;border:none;background:var(--blue-600);color:#fff;font-family:'DM Sans',sans-serif;font-size:14px;font-weight:600;cursor:pointer}
        .qs-manual-btn:disabled{opacity:0.5;cursor:not-allowed}
        .qs-fetching{display:flex;align-items:center;gap:12px;padding:20px;background:#fff;border-radius:18px;border:1px solid var(--blue-100)}
        .qs-spinner{width:22px;height:22px;border:2px solid var(--blue-100);border-top-color:var(--blue-600);border-radius:50%;animation:qsSpin 0.7s linear infinite;flex-shrink:0}
        @keyframes qsSpin{to{transform:rotate(360deg)}}
        .qs-fetching-text{font-size:14px;font-weight:500;color:var(--blue-700)}
        .qs-error-box{background:var(--color-error-bg);border:1px solid var(--color-error-border);border-radius:16px;padding:16px 20px;display:flex;align-items:flex-start;gap:12px}
        .qs-error-icon{font-size:22px;flex-shrink:0}
        .qs-error-text{font-size:14px;color:var(--color-error-text);line-height:1.5}
        .qs-error-retry{margin-top:8px;font-size:13px;font-weight:600;color:var(--color-error-text);cursor:pointer;text-decoration:underline}
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
        .qs-row-value{font-weight:600;color:var(--gray-900);text-align:right}
        .qs-badge{display:inline-flex;align-items:center;padding:3px 10px;border-radius:100px;font-size:12px;font-weight:600;border:1px solid transparent}
        .qs-actions{padding:16px 20px;background:var(--gray-50);border-top:1px solid var(--blue-50);display:flex;gap:10px}
        .qs-confirm-btn{flex:1;padding:13px;border-radius:12px;border:none;background:var(--blue-600);color:#fff;font-family:'DM Sans',sans-serif;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px}
        .qs-confirm-btn:disabled{opacity:0.5;cursor:not-allowed}
        .qs-reset-btn{padding:13px 18px;border-radius:12px;border:1px solid var(--blue-100);background:#fff;color:var(--gray-600);font-family:'DM Sans',sans-serif;font-size:14px;cursor:pointer}
        @media(max-width:600px){.qs-btn-row{flex-direction:column}}
      `}</style>

      <div className="qs-root">
        <div className="qs-title">📷 QR Code Scanner</div>
        <div className="qs-sub">Scan patient QR codes to verify bookings and mark attendance</div>

        {/* Camera */}
        <div className="qs-cam-wrap">
          <video ref={videoRef} className="qs-video" playsInline muted autoPlay
            style={{ display: scanning ? 'block' : 'none' }} />
          <canvas ref={canvasRef} className="qs-canvas" />

          {scanning && (
            <div className="qs-scan-overlay">
              <div className="qs-scan-frame">
                <div className="qs-scan-line" />
                <div className="qs-corner tl" /><div className="qs-corner tr" />
                <div className="qs-corner bl" /><div className="qs-corner br" />
              </div>
            </div>
          )}
          {scanning  && <div className="qs-cam-label">Hold QR steady — scanning entire frame</div>}
          {!scanning && (
            <div className="qs-placeholder">
              <div className="qs-placeholder-icon">📷</div>
              <div className="qs-placeholder-text">{cameraError || 'Tap "Start Scanner" to activate camera'}</div>
            </div>
          )}
        </div>

        {/* Live debug bar */}
        {scanning && <div className="qs-debug">{debugMsg || 'Initializing...'}</div>}

        <div className="qs-btn-row">
          {!scanning
            ? <button className="qs-start-btn" onClick={startCamera}>📷 Start Scanner</button>
            : <button className="qs-stop-btn"  onClick={stopCamera}>⏹ Stop Camera</button>
          }
        </div>

        <div className="qs-divider">or enter token manually</div>

        <label className="qs-manual-label">Enter Booking Token</label>
        <form className="qs-manual-row" onSubmit={handleManualSubmit}>
          <input className="qs-manual-input" value={manualToken}
            onChange={e => setManualToken(e.target.value)}
            placeholder="e.g. TW-143052-A3F9B1" />
          <button type="submit" className="qs-manual-btn"
            disabled={!manualToken.trim() || scanState === 'fetching'}>
            Verify
          </button>
        </form>

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

        {['found','already_done','confirmed'].includes(scanState) && booking && (() => {
          const st          = STATUS_STYLE[booking.status] || STATUS_STYLE.waiting;
          const isDone      = scanState === 'already_done';
          const isConfirmed = scanState === 'confirmed';
          const topColor    = isConfirmed ? 'confirmed' : isDone ? 'warning' : 'primary';

          return (
            <div className="qs-result">
              <div className={`qs-topbar ${topColor}`} />
              <div className="qs-result-header">
                <div className="qs-result-icon">{isConfirmed ? '✅' : isDone ? '⚠️' : '🎫'}</div>
                <div>
                  <div className="qs-result-title">
                    {isConfirmed ? 'Marked as In Consultation!' : isDone ? 'Already Attended' : 'Booking Verified ✓'}
                  </div>
                  <div className="qs-result-sub">
                    {isConfirmed ? `${booking.patient_name} has been called in`
                      : isDone   ? `Status: ${st.label}`
                      :            'Confirm to mark patient as attended'}
                  </div>
                </div>
              </div>

              <div className="qs-result-body">
                {[
                  { label: 'Patient',        value: `👤 ${booking.patient_name}`                        },
                  { label: 'Mobile',         value: booking.patient_mobile,  mono: true                 },
                  { label: 'Doctor',         value: `Dr. ${booking.doctor_name}`                        },
                  { label: 'Specialization', value: booking.specialization                              },
                  { label: 'Date',           value: `📅 ${booking.date}`                                },
                  { label: 'Slot',           value: `🕐 ${booking.slot}`                                },
                  { label: 'Token',          value: booking.token,           mono: true,  blue: true    },
                  { label: 'Amount Paid',    value: `₹${booking.amount}`,                blue: true, bold: true },
                ].map(({ label, value, mono, blue, bold }) => (
                  <div className="qs-row" key={label}>
                    <span className="qs-row-label">{label}</span>
                    <span className="qs-row-value" style={{
                      fontFamily: mono ? 'DM Mono,monospace' : undefined,
                      fontSize:   mono ? 13 : undefined,
                      color:      blue ? 'var(--blue-700)' : undefined,
                      fontWeight: bold ? 700 : undefined,
                    }}>{value}</span>
                  </div>
                ))}
                <div className="qs-row">
                  <span className="qs-row-label">Status</span>
                  <span className="qs-badge" style={{ background: st.bg, color: st.text, borderColor: st.border }}>
                    {st.label}
                  </span>
                </div>
              </div>

              <div className="qs-actions">
                {!isDone && !isConfirmed && (
                  <button className="qs-confirm-btn" onClick={markAttended} disabled={confirming}>
                    {confirming
                      ? <><div className="qs-spinner" style={{ borderTopColor:'#fff', width:16, height:16 }} /> Marking...</>
                      : '✅ Mark as In Consultation'}
                  </button>
                )}
                {isConfirmed && (
                  <div style={{ flex:1, padding:13, borderRadius:12, background:'var(--color-success-bg)', border:'1px solid var(--color-success-border)', display:'flex', alignItems:'center', justifyContent:'center', gap:8, fontSize:14, fontWeight:600, color:'var(--color-success-text)' }}>
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