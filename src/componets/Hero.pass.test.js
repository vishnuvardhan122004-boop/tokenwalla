/**
 * The landing-page Appointment Pass teaser. Advertised pre-login, so this
 * only covers what the browser can get wrong: showing it when the flag is
 * on, and never showing it (not a broken page) when it's off or the fetch
 * fails.
 */
import '../i18n';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import API from '../services/api';
import Hero from './Hero';

jest.mock('../services/api', () => ({
  __esModule: true, default: { get: jest.fn() },
}));

const show = () => render(<MemoryRouter><Hero /></MemoryRouter>);

const serve = (passResponse) => {
  API.get.mockImplementation((url) =>
    url.startsWith('/payment/pass')
      ? (passResponse instanceof Error ? Promise.reject(passResponse) : Promise.resolve({ data: passResponse }))
      : Promise.resolve({ data: [] }));
};

beforeEach(() => jest.clearAllMocks());

test('the pass teaser shows when the offer is enabled', async () => {
  serve({ enabled: true, price: '35.00', bookings: 2, days: 30, pass: null });
  show();
  await screen.findByText('Appointment Pass');
  expect(screen.getByText(/Waives the service fee on 2 visits within 30 days/)).toBeInTheDocument();
});

test('the kill switch hides the teaser, not just the checkout offer', async () => {
  serve({ enabled: false, price: '35.00', bookings: 2, days: 30, pass: null });
  show();
  // Let the fetch settle before asserting absence.
  await waitFor(() => expect(API.get).toHaveBeenCalled());
  expect(screen.queryByText('Appointment Pass')).not.toBeInTheDocument();
});

test('a failed fetch just means no teaser, never a broken landing page', async () => {
  serve(new Error('network'));
  show();
  await waitFor(() => expect(API.get).toHaveBeenCalled());
  expect(screen.queryByText('Appointment Pass')).not.toBeInTheDocument();
  // The rest of the page still rendered.
  expect(screen.getByText('Booking Fee')).toBeInTheDocument();
});
