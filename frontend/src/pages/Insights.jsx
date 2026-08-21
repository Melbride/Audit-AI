import { useState, useMemo, useEffect } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
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
  FileWarning,
} from "lucide-react";
import { generateInsights } from "../services/api";
import "../styles/analysis.css";

const API_BASE = "http://localhost:8000";

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

const SEVERITY_FILTERS = [
  { key: "all", label: "All" },
  { key: "high", label: "High" },
  { key: "medium", label: "Medium" },
  { key: "info", label: "Info" },
];

export default function Insights() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();

  const stateData = location.state || {};
  const { insights: stateInsights, clientId: stateClientId, fileId: stateFileId, filename: stateFilename } = stateData;
  const { clientId: urlClientId, fileId: urlFileId } = params || {};

  const [insights, setInsights] = useState(stateInsights || null);
  const [clientId] = useState(stateClientId || urlClientId || null);
  const [fileId] = useState(stateFileId || urlFileId || null);
  const [filename, setFilename] = useState(stateFilename || null);
  const [loading, setLoading] = useState(!stateInsights);
  const [error, setError] = useState(null);

  const [severityFilter, setSeverityFilter] = useState("all");
  const [expandedInsights, setExpandedInsights] = useState({});

  const toggleInsightExpansion = (key) => {
    setExpandedInsights((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  useEffect(() => {
    if (stateInsights) {
      setLoading(false);
      return;
    }

    if (!urlClientId || !urlFileId) {
      setLoading(false);
      setError("No insights data available. Please access insights from the Analysis page.");
      return;
    }

    let isMounted = true;

    const fetchInsights = async () => {
      setLoading(true);
      setError(null);
      try {
        const formData = new FormData();
        formData.append("file_id", urlFileId);
        formData.append("file_type", "general");

        const response = await generateInsights(urlClientId, formData);
        if (!isMounted) return;
        
        setInsights(response.data.ai_insights || []);

        try {
          const fileResponse = await axios.get(`${API_BASE}/files/${urlFileId}`);
          if (isMounted) setFilename(fileResponse.data?.filename || `File ${urlFileId}`);
        } catch {
          if (isMounted) setFilename(`File ${urlFileId}`);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.response?.data?.detail || "Could not load insights. Please access insights from the Analysis page.");
          setInsights([]);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchInsights();

    return () => {
      isMounted = false;
    };
  }, [stateInsights, urlClientId, urlFileId]);

  const filteredInsights = useMemo(() => {
    if (!insights) return [];
    const base = severityFilter === "all" ? insights : insights.filter((i) => effectiveSeverity(i) === severityFilter);
    return sortBySeverity(base);
  }, [insights, severityFilter]);

  const counts = useMemo(() => {
    const c = { high: 0, medium: 0, info: 0 };
    (insights || []).forEach((i) => {
      const sev = effectiveSeverity(i);
      if (c[sev] !== undefined) c[sev] += 1;
    });
    return c;
  }, [insights]);

  if (loading) {
    return (
      <div className="analysis">
        <div className="state-panel">
          <div className="loading-spinner">Loading insights...</div>
        </div>
      </div>
    );
  }

  if (error && !insights) {
    return (
      <div className="analysis">
        <div className="state-panel">
          <FileWarning size={28} color="var(--text-soft)" />
          <h3>Could not load insights</h3>
          <p>{error}</p>
          <button className="btn btn-primary" style={{ marginTop: "16px" }} onClick={() => navigate(-1)}>
            Back to Previous Page
          </button>
        </div>
      </div>
    );
  }

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
          <p style={{ fontSize: "12px", color: "var(--text-soft)", marginTop: "4px" }}>
            Sorted by priority — high-priority findings need attention first.
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary" onClick={() => navigate(-1)}>
            Back to Analytics
          </button>
        </div>
      </div>

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
          {filteredInsights.map((insight, idx) => {
            const cfg = SEVERITY_CONFIG[insight.type] || SEVERITY_CONFIG[insight.severity] || SEVERITY_CONFIG.info;
            const IconComponent = cfg.icon;
            
            const itemKey = insight.id || insight.message || idx;
            const isExpanded = Boolean(expandedInsights[itemKey]);
            const hasDetails = Boolean(insight.why || insight.recommendation);

            return (
              <div key={itemKey} className={`insight-card insight-card--full ${isExpanded ? "expanded" : ""}`}>
                <div className="insight-card-body">
                  <div className="insight-card-head">
                    <IconComponent size={18} className="insight-icon" data-tone={cfg.tone} />
                    <span className="insight-tag">{cfg.label}</span>
                    {hasDetails && (
                      <button
                        className="insight-expand-btn"
                        onClick={() => toggleInsightExpansion(itemKey)}
                        aria-expanded={isExpanded}
                      >
                        {isExpanded ? "−" : "+"}
                      </button>
                    )}
                  </div>
                  <p className="insight-message">{insight.message}</p>

                  {isExpanded && hasDetails && (
                    <div className="insight-detail">
                      {insight.why && (
                        <div className="insight-detail-row">
                          <span className="insight-detail-label">Why</span>
                          <p>{insight.why}</p>
                        </div>
                      )}
                      {insight.recommendation && (
                        <div className="insight-detail-row">
                          <span className="insight-detail-label">Recommended action</span>
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