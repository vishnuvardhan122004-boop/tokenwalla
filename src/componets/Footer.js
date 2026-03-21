import React from "react";
import { Link } from "react-router";

const Footer = () => {
  return (
    <footer className="bg-white border-top mt-5">

      <div className="container py-5">

        <div className="row">

          {/* Brand */}
          <div className="col-md-4 mb-4">
            <h5 className="fw-bold text-primary">TokenWalla</h5>
            <p className="text-muted">
              Smart hospital token & queue management platform helping
              patients and hospitals reduce waiting time efficiently.
            </p>
          </div>

          {/* Product */}
          <div className="col-md-2 mb-4">
            <h6 className="fw-bold">Product</h6>
            <ul className="list-unstyled text-muted">
              <li><Link to="/alldoctor" className="text-decoration-none text-muted">Find Doctors</Link></li>
              <li><Link to="/login" className="text-decoration-none text-muted">Login</Link></li>
              <li><Link to="/profile" className="text-decoration-none text-muted">My Account</Link></li>
            </ul>
          </div>

          {/* Company */}
          <div className="col-md-3 mb-4">
            <h6 className="fw-bold">Company</h6>
            <ul className="list-unstyled text-muted">
              <li><Link to="/about" className="text-decoration-none text-muted">About Us</Link></li>
              <li><Link to="/contact" className="text-decoration-none text-muted">Contact</Link></li>
              <li><Link to="/support" className="text-decoration-none text-muted">Support</Link></li>
            </ul>
          </div>

          {/* Legal */}
          <div className="col-md-3 mb-4">
            <h6 className="fw-bold">Legal</h6>
            <ul className="list-unstyled text-muted">
              <li><Link to="/terms" className="text-decoration-none text-muted">Terms & Conditions</Link></li>
              <li><Link to="/privacy" className="text-decoration-none text-muted">Privacy Policy</Link></li>
              <li><Link to="/refund" className="text-decoration-none text-muted">Refund Policy</Link></li>
            </ul>
          </div>

        </div>

        <hr />

        <div className="d-flex flex-column flex-md-row justify-content-between text-muted small">
          <span>© {new Date().getFullYear()} TokenWalla. All rights reserved.</span>
          <span>Designed & Developed by Vishnu</span>
        </div>

      </div>

    </footer>
  );
};

export default Footer;