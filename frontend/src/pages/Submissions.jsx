import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getAllSubmissions } from "../services/api";
import "../styles/Submissions.css";

// Submissions page: read-only list of section submissions grouped by engagement.
export default function Submissions({ user }) {
  const navigate = useNavigate();
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedEngagementId, setSelectedEngagementId] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

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

  // Formats an ISO date string into "12 Jan 2025 · 08:45"
  const formatDate = (dateStr) => {
    if (!dateStr) return "—";
    const date = new Date(dateStr);
    return (
      date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) +
      " · " +
      date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    );
  };

  const engagementOptions = Array.from(
    submissions.reduce((map, submission) => {
      const key = submission.engagement_id;
      if (!map.has(key)) {
        map.set(key, submission.engagement_name || "Untitled Engagement");
      }
      return map;
    }, new Map())
  ).map(([id, name]) => ({ engagement_id: id, engagement_name: name }));

  const filteredEngagementOptions = engagementOptions.filter((option) =>
    option.engagement_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedSubmissions = submissions.filter(
    (s) => String(s.engagement_id) === String(selectedEngagementId)
  );

  return (
    <div>
      {/* Header */}
      <div className="sub-header">
        <h1>Submissions</h1>
        <p>All audit section submissions across every engagement</p>
      </div>

      {/* Submission selector card */}
      <div className="sub-table-card">
        {loading ? (
          <p className="sub-loading">Loading submissions...</p>
        ) : submissions.length === 0 ? (
          <p className="sub-empty">No submissions yet.</p>
        ) : (
          <div className="sub-dropdown-card">
            <label className="sub-label" htmlFor="engagement-search">
              Search engagements
            </label>
            <input
              id="engagement-search"
              className="sub-input"
              type="search"
              placeholder="Filter by engagement name"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />

            <label className="sub-label" htmlFor="engagement-select">
              Select engagement
            </label>
            <select
              id="engagement-select"
              className="sub-select"
              value={selectedEngagementId}
              onChange={(e) => setSelectedEngagementId(e.target.value)}
            >
              <option value="">— Choose an engagement —</option>
              {filteredEngagementOptions.length === 0 ? (
                <option value="" disabled>
                  No engagements match your search
                </option>
              ) : (
                filteredEngagementOptions.map((option) => (
                  <option key={option.engagement_id} value={option.engagement_id}>
                    {option.engagement_name}
                  </option>
                ))
              )}
            </select>

            {selectedEngagementId ? (
              <div className="sub-list-card">
                <div className="sub-list-header">
                  <span>{selectedSubmissions.length} submission{selectedSubmissions.length === 1 ? "" : "s"} found</span>
                  <button
                    type="button"
                    className="sub-btn-view"
                    onClick={() => navigate(`/engagements/${selectedEngagementId}`)}
                  >
                    View Engagement
                  </button>
                </div>
                {selectedSubmissions.map((s) => (
                  <div key={s.submission_id} className="sub-list-item">
                    <div className="sub-list-item-row">
                      <span className="sub-list-item-label">Section</span>
                      <span className="sub-list-item-value">{s.section_name || "—"}</span>
                    </div>
                    <div className="sub-list-item-row">
                      <span className="sub-list-item-label">Status</span>
                      <span className="sub-list-item-value">{s.status}</span>
                    </div>
                    <div className="sub-list-item-row">
                      <span className="sub-list-item-label">Submitted By</span>
                      <span className="sub-list-item-value">{s.submitted_by_name || "—"}</span>
                    </div>
                    <div className="sub-list-item-row">
                      <span className="sub-list-item-label">Last Updated</span>
                      <span className="sub-list-item-value">{formatDate(s.created_at)}</span>
                    </div>
                    {s.notes && (
                      <div className="sub-list-item-row">
                        <span className="sub-list-item-label">Notes</span>
                        <span className="sub-list-item-value">"{s.notes}"</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="sub-empty">Select an engagement to view its submissions.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}