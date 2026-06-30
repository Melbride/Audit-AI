import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login, requestPasswordReset, confirmPasswordReset } from "../services/api";

// Centralized color palette used for inline styles throughout this component
const colors = {
  primary:    "#1E3A5F",
  secondary:  "#2E86C1",
  accent:     "#3498DB",
  background: "#F4F6F9",
  white:      "#FFFFFF",
  text:       "#FFFFFF",
  success:    "#27AE60",
  warning:    "#F39C12",
  danger:     "#E74C3C",
};

// Login: handles the full auth flow on one page 
export default function Login({ onLogin }) {
  const navigate = useNavigate()

  // Which form is currently displayed: "login" | "forgot" | "reset"
  const [view, setView] = useState("login");

  // Login form fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Forgot/reset password flow fields
  const [resetEmail, setResetEmail] = useState("");   // email used to request a reset token
  const [resetToken, setResetToken] = useState("");    // token received from the server, also editable/pasteable by the user
  const [newPassword, setNewPassword] = useState("");  // new password to set during reset

  // Shared feedback state across all three views
  const [message, setMessage] = useState(""); // success/info message
  const [error, setError] = useState("");     // error message
  const [loading, setLoading] = useState(false); // true while any request is in flight

  // Handles the login form submission.
  // On success, stores the token/user in localStorage, notifies the parent
  // via onLogin, and redirects to the dashboard.
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

  // Handles the "forgot password" form submission.
  // Requests a reset token for the given email; on success, switches to the
  // "reset" view and pre-fills the token so the user just adds a new password.
  const handleForgot = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await requestPasswordReset(resetEmail);
      const data = res.data;
      if (data.token) {
        setResetToken(data.token);
        setMessage("Token generated. Enter it below with your new password.");
        setView("reset");
      } else {
        setError(data.detail || "Email not found");
      }
    } catch (err) {
      setError(err.response?.data?.detail || "Could not connect to server.");
    }
    setLoading(false);
  };

  // Handles the "reset password" form submission.
  // Confirms the reset token along with the new password; on success,
  // returns the user to the login view.
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

  // Shared inline style objects reused across the login/forgot/reset forms
  const inputStyle = {
    width: "100%", padding: "12px 14px", border: "1.5px solid #dce1e7",
    borderRadius: "8px", fontSize: "14px", color: colors.text,
    outline: "none", boxSizing: "border-box",
  };

  const labelStyle = {
    display: "block", fontSize: "13px", fontWeight: "600",
    color: colors.text, marginBottom: "6px",
  };

  const btnStyle = {
    width: "100%", padding: "13px", background: colors.primary,
    color: colors.white, border: "none", borderRadius: "8px",
    fontSize: "15px", fontWeight: "600", cursor: "pointer", marginBottom: "16px",
  };

  return (
    // Full-screen centered layout with a two-panel card (branding left, form right)
    <div style={{ minHeight: "100vh", background: colors.background, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI', sans-serif" }}>
      <div style={{ display: "flex", width: "900px", minHeight: "560px", borderRadius: "16px", overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.12)" }}>

        {/* LEFT PANEL — branding / marketing copy, purely decorative */}
        <div style={{ width: "45%", background: colors.primary, padding: "48px 40px", display: "flex", flexDirection: "column", justifyContent: "space-between", color: colors.white }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "48px" }}>
              <div style={{ width: "40px", height: "40px", background: colors.white, borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <img src="/favicon.svg" alt="Audit AI logo" style={{ width: "28px", height: "28px" }} />
              </div>
              <span style={{ fontSize: "22px", fontWeight: "700" }}>Audit AI</span>
            </div>
            <h2 style={{ fontSize: "26px", fontWeight: "700", lineHeight: "1.3", marginBottom: "16px" }}>AI Financial Intelligence System</h2>
            <p style={{ fontSize: "14px", opacity: 0.75, lineHeight: "1.7" }}>Manage clients, engagements, and audit workflows — all in one place.</p>
          </div>
        </div>

        {/* RIGHT PANEL — the actual interactive form area */}
        <div style={{ width: "55%", background: colors.white, padding: "48px 40px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "28px" }}>
            <img src="/favicon.svg" alt="Audit AI logo" style={{ width: "34px", height: "34px" }} />
            <span style={{ fontSize: "20px", fontWeight: "700", color: colors.primary }}>Audit AI</span>
          </div>

          {/* Shared error/success banners, shown above whichever form is active */}
          {error && (
            <div style={{ background: "#fdecea", border: `1px solid ${colors.danger}`, color: colors.danger, padding: "12px 16px", borderRadius: "8px", fontSize: "13px", marginBottom: "20px" }}>{error}</div>
          )}
          {message && (
            <div style={{ background: "#eafaf1", border: `1px solid ${colors.success}`, color: colors.success, padding: "12px 16px", borderRadius: "8px", fontSize: "13px", marginBottom: "20px" }}>{message}</div>
          )}

          {/* LOGIN FORM */}
          {view === "login" && (
            <>
              <h3 style={{ fontSize: "24px", fontWeight: "700", color: colors.primary, marginBottom: "8px" }}>Welcome back</h3>
              <p style={{ fontSize: "14px", color: "#7f8c8d", marginBottom: "32px" }}>Sign in to your Audit AI account</p>
              <form onSubmit={handleLogin}>
                <div style={{ marginBottom: "20px" }}>
                  <label style={{ ...labelStyle, color: colors.primary }}>Email Address</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@auditai.com" required style={{ ...inputStyle, color: colors.primary }} />
                </div>
                <div style={{ marginBottom: "12px" }}>
                  <label style={{ ...labelStyle, color: colors.primary }}>Password</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" required style={{ ...inputStyle, color: colors.primary }} />
                </div>
                {/* Switches to the "forgot password" view */}
                <div style={{ textAlign: "right", marginBottom: "24px" }}>
                  <span onClick={() => { setView("forgot"); setError(""); setMessage(""); }} style={{ fontSize: "13px", color: colors.secondary, cursor: "pointer", fontWeight: "500" }}>Forgot password?</span>
                </div>
                <button type="submit" disabled={loading} style={btnStyle}>{loading ? "Signing in..." : "Sign In"}</button>
              </form>
            </>
          )}

          {/* FORGOT PASSWORD FORM — requests a reset token by email */}
          {view === "forgot" && (
            <>
              <h3 style={{ fontSize: "24px", fontWeight: "700", color: colors.primary, marginBottom: "8px" }}>Reset your password</h3>
              <p style={{ fontSize: "14px", color: "#7f8c8d", marginBottom: "32px" }}>Enter your email to receive a reset token</p>
              <form onSubmit={handleForgot}>
                <div style={{ marginBottom: "24px" }}>
                  <label style={{ ...labelStyle, color: colors.primary }}>Email Address</label>
                  <input type="email" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} placeholder="you@auditai.com" required style={{ ...inputStyle, color: colors.primary }} />
                </div>
                <button type="submit" disabled={loading} style={btnStyle}>{loading ? "Sending..." : "Send Reset Token"}</button>
                {/* Back to login without submitting anything */}
                <div style={{ textAlign: "center" }}>
                  <span onClick={() => { setView("login"); setError(""); }} style={{ fontSize: "13px", color: colors.secondary, cursor: "pointer" }}>← Back to login</span>
                </div>
              </form>
            </>
          )}

          {/* RESET PASSWORD FORM — confirms token + sets new password */}
          {view === "reset" && (
            <>
              <h3 style={{ fontSize: "24px", fontWeight: "700", color: colors.primary, marginBottom: "8px" }}>Set new password</h3>
              <p style={{ fontSize: "14px", color: "#7f8c8d", marginBottom: "32px" }}>Enter your reset token and new password</p>
              <form onSubmit={handleReset}>
                <div style={{ marginBottom: "20px" }}>
                  <label style={{ ...labelStyle, color: colors.primary }}>Reset Token</label>
                  <input type="text" value={resetToken} onChange={(e) => setResetToken(e.target.value)} placeholder="Paste your reset token" required style={{ ...inputStyle, color: colors.primary }} />
                </div>
                <div style={{ marginBottom: "24px" }}>
                  <label style={{ ...labelStyle, color: colors.primary }}>New Password</label>
                  <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Enter new password" required style={{ ...inputStyle, color: colors.primary }} />
                </div>
                <button type="submit" disabled={loading} style={btnStyle}>{loading ? "Resetting..." : "Reset Password"}</button>
                {/* Back to login without submitting anything */}
                <div style={{ textAlign: "center" }}>
                  <span onClick={() => { setView("login"); setError(""); setMessage(""); }} style={{ fontSize: "13px", color: colors.secondary, cursor: "pointer" }}>← Back to login</span>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}