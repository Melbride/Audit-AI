import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getSubmissionReviewData, updateSubmissionStatus, createSubmission } from "../services/api";
import "../styles/EngagementDetail.css";

// Forward always skips "Auditor" — once submitted, their work is done.
// "Auditor" only ever reappears as a RETURN target, never a forward step.
const FORWARD_MAP = {
  "Accountant": "Senior Auditor",
  "Senior Auditor": "Assistant Manager",
  "Assistant Manager": "Audit Manager",
  "Audit Manager": "Engagement Partner",
  "Engagement Partner": "Quality Reviewer",
};

const RETURN_MAP = {
  "Senior Auditor": "Auditor",
  "Assistant Manager": "Senior Auditor",
  "Audit Manager": "Assistant Manager",
  "Engagement Partner": "Audit Manager",
  "Quality Reviewer": "Engagement Partner",
};

const fmt = (n) => n == null ? "—" : new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(n);

export default function SubmissionReviewPage({ user }) {
  const { submissionId } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    load();
  }, [submissionId]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getSubmissionReviewData(submissionId);
      setData(res.data || res);
    } catch (err) {
      console.error("Failed to load submission review data", err);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (newStatus, newStage) => {
    if (!user || !data?.submission) return;
    setActing(true);
    try {
      await updateSubmissionStatus(data.submission.submission_id, {
        status: newStatus,
        current_stage: newStage,
        notes: note || null,
        updated_by: user.user_id,
      });
      await load();
      setNote("");
    } catch (err) {
      console.error("Failed to update submission", err);
    } finally {
      setActing(false);
    }
  };

  if (loading) return <p className="loading-message">Loading submission...</p>;
  if (!data?.submission) return <p className="error-message">Submission not found.</p>;

  const { submission, file, cleaning_summary, trial_balance_validation, account_mapping, saved_analysis } = data;
  const isTB = file?.file_type === "trial_balance" || file?.file_type === "general_ledger";
  const stage = submission.current_stage || "Accountant";
  const status = submission.status || "Draft";
  const role = user?.role;

  const nextStage = FORWARD_MAP[stage] || null;
  const prevStage = RETURN_MAP[stage] || null;
  const isLastStage = stage === "Quality Reviewer";
  const isAuditorStage = stage === "Auditor"; // returned for corrections — not a forward/return step, they must fix + resubmit via their workspace
  const canAct = role === stage && status !== "Approved" && status !== "Cancelled";
  const isTerminal = status === "Approved" || status === "Cancelled";

  return (
    <div className="engagement-detail">
      <button className="back-button" onClick={() => navigate(`/engagements/${submission.engagement_id}`)}>
        Back to Engagement
      </button>

      <div className="engagement-header">
        <h1>{submission.section_name} — {submission.engagement_name}</h1>
        <p>
          File: {file?.filename || "—"} · Status: {status}
          {!isTerminal && ` · Currently with: ${stage}`}
        </p>
      </div>

      {/* File & Cleaning Summary */}
      <div className="sections-card" style={{ padding: "16px", marginBottom: "16px" }}>
        <h3>Cleaning Summary</h3>
        {cleaning_summary ? (
          <p>
            {cleaning_summary.can_proceed ? "All issues resolved" : "Unresolved issues remain"} —{" "}
            {cleaning_summary.clean_rows} clean rows, {cleaning_summary.flagged_rows} flagged rows,{" "}
            {cleaning_summary.total_issues} total issue(s)
          </p>
        ) : <p>No cleaning data available.</p>}
      </div>

      {/* Trial Balance Validation */}
      {isTB && (
        <div className="sections-card" style={{ padding: "16px", marginBottom: "16px" }}>
          <h3>Trial Balance Validation</h3>
          {trial_balance_validation?.applicable ? (
            <p>
              {trial_balance_validation.is_balanced
                ? "Trial balance is balanced"
                : `Difference of ${fmt(Math.abs(trial_balance_validation.difference))}`}
              {" — "}Debits: {fmt(trial_balance_validation.total_debits)}, Credits: {fmt(trial_balance_validation.total_credits)}
            </p>
          ) : <p>Not yet available.</p>}
        </div>
      )}

      {/* Account Mapping */}
      {isTB && account_mapping && (
        <div className="sections-card" style={{ padding: "16px", marginBottom: "16px" }}>
          <h3>Account Mapping</h3>
          <p>{Object.keys(account_mapping).length} account(s) classified.</p>
        </div>
      )}

      {/* Financial Statements + Analysis (from saved snapshot) */}
      <div className="sections-card" style={{ padding: "16px", marginBottom: "16px" }}>
        <h3>{isTB ? "Financial Statements & Analysis" : "Financial Analysis"}</h3>
        {saved_analysis ? (
          <>
            <p style={{ fontSize: "12px", color: "#888" }}>
              Saved by {saved_analysis.saved_by_name || "—"} on{" "}
              {new Date(saved_analysis.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            </p>
            <button
              className="action-btn secondary"
              onClick={() => navigate("/analysis", { state: { savedAnalysis: saved_analysis, isViewMode: true } })}
            >
              View Full Analysis 
            </button>
          </>
        ) : <p>No saved analysis yet for this file.</p>}
      </div>

      {/* Actions */}
      <div className="sections-card" style={{ padding: "16px" }}>
        <h3>Review Actions</h3>
        {status === "Approved" && <p className="workflow-approved">Approved</p>}
        {status === "Cancelled" && <p className="workflow-cancelled">Cancelled</p>}
        {!isTerminal && isAuditorStage && (
          <p className="workflow-text">
            This submission was returned for corrections. Please fix the issue in your Workspace and resubmit.
          </p>
        )}
        {!isTerminal && !isAuditorStage && !canAct && (
          <p className="workflow-text">Waiting on {stage}</p>
        )}
        {canAct && !isAuditorStage && (
          <div className="workflow-actions">
            <div className="workflow-buttons">
              {isLastStage ? (
                <button className="action-btn success" disabled={acting} onClick={() => handleAction("Approved", null)}>
                  {acting ? "Approving..." : "Approve"}
                </button>
              ) : (
                <button className="action-btn secondary" disabled={acting} onClick={() => handleAction("Under Review", nextStage)}>
                  {acting ? "Forwarding..." : `Forward to ${nextStage}`}
                </button>
              )}
              {prevStage && (
                <button className="action-btn warning" disabled={acting} onClick={() => handleAction("Changes Requested", prevStage)}>
                  Return to {prevStage}
                </button>
              )}
              <button className="action-btn danger" disabled={acting} onClick={() => handleAction("Cancelled", null)}>
                Cancel
              </button>
            </div>
            <input
              className="note-input"
              type="text"
              placeholder="Add a note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        )}
        {submission.notes && (
          <div className="status-note" style={{ marginTop: "8px" }}>"{submission.notes}"</div>
        )}
      </div>
    </div>
  );
}