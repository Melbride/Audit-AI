import { useLocation, useNavigate } from 'react-router-dom'
import '../styles/Layout.css'

// Static list of sidebar navigation items.
// Each entry defines the route key, the path to navigate to, the label
// shown in the sidebar, and an inline SVG icon.
const NAV_ITEMS = [
  {
    key: "dashboard",
    path: "/dashboard",
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
    key: "upload",
    path: "/upload",
    label: "Upload & Clean",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
    ),
  },
  {
    key: "clients",
    path: "/clients",
    label: "Clients",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h1m4 0h1m-6 4h1m4 0h1m-6 4h1m4 0h1" />
      </svg>
    ),
  },
  {
    key: "engagements",
    path: "/engagements",
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
    path: "/submissions",
    label: "Submissions",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="6" y="4" width="12" height="16" rx="2" />
        <path d="M9 4V2h6v2M9 11l2 2 4-4" />
      </svg>
    ),
  },
  {
    key: "reports",
    path: "/reports",
    label: "Reports",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M9 13h6M9 17h6M9 9h1" />
      </svg>
    ),
  },
  {
    key: "users",
    path: "/users",
    label: "Users",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M17 21v-2a4 4 0 00-4-4H7a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
      </svg>
    ),
  },
  {
    key: "notifications",
    path: "/notifications",
    label: "Notifications",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
      </svg>
    ),
  },
  {
  key: "analysis",
  path: "/analysis",      // â† add this line
  label: "Analysis",       // (also capitalized to match the others, optional)
  icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 3v18h18M7 16l4-4 4 4 4-6" />
    </svg>
  ),
},
];


// Layout: app shell with a sidebar (logo, nav links, user info/logout)

export default function Layout({ user, onLogout, children }) {
  const location = useLocation()
  const navigate = useNavigate()

  const adminNavItems = user?.role === "Admin" ? [
    {
      key: "login-management",
      path: "/login-management",
      label: "Login Management",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 5h16M4 9h16M6 13h12M6 17h12" />
          <path d="M15 13c1.657 0 3 1.343 3 3v1H6v-1c0-1.657 1.343-3 3-3" />
        </svg>
      ),
    },
  ] : [];

  // Determines whether a given nav item should be styled as "active"
  // based on the current route. Some nav items map to multiple paths
  
  const isActive = (item) => {
    // Highlight Dashboard for the /files page too
    if (item.key === "dashboard") {
      return location.pathname === "/dashboard" || location.pathname === "/files"
    }
    // Highlight Engagements for the list page and any engagement detail sub-route
    if (item.key === "engagements") {
      return location.pathname.startsWith("/engagements")
    }
    // Highlight "Upload & Clean" for all pipeline pages
    if (item.key === "upload") {
      return ["/upload", "/mapping", "/clean", "/analysis", "/corrected-results"]
        .includes(location.pathname)
    }
    if (item.key === "login-management") {
      return location.pathname.startsWith("/login-management")
    }
    // Highlight Reports for the top-level list, a single report's detail
    // view, and the client-scoped reports view (e.g. /clients/12/reports)
    if (item.key === "reports") {
      return location.pathname.startsWith("/reports") ||
        /^\/clients\/[^/]+\/reports/.test(location.pathname)
    }
    // Default: exact path match
    return location.pathname === item.path
  }

  return (
    <div className="layout-root">

      {/* Sidebar */}
      <aside className="layout-sidebar">

        {/* Logo */}
        <div className="layout-logo">
          <div className="layout-logo-icon">
            <img src="/csa-logo.png" alt="Audit AI logo" />
          </div>
          <span className="layout-logo-text">Audit AI</span>
        </div>

        {/* Nav links â€” clicking navigates via react-router, active item is highlighted */}
        <nav className="layout-nav">
          {[...NAV_ITEMS, ...adminNavItems].map(item => (
            <div
              key={item.key}
              onClick={() => navigate(item.path)}
              className={`layout-nav-item${isActive(item) ? " active" : ""}`}
            >
              {item.icon}
              {item.label}
            </div>
          ))}
        </nav>

        {/* User info + logout â€” name/role/email are optional (rendered only if present) */}
        <div className="layout-user">
          <div className="layout-user-name">{user?.full_name}</div>
          {user?.role  && <div className="layout-user-role">{user.role}</div>}
          {user?.email && <div className="layout-user-email">{user.email}</div>}
          <button className="layout-logout-btn" onClick={onLogout}>Log Out</button>
        </div>

      </aside>

      {/* Page content â€” whatever page component is currently routed */}
      <main className="layout-main">
        {children}
      </main>

    </div>
  );
}