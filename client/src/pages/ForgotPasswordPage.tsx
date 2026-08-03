import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    setError("");
    setResetToken("");

    try {
      const { data } = await api.post("/auth/forgot-password", { email });
      setMessage(data.message ?? "If the account exists, a reset token was issued.");
      if (typeof data.resetToken === "string") {
        setResetToken(data.resetToken);
      }
    } catch {
      setError("Could not process request.");
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Forgot Password</h1>
        <form className="form-grid" onSubmit={submit}>
          <label>
            Email
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          {error ? <p className="error">{error}</p> : null}
          {message ? <p className="success">{message}</p> : null}
          {resetToken ? <p className="token-box">Reset Token: {resetToken}</p> : null}
          <button className="btn-primary" type="submit">Request Reset Token</button>
        </form>
        <p>
          Have a token already? <Link to="/reset-password">Reset password here</Link>
        </p>
        <p>
          Back to <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
