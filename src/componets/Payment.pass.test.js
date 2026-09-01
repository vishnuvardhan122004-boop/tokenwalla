/**
 * Checkout, with an Appointment Pass in play.
 *
 * The money math is the server's and is tested there — what this covers is the
 * part only the browser can get wrong: which of the three states the screen is
 * in (offer it / spend it / neither), and that spending one skips Razorpay
 * entirely instead of opening checkout for ₹0.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import API from '../services/api';
import Payment from './Payment';

jest.mock('../services/api', () => ({
  __esModule: true, default: { get: jest.fn(), post: jest.fn() },
}));

// `mock`-prefixed so the jest.mock factory may close over it.
const mockNavigate = jest.fn();
jest.mock('react-router', () => ({
  ...jest.requireActual('react-router'),
  useNavigate: () => mockNavigate,
  useLocation: () => ({
    state: {
      doctorId: 7, doctorName: 'Rao', hospital: 'Apollo',
      date: '2026-12-01', slot: '09:00 AM',
    },
  }),
}));

const SERVICE_ONLY_DOCTOR = {
  fee: 200, payment_collection_mode: 'SERVICE_ONLY',
  fee_breakdown: {
    doctor_fee: '0.00', offline_doctor_fee: '200.00',
    collection_mode: 'SERVICE_ONLY', platform_fee: '20.00', gateway_fee: '1.50',
    taxable_value: '21.50', gst_amount: '3.87', final_amount: '25.37',
  },
};
const OFFER = { enabled: true, price: '35.00', bookings: 2, days: 30, pass: null };
const HELD  = {
  ...OFFER,
  pass: { id: 1, remaining: 1, total: 2, used: 1,
          expires_at: '2026-12-31T00:00:00Z', price: '35.00' },
};

/** Wire /doctors/7/ and /payment/pass/ independently of call order. */
const serve = ({ doctor = SERVICE_ONLY_DOCTOR, pass = OFFER } = {}) => {
  API.get.mockImplementation((url) =>
    url.startsWith('/payment/pass')
      ? Promise.resolve({ data: pass })
      : Promise.resolve({ data: doctor }));
};

const show = () => render(<MemoryRouter><Payment /></MemoryRouter>);

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.setItem('user', JSON.stringify({ name: 'Pat', mobile: '9000000001' }));
});

test('the pass is offered as an upgrade, and unselected by default', async () => {
  serve();
  show();
  await screen.findByText(/Appointment Pass — ₹35.00/);
  // The default must stay the cheap single visit — nobody is upsold silently.
  expect(screen.getByRole('button', { name: /Pay ₹25.37/ })).toBeInTheDocument();
  expect(screen.getByText(/save ₹15.74/)).toBeInTheDocument();
});

test('choosing the pass repriced the button to ₹35', async () => {
  serve();
  show();
  const option = await screen.findByRole('radio', { checked: false });
  await userEvent.click(option);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /Pay ₹35.00/ })).toBeInTheDocument());
});

test('a doctor who collects the full fee online is never offered one', async () => {
  serve({ doctor: {
    fee: 200, payment_collection_mode: 'FULL',
    fee_breakdown: { ...SERVICE_ONLY_DOCTOR.fee_breakdown,
                     doctor_fee: '200.00', offline_doctor_fee: '0.00',
                     collection_mode: 'FULL', final_amount: '225.37' },
  } });
  show();
  await screen.findByRole('button', { name: /Pay ₹225.37/ });
  expect(screen.queryByText(/Appointment Pass/)).not.toBeInTheDocument();
});

test('the kill switch hides the offer', async () => {
  serve({ pass: { ...OFFER, enabled: false } });
  show();
  await screen.findByRole('button', { name: /Pay ₹25.37/ });
  expect(screen.queryByText(/Appointment Pass/)).not.toBeInTheDocument();
});

test('holding a pass turns checkout into a free confirmation', async () => {
  serve({ pass: HELD });
  show();
  const button = await screen.findByRole('button', { name: /Use your pass/ });
  expect(screen.getByText(/covered — no payment needed/)).toBeInTheDocument();
  // Both the service-fee line and the total read ₹0.00 — that is the point.
  expect(screen.getAllByText('₹0.00')).toHaveLength(2);

  API.post.mockResolvedValue({ data: {
    success: true, token: 'TW-1', booking: { paymentId: '' },
    pass: { remaining: 0 },
  } });
  await userEvent.click(button);

  await waitFor(() => expect(API.post).toHaveBeenCalledWith(
    '/payment/pass/redeem/', expect.objectContaining({ doctorId: 7, slot: '09:00 AM' })));
  // No order, no gateway — the whole point of a ₹0 booking.
  expect(API.post).toHaveBeenCalledTimes(1);
  expect(mockNavigate).toHaveBeenCalledWith('/booking-token',
    expect.objectContaining({ state: expect.objectContaining({ passRemaining: 0 }) }));
});

test('a backend without the endpoint just means no pass', async () => {
  API.get.mockImplementation((url) =>
    url.startsWith('/payment/pass')
      ? Promise.reject(new Error('404'))
      : Promise.resolve({ data: SERVICE_ONLY_DOCTOR }));
  show();
  await screen.findByRole('button', { name: /Pay ₹25.37/ });
  expect(screen.queryByText(/Appointment Pass/)).not.toBeInTheDocument();
});
