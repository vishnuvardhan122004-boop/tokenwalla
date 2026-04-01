import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router';

import Hero           from '../componets/Hero';
import AllDoctor      from '../componets/AllDoctor';
import Login          from '../componets/Login';
import Profilecreate  from '../componets/profilecreate';
import DoctorDetails  from '../componets/DoctorsDetails';
import Payment        from '../componets/Payment';
import BookingToken   from '../componets/BookingToken';
import Terms          from '../componets/Terms';
import Privacy        from '../componets/Privacy';
import Refund         from '../componets/Refund';
import About          from '../componets/About';
import Contact        from '../componets/Contact';
import ForgotPassword from '../componets/ForgotPassword';
import MyBookings     from '../componets/MyBookings';

import HLogin      from '../hospital/Hlogin';
import Husercreate from '../hospital/Usercreate';
import Hdashboard  from '../hospital/Hdashboard';

import Adashboard     from '../ADMIN/Adashboard';
import Admin          from '../ADMIN/Admin';
import AdminIndex     from '../ADMIN/AdminIndex';
import UserManagement from '../ADMIN/UserManagement';
import Reports        from '../ADMIN/Reports';
import Hospitals      from '../ADMIN/Hospitals';
import Support        from '../ADMIN/Support';
import Settings       from '../ADMIN/Settings';

function getUser() {
  try {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
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
  if (!user || user.role !== 'hospital') {
    return <Navigate to="/Hlogin" state={{ from: location }} replace />;
  }
  return children;
}

function RequireAdmin({ children }) {
  const user = getUser();
  const location = useLocation();
  if (!user || user.role !== 'admin') {
    return <Navigate to="/2004" state={{ from: location }} replace />;
  }
  return children;
}

const Routing = () => (
  <Routes>
    <Route path="/"              element={<Hero />} />
    <Route path="/alldoctor"     element={<AllDoctor />} />
    <Route path="/AllDoctor"     element={<Navigate to="/alldoctor" replace />} />
    <Route path="/doctor/:id"    element={<DoctorDetails />} />
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
    <Route path="/Hlogin"      element={<HLogin />} />
    <Route path="/Husercreate" element={<Husercreate />} />
    <Route path="/Hdashboard"  element={<RequireHospital><Hdashboard /></RequireHospital>} />
    <Route path="/2004" element={<Admin />} />
    <Route path="/Adashboard" element={<RequireAdmin><Adashboard /></RequireAdmin>}>
      <Route index                  element={<AdminIndex />} />
      <Route path="user-management" element={<UserManagement />} />
      <Route path="reports"         element={<Reports />} />
      <Route path="hospitals"       element={<Hospitals />} />
      <Route path="support"         element={<Support />} />
      <Route path="settings"        element={<Settings />} />
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);

export default Routing;