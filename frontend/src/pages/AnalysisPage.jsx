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
  ArrowRight,
  ArrowLeft,
  History,
} from "lucide-react";
import { getEngagement, saveAnalysis, openWorkspace } from "../services/api";
import GenerateReportModal from "../components/GenerateReportModal";
import "../styles/analysis.css";

const API_BASE = "http://localhost:8000";

// ── COLORS (chart fills — kept as literal hex since donut/bar slices need a fixed sequence) ──
const CHART_COLORS = ["#2563eb", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#f97316"];

// ── SEVERITY SORTING ─────────────────────────────────────────────────────────────
const SEVERITY_ORDER = { high: 0, medium: 1, info: 2 };

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

// icon + label + semantic tone; tone drives color via CSS (data-tone attribute)
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

// ── MINI BAR CHART ────────────────────────────────────────────────────────────
function BarChart({ data, keys, colors, height = 160 }) {
  const max = Math.max(1, ...data.flatMap(d => keys.map(k => d[k] ?? 0)));
  const groupW = Math.floor(560 / Math.max(data.length, 1));
  const barW = Math.floor(groupW / (keys.length + 0.8));

  return (
    <svg viewBox={`0 0 ${data.length * groupW} ${height + 36}`} style={{ width: "100%", overflow: "visible" }}>
      {data.map((d, i) => (
        <g key={i} transform={`translate(${i * groupW + 4}, 0)`}>
          {keys.map((k, ki) => {
            const val = d[k] ?? 0;
            const h = max > 0 ? Math.round((val / max) * height) : 0;
            return (
              <rect key={k} x={ki * (barW + 2)} y={height - h} width={barW} height={h}
                fill={colors[ki]} rx="2" opacity="0.9">
                <title>{`${d.label} ${k}: ${fmt(val)}`}</title>
              </rect>
            );
          })}
          <text x={groupW / 2 - 8} y={height + 18} textAnchor="middle"
            className="chart-axis-label">{d.label}</text>
        </g>
      ))}
    </svg>
  );
}

// ── DONUT CHART ───────────────────────────────────────────────────────────────
function DonutChart({ data, colors, size = 150 }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = size / 2 - 8;
  const cx = size / 2, cy = size / 2;
  let angle = -Math.PI / 2;
  const slices = data.map((d, i) => {
    const sweep = (d.value / total) * 2 * Math.PI;
    const x1 = cx + r * Math.cos(angle);
    const y1 = cy + r * Math.sin(angle);
    angle += sweep;
    const x2 = cx + r * Math.cos(angle);
    const y2 = cy + r * Math.sin(angle);
    return {
      path: `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${sweep > Math.PI ? 1 : 0} 1 ${x2},${y2} Z`,
      color: colors[i % colors.length], label: d.label, value: d.value,
      pct: Math.round((d.value / total) * 100),
    };
  });
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
      {slices.map((s, i) => (
        <path key={i} d={s.path} fill={s.color} stroke="var(--background)" strokeWidth="2">
          <title>{`${s.label}: ${fmt(s.value)} (${s.pct}%)`}</title>
        </path>
      ))}
      <circle cx={cx} cy={cy} r={r * 0.52} fill="var(--background)" />
    </svg>
  );
}

// ── SPARKLINE ─────────────────────────────────────────────────────────────────
function Sparkline({ values, color, width = 80, height = 28 }) {
  if (!values || values.length < 2) return null;
  const max = Math.max(...values), min = Math.min(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  });
  return (
    <svg width={width} height={height}>
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── DONUT PANEL (chart + legend, shared by expense/revenue) ───────────────────
function DonutPanel({ data }) {
  const total = data.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div className="donut-panel">
      <DonutChart data={data} colors={CHART_COLORS} size={150} />
      <div className="donut-legend">
        {data.map((d, i) => {
          const pct = Math.round((d.value / total) * 100);
          return (
            <div key={d.label} className="legend-row">
              <span className="legend-dot" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
              <span className="legend-label">{d.label}</span>
              <span className="legend-pct">{pct}%</span>
              <span className="legend-value">{fmtShort(d.value)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function AnalysisPage({ user }) {
  const { engagementId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  // Two ways to land on this page:
  // 1. Fresh pipeline run — navigate('/analysis', { state: { cleanResult, clientId, uploadResult, fileType } })
  // 2. Viewing a saved analysis — navigate('/analysis', { state: { savedAnalysis, isViewMode: true } })
  //    (from AnalysisHistory.jsx, and eventually an engagement/client "View Analysis" link)
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
  const [saveStatus, setSaveStatus] = useState(null); // null | "saving" | "saved" | "error"
  const [submitStatus, setSubmitStatus] = useState(null); // null | "submitting" | "submitted" | "error"
  const [submitError, setSubmitError] = useState(null);

  // Optional engagement fetch — only used for the "Generate Report" button context
  useEffect(() => {
    if (!engagementId) {
      setEngagement(null);
      return;
    }
    getEngagement(engagementId)
      .then((res) => setEngagement(res.data))
      .catch((err) => console.error("Failed to load engagement", err));
  }, [engagementId]);

  // Saved-view mode: load straight from the saved snapshot, no /analyze call
  useEffect(() => {
    if (!isSavedView) return;
    setAnalysisData(savedAnalysis.analysis_data || null);
    setInsights(savedAnalysis.insights_data || []);
  }, [isSavedView, savedAnalysis]);

  // Live mode: real data fetch — runs whenever we have a real file_id + client_id from the pipeline
  useEffect(() => {
    if (isSavedView) return; // saved view already has its data, never re-runs /analyze
    if (!fileId || !clientId) return;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const formData = new FormData();
        formData.append("file_id", fileId);
        formData.append("file_type", fileType || "general");
        const response = await axios.post(`${API_BASE}/analyze/${clientId}`, formData);
        setAnalysisData(response.data);
        
        // Auto-generate insights after financial analysis completes
        if (response.data && !isSavedView) {
          try {
            const insightsFormData = new FormData();
            insightsFormData.append("file_id", fileId);
            insightsFormData.append("file_type", fileType || "general");
            const insightsResponse = await axios.post(`${API_BASE}/analyze/${clientId}/insights`, insightsFormData);
            setInsights(insightsResponse.data.ai_insights || []);
          } catch (insightsErr) {
            console.error("Auto-insights generation failed:", insightsErr);
            // Don't block the main analysis if insights fail
            setInsights([]);
          }
        }
      } catch (err) {
        setError(err.response?.data?.detail || "Could not run financial analysis.");
      } finally {
        setLoading(false);
      }
    };
    load();
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

  const toggleInsightExpansion = (index) => {
    setExpandedInsights(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  // Persists the already-computed analysis + insights for this file so they
  // can be revisited later without re-running /analyze. Only real data —
  // requires analysisData to already exist, never falls back to a placeholder.
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
      const wsRes = await openWorkspace({
        user_id: user.user_id,
        client_id: clientId,
        file_id: fileId,
      });
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

  // If there's no real pipeline data and no saved analysis to view, fall back
  // to a simple "no data" state instead of pretending with mock data
  // Note: In saved view mode, we don't need fileId/clientId since we have the data directly
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

  // In saved view mode, also validate that we have the required saved analysis data
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
  const analysisBasis = analysisData?.analysis_basis; // "classified_accounts" or "generic_columns"
  const financialAnalytics = analysisData?.financial_analytics;
  const comparativeAnalytics = analysisData?.comparative_analytics;
  const breakdowns = analysisData?.breakdowns || {};
  const monthlyTrend = analysisData?.monthly_trend || {};

  const isStatementBased = analysisBasis === "classified_accounts" && financialAnalytics;

  // ── Build chart data from real financial_analytics (statement-based path) ──
  const profitLoss = financialAnalytics?.profit_loss;
  const ratios = financialAnalytics?.ratios;
  const balanceSheetSummary = financialAnalytics?.balance_sheet_summary;
  const expenseByCategory = financialAnalytics?.expense_breakdown?.by_category || {};
  const revenueByCategory = financialAnalytics?.revenue_breakdown?.by_category || {};

  const expenseDonutData = Object.entries(expenseByCategory).map(([label, v]) => ({ label, value: v.amount }));
  const revenueDonutData = Object.entries(revenueByCategory).map(([label, v]) => ({ label, value: v.amount }));

  const periodSummaries = comparativeAnalytics?.period_summaries || [];
  const periodBarData = periodSummaries.map(p => ({
    label: p.period,
    revenue: p.total_revenue,
    expenses: p.total_expenses,
  }));
  const latestComparison = comparativeAnalytics?.latest_period_comparison;

  return (
    <div className="analysis">

      {/* ── HEADER ── */}
      <div className="page-title">
        <div>
          <h1>Financial Analytics</h1>
          <p>
            {isSavedView
              ? `${savedAnalysis.company_name || "—"} · ${fileType || "—"}`
              : `${uploadResult?.filename || "—"} · Client ${clientId}`}
          </p>
        </div>
        {/* Saved-snapshot attribution banner — who saved this and when */}
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
          {/* ── SCOPE BANNER ── */}
          {!isStatementBased && (
            <div className="banner banner--warning">
              {analysisScope === "undetermined"
                ? "Could not determine enough structure in this file to run financial analysis."
                : "Showing generic column-based analysis. Accounting-aware statement analytics require account mapping to be completed for this file."}
            </div>
          )}

          {/* ═══════════════════ STATEMENT-BASED VIEW (trial balance / general ledger) ═══════════════════ */}
          {isStatementBased && (
            <>
              {/* KPI CARDS */}
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

              {/* KEY RATIOS */}
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

              {/* COMPARATIVE ANALYTICS */}
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

                  {periodBarData.length > 0 && (
                    <div style={{ marginBottom: "16px" }}>
                      <BarChart data={periodBarData} keys={["revenue", "expenses"]} colors={["#2a78d6", "#e34948"]} height={140} />
                    </div>
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

              {/* EXPENSE / REVENUE BREAKDOWN */}
              <div className="chart-grid" style={{ marginBottom: "28px" }}>
                {expenseDonutData.length > 0 && (
                  <div className="chart-card">
                    <h3>Expense Breakdown</h3>
                    <DonutPanel data={expenseDonutData} />
                  </div>
                )}
                {revenueDonutData.length > 0 && (
                  <div className="chart-card">
                    <h3>Revenue Breakdown</h3>
                    <DonutPanel data={revenueDonutData} />
                  </div>
                )}
              </div>
            </>
          )}

          {/* ═══════════════════ GENERIC VIEW (non-ledger files) ═══════════════════ */}
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

          {/* ── INSIGHTS (preview) ── */}
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
                  {sortBySeverity(insights).slice(0, 6).map((insight, i) => {
                    const cfg = SEVERITY_CONFIG[insight.type] || SEVERITY_CONFIG[insight.severity] || SEVERITY_CONFIG.info;
                    const IconComponent = cfg.icon;
                    const isExpanded = expandedInsights[i];
                    const hasDetails = insight.why || insight.recommendation;

                    return (
                      <div key={i} className={`insight-card ${isExpanded ? 'expanded' : ''}`}>
                        <div className="insight-card-body">
                          <div className="insight-card-head">
                            <IconComponent size={18} className="insight-icon" data-tone={cfg.tone} />
                            <span className="insight-tag">{cfg.label}</span>
                            {hasDetails && (
                              <button 
                                className="insight-expand-btn"
                                onClick={() => toggleInsightExpansion(i)}
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
                    navigate("/insights", {
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