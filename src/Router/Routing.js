import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router';

// Hero is the landing page — the first thing a patient sees, and the only
// route worth loading eagerly. Splitting it would put a network round-trip in
// front of the first paint, which is the opposite of the point.
import Hero from '../componets/Hero';

// Everything else loads on demand. Before this, a patient opening the home page
// downloaded the admin dashboard, the hospital dashboard and the QR scanner
// along with it — one 1.25 MB main.js for a site where most visitors only ever
// see three of these screens. The admin and hospital bundles in particular are
// large and are never reachable by a patient at all.
const AllDoctor        = lazy(() => import('../componets/AllDoctor'));
const Login            = lazy(() => import('../componets/Login'));
const Profilecreate    = lazy(() => import('../componets/profilecreate'));
const DoctorDetails    = lazy(() => import('../componets/DoctorsDetails'));
const ScanCenterDetails = lazy(() => import('../componets/ScanCenterDetails'));
const Payment          = lazy(() => import('../componets/Payment'));
const BookingToken     = lazy(() => import('../componets/BookingToken'));
const Terms            = lazy(() => import('../componets/Terms'));
const Privacy          = lazy(() => import('../componets/Privacy'));
const Refund           = lazy(() => import('../componets/Refund'));
const About            = lazy(() => import('../componets/About'));
const Contact          = lazy(() => import('../componets/Contact'));
const ForgotPassword   = lazy(() => import('../componets/ForgotPassword'));
const MyBookings       = lazy(() => import('../componets/MyBookings'));
const MyDocuments      = lazy(() => import('../componets/MyDocuments'));

const HLogin      = lazy(() => import('../hospital/Hlogin'));
const Husercreate = lazy(() => import('../hospital/Usercreate'));
const Hdashboard  = lazy(() => import('../hospital/Hdashboard'));
const Hprofile    = lazy(() => import('../hospital/Hprofile'));

const Adashboard     = lazy(() => import('../ADMIN/Adashboard'));
const Admin          = lazy(() => import('../ADMIN/Admin'));
const UserManagement = lazy(() => import('../ADMIN/UserManagement'));
const Reports        = lazy(() => import('../ADMIN/Reports'));
const Payouts        = lazy(() => import('../ADMIN/Payouts'));
const Hospitals      = lazy(() => import('../ADMIN/Hospitals'));
const Support        = lazy(() => import('../ADMIN/Support'));
const Settings       = lazy(() => import('../ADMIN/Settings'));

/**
 * Shown while a route chunk downloads. Deliberately plain: a spinner that
 * appears for 80ms on a fast connection reads as jank, so this is a quiet
 * branded pause rather than a loading animation. Uses the shared tokens so it
 * matches whatever theme the page is about to render.
 */
function RouteFallback() {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        minHeight: '60vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--tw-muted, #64748B)',
        fontFamily: 'var(--font-body, sans-serif)',
        fontSize: '.9rem',
      }}
    >
      <span className="visually-hidden">Loading</span>
      <span aria-hidden="true">Loading…</span>
    </div>
  );
}

function getUser() {
  try {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function RequireAuth({ children, redirectTo = '/login' }) {
  const user = getUser();
  const location = useLocation();
  if (!user || !localStorage.getItem('access')) {
    return <Navigate to={redirectTo} state={{ from: location }} replace />;
  }
  return children;
}

function RequireHospital({ children }) {
  const user = getUser();
  const location = useLocation();
  if (!user || user.role !== 'hospital' || !localStorage.getItem('access')) {
    return <Navigate to="/Hlogin" state={{ from: location }} replace />;
  }
  return children;
}

function RequireAdmin({ children }) {
  const user = getUser();
  const location = useLocation();
  if (!user || user.role !== 'admin' || !localStorage.getItem('access')) {
    return <Navigate to="/2004" state={{ from: location }} replace />;
  }
  return children;
}

const Routing = () => (
  // One boundary around the whole table. Per-route boundaries would let a
  // shared layout stay mounted while its child loads, which nothing here needs.
  <Suspense fallback={<RouteFallback />}>
    <Routes>
      <Route path="/"              element={<Hero />} />
      <Route path="/alldoctor"     element={<AllDoctor />} />
      <Route path="/AllDoctor"     element={<Navigate to="/alldoctor" replace />} />
      <Route path="/doctor/:id"    element={<DoctorDetails />} />
      <Route path="/scan-center/:id" element={<ScanCenterDetails />} />
      <Route path="/login"         element={<Login />} />
      <Route path="/profilecreate" element={<Profilecreate />} />
      <Route path="/terms"         element={<Terms />} />
      <Route path="/privacy"       element={<Privacy />} />
      <Route path="/refund"        element={<Refund />} />
      <Route path="/about"         element={<About />} />
      <Route path="/contact"       element={<Contact />} />
      <Route path="/forgot-password"  element={<ForgotPassword type="patient"  />} />
      <Route path="/Hforgot-password" element={<ForgotPassword type="hospital" />} />
      <Route path="/payment"       element={<RequireAuth><Payment /></RequireAuth>} />
      <Route path="/booking-token" element={<RequireAuth><BookingToken /></RequireAuth>} />
      <Route path="/my-bookings"   element={<RequireAuth><MyBookings /></RequireAuth>} />
      <Route path="/my-documents"  element={<RequireAuth><MyDocuments /></RequireAuth>} />

      <Route path="/Hlogin"      element={<HLogin />} />
      <Route path="/Husercreate" element={<Husercreate />} />
      <Route path="/Hdashboard"  element={<RequireHospital><Hdashboard /></RequireHospital>} />
      <Route path="/Hprofile"    element={<RequireHospital><Hprofile /></RequireHospital>} />

      {/* Admin gateway — login page */}
      <Route path="/2004" element={<Admin />} />

      {/* Admin shell — overview is rendered by Adashboard itself at index */}
      <Route path="/Adashboard" element={<RequireAdmin><Adashboard /></RequireAdmin>}>
        <Route path="user-management" element={<UserManagement />} />
        <Route path="reports"         element={<Reports />} />
        <Route path="payouts"         element={<Payouts />} />
        <Route path="hospitals"       element={<Hospitals />} />
        <Route path="support"         element={<Support />} />
        <Route path="settings"        element={<Settings />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </Suspense>
);

export default Routing;
