import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import API from '../services/api';
import MyBookings, { addMinutesToSlot, today } from './MyBookings';

jest.mock('../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));

const booking = (over) => ({
  id: 1, token: 'TW-001', status: 'CONFIRMED', date: today, slot: '10:30 AM',
  amount: 100, doctor: 5, doctor_name: 'Rao', provider_kind: 'DOCTOR',
  hospital_name: 'City Hospital', queue_access: false, queue_position: null,
  free_reschedule: false, is_for_other: false, uses_pass: false, pass_role: null,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.setItem('user', JSON.stringify({ id: 1, name: 'Patient' }));
});
afterEach(() => localStorage.clear());

const mockApi = ({ bookings = [], delay = 0 }) => {
  API.get.mockImplementation((url) => {
    if (url === '/bookings/my/') return Promise.resolve({ data: bookings });
    if (url.startsWith('/doctors/')) return Promise.resolve({ data: { running_delay_minutes: delay } });
    return Promise.reject(new Error('not found'));
  });
};

test('addMinutesToSlot adds minutes and rolls over AM/PM correctly', () => {
  expect(addMinutesToSlot('10:30 AM', 15)).toBe('10:45 AM');
  expect(addMinutesToSlot('11:45 PM', 30)).toBe('12:15 AM');
  expect(addMinutesToSlot('11:50 AM', 20)).toBe('12:10 PM');
});

test('a doctor running late shows the warning banner with adjusted time', async () => {
  mockApi({ bookings: [booking()], delay: 15 });
  render(<MemoryRouter><MyBookings /></MemoryRouter>);

  const banner = await screen.findByText((_, el) => el?.className === 'mb-unavail-banner');
  expect(banner.textContent).toMatch(/Dr\. Rao is running ~15 mins late/i);
  expect(banner.querySelector('del').textContent).toBe('10:30 AM');
  expect(banner.textContent).toContain('10:45 AM');
});

test('no delay means no banner', async () => {
  mockApi({ bookings: [booking()], delay: 0 });
  render(<MemoryRouter><MyBookings /></MemoryRouter>);

  await waitFor(() => expect(screen.getByText('Dr. Rao')).toBeTruthy());
  expect(screen.queryByText((_, el) => el?.className === 'mb-unavail-banner')).toBeNull();
});
