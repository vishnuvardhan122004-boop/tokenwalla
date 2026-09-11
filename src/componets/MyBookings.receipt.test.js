import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import API from '../services/api';
import MyBookings, { today } from './MyBookings';

jest.mock('../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));

const booking = (over) => ({
  id: 1, token: 'TW-001', status: 'COMPLETED', date: today, slot: '10:30 AM',
  amount: 45, doctor: 5, doctor_name: 'Rao', provider_kind: 'DOCTOR',
  hospital_name: 'City Hospital', queue_access: false, queue_position: null,
  free_reschedule: false, is_for_other: false, uses_pass: false, pass_role: null,
  ...over,
});

const receipt = (over) => ({
  seller: { name: 'TokenWalla', gstin: '29ABCDE1234F1Z5' },
  receipt_no: 'TW-000001',
  issued_at: '11 Sep 2026, 09:15 AM',
  payment_id: 'pay_abc123',
  order_id: 'order_abc123',
  status: 'captured',
  booking: {
    id: 1, token: 'TW-001', doctor: 'Rao', hospital: 'City Hospital',
    date: today, slot: '10:30 AM', patient: 'Patient',
  },
  line_items: [
    { description: 'Doctor Consultation Fee', sac_code: null, taxable_value: '400.00', gst_rate: '0%', gst_amount: '0.00', note: 'Healthcare service — GST exempt' },
    { description: 'Platform Fee', sac_code: '999799', taxable_value: '20.00', gst_rate: '18%', gst_amount: null },
    { description: 'Payment Gateway Fee', sac_code: '999799', taxable_value: '5.00', gst_rate: '18%', gst_amount: null },
  ],
  pass: null,
  note: '',
  taxable_value: '25.00',
  gst: { rate: '18%', amount: '4.50' },
  total: '429.50',
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.setItem('user', JSON.stringify({ id: 1, name: 'Patient' }));
});
afterEach(() => localStorage.clear());

const mockApi = ({ bookings = [], receiptResponse } = {}) => {
  API.get.mockImplementation((url) => {
    if (url === '/bookings/my/') return Promise.resolve({ data: bookings });
    if (url.startsWith('/payment/pass/')) return Promise.reject(new Error('no pass'));
    if (url.startsWith('/doctors/')) return Promise.resolve({ data: { running_delay_minutes: 0 } });
    if (url.startsWith('/payment/receipt/')) return receiptResponse();
    return Promise.reject(new Error('not found'));
  });
};

test('a paid booking shows a Receipt link', async () => {
  mockApi({ bookings: [booking({ amount: 45 })] });
  render(<MemoryRouter><MyBookings /></MemoryRouter>);

  expect(await screen.findByText('Receipt')).toBeTruthy();
});

test('a zero-amount booking shows no Receipt link', async () => {
  mockApi({ bookings: [booking({ amount: 0 })] });
  render(<MemoryRouter><MyBookings /></MemoryRouter>);

  await waitFor(() => expect(screen.getByText('Dr. Rao')).toBeTruthy());
  expect(screen.queryByText('Receipt')).toBeNull();
});

test('clicking Receipt fetches and renders the GST breakdown', async () => {
  mockApi({
    bookings: [booking()],
    receiptResponse: () => Promise.resolve({ data: receipt() }),
  });
  render(<MemoryRouter><MyBookings /></MemoryRouter>);

  fireEvent.click(await screen.findByText('Receipt'));

  expect(await screen.findByText('Receipt TW-000001')).toBeTruthy();
  expect(screen.getByText('₹429.50')).toBeTruthy();
  expect(screen.getByText('Doctor Consultation Fee')).toBeTruthy();
  expect(screen.getByText('Healthcare service — GST exempt')).toBeTruthy();
  expect(API.get).toHaveBeenCalledWith('/payment/receipt/1/');
});

test('a redeemed-pass visit shows the ₹0 note instead of a blank total', async () => {
  mockApi({
    bookings: [booking()],
    receiptResponse: () => Promise.resolve({
      data: receipt({
        pass: { role: 'redeemed' },
        note: 'Service fee already paid on Appointment Pass #3.',
        total: '0.00',
      }),
    }),
  });
  render(<MemoryRouter><MyBookings /></MemoryRouter>);

  fireEvent.click(await screen.findByText('Receipt'));

  expect(await screen.findByText(/redeemed against an existing pass/)).toBeTruthy();
  expect(screen.getByText('Service fee already paid on Appointment Pass #3.')).toBeTruthy();
});

test('a booking with no Payment row shows the server\'s message, not a generic failure', async () => {
  mockApi({
    bookings: [booking()],
    receiptResponse: () => Promise.reject({ response: { data: { message: 'No payment on this booking.' } } }),
  });
  render(<MemoryRouter><MyBookings /></MemoryRouter>);

  fireEvent.click(await screen.findByText('Receipt'));

  expect(await screen.findByText('No payment on this booking.')).toBeTruthy();
});

test('Close dismisses the modal', async () => {
  mockApi({
    bookings: [booking()],
    receiptResponse: () => Promise.resolve({ data: receipt() }),
  });
  render(<MemoryRouter><MyBookings /></MemoryRouter>);

  fireEvent.click(await screen.findByText('Receipt'));
  await screen.findByText('Receipt TW-000001');

  fireEvent.click(screen.getByText('Close'));

  await waitFor(() => expect(screen.queryByText('Receipt TW-000001')).toBeNull());
});
