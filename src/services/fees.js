// src/services/fees.js
// Client-side mirror of backend/payments/fees.py — used ONLY to preview the
// itemised receipt before checkout. The SERVER is always the source of truth
// for the amount actually charged (it recomputes and validates on verify).
// Keep these constants in sync with payments/fees.py.

export const PLATFORM_FEE = 20.0;
export const GATEWAY_FEE  = 1.5;
export const GST_RATE     = 0.18;

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// doctor_fee is a GST-exempt healthcare service; GST applies only to the
// platform + gateway fees. Mirrors compute_fee_breakdown().
export function computeFeeBreakdown(doctorFee) {
  const doctor_fee   = round2(doctorFee || 0);
  const platform_fee = round2(PLATFORM_FEE);
  const gateway_fee  = round2(GATEWAY_FEE);
  const taxable      = round2(platform_fee + gateway_fee);
  const gst_amount   = round2(taxable * GST_RATE);
  const final_amount = round2(doctor_fee + platform_fee + gateway_fee + gst_amount);
  return { doctor_fee, platform_fee, gateway_fee, taxable_value: taxable, gst_amount, final_amount };
}
