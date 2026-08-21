import React, { useState, useMemo } from "react";

const CHART_COLORS = ["#2563eb", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#f97316"];

const fmt = (n) => n == null ? "—" : new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(n);
const fmtShort = (n) => {
  if (n == null) return "—";
  if (Math.abs(n) >= 1000000) return `KES ${(n / 1000000).toFixed(1)}M`;
  if (Math.abs(n) >= 1000) return `KES ${(n / 1000).toFixed(0)}K`;
  return `KES ${n}`;
};

export function BarChart({ data, keys, colors, height = 160, anomalies = [] }) {
  if (!data || data.length === 0) return null;

  const max = Math.max(1, ...data.flatMap(d => keys.map(k => d[k] ?? 0)));
  const groupW = Math.floor(560 / Math.max(data.length, 1));
  const barW = Math.floor(groupW / (keys.length + 0.8));

  return (
    <svg viewBox={`0 0 ${data.length * groupW} ${height + 36}`} style={{ width: "100%", overflow: "visible" }}>
      {data.map((d, i) => {
        const isAnomalous = anomalies.includes(d.label);
        return (
          <g key={d.label || i} transform={`translate(${i * groupW + 4}, 0)`}>
            {keys.map((k, ki) => {
              const val = d[k] ?? 0;
              const h = max > 0 ? Math.round((val / max) * height) : 0;
              return (
                <rect key={k} x={ki * (barW + 2)} y={height - h} width={barW} height={h}
                  fill={isAnomalous && ki === 1 ? "#ef4444" : colors[ki]} rx="2" opacity="0.9">
                  <title>{`${d.label} ${k}: ${fmt(val)}${isAnomalous ? ' ⚠️ [Anomaly Flagged]' : ''}`}</title>
                </rect>
              );
            })}
            <text x={groupW / 2 - 8} y={height + 18} textAnchor="middle" className="chart-axis-label">
              {d.label} {isAnomalous && "⚠️"}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function LineChart({ data, keys, colors, height = 160, anomalies = [] }) {
  if (!data || data.length === 0) return null;

  const width = 560;
  const paddingX = 40;
  const paddingY = 20;
  
  const allValues = data.flatMap(d => keys.map(k => d[k] ?? 0));
  const max = Math.max(1, ...allValues);
  const min = Math.min(0, ...allValues);
  const range = max - min || 1;

  const getX = (idx) => data.length === 1 ? width / 2 : paddingX + (idx / (data.length - 1)) * (width - 2 * paddingX);
  const getY = (val) => height - paddingY - ((val - min) / range) * (height - 2 * paddingY);

  return (
    <svg viewBox={`0 0 ${width} ${height + 36}`} style={{ width: "100%", overflow: "visible" }}>
      <line x1={paddingX} y1={getY(0)} x2={width - paddingX} y2={getY(0)} stroke="#e2e8f0" strokeDasharray="4 4" strokeWidth="1.5" />
      
      {keys.map((k, ki) => {
        const points = data.map((d, i) => `${getX(i)},${getY(d[k] ?? 0)}`).join(" ");
        return (
          <g key={k}>
            <polyline fill="none" stroke={colors[ki]} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={points} />
            {data.map((d, i) => {
              const isAnomalous = anomalies.includes(d.label);
              return (
                <circle 
                  key={i} 
                  cx={getX(i)} 
                  cy={getY(d[k] ?? 0)} 
                  r={isAnomalous ? "6" : "4"} 
                  fill={isAnomalous ? "#ef4444" : colors[ki]} 
                  stroke="var(--background, #fff)" 
                  strokeWidth="1.5"
                >
                  <title>{`${d.label} ${k}: ${fmt(d[k] ?? 0)}${isAnomalous ? ' ⚠️ [Anomaly Spike]' : ''}`}</title>
                </circle>
              );
            })}
          </g>
        );
      })}

      {data.map((d, i) => (
        <text key={d.label || i} x={getX(i)} y={height + 18} textAnchor="middle" className="chart-axis-label" fontSize="11" fill="#64748b">
          {d.label}
        </text>
      ))}
    </svg>
  );
}

export function DonutChart({ data, colors, size = 150 }) {
  if (!data || data.length === 0) return null;

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
      {slices.map((s) => (
        <path key={s.label} d={s.path} fill={s.color} stroke="var(--background)" strokeWidth="2">
          <title>{`${s.label}: ${fmt(s.value)} (${s.pct}%)`}</title>
        </path>
      ))}
      <circle cx={cx} cy={cy} r={r * 0.52} fill="var(--background)" />
    </svg>
  );
}

export function DonutPanel({ data }) {
  if (!data || data.length === 0) return null;

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

export default function FinancialCharts({ periodSummaries, expenseDonutData, revenueDonutData, anomalies = [] }) {
  const [metricView, setMetricView] = useState("profit"); // 'profit' | 'revenue' | 'expenses'
  const [granularity, setGranularity] = useState("all"); // 'all' | 'last6' | 'last3'

  const filteredSummaries = useMemo(() => {
    if (!periodSummaries) return [];
    if (granularity === "last3") return periodSummaries.slice(-3);
    if (granularity === "last6") return periodSummaries.slice(-6);
    return periodSummaries;
  }, [periodSummaries, granularity]);

  // Compute period-over-period variance percentages automatically
  const periodData = useMemo(() => {
    return filteredSummaries.map((p, idx, arr) => {
      const prev = idx > 0 ? arr[idx - 1] : null;
      const curRev = p.total_revenue || 0;
      const curExp = p.total_expenses || 0;
      const curProfit = curRev - curExp;

      let varianceLabel = null;
      if (prev) {
        const prevProfit = (prev.total_revenue || 0) - (prev.total_expenses || 0);
        if (prevProfit !== 0) {
          const diff = ((curProfit - prevProfit) / Math.abs(prevProfit)) * 100;
          varianceLabel = `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}% vs prior`;
        }
      }

      return {
        label: p.period,
        revenue: curRev,
        expenses: curExp,
        netProfit: curProfit,
        variance: varianceLabel
      };
    });
  }, [filteredSummaries]);

  return (
    <div className="financial-charts-wrapper" style={{ marginBottom: "28px" }}>
      
      {/* Interactive Controls Bar */}
      {periodSummaries && periodSummaries.length > 0 && (
        <div className="chart-controls-bar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", background: "var(--surface, #f8fafc)", padding: "10px 14px", borderRadius: "8px" }}>
          <div className="control-group" style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span style={{ fontSize: "12px", fontWeight: "600", color: "#64748b" }}>Trend View:</span>
            <button className={`btn-chip ${metricView === 'profit' ? 'active' : ''}`} onClick={() => setMetricView('profit')}>Net Profit</button>
            <button className={`btn-chip ${metricView === 'revenue' ? 'active' : ''}`} onClick={() => setMetricView('revenue')}>Revenue</button>
            <button className={`btn-chip ${metricView === 'expenses' ? 'active' : ''}`} onClick={() => setMetricView('expenses')}>Expenses</button>
          </div>

          <div className="control-group" style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span style={{ fontSize: "12px", fontWeight: "600", color: "#64748b" }}>Range:</span>
            <button className={`btn-chip ${granularity === 'all' ? 'active' : ''}`} onClick={() => setGranularity('all')}>All</button>
            <button className={`btn-chip ${granularity === 'last6' ? 'active' : ''}`} onClick={() => setGranularity('last6')}>Last 6M</button>
            <button className={`btn-chip ${granularity === 'last3' ? 'active' : ''}`} onClick={() => setGranularity('last3')}>Last 3M</button>
          </div>
        </div>
      )}

      {/* Multi-Period Trend Section with Badges */}
      {periodData.length > 0 && (
        <div className="chart-grid" style={{ marginBottom: "24px" }}>
          <div className="chart-card">
            <div className="chart-card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <h3 style={{ margin: 0 }}>Revenue vs. Expenses Trend</h3>
            </div>
            <BarChart data={periodData} keys={["revenue", "expenses"]} colors={["#2a78d6", "#e34948"]} height={140} anomalies={anomalies} />
          </div>

          <div className="chart-card">
            <div className="chart-card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <h3 style={{ margin: 0 }}>{metricView === 'profit' ? 'Net Margin Trajectory' : metricView === 'revenue' ? 'Revenue Trajectory' : 'Expense Trajectory'}</h3>
            </div>
            <LineChart 
              data={periodData} 
              keys={[metricView === 'profit' ? "netProfit" : metricView === 'revenue' ? "revenue" : "expenses"]} 
              colors={[metricView === 'profit' ? "#10b981" : metricView === 'revenue' ? "#2563eb" : "#ef4444"]} 
              height={140} 
              anomalies={anomalies}
            />
          </div>
        </div>
      )}

      {/* Period Variance Summary Badges List */}
      {periodData.length > 0 && (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "24px", alignItems: "center" }}>
          <span style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", marginRight: "4px" }}>Period Variances:</span>
          {periodData.map((p, idx) => p.variance && (
            <div key={idx} style={{ background: "var(--surface, #f8fafc)", border: "1px solid #e2e8f0", padding: "4px 10px", borderRadius: "6px", fontSize: "11px", display: "flex", gap: "6px", alignItems: "center" }}>
              <span style={{ fontWeight: 600 }}>{p.label}:</span>
              <span style={{ fontWeight: 700, color: p.variance.startsWith("+") ? "#166534" : "#991B1B" }}>{p.variance}</span>
              {anomalies.includes(p.label) && <span title="Anomaly Flagged">⚠️</span>}
            </div>
          ))}
        </div>
      )}

      {/* Category Breakdowns */}
      <div className="chart-grid">
        {expenseDonutData && expenseDonutData.length > 0 && (
          <div className="chart-card">
            <h3 style={{ marginBottom: "12px" }}>Expense Breakdown</h3>
            <DonutPanel data={expenseDonutData} />
          </div>
        )}
        {revenueDonutData && revenueDonutData.length > 0 && (
          <div className="chart-card">
            <h3 style={{ marginBottom: "12px" }}>Revenue Breakdown</h3>
            <DonutPanel data={revenueDonutData} />
          </div>
        )}
      </div>
    </div>
  );
}