// src/componets/Privacy.js
// ─────────────────────────────────────────────────────────────────────────────
// Google Play Store–compliant Privacy Policy
// Covers: data collection, retention, deletion, children, third-party services,
// account deletion (mandatory since 2023), governing law, policy updates.
// Matches TokenWalla's existing design system (Plus Jakarta Sans, DM Sans,
// --blue-* tokens, LegalPage layout from LegalPages.js).
// ─────────────────────────────────────────────────────────────────────────────

const Privacy = () => {
  return (
    <>
      <style>{`
        .pp-root {
          font-family: 'DM Sans', sans-serif;
          background: #fff;
          min-height: 100vh;
          color: #0F172A;
        }

        /* ── Hero ── */
        .pp-hero {
          background: linear-gradient(160deg, #F4F9FF 0%, #EAF3FF 55%, #F8FBFF 100%);
          padding: 72px 0 52px;
          border-bottom: 1px solid #B5D4F4;
          position: relative;
          overflow: hidden;
        }
        .pp-hero-grid {
          position: absolute; inset: 0;
          background-image:
            linear-gradient(#B5D4F4 1px, transparent 1px),
            linear-gradient(90deg, #B5D4F4 1px, transparent 1px);
          background-size: 48px 48px;
          opacity: 0.35;
        }
        .pp-hero-inner {
          position: relative;
          max-width: 780px;
          margin: 0 auto;
          padding: 0 24px;
        }
        .pp-hero-label {
          font-size: 11px; font-weight: 600; letter-spacing: 2.5px;
          text-transform: uppercase; color: #185FA5; margin-bottom: 12px;
          display: flex; align-items: center; gap: 8px;
        }
        .pp-hero-label::before {
          content: ''; width: 24px; height: 2px; background: #185FA5;
          border-radius: 2px;
        }
        .pp-hero-title {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: clamp(2rem, 4vw, 2.8rem);
          font-weight: 800; color: #0F172A;
          margin-bottom: 14px; line-height: 1.1;
        }
        .pp-hero-meta {
          display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
        }
        .pp-hero-date {
          font-size: 13px; color: #64748B;
          display: flex; align-items: center; gap: 6px;
        }
        .pp-playstore-badge {
          display: inline-flex; align-items: center; gap: 7px;
          background: #EAF3DE; border: 1px solid #97C459;
          border-radius: 100px; padding: 4px 14px;
          font-size: 12px; font-weight: 600; color: #3B6D11;
        }

        /* ── TOC / Jump nav ── */
        .pp-toc {
          max-width: 780px; margin: 0 auto;
          padding: 28px 24px 0;
        }
        .pp-toc-inner {
          background: #F4F9FF; border: 1px solid #B5D4F4;
          border-radius: 16px; padding: 20px 24px;
        }
        .pp-toc-title {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 13px; font-weight: 700; color: #185FA5;
          margin-bottom: 12px; text-transform: uppercase;
          letter-spacing: 1px;
        }
        .pp-toc-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 6px;
        }
        .pp-toc-link {
          display: flex; align-items: center; gap: 7px;
          font-size: 13px; color: #185FA5; text-decoration: none;
          padding: 5px 8px; border-radius: 7px; transition: all 0.15s;
        }
        .pp-toc-link:hover {
          background: #E6F1FB; color: #0C447C;
        }
        .pp-toc-num {
          width: 18px; height: 18px; border-radius: 5px;
          background: #185FA5; color: #fff;
          font-size: 10px; font-weight: 700;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }

        /* ── Body ── */
        .pp-body {
          max-width: 780px;
          margin: 0 auto;
          padding: 40px 24px 96px;
        }

        /* ── Section ── */
        .pp-section {
          margin-bottom: 48px;
          scroll-margin-top: 80px;
        }
        .pp-section-header {
          display: flex; align-items: flex-start; gap: 14px;
          margin-bottom: 16px;
          padding-bottom: 14px;
          border-bottom: 2px solid #E6F1FB;
        }
        .pp-section-icon {
          width: 40px; height: 40px; border-radius: 11px;
          background: #E6F1FB; border: 1px solid #B5D4F4;
          display: flex; align-items: center; justify-content: center;
          font-size: 18px; flex-shrink: 0; margin-top: 2px;
        }
        .pp-section-title {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 1.15rem; font-weight: 800; color: #0F172A;
          margin-bottom: 2px;
        }
        .pp-section-num {
          font-size: 11px; font-weight: 600; letter-spacing: 1px;
          text-transform: uppercase; color: #185FA5;
        }
        .pp-section p {
          font-size: 15px; color: #475569; line-height: 1.85;
          margin-bottom: 12px;
        }
        .pp-section p:last-child { margin-bottom: 0; }

        /* ── Lists ── */
        .pp-list {
          list-style: none; padding: 0; margin: 12px 0;
          display: flex; flex-direction: column; gap: 8px;
        }
        .pp-list li {
          display: flex; align-items: flex-start; gap: 10px;
          font-size: 15px; color: #475569; line-height: 1.7;
        }
        .pp-list-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: #185FA5; flex-shrink: 0; margin-top: 10px;
        }

        /* ── Highlight box ── */
        .pp-highlight {
          background: #F0F9FF; border: 1px solid #B5D4F4;
          border-left: 4px solid #185FA5;
          border-radius: 0 12px 12px 0;
          padding: 14px 18px; margin: 16px 0;
          font-size: 14px; color: #1E3A5F; line-height: 1.7;
        }
        .pp-highlight strong { color: #185FA5; }

        /* ── Warning / critical box ── */
        .pp-warn {
          background: #EAF3DE; border: 1px solid #97C459;
          border-radius: 12px; padding: 14px 18px; margin: 16px 0;
          font-size: 14px; color: #3B6D11; line-height: 1.7;
          display: flex; align-items: flex-start; gap: 10px;
        }
        .pp-warn-icon { font-size: 18px; flex-shrink: 0; margin-top: 1px; }

        /* ── Third-party table ── */
        .pp-table-wrap {
          overflow-x: auto; margin: 16px 0;
          border-radius: 12px; border: 1px solid #B5D4F4;
        }
        .pp-table {
          width: 100%; border-collapse: collapse;
          font-size: 14px;
        }
        .pp-table th {
          padding: 11px 16px; text-align: left;
          background: #F4F9FF; color: #185FA5;
          font-size: 11px; font-weight: 700; letter-spacing: 1px;
          text-transform: uppercase; border-bottom: 1px solid #B5D4F4;
        }
        .pp-table td {
          padding: 11px 16px; color: #475569;
          border-bottom: 1px solid #E6F1FB; vertical-align: top;
          line-height: 1.6;
        }
        .pp-table tr:last-child td { border-bottom: none; }
        .pp-table tr:hover td { background: #F8FBFF; }
        .pp-table a { color: #185FA5; text-decoration: none; font-size: 12px; }
        .pp-table a:hover { text-decoration: underline; }

        /* ── Deletion steps ── */
        .pp-steps {
          display: flex; flex-direction: column; gap: 10px; margin: 16px 0;
        }
        .pp-step {
          display: flex; align-items: flex-start; gap: 14px;
          background: #F8FBFF; border: 1px solid #E6F1FB;
          border-radius: 12px; padding: 13px 16px;
        }
        .pp-step-num {
          width: 26px; height: 26px; border-radius: 8px;
          background: #185FA5; color: #fff;
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 13px; font-weight: 800;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0; margin-top: 1px;
        }
        .pp-step-text {
          font-size: 14px; color: #475569; line-height: 1.6;
        }
        .pp-step-text strong { color: #0F172A; }

        /* ── Contact box ── */
        .pp-contact {
          background: #E6F1FB; border: 1px solid #B5D4F4;
          border-radius: 18px; padding: 28px 28px;
          margin-top: 48px;
        }
        .pp-contact-title {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 1.1rem; font-weight: 800; color: #0F172A;
          margin-bottom: 6px;
        }
        .pp-contact p { font-size: 14px; color: #64748B; margin-bottom: 10px; }
        .pp-contact a { color: #185FA5; font-weight: 600; text-decoration: none; }
        .pp-contact a:hover { text-decoration: underline; }
        .pp-contact-grid {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 12px; margin-top: 16px;
        }
        .pp-contact-item {
          display: flex; align-items: center; gap: 10px;
          background: #fff; border: 1px solid #B5D4F4;
          border-radius: 11px; padding: 12px 14px;
        }
        .pp-contact-item-icon { font-size: 18px; }
        .pp-contact-item-label { font-size: 11px; color: #94A3B8; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
        .pp-contact-item-val { font-size: 13px; color: #185FA5; font-weight: 600; }

        /* ── Divider ── */
        .pp-hr { height: 1px; background: #E6F1FB; margin: 0 0 48px; }

        @media (max-width: 600px) {
          .pp-hero { padding: 52px 0 36px; }
          .pp-toc-grid { grid-template-columns: 1fr; }
          .pp-section-title { font-size: 1rem; }
          .pp-contact { padding: 20px; }
        }
      `}</style>

      <div className="pp-root">

        {/* ── HERO ── */}
        <div className="pp-hero">
          <div className="pp-hero-grid" />
          <div className="pp-hero-inner">
            <div className="pp-hero-label">Legal</div>
            <h1 className="pp-hero-title">Privacy Policy</h1>
            <div className="pp-hero-meta">
              <span className="pp-hero-date">
                📅 Last updated: May 2026
              </span>
            </div>
          </div>
        </div>

        {/* ── TABLE OF CONTENTS ── */}
        <div className="pp-toc">
          <div className="pp-toc-inner">
            <div className="pp-toc-title">Quick Navigation</div>
            <div className="pp-toc-grid">
              {[
                'What We Collect',
                'How We Use Your Data',
                'Data Sharing',
                'Data Retention',
                'Account & Data Deletion',
                'Third-Party Services',
                'Children\'s Privacy',
                'Data Security',
                'Cookies',
                'Your Rights',
                'Policy Updates',
                'Contact Us',
              ].map((item, i) => (
                <a
                  key={i}
                  href={`#section-${i + 1}`}
                  className="pp-toc-link"
                >
                  <span className="pp-toc-num">{i + 1}</span>
                  {item}
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* ── BODY ── */}
        <div className="pp-body">

          <div className="pp-highlight">
            <strong>Summary:</strong> TokenWalla is a hospital token and queue management
            platform. We collect only what's needed to process your bookings. We never sell
            your data, never store card details, and you can delete your account at any time.
          </div>

          {/* 1. What We Collect */}
          <div className="pp-section" id="section-1">
            <div className="pp-section-header">
              <div className="pp-section-icon">📋</div>
              <div>
                <div className="pp-section-num">Section 1</div>
                <div className="pp-section-title">What We Collect</div>
              </div>
            </div>
            <p>We collect only the minimum data required to provide the TokenWalla service. This includes:</p>
            <ul className="pp-list">
              <li><span className="pp-list-dot" /><span><strong>Account data:</strong> Your full name and mobile number (used as your login identifier).</span></li>
              <li><span className="pp-list-dot" /><span><strong>Booking data:</strong> Doctor appointments, chosen date and time slots, hospital name, token numbers, and booking status.</span></li>
              <li><span className="pp-list-dot" /><span><strong>Payment data:</strong> Razorpay order IDs and payment transaction IDs only. We never store, process, or transmit your card number, CVV, UPI PIN, or net banking credentials. All payment processing is handled entirely by Razorpay.</span></li>
              <li><span className="pp-list-dot" /><span><strong>OTP verification data:</strong> Your mobile number is used to send a one-time password via our OTP provider (2Factor.in) for identity verification. OTPs expire within 5 minutes and are never stored after verification.</span></li>
              <li><span className="pp-list-dot" /><span><strong>Device &amp; technical data:</strong> Browser type, device type, and IP address — collected automatically for security monitoring and analytics. We do not fingerprint your device or track you across other apps or websites.</span></li>
              <li><span className="pp-list-dot" /><span><strong>Doctor / hospital profile images:</strong> Images uploaded by hospitals are stored on Cloudinary (our media storage provider). Patients do not upload images.</span></li>
            </ul>
            <p>We do not collect location data, contacts, microphone audio, camera images, or any biometric data.</p>
          </div>

          {/* 2. How We Use Your Data */}
          <div className="pp-section" id="section-2">
            <div className="pp-section-header">
              <div className="pp-section-icon">⚙️</div>
              <div>
                <div className="pp-section-num">Section 2</div>
                <div className="pp-section-title">How We Use Your Data</div>
              </div>
            </div>
            <ul className="pp-list">
              <li><span className="pp-list-dot" /><span>To create and manage your TokenWalla account.</span></li>
              <li><span className="pp-list-dot" /><span>To process appointment bookings and issue digital queue tokens.</span></li>
              <li><span className="pp-list-dot" /><span>To display your live queue position and appointment status.</span></li>
              <li><span className="pp-list-dot" /><span>To send OTP messages for login, registration, and password reset.</span></li>
              <li><span className="pp-list-dot" /><span>To process payments via Razorpay and verify successful transactions.</span></li>
              <li><span className="pp-list-dot" /><span>To comply with legal obligations under Indian law, including RBI guidelines and anti-money-laundering regulations.</span></li>
              <li><span className="pp-list-dot" /><span>To improve platform performance through anonymised usage analytics.</span></li>
              <li><span className="pp-list-dot" /><span>To prevent fraud, abuse, and unauthorised access.</span></li>
            </ul>
            <p>We do not use your data for advertising, profiling, or selling to third parties.</p>
          </div>

          {/* 3. Data Sharing */}
          <div className="pp-section" id="section-3">
            <div className="pp-section-header">
              <div className="pp-section-icon">🤝</div>
              <div>
                <div className="pp-section-num">Section 3</div>
                <div className="pp-section-title">Data Sharing</div>
              </div>
            </div>
            <p>We do not sell, rent, or trade your personal information to any third party. We share data only in these limited cases:</p>
            <ul className="pp-list">
              <li><span className="pp-list-dot" /><span><strong>With the hospital you booked:</strong> Your name, mobile number, appointment date, slot, and token are shared with the hospital staff to manage your visit.</span></li>
              <li><span className="pp-list-dot" /><span><strong>With Razorpay:</strong> Payment transaction data is shared with Razorpay to process and verify your payment. Razorpay is PCI DSS Level 1 certified.</span></li>
              <li><span className="pp-list-dot" /><span><strong>With 2Factor.in:</strong> Your mobile number is shared solely to deliver OTP messages. No other data is shared.</span></li>
              <li><span className="pp-list-dot" /><span><strong>With Cloudinary:</strong> Hospital and doctor profile images are stored on Cloudinary's CDN. No patient personal data is shared with Cloudinary.</span></li>
              <li><span className="pp-list-dot" /><span><strong>With legal authorities:</strong> If required by law, court order, or a regulatory authority in India, we may be required to disclose your information.</span></li>
            </ul>
          </div>

          {/* 4. Data Retention */}
          <div className="pp-section" id="section-4">
            <div className="pp-section-header">
              <div className="pp-section-icon">🗓️</div>
              <div>
                <div className="pp-section-num">Section 4</div>
                <div className="pp-section-title">Data Retention</div>
              </div>
            </div>
            <ul className="pp-list">
              <li><span className="pp-list-dot" /><span><strong>Account data</strong> (name, mobile): Retained for as long as your account is active, plus 30 days after account deletion to allow for any disputes.</span></li>
              <li><span className="pp-list-dot" /><span><strong>Booking history:</strong> Retained for 24 months from the date of each appointment to support refund claims, dispute resolution, and legal compliance.</span></li>
              <li><span className="pp-list-dot" /><span><strong>Payment transaction IDs:</strong> Retained for 5 years as required by Indian financial regulations.</span></li>
              <li><span className="pp-list-dot" /><span><strong>OTP data:</strong> Automatically deleted within 5 minutes of generation, regardless of whether verification was completed.</span></li>
              <li><span className="pp-list-dot" /><span><strong>Session tokens (JWT):</strong> Access tokens expire after 2 hours; refresh tokens expire after 14 days.</span></li>
            </ul>
            <div className="pp-highlight">
              After the retention period ends, your data is permanently and irreversibly deleted from our servers and any backup systems.
            </div>
          </div>

          {/* 5. Account & Data Deletion */}
          <div className="pp-section" id="section-5">
            <div className="pp-section-header">
              <div className="pp-section-icon">🗑️</div>
              <div>
                <div className="pp-section-num">Section 5</div>
                <div className="pp-section-title">Account &amp; Data Deletion</div>
              </div>
            </div>
            <div className="pp-warn">
              <span className="pp-warn-icon">✅</span>
              <span>You have the right to delete your account and all associated personal data at any time. This is a Google Play Store requirement and we fully honour it.</span>
            </div>
            <p>To delete your account and personal data, follow any of these steps:</p>
            <div className="pp-steps">
              <div className="pp-step">
                <div className="pp-step-num">1</div>
                <div className="pp-step-text">
                  <strong>By email:</strong> Send a deletion request to{' '}
                  <a href="mailto:tokentraq@gmail.com" style={{ color: '#185FA5' }}>tokentraq@gmail.com</a>{' '}
                  from your registered mobile's linked email, or include your registered mobile number in the request. Use the subject line: <em>"Account Deletion Request"</em>.
                </div>
              </div>
              <div className="pp-step">
                <div className="pp-step-num">2</div>
                <div className="pp-step-text">
                  <strong>Processing time:</strong> We will process your deletion request within <strong>7 business days</strong> and send a confirmation once complete.
                </div>
              </div>
              <div className="pp-step">
                <div className="pp-step-num">3</div>
                <div className="pp-step-text">
                  <strong>What gets deleted:</strong> Your name, mobile number, and all booking history. Payment transaction IDs are retained for 5 years as required by Indian financial law but are not linked to your identity after account deletion.
                </div>
              </div>
              <div className="pp-step">
                <div className="pp-step-num">4</div>
                <div className="pp-step-text">
                  <strong>Active bookings:</strong> If you have upcoming active appointments, please cancel them from the "My Bookings" page before requesting deletion to ensure any eligible refunds are processed correctly.
                </div>
              </div>
            </div>
          </div>

          {/* 6. Third-Party Services */}
          <div className="pp-section" id="section-6">
            <div className="pp-section-header">
              <div className="pp-section-icon">🔗</div>
              <div>
                <div className="pp-section-num">Section 6</div>
                <div className="pp-section-title">Third-Party Services</div>
              </div>
            </div>
            <p>TokenWalla integrates the following third-party services. Each has its own privacy policy:</p>
            <div className="pp-table-wrap">
              <table className="pp-table">
                <thead>
                  <tr>
                    <th>Service</th>
                    <th>Purpose</th>
                    <th>Data Shared</th>
                    <th>Privacy Policy</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>Razorpay</strong></td>
                    <td>Payment processing</td>
                    <td>Order amount, transaction IDs, mobile number</td>
                    <td><a href="https://razorpay.com/privacy/" target="_blank" rel="noopener noreferrer">razorpay.com/privacy</a></td>
                  </tr>
                  <tr>
                    <td><strong>2Factor.in</strong></td>
                    <td>OTP / SMS delivery</td>
                    <td>Mobile number only</td>
                    <td><a href="https://2factor.in/privacy-policy/" target="_blank" rel="noopener noreferrer">2factor.in/privacy-policy</a></td>
                  </tr>
                  <tr>
                    <td><strong>Cloudinary</strong></td>
                    <td>Image storage (doctor/hospital photos)</td>
                    <td>Image files uploaded by hospitals only</td>
                    <td><a href="https://cloudinary.com/privacy" target="_blank" rel="noopener noreferrer">cloudinary.com/privacy</a></td>
                  </tr>
                  <tr>
                    <td><strong>Vercel</strong></td>
                    <td>Frontend hosting</td>
                    <td>IP address, browser metadata (standard server logs)</td>
                    <td><a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">vercel.com/legal/privacy-policy</a></td>
                  </tr>
                  <tr>
                    <td><strong>Render / Railway</strong></td>
                    <td>Backend hosting</td>
                    <td>Server logs, IP address</td>
                    <td>Render: <a href="https://render.com/privacy" target="_blank" rel="noopener noreferrer">render.com/privacy</a></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>We do not integrate any advertising SDKs, analytics SDKs (Google Analytics, Firebase, etc.), or social media tracking pixels.</p>
          </div>

          {/* 7. Children's Privacy */}
          <div className="pp-section" id="section-7">
            <div className="pp-section-header">
              <div className="pp-section-icon">🧒</div>
              <div>
                <div className="pp-section-num">Section 7</div>
                <div className="pp-section-title">Children's Privacy</div>
              </div>
            </div>
            <div className="pp-warn">
              <span className="pp-warn-icon">⚠️</span>
              <span><strong>TokenWalla is not intended for users under the age of 18.</strong> Our service involves medical appointments and financial transactions, which require adult legal capacity under Indian law.</span>
            </div>
            <p>We do not knowingly collect personal information from anyone under 18 years of age. If you are a parent or guardian and believe your child has provided us with personal information, please contact us immediately at <a href="mailto:tokentraq@gmail.com" style={{ color: '#185FA5' }}>tokentraq@gmail.com</a>. We will promptly delete any such data upon verification.</p>
            <p>If we discover that a user is under 18, we will immediately suspend their account and delete all associated data.</p>
          </div>

          {/* 8. Data Security */}
          <div className="pp-section" id="section-8">
            <div className="pp-section-header">
              <div className="pp-section-icon">🔐</div>
              <div>
                <div className="pp-section-num">Section 8</div>
                <div className="pp-section-title">Data Security</div>
              </div>
            </div>
            <ul className="pp-list">
              <li><span className="pp-list-dot" /><span><strong>Encryption in transit:</strong> All data is transmitted over HTTPS using TLS 1.2 or higher. Plain HTTP connections are rejected.</span></li>
              <li><span className="pp-list-dot" /><span><strong>Encryption at rest:</strong> Your data is stored in a PostgreSQL database with encryption at rest on the hosting provider's infrastructure.</span></li>
              <li><span className="pp-list-dot" /><span><strong>Password security:</strong> Passwords are hashed using Django's PBKDF2-SHA256 algorithm and are never stored in plain text.</span></li>
              <li><span className="pp-list-dot" /><span><strong>JWT authentication:</strong> Short-lived access tokens (2 hours) and rotating refresh tokens (14 days) with server-side blacklisting on logout.</span></li>
              <li><span className="pp-list-dot" /><span><strong>Payment security:</strong> We are PCI DSS compliant via Razorpay. Sensitive card data never touches our servers.</span></li>
              <li><span className="pp-list-dot" /><span><strong>Rate limiting:</strong> All API endpoints and OTP requests are rate-limited to prevent abuse.</span></li>
            </ul>
            <p>Despite these measures, no system is 100% secure. If you suspect any unauthorised access to your account, please contact us immediately.</p>
          </div>

          {/* 9. Cookies */}
          <div className="pp-section" id="section-9">
            <div className="pp-section-header">
              <div className="pp-section-icon">🍪</div>
              <div>
                <div className="pp-section-num">Section 9</div>
                <div className="pp-section-title">Cookies &amp; Local Storage</div>
              </div>
            </div>
            <p>TokenWalla uses browser <strong>localStorage</strong> (not traditional cookies) to maintain your login session by storing your access and refresh tokens on your device. No data from this is sent to advertising networks.</p>
            <ul className="pp-list">
              <li><span className="pp-list-dot" /><span><strong>Session tokens:</strong> Stored in localStorage to keep you logged in. Cleared automatically on logout.</span></li>
              <li><span className="pp-list-dot" /><span><strong>No tracking cookies:</strong> We do not use Google Analytics, Facebook Pixel, or any third-party tracking or advertising cookies.</span></li>
              <li><span className="pp-list-dot" /><span><strong>No cross-site tracking:</strong> We do not track your activity across other websites or apps.</span></li>
            </ul>
          </div>

          {/* 10. Your Rights */}
          <div className="pp-section" id="section-10">
            <div className="pp-section-header">
              <div className="pp-section-icon">⚖️</div>
              <div>
                <div className="pp-section-num">Section 10</div>
                <div className="pp-section-title">Your Rights</div>
              </div>
            </div>
            <p>As a TokenWalla user, you have the following rights regarding your personal data:</p>
            <ul className="pp-list">
              <li><span className="pp-list-dot" /><span><strong>Right to access:</strong> Request a copy of the personal data we hold about you.</span></li>
              <li><span className="pp-list-dot" /><span><strong>Right to correction:</strong> Request correction of inaccurate or incomplete data.</span></li>
              <li><span className="pp-list-dot" /><span><strong>Right to deletion:</strong> Request permanent deletion of your account and personal data (see Section 5).</span></li>
              <li><span className="pp-list-dot" /><span><strong>Right to portability:</strong> Request your booking history in a machine-readable format (CSV or JSON).</span></li>
              <li><span className="pp-list-dot" /><span><strong>Right to withdraw consent:</strong> You may stop using TokenWalla and request deletion at any time. Withdrawal does not affect the lawfulness of prior processing.</span></li>
            </ul>
            <p>To exercise any of these rights, email <a href="mailto:tokentraq@gmail.com" style={{ color: '#185FA5', fontWeight: 600 }}>tokentraq@gmail.com</a>. We will respond within <strong>30 calendar days</strong>.</p>
          </div>

          {/* 11. Policy Updates */}
          <div className="pp-section" id="section-11">
            <div className="pp-section-header">
              <div className="pp-section-icon">🔄</div>
              <div>
                <div className="pp-section-num">Section 11</div>
                <div className="pp-section-title">Changes to This Policy</div>
              </div>
            </div>
            <p>We may update this Privacy Policy from time to time to reflect changes in our services, technology, or legal requirements. When we make material changes, we will:</p>
            <ul className="pp-list">
              <li><span className="pp-list-dot" /><span>Update the "Last updated" date at the top of this page.</span></li>
              <li><span className="pp-list-dot" /><span>Display an in-app notification informing you of the update.</span></li>
              <li><span className="pp-list-dot" /><span>For significant changes affecting your rights, send an OTP-verified notice to your registered mobile number if technically feasible.</span></li>
            </ul>
            <p>Continued use of TokenWalla after the effective date of an updated policy constitutes your acceptance of the changes. We recommend reviewing this page periodically.</p>
            <p>Previous versions of this policy are available upon request by emailing <a href="mailto:tokentraq@gmail.com" style={{ color: '#185FA5' }}>tokentraq@gmail.com</a>.</p>
          </div>

          <div className="pp-hr" />

          {/* 12. Contact */}
          <div className="pp-section" id="section-12">
            <div className="pp-contact">
              <div className="pp-contact-title">📬 Contact &amp; Data Grievance Officer</div>
              <p>
                For any privacy concerns, data requests, or account deletion, contact us at:
              </p>
              <div className="pp-contact-grid">
                <div className="pp-contact-item">
                  <span className="pp-contact-item-icon">📧</span>
                  <div>
                    <div className="pp-contact-item-label">Email</div>
                    <div className="pp-contact-item-val">
                      <a href="mailto:tokentraq@gmail.com">tokentraq@gmail.com</a>
                    </div>
                  </div>
                </div>
                <div className="pp-contact-item">
                  <span className="pp-contact-item-icon">🏢</span>
                  <div>
                    <div className="pp-contact-item-label">Address</div>
                    <div className="pp-contact-item-val">Hindupur–Nimpalli Road, AP – 515201</div>
                  </div>
                </div>
                <div className="pp-contact-item">
                  <span className="pp-contact-item-icon">⏱️</span>
                  <div>
                    <div className="pp-contact-item-label">Response Time</div>
                    <div className="pp-contact-item-val">Within 30 calendar days</div>
                  </div>
                </div>
                <div className="pp-contact-item">
                  <span className="pp-contact-item-icon">⚖️</span>
                  <div>
                    <div className="pp-contact-item-label">Governing Law</div>
                    <div className="pp-contact-item-val">Andhra Pradesh, India</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  );
};

export default Privacy;