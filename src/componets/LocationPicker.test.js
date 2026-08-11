import { describe as toAddress } from './LocationPicker';

// Photon reverse-geocode payloads → what we show under the pin and store as city.
describe('LocationPicker address mapping', () => {
  const feat = (properties) => ({ properties });

  it('returns null for a missing feature', () => {
    expect(toAddress(null)).toBeNull();
    expect(toAddress(undefined)).toBeNull();
  });

  it('builds a readable label and picks the city', () => {
    const out = toAddress(feat({
      name: 'Apollo Hospital', housenumber: '12-3', street: 'Ring Road',
      district: 'Gachibowli', city: 'Hyderabad', state: 'Telangana', postcode: '500032',
    }));
    expect(out.city).toBe('Hyderabad');
    expect(out.label).toBe('Apollo Hospital, 12-3 Ring Road, Gachibowli, Hyderabad, Telangana, 500032');
  });

  it('falls back through town/village/county when city is absent', () => {
    expect(toAddress(feat({ town:    'Tenali' })).city).toBe('Tenali');
    expect(toAddress(feat({ village: 'Kuchipudi' })).city).toBe('Kuchipudi');
    expect(toAddress(feat({ county:  'Guntur' })).city).toBe('Guntur');
  });

  it('drops empty parts instead of leaving stray commas', () => {
    expect(toAddress(feat({ city: 'Vijayawada', state: 'Andhra Pradesh' })).label)
      .toBe('Vijayawada, Andhra Pradesh');
  });

  it('does not repeat the name when it is just the street', () => {
    const out = toAddress(feat({ name: 'Ring Road', street: 'Ring Road', city: 'Guntur' }));
    expect(out.label).toBe('Ring Road, Guntur');
  });

  it('does not repeat the district when it equals the city', () => {
    const out = toAddress(feat({ district: 'Guntur', city: 'Guntur', state: 'Andhra Pradesh' }));
    expect(out.label).toBe('Guntur, Andhra Pradesh');
  });

  it('survives a feature with no usable properties', () => {
    expect(toAddress(feat({}))).toEqual({ city: '', label: '' });
    expect(toAddress({})).toEqual({ city: '', label: '' });
  });
});
