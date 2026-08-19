import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";

const formatCurrency = (val) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(val);

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: "6px", padding: "8px 12px", fontSize: "12px" }}>
      <p style={{ fontWeight: 600, marginBottom: "4px" }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ margin: 0, color: p.color }}>
          {p.name}: {formatCurrency(p.value)}
        </p>
      ))}
    </div>
  );
};

// Bar chart comparing Total Assets / Total Liabilities / Total Equity
export function BalanceSheetSummaryChart({ balanceSheet }) {
  const data = [
    { name: "Assets", value: balanceSheet.total_assets || 0 },
    { name: "Liabilities", value: balanceSheet.total_liabilities || 0 },
    { name: "Equity", value: balanceSheet.total_equity || 0 },
  ];
  const colors = ["#2563EB", "#DC2626", "#16A34A"];

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v)} width={80} />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {data.map((entry, i) => (
            <Cell key={i} fill={colors[i]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// Bar chart breaking down individual accounts within a category
// (assets, liabilities, or equity — pass the array + a color)
export function AccountBreakdownChart({ accounts, color = "#2563EB", nameKey = "account_name", valueKey = "amount" }) {
  if (!accounts || accounts.length === 0) return null;
  const data = accounts.map((a) => ({ name: a[nameKey], value: Number(a[valueKey]) || 0 }));

  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 36)}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
        <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v)} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={140} />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="value" fill={color} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// Revenue vs Expenses comparison
export function IncomeStatementChart({ incomeStatement }) {
  const totalRevenue = (incomeStatement.revenue || []).reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const totalExpenses = (incomeStatement.expenses || []).reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const data = [
    { name: "Revenue", value: totalRevenue },
    { name: "Expenses", value: totalExpenses },
    { name: "Net Profit", value: incomeStatement.net_profit || 0 },
  ];
  const colors = ["#16A34A", "#DC2626", "#2563EB"];

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v)} width={80} />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {data.map((entry, i) => (
            <Cell key={i} fill={colors[i]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}