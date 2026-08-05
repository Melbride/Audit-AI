import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getUserWorkspaces } from "../services/api";

export default function MyWorkspaces({ user }) {
  const navigate = useNavigate();
  const [workspaces, setWorkspaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (!user) return;
    load();
  }, [user]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getUserWorkspaces(user.user_id);
      setWorkspaces(res.data || res || []);
    } catch (err) {
      console.error("Failed to load workspaces", err);
    } finally {
      setLoading(false);
    }
  };

  const formatStatus = (status) =>
    (status || "active").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const filteredWorkspaces = workspaces.filter((ws) => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (
      (ws.company_name || "").toLowerCase().includes(q) ||
      (ws.engagement_name || "").toLowerCase().includes(q) ||
      (ws.section_name || "").toLowerCase().includes(q) ||
      (ws.filename || "").toLowerCase().includes(q) ||
      (ws.status || "").toLowerCase().includes(q)
    );
  });

  if (loading) return <p className="loading-message">Loading your workspaces...</p>;

  return (
    <div>
      <div className="eng-header">
        <div>
          <h1>My Workspaces</h1>
          <p>Resume any file you're working on, without needing the original notification.</p>
        </div>
      </div>

      <div className="eng-table-card">
        <div className="eng-picker-row">
          <label className="eng-label" htmlFor="workspace-search">
            Search your workspaces
          </label>
          <input
            id="workspace-search"
            className="eng-input"
            placeholder="Search by client, engagement, section, filename, or status"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {workspaces.length === 0 ? (
          <p className="eng-empty">You have no workspaces yet.</p>
        ) : filteredWorkspaces.length === 0 ? (
          <p className="eng-empty">No workspaces match your search.</p>
        ) : (
          <table className="sections-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Engagement</th>
                <th>Section</th>
                <th>Filename</th>
                <th>Status</th>
                <th>Last Updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredWorkspaces.map((ws) => (
                <tr key={ws.workspace_id}>
                  <td>{ws.company_name || "—"}</td>
                  <td>{ws.engagement_name} (FY {ws.financial_year || "—"})</td>
                  <td>{ws.section_name || "—"}</td>
                  <td>{ws.filename || "—"}</td>
                  <td>
                    <span className={`status-badge status-${ws.status || "active"}`}>
                      {formatStatus(ws.status)}
                    </span>
                  </td>
                  <td>{ws.updated_at ? new Date(ws.updated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"}</td>
                  <td>
                    <button
                      className="action-btn secondary"
                      onClick={() => navigate(`/workspace/${ws.workspace_id}`)}
                    >
                      Open →
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