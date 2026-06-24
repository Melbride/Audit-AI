import React from "react";

// Layout.jsx — shared app layout with persistent sidebar/navigation
// - Renders the left navigation/sidebar
// - Shows user info and logout button
// - Renders `children` inside the main content area so pages do
//   not need to duplicate the sidebar markup.

const colors = {
  primary: "#1E3A5F",
  accent: "#3498DB",
  white: "#FFFFFF",
  text: "#2C3E50",
};

export default function Layout({ user, currentPage, onLogout, onNavigate, children }) {

  // Shared style for nav buttons — active page gets the solid accent background
  const navItemStyle = (isActive) => ({
    padding: "10px 14px",
    background: isActive ? colors.accent : "rgba(255,255,255,0.15)",
    color: colors.white,
    border: isActive ? "none" : "1px solid rgba(255,255,255,0.3)",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: "600",
    textAlign: "left",
  });

  return (
    <div style={{ fontFamily: "'Segoe UI', sans-serif", background: "#F4F6F9", minHeight: "100vh", display: "flex" }}>

      {/* Sidebar / Navigation — persistent across pages */}
      <div style={{ background: colors.primary, padding: "24px 18px", width: "220px", minHeight: "100vh", boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "32px", height: "32px", background: colors.accent, borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", fontWeight: "bold", color: colors.white }}>A</div>
            <span style={{ color: colors.white, fontSize: "18px", fontWeight: "700" }}>Audit AI</span>
          </div>

          {/* Navigation buttons */}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "32px" }}>
            <button onClick={() => onNavigate("dashboard")} style={navItemStyle(currentPage === "dashboard")}>Dashboard</button>
            <button onClick={() => onNavigate("clients")} style={navItemStyle(currentPage === "clients")}>Clients</button>
            <button onClick={() => onNavigate("engagements")} style={navItemStyle(currentPage === "engagements" || currentPage === "engagement-detail")}>Engagements</button>
            <button onClick={() => onNavigate("users")} style={navItemStyle(currentPage === "users")}>Users</button>
            <button onClick={() => onNavigate("notifications")} style={navItemStyle(currentPage === "notifications")}>Notifications</button>
          </div>
        </div>

        {/* User info + logout */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <span style={{ color: "rgba(255,255,255,0.8)", fontSize: "13px" }}>
            {user.full_name}<br /><strong>{user.role}</strong>
          </span>
          <button onClick={onLogout} style={{ padding: "10px 14px", background: "rgba(255,255,255,0.15)", color: colors.white, border: "1px solid rgba(255,255,255,0.3)", borderRadius: "6px", cursor: "pointer", fontSize: "13px", textAlign: "left" }}>Logout</button>
        </div>
      </div>

      {/* Main content area — pages render inside here */}
      <div style={{ flex: 1, padding: "32px" }}>
        {children}
      </div>
    </div>
  );
}