import { useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { confirmPasswordReset } from "../services/api";

const colors = {
  primary: "#1E3A5F",
  secondary: "#2E86C1",
  white: "#FFFFFF",
  background: "#F4F6F9",
  danger: "#E74C3C",
};

function SetNewPassword() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword1, setShowPassword1] = useState(false);
  const [showPassword2, setShowPassword2] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({ newPassword: "", confirmPassword: "" });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrors({ newPassword: "", confirmPassword: "" });
    if (newPassword !== confirmPassword) {
      setErrors((prev) => ({ ...prev, confirmPassword: "Passwords do not match." }));
      return;
    }
    setLoading(true);
    try {
      await confirmPasswordReset(token, newPassword);
      navigate("/password-reset/complete");
    } catch (err) {
      setErrors((prev) => ({ ...prev, newPassword: err.response?.data?.detail || "Invalid or expired reset link." }));
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: "100%", padding: "12px 14px", border: "1.5px solid #dce1e7",
    borderRadius: "8px", fontSize: "14px", color: colors.primary,
    outline: "none", boxSizing: "border-box",
  };

  const btnStyle = {
    width: "100%", padding: "13px", background: colors.primary,
    color: colors.white, border: "none", borderRadius: "8px",
    fontSize: "15px", fontWeight: "600", cursor: "pointer", marginBottom: "16px",
  };

  return (
    <div style={{ minHeight: "100vh", background: colors.background, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI', sans-serif" }}>
      <div style={{ display: "flex", width: "900px", minHeight: "560px", borderRadius: "16px", overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.12)" }}>

        {/* Left panel */}
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

        {/* Right panel */}
        <div style={{ width: "55%", background: colors.white, padding: "48px 40px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "28px" }}>
            <img src="/favicon.svg" alt="Audit AI logo" style={{ width: "34px", height: "34px" }} />
            <span style={{ fontSize: "20px", fontWeight: "700", color: colors.primary }}>Audit AI</span>
          </div>

          <h3 style={{ fontSize: "24px", fontWeight: "700", color: colors.primary, marginBottom: "8px" }}>Set New Password</h3>
          <p style={{ fontSize: "14px", color: "#7f8c8d", marginBottom: "32px" }}>Enter your new password below.</p>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: "20px" }}>
              <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: colors.primary, marginBottom: "6px" }}>New Password</label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPassword1 ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  required
                  style={{ ...inputStyle, paddingRight: "44px" }}
                />
                <button type="button" onClick={() => setShowPassword1(!showPassword1)}
                  style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#7f8c8d" }}>
                  {showPassword1 ? "🙈" : "👁"}
                </button>
              </div>
              {errors.newPassword && <p style={{ color: colors.danger, fontSize: "12px", marginTop: "4px" }}>{errors.newPassword}</p>}
            </div>

            <div style={{ marginBottom: "28px" }}>
              <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: colors.primary, marginBottom: "6px" }}>Confirm New Password</label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPassword2 ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  required
                  style={{ ...inputStyle, paddingRight: "44px" }}
                />
                <button type="button" onClick={() => setShowPassword2(!showPassword2)}
                  style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#7f8c8d" }}>
                  {showPassword2 ? "🙈" : "👁"}
                </button>
              </div>
              {errors.confirmPassword && <p style={{ color: colors.danger, fontSize: "12px", marginTop: "4px" }}>{errors.confirmPassword}</p>}
            </div>

            <button type="submit" disabled={loading} style={btnStyle}>
              {loading ? "Resetting..." : "Reset Password"}
            </button>
          </form>

          <div style={{ textAlign: "center" }}>
            <Link to="/login" style={{ fontSize: "13px", color: colors.secondary }}>← Back to Login</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SetNewPassword;
