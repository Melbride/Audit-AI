import { useState, useEffect } from "react";
import API from "../api";

const colors = {
  primary: "#1E3A5F",
  secondary: "#2E86C1",
  accent: "#3498DB",
  background: "#F4F6F9",
  white: "#FFFFFF",
  text: "#2C3E50",
  success: "#27AE60",
  warning: "#F39C12",
  danger: "#E74C3C",
  muted: "#95A5A6",
};

const statusColors = {
  Draft: colors.muted,
  Submitted: colors.secondary,
  "Under Review": colors.accent,
  "Changes Requested": colors.warning,
  Approved: colors.success,
  Cancelled: colors.danger,
};

export default function Submissions({ user, onNavigate }) {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await API.getAllSubmissions();
      setSubmissions(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load submissions", err);
    }
    setLoading(false);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "—";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) +
           " · " + date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div>
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: "700", color: colors.text, marginBottom: "4px" }}>Submissions</h1>
        <p style={{ fontSize: "14px", color: "#7f8c8d" }}>All audit section handoffs across every engagement</p>
      </div>

      <div style={{ background: colors.white, borderRadius: "12px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", overflow: "hidden" }}>
        {loading ? (
          <p style={{ padding: "24px", color: "#7f8c8d" }}>Loading submissions...</p>
        ) : submissions.length === 0 ? (
          <p style={{ padding: "24px", color: "#7f8c8d" }}>No submissions yet.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#FAFBFC", borderBottom: "1px solid #eee" }}>
                {["Engagement", "Section", "Status", "Submitted By", "Last Updated", "Notes", "Actions"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "14px 20px", fontSize: "12px", fontWeight: "600", color: "#7f8c8d", textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {submissions.map((s) => (
                <tr key={s.submission_id} style={{ borderBottom: "1px solid #f5f5f5" }}>
                  <td style={{ padding: "14px 20px", fontSize: "14px", color: colors.text, fontWeight: "500" }}>{s.engagement_name || "—"}</td>
                  <td style={{ padding: "14px 20px", fontSize: "14px", color: "#7f8c8d" }}>{s.section_name || "—"}</td>
                  <td style={{ padding: "14px 20px" }}>
                    <span style={{ fontSize: "12px", fontWeight: "600", color: statusColors[s.status] || colors.muted, background: `${statusColors[s.status] || colors.muted}1A`, padding: "4px 10px", borderRadius: "12px" }}>
                      {s.status}
                    </span>
                  </td>
                  <td style={{ padding: "14px 20px", fontSize: "14px", color: "#7f8c8d" }}>{s.submitted_by_name || "—"}</td>
                  <td style={{ padding: "14px 20px", fontSize: "13px", color: "#7f8c8d" }}>{formatDate(s.created_at)}</td>
                  <td style={{ padding: "14px 20px", fontSize: "13px", color: "#7f8c8d" }}>{s.notes ? `"${s.notes}"` : "—"}</td>
                  <td style={{ padding: "14px 20px" }}>
                    <button
                      onClick={() => onNavigate("engagement-detail", s.engagement_id)}
                      style={{ padding: "6px 14px", fontSize: "13px", fontWeight: "600", color: colors.secondary, background: "transparent", border: `1px solid ${colors.secondary}`, borderRadius: "6px", cursor: "pointer" }}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}