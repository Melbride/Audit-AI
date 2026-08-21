import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import {
  AlertTriangle,
  Diamond,
  Info,
  TrendingUp,
  Zap,
  Droplet,
  Landmark,
  BarChart3,
  DollarSign,
  Calendar,
  Receipt,
  Loader2,
  FileWarning,
  History,
} from "lucide-react";
import { getEngagement, saveAnalysis, openWorkspace } from "../services/api";
import GenerateReportModal from "../components/GenerateReportModal";
import FinancialCharts from "../components/FinancialCharts";
import "../styles/analysis.css";

const API_BASE = "http://localhost:8000";

const SEVERITY_ORDER = { high: 0, medium: 1, info: 2 };

const SEVERITY_CONFIG = {
  high:            { icon: AlertTriangle, label: "High Priority",  tone: "danger" },
  medium:          { icon: Diamond,       label: "Medium Priority", tone: "warning" },
  info:            { icon: Info,          label: "Info",            tone: "info" },
  trend:           { icon: TrendingUp,    label: "Trend",           tone: "success" },
  variance:        { icon: Zap,           label: "Variance",        tone: "purple" },
  anomaly:         { icon: AlertTriangle, label: "Anomaly",         tone: "danger" },
  profitability:   { icon: TrendingUp,    label: "Profitability",   tone: "success" },
  liquidity:       { icon: Droplet,       label: "Liquidity",       tone: "info" },
  solvency:        { icon: Landmark,      label: "Solvency",        tone: "purple" },
  margin:          { icon: BarChart3,     label: "Margin",          tone: "success" },
  expense_mix:     { icon: Diamond,       label: "Expense Mix",     tone: "warning" },
  revenue_mix:     { icon: DollarSign,    label: "Revenue Mix",     tone: "success" },
  comparative:     { icon: Calendar,      label: "Comparative",     tone: "info" },
  statement_check: { icon: Receipt,       label: "Statement Check", tone: "danger" },
};

const effectiveSeverity = (insight) => {
  if (insight.severity) return insight.severity;
  const cfg = SEVERITY_CONFIG[insight.type];
  if (!cfg) return "info";
  if (cfg.tone === "danger") return "high";
  if (cfg.tone === "warning") return "medium";
  return "info";
};

const sortBySeverity = (arr) =>
  [...(arr || [])].sort((a, b) => SEVERITY_ORDER[effectiveSeverity(a)] - SEVERITY_ORDER[effectiveSeverity(b)]);

const fmt = (n) => n == null ? "—" : new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(n);
const fmtShort = (n) => {
  if (n == null) return "—";
  if (n >= 1000000) return `KES ${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `KES ${(n / 1000).toFixed(0)}K`;
  return `KES ${n}`;
};
const fmtPct = (n) => n == null ? "—" : `${n}%`;
const trendOf = (n) => (n == null ? undefined : n >= 0 ? "positive" : "negative");
const fmtDate = (dateStr) => {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

export default function AnalysisPage({ user }) {
  const { engagementId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const { cleanResult, clientId: liveClientId, uploadResult, fileType: liveFileType, savedAnalysis, isViewMode } = location.state || {};
  const isSavedView = Boolean(isViewMode && savedAnalysis);

  const fileId = isSavedView ? savedAnalysis.file_id : (cleanResult?.file_id || uploadResult?.file_id);
  const clientId = isSavedView ? String(savedAnalysis.client_id) : liveClientId;
  const fileType = isSavedView ? savedAnalysis.file_type : liveFileType;

  const [engagement, setEngagement] = useState(null);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [analysisData, setAnalysisData] = useState(null);
  const [insights, setInsights] = useState(null);
  const [expandedInsights, setExpandedInsights] = useState({});
  const [saveStatus, setSaveStatus] = useState(null);
  const [submitStatus, setSubmitStatus] = useState(null);
  const [submitError, setSubmitError] = useState(null);

  useEffect(() => {
    if (!engagementId) {
      setEngagement(null);
      return;
    }
    getEngagement(engagementId)
      .then((res) => setEngagement(res.data))
      .catch((err) => console.error("Failed to load engagement", err));
  }, [engagementId]);

  useEffect(() => {
    if (!isSavedView) return;
    setAnalysisData(savedAnalysis.analysis_data || null);
    setInsights(savedAnalysis.insights_data || []);
  }, [isSavedView, savedAnalysis]);

  useEffect(() => {
    if (isSavedView || !fileId || !clientId) return;
    let isMounted = true;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const formData = new FormData();
        formData.append("file_id", fileId);
        formData.append("file_type", fileType || "general");
        const response = await axios.post(`${API_BASE}/analyze/${clientId}`, formData);
        
        if (!isMounted) return;
        setAnalysisData(response.data);

        if (response.data) {
          try {
            const insightsFormData = new FormData();
            insightsFormData.append("file_id", fileId);
            insightsFormData.append("file_type", fileType || "general");
            const insightsResponse = await axios.post(`${API_BASE}/analyze/${clientId}/insights`, insightsFormData);
            if (isMounted) setInsights(insightsResponse.data.ai_insights || []);
          } catch (insightsErr) {
            console.error("Auto-insights generation failed:", insightsErr);
            if (isMounted) setInsights([]);
          }
        }
      } catch (err) {
        if (isMounted) setError(err.response?.data?.detail || "Could not run financial analysis.");
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    load();

    return () => { isMounted = false; };
  }, [fileId, clientId, fileType, isSavedView]);

  const handleGenerateInsights = async () => {
    if (!fileId || !clientId) return;
    setInsightsLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file_id", fileId);
      formData.append("file_type", fileType || "general");
      const response = await axios.post(`${API_BASE}/analyze/${clientId}/insights`, formData);
      setInsights(response.data.ai_insights || []);
    } catch (err) {
      setError(err.response?.data?.detail || "Could not generate insights.");
    } finally {
      setInsightsLoading(false);
    }
  };

  const toggleInsightExpansion = (key) => {
    setExpandedInsights(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSaveAnalysis = async () => {
    if (!user || !analysisData || !fileId || !clientId) return;
    setSaveStatus("saving");
    try {
      const formData = new FormData();
      formData.append("user_id", user.user_id);
      formData.append("client_id", clientId);
      if (engagementId) formData.append("engagement_id", engagementId);
      formData.append("file_id", fileId);
      formData.append("file_type", fileType || "general");
      formData.append("analysis_data", JSON.stringify(analysisData));
      formData.append("insights_data", JSON.stringify(insights || []));
      await saveAnalysis(formData);
      setSaveStatus("saved");
    } catch (err) {
      console.error("Failed to save analysis:", err);
      setSaveStatus("error");
    }
  };

  const handleSubmitForReview = async () => {
    if (!user || !fileId || !clientId) return;
    setSubmitStatus("submitting");
    setSubmitError(null);
    try {
      const wsRes = await openWorkspace({ user_id: user.user_id, client_id: clientId, file_id: fileId });
      const ws = wsRes.data || wsRes;
      if (!ws?.workspace_id) throw new Error("Could not resolve workspace");

      await axios.post(`${API_BASE}/workspaces/${ws.workspace_id}/submit-for-review`, {
        submitted_by: user.user_id,
        notes: "",
      });
      setSubmitStatus("submitted");
    } catch (err) {
      console.error("Failed to submit for review:", err);
      setSubmitError(err.response?.data?.detail || null);
      setSubmitStatus("error");
    }
  };

  if (!isSavedView && (!fileId || !clientId)) {
    return (
      <div className="analysis">
        <div className="state-panel">
          <FileWarning size={28} color="var(--text-soft)" />
          <h3>No file selected for analysis</h3>
          <p>Please complete Upload → Mapping → Cleaning first, then proceed to Analysis from there.</p>
          <button className="btn btn-primary" style={{ marginTop: "16px" }} onClick={() => navigate("/")}>
            Go to Upload
          </button>
        </div>
      </div>
    );
  }

  if (isSavedView && (!savedAnalysis || !savedAnalysis.analysis_data)) {
    return (
      <div className="analysis">
        <div className="state-panel">
          <FileWarning size={28} color="var(--text-soft)" />
          <h3>Saved analysis not found</h3>
          <p>The saved analysis data could not be loaded. It may have been deleted or corrupted.</p>
          <button className="btn btn-primary" style={{ marginTop: "16px" }} onClick={() => navigate("/analysis/history")}>
            Back to History
          </button>
        </div>
      </div>
    );
  }

  const analysisScope = analysisData?.analysis_scope;
  const analysisBasis = analysisData?.analysis_basis;
  const financialAnalytics = analysisData?.financial_analytics;
  const comparativeAnalytics = analysisData?.comparative_analytics;
  const breakdowns = analysisData?.breakdowns || {};

  const isStatementBased = analysisBasis === "classified_accounts" && financialAnalytics;

  const profitLoss = financialAnalytics?.profit_loss;
  const ratios = financialAnalytics?.ratios;
  const balanceSheetSummary = financialAnalytics?.balance_sheet_summary;
  const expenseByCategory = financialAnalytics?.expense_breakdown?.by_category || {};
  const revenueByCategory = financialAnalytics?.revenue_breakdown?.by_category || {};

  const expenseDonutData = Object.entries(expenseByCategory).map(([label, v]) => ({ label, value: v.amount }));
  const revenueDonutData = Object.entries(revenueByCategory).map(([label, v]) => ({ label, value: v.amount }));

  const periodSummaries = comparativeAnalytics?.period_summaries || [];
  const latestComparison = comparativeAnalytics?.latest_period_comparison;

  return (
    <div className="analysis">
      <div className="page-title">
        <div>
          <h1>Financial Analytics</h1>
          <p>
            {isSavedView
              ? `${savedAnalysis.company_name || "—"} · ${fileType || "—"}`
              : `${uploadResult?.filename || "—"} · Client ${clientId}`}
          </p>
        </div>

        {isSavedView && (
          <div className="snapshot-banner">
            <History size={14} />
            <span>Viewing a saved snapshot from {fmtDate(savedAnalysis.created_at)}</span>
            {savedAnalysis.saved_by_name && <span className="snapshot-banner-user">saved by {savedAnalysis.saved_by_name}</span>}
            {savedAnalysis.engagement_name && <span className="snapshot-banner-engagement">· {savedAnalysis.engagement_name}</span>}
          </div>
        )}

        <div className="page-actions">
          {isSavedView ? (
            <button className="btn btn-secondary" onClick={() => navigate("/analysis/history")}>
               Back to History
            </button>
          ) : (
            <>
              {analysisData && user?.role === "Auditor" && (
                <>
                  {saveStatus === "saved" && <span className="save-status save-status--ok">Saved</span>}
                  {saveStatus === "error" && <span className="save-status save-status--error">Save failed</span>}
                  <button className="btn btn-secondary" onClick={handleSaveAnalysis} disabled={saveStatus === "saving"}>
                    {saveStatus === "saving" ? "Saving..." : "Save Analysis"}
                  </button>

                  {submitStatus === "submitted" ? (
                    <span className="save-status save-status--ok">Submitted for review</span>
                  ) : (
                    <button className="btn btn-primary" onClick={handleSubmitForReview} disabled={submitStatus === "submitting"}>
                      {submitStatus === "submitting" ? "Submitting..." : "Submit for Review"}
                    </button>
                  )}
                  {submitStatus === "error" && <span className="save-status save-status--error">{submitError || "Submit failed"}</span>}
                </>
              )}
              {engagement && (
                <button className="btn btn-secondary" onClick={() => setShowGenerateModal(true)}>
                  Generate Report
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {loading && (
        <div className="loading-row">
          <Loader2 size={14} className="spin" />
          Running financial analysis...
        </div>
      )}
      {error && <div className="banner banner--error">{error}</div>}

      {analysisData && (
        <>
          {!isStatementBased && (
            <div className="banner banner--warning">
              {analysisScope === "undetermined"
                ? "Could not determine enough structure in this file to run financial analysis."
                : "Showing generic column-based analysis. Accounting-aware statement analytics require account mapping to be completed for this file."}
            </div>
          )}

          {isStatementBased && (
            <>
              <div className="kpi-grid">
                <div className="kpi-card">
                  <h4>Revenue</h4>
                  <h2>{fmtShort(profitLoss?.total_revenue)}</h2>
                </div>
                <div className="kpi-card">
                  <h4>Net Profit</h4>
                  <h2 data-trend={trendOf(profitLoss?.net_profit)}>{fmtShort(profitLoss?.net_profit)}</h2>
                </div>
                <div className="kpi-card">
                  <h4>Working Capital</h4>
                  <h2>{fmtShort(balanceSheetSummary?.working_capital)}</h2>
                </div>
              </div>

              <div className="dashboard-section">
                <div className="section-header"><h2>Key Ratios</h2></div>
                <div className="ratio-grid">
                  {[
                    ["Current Ratio", ratios?.current_ratio],
                    ["Debt Ratio", ratios?.debt_ratio != null ? `${ratios.debt_ratio}%` : "—"],
                    ["Gross Margin", fmtPct(ratios?.gross_margin)],
                    ["Operating Margin", fmtPct(ratios?.operating_margin)],
                    ["Net Margin", fmtPct(ratios?.net_margin)],
                    ["Debt to Equity", ratios?.debt_to_equity],
                  ].map(([label, val]) => (
                    <div key={label} className="ratio-item">
                      <h5>{label}</h5>
                      <p>{val ?? "—"}</p>
                    </div>
                  ))}
                </div>
              </div>

              {comparativeAnalytics?.available && (
                <div className="dashboard-section">
                  <div className="section-header"><h2>Comparative Analytics</h2></div>

                  {latestComparison && (
                    <div className="comparison-grid">
                      {[
                        ["Revenue Change", latestComparison.revenue_change_pct],
                        ["Expense Change", latestComparison.expense_change_pct],
                        ["Net Profit Change", latestComparison.net_profit_change_pct],
                      ].map(([label, val]) => (
                        <div key={label} className="comparison-item">
                          <h5>{label}</h5>
                          <p data-trend={trendOf(val)}>{val != null ? `${val >= 0 ? "+" : ""}${val}%` : "—"}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {periodSummaries.length > 0 && (
                    <FinancialCharts periodSummaries={periodSummaries} />
                  )}

                  <div className="section-header" style={{ marginBottom: "8px" }}>
                    <h2 style={{ fontSize: "13px" }}>Period Summary</h2>
                  </div>
                  <div className="data-table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Period</th>
                          <th>Revenue</th>
                          <th>Expenses</th>
                          <th>Net Profit</th>
                          <th>Gross Margin</th>
                          <th>Net Margin</th>
                        </tr>
                      </thead>
                      <tbody>
                        {periodSummaries.map((p) => (
                          <tr key={p.period}>
                            <td className="label-cell">{p.period}</td>
                            <td>{fmtShort(p.total_revenue)}</td>
                            <td>{fmtShort(p.total_expenses)}</td>
                            <td>{fmtShort(p.net_profit)}</td>
                            <td>{fmtPct(p.gross_margin)}</td>
                            <td>{fmtPct(p.net_margin)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <FinancialCharts 
                expenseDonutData={expenseDonutData} 
                revenueDonutData={revenueDonutData} 
              />
            </>
          )}

          {!isStatementBased && Object.keys(breakdowns).length > 0 && (
            <div className="dashboard-section">
              <div className="section-header"><h2>Breakdowns</h2></div>
              {Object.entries(breakdowns).map(([key, data]) => (
                <div key={key} style={{ marginBottom: "16px" }}>
                  <p style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-soft)", margin: "0 0 8px" }}>
                    {key.replace(/_/g, " ")}
                  </p>
                  <div className="data-table-wrap">
                    <table className="data-table">
                      <tbody>
                        {Object.entries(data).sort((a, b) => b[1] - a[1]).map(([label, val]) => (
                          <tr key={label}>
                            <td>{label}</td>
                            <td className="num-cell" style={{ fontWeight: 600 }}>{fmt(val)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div>
            <div className="insights-toolbar">
              <div>
                <h2>Insights</h2>
                <p>Analysis explanations and recommendations, ranked by priority.</p>
              </div>
              {!insights && !isSavedView && (
                <button className="btn btn-primary" onClick={handleGenerateInsights} disabled={insightsLoading}>
                  {insightsLoading ? "Generating..." : "Generate Insights"}
                </button>
              )}
              {insights && !isSavedView && (
                <button className="btn btn-secondary" onClick={handleGenerateInsights} disabled={insightsLoading}>
                  {insightsLoading ? "Regenerating..." : "Regenerate Insights"}
                </button>
              )}
            </div>

            {insights && insights.length === 0 && (
              <p style={{ fontSize: "13px", color: "var(--text-soft)" }}>No notable insights found for this data.</p>
            )}

            {insights && insights.length > 0 && (
              <>
                <p style={{ fontSize: "12px", color: "var(--text-soft)", margin: "4px 0 14px" }}>
                  {insights.filter(i => effectiveSeverity(i) === "high").length} high-priority
                  {" · "}{insights.filter(i => effectiveSeverity(i) === "medium").length} medium
                  {" · "}{insights.filter(i => effectiveSeverity(i) === "info").length} info
                </p>
                <div className="insight-grid">
                  {sortBySeverity(insights).slice(0, 6).map((insight, idx) => {
                    const cfg = SEVERITY_CONFIG[insight.type] || SEVERITY_CONFIG[insight.severity] || SEVERITY_CONFIG.info;
                    const IconComponent = cfg.icon;
                    const insightKey = insight.id || insight.message || idx;
                    const isExpanded = expandedInsights[insightKey];
                    const hasDetails = insight.why || insight.recommendation;

                    return (
                      <div key={insightKey} className={`insight-card ${isExpanded ? 'expanded' : ''}`}>
                        <div className="insight-card-body">
                          <div className="insight-card-head">
                            <IconComponent size={18} className="insight-icon" data-tone={cfg.tone} />
                            <span className="insight-tag">{cfg.label}</span>
                            {hasDetails && (
                              <button 
                                className="insight-expand-btn"
                                onClick={() => toggleInsightExpansion(insightKey)}
                                aria-expanded={isExpanded}
                              >
                                {isExpanded ? '−' : '+'}
                              </button>
                            )}
                          </div>
                          <p className="insight-message">{insight.message}</p>
                          {isExpanded && hasDetails && (
                            <div className="insight-details">
                              {insight.why && (
                                <div className="insight-detail-row">
                                  <span className="insight-detail-label">Why:</span>
                                  <p>{insight.why}</p>
                                </div>
                              )}
                              {insight.recommendation && (
                                <div className="insight-detail-row">
                                  <span className="insight-detail-label">Recommendation:</span>
                                  <p>{insight.recommendation}</p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <button
                  className="btn btn-secondary"
                  style={{ marginTop: "16px" }}
                  onClick={() =>
                    navigate(`/insights/${clientId}/${fileId}`, {
                      state: {
                        insights,
                        clientId,
                        fileId,
                        engagementId,
                        filename: uploadResult?.filename,
                      },
                    })
                  }
                >
                  View all {insights.length} insights
                </button>
              </>
            )}
          </div>
        </>
      )}

      {showGenerateModal && engagement && (
        <GenerateReportModal
          user={user}
          initialClientId={engagement.client_id}
          initialEngagementId={engagementId}
          lockClientEngagement
          onClose={() => setShowGenerateModal(false)}
          onGenerated={(reportId) => {
            setShowGenerateModal(false);
            navigate(`/reports/${reportId}`);
          }}
        />
      )}
    </div>
  );
}