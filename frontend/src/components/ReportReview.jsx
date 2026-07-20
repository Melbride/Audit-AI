import { useState, useEffect } from "react";
import {
  FileText,
  CheckCircle,
  AlertTriangle,
  Plus,
  Trash2,
  Save,
  Clock,
  ChevronRight,
  Shield,
  MessageSquare,
  Sparkles,
  TrendingUp,
  DollarSign
} from "./Icons";
import {
  getReport,
  updateReportCommentary,
  updateReportInsights,
  approveReport,
  requestReportChanges,
  exportReport,
  getExportDownloadUrl
} from "../services/api";
import "../styles/ReportReview.css";

// Helper to format currency values nicely
const formatCurrency = (val) => {
  if (val === undefined || val === null || isNaN(Number(val))) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(val);
};

// Helper to format timestamps
const formatDate = (dateStr) => {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return dateStr;
  }
};

export default function ReportReview({ reportId, user }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Form states
  const [commentary, setCommentary] = useState("");
  const [insights, setInsights] = useState([]);
  
  // Action states
  const [actionType, setActionType] = useState(null); // 'approve' | 'changes' | null
  const [actionNotes, setActionNotes] = useState("");
  
  // Submit states
  const [savingCommentary, setSavingCommentary] = useState(false);
  const [savingInsights, setSavingInsights] = useState(false);
  const [submittingAction, setSubmittingAction] = useState(false);
  
  // Alert/Feedback state
  const [alert, setAlert] = useState(null); // { type: 'success'|'error', message: '...' }

  const loadReportDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getReport(reportId);
      setData(res.data);
      setCommentary(res.data.version?.commentary || "");
      setInsights(res.data.version?.ai_insights || []);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.detail || "Failed to load report review details.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (reportId) {
      loadReportDetails();
    }
  }, [reportId]);

  // Alert helper
  const showAlert = (type, message) => {
    setAlert({ type, message });
    setTimeout(() => {
      setAlert(null);
    }, 5000);
  };

  // Save Commentary handler
  const handleSaveCommentary = async () => {
    if (!user?.user_id) {
      showAlert("error", "You must be logged in to edit commentary.");
      return;
    }
    try {
      setSavingCommentary(true);
      await updateReportCommentary(reportId, {
        commentary,
        edited_by: user.user_id
      });
      showAlert("success", "Report commentary updated successfully!");
      // Reload history/data
      const res = await getReport(reportId);
      setData(res.data);
    } catch (err) {
      console.error(err);
      showAlert("error", err.response?.data?.detail || "Failed to save commentary.");
    } finally {
      setSavingCommentary(false);
    }
  };

  // Add Insight item
  const handleAddInsight = () => {
    setInsights([
      ...insights,
      { id: `temp-${Date.now()}`, severity: "medium", text: "" }
    ]);
  };

  // Delete Insight item
  const handleDeleteInsight = (id) => {
    setInsights(insights.filter((item) => item.id !== id));
  };

  // Edit Insight properties
  const handleEditInsight = (id, key, val) => {
    setInsights(
      insights.map((item) => (item.id === id ? { ...item, [key]: val } : item))
    );
  };

  // Save AI Insights handler
  const handleSaveInsights = async () => {
    if (!user?.user_id) {
      showAlert("error", "You must be logged in to edit insights.");
      return;
    }
    // Validate empty insights
    if (insights.some((ins) => !ins.text.trim())) {
      showAlert("error", "All insights must contain some text.");
      return;
    }

    try {
      setSavingInsights(true);
      await updateReportInsights(reportId, {
        insights,
        edited_by: user.user_id
      });
      showAlert("success", "AI Insights updated successfully!");
      // Reload history/data
      const res = await getReport(reportId);
      setData(res.data);
    } catch (err) {
      console.error(err);
      showAlert("error", err.response?.data?.detail || "Failed to save AI insights.");
    } finally {
      setSavingInsights(false);
    }
  };

  // Decision Handler: Approve / Request Changes
  const handleActionConfirm = async () => {
    if (!user?.user_id) {
      showAlert("error", "User authentication missing.");
      return;
    }
    try {
      setSubmittingAction(true);
      const reqData = {
        approver_id: user.user_id,
        notes: actionNotes
      };

      if (actionType === "approve") {
        await approveReport(reportId, reqData);
        showAlert("success", "Report approved successfully and locked.");
      } else {
        await requestReportChanges(reportId, reqData);
        showAlert("success", "Changes requested. A new draft version has been created.");
      }

      setActionType(null);
      setActionNotes("");
      // Refresh entire state
      await loadReportDetails();
    } catch (err) {
      console.error(err);
      showAlert("error", err.response?.data?.detail || `Failed to process ${actionType}.`);
    } finally {
      setSubmittingAction(false);
    }
  };
// Export Report
const handleExport = async (format) => {
  try {
    const res = await exportReport(reportId, format);

    const downloadUrl = getExportDownloadUrl(
      res.data.export_id
    );

    window.open(downloadUrl, "_blank");

    showAlert(
      "success",
      `${format.toUpperCase()} report exported successfully.`
    );
  } catch (err) {
    console.error(err);
    showAlert(
      "error",
      err.response?.data?.detail || "Failed to export report."
    );
  }
};
  if (loading) {
    return (
      <div className="loader-container">
        <div className="spinner"></div>
        <p className="text-muted">Loading report review interface...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="report-review-container">
        <div className="alert-message alert-error">{error}</div>
      </div>
    );
  }

  const { report, version, history } = data || {};
  const isApproved = report?.status === "approved" || report?.status === "exported";

  return (
    <div className="report-review-container">
      {/* Alert Notification */}
      {alert && (
        <div className={`alert-message alert-${alert.type}`}>
          {alert.message}
        </div>
      )}

      {/* Header Summary */}
      <div className="report-header">
        <div className="report-header-info">
          <h1>
            {report.type === "custom"
              ? "Custom Range Audit Report"
              : `${report.type[0].toUpperCase()}${report.type.slice(1)} Audit Report`}
          </h1>
          <div className="report-meta-tags">
            <span>Period: {report.period_start} to {report.period_end}</span>
            <span>•</span>
            <span>Version: v{version?.version_number}</span>
            <span>•</span>
            <span className={`badge badge-${report.status}`}>
              {report.status?.replace("_", " ")}
            </span>
          </div>
        </div>
      </div>

      <div className="report-grid">
        {/* Main Content Pane */}
        <div className="report-main-pane">
          {/* Financial Summary */}
          <div className="review-section">
            <h2>
              <TrendingUp size={18} className="text-muted" />
              Financial Summary Metrics
            </h2>
            {version?.financial_summary && Object.keys(version.financial_summary).length > 0 ? (
              <div className="financial-metrics-grid">
                {Object.entries(version.financial_summary).map(([key, val]) => (
                  <div key={key} className="metric-card">
                    <div className="metric-label">{key.replace(/_/g, " ")}</div>
                    <div className="metric-label">
  {typeof val === "object" ? val.label : key.replace(/_/g, " ")}
</div>

<div className="metric-value">
  {typeof val === "object"
    ? formatCurrency(val.value)
    : typeof val === "number"
      ? formatCurrency(val)
      : val}
</div>

{typeof val === "object" && (
  <div className={`metric-delta ${val.up ? "positive" : "negative"}`}>
    {val.delta}
  </div>
)}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted text-[13px]">No financial metrics generated in this report version.</p>
            )}
          </div>

          {/* Commentary editor */}
          <div className="review-section">
            <h2>
              <MessageSquare size={18} className="text-muted" />
              Report Commentary / Executive Summary
            </h2>
            <textarea
              className="commentary-textarea"
              placeholder="Enter auditor's commentary and overview..."
              value={commentary}
              onChange={(e) => setCommentary(e.target.value)}
              disabled={isApproved}
            />
            {!isApproved && (
              <div className="section-footer">
                <button
                  className="btn btn-primary"
                  onClick={handleSaveCommentary}
                  disabled={savingCommentary}
                >
                  <Save size={14} />
                  {savingCommentary ? "Saving..." : "Save Commentary"}
                </button>
              </div>
            )}
          </div>

          {/* AI Insights & Observations */}
          <div className="review-section">
            <h2>
              <Sparkles size={18} className="text-muted" />
              Observations & AI Insights
            </h2>
            <div className="insights-list">
              {insights.map((ins, index) => (
                <div key={ins.id || index} className="insight-item">
                  <div className="insight-header">
                    {!isApproved ? (
                      <select
                        className="w-[120px] py-1 text-[12px] font-semibold"
                        value={ins.severity}
                        onChange={(e) =>
                          handleEditInsight(ins.id, "severity", e.target.value)
                        }
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    ) : (
                      <span className={`insight-severity sev-${ins.severity}`}>
                        {ins.severity}
                      </span>
                    )}

                    {!isApproved && (
                      <button
                        className="btn-delete-insight"
                        onClick={() => handleDeleteInsight(ins.id)}
                        title="Delete Insight"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>

                  <div className="insight-edit-area">
                    {!isApproved ? (
                      <textarea
                        className="w-full text-[13px] py-1.5 px-2"
                        placeholder="Enter observation or recommendation text..."
                        value={ins.text}
                        onChange={(e) =>
                          handleEditInsight(ins.id, "text", e.target.value)
                        }
                      />
                    ) : (
                      <p className="insight-content-text">{ins.text}</p>
                    )}
                  </div>
                </div>
              ))}
              {insights.length === 0 && (
                <p className="text-muted text-[13px] py-2">No insights recorded for this version.</p>
              )}
            </div>

            {!isApproved && (
              <div className="flex justify-between items-center border-t border-slate-100 pt-4 mt-4">
                <button
                  className="btn btn-secondary btn-add-insight"
                  onClick={handleAddInsight}
                >
                  <Plus size={14} />
                  Add Observation
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleSaveInsights}
                  disabled={savingInsights}
                >
                  <Save size={14} />
                  {savingInsights ? "Saving..." : "Save Insights"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Actions & Timeline */}
        <div className="report-sidebar-pane">
          {/* Action Box */}
          <div className={`action-box ${isApproved ? "action-box-locked" : ""}`}>
            {isApproved ? (
              <div className="text-center py-2">
                <Shield size={36} className="text-success mb-2" style={{ margin: "0 auto" }} />
                <h3 className="font-semibold text-slate-800 text-[14px]">Report Locked</h3>
                <p className="text-muted text-[12px] mt-1">
                  This report has been approved and cannot be modified further.
                </p>
              </div>
            ) : (
              <div>
                <h3 className="font-semibold text-slate-800 text-[14px] mb-3">Review Decisions</h3>
                
                {actionType ? (
                  <div className="action-form">
                    <p className="text-[12px] font-semibold text-slate-700 mb-1">
                      {actionType === "approve" ? "Notes for Approval:" : "Revisions Required Notes:"}
                    </p>
                    <textarea
                      className="action-notes-input"
                      placeholder="Add notes about your decision..."
                      value={actionNotes}
                      onChange={(e) => setActionNotes(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <button
                        className={`btn w-full ${actionType === "approve" ? "btn-primary" : "btn-danger"}`}
                        onClick={handleActionConfirm}
                        disabled={submittingAction}
                      >
                        {submittingAction ? "Submitting..." : "Confirm"}
                      </button>
                      <button
                        className="btn btn-secondary w-full"
                        onClick={() => {
                          setActionType(null);
                          setActionNotes("");
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="action-buttons-group">
                    <button
                      className="btn btn-primary w-full"
                      onClick={() => setActionType("approve")}
                    >
                      <CheckCircle size={14} />
                      Approve Report
                    </button>
                    <button
                      className="btn btn-danger w-full"
                      onClick={() => setActionType("changes")}
                    >
                      <AlertTriangle size={14} />
                      Request Changes
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          {/* Export Report */}
<div className="action-box">
  <h3
    className="font-semibold text-slate-800 text-[14px] mb-3"
    style={{ display: "flex", alignItems: "center", gap: "8px" }}
  >
    <FileText size={16} />
    Export Report
  </h3>

  <div className="action-buttons-group">
    <button
      className="btn btn-primary w-full"
      onClick={() => handleExport("pdf")}
    >
      📄 Export PDF
    </button>

    <button
      className="btn w-full"
      style={{
        background: "#16a34a",
        color: "#fff",
        marginTop: "10px"
      }}
      onClick={() => handleExport("excel")}
    >
      📊 Export Excel
    </button>

    <button
      className="btn btn-secondary w-full"
      style={{ marginTop: "10px" }}
      onClick={() => handleExport("csv")}
    >
      📑 Export CSV
    </button>
  </div>
</div>

          {/* Timeline / History */}
          <div className="action-box">
            <h3 className="font-semibold text-slate-800 text-[14px] mb-3 flex items-center gap-1.5">
              <Clock size={15} className="text-slate-400" />
              Version History
            </h3>
            <div className="timeline-list">
              {history?.map((h, i) => (
                <div
                  key={i}
                  className={`timeline-item ${i === 0 ? "timeline-item-active" : ""}`}
                >
                  <div className="timeline-dot"></div>
                  <div className="timeline-item-header">
                    <span className="timeline-version-name">Version v{h.version_number}</span>
                    <span className="timeline-date">{formatDate(h.created_at)}</span>
                  </div>
                  <div className="timeline-details">
                    <span>Status: </span>
                    <span className={`text-[11px] font-semibold text-slate-600`}>
                      {h.status?.replace("_", " ")}
                    </span>
                  </div>
                  {h.notes && (
                    <div className="timeline-notes">
                      "{h.notes}"
                    </div>
                  )}
                </div>
              ))}
              {(!history || history.length === 0) && (
                <p className="text-muted text-[12px]">No history available.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
