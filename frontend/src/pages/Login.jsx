import { useState } from "react";
import API from "../api";

// ============================================================
// Login.jsx — Audit AI Login Page
// Handles 3 views:
// 1. Login form (default)
// 2. Forgot password form
// 3. Reset password form
// ============================================================

// Color theme
const colors = {
  primary:    "#1E3A5F",  // dark navy - left panel, buttons
  secondary:  "#2E86C1",  // medium blue - links
  accent:     "#3498DB",  // bright blue - logo, highlights
  background: "#F4F6F9",  // light grey - page background
  white:      "#FFFFFF",  // cards, panels
  text:       "#2C3E50",  // dark grey - body text
  success:    "#27AE60",  // green - success messages
  warning:    "#F39C12",  // orange - warnings
  danger:     "#E74C3C",  // red - error messages
};

export default function Login({ onLogin }) {
  // STATE 
  const [view, setView] = useState("login"); // which form to show
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState(""); // success message
  const [error, setError] = useState("");     // error message
  const [loading, setLoading] = useState(false);

  //  LOGIN HANDLER 
  // Called when user submits the login form
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await API.login({ email, password });
      if (res.access_token) {
        // Save token and user info to browser storage
        localStorage.setItem("token", res.access_token);
        localStorage.setItem("user", JSON.stringify(res.user));
        onLogin(res.user); // tell App.jsx user is logged in
      } else {
        setError(res.detail || "Invalid email or password");
      }
    } catch {
      setError("Could not connect to server. Make sure backend is running.");
    }
    setLoading(false);
  };

  // FORGOT PASSWORD HANDLER 
  // Called when user submits the forgot password form
  const handleForgot = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await API.requestPasswordReset(resetEmail);
      if (res.token) {
        setResetToken(res.token);
        setMessage("Token generated. Enter it below with your new password.");
        setView("reset");
      } else {
        setError(res.detail || "Email not found");
      }
    } catch {
      setError("Could not connect to server.");
    }
    setLoading(false);
  };

  // RESET PASSWORD HANDLER 
  // Called when user submits the new password form
  const handleReset = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await API.confirmPasswordReset(resetToken, newPassword);
      if (res.message) {
        setMessage("Password reset successful! You can now log in.");
        setView("login");
      } else {
        setError(res.detail || "Reset failed. Token may have expired.");
      }
    } catch {
      setError("Could not connect to server.");
    }
    setLoading(false);
  };

  // REUSABLE COMPONENTS 
  // Input field style — used by all form fields
  const inputStyle = {
    width: "100%",
    padding: "12px 14px",
    border: "1.5px solid #dce1e7",
    borderRadius: "8px",
    fontSize: "14px",
    color: colors.text,
    outline: "none",
    boxSizing: "border-box",
  };

  // Label style — used by all form labels
  const labelStyle = {
    display: "block",
    fontSize: "13px",
    fontWeight: "600",
    color: colors.text,
    marginBottom: "6px",
  };

  // Primary button style
  const btnStyle = {
    width: "100%",
    padding: "13px",
    background: colors.primary,
    color: colors.white,
    border: "none",
    borderRadius: "8px",
    fontSize: "15px",
    fontWeight: "600",
    cursor: "pointer",
    marginBottom: "16px",
  };

  // RENDER 
  return (
    <div style={{
      minHeight: "100vh",
      background: colors.background,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "'Segoe UI', sans-serif",
    }}>
      <div style={{
        display: "flex",
        width: "900px",
        minHeight: "560px",
        borderRadius: "16px",
        overflow: "hidden",
        boxShadow: "0 20px 60px rgba(0,0,0,0.12)",
      }}>

        {/*  LEFT PANEL — branding */}
        <div style={{
          width: "45%",
          background: colors.primary,
          padding: "48px 40px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          color: colors.white,
        }}>
          {/* Logo */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "48px" }}>
              <div style={{
                width: "40px", height: "40px",
                background: colors.white,
                borderRadius: "10px",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <img src="/favicon.svg" alt="Audit AI logo" style={{ width: "28px", height: "28px" }} />
              </div>
              <span style={{ fontSize: "22px", fontWeight: "700" }}>Audit AI </span>
            </div>

            {/* Tagline */}
            <h2 style={{ fontSize: "26px", fontWeight: "700", lineHeight: "1.3", marginBottom: "16px" }}>
             AI Financial Intelligence System
            </h2>
            <p style={{ fontSize: "14px", opacity: 0.75, lineHeight: "1.7" }}>
              Manage clients, engagements, and audit workflows — all in one place.
            </p>
          </div>

        </div>

        {/*  RIGHT PANEL — forms */}
        <div style={{
          width: "55%",
          background: colors.white,
          padding: "48px 40px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}>

          {/* Error message — shown when something goes wrong */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "28px" }}>
            <img src="/favicon.svg" alt="Audit AI logo" style={{ width: "34px", height: "34px" }} />
            <span style={{ fontSize: "20px", fontWeight: "700", color: colors.primary }}>Audit AI</span>
          </div>

          {error && (
            <div style={{
              background: "#fdecea", border: `1px solid ${colors.danger}`,
              color: colors.danger, padding: "12px 16px",
              borderRadius: "8px", fontSize: "13px", marginBottom: "20px",
            }}>{error}</div>
          )}

          {/* Success message — shown on success */}
          {message && (
            <div style={{
              background: "#eafaf1", border: `1px solid ${colors.success}`,
              color: colors.success, padding: "12px 16px",
              borderRadius: "8px", fontSize: "13px", marginBottom: "20px",
            }}>{message}</div>
          )}

          {/*  VIEW 1: LOGIN FORM */}
          {view === "login" && (
            <>
              <h3 style={{ fontSize: "24px", fontWeight: "700", color: colors.text, marginBottom: "8px" }}>
                Welcome back
              </h3>
              <p style={{ fontSize: "14px", color: "#7f8c8d", marginBottom: "32px" }}>
                Sign in to your Audit AI account
              </p>
              <form onSubmit={handleLogin}>
                <div style={{ marginBottom: "20px" }}>
                  <label style={labelStyle}>Email Address</label>
                  <input type="email" value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@auditai.com" required style={inputStyle} />
                </div>
                <div style={{ marginBottom: "12px" }}>
                  <label style={labelStyle}>Password</label>
                  <input type="password" value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password" required style={inputStyle} />
                </div>
                <div style={{ textAlign: "right", marginBottom: "24px" }}>
                  <span onClick={() => { setView("forgot"); setError(""); setMessage(""); }}
                    style={{ fontSize: "13px", color: colors.secondary, cursor: "pointer", fontWeight: "500" }}>
                    Forgot password?
                  </span>
                </div>
                <button type="submit" disabled={loading} style={btnStyle}>
                  {loading ? "Signing in..." : "Sign In"}
                </button>
              </form>
            </>
          )}

          {/* VIEW 2: FORGOT PASSWORD FORM */}
          {view === "forgot" && (
            <>
              <h3 style={{ fontSize: "24px", fontWeight: "700", color: colors.text, marginBottom: "8px" }}>
                Reset your password
              </h3>
              <p style={{ fontSize: "14px", color: "#7f8c8d", marginBottom: "32px" }}>
                Enter your email to receive a reset token
              </p>
              <form onSubmit={handleForgot}>
                <div style={{ marginBottom: "24px" }}>
                  <label style={labelStyle}>Email Address</label>
                  <input type="email" value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="you@auditai.com" required style={inputStyle} />
                </div>
                <button type="submit" disabled={loading} style={btnStyle}>
                  {loading ? "Sending..." : "Send Reset Token"}
                </button>
                <div style={{ textAlign: "center" }}>
                  <span onClick={() => { setView("login"); setError(""); }}
                    style={{ fontSize: "13px", color: colors.secondary, cursor: "pointer" }}>
                    ← Back to login
                  </span>
                </div>
              </form>
            </>
          )}

          {/* VIEW 3: RESET PASSWORD FORM  */}
          {view === "reset" && (
            <>
              <h3 style={{ fontSize: "24px", fontWeight: "700", color: colors.text, marginBottom: "8px" }}>
                Set new password
              </h3>
              <p style={{ fontSize: "14px", color: "#7f8c8d", marginBottom: "32px" }}>
                Enter your reset token and new password
              </p>
              <form onSubmit={handleReset}>
                <div style={{ marginBottom: "20px" }}>
                  <label style={labelStyle}>Reset Token</label>
                  <input type="text" value={resetToken}
                    onChange={(e) => setResetToken(e.target.value)}
                    placeholder="Paste your reset token" required style={inputStyle} />
                </div>
                <div style={{ marginBottom: "24px" }}>
                  <label style={labelStyle}>New Password</label>
                  <input type="password" value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password" required style={inputStyle} />
                </div>
                <button type="submit" disabled={loading} style={btnStyle}>
                  {loading ? "Resetting..." : "Reset Password"}
                </button>
                <div style={{ textAlign: "center" }}>
                  <span onClick={() => { setView("login"); setError(""); setMessage(""); }}
                    style={{ fontSize: "13px", color: colors.secondary, cursor: "pointer" }}>
                    ← Back to login
                  </span>
                </div>
              </form>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
