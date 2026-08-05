import { useState, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  ArrowLeft,
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
  Lightbulb,
  FileWarning,
} from "lucide-react";
import "../styles/analysis.css";

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

const SEVERITY_FILTERS = [
  { key: "all", label: "All" },
  { key: "high", label: "High" },
  { key: "medium", label: "Medium" },
  { key: "info", label: "Info" },
];

export default function Insights() {
  const navigate = useNavigate();
  const location = useLocation();
  const { insights, clientId, fileId, filename } = location.state || {};

  const [severityFilter, setSeverityFilter] = useState("all");

  const filteredInsights = useMemo(() => {
    if (!insights) return [];
    if (severityFilter === "all") return insights;
    return insights.filter((i) => i.severity === severityFilter);
  }, [insights, severityFilter]);

  const counts = useMemo(() => {
    const c = { high: 0, medium: 0, info: 0 };
    (insights || []).forEach((i) => {
      if (c[i.severity] !== undefined) c[i.severity] += 1;
    });
    return c;
  }, [insights]);

  // No insights were passed in — e.g. a direct page load / refresh — so
  // there's nothing to show. Send the auditor back to Analysis to generate.
  if (!insights || insights.length === 0) {
    return (
      <div className="analysis">
        <div className="state-panel">
          <FileWarning size={28} color="var(--text-soft)" />
          <h3>No insights to show</h3>
          <p>Generate insights from the Financial Analytics page first, then come back here.</p>
          <button className="btn btn-primary" style={{ marginTop: "16px" }} onClick={() => navigate(-1)}>
            Back to Analytics
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="analysis">
      <div className="page-title">
        <div>
          <h1>Insights &amp; Recommendations</h1>
          <p>
            {filename || "—"} · Client {clientId}
            {fileId ? ` · ${insights.length} insight${insights.length === 1 ? "" : "s"}` : ""}
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary" onClick={() => navigate(-1)}>
            <ArrowLeft size={14} /> Back to Analytics
          </button>
        </div>
      </div>

      {/* ── SEVERITY FILTER ── */}
      <div className="filter-bar">
        {SEVERITY_FILTERS.map((f) => (
          <button
            key={f.key}
            className={`filter-chip ${severityFilter === f.key ? "is-active" : ""}`}
            onClick={() => setSeverityFilter(f.key)}
          >
            {f.label}
            {f.key !== "all" && counts[f.key] > 0 && (
              <span className="filter-chip-count">{counts[f.key]}</span>
            )}
          </button>
        ))}
      </div>

      {filteredInsights.length === 0 ? (
        <p style={{ fontSize: "13px", color: "var(--text-soft)" }}>
          No insights at this severity level.
        </p>
      ) : (
        <div className="insights-page-grid">
          {filteredInsights.map((insight, i) => {
            const cfg = SEVERITY_CONFIG[insight.type] || SEVERITY_CONFIG[insight.severity] || SEVERITY_CONFIG.info;
            const IconComponent = cfg.icon;

            return (
              <div key={i} className="insight-card insight-card--full">
                <div className="insight-card-body">
                  <div className="insight-card-head">
                    <IconComponent size={18} className="insight-icon" data-tone={cfg.tone} />
                    <span className="insight-tag">{cfg.label}</span>
                  </div>
                  <p className="insight-message">{insight.message}</p>

                  {(insight.why || insight.recommendation) && (
                    <div className="insight-detail">
                      {insight.why && (
                        <div className="insight-detail-row">
                          <span className="insight-detail-label">Why</span>
                          <p>{insight.why}</p>
                        </div>
                      )}
                      {insight.recommendation && (
                        <div className="insight-detail-row">
                          <span className="insight-detail-label">
                            <Lightbulb size={12} /> Recommended action
                          </span>
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
      )}
    </div>
  );
}