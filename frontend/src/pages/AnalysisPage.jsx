import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getEngagement } from "../services/api";
import GenerateReportModal from "../components/GenerateReportModal";

// ── MOCK DATA ─────────────────────────────────────────────────────────────────
const MOCK_FULL = {
  client_id: "5",
  file_type: "bank_transactions",
  analysis_scope: "full",
  period: "2024",
  financial_summary: {
    total_revenue: 450000,
    total_expenses: 320000,
    net_profit: 130000,
    expense_by_department: { IT: 120000, Operations: 90000, Finance: 60000, HR: 30000, Marketing: 20000 },
    monthly_trend: [
      { month: "Jan", revenue: 35000, expenses: 28000 },
      { month: "Feb", revenue: 40000, expenses: 25000 },
      { month: "Mar", revenue: 38000, expenses: 30000 },
      { month: "Apr", revenue: 42000, expenses: 27000 },
      { month: "May", revenue: 45000, expenses: 32000 },
      { month: "Jun", revenue: 41000, expenses: 29000 },
      { month: "Jul", revenue: 43000, expenses: 31000 },
      { month: "Aug", revenue: 39000, expenses: 26000 },
      { month: "Sep", revenue: 44000, expenses: 33000 },
      { month: "Oct", revenue: 47000, expenses: 28000 },
      { month: "Nov", revenue: 36000, expenses: 31000 },
      { month: "Dec", revenue: 50000, expenses: 30000 },
    ],
  },
  ai_insights: [
    {
      type: "anomaly",
      severity: "high",
      title: "IT Department Overspend",
      narrative: "IT department expenditure reached KES 120,000, representing 37.5% of total expenses — significantly above the typical benchmark of 20–25% for organizations of this size. This spike was most pronounced in Q3, where IT costs exceeded the monthly average by 18%. The pattern suggests unplanned infrastructure purchases or software licensing renewals that were not captured in the original budget.",
      guideline: "Conduct a line-item review of IT invoices for Q3. Ensure all recurring software subscriptions are consolidated into a single vendor contract where possible, and establish a pre-approval threshold for IT purchases above KES 10,000.",
    },
    {
      type: "anomaly",
      severity: "medium",
      title: "Transport Expense Spike in February",
      narrative: "Transport and travel expenses increased by 22% in February compared to January, rising from an estimated KES 4,200 to KES 5,100. This increase occurred during a period of flat revenue growth, suggesting the cost was not tied to business development activity. No corresponding increase in client visits or field assignments was recorded in the same period.",
      guideline: "Request supporting documentation (receipts, travel logs) for all transport claims submitted in February. Consider implementing a monthly travel budget cap per department and requiring manager sign-off for claims exceeding KES 2,000.",
    },
    {
      type: "trend",
      severity: "info",
      title: "Consistent Revenue Growth Trajectory",
      narrative: "Revenue has grown steadily across the financial year, starting at KES 35,000 in January and reaching KES 50,000 in December — a 43% increase over 12 months. The growth is particularly strong in Q4, with October and December recording the two highest monthly revenues. This pattern is consistent with seasonal demand cycles common in this industry.",
      guideline: "Use Q4 performance as the baseline for next year's budget planning. Consider front-loading sales and marketing spend in Q1 and Q2 to smooth the seasonal dip observed in January and November, and to sustain momentum throughout the year.",
    },
    {
      type: "variance",
      severity: "medium",
      title: "Profit Margin Below Target",
      narrative: "The net profit margin for the period stands at 28.9% (KES 130,000 on KES 450,000 revenue). While profitable, this falls below the industry benchmark of 35% for comparable firms. The primary drag is the Operations department, which accounts for 28% of total expenses (KES 90,000), and has shown limited efficiency gains despite revenue growth of 43%.",
      guideline: "Commission an operational efficiency review focusing on the Operations department. Identify recurring costs that have not scaled proportionally with revenue, and set a target to reduce the expense-to-revenue ratio from 71% to 65% by mid-year.",
    },
    {
      type: "trend",
      severity: "info",
      title: "Marketing Spend Underutilised",
      narrative: "Marketing expenditure totalled only KES 20,000 for the full year — just 6.25% of total expenses. Given the strong revenue growth observed in Q4, it is likely that increased marketing investment could have accelerated customer acquisition earlier in the year. The current allocation is low relative to the 10–15% marketing spend typical for growing firms in this sector.",
      guideline: "Increase the marketing budget allocation for the next financial year to at least 10% of projected revenue. Prioritise digital channels with measurable ROI (email campaigns, social media, SEO) and schedule a mid-year review to reallocate funds based on channel performance.",
    },
  ],
};

const MOCK_EXPENSE_ONLY = {
  client_id: "5",
  file_type: "Acme Expenses Custom",
  analysis_scope: "expense_only",
  period: "2024",
  financial_summary: {
    total_revenue: null,
    total_expenses: 320000,
    net_profit: null,
    expense_by_department: { IT: 120000, Operations: 90000, Finance: 60000, HR: 50000 },
    monthly_trend: [
      { month: "Jan", revenue: null, expenses: 28000 },
      { month: "Feb", revenue: null, expenses: 25000 },
      { month: "Mar", revenue: null, expenses: 30000 },
    ],
  },
  ai_insights: [
    {
      type: "info",
      severity: "info",
      title: "Expense-Only Data Detected",
      narrative: "The uploaded file contains only expense records — no revenue or income figures were identified. As a result, profit and loss calculations cannot be completed, and the revenue trend chart has been hidden. The expense breakdown and monthly cost trends are still available for review.",
      guideline: "To unlock the full analysis including profit/loss charts and margin calculations, upload a corresponding revenue or bank statement file for the same period and run the combined analysis.",
    },
  ],
};

// ── COLORS ────────────────────────────────────────────────────────────────────
const CHART_COLORS = ["#2a78d6", "#1baf7a", "#eda100", "#27ae60", "#4a3aa7", "#e34948", "#e87ba4", "#eb6834"];

const SEVERITY_CONFIG = {
  high:     { bg: "#FCEBEB", border: "#F09595", tag: "#A32D2D", tagBg: "#F5B7B1", icon: "⚠️", label: "High Priority" },
  medium:   { bg: "#FAEEDA", border: "#FAC775", tag: "#854F0B", tagBg: "#FDEBD0", icon: "◆",  label: "Medium Priority" },
  info:     { bg: "#E6F1FB", border: "#B5D4F4", tag: "#185FA5", tagBg: "#D6EAF8", icon: "ℹ️", label: "Info" },
  trend:    { bg: "#EAF3DE", border: "#C0DD97", tag: "#3B6D11", tagBg: "#D5F5E3", icon: "📈", label: "Trend" },
  variance: { bg: "#F4ECF7", border: "#D7BDE2", tag: "#6C3483", tagBg: "#E8DAEF", icon: "⚡", label: "Variance" },
  anomaly:  { bg: "#FCEBEB", border: "#F09595", tag: "#A32D2D", tagBg: "#F5B7B1", icon: "⚠️", label: "Anomaly" },
};

const fmt = (n) => n == null ? "—" : new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(n);
const fmtShort = (n) => {
  if (n == null) return "—";
  if (n >= 1000000) return `KES ${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `KES ${(n / 1000).toFixed(0)}K`;
  return `KES ${n}`;
};

// ── MINI BAR CHART ────────────────────────────────────────────────────────────
function BarChart({ data, keys, colors, height = 160 }) {
  const max = Math.max(...data.flatMap(d => keys.map(k => d[k] ?? 0)));
  const groupW = Math.floor(560 / data.length);
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
                <title>{`${d.month} ${k}: ${fmt(val)}`}</title>
              </rect>
            );
          })}
          <text x={groupW / 2 - 8} y={height + 18} textAnchor="middle"
            style={{ fontSize: "10px", fill: "#7f8c8d" }}>{d.month}</text>
        </g>
      ))}
    </svg>
  );
}

// ── DONUT CHART ───────────────────────────────────────────────────────────────
function DonutChart({ data, colors, size = 150 }) {
  const total = data.reduce((s, d) => s + d.value, 0);
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
        <path key={i} d={s.path} fill={s.color} stroke="#fff" strokeWidth="2">
          <title>{`${s.label}: ${fmt(s.value)} (${s.pct}%)`}</title>
        </path>
      ))}
      <circle cx={cx} cy={cy} r={r * 0.52} fill="#fff" />
    </svg>
  );
}

// ── SPARKLINE ─────────────────────────────────────────────────────────────────
function Sparkline({ values, color, width = 80, height = 28 }) {
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

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function Analytics({ user }) {
  const { engagementId } = useParams();
  const navigate = useNavigate();
  const [engagement, setEngagement] = useState(null);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [scope, setScope] = useState("full");
  const [expandedInsight, setExpandedInsight] = useState(null);

  // When reached via /analysis/:engagementId (from EngagementDetail's "View
  // Analysis" button), fetch the real engagement so we know its client_id
  // for report generation. The financial charts/insights below are still
  // mock data — that part hasn't been wired to the real /analyze endpoints
  // yet, this is just enough to pass real client_id/engagement_id to
  // Generate Report.
  useEffect(() => {
    if (!engagementId) {
      setEngagement(null);
      return;
    }
    getEngagement(engagementId)
      .then((res) => setEngagement(res.data))
      .catch((err) => console.error("Failed to load engagement", err));
  }, [engagementId]);

  const data = scope === "full" ? MOCK_FULL : MOCK_EXPENSE_ONLY;
  const { financial_summary: fs, ai_insights, analysis_scope } = data;

  const deptData = fs.expense_by_department
    ? Object.entries(fs.expense_by_department).map(([label, value]) => ({ label, value }))
    : [];

  const revenueValues = (fs.monthly_trend || []).map(d => d.revenue).filter(v => v != null);
  const expenseValues = (fs.monthly_trend || []).map(d => d.expenses).filter(v => v != null);

  const showRevenue = analysis_scope === "full" || analysis_scope === "revenue_only";
  const showExpenses = analysis_scope === "full" || analysis_scope === "expense_only";
  const showProfit = analysis_scope === "full";
  const showCharts = analysis_scope !== "undetermined";

  return (
    <div style={{ fontFamily: "inherit" }}>

      {/* ── HEADER ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: "700", color: "#1E3A5F", margin: 0 }}>Financial Analytics</h1>
          <p style={{ fontSize: "14px", color: "#7f8c8d", margin: "4px 0 0" }}>
            {data.file_type} · FY {data.period}
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <span style={{ fontSize: "12px", color: "#7f8c8d" }}>Mock scope:</span>
          {["full", "expense_only"].map(s => (
            <button key={s} onClick={() => setScope(s)} style={{
              padding: "5px 12px", fontSize: "12px", borderRadius: "6px",
              border: "1px solid #dce1e7",
              background: scope === s ? "#1E3A5F" : "transparent",
              color: scope === s ? "#fff" : "#5d6d7e",
              cursor: "pointer", fontWeight: scope === s ? "600" : "400",
            }}>{s}</button>
          ))}
          {engagement && (
            <button
              onClick={() => setShowGenerateModal(true)}
              style={{
                padding: "6px 14px", fontSize: "12px", borderRadius: "6px",
                border: "none", background: "#2a78d6", color: "#fff",
                cursor: "pointer", fontWeight: "600", marginLeft: "8px",
              }}
            >
              Generate Report
            </button>
          )}
        </div>
      </div>

      {engagement && (
        <p style={{ fontSize: "12px", color: "#7f8c8d", margin: "-16px 0 20px" }}>
          Scoped to engagement: <strong>{engagement.engagement_name}</strong>
          {engagement.company_name ? ` · ${engagement.company_name}` : ""}
        </p>
      )}

      {/* ── SCOPE BANNER ── */}
      {analysis_scope !== "full" && (
        <div style={{ background: "#FEF9E7", border: "1px solid #FAC775", borderRadius: "8px", padding: "10px 16px", marginBottom: "20px", fontSize: "13px", color: "#7D6608" }}>
          <strong>Partial data:</strong> {analysis_scope === "expense_only"
            ? "Only expense data was detected in this file. Revenue and profit/loss charts are hidden until a revenue file is uploaded."
            : "Could not determine the data type. Please check the uploaded file and ensure columns are correctly mapped."}
        </div>
      )}

      {/* ── KPI CARDS ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px", marginBottom: "24px" }}>
        {showRevenue && (
          <div style={{ background: "#fff", borderRadius: "10px", padding: "16px", boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
            <p style={{ fontSize: "12px", color: "#7f8c8d", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Total Revenue</p>
            <p style={{ fontSize: "22px", fontWeight: "700", color: "#1E3A5F", margin: "0 0 6px" }}>{fmtShort(fs.total_revenue)}</p>
            {revenueValues.length > 1 && <Sparkline values={revenueValues} color="#2a78d6" />}
          </div>
        )}
        {showExpenses && (
          <div style={{ background: "#fff", borderRadius: "10px", padding: "16px", boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
            <p style={{ fontSize: "12px", color: "#7f8c8d", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Total Expenses</p>
            <p style={{ fontSize: "22px", fontWeight: "700", color: "#1E3A5F", margin: "0 0 6px" }}>{fmtShort(fs.total_expenses)}</p>
            {expenseValues.length > 1 && <Sparkline values={expenseValues} color="#e34948" />}
          </div>
        )}
        {showProfit && (
          <div style={{ background: "#fff", borderRadius: "10px", padding: "16px", boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
            <p style={{ fontSize: "12px", color: "#7f8c8d", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Net Profit</p>
            <p style={{ fontSize: "22px", fontWeight: "700", color: fs.net_profit >= 0 ? "#27AE60" : "#E74C3C", margin: "0 0 4px" }}>
              {fmtShort(fs.net_profit)}
            </p>
            <p style={{ fontSize: "12px", color: "#7f8c8d", margin: 0 }}>
              {fs.total_revenue ? Math.round((fs.net_profit / fs.total_revenue) * 100) : 0}% margin
            </p>
          </div>
        )}
      </div>

      {/* ── CHARTS ── */}
      {showCharts && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "28px" }}>

          {/* Monthly trend */}
          {fs.monthly_trend && fs.monthly_trend.length > 0 && (
            <div style={{ background: "#fff", borderRadius: "10px", padding: "20px", boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
              <p style={{ fontSize: "14px", fontWeight: "600", color: "#1E3A5F", margin: "0 0 12px" }}>Monthly Trend</p>
              <div style={{ display: "flex", gap: "16px", marginBottom: "12px" }}>
                {showRevenue && <span style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px", color: "#5d6d7e" }}><span style={{ width: "10px", height: "10px", borderRadius: "2px", background: "#2a78d6", display: "inline-block" }} />Revenue</span>}
                {showExpenses && <span style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px", color: "#5d6d7e" }}><span style={{ width: "10px", height: "10px", borderRadius: "2px", background: "#e34948", display: "inline-block" }} />Expenses</span>}
              </div>
              <BarChart
                data={fs.monthly_trend}
                keys={[showRevenue && "revenue", showExpenses && "expenses"].filter(Boolean)}
                colors={[showRevenue && "#2a78d6", showExpenses && "#e34948"].filter(Boolean)}
                height={140}
              />
            </div>
          )}

          {/* Expense breakdown */}
          {showExpenses && deptData.length > 0 && (
            <div style={{ background: "#fff", borderRadius: "10px", padding: "20px", boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
              <p style={{ fontSize: "14px", fontWeight: "600", color: "#1E3A5F", margin: "0 0 16px" }}>Expense Breakdown</p>
              <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
                <DonutChart data={deptData} colors={CHART_COLORS} size={150} />
                <div style={{ flex: 1 }}>
                  {deptData.map((d, i) => {
                    const total = deptData.reduce((s, x) => s + x.value, 0);
                    const pct = Math.round((d.value / total) * 100);
                    return (
                      <div key={d.label} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                        <span style={{ width: "8px", height: "8px", borderRadius: "2px", background: CHART_COLORS[i % CHART_COLORS.length], flexShrink: 0 }} />
                        <span style={{ fontSize: "12px", color: "#5d6d7e", flex: 1 }}>{d.label}</span>
                        <span style={{ fontSize: "12px", fontWeight: "600", color: "#1E3A5F" }}>{pct}%</span>
                        <span style={{ fontSize: "11px", color: "#95a5a6" }}>{fmtShort(d.value)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── AI INSIGHTS ── */}
      {ai_insights && ai_insights.length > 0 && (
        <div>
          <div style={{ marginBottom: "16px" }}>
            <h2 style={{ fontSize: "16px", fontWeight: "700", color: "#1E3A5F", margin: "0 0 4px" }}>AI Insights & Recommendations</h2>
            <p style={{ fontSize: "13px", color: "#7f8c8d", margin: 0 }}>
              Click any insight to expand the full analysis and recommended actions.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {ai_insights.map((insight, i) => {
              const cfg = SEVERITY_CONFIG[insight.severity] || SEVERITY_CONFIG[insight.type] || SEVERITY_CONFIG.info;
              const isExpanded = expandedInsight === i;

              return (
                <div key={i} style={{
                  background: cfg.bg,
                  border: `1px solid ${cfg.border}`,
                  borderRadius: "10px",
                  overflow: "hidden",
                  transition: "box-shadow 0.15s",
                }}>
                  {/* Insight header — always visible, click to expand */}
                  <div
                    onClick={() => setExpandedInsight(isExpanded ? null : i)}
                    style={{
                      padding: "14px 16px",
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ fontSize: "20px", flexShrink: 0 }}>{cfg.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "2px" }}>
                        <span style={{
                          fontSize: "10px", fontWeight: "700", textTransform: "uppercase",
                          letterSpacing: "0.06em", color: cfg.tag,
                          background: cfg.tagBg, padding: "2px 8px", borderRadius: "20px",
                        }}>{cfg.label}</span>
                      </div>
                      <p style={{ fontSize: "14px", fontWeight: "600", color: "#1E3A5F", margin: 0 }}>
                        {insight.title || insight.message}
                      </p>
                    </div>
                    <span style={{ fontSize: "14px", color: cfg.tag, flexShrink: 0 }}>
                      {isExpanded ? "▲" : "▼"}
                    </span>
                  </div>

                  {/* Expanded content — narrative + guideline */}
                  {isExpanded && (
                    <div style={{ padding: "0 16px 18px", borderTop: `1px solid ${cfg.border}` }}>

                      {/* Narrative */}
                      <div style={{ marginTop: "14px" }}>
                        <p style={{
                          fontSize: "11px", fontWeight: "700", textTransform: "uppercase",
                          letterSpacing: "0.06em", color: cfg.tag, margin: "0 0 6px",
                        }}>Analysis</p>
                        <p style={{ fontSize: "13px", color: "#2c3e50", lineHeight: "1.65", margin: 0 }}>
                          {insight.narrative || insight.message}
                        </p>
                      </div>

                      {/* Guideline */}
                      {insight.guideline && (
                        <div style={{
                          marginTop: "14px",
                          background: "#fff",
                          border: `1px solid ${cfg.border}`,
                          borderRadius: "8px",
                          padding: "12px 14px",
                        }}>
                          <p style={{
                            fontSize: "11px", fontWeight: "700", textTransform: "uppercase",
                            letterSpacing: "0.06em", color: cfg.tag, margin: "0 0 6px",
                          }}>💡 Recommended Action</p>
                          <p style={{ fontSize: "13px", color: "#2c3e50", lineHeight: "1.65", margin: 0 }}>
                            {insight.guideline}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Undetermined state */}
      {analysis_scope === "undetermined" && (
        <div style={{ textAlign: "center", padding: "48px 24px", color: "#7f8c8d" }}>
          <p style={{ fontSize: "32px", margin: "0 0 12px" }}>?</p>
          <p style={{ fontSize: "15px", fontWeight: "600", color: "#5d6d7e", margin: "0 0 6px" }}>Could not determine data type</p>
          <p style={{ fontSize: "13px", margin: 0 }}>Upload a file with clearer financial structure to generate insights.</p>
        </div>
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