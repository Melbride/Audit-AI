const colors = {
  primary:    "#1E3A5F",
  secondary:  "#2E86C1",
  accent:     "#3498DB",
  background: "#F4F6F9",
  white:      "#FFFFFF",
  text:       "#2C3E50",
};

// ============================================================
// Layout.jsx — Shared application shell
// Renders the persistent sidebar nav on the left and whatever
// page content is passed in via `children` on the right.
// Used by App.jsx so the nav bar stays visible across every
// logged-in page (Dashboard, Clients, Users, ...).
// ============================================================

const NAV_ITEMS = [
  {
    key: "dashboard",
    label: "Dashboard",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="9" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="16" width="7" height="5" rx="1.5" />
      </svg>
    ),
  },
  {
    key: "clients",
    label: "Clients",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h1m4 0h1m-6 4h1m4 0h1m-6 4h1m4 0h1" />
      </svg>
    ),
  },
  {
    key: "engagements",
    label: "Engagements",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 5h16M4 12h16M4 19h16" />
        <path d="M8 5v14" />
      </svg>
    ),
  },
  {
    key: "submissions",
    label: "Submissions",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="6" y="4" width="12" height="16" rx="2" />
        <path d="M9 4V2h6v2M9 11l2 2 4-4" />
      </svg>
    ),
  },
  {
    key: "users",
    label: "Users",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M17 21v-2a4 4 0 00-4-4H7a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
      </svg>
    ),
  },
  {
    key: "notifications",
    label: "Notifications",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
      </svg>
    ),
  },
];

export default function Layout({ user, currentPage, onNavigate, onLogout, children }) {
  // Treat the EngagementDetail page as part of "engagements" for highlighting purposes
  const effectivePage = currentPage === "engagement-detail" ? "engagements" : currentPage;

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: colors.background, fontFamily: "'Segoe UI', sans-serif" }}>

      {/* ── SIDEBAR ── */}
      <aside style={{
        width: "240px",
        background: colors.primary,
        color: colors.white,
        display: "flex",
        flexDirection: "column",
        padding: "28px 0",
        flexShrink: 0,
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "0 24px", marginBottom: "40px" }}>
          <div style={{
            width: "34px", height: "34px",
            background: colors.white,
            borderRadius: "9px",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <img src="/favicon.svg" alt="Audit AI logo" style={{ width: "22px", height: "22px" }} />
          </div>
          <span style={{ fontSize: "18px", fontWeight: "700" }}>Audit AI</span>
        </div>

        {/* Nav links */}
        <nav style={{ flex: 1 }}>
          {NAV_ITEMS.map(item => {
            const active = effectivePage === item.key;
            return (
              <div
                key={item.key}
                onClick={() => onNavigate(item.key)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "12px 24px",
                  margin: "2px 12px",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: active ? "600" : "500",
                  color: active ? colors.white : "rgba(255,255,255,0.65)",
                  background: active ? "rgba(255,255,255,0.12)" : "transparent",
                }}
              >
                {item.icon}
                {item.label}
              </div>
            );
          })}
        </nav>

        {/* User info + logout */}
        <div style={{ padding: "16px 24px", borderTop: "1px solid rgba(255,255,255,0.12)" }}>
          <div style={{ fontSize: "13px", fontWeight: "600", marginBottom: "2px" }}>{user?.full_name}</div>
          {user?.role && (
            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.75)", marginBottom: "4px" }}>{user.role}</div>
          )}
          {user?.email && (
            <div style={{ fontSize: "12px", color: "rgba(255, 255, 255, 0.55)", marginBottom: "14px" }}>{user.email}</div>
          )}
          <button
            onClick={onLogout}
            style={{
              width: "100%",
              padding: "10px",
              background: "rgba(255, 255, 255, 0.08)",
              color: colors.white,
              border: "none",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: "600",
              cursor: "pointer",
            }}
          >
            Log Out
          </button>
        </div>
      </aside>

      {/* ── PAGE CONTENT ── */}
      <main style={{ flex: 1, padding: "32px 40px", overflowY: "auto" }}>
        {children}
      </main>
    </div>
  );
}