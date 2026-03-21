// Routing.js
import React from 'react';
import { Routes, Route, Navigate } from 'react-router';

import Hero          from '../componets/Hero';
import AllDoctor     from '../componets/AllDoctor';
import Login         from '../componets/Login';
import Profilecreate from '../componets/profilecreate';
import DoctorDetails from '../componets/DoctorsDetails';
import Onedoctor     from '../componets/Onedoctor';
import Payment       from '../componets/Payment';
import BookingToken  from '../componets/BookingToken';
import Terms         from '../componets/Terms';
import Privacy       from '../componets/Privacy';
import Refund        from '../componets/Refund';
import About         from '../componets/About';
import Contact       from '../componets/Contact';
import ForgotPassword from '../componets/ForgotPassword';

import HLogin        from '../hospital/Hlogin';
import Husercreate   from '../hospital/Usercreate';
import Hdashboard    from '../hospital/Hdashboard';
import MyBookings    from '../componets/MyBookings';

import Adashboard     from '../ADMIN/Adashboard';
import Admin          from '../ADMIN/Admin';
import AdminIndex     from '../ADMIN/AdminIndex.js ';
import UserManagement from '../ADMIN/UserManagement';
import Reports        from '../ADMIN/Reports';
import Hospitals      from '../ADMIN/Hospitals';
import Support        from '../ADMIN/Support';
import Settings       from '../ADMIN/Settings';

const Routing = () => {
  return (
    <Routes>
      {/* Public */}
      <Route path='/'              element={<Hero />} />
      <Route path='/alldoctor'     element={<AllDoctor />} />
      <Route path='/AllDoctor'     element={<AllDoctor />} />
      <Route path='/doctor/:id'    element={<DoctorDetails />} />
      <Route path='/onedoctor/:id' element={<Onedoctor />} />
      <Route path='/login'         element={<Login />} />
      <Route path='/profilecreate' element={<Profilecreate />} />
      <Route path='/payment'       element={<Payment />} />
      <Route path='/booking-token' element={<BookingToken />} />
      <Route path='/terms'         element={<Terms />} />
      <Route path='/privacy'       element={<Privacy />} />
      <Route path='/refund'        element={<Refund />} />
      <Route path='/about'         element={<About />} />
      <Route path='/contact'       element={<Contact />} />
      <Route path='/my-bookings'   element={<MyBookings />} />

      {/* Password Reset */}
      <Route path='/forgot-password'  element={<ForgotPassword type="patient"  />} />
      <Route path='/Hforgot-password' element={<ForgotPassword type="hospital" />} />

      {/* Hospital */}
      <Route path='/Hlogin'      element={<HLogin />} />
      <Route path='/Husercreate' element={<Husercreate />} />
      <Route path='/Hdashboard'  element={<Hdashboard />} />

      {/* Admin Login */}
      <Route path='/2004' element={<Admin />} />

      {/* Admin Dashboard — nested layout */}
      <Route path='/Adashboard' element={<Adashboard />}>
        <Route index                   element={<AdminIndex />} />
        <Route path='user-management'  element={<UserManagement />} />
        <Route path='reports'          element={<Reports />} />
        <Route path='hospitals'        element={<Hospitals />} />
        <Route path='support'          element={<Support />} />
        <Route path='settings'         element={<Settings />} />
      </Route>

      {/* Catch-all */}
      <Route path='*' element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default Routing;