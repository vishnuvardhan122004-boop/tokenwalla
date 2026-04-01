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

test('unauthenticated user is redirected from /my-bookings to /login', () => {
  localStorage.clear();
  render(
    <MemoryRouter initialEntries={['/my-bookings']}>
      <App />
    </MemoryRouter>
  );
  // Should be redirected — login form is present
  expect(screen.queryByText(/sign in/i)).toBeTruthy();
});