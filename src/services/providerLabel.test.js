import { providerLabel } from './providerLabel';

// Mirrors utils/booking.test.ts in the app, case for case. If these two ever
// disagree, the same doctor reads differently on the site and on the phone.
describe('providerLabel', () => {
  it('prefixes a consultation provider', () => {
    expect(providerLabel('Test Sharma', 'DOCTOR')).toBe('Dr. Test Sharma');
  });

  it('never prefixes a scan', () => {
    expect(providerLabel('Complete Blood Count (CBC)', 'SCAN')).toBe('Complete Blood Count (CBC)');
  });

  it('does not double a name that already carries the title', () => {
    expect(providerLabel('Dr. Test Sharma', 'DOCTOR')).toBe('Dr. Test Sharma');
    expect(providerLabel('dr Hari krishna', 'DOCTOR')).toBe('dr Hari krishna');
  });

  it('returns empty (no stray "Dr.") for a missing name', () => {
    expect(providerLabel(undefined, 'DOCTOR')).toBe('');
    expect(providerLabel('   ', 'DOCTOR')).toBe('');
  });

  it('defaults to prefixing when kind is absent (older payloads)', () => {
    expect(providerLabel('Test Sharma')).toBe('Dr. Test Sharma');
  });
});
