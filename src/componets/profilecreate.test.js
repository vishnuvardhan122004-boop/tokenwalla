import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import API from '../services/api';
import Profilecreate from './profilecreate';

jest.mock('../services/api', () => ({ __esModule: true, default: { post: jest.fn() } }));

// jsdom has no scrollIntoView, and useAuthKeyboard calls it on every focus.
Element.prototype.scrollIntoView = jest.fn();

const type = (label, value) => userEvent.type(screen.getByLabelText(label), value);

/** Fill the form up to a verified mobile, then submit with `password`. */
async function submitWith(password, registerRejection = { response: { data: { message: 'nope' } } }) {
  API.post.mockImplementation((url) => {
    if (url === '/auth/otp/request/') return Promise.resolve({ data: {} });
    if (url === '/auth/otp/verify/')  return Promise.resolve({ data: { verified: true } });
    // Fail the register call: success navigates and reloads the window.
    return Promise.reject(registerRejection);
  });

  render(<MemoryRouter><Profilecreate /></MemoryRouter>);
  await type('Full Name', 'Test Patient');
  await type('Mobile Number', '9876543210');
  await userEvent.click(screen.getByRole('button', { name: 'Get OTP' }));
  await userEvent.type(await screen.findByPlaceholderText('6-digit OTP'), '123456');
  await userEvent.click(screen.getByRole('button', { name: /Verify OTP/ }));
  await screen.findAllByText(/Mobile verified/);   // the badge and the step-3 subtitle
  await type('Password', password);
  await type('Confirm Password', password);
  await userEvent.click(screen.getByRole('button', { name: /Create Account/i }));
}

beforeEach(() => jest.clearAllMocks());

test('a password with a symbol reaches the server', async () => {
  // The old [A-Za-z\d] class rejected this in the browser, so a valid
  // password Django accepts could never be registered at all.
  await submitWith('Test@1234');
  await waitFor(() => expect(API.post).toHaveBeenCalledWith(
    '/auth/register/', expect.objectContaining({ password: 'Test@1234' })));
});

test('a password with no digit is still refused before the request', async () => {
  await submitWith('abcdefgh');
  expect(await screen.findByText(/Min 6 chars/)).toBeInTheDocument();
  expect(API.post).not.toHaveBeenCalledWith('/auth/register/', expect.anything());
});

test('an all-numeric password is refused before the request', async () => {
  // Django's NumericPasswordValidator rejects this server-side regardless;
  // this is the one cheap, exact check duplicated client-side to save the
  // round trip.
  await submitWith('123456');
  expect(await screen.findByText(/cannot be entirely numbers/)).toBeInTheDocument();
  expect(API.post).not.toHaveBeenCalledWith('/auth/register/', expect.anything());
});

test('a server-side password rejection shows the real reason, not a generic message', async () => {
  // RegisterSerializer.validate() raises {password: [...]} for a
  // CommonPasswordValidator / similarity rejection - a shape this form used
  // to fall through to 'Registration failed. Try again.' on, hiding the
  // reason the server had already computed.
  await submitWith('Test@1234', {
    response: { data: { password: ['This password is too common.'] } },
  });
  expect(await screen.findByText('This password is too common.')).toBeInTheDocument();
  expect(screen.queryByText(/Registration failed/)).not.toBeInTheDocument();
});

test('OTP field accepts 6 digits, strips non-digits, and gates the verify button', async () => {
  API.post.mockImplementation((url) =>
    url === '/auth/otp/request/' ? Promise.resolve({ data: {} }) : Promise.reject());

  render(<MemoryRouter><Profilecreate /></MemoryRouter>);
  await type('Full Name', 'Test Patient');
  await type('Mobile Number', '9876543210');
  await userEvent.click(screen.getByRole('button', { name: 'Get OTP' }));

  const otpInput  = await screen.findByPlaceholderText('6-digit OTP');
  const verifyBtn = screen.getByRole('button', { name: /Verify OTP/ });

  await userEvent.type(otpInput, '12ab34');
  expect(otpInput).toHaveValue('1234');
  expect(verifyBtn).toBeDisabled();

  await userEvent.type(otpInput, '56');
  expect(otpInput).toHaveValue('123456');
  expect(verifyBtn).toBeEnabled();

  // A 7th keystroke is dropped, not appended.
  await userEvent.type(otpInput, '7');
  expect(otpInput).toHaveValue('123456');
});
