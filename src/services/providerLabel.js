/**
 * How a provider's name is shown to a patient.
 *
 * A booking's provider is a doctor OR a scan, and both arrive in the same
 * `doctor_name` / `provider_name` field. Prefixing blindly produces
 * "Dr. Complete Blood Count (CBC)" for a scan, and "Dr. Dr. Test Sharma" for a
 * doctor whose stored name already carries the title — both of which shipped in
 * the app before this existed.
 *
 * Mirrors providerLabel() in the mobile app's utils/booking.ts. The two must
 * agree: the same booking is read in both, and a patient who sees
 * "Dr. Test Sharma" on the phone should not see "Test Sharma" on the site.
 */
export function providerLabel(name, kind) {
  const n = String(name ?? '').trim();
  if (!n || kind === 'SCAN' || /^dr\.?\s/i.test(n)) return n;
  return `Dr. ${n}`;
}

export default providerLabel;
