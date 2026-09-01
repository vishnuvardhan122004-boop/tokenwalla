/**
 * The website's mirror of backend/payments/fees.py.
 *
 * It is a FALLBACK — checkout renders the server's own fee_breakdown — but it
 * has to agree with the backend when it does run, and `collection_mode` now
 * decides whether the Appointment Pass is offered at all. The app carries the
 * same mirror and the same test (utils/fees.test.ts); edit both or they drift.
 */
import { computeFeeBreakdown } from './fees';

test('SERVICE_ONLY (the default) charges only the service fee online', () => {
  const b = computeFeeBreakdown(200);
  expect(b.doctor_fee).toBe(0);
  expect(b.offline_doctor_fee).toBe(200);
  expect(b.final_amount).toBe(25.37);
});

test('FULL adds the consultation fee to the online total', () => {
  expect(computeFeeBreakdown(200, 'FULL').final_amount).toBe(225.37);
});

test('reports a canonical collection_mode — checkout gates the pass on it', () => {
  // Blank/unknown reports SERVICE_ONLY rather than echoing the input, so a
  // doctor nobody configured is never treated as collecting online.
  expect(computeFeeBreakdown(200, '').collection_mode).toBe('SERVICE_ONLY');
  expect(computeFeeBreakdown(200, 'WHATEVER').collection_mode).toBe('SERVICE_ONLY');
  expect(computeFeeBreakdown(200, 'FULL').collection_mode).toBe('FULL');
});
