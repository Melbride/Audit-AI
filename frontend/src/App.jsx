import { useState } from "react";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Users from "./pages/Users";
import Clients from "./pages/Clients";
import Layout from "./Layout";
import Engagements from "./pages/Engagements";
import EngagementDetail from "./pages/EngagementDetail";
import Notifications from "./pages/Notifications";
import Submissions from "./pages/Submissions";




export default function App() {
  const [page, setPage] = useState("dashboard");
  const [engagementId, setEngagementId] = useState(null);

  const handleNavigate = (newPage, params) => {
    setPage(newPage);
    if (newPage === "engagement-detail") {
      setEngagementId(params);
    }
  };

  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem("user");
      if (!stored) return null;
      const parsed = JSON.parse(stored);
      if (!parsed || !parsed.full_name) return null;
      return parsed;
    } catch {
      return null;
    }
  });

  const handleLogin = (userData) => {
    setUser(userData);
    setPage("dashboard");
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
    setPage("dashboard");
  };

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  // Pick which page's content to render inside the shared Layout
  let content;
 if (page === "users") {
    content = <Users user={user} onNavigate={handleNavigate} />;
  } else if (page === "clients") {
    content = <Clients user={user} onNavigate={handleNavigate} />;
  } else if (page === "engagements") {
    content = <Engagements user={user} onNavigate={handleNavigate} />;
  } else if (page === "engagement-detail") {
    content = <EngagementDetail engagementId={engagementId} user={user} onNavigate={handleNavigate} />;
  } else if (page === "submissions") {
  content = <Submissions user={user} onNavigate={handleNavigate} />;
  } else if (page === "notifications") {
    content = <Notifications user={user} onNavigate={handleNavigate} />;
  } else {
    content = <Dashboard user={user} onNavigate={handleNavigate} />;
  }

  return (
    <Layout user={user} currentPage={page} onNavigate={handleNavigate} onLogout={handleLogout}>
      {content}
    </Layout>
  );
}