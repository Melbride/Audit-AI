import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getSavedAnalyses, deleteSavedAnalysis } from "../services/api";
import { FileText, Calendar, ChevronRight, TrendingUp, Trash2 } from "lucide-react";
import "../styles/AnalysisHistory.css";

export default function AnalysisHistory({ user }) {
  const navigate = useNavigate();
  const [analyses, setAnalyses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState(null);

  useEffect(() => {
    loadAnalyses();
  }, []);

  const loadAnalyses = async () => {
    setLoading(true);
    try {
      const response = await getSavedAnalyses(user.user_id);
      setAnalyses(response.data || response);
    } catch (err) {
      console.error("Failed to load analyses:", err);
    } finally {
      setLoading(false);
    }
  };

  // Filter analyses based on client selection
  const filteredAnalyses = selectedClient 
    ? analyses.filter(a => a.client_id == selectedClient)
    : analyses;

  // Group analyses by client
  const analysesByClient = analyses.reduce((acc, analysis) => {
    const clientId = analysis.client_id;
    if (!acc[clientId]) {
      acc[clientId] = {
        client: {
          company_name: analysis.company_name || 'Unknown Client',
          client_id: clientId
        },
        analyses: []
      };
    }
    acc[clientId].analyses.push(analysis);
    return acc;
  }, {});

  const handleViewAnalysis = (analysis) => {
    // Navigate to analysis page with saved data
    navigate('/analysis', { 
      state: { 
        savedAnalysis: analysis,
        isViewMode: true
      }
    });
  };

  const handleDelete = async (analysisId, e) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this analysis?')) return;
    
    try {
      await deleteSavedAnalysis(analysisId);
      loadAnalyses();
    } catch (err) {
      console.error("Failed to delete analysis:", err);
      alert('Failed to delete analysis');
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "—";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  };

  if (loading) {
    return (
      <div className="analysis-history">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading saved analyses...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="analysis-history">
      <div className="analysis-history-header">
        <div>
          <h1>Saved Analyses</h1>
          <p>View and manage your saved financial analyses</p>
        </div>
      </div>

      {/* Client filter */}
      {Object.keys(analysesByClient).length > 1 && (
        <div className="analysis-filters">
          <div className="filter-group">
            <label>Filter by Client:</label>
            <select 
              value={selectedClient || ""} 
              onChange={(e) => setSelectedClient(e.target.value || null)}
            >
              <option value="">All Clients</option>
              {Object.entries(analysesByClient).map(([clientId, { client }]) => (
                <option key={clientId} value={clientId}>
                  {client.company_name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Analyses List */}
      {Object.keys(analysesByClient).length === 0 ? (
        <div className="empty-state">
          <FileText size={48} color="var(--text-soft)" />
          <h3>No saved analyses yet</h3>
          <p>Complete an analysis and click "Save Analysis" to see it here.</p>
        </div>
      ) : (
        <div className="analysis-list">
          {Object.entries(analysesByClient).map(([clientId, { client, analyses: clientAnalyses }]) => {
            const displayAnalyses = selectedClient 
              ? clientAnalyses.filter(a => a.client_id == selectedClient)
              : clientAnalyses;
            
            if (displayAnalyses.length === 0) return null;
            
            return (
              <div key={clientId} className="client-group">
                <div className="client-header">
                  <h3>{client.company_name}</h3>
                  <span className="file-count">{displayAnalyses.length} analysis{displayAnalyses.length > 1 ? 's' : ''}</span>
                </div>
                <div className="files-grid">
                  {displayAnalyses.map(analysis => (
                    <div key={analysis.analysis_id} className="file-card">
                      <div className="file-icon">
                        <FileText size={24} />
                      </div>
                      <div className="file-info">
                        <h4>{analysis.file_type || 'General'} Analysis</h4>
                        <div className="file-meta">
                          <span className="meta-item">
                            <Calendar size={14} />
                            {formatDate(analysis.created_at)}
                          </span>
                          {analysis.engagement_name && (
                            <span className="engagement-badge">{analysis.engagement_name}</span>
                          )}
                        </div>
                      </div>
                      <div className="file-actions">
                        <button 
                          className="analyze-btn"
                          onClick={() => handleViewAnalysis(analysis)}
                        >
                          <TrendingUp size={16} />
                          View
                        </button>
                        <button 
                          className="delete-btn"
                          onClick={(e) => handleDelete(analysis.analysis_id, e)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
