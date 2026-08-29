import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import API from '../services/api';
import { WhatsAppOptIn } from './MyBookings';

jest.mock('../services/api', () => ({ __esModule: true, default: { get: jest.fn(), patch: jest.fn() } }));

const box = () => screen.getByRole('checkbox');

beforeEach(() => jest.clearAllMocks());

test('nothing renders until the server says what the preference is', async () => {
  let settle;
  API.get.mockReturnValue(new Promise(r => { settle = r; }));
  const { container } = render(<WhatsAppOptIn />);
  // A switch showing the wrong state is worse than no switch.
  expect(container).toBeEmptyDOMElement();

  settle({ data: { whatsapp_opt_in: false } });
  await waitFor(() => expect(box()).not.toBeChecked());
});

test('a failed read leaves it hidden rather than guessing', async () => {
  API.get.mockRejectedValue(new Error('401'));
  const { container } = render(<WhatsAppOptIn />);
  await waitFor(() => expect(API.get).toHaveBeenCalled());
  expect(container).toBeEmptyDOMElement();
});

test('a missing flag reads as opted in, matching the backend default', async () => {
  API.get.mockResolvedValue({ data: {} });
  render(<WhatsAppOptIn />);
  await waitFor(() => expect(box()).toBeChecked());
});

test('turning it off sends the patch', async () => {
  API.get.mockResolvedValue({ data: { whatsapp_opt_in: true } });
  API.patch.mockResolvedValue({ data: { whatsapp_opt_in: false } });
  render(<WhatsAppOptIn />);
  await waitFor(() => expect(box()).toBeChecked());

  await userEvent.click(box());

  expect(API.patch).toHaveBeenCalledWith('/auth/me/whatsapp-opt-in/', { whatsapp_opt_in: false });
  await waitFor(() => expect(box()).not.toBeChecked());
});

test('a failed patch rolls the switch back and says so', async () => {
  API.get.mockResolvedValue({ data: { whatsapp_opt_in: true } });
  API.patch.mockRejectedValue(new Error('500'));
  const onError = jest.fn();
  render(<WhatsAppOptIn onError={onError} />);
  await waitFor(() => expect(box()).toBeChecked());

  await userEvent.click(box());

  // Never leave the UI claiming a preference the server did not store.
  await waitFor(() => expect(box()).toBeChecked());
  expect(onError).toHaveBeenCalled();
});
