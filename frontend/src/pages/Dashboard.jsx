import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getClients, getEngagements, getFiles } from "../services/api";
import "../styles/Dashboard.css";

// Dashboard: landing page showing high-level summary stats
// (client count, engagement count, files uploaded) as clickable cards
// that navigate to the corresponding section of the app.
export default function Dashboard({ user }) {
  const navigate = useNavigate();
  // all clients, used only for count here
  const [clients, setClients] = useState([]);         
  // all engagements, used only for count here
  const [engagements, setEngagements] = useState([]); 
   // all uploaded files, used only for count here
  const [files, setFiles] = useState([]);
   // true while the three summary fetches are in flight       
  const [loading, setLoading] = useState(true);        
  

  // Fetch clients, engagements, and files in parallel whenever the
  // logged-in user changes (e.g. after switching accounts).
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [c, e, f] = await Promise.all([
          getClients(),
          getEngagements(),
          getFiles(),
        ]);

        setClients(Array.isArray(c.data) ? c.data : []);
        setEngagements(Array.isArray(e.data) ? e.data : []);
        setFiles(Array.isArray(f.data) ? f.data : []);
      } catch (err) {
        console.error("Failed to load dashboard data", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user.user_id]);

  // Summary cards configuration: each card shows a count, an icon,
  const cards = [
    {
      label: "Total Clients",
      value: clients.length,
      variant: "teal",
      path: "/clients",
      icon: (
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h1m4 0h1m-6 4h1m4 0h1m-6 4h1m4 0h1" />
        </svg>
      ),
    },
    {
      label: "Engagements",
      value: engagements.length,
      variant: "blue",
      path: "/engagements",
      icon: (
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
        </svg>
      ),
    },
    {
      label: "Files Uploaded",
      value: files.length,
      variant: "green",
      path: "/files",
      icon: (
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
        </svg>
      ),
    },
  ];

  // Show a simple loading message until all summary data has been fetched
  if (loading) {
    return (
      <div className="dashboard">
        <p>Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="dashboard">
      {/* Page header with personalized greeting */}
      <div className="dashboard-header">
        <h1>Dashboard</h1>
        <p>
          Welcome back, {user.full_name}. 
        </p>
      </div>

      {/* Grid of summary cards; clicking a card navigates to its section */}
      <div className="dashboard-grid">
        {cards.map((card, index) => (
          <div
            key={index}
            className={`dashboard-card card-${card.variant}`}
            onClick={() => navigate(card.path)}
          >
            <div className={`dashboard-card-icon icon-${card.variant}`}>
              {card.icon}
            </div>

            <div className="dashboard-card-value">
              {card.value}
            </div>

            <div className="dashboard-card-label">
              {card.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}