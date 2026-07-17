import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { FileText, Clock } from "../components/Icons";
import { getReports } from "../services/api";

const STATUS_STYLES = {
  draft: "bg-slate-100 text-slate-600",
  in_review: "bg-slate-100 text-slate-600",
  changes_requested: "bg-amber-50 text-amber-700",
  approved: "bg-emerald-50 text-emerald-700",
  exported: "bg-emerald-50 text-emerald-700",
};

const STATUS_LABELS = {
  draft: "Draft",
  in_review: "In review",
  changes_requested: "Changes requested",
  approved: "Approved",
  exported: "Exported",
};

export default function Reports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await getReports();
        setReports(res.data);
      } catch (err) {
        setError(err.response?.data?.detail || err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return <div className="p-6 text-[13px] text-slate-500">Loading reports…</div>;
  }
  if (error) {
    return <div className="p-6 text-[13px] text-red-600">Couldn't load reports: {error}</div>;
  }

  return (
    <div className="p-6" style={{ fontFamily: "ui-sans-serif, system-ui" }}>
      <h1 className="text-[18px] font-semibold text-slate-800 mb-4">Reports</h1>

      {reports.length === 0 ? (
        <p className="text-[13px] text-slate-500">No reports yet.</p>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
          {reports.map((r) => (
            <Link
              key={r.id}
              to={`/reports/${r.id}`}
              className="flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <FileText size={16} className="text-slate-400" />
                <div>
                  <p className="text-[13px] font-medium text-slate-800">
                    {r.type === "custom" ? "Custom range report" : `${r.type[0].toUpperCase()}${r.type.slice(1)} report`}
                  </p>
                  <p className="text-[12px] text-slate-400 mt-0.5">
                    {r.period_start} – {r.period_end}
                    {r.created_by_name ? ` · ${r.created_by_name}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-slate-400">v{r.version_number ?? "—"}</span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    STATUS_STYLES[r.status] || "bg-slate-100 text-slate-600"
                  }`}
                >
                  {STATUS_LABELS[r.status] || r.status}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}