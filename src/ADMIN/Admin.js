// ADMIN/Admin.js
import { useState } from "react";
import { useNavigate } from "react-router";
import API from "../services/api";

const Admin = () => {
  const [details, setDetails] = useState({ mobile: "", password: "" });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const submitHandler = async (e) => {
    e.preventDefault();
    if (!details.mobile || !details.password) {
      alert("Enter mobile & password");
      return;
    }
    setLoading(true);
    try {
      const { data } = await API.post("/auth/login/", details);
      // FIX: Check role correctly — UserSerializer sends "role" field
      if (data.user?.role !== "admin") {
        alert("Not authorized as admin");
        return;
      }
      localStorage.setItem("access", data.access);
      localStorage.setItem("refresh", data.refresh);
      localStorage.setItem("user", JSON.stringify(data.user));
      // FIX: Navigate to a default child route so Outlet renders something
      navigate("/Adashboard/user-management");
    } catch (err) {
      alert(err?.response?.data?.message || "Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container py-5">
      <div className="col-md-5 mx-auto shadow p-4 bg-white rounded">
        <div className="text-center mb-4">
          <img src="/logo.png" alt="TokenWalla"
            style={{ width: "48px", borderRadius: "12px", marginBottom: "10px" }} />
          <h3 className="mb-0">Admin Login</h3>
          <small className="text-muted">Restricted access</small>
        </div>
        <form onSubmit={submitHandler}>
          <input type="text" className="form-control mb-3"
            placeholder="Mobile Number"
            value={details.mobile}
            onChange={(e) => setDetails({ ...details, mobile: e.target.value })}
          />
          <input type="password" className="form-control mb-3"
            placeholder="Password"
            value={details.password}
            onChange={(e) => setDetails({ ...details, password: e.target.value })}
          />
          <button className="btn btn-primary w-100" disabled={loading}>
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Admin;