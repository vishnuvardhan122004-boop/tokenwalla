import { useState } from 'react';

const WHATSAPP_NUMBER = '919000000001'; // Replace with real support number

const Contact = () => {
  const [form, setForm]       = useState({ name: '', mobile: '', subject: '', message: '' });
  const [loading, setLoading] = useState(false);
  const [status, setStatus]   = useState(null); // { type: 'success'|'error', msg }

  const handleChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const submitHandler = async (e) => {
    e.preventDefault();
    if (!form.name || !form.mobile || !form.message) {
      setStatus({ type: 'error', msg: 'Please fill all required fields.' });
      return;
    }
    if (!/^[6-9]\d{9}$/.test(form.mobile)) {
      setStatus({ type: 'error', msg: 'Enter a valid 10-digit Indian mobile number.' });
      return;
    }
    setLoading(true);
    setStatus(null);
    try {
      // Send via WhatsApp deep-link as primary channel
      // (Replace with real email API e.g. EmailJS / backend endpoint when available)
      const text = encodeURIComponent(
        `*TokenWalla Support Request*\n\nName: ${form.name}\nMobile: ${form.mobile}\nSubject: ${form.subject || 'General'}\n\n${form.message}`
      );
      // Silently attempt a mailto fallback for non-mobile
      const mailSubject = encodeURIComponent(`[TokenWalla] ${form.subject || 'Support Request'}`);
      const mailBody = encodeURIComponent(
        `Name: ${form.name}\nMobile: ${form.mobile}\n\n${form.message}`
      );
      window.open(
        `mailto:tokentraq@gmail.com?subject=${mailSubject}&body=${mailBody}`,
        '_blank'
      );

      setStatus({
        type: 'success',
        msg: "Your message has been prepared. If a new window didn't open, please email tokentraq@gmail.com directly.",
      });
      setForm({ name: '', mobile: '', subject: '', message: '' });
    } catch {
      setStatus({ type: 'error', msg: 'Something went wrong. Please email us directly.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        .ct-root {
          font-family: 'DM Sans', sans-serif;
          background: linear-gradient(160deg, #F4F9FF 0%, #EAF3FF 60%, #F8FBFF 100%);
          min-height: 100vh; padding: 72px 0 96px;
        }
        .ct-hero { text-align: center; margin-bottom: 52px; }
        .ct-label { font-size: 11px; font-weight: 600; letter-spacing: 2.5px; text-transform: uppercase; color: var(--blue-600); margin-bottom: 12px; }
        .ct-title { font-family: 'Plus Jakarta Sans', sans-serif; font-size: clamp(2rem, 4vw, 2.8rem); font-weight: 800; color: var(--gray-900); margin-bottom: 12px; }
        .ct-sub { font-size: 16px; color: var(--gray-500); max-width: 500px; margin: 0 auto; line-height: 1.7; }

        .ct-grid { display: grid; grid-template-columns: 1fr 1.6fr; gap: 32px; max-width: 900px; margin: 0 auto; padding: 0 20px; }

        .ct-info-card {
          background: #fff; border: 1px solid var(--blue-100);
          border-radius: 22px; padding: 32px; box-shadow: var(--shadow-sm);
        }
        .ct-info-title { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1rem; font-weight: 700; color: var(--gray-900); margin-bottom: 22px; }
        .ct-contact-item {
          display: flex; align-items: flex-start; gap: 14px; margin-bottom: 22px;
        }
        .ct-icon {
          width: 42px; height: 42px; border-radius: 12px; flex-shrink: 0;
          background: var(--blue-50); border: 1px solid var(--blue-200);
          display: flex; align-items: center; justify-content: center; font-size: 18px;
        }
        .ct-contact-label { font-size: 11px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; color: var(--gray-400); margin-bottom: 3px; }
        .ct-contact-value { font-size: 14px; font-weight: 500; color: var(--gray-800); }
        .ct-contact-value a { color: var(--blue-600); text-decoration: none; }
        .ct-contact-value a:hover { color: var(--blue-800); }
        .ct-hours { margin-top: 28px; padding-top: 22px; border-top: 1px solid var(--blue-50); }
        .ct-hours-row { display: flex; justify-content: space-between; font-size: 13px; color: var(--gray-500); padding: 5px 0; }
        .ct-hours-day { font-weight: 500; color: var(--gray-700); }

        .ct-wa-btn {
          display: flex; align-items: center; justify-content: center; gap: 10px;
          width: 100%; padding: 13px;
          background: #25D366; color: #fff; border: none; border-radius: 12px;
          font-family: 'DM Sans', sans-serif; font-size: 14px; font-weight: 600;
          cursor: pointer; text-decoration: none; margin-top: 22px;
          transition: all 0.2s;
        }
        .ct-wa-btn:hover { background: #1ebe5a; transform: translateY(-1px); color: #fff; }

        .ct-form-card {
          background: #fff; border: 1px solid var(--blue-100);
          border-radius: 22px; padding: 36px; box-shadow: var(--shadow-sm);
        }
        .ct-form-title { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1.1rem; font-weight: 700; color: var(--gray-900); margin-bottom: 6px; }
        .ct-form-sub { font-size: 14px; color: var(--gray-500); margin-bottom: 28px; }

        .ct-field { margin-bottom: 18px; }
        .ct-field label { font-size: 12px; font-weight: 600; letter-spacing: 0.3px; color: var(--gray-600); display: block; margin-bottom: 7px; }
        .ct-input {
          width: 100%; background: var(--gray-50); border: 1px solid var(--blue-100);
          border-radius: 11px; padding: 12px 14px;
          font-family: 'DM Sans', sans-serif; font-size: 14px; color: var(--gray-900);
          outline: none; transition: all 0.15s;
        }
        .ct-input::placeholder { color: var(--gray-400); }
        .ct-input:focus { border-color: var(--blue-400); background: #fff; box-shadow: 0 0 0 3px rgba(55,138,221,0.12); }
        .ct-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }

        .ct-alert {
          padding: 12px 16px; border-radius: 11px; font-size: 14px;
          margin-bottom: 18px; line-height: 1.5;
        }
        .ct-alert.success { background: var(--color-success-bg); color: var(--color-success-text); border: 1px solid var(--color-success-border); }
        .ct-alert.error   { background: var(--color-error-bg);   color: var(--color-error-text);   border: 1px solid var(--color-error-border); }

        .ct-submit {
          width: 100%; padding: 14px;
          background: var(--blue-600); color: #fff; border: none; border-radius: 12px;
          font-family: 'DM Sans', sans-serif; font-size: 15px; font-weight: 600;
          cursor: pointer; transition: all 0.2s; box-shadow: var(--shadow-sm);
        }
        .ct-submit:hover:not(:disabled) { background: var(--blue-800); transform: translateY(-1px); }
        .ct-submit:disabled { opacity: 0.55; cursor: not-allowed; }

        @media (max-width: 720px) {
          .ct-grid { grid-template-columns: 1fr; }
          .ct-row  { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="ct-root">
        <div className="ct-hero">
          <div className="ct-label">Get in touch</div>
          <h1 className="ct-title">Contact Us</h1>
          <p className="ct-sub">We're here to help. Reach out and we'll get back to you as soon as possible.</p>
        </div>

        <div className="ct-grid">
          {/* Info panel */}
          <div className="ct-info-card">
            <div className="ct-info-title">Contact Information</div>

            <div className="ct-contact-item">
              <div className="ct-icon">📧</div>
              <div>
                <div className="ct-contact-label">Email</div>
                <div className="ct-contact-value">
                  <a href="mailto:tokentraq@gmail.com">tokentraq@gmail.com</a>
                </div>
              </div>
            </div>

            <div className="ct-contact-item">
              <div className="ct-icon">📞</div>
              <div>
                <div className="ct-contact-label">Phone</div>
                <div className="ct-contact-value">
                  <a href="tel:+919000000001">+91-9000000001</a>
                </div>
              </div>
            </div>

            <div className="ct-contact-item">
              <div className="ct-icon">🏢</div>
              <div>
                <div className="ct-contact-label">Office</div>
                <div className="ct-contact-value">Hindupur – Nimpalli Road<br />AP – 515201</div>
              </div>
            </div>

            <div className="ct-hours">
              <div className="ct-contact-label" style={{ marginBottom: 10 }}>Support hours</div>
              {[
                { day: 'Mon – Fri', time: '9:00 AM – 6:00 PM' },
                { day: 'Saturday',  time: '9:00 AM – 1:00 PM' },
                { day: 'Sunday',    time: 'Closed' },
              ].map((h) => (
                <div className="ct-hours-row" key={h.day}>
                  <span className="ct-hours-day">{h.day}</span>
                  <span>{h.time}</span>
                </div>
              ))}
            </div>

            <a
              href={`https://wa.me/${WHATSAPP_NUMBER}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ct-wa-btn"
            >
              <span style={{ fontSize: 20 }}>💬</span>
              Chat on WhatsApp
            </a>
          </div>

          {/* Form panel */}
          <div className="ct-form-card">
            <div className="ct-form-title">Send us a message</div>
            <div className="ct-form-sub">We typically reply within 24 hours on business days.</div>

            {status && (
              <div className={`ct-alert ${status.type}`}>
                {status.type === 'success' ? '✅ ' : '⚠️ '}{status.msg}
              </div>
            )}

            <form onSubmit={submitHandler} noValidate>
              <div className="ct-row">
                <div className="ct-field">
                  <label>Your Name *</label>
                  <input className="ct-input" name="name" type="text" placeholder="Full name"
                    value={form.name} onChange={handleChange} />
                </div>
                <div className="ct-field">
                  <label>Mobile *</label>
                  <input className="ct-input" name="mobile" type="tel" placeholder="10-digit number"
                    value={form.mobile} onChange={handleChange} maxLength={10} />
                </div>
              </div>

              <div className="ct-field">
                <label>Subject</label>
                <input className="ct-input" name="subject" type="text" placeholder="What is this about?"
                  value={form.subject} onChange={handleChange} />
              </div>

              <div className="ct-field">
                <label>Message *</label>
                <textarea className="ct-input" name="message" rows={5} placeholder="Describe your issue or question..."
                  value={form.message} onChange={handleChange}
                  style={{ resize: 'vertical', minHeight: 120 }}
                />
              </div>

              <button className="ct-submit" type="submit" disabled={loading}>
                {loading ? '⏳ Sending…' : 'Send Message →'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
};

export default Contact;