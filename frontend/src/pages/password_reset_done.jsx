import { Link } from "react-router-dom";

const colors = {
  primary: "#1E3A5F",
  secondary: "#2E86C1",
  white: "#FFFFFF",
  background: "#F4F6F9",
  success: "#27AE60",
};

function PasswordResetDone() {
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
        <div style={{ width: "55%", background: colors.white, padding: "48px 40px", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center" }}>
          <div style={{ width: "72px", height: "72px", background: "#eafaf1", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "24px" }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke={colors.success} strokeWidth="2" fill="none" />
              <path d="m9 12 2 2 4-4" stroke={colors.success} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h3 style={{ fontSize: "24px", fontWeight: "700", color: colors.primary, marginBottom: "12px" }}>Check Your Email</h3>
          <p style={{ fontSize: "14px", color: "#7f8c8d", marginBottom: "8px", lineHeight: "1.7" }}>
            We've sent a password reset link to your email address. Click the link to reset your password.
          </p>
          <p style={{ fontSize: "13px", color: "#aab", marginBottom: "32px" }}>If you don't see it, check your spam folder.</p>
          <Link to="/login" style={{ padding: "13px 32px", background: colors.primary, color: colors.white, borderRadius: "8px", fontSize: "15px", fontWeight: "600", textDecoration: "none" }}>
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
}

export default PasswordResetDone;
