import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getSavedAnalysesForFile, deleteSavedAnalysis } from "../services/api";
import { FileText, Calendar, TrendingUp, Trash2 } from "lucide-react";

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

  if (loading) return <p>Loading analysis history...</p>;

  if (analyses.length === 0) {
    return <p className="empty-message">No saved analyses yet for this file.</p>;
  }

  return (
    <div className="file-analysis-history-list">
      {analyses.map((analysis) => (
        <div key={analysis.analysis_id} className="file-card" onClick={() => handleView(analysis)}>
          <div className="file-icon">
            <FileText size={20} />
          </div>
          <div className="file-info">
            <h4>{analysis.file_type || "General"} Analysis</h4>
            <div className="file-meta">
              <span className="meta-item">
                <Calendar size={14} />
                {formatDate(analysis.created_at)}
              </span>
              {analysis.saved_by_name && <span className="meta-item">by {analysis.saved_by_name}</span>}
            </div>
          </div>
          <div className="file-actions">
            <button className="analyze-btn" onClick={(e) => { e.stopPropagation(); handleView(analysis); }}>
              <TrendingUp size={16} /> View
            </button>
            <button className="delete-btn" onClick={(e) => handleDelete(analysis.analysis_id, e)}>
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
