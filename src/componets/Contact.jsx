import { useState } from "react";

const Contact = () => {

  const [form, setForm] = useState({
    name: "",
    mobile: "",
    message: ""
  });

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");

  const handleChange = (e) => {
    setForm(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const submitHandler = async (e) => {
    e.preventDefault();

    if (!form.name || !form.mobile || !form.message) {
      setSuccess("Please fill all fields");
      return;
    }

    setLoading(true);
    setSuccess("");

    try {
      // Replace with real API later
      console.log("Contact Form:", form);

      setSuccess("Your message has been sent successfully!");
      setForm({ name: "", mobile: "", message: "" });

    } catch {
      setSuccess("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container py-5">

      <h2 className="mb-3 text-center">Contact Us</h2>
      <p className="text-muted text-center mb-4">
        Need help? Our team is here for you.
      </p>

      <div className="row justify-content-center">
        <div className="col-md-6">

          <form onSubmit={submitHandler} className="card shadow-sm p-4">

            {success && (
              <div className="alert alert-info">
                {success}
              </div>
            )}

            <div className="mb-3">
              <label className="form-label">Name</label>
              <input
                type="text"
                className="form-control"
                name="name"
                value={form.name}
                onChange={handleChange}
              />
            </div>

            <div className="mb-3">
              <label className="form-label">Mobile</label>
              <input
                type="tel"
                className="form-control"
                name="mobile"
                value={form.mobile}
                onChange={handleChange}
              />
            </div>

            <div className="mb-3">
              <label className="form-label">Message</label>
              <textarea
                className="form-control"
                name="message"
                rows="4"
                value={form.message}
                onChange={handleChange}
              />
            </div>

            <button className="btn btn-primary w-100" disabled={loading}>
              {loading ? "Sending..." : "Send Message"}
            </button>

          </form>

        </div>
      </div>

    </div>
  );
};

export default Contact;