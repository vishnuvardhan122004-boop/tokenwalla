import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './i18n';
import App from './App';
import { BrowserRouter as Router } from 'react-router';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <Router>
    <App />
  </Router>
);