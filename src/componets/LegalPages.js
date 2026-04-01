// shared legal page layout
const LegalPage = ({ title, sections }) => (
  <>
    <style>{`
      .legal-root { font-family: 'DM Sans', sans-serif; background: #fff; min-height: 100vh; }
      .legal-hero {
        background: linear-gradient(160deg, #F4F9FF 0%, #EAF3FF 50%, #F8FBFF 100%);
        padding: 72px 0 52px; border-bottom: 1px solid var(--blue-100);
      }
      .legal-hero-inner { max-width: 760px; margin: 0 auto; padding: 0 24px; }
      .legal-label { font-size: 11px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; color: var(--blue-600); margin-bottom: 12px; }
      .legal-title { font-family: 'Plus Jakarta Sans', sans-serif; font-size: clamp(1.8rem, 4vw, 2.6rem); font-weight: 800; color: var(--gray-900); margin-bottom: 10px; }
      .legal-updated { font-size: 13px; color: var(--gray-400); }
      .legal-body { max-width: 760px; margin: 0 auto; padding: 52px 24px 96px; }
      .legal-section { margin-bottom: 40px; }
      .legal-section-title { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1.1rem; font-weight: 700; color: var(--gray-900); margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid var(--blue-100); }
      .legal-section p { font-size: 15px; color: var(--gray-600); line-height: 1.8; margin-bottom: 12px; }
      .legal-section p:last-child { margin-bottom: 0; }
      .legal-section ul { padding-left: 20px; margin: 0; }
      .legal-section li { font-size: 15px; color: var(--gray-600); line-height: 1.8; margin-bottom: 6px; }
      .legal-contact { background: var(--blue-50); border: 1px solid var(--blue-200); border-radius: 16px; padding: 24px 28px; margin-top: 40px; }
      .legal-contact-title { font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 700; color: var(--gray-900); margin-bottom: 8px; }
      .legal-contact p { font-size: 14px; color: var(--gray-600); margin: 0; }
      .legal-contact a { color: var(--blue-600); }
    `}</style>
    <div className="legal-root">
      <div className="legal-hero">
        <div className="legal-hero-inner">
          <div className="legal-label">Legal</div>
          <h1 className="legal-title">{title}</h1>
          <div className="legal-updated">Last updated: March 2026</div>
        </div>
      </div>
      <div className="legal-body">
        {sections.map((s) => (
          <div className="legal-section" key={s.title}>
            <div className="legal-section-title">{s.title}</div>
            {s.content}
          </div>
        ))}
        <div className="legal-contact">
          <div className="legal-contact-title">Questions about this policy?</div>
          <p>Contact us at <a href="mailto:tokentraq@gmail.com">tokentraq@gmail.com</a> or write to us at Hindupur – Nimpalli Road, AP – 515201.</p>
        </div>
      </div>
    </div>
  </>
);

export const Terms = () => (
  <LegalPage
    title="Terms &amp; Conditions"
    sections={[
      {
        title: '1. Eligibility',
        content: <p>You must be at least 18 years old and capable of entering into a legally binding contract to use TokenWalla services. By using the platform, you confirm you meet these requirements.</p>,
      },
      {
        title: '2. Services',
        content: <p>TokenWalla provides hospital token booking services to reduce patient wait times and streamline outpatient management. TokenWalla is not a medical provider and is not responsible for medical outcomes.</p>,
      },
      {
        title: '3. Account responsibility',
        content: <p>You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. Notify us immediately of any unauthorized use.</p>,
      },
      {
        title: '4. Accurate information',
        content: <p>Users agree to provide accurate, current, and complete information while registering and booking. Misuse, false information, or fraudulent activity may lead to immediate account suspension.</p>,
      },
      {
        title: '5. Payments',
        content: <p>All payments on TokenWalla are processed via Razorpay and must comply with Razorpay's terms. Orders are only confirmed after successful payment. TokenWalla does not store card details.</p>,
      },
      {
        title: '6. KYC & verification',
        content: <p>By using TokenWalla, you consent to provide accurate identity documents as required by TokenWalla, Razorpay, or regulatory authorities. Non-compliance may result in service suspension. TokenWalla and its payment partners reserve the right to request additional documentation to comply with RBI guidelines and anti-money laundering regulations.</p>,
      },
      {
        title: '7. Prohibited conduct',
        content: (
          <ul>
            <li>Impersonating another person or entity</li>
            <li>Using the platform for emergency medical situations (call 108 instead)</li>
            <li>Attempting to circumvent payment or queue systems</li>
            <li>Any activity that violates Indian law</li>
          </ul>
        ),
      },
      {
        title: '8. Limitation of liability',
        content: <p>TokenWalla is not liable for any direct or indirect damages resulting from your use of the platform, including delays in medical care or hospital-side cancellations.</p>,
      },
      {
        title: '9. Governing law',
        content: <p>These terms are governed by the laws of India. Any disputes shall be subject to the exclusive jurisdiction of courts in Andhra Pradesh.</p>,
      },
    ]}
  />
);

export const Privacy = () => (
  <LegalPage
    title="Privacy Policy"
    sections={[
      {
        title: 'What we collect',
        content: (
          <ul>
            <li>Name, mobile number (required for registration)</li>
            <li>Booking history and appointment details</li>
            <li>Payment transaction IDs (processed via Razorpay — we never store card data)</li>
            <li>Device and browser information for analytics and security</li>
          </ul>
        ),
      },
      {
        title: 'How we use your information',
        content: (
          <ul>
            <li>To process bookings and issue tokens</li>
            <li>To send appointment reminders and status updates via OTP</li>
            <li>For internal analytics to improve the platform</li>
            <li>To comply with legal and regulatory requirements</li>
          </ul>
        ),
      },
      {
        title: 'Sharing of information',
        content: <p>We do not sell your personal information. We share data only as strictly necessary to fulfill your booking (e.g., with the hospital you booked with, and with Razorpay for payment processing).</p>,
      },
      {
        title: 'Data security & PCI DSS compliance',
        content: <p>TokenWalla uses SSL/TLS encryption for all data transmission. All payment processing is handled by Razorpay, a PCI DSS Level 1 certified gateway. We do not store, process, or transmit sensitive card information on our servers. We conduct regular security audits to maintain compliance with industry standards.</p>,
      },
      {
        title: 'Cookies',
        content: <p>Our website uses essential cookies to maintain your login session. We do not use tracking or advertising cookies.</p>,
      },
      {
        title: 'Your rights',
        content: <p>You may request access to, correction of, or deletion of your personal data at any time by contacting us at tokentraq@gmail.com. We will respond within 30 days.</p>,
      },
      {
        title: 'Regulatory compliance & monitoring',
        content: <p>By using TokenWalla, you consent to transaction monitoring and periodic audits conducted by TokenWalla, Razorpay, or authorized regulatory bodies to prevent fraud and ensure compliance with Indian laws and AML requirements. Suspicious activities may be reported to relevant authorities as required by law.</p>,
      },
    ]}
  />
);

export const Refund = () => (
  <LegalPage
    title="Refund Policy"
    sections={[
      {
        title: 'Cancellations',
        content: (
          <>
            <p>You may cancel a waiting booking directly from your "My Bookings" page. Cancellations must be requested at least 2 hours before your scheduled appointment slot.</p>
            <ul>
              <li>Refunds are processed within 5–7 business days to your original payment method</li>
              <li>Emergency cancellations due to documented medical reasons may be considered on a case-by-case basis</li>
              <li>No-shows without prior cancellation are non-refundable</li>
              <li>Processing fees may be deducted from refund amounts as per Razorpay's policy</li>
            </ul>
          </>
        ),
      },
      {
        title: 'Non-refundable situations',
        content: (
          <ul>
            <li>Bookings with status "In Consultation" or "Completed"</li>
            <li>Cancellation requested less than 2 hours before the slot</li>
            <li>No-shows without prior cancellation</li>
          </ul>
        ),
      },
      {
        title: 'Payment partner rights',
        content: <p>TokenWalla uses Razorpay as its payment partner. You acknowledge that Razorpay and TokenWalla reserve the right to suspend services, hold settlements, or restrict account access if there are compliance violations, suspicious activities, chargebacks, or requests from regulatory authorities.</p>,
      },
      {
        title: 'Business information',
        content: <p>TokenWalla is operated by tokentraq@gmail.com. Registered address: Hindupur – Nimpalli Road, AP – 515201. This service is intended for legitimate outpatient appointment booking only and not for emergency medical situations. For medical emergencies, call 108.</p>,
      },
    ]}
  />
);

export default Terms;