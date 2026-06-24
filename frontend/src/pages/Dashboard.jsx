import { useState, useEffect } from "react";
import API from "../api";

// Dashboard.jsx — Audit AI Home Dashboard
// Shows a summary of the system:
// - Total clients
// - Total engagements
// - Total uploads


// Color theme
const colors = {
  primary:    "#1E3A5F",
  secondary:  "#2E86C1",
  accent:     "#3498DB",
  background: "#F4F6F9",
  white:      "#FFFFFF",
  text:       "#2C3E50",
  success:    "#27AE60",
  warning:    "#F39C12",
  danger:     "#E74C3C",
};

// Dashboard now renders only the page content. The persistent
// sidebar/navigation is provided by `Layout.jsx`.
export default function Dashboard({ user, onNavigate }) {

  // STATE
  const [clients, setClients] = useState([]);
  const [engagements, setEngagements] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);

  // FETCH DATA 
  // Load all data when Dashboard first opens
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [c, e, f] = await Promise.all([
          API.getClients(),
          API.getEngagements(),
          API.getFiles(),
        ]);
        setClients(Array.isArray(c) ? c : []);
        setEngagements(Array.isArray(e) ? e : []);
        setFiles(Array.isArray(f) ? f : []);
      } catch (err) {
        console.error("Failed to load dashboard data", err);
      }
      setLoading(false);
    };
    fetchData();
  }, [user.user_id]);

  // RENDER 
  // Render header + summary cards inside the Layout content area.
  return (
    <div>
      {/* Page header */}
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: "700", color: colors.text, marginBottom: "4px" }}>
          Dashboard
        </h1>
        <p style={{ fontSize: "14px", color: "#7f8c8d" }}>
          Welcome back, {user.full_name}. Here's what's happening today.
        </p>
      </div>

      {/* Summary cards — only Clients is clickable */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", marginBottom: "28px" }}>
        {[
          { label: "Total Clients", value: clients.length, color: colors.primary, isClickable: true, icon: (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h1m4 0h1m-6 4h1m4 0h1m-6 4h1m4 0h1"/></svg>
          )},
          { label: "Engagements", value: engagements.length, color: colors.secondary, isClickable: true, navigateKey: "engagements", icon: (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
          )},
          { label: "Files Uploaded", value: files.length, color: colors.success, isClickable: false, icon: (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
          )},
        ].map((card, i) => (
          <div key={i} onClick={() => card.isClickable && onNavigate(card.navigateKey || "clients")} style={{
            background: colors.white,
            borderRadius: "12px",
            padding: "20px 24px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            borderLeft: `4px solid ${card.color}`,
            cursor: card.isClickable ? "pointer" : "default",
            transition: "all 0.2s ease",
          }}
          onMouseEnter={(e) => {
            if (card.isClickable) {
              e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.12)";
              e.currentTarget.style.transform = "translateY(-2px)";
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)";
            e.currentTarget.style.transform = "translateY(0)";
          }}>
            <div style={{ fontSize: "28px", marginBottom: "8px" }}>{card.icon}</div>
            <div style={{ fontSize: "28px", fontWeight: "700", color: card.color, marginBottom: "4px" }}>
              {card.value}
            </div>
            <div style={{ fontSize: "13px", color: "#7f8c8d", fontWeight: "500" }}>{card.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
