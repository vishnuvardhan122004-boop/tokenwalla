import React from 'react';
import './App.css';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap/dist/js/bootstrap.bundle.js';
import { useLocation } from 'react-router';
import Routing from './Router/Routing';
import Navbar from './componets/Navbar';
import Footer from './componets/Footer';

// Pages that manage their own full-screen layout (no shared navbar/footer)
const STANDALONE_PATHS = [
  '/login',
  '/profilecreate',
  '/Hlogin',
  '/Husercreate',
  '/Hdashboard',
  '/forgot-password',
  '/Hforgot-password',
  '/2004',
  '/Adashboard',
  '/payment',
  '/booking-token',
];

function Layout() {
  const { pathname } = useLocation();

  const isStandalone = STANDALONE_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  );

  return (
    <>
      {!isStandalone && <Navbar />}
      <Routing />
      {!isStandalone && <Footer />}
    </>
  );
}

function App() {
  return <Layout />;
}

export default App;