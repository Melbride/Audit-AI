import { useState, useEffect } from "react";
import { getClients, getClientFiles, getEngagements, generateReport } from "../services/api";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function GenerateReportModal({
  user,
  onClose,
  onGenerated,
  initialClientId = "",
  initialEngagementId = "",
  lockClientEngagement = false,
}) {
  const [clients, setClients] = useState([]);
  const [engagements, setEngagements] = useState([]);
  const [files, setFiles] = useState([]);

  const [clientId, setClientId] = useState(initialClientId ? String(initialClientId) : "");
  const [engagementId, setEngagementId] = useState(initialEngagementId ? String(initialEngagementId) : "");
  const [fileId, setFileId] = useState("");
  const [fileType, setFileType] = useState("general");
  const [reportType, setReportType] = useState("monthly");
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [commentary, setCommentary] = useState("");

  const [loadingFiles, setLoadingFiles] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    getClients()
      .then((res) => setClients(res.data))
      .catch(() => setError("Failed to load clients."));
    getEngagements()
      .then((res) => setEngagements(res.data))
      .catch(() => setError("Failed to load engagements."));
  }, []);

  useEffect(() => {
    if (!clientId) {
      setFiles([]);
      setFileId("");
      if (!lockClientEngagement) setEngagementId("");
      return;
    }
    if (!lockClientEngagement) setEngagementId("");
    setLoadingFiles(true);
    getClientFiles(clientId)
      .then((res) => {
        setFiles(res.data);
        setFileId("");
      })
      .catch(() => setError("Failed to load files for this client."))
      .finally(() => setLoadingFiles(false));
  }, [clientId]);

  const clientEngagements = engagements.filter(
    (e) => String(e.client_id) === String(clientId)
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!clientId || !engagementId || !fileId) {
      setError("Please select a client, an engagement, and a file.");
      return;
    }
    if (reportType === "custom" && (!startDate || !endDate)) {
      setError("Custom range reports need a start and end date.");
      return;
    }

    const payload = {
      client_id: Number(clientId),
      engagement_id: Number(engagementId),
      file_id: fileId,
      file_type: fileType,
      report_type: reportType,
      commentary,
      generated_by: user?.user_id,
    };
    if (reportType === "monthly") {
      payload.year = Number(year);
      payload.month = Number(month);
    } else if (reportType === "yearly") {
      payload.year = Number(year);
    } else {
      payload.start_date = startDate;
      payload.end_date = endDate;
    }

    try {
      setSubmitting(true);
      const res = await generateReport(payload);
      onGenerated(res.data.report_id);
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          "Failed to generate report. Make sure this file has been mapped and cleaned first."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-panel"
        style={{ maxWidth: 480 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[15px] font-semibold text-slate-800">Generate Report</h2>
          <button
            className="text-slate-400 hover:text-slate-700 text-[18px] leading-none"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {error && (
          <div className="alert-message alert-error mb-3">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="text-[12px] font-medium text-slate-600">
            Client
            <select
              className="w-full mt-1"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              disabled={lockClientEngagement}
              required
            >
              <option value="">Select a client…</option>
              {clients.map((c) => (
                <option key={c.client_id} value={c.client_id}>
                  {c.company_name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-[12px] font-medium text-slate-600">
            Engagement
            <select
              className="w-full mt-1"
              value={engagementId}
              onChange={(e) => setEngagementId(e.target.value)}
              disabled={!clientId || lockClientEngagement}
              required
            >
              <option value="">Select an engagement…</option>
              {clientEngagements.map((eng) => (
                <option key={eng.engagement_id} value={eng.engagement_id}>
                  {eng.engagement_name}
                </option>
              ))}
            </select>
            {clientId && !lockClientEngagement && clientEngagements.length === 0 && (
              <p className="text-[11px] text-amber-600 mt-1">
                No engagements found for this client yet.
              </p>
            )}
          </label>

          <label className="text-[12px] font-medium text-slate-600">
            Uploaded file
            <select
              className="w-full mt-1"
              value={fileId}
              onChange={(e) => setFileId(e.target.value)}
              disabled={!clientId || loadingFiles}
              required
            >
              <option value="">
                {loadingFiles ? "Loading files…" : "Select a file…"}
              </option>
              {files.map((f) => (
                <option key={f.file_id} value={f.file_id}>
                  {f.filename || f.file_id}
                </option>
              ))}
            </select>
            {clientId && !loadingFiles && files.length === 0 && (
              <p className="text-[11px] text-amber-600 mt-1">
                No files uploaded for this client yet.
              </p>
            )}
          </label>

          <label className="text-[12px] font-medium text-slate-600">
            Report type
            <select
              className="w-full mt-1"
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
            >
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
              <option value="custom">Custom range</option>
            </select>
          </label>

          {reportType === "monthly" && (
            <div className="flex gap-2">
              <label className="text-[12px] font-medium text-slate-600 flex-1">
                Month
                <select
                  className="w-full mt-1"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                >
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[12px] font-medium text-slate-600 flex-1">
                Year
                <input
                  type="number"
                  className="w-full mt-1"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                />
              </label>
            </div>
          )}

          {reportType === "yearly" && (
            <label className="text-[12px] font-medium text-slate-600">
              Year
              <input
                type="number"
                className="w-full mt-1"
                value={year}
                onChange={(e) => setYear(e.target.value)}
              />
            </label>
          )}

          {reportType === "custom" && (
            <div className="flex gap-2">
              <label className="text-[12px] font-medium text-slate-600 flex-1">
                Start date
                <input
                  type="date"
                  className="w-full mt-1"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </label>
              <label className="text-[12px] font-medium text-slate-600 flex-1">
                End date
                <input
                  type="date"
                  className="w-full mt-1"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </label>
            </div>
          )}

          <label className="text-[12px] font-medium text-slate-600">
            Commentary (optional, can edit after generating)
            <textarea
              className="w-full mt-1"
              rows={3}
              value={commentary}
              onChange={(e) => setCommentary(e.target.value)}
            />
          </label>

          <div className="flex justify-end gap-2 mt-2">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? "Generating…" : "Generate Report"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}