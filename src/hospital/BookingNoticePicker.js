/**
 * How much notice a doctor or a service needs before a slot starts, set as a
 * timer rather than typed as a number.
 *
 * Three states, not two, and keeping them apart is why this is not a number
 * input:
 *
 *   ''   → use the platform default (the column stores NULL)
 *   '0'  → Off: bookable right up to the moment the slot starts
 *   'n'  → n hours of notice
 *
 * "Default" and "Off" are both "nothing typed" in a number box but mean
 * opposite things to the booking gate, so each gets its own chip and the
 * readout always spells the consequence out in a sentence.
 */
import React from 'react';

export const MAX_NOTICE_HOURS = 168;      // mirrors the serializer's bound
export const DEFAULT_NOTICE_HOURS = 2;    // mirrors BOOKING_CUTOFF_HOURS

const PRESETS = [0, 1, 2, 4, 12, 24];
const clamp = (h) => Math.min(MAX_NOTICE_HOURS, Math.max(0, h));

export default function BookingNoticePicker({
  value, onChange, label = 'Booking notice', noun = 'Patients',
}) {
  const isDefault = String(value ?? '').trim() === '';
  const hours     = isDefault ? DEFAULT_NOTICE_HOURS : clamp(Number(value) || 0);

  // Stepping from "default" starts at the default, so the first click moves in
  // the direction it looks like it should.
  const step = (delta) => onChange(String(clamp(hours + delta)));

  const caption = isDefault
    ? `Using the standard ${DEFAULT_NOTICE_HOURS}-hour notice.`
    : hours === 0
      ? `${noun} can book right up to the moment the slot starts.`
      : `${noun} must book at least ${hours} hour${hours === 1 ? '' : 's'} before the slot.`;

  return (
    <div className="bnp">
      <style>{`
        .bnp-label { font-size: 13px; font-weight: 600; color: var(--gray-700); margin-bottom: 6px; }
        .bnp-row { display: flex; align-items: center; gap: 10px; }
        .bnp-step { width: 42px; height: 42px; flex: none; border-radius: 11px; border: 1px solid var(--blue-100); background: var(--blue-50); color: var(--blue-700); font-size: 19px; font-weight: 700; line-height: 1; cursor: pointer; }
        .bnp-step:disabled { border-color: var(--gray-200); background: var(--gray-50); color: var(--gray-400); cursor: default; }
        .bnp-readout { flex: 1; text-align: center; border: 1px solid var(--blue-100); border-radius: 11px; background: #fff; padding: 4px 0 5px; }
        .bnp-time { font-size: 25px; font-weight: 800; color: var(--blue-700); letter-spacing: 1px; font-variant-numeric: tabular-nums; }
        .bnp-time.is-default { color: var(--gray-400); }
        .bnp-colon { color: var(--blue-200); }
        .bnp-unit { font-size: 9.5px; letter-spacing: 1px; text-transform: uppercase; color: var(--gray-400); }
        .bnp-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 9px; }
        .bnp-chip { padding: 5px 11px; border-radius: 100px; border: 1px solid var(--blue-100); background: #fff; color: var(--blue-700); font-size: 12px; font-weight: 700; cursor: pointer; }
        .bnp-chip.on { background: var(--blue-600); border-color: var(--blue-600); color: #fff; }
        .bnp-caption { font-size: 11.5px; color: var(--gray-500); margin-top: 8px; }
      `}</style>

      <div className="bnp-label">{label}</div>

      <div className="bnp-row">
        <button type="button" className="bnp-step" onClick={() => step(-1)}
          disabled={hours === 0} aria-label="Decrease booking notice by one hour">−</button>

        <div className="bnp-readout">
          <div className={`bnp-time${isDefault ? ' is-default' : ''}`}>
            {String(hours).padStart(2, '0')}<span className="bnp-colon">:</span>00
          </div>
          <div className="bnp-unit">{isDefault ? 'default' : hours === 0 ? 'off' : 'hh:mm'}</div>
        </div>

        <button type="button" className="bnp-step" onClick={() => step(1)}
          disabled={hours >= MAX_NOTICE_HOURS} aria-label="Increase booking notice by one hour">+</button>
      </div>

      <div className="bnp-chips">
        <button type="button" className={`bnp-chip${isDefault ? ' on' : ''}`}
          onClick={() => onChange('')}>Default</button>
        {PRESETS.map(p => (
          <button key={p} type="button"
            className={`bnp-chip${!isDefault && hours === p ? ' on' : ''}`}
            onClick={() => onChange(String(p))}>
            {p === 0 ? 'Off' : `${p}h`}
          </button>
        ))}
      </div>

      <div className="bnp-caption">{caption}</div>
    </div>
  );
}
