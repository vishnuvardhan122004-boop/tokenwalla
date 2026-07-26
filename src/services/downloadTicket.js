// Generates a downloadable PNG "ticket" for a booked appointment — token,
// details and a scannable QR — with no extra dependencies. The QR is rendered
// with qrcode.react's QRCodeCanvas into an offscreen React root (same value/
// format BookingQR uses, so it scans identically), then the whole ticket is
// drawn onto a canvas and saved as PNG. Uses react-dom/client (already in the
// bundle) rather than react-dom/server, to avoid a large bundle-size hit.
// Works the same on the confirmation screen and the My Bookings list.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { QRCodeCanvas } from 'qrcode.react';

// Render a QR to an offscreen canvas and return it as a loaded <img>, so it is
// self-contained and safe to draw after we tear down the React root.
function renderQRImage(qrValue) {
  return new Promise((resolve, reject) => {
    const holder = document.createElement('div');
    holder.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:0;height:0;overflow:hidden;';
    document.body.appendChild(holder);
    const root = createRoot(holder);
    root.render(
      React.createElement(QRCodeCanvas, {
        value: qrValue, size: 180, bgColor: '#ffffff', fgColor: '#111827', level: 'M',
      }),
    );

    const cleanup = () => {
      try { root.unmount(); } catch { /* ignore */ }
      holder.remove();
    };

    const start = Date.now();
    const tick = () => {
      const c = holder.querySelector('canvas');
      if (c && c.width > 0) {
        const dataUrl = c.toDataURL('image/png');   // capture before unmount
        cleanup();
        const img = new Image();
        img.onload  = () => resolve(img);
        img.onerror = reject;
        img.src = dataUrl;
      } else if (Date.now() - start < 2000) {
        requestAnimationFrame(tick);
      } else {
        cleanup();
        reject(new Error('QR render timed out.'));
      }
    };
    requestAnimationFrame(tick);
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Trim a string with an ellipsis so it never overflows `maxWidth` on the canvas.
function truncate(ctx, text, maxWidth) {
  let t = String(text == null || text === '' ? '—' : text);
  if (ctx.measureText(t).width <= maxWidth) return t;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
  return t + '…';
}

/**
 * Build and download a booking ticket as a PNG.
 * @param {object} booking
 * @param {string} booking.token       required — token code (also the filename)
 * @param {string} [booking.doctorName]
 * @param {string} [booking.hospital]
 * @param {string} [booking.patientName]
 * @param {string} [booking.date]
 * @param {string} [booking.slot]
 * @param {number|string} [booking.amount]     shown as "Amount paid" when present
 * @param {string} [booking.paymentId]         shown when present
 */
export async function downloadBookingTicket(booking) {
  const {
    token, doctorName, hospital, patientName,
    date, slot, amount, paymentId,
  } = booking || {};

  if (!token) return;

  // Match BookingQR's payload so hospital scanners read it the same way.
  const qrValue = JSON.stringify({
    token_code:  token,
    doctor_name: doctorName,
    hospital,
    date,
    slot,
  });
  const qrImg = await renderQRImage(qrValue);

  // Best-effort: wait for the page's custom fonts so canvas text matches the UI.
  try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch { /* ignore */ }

  const S = 2;                 // supersample for a crisp export
  const W = 640;
  const hasAmount = amount !== undefined && amount !== null && amount !== '';
  const hasPay    = !!paymentId;
  const extraRows = (hasAmount ? 1 : 0) + (hasPay ? 1 : 0);
  const H = 720 + extraRows * 54;

  const canvas = document.createElement('canvas');
  canvas.width  = W * S;
  canvas.height = H * S;
  const ctx = canvas.getContext('2d');
  ctx.scale(S, S);

  // Background
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#EAF3FF');
  bg.addColorStop(1, '#F8FBFF');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Card
  const cx = 28, cyT = 28, cw = W - 56, ch = H - 56;
  ctx.save();
  ctx.shadowColor = 'rgba(24,95,165,0.16)';
  ctx.shadowBlur = 28; ctx.shadowOffsetY = 10;
  roundRect(ctx, cx, cyT, cw, ch, 24);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = '#DBEAFE'; ctx.lineWidth = 1;
  roundRect(ctx, cx, cyT, cw, ch, 24); ctx.stroke();

  // Top accent bar (clipped to the card's rounded corners)
  ctx.save();
  roundRect(ctx, cx, cyT, cw, ch, 24); ctx.clip();
  const bar = ctx.createLinearGradient(cx, 0, cx + cw, 0);
  bar.addColorStop(0, '#185FA5'); bar.addColorStop(1, '#85B7EB');
  ctx.fillStyle = bar; ctx.fillRect(cx, cyT, cw, 5);
  ctx.restore();

  const contentX = cx + 28;
  const contentW = cw - 56;
  const centerX  = W / 2;

  // Header — brand + confirmed dot
  let y = cyT + 46;
  ctx.textAlign = 'left';
  ctx.font = '800 20px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = '#185FA5'; ctx.fillText('Token', contentX, y);
  const brandW = ctx.measureText('Token').width;
  ctx.fillStyle = '#111827'; ctx.fillText('walla', contentX + brandW, y);
  ctx.textAlign = 'right';
  ctx.font = '600 12px "DM Sans", sans-serif';
  ctx.fillStyle = '#15803D';
  ctx.fillText('● Confirmed', contentX + contentW, y - 3);

  // Token
  ctx.textAlign = 'center';
  y = cyT + 108;
  ctx.font = '600 11px "DM Sans", sans-serif';
  ctx.fillStyle = '#9CA3AF';
  ctx.fillText('YOUR TOKEN NUMBER', centerX, y);
  y += 44;
  ctx.font = '500 40px "DM Mono", monospace';
  ctx.fillStyle = '#185FA5';
  ctx.fillText(truncate(ctx, token, contentW), centerX, y);
  y += 22;
  ctx.font = '400 12px "DM Sans", sans-serif';
  ctx.fillStyle = '#9CA3AF';
  ctx.fillText('Present this at reception', centerX, y);

  // Dashed separator
  y += 26;
  ctx.strokeStyle = '#BFDBFE'; ctx.lineWidth = 2;
  ctx.setLineDash([6, 6]);
  ctx.beginPath(); ctx.moveTo(contentX, y); ctx.lineTo(contentX + contentW, y); ctx.stroke();
  ctx.setLineDash([]);

  // Details grid
  const colGap = 24;
  const colW   = (contentW - colGap) / 2;
  const col2X  = contentX + colW + colGap;
  const label = (text, x, yy) => {
    ctx.textAlign = 'left';
    ctx.font = '600 10px "DM Sans", sans-serif';
    ctx.fillStyle = '#9CA3AF';
    ctx.fillText(String(text).toUpperCase(), x, yy);
  };
  const value = (text, x, yy, w) => {
    ctx.textAlign = 'left';
    ctx.font = '500 14px "DM Sans", sans-serif';
    ctx.fillStyle = '#1F2937';
    ctx.fillText(truncate(ctx, text, w), x, yy);
  };

  y += 34;
  label('Doctor', contentX, y);  label('Patient', col2X, y);
  value(doctorName, contentX, y + 20, colW);  value(patientName, col2X, y + 20, colW);

  y += 54;
  label('Date', contentX, y);  label('Slot', col2X, y);
  value(date, contentX, y + 20, colW);  value(slot, col2X, y + 20, colW);

  y += 54;
  label('Hospital', contentX, y);
  value(hospital, contentX, y + 20, contentW);

  if (hasAmount) {
    y += 54;
    label('Amount paid to TokenWalla', contentX, y);
    value('₹' + amount, contentX, y + 20, contentW);
  }
  if (hasPay) {
    y += 54;
    label('Payment ID', contentX, y);
    ctx.textAlign = 'left';
    ctx.font = '400 11px "DM Mono", monospace';
    ctx.fillStyle = '#9CA3AF';
    ctx.fillText(truncate(ctx, paymentId, contentW), contentX, y + 20);
  }

  // QR
  y += 44;
  const qrSize = 168;
  const qrBox  = qrSize + 24;
  const qrX    = centerX - qrBox / 2;
  roundRect(ctx, qrX, y, qrBox, qrBox, 14);
  ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.strokeStyle = '#DBEAFE'; ctx.lineWidth = 1; ctx.stroke();
  ctx.drawImage(qrImg, qrX + 12, y + 12, qrSize, qrSize);
  y += qrBox + 26;

  // Footer
  ctx.textAlign = 'center';
  ctx.font = '400 11px "DM Sans", sans-serif';
  ctx.fillStyle = '#9CA3AF';
  ctx.fillText('Show this token & QR at the hospital reception', centerX, y);
  ctx.fillText('Support: support@tokenwalla.com', centerX, y + 16);

  // Save
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
  if (!blob) throw new Error('Could not render ticket image.');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Tokenwalla-${String(token).replace(/[^\w-]/g, '')}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
