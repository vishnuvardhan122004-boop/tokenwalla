const Refund = () => {
  return (
    <div className="container py-5" style={{ maxWidth: 760, fontFamily: 'DM Sans, sans-serif' }}>
      <h2 className="fw-bold mb-1" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Refund Policy</h2>
      <p className="text-muted mb-4" style={{ fontSize: 13 }}>Last updated: March 2026</p>

      {[
        {
          title: 'Cancellations',
          body: 'You may cancel a waiting booking from your "My Bookings" page at least 2 hours before your scheduled slot. Refunds are processed within 5–7 business days to your original payment method.',
        },
        {
          title: 'Non-refundable situations',
          body: 'Bookings with status "In Consultation" or "Completed", cancellations made less than 2 hours before the slot, and no-shows without prior cancellation are non-refundable.',
        },
        {
          title: 'Emergency cancellations',
          body: 'Emergency cancellations due to documented medical reasons may be considered on a case-by-case basis. Contact tokentraq@gmail.com with documentation.',
        },
        {
          title: 'Payment partner rights',
          body: 'TokenWalla uses Razorpay as its payment partner. Razorpay and TokenWalla reserve the right to hold settlements or restrict account access in cases of compliance violations or chargebacks.',
        },
        {
          title: 'Important notice',
          body: 'This service is for legitimate outpatient appointment booking only — not for medical emergencies. For emergencies, call 108.',
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
        {' '}· Address: Hindupur – Nimpalli Road, AP – 515201
      </div>
    </div>
  );
};
export default Refund;