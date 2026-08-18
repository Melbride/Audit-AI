import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getSavedAnalysesForFile, deleteSavedAnalysis } from "../services/api";
import { X } from "lucide-react";
import "../styles/FileAnalysisHistory.css";

export default function FileAnalysisHistory({ engagementId, fileId, user }) {
  const navigate = useNavigate();
  const [analyses, setAnalyses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!engagementId || !fileId) return;
    loadAnalyses();
  }, [engagementId, fileId]);

  const loadAnalyses = async () => {
    setLoading(true);
    try {
      const res = await getSavedAnalysesForFile(engagementId, fileId);
      setAnalyses(res.data || res || []);
    } catch (err) {
      console.error("Failed to load file analysis history", err);
      setAnalyses([]);
    } finally {
      setLoading(false);
    }
  };

  const handleView = (analysis) => {
    navigate("/analysis", { state: { savedAnalysis: analysis, isViewMode: true } });
  };

  const handleDelete = async (analysisId, e) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this analysis?")) return;
    try {
      await deleteSavedAnalysis(analysisId);
      loadAnalyses();
    } catch (err) {
      console.error("Failed to delete analysis", err);
      alert("Failed to delete analysis.");
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  };

  if (loading) return <p className="fah-loading">Loading analysis history…</p>;

  if (analyses.length === 0) {
    return <p className="fah-empty">No saved analyses yet for this file.</p>;
  }

  return (
    <div className="fah-list">
      {analyses.map((analysis) => (
        <div key={analysis.analysis_id} className="fah-row" onClick={() => handleView(analysis)}>
          <div className="fah-row-main">
            <span className="fah-row-title">{analysis.file_type || "General"} analysis</span>
            <span className="fah-row-meta">
              <span className="fah-row-date">{formatDate(analysis.created_at)}</span>
              {analysis.saved_by_name && <span>saved by {analysis.saved_by_name}</span>}
            </span>
          </div>
          <div className="fah-row-actions">
            <button className="fah-view-link" onClick={(e) => { e.stopPropagation(); handleView(analysis); }}>
              View 
            </button>
            <button className="fah-delete-btn" onClick={(e) => handleDelete(analysis.analysis_id, e)} title="Delete">
              <X size={14} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}