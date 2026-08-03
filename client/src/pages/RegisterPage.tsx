import { useState } from "react";
import type { FormEvent } from "react";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { BELT_RANKS } from "../types";

export function RegisterPage() {
  const { registerAthlete } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    studentId: "",
    contactNumber: "",
    address: "",
    emergencyContact: "",
    beltRank: BELT_RANKS[0] as string
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;

    setError("");
    setSuccess("");
    setIsSubmitting(true);

    try {
      const result = await registerAthlete(form);
      setSuccess(result.message || "Your account is pending coach verification. Please wait for approval before signing in.");
      setForm({
        fullName: "",
        email: "",
        password: "",
        studentId: "",
        contactNumber: "",
        address: "",
        emergencyContact: "",
        beltRank: BELT_RANKS[0] as string
      });
      setTimeout(() => navigate("/login"), 2200);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        if (err.code === "ECONNABORTED") {
          setError("Registration timed out. Please check if the server is running and try again.");
          return;
        }

        if (!err.response) {
          setError("Cannot reach server. Refresh the page and try again. If it persists, restart dev servers.");
          return;
        }

        const message = typeof err.response?.data?.message === "string"
          ? err.response.data.message
          : "Registration failed. Check your data and try again.";
        setError(message);
        return;
      }

      setError("Registration failed. Check your data and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card large">
        <h1>Athlete Registration</h1>
        <form onSubmit={handleSubmit} className="form-grid two-col">
          <label>Full Name<input required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></label>
          <label>Email<input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          <label>Password<input required minLength={8} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
          <label>Student ID<input required value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })} /></label>
          <label>Contact Number<input required value={form.contactNumber} onChange={(e) => setForm({ ...form, contactNumber: e.target.value })} /></label>
          <label>Address<input required value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
          <label>Emergency Contact<input required value={form.emergencyContact} onChange={(e) => setForm({ ...form, emergencyContact: e.target.value })} /></label>
          <label>Belt Rank
            <select value={form.beltRank} onChange={(e) => setForm({ ...form, beltRank: e.target.value })}>
              {BELT_RANKS.map((rank) => <option key={rank}>{rank}</option>)}
            </select>
          </label>
          {error ? <p className="error full">{error}</p> : null}
          {success ? <p className="success full">{success}</p> : null}
          <button className="btn-primary full" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Registering..." : "Register Athlete"}
          </button>
        </form>
        <p>After registering, wait for coach verification before signing in.</p>
        <p>Already have an account? <Link to="/login">Sign in</Link></p>
      </div>
    </div>
  );
}
