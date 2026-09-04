import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import App from './App';

// Suppress console.error for known React Router warnings in tests
beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  console.error.mockRestore?.();
  localStorage.clear();
});

test('renders homepage with TokenWalla brand', () => {
  render(
    <MemoryRouter initialEntries={['/']}>
      <App />
    </MemoryRouter>
  );
  // The hero renders the brand name
  const brand = screen.getAllByText(/tokenwalla/i);
  expect(brand.length).toBeGreaterThan(0);
});

test('unauthenticated user is redirected from /my-bookings to /login', async () => {
  localStorage.clear();
  render(
    <MemoryRouter initialEntries={['/my-bookings']}>
      <App />
    </MemoryRouter>
  );
  // Should be redirected — the login form's submit button is present. Matched by
  // role, not text: "sign in" also appears in the panel copy, and a bare text
  // query fails on the duplicate rather than on the thing being tested.
  //
  // findByRole, not getByRole: routes are React.lazy'd now, so Login arrives on
  // a later tick behind the Suspense fallback. The redirect itself is unchanged
  // — only the moment the destination is mountable is.
  expect(await screen.findByRole('button', { name: /sign in/i })).toBeTruthy();
});