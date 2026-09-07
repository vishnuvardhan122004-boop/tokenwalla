import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import API from '../services/api';
import Hdashboard from './Hdashboard';

jest.mock('../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
  logoutUser: jest.fn(),
}));

const doctor = (over) => ({
  id: 7, name: 'Kumar', specialization: 'ENT', experience: 4,
  available: true, running_delay_minutes: 0, days: [], slots: [], max_per_slot: 10,
  ...over,
});

const setup = (doc) => {
  localStorage.setItem('access', 'tok');
  localStorage.setItem('user', JSON.stringify({ role: 'hospital', hospital: { id: 1, name: 'City Hospital' } }));

  API.get.mockImplementation((url) => {
    if (url.startsWith('/doctors/?hospital=')) return Promise.resolve({ data: [doc] });
    if (url.startsWith('/bookings/queue/')) return Promise.resolve({ data: { waiting: [], onHold: [], inProgress: [], completed: [] } });
    return Promise.reject(new Error('not found'));
  });
};

beforeEach(() => jest.clearAllMocks());
afterEach(() => localStorage.clear());

const openDoctorsTab = async () => {
  await userEvent.click(await screen.findByRole('button', { name: /doctors/i }));
  return screen.findByText('Kumar');
};

test('clicking a delay preset calls set-delay and highlights the active preset', async () => {
  setup(doctor());
  API.post.mockResolvedValue({ data: { id: 7, running_delay_minutes: 15, notified_count: 3 } });
  render(<MemoryRouter><Hdashboard /></MemoryRouter>);
  await openDoctorsTab();

  await userEvent.click(screen.getByRole('button', { name: '+15m' }));

  expect(API.post).toHaveBeenCalledWith('/doctors/7/set-delay/', { delay_minutes: 15 });
  expect(await screen.findByText(/marked 15m late\. 3 patients notified/i)).toBeTruthy();
  await waitFor(() => expect(screen.getByRole('button', { name: '+15m' }).className).toMatch(/btn-warning/));
});

test('Clear sends delay_minutes 0 and is disabled when there is nothing to clear', async () => {
  setup(doctor({ running_delay_minutes: 20 }));
  API.post.mockResolvedValue({ data: { id: 7, running_delay_minutes: 0, notified_count: 0 } });
  render(<MemoryRouter><Hdashboard /></MemoryRouter>);
  await openDoctorsTab();

  const clearBtn = screen.getByRole('button', { name: 'Clear' });
  expect(clearBtn).not.toBeDisabled();

  await userEvent.click(clearBtn);

  expect(API.post).toHaveBeenCalledWith('/doctors/7/set-delay/', { delay_minutes: 0 });
  expect(await screen.findByText(/Dr\. Kumar's delay cleared/i)).toBeTruthy();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled());
});
