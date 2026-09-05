/**
 * Checkout reports failures in-page, not through native alert().
 *
 * Every message on this screen used to be a browser alert(): an unstyled OS
 * dialog, on the one page where a patient decides whether to hand over money.
 * Every other screen in the product already used a themed toast.
 *
 * What matters here is not that it looks nicer — it is that the message still
 * ARRIVES. A silent failure on the payment screen is far worse than an ugly
 * one, so these tests assert the text is on screen, and that the two messages
 * which fire AFTER the card is charged do not auto-dismiss.
 */
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import API from '../services/api';
import Payment from './Payment';

jest.mock('../services/api', () => ({
  __esModule: true, default: { get: jest.fn(), post: jest.fn() },
}));

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
const NO_PASS = { enabled: false, price: '35.00', bookings: 2, days: 30, pass: null };

const serve = () => {
  API.get.mockImplementation((url) =>
    url.startsWith('/payment/pass')
      ? Promise.resolve({ data: NO_PASS })
      : Promise.resolve({ data: SERVICE_ONLY_DOCTOR }));
};

const show = () => render(<MemoryRouter><Payment /></MemoryRouter>);

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.setItem('user', JSON.stringify({ name: 'Pat', mobile: '9000000001' }));
});

/** Turn on "book for someone else" and leave the name blank → validation fails. */
async function triggerValidationFailure() {
  serve();
  show();
  const pay = await screen.findByRole('button', { name: /Pay ₹25.37/ });
  await userEvent.click(screen.getByLabelText(/someone else/i));
  await userEvent.click(pay);
}

test('a validation failure is shown in the page, not through window.alert', async () => {
  // If this ever regresses to alert(), jsdom throws "not implemented" rather
  // than rendering — so spying and asserting zero calls pins the real change.
  const nativeAlert = jest.spyOn(window, 'alert').mockImplementation(() => {});

  await triggerValidationFailure();

  expect(await screen.findByRole('alert')).toHaveTextContent(
    /enter the other person's name/i);
  expect(nativeAlert).not.toHaveBeenCalled();
  nativeAlert.mockRestore();
});

test('an ordinary failure clears itself so it cannot cover the page', async () => {
  jest.useFakeTimers({ advanceTimers: true });
  try {
    await triggerValidationFailure();
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    await act(async () => { jest.advanceTimersByTime(4500); });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  } finally {
    jest.useRealTimers();
  }
});

test('a failure AFTER the card is charged stays until dismissed', async () => {
  // The one thing the blocking alert() was genuinely good at. "Verification
  // failed, contact support" means the money moved and the booking did not —
  // a message that vanishes in four seconds loses the patient the only text
  // telling them to get in touch.
  //
  // Reaching that branch means getting past Razorpay Checkout, which never
  // loads in jsdom. So we stand in for the SDK: capture the options object the
  // component builds and invoke its `handler`, which is exactly what Razorpay
  // itself does once a card is charged.
  jest.useFakeTimers({ advanceTimers: true });
  const scriptEl = document.createElement('script');
  scriptEl.src = 'https://checkout.razorpay.com/v1/checkout.js';
  document.body.appendChild(scriptEl);      // loadScript() resolves on a cached tag

  let captured = null;
  window.Razorpay = function (options) {
    captured = options;
    return { open: () => {}, on: () => {} };
  };

  try {
    serve();
    API.post.mockImplementation((url) =>
      url.includes('create-order')
        ? Promise.resolve({ data: { order_id: 'ord_1', key: 'rzp_test_x', amount: '25.37' } })
        // The failure under test: captured, but the booking could not be made.
        : Promise.resolve({ data: { success: false, message: 'Verification failed. Contact support.' } }));

    show();
    await userEvent.click(await screen.findByRole('button', { name: /Pay ₹25.37/ }));
    await screen.findByText(/Opening Payment Gateway/i);

    expect(captured).not.toBeNull();
    await act(async () => { await captured.handler({}); });

    const toast = await screen.findByRole('alert');
    expect(toast).toHaveTextContent(/verification failed/i);

    // Well past the 4s auto-dismiss — a sticky toast must still be there.
    await act(async () => { jest.advanceTimersByTime(30000); });
    expect(screen.getByRole('alert')).toHaveTextContent(/verification failed/i);
  } finally {
    jest.useRealTimers();
    delete window.Razorpay;
    scriptEl.remove();
  }
});
