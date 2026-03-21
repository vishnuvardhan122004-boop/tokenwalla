const Privacy = () => {
  return (
    <div className="container py-5">
      <h2>Privacy Policy</h2>
      <p>
        What We Collect: Name, email, phone number, address (when you register or place orders), payment information (processed securely via Razorpay), and device/browser information for analytics.

How We Use Your Information: To process your orders and deliver services, communicate important updates and offers, for internal analytics and improvements, and to comply with legal requirements.

Sharing of Information: We do not sell or share your personal information except as necessary to fulfill your order (e.g., with payment processors and delivery partners).

Data Security and PCI DSS Compliance: TokenWalla uses SSL/TLS encryption for all data transmission. All payment processing is handled by Razorpay, a PCI DSS Level 1 certified payment gateway. TokenWalla does not store, process, or transmit sensitive card information on our servers. We implement multi-factor authentication for administrative access and conduct regular security audits to maintain compliance with industry standards and regulatory requirements.

Cookies: Our website may use cookies to enhance user experience and for analytics.

Access & Correction: You may request access or corrections to your information anytime by contacting us.


      </p>
    </div>
  );
};
export default Privacy;