const Privacy = () => {
  return (
    <div className="container py-5" style={{ maxWidth: 760, fontFamily: 'DM Sans, sans-serif' }}>
      <h2 className="fw-bold mb-1" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Privacy Policy</h2>
      <p className="text-muted mb-4" style={{ fontSize: 13 }}>Last updated: March 2026</p>

      {[
        {
          title: 'What we collect',
          body: 'We collect your name, mobile number, booking history, and payment transaction IDs. Payments are processed via Razorpay — we never store card data.',
        },
        {
          title: 'How we use your information',
          body: 'To process bookings and issue tokens, send OTP-based appointment reminders, improve our platform through analytics, and comply with legal requirements.',
        },
        {
          title: 'Sharing of information',
          body: 'We do not sell your personal information. Data is shared only as necessary to fulfill your booking — with the hospital you booked with and Razorpay for payment processing.',
        },
        {
          title: 'Data security & PCI DSS compliance',
          body: 'TokenWalla uses SSL/TLS encryption for all data transmission. Payments are handled by Razorpay, a PCI DSS Level 1 certified gateway. We conduct regular security audits.',
        },
        {
          title: 'Cookies',
          body: 'We use essential cookies only to maintain your login session. We do not use tracking or advertising cookies.',
        },
        {
          title: 'Your rights',
          body: 'You may request access, correction, or deletion of your personal data at any time by contacting tokentraq@gmail.com. We will respond within 30 days.',
        },
      ].map(s => (
        <div key={s.title} className="mb-4">
          <h6 className="fw-bold" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', color: '#185FA5' }}>{s.title}</h6>
          <p className="text-muted">{s.body}</p>
        </div>
      ))}

      <div className="p-3 rounded" style={{ background: '#E6F1FB', border: '1px solid #B5D4F4', marginTop: 32 }}>
        <strong>Questions?</strong> Email us at{' '}
        <a href="mailto:tokentraq@gmail.com" style={{ color: '#185FA5' }}>tokentraq@gmail.com</a>
      </div>
    </div>
  );
};
export default Privacy;