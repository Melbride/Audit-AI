import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login, requestPasswordReset } from "../services/api";
const colors = {
  primary: "#2563EB",
  secondary: "#2563EB",
  accent: "#7C3AED",
  background: "#FFFFFF",
  white: "#FFFFFF",
  text: "#FFFFFF",
  success: "#27AE60",
  warning: "#EAB308",
  danger: "#E74C3C",
};

export default function Login({ onLogin }) {
  const navigate = useNavigate();

  const [view, setView] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [message, setMessage] = useState("");
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await login({ email, password });
      const data = res.data;
      if (data.access_token) {
        localStorage.setItem("token", data.access_token);
        localStorage.setItem("user", JSON.stringify(data.user));
        onLogin(data.user);
        navigate("/dashboard");
      } else {
        setError(data.detail || "Invalid email or password");
      }
    } catch (err) {
      setError(err.response?.data?.detail || "Could not connect to server. Make sure backend is running.");
    }
    setLoading(false);
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await requestPasswordReset(resetEmail);
      setShowSuccessModal(true);
      setMessage("");
      setError("");
    } catch (err) {
      setError(err.response?.data?.detail || "Could not connect to server.");
    }
    setLoading(false);
  };

  const inputStyle = {
    width: "100%",
    padding: "12px 14px",
    border: "1.5px solid #E5E7EB",
    borderRadius: "8px",
    fontSize: "14px",
    color: colors.primary,
    outline: "none",
    boxSizing: "border-box",
  };

  const labelStyle = {
    display: "block",
    fontSize: "13px",
    fontWeight: "600",
    color: colors.primary,
    marginBottom: "6px",
  };

  const btnStyle = {
    width: "100%",
    padding: "13px",
    background: colors.accent,
    color: colors.white,
    border: "none",
    borderRadius: "8px",
    fontSize: "15px",
    fontWeight: "600",
    cursor: "pointer",
    marginBottom: "16px",
  };

  return (
    <div style={{ minHeight: "100vh", background: colors.background, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", fontFamily: "'Segoe UI', sans-serif", boxSizing: "border-box" }}>
      <div style={{ width: "100%", maxWidth: "460px", background: colors.white, padding: "44px 40px", borderRadius: "16px", boxShadow: "0 20px 60px rgba(15,23,42,0.10)", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", marginBottom: "32px" }}>
          <img src="/csa-logo.png" alt="Audit AI logo" style={{ width: "64px", height: "64px", objectFit: "contain" }} />
          <span style={{ fontSize: "22px", fontWeight: "700", color: colors.primary }}>Audit AI</span>
        </div>

        {error && (
          <div style={{ background: "#fdecea", border: `1px solid ${colors.danger}`, color: colors.danger, padding: "12px 16px", borderRadius: "8px", fontSize: "13px", marginBottom: "20px" }}>{error}</div>
        )}

        {view === "login" && (
          <>
            <h3 style={{ fontSize: "24px", fontWeight: "700", color: colors.primary, marginBottom: "8px", textAlign: "center" }}>Welcome back</h3>
            <p style={{ fontSize: "14px", color: "#64748B", marginBottom: "32px", textAlign: "center" }}>Sign in to your Audit AI account</p>
            <form onSubmit={handleLogin}>
              <div style={{ marginBottom: "20px" }}>
                <label style={labelStyle}>Email Address</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@auditai.com" required style={inputStyle} />
              </div>
              <div style={{ marginBottom: "12px" }}>
                <label style={labelStyle}>Password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" required style={inputStyle} />
              </div>
              <div style={{ textAlign: "right", marginBottom: "24px" }}>
                <span onClick={() => { setView("forgot"); setError(""); setMessage(""); }} style={{ fontSize: "13px", color: colors.accent, cursor: "pointer", fontWeight: "500" }}>Forgot password?</span>
              </div>
              <button type="submit" disabled={loading} style={btnStyle}>{loading ? "Signing in..." : "Sign In"}</button>
            </form>
          </>
        )}

        {view === "forgot" && (
          <>
            <h3 style={{ fontSize: "24px", fontWeight: "700", color: colors.primary, marginBottom: "8px", textAlign: "center" }}>Reset your password</h3>
            <p style={{ fontSize: "14px", color: "#64748B", marginBottom: "32px", textAlign: "center" }}>Enter your email address and we'll send you a link to reset your password.</p>
            <form onSubmit={handleForgot}>
              <div style={{ marginBottom: "24px" }}>
                <label style={labelStyle}>Email Address</label>
                <input type="email" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} placeholder="you@auditai.com" required style={inputStyle} />
              </div>
              <button type="submit" disabled={loading} style={btnStyle}>{loading ? "Sending..." : "Send Reset Link"}</button>
              <div style={{ textAlign: "center" }}>
                <span onClick={() => { setView("login"); setError(""); }} style={{ fontSize: "13px", color: colors.accent, cursor: "pointer" }}>Back to login</span>
              </div>
            </form>
          </>
        )}
      </div>

      {showSuccessModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "24px",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              background: "#fff",
              width: "420px",
              maxWidth: "100%",
              borderRadius: "16px",
              padding: "36px",
              textAlign: "center",
              boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
              boxSizing: "border-box",
            }}
          >
            <div
              style={{
                width: "70px",
                height: "70px",
                margin: "0 auto 20px",
                borderRadius: "50%",
                background: "#ECFDF5",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "34px",
                color: colors.success,
              }}
            >
              ✓
            </div>

            <h2 style={{ color: colors.primary, marginBottom: "12px" }}>
              Password Reset Link Sent
            </h2>

            <p style={{ color: "#64748B", fontSize: "14px", lineHeight: "1.7", marginBottom: "10px" }}>
              We've sent a password reset link to:
            </p>

            <p style={{ fontWeight: "600", color: colors.primary, marginBottom: "18px" }}>
              {resetEmail}
            </p>

            <p style={{ color: "#64748B", fontSize: "13px", lineHeight: "1.6", marginBottom: "28px" }}>
              Please check your inbox and follow the instructions to create a new password.
              <br />
              <br />
              If you don't see the email, check your Spam or Junk folder.
            </p>

            <button
              style={btnStyle}
              onClick={() => {
                setShowSuccessModal(false);
                setView("login");
                setResetEmail("");
              }}
            >
              Back to Login
            </button>
          </div>
        </div>
      )}
    </div>
  );
}