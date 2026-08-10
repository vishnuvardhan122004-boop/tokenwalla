import { buildCards } from './DailyOps';

const summary = (over = {}) => ({
  date: '2026-08-09',
  bookings: { total: 7, completed: 4, confirmed: 2 },
  collected: { gross: '1577.59', tokenwalla_revenue: '150.50', gst: '27.09' },
  payouts: { total_owed: '1400.00', doctors_owed: 3 },
  attention: [],
  ...over,
});

const byKey = (s, key) => buildCards(s).find((c) => c.key === key);

test('gross and our revenue are separate cards, never conflated', () => {
  const cards = buildCards(summary());
  expect(byKey(summary(), 'collected').value).toBe('₹1,577.59');
  expect(byKey(summary(), 'revenue').value).toBe('₹150.50');
  expect(cards.map((c) => c.key)).toEqual(['bookings', 'collected', 'revenue', 'owed']);
});

test('the revenue card says what it excludes, so it cannot be misread as earnings', () => {
  expect(byKey(summary(), 'revenue').sub).toMatch(/GST & doctor fees excluded/);
});

test('money is formatted as Indian rupees to two places', () => {
  const s = summary({ payouts: { total_owed: '125000', doctors_owed: 9 } });
  expect(byKey(s, 'owed').value).toBe('₹1,25,000.00');
});

test('owed goes amber only when doctors are actually waiting', () => {
  expect(byKey(summary(), 'owed').accent).toBe('#854F0B');
  const clear = summary({ payouts: { total_owed: '0.00', doctors_owed: 0 } });
  expect(byKey(clear, 'owed').accent).toBe('#64748B');
});

test('one waiting doctor is not pluralised', () => {
  const s = summary({ payouts: { total_owed: '200.00', doctors_owed: 1 } });
  expect(byKey(s, 'owed').sub).toBe('1 doctor waiting');
  expect(byKey(summary(), 'owed').sub).toBe('3 doctors waiting');
});

test('a missing or half-loaded payload renders zeros instead of crashing', () => {
  expect(() => buildCards(undefined)).not.toThrow();
  expect(byKey({}, 'collected').value).toBe('₹0.00');
  expect(byKey({}, 'bookings').value).toBe('0');
  expect(byKey({ payouts: {} }, 'owed').sub).toBe('0 doctors waiting');
});
