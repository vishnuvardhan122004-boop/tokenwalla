const Terms = () => {
  return (
    <div className="container py-5" style={{ maxWidth: 760, fontFamily: 'DM Sans, sans-serif' }}>
      <h2 className="fw-bold mb-1" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Terms &amp; Conditions</h2>
      <p className="text-muted mb-4" style={{ fontSize: 13 }}>Last updated: March 2026</p>

      {[
        { title: '1. Eligibility', body: 'You must be at least 18 years old and capable of entering into a legally binding contract to use TokenWalla services.' },
        { title: '2. Services', body: 'TokenWalla provides hospital token booking services to reduce patient wait times. We are not a medical provider and are not responsible for medical outcomes.' },
        { title: '3. Account responsibility', body: 'You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.' },
        { title: '4. Accurate information', body: 'Users agree to provide accurate, current, and complete information while registering and booking. Misuse or false information may lead to account suspension.' },
        { title: '5. Payments', body: 'All payments are processed via Razorpay. Orders are confirmed only after successful payment. TokenWalla does not store card details.' },
        { title: '6. KYC & verification', body: 'By using TokenWalla, you consent to provide identity documents as required by TokenWalla, Razorpay, or regulatory authorities to comply with RBI guidelines and anti-money laundering regulations.' },
        { title: '7. Limitation of liability', body: 'TokenWalla is not liable for any direct or indirect damages resulting from your use of the platform, including delays in medical care or hospital-side cancellations.' },
        { title: '8. Governing law', body: 'These terms are governed by the laws of India. Disputes are subject to the exclusive jurisdiction of courts in Andhra Pradesh.' },
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
export default Terms;