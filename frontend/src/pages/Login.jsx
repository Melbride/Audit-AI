import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login, requestPasswordReset, confirmPasswordReset } from "../services/api";

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
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
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
      const res = await requestPasswordReset(resetEmail);
      setMessage(res.data.message || "Reset link sent. Check your email.");
    } catch (err) {
      setError(err.response?.data?.detail || "Could not connect to server.");
    }
    setLoading(false);
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await confirmPasswordReset(resetToken, newPassword);
      const data = res.data;
      if (data.message) {
        setMessage("Password reset successful! You can now log in.");
        setView("login");
      } else {
        setError(data.detail || "Reset failed. Token may have expired.");
      }
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
        {message && (
          <div style={{ background: "#eafaf1", border: `1px solid ${colors.success}`, color: colors.success, padding: "12px 16px", borderRadius: "8px", fontSize: "13px", marginBottom: "20px" }}>{message}</div>
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
            <p style={{ fontSize: "14px", color: "#64748B", marginBottom: "32px", textAlign: "center" }}>Enter your email to receive a reset token</p>
            <form onSubmit={handleForgot}>
              <div style={{ marginBottom: "24px" }}>
                <label style={labelStyle}>Email Address</label>
                <input type="email" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} placeholder="you@auditai.com" required style={inputStyle} />
              </div>
              <button type="submit" disabled={loading} style={btnStyle}>{loading ? "Sending..." : "Send Reset Token"}</button>
              <div style={{ textAlign: "center" }}>
                <span onClick={() => { setView("login"); setError(""); }} style={{ fontSize: "13px", color: colors.accent, cursor: "pointer" }}>Back to login</span>
              </div>
            </form>
          </>
        )}

        {view === "reset" && (
          <>
            <h3 style={{ fontSize: "24px", fontWeight: "700", color: colors.primary, marginBottom: "8px", textAlign: "center" }}>Set new password</h3>
            <p style={{ fontSize: "14px", color: "#64748B", marginBottom: "32px", textAlign: "center" }}>Enter your reset token and new password</p>
            <form onSubmit={handleReset}>
              <div style={{ marginBottom: "20px" }}>
                <label style={labelStyle}>Reset Token</label>
                <input type="text" value={resetToken} onChange={(e) => setResetToken(e.target.value)} placeholder="Paste your reset token" required style={inputStyle} />
              </div>
              <div style={{ marginBottom: "24px" }}>
                <label style={labelStyle}>New Password</label>
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Enter new password" required style={inputStyle} />
              </div>
              <button type="submit" disabled={loading} style={btnStyle}>{loading ? "Resetting..." : "Reset Password"}</button>
              <div style={{ textAlign: "center" }}>
                <span onClick={() => { setView("login"); setError(""); setMessage(""); }} style={{ fontSize: "13px", color: colors.accent, cursor: "pointer" }}>Back to login</span>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}



