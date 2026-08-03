import { useState } from "react";
import type { FormEvent } from "react";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;

    setError("");
    setIsSubmitting(true);

    try {
      await login(email, password);
      navigate("/dashboard");
    } catch (err) {
      if (axios.isAxiosError(err) && typeof err.response?.data?.message === "string") {
        setError(err.response.data.message);
        return;
      }

      if (axios.isAxiosError(err) && err.code === "ECONNABORTED") {
        setError("Sign in request timed out. Please check if the server is running and try again.");
        return;
      }

      if (axios.isAxiosError(err) && !err.response) {
        setError("Unable to reach the server. Please try again in a moment.");
        return;
      }

      setError("Invalid login credentials.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-page login-page">
      <div className="auth-card login-card login-card-split">
        <aside className="login-hero">
          <p className="login-kicker">University of Bohol Taekwondo</p>
          <h1>Discipline. Respect. Victory.</h1>
          <p className="login-tagline">
            The official management platform for the UB Taekwondo Team. Track attendance, log tournament performance,
            celebrate achievements, and follow every athlete&apos;s journey.
          </p>

          <div className="login-badges">
            <span>Attendance Tracking</span>
            <span>Match Analytics</span>
            <span>Athlete Progress</span>
          </div>

          <div className="login-stats">
            <div>
              <strong>01</strong>
              <span>Clear dashboard for coaches</span>
            </div>
            <div>
              <strong>02</strong>
              <span>Fast access for athletes</span>
            </div>
            <div>
              <strong>03</strong>
              <span>One place for progress and records</span>
            </div>
          </div>
        </aside>

        <section className="login-form-card">
          <div className="login-form-header">
            <p className="login-kicker dark">Welcome Back</p>
            <h2>Sign in to continue</h2>
            <p>Access attendance, tournaments, rankings, and athlete records in one clean view.</p>
          </div>

          <form onSubmit={handleSubmit} className="form-grid login-form-grid">
            <label>Email<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required /></label>
            <label>Password<input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required /></label>
            {error ? <p className="error">{error}</p> : null}
            <button className="btn-primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Signing In..." : "Sign In"}
            </button>
          </form>

          <div className="login-links">
            <p><Link to="/forgot-password">Forgot password?</Link></p>
            <p>New athlete? <Link to="/register">Create account</Link></p>
          </div>
        </section>
      </div>
    </div>
  );
}
