import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tokenFromUrl = searchParams.get("token");
  const [token, setToken] = useState(tokenFromUrl ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");

    try {
      await api.post("/auth/reset-password", { token, password });
      setMessage("Password reset successful. Redirecting to login...");
      setTimeout(() => navigate("/login"), 1200);
    } catch {
      setError("Invalid or expired token.");
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Reset Password</h1>
        <form className="form-grid" onSubmit={submit}>
          {!tokenFromUrl ? (
            <label>
              Reset Token
              <input required value={token} onChange={(e) => setToken(e.target.value)} />
            </label>
          ) : null}
          <label>
            New Password
            <input required type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error ? <p className="error">{error}</p> : null}
          {message ? <p className="success">{message}</p> : null}
          <button className="btn-primary" type="submit">Set New Password</button>
        </form>
        <p>
          Need a token? <Link to="/forgot-password">Request one</Link>
        </p>
      </div>
    </div>
  );
}
