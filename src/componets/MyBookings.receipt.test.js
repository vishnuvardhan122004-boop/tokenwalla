import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import API from '../services/api';
import MyBookings, { today } from './MyBookings';

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

const receipt = {
  seller: { name: 'TokenWalla', gstin: '36ABCDE1234F1Z5' },
  receipt_no: 'TW-000123',
  issued_at: '17 Sep 2026, 10:00 AM',
  payment_id: 'pay_abc123',
  order_id: 'order_abc123',
  status: 'PAID',
  booking: {
    id: 1, token: 'TW-001', doctor: 'Dr. Rao', hospital: 'City Hospital',
    date: today, slot: '10:30 AM', patient: 'Patient',
  },
  line_items: [
    { description: 'Doctor Consultation Fee', sac_code: null, taxable_value: '500.00', gst_rate: '0%', gst_amount: '0.00', note: 'Healthcare service — GST exempt' },
    { description: 'Platform Fee', sac_code: '998599', taxable_value: '20.00', gst_rate: '18%', gst_amount: null },
  ],
  pass: null,
  note: '',
  taxable_value: '20.00',
  gst: { rate: '18%', amount: '3.60' },
  total: '523.60',
};

const mockApi = ({ bookings = [], receiptResponse } = {}) => {
  API.get.mockImplementation((url) => {
    if (url === '/bookings/my/') return Promise.resolve({ data: bookings });
    if (url.startsWith('/doctors/')) return Promise.resolve({ data: { running_delay_minutes: 0 } });
    if (url.startsWith('/payment/receipt/')) {
      if (receiptResponse?.error) {
        return Promise.reject({ response: { status: receiptResponse.status || 404, data: { message: receiptResponse.error } } });
      }
      return Promise.resolve({ data: receiptResponse || receipt });
    }
    return Promise.reject(new Error('not found'));
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.setItem('user', JSON.stringify({ id: 1, name: 'Patient' }));
});
afterEach(() => localStorage.clear());

test('a paid booking shows a Receipt link', async () => {
  mockApi({ bookings: [booking({ amount: 100 })] });
  render(<MemoryRouter><MyBookings /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText('Dr. Rao')).toBeTruthy());
  expect(screen.getByText('Receipt')).toBeTruthy();
});

test('a zero-amount booking (free pass redemption) shows no Receipt link', async () => {
  mockApi({ bookings: [booking({ amount: 0 })] });
  render(<MemoryRouter><MyBookings /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText('Dr. Rao')).toBeTruthy());
  expect(screen.queryByText('Receipt')).toBeNull();
});

test('clicking Receipt fetches and renders the GST breakdown', async () => {
  mockApi({ bookings: [booking()] });
  render(<MemoryRouter><MyBookings /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText('Dr. Rao')).toBeTruthy());

  fireEvent.click(screen.getByText('Receipt'));

  expect(API.get).toHaveBeenCalledWith('/payment/receipt/1/');
  await waitFor(() => expect(screen.getByText('TW-000123')).toBeTruthy());
  expect(screen.getByText('₹523.60')).toBeTruthy();
  expect(screen.getByText(/GST exempt/i)).toBeTruthy();
});

test('a receipt the backend refuses shows the error, not a crash', async () => {
  mockApi({ bookings: [booking()], receiptResponse: { error: 'Access denied.', status: 403 } });
  render(<MemoryRouter><MyBookings /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText('Dr. Rao')).toBeTruthy());

  fireEvent.click(screen.getByText('Receipt'));
  await waitFor(() => expect(screen.getByText('Access denied.')).toBeTruthy());
});
