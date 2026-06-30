import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getAllSubmissions } from "../services/api";
import "../styles/Submissions.css";

// Submissions page: read-only table listing every audit section
// submission across all engagements, with a link to jump to the
// related engagement's detail page.
export default function Submissions({ user }) {
  const navigate = useNavigate();
  const [submissions, setSubmissions] = useState([]); // all submissions shown in the table
  const [loading, setLoading] = useState(true);        // true while submissions are being fetched

  // Load submissions once on mount
  useEffect(() => { loadData(); }, []);

  // Fetches all submissions from the API and populates state
  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getAllSubmissions();
      setSubmissions(Array.isArray(data.data) ? data.data : []);
    } catch (err) {
      console.error("Failed to load submissions", err);
    }
    setLoading(false);
  };

  // Formats an ISO date string into "12 Jan 2025 
  const formatDate = (dateStr) => {
    if (!dateStr) return "—";
    const date = new Date(dateStr);
    return (
      date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) +
      " · " +
      date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    );
  };

  return (
    <div>
      {/* Header */}
      <div className="sub-header">
        <h1>Submissions</h1>
        <p>All audit section submissions across every engagement</p>
      </div>

      {/* Submissions table: loading state, empty state, or populated table */}
      <div className="sub-table-card">
        {loading ? (
          <p className="sub-loading">Loading submissions...</p>
        ) : submissions.length === 0 ? (
          <p className="sub-empty">No submissions yet.</p>
        ) : (
          <table className="sub-table">
            <thead>
              <tr>
                {["Engagement", "Section", "Status", "Submitted By", "Last Updated", "Notes", "Actions"].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {submissions.map((s) => (
                <tr key={s.submission_id}>
                  <td className="sub-table-name">{s.engagement_name || "—"}</td>
                  <td className="sub-table-muted">{s.section_name || "—"}</td>
                  {/* data-status drives the badge color via CSS */}
                  <td className="sub-table-status">
                    <span className="sub-status-badge" data-status={s.status}>
                      {s.status}
                    </span>
                  </td>
                  <td className="sub-table-muted">{s.submitted_by_name || "—"}</td>
                  <td className="sub-table-small">{formatDate(s.created_at)}</td>
                  <td className="sub-table-small">{s.notes ? `"${s.notes}"` : "—"}</td>
                  <td className="sub-table-action">
                    {/* Jump to the engagement this submission belongs to */}
                    <button
                      onClick={() => navigate(`/engagements/${s.engagement_id}`)}
                      className="sub-btn-view"
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