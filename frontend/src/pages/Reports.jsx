import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FileText, Plus } from "../components/Icons";
import { getReports } from "../services/api";
import GenerateReportModal from "../components/GenerateReportModal";
import "../styles/ReportReview.css"; // reuses .badge / .badge-* status styles
import "../styles/Reports.css";

const STATUS_LABELS = {
  draft: "Draft",
  in_review: "In review",
  changes_requested: "Changes requested",
  approved: "Approved",
  exported: "Exported",
};

export default function Reports({ user }) {
  const navigate = useNavigate();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showGenerateModal, setShowGenerateModal] = useState(false);

  const loadReports = async () => {
    try {
      setLoading(true);
      const res = await getReports();
      setReports(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, []);

  const handleGenerated = (reportId) => {
    setShowGenerateModal(false);
    navigate(`/reports/${reportId}`);
  };

  if (loading) {
    return <div className="page"><p className="text-muted">Loading reports…</p></div>;
  }
  if (error) {
    return <div className="page"><div className="error">Couldn't load reports: {error}</div></div>;
  }

  return (
    <div className="page">
      <div className="header">
        <div className="logo" style={{ justifyContent: "space-between", width: "100%" }}>
          <span>Reports</span>
          <button
            className="btn btn-primary"
            onClick={() => setShowGenerateModal(true)}
          >
            <Plus size={14} />
            Generate Report
          </button>
        </div>
        <p className="subtitle">Every generated report across all clients, most recent first.</p>
      </div>

      {reports.length === 0 ? (
        <p className="text-muted">No reports have been generated yet.</p>
      ) : (
        <div className="table-wrapper">
          {reports.map((r) => (
            <Link key={r.id} to={`/reports/${r.id}`} className="report-row">
              <div className="report-row-main">
                <FileText size={16} className="report-row-icon" />
                <div>
                  <p className="report-row-title">
                    {r.type === "custom" ? "Custom range report" : `${r.type[0].toUpperCase()}${r.type.slice(1)} report`}
                  </p>
                  <p className="report-row-meta">
                    {r.period_start} – {r.period_end}
                    {r.created_by_name ? ` · ${r.created_by_name}` : ""}
                  </p>
                </div>
              </div>
              <div className="report-row-status">
                <span className={`badge badge-${r.status}`}>
                  {STATUS_LABELS[r.status] || r.status}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {showGenerateModal && (
        <GenerateReportModal
          user={user}
          onClose={() => setShowGenerateModal(false)}
          onGenerated={handleGenerated}
        />
      )}
    </div>
  );
}