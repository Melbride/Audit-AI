import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getSubmissionReviewData, updateSubmissionStatus, openWorkspace } from "../services/api";
import "../styles/SubmissionReview.css";

// The full review chain, in order — used to render the stage timeline.
// "Auditor" only ever appears as a RETURN target (see FORWARD_MAP below),
// never a forward step, but it still needs a slot in the timeline so a
// returned submission visibly shows where it went back to.
const CHAIN = [
  "Accountant",
  "Auditor",
  "Senior Auditor",
  "Assistant Manager",
  "Audit Manager",
  "Engagement Partner",
  "Quality Reviewer",
];

// Forward always skips "Auditor" — once submitted, their work is done.
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

const fmt = (n) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(n);

const statusClass = (status) => (status || "draft").toLowerCase().replace(/\s+/g, "-");

export default function SubmissionReviewPage({ user }) {
  const { submissionId } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [note, setNote] = useState("");
  const [goingToWorkspace, setGoingToWorkspace] = useState(false);
  const [actionError, setActionError] = useState(null);

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
    setActionError(null);
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
      setActionError(
        err.response?.data?.detail ||
        "Something went wrong sending this action. Please refresh the page to check whether it actually went through, before trying again."
      );
    } finally {
      setActing(false);
    }
  };

  // Auditor-only shortcut back into their Workspace once a submission has
  // been returned for corrections — resolves the same workspace they'd land
  // on via their notification, just reachable directly from this page too.
  const handleGoToWorkspace = async () => {
    if (!user || !data?.file || !data?.submission) return;
    setGoingToWorkspace(true);
    try {
      const res = await openWorkspace({
        user_id: user.user_id,
        client_id: data.submission.client_id,
        file_id: data.file.file_id,
      });
      const ws = res.data || res;
      if (ws?.workspace_id) {
        navigate(`/workspace/${ws.workspace_id}`);
      }
    } catch (err) {
      console.error("Failed to open workspace", err);
    } finally {
      setGoingToWorkspace(false);
    }
  };

  if (loading) return <div className="sr-loading">Loading submission…</div>;
  if (!data?.submission) return <div className="sr-error">Submission not found.</div>;

  const { submission, file, cleaning_summary, trial_balance_validation, account_mapping, saved_analysis } = data;
  const isTB = file?.file_type === "trial_balance" || file?.file_type === "general_ledger";
  const stage = submission.current_stage || "Accountant";
  const status = submission.status || "Draft";
  const role = user?.role;

  const nextStage = FORWARD_MAP[stage] || null;
  const prevStage = RETURN_MAP[stage] || null;
  const isLastStage = stage === "Quality Reviewer";
  const isAuditorStage = stage === "Auditor";
  const canAct = role === stage && status !== "Approved" && status !== "Cancelled";
  const isTerminal = status === "Approved" || status === "Cancelled";
  const wasReturned = status === "Changes Requested";

  // Timeline position: everything up to (not including) the current stage
  // is "done"; the current stage is highlighted; a returned submission
  // marks the stage it landed on as "returned" instead of "current".
  const currentIndex = CHAIN.indexOf(stage);

  return (
    <div className="sr-page">
      <button className="sr-back-btn" onClick={() => navigate(`/engagements/${submission.engagement_id}`)}>
        Back to Engagement
      </button>

      {/* Header */}
      <div className="sr-header">
        <div className="sr-header-titles">
          <h1>{submission.section_name} — {submission.engagement_name}</h1>
          <p className="sr-header-meta">
            <span className="sr-filename">{file?.filename || "No file"}</span>
            {submission.submitted_by_name && ` · Submitted by ${submission.submitted_by_name}`}
          </p>
        </div>
        <div className="sr-status-block">
          <span className={`sr-status-badge status-${statusClass(status)}`}>{status}</span>
          {!isTerminal && (
            <span className="sr-currently-with">
              Currently with <strong>{stage}</strong>
            </span>
          )}
        </div>
      </div>

      {/* Stage timeline */}
      <div className="sr-timeline">
        {CHAIN.map((s, i) => {
          const isDone = !isTerminal ? i < currentIndex : true;
          const isCurrent = !isTerminal && i === currentIndex;
          const isReturnedTo = wasReturned && s === stage;
          return (
            <div className="sr-timeline-step" key={s}>
              {i > 0 && <div className="sr-timeline-connector" />}
              <div
                className={`sr-timeline-dot ${
                  isReturnedTo ? "returned" : isCurrent ? "current" : isDone ? "done" : ""
                }`}
              >
                {isDone && !isReturnedTo && !isCurrent ? "✓" : i + 1}
              </div>
              <span className={`sr-timeline-label ${isCurrent || isReturnedTo ? "current" : isDone ? "done" : ""}`}>
                {s}
              </span>
            </div>
          );
        })}
      </div>

      {/* Return notice — shown to everyone, but the fix-it shortcut only to the Auditor */}
      {wasReturned && (
        <div className="sr-return-notice">
          <div className="sr-return-notice-head">
            <span>⚠️</span>
            <h3>Changes Requested</h3>
          </div>
          {submission.notes && <p className="sr-return-note-text">"{submission.notes}"</p>}
          {role === "Auditor" ? (
            <>
              <p className="sr-return-helper">
                This submission was sent back for corrections. Head to your workspace to make the required changes and resubmit.
              </p>
              <button className="sr-btn sr-btn-workspace" onClick={handleGoToWorkspace} disabled={goingToWorkspace}>
                {goingToWorkspace ? "Opening…" : "Go to Workspace →"}
              </button>
            </>
          ) : (
            <p className="sr-return-helper">Waiting on the Auditor to address this and resubmit.</p>
          )}
        </div>
      )}

      {/* Cleaning Summary */}
      <div className="sr-card">
        <div className="sr-card-header">
          <p className="sr-card-title">Cleaning Summary</p>
        </div>
        <div className="sr-card-body">
          {cleaning_summary ? (
            <>
              <div className={`sr-result-banner ${cleaning_summary.can_proceed ? "ok" : "warn"}`}>
                {cleaning_summary.can_proceed ? "✓ All issues resolved" : "⚠ Unresolved issues remain"}
              </div>
              <div className="sr-stat-row">
                <div className="sr-stat">
                  <span className="sr-stat-value">{cleaning_summary.clean_rows}</span>
                  <span className="sr-stat-label">Clean rows</span>
                </div>
                <div className="sr-stat">
                  <span className="sr-stat-value">{cleaning_summary.flagged_rows}</span>
                  <span className="sr-stat-label">Flagged rows</span>
                </div>
                <div className="sr-stat">
                  <span className="sr-stat-value">{cleaning_summary.total_issues}</span>
                  <span className="sr-stat-label">Total issues</span>
                </div>
              </div>
            </>
          ) : (
            <span className="sr-card-empty">No cleaning data available.</span>
          )}
        </div>
      </div>

      {/* Trial Balance Validation */}
      {isTB && (
        <div className="sr-card">
          <div className="sr-card-header">
            <p className="sr-card-title">Trial Balance Validation</p>
          </div>
          <div className="sr-card-body">
            {trial_balance_validation?.applicable ? (
              <>
                <div className={`sr-result-banner ${trial_balance_validation.is_balanced ? "ok" : "warn"}`}>
                  {trial_balance_validation.is_balanced
                    ? "✓ Trial balance is balanced"
                    : `⚠ Difference of ${fmt(Math.abs(trial_balance_validation.difference))}`}
                </div>
                <div className="sr-stat-row">
                  <div className="sr-stat">
                    <span className="sr-stat-value">{fmt(trial_balance_validation.total_debits)}</span>
                    <span className="sr-stat-label">Total debits</span>
                  </div>
                  <div className="sr-stat">
                    <span className="sr-stat-value">{fmt(trial_balance_validation.total_credits)}</span>
                    <span className="sr-stat-label">Total credits</span>
                  </div>
                </div>
              </>
            ) : (
              <span className="sr-card-empty">Not yet available.</span>
            )}
          </div>
        </div>
      )}

      {/* Account Mapping */}
      {isTB && (
        <div className="sr-card">
          <div className="sr-card-header">
            <p className="sr-card-title">Account Mapping</p>
          </div>
          <div className="sr-card-body">
            {account_mapping ? (
              <div className="sr-stat-row">
                <div className="sr-stat">
                  <span className="sr-stat-value">{Object.keys(account_mapping).length}</span>
                  <span className="sr-stat-label">Accounts classified</span>
                </div>
              </div>
            ) : (
              <span className="sr-card-empty">Not yet available.</span>
            )}
          </div>
        </div>
      )}

      {/* Financial Statements + Analysis */}
      <div className="sr-card">
        <div className="sr-card-header">
          <p className="sr-card-title">{isTB ? "Financial Statements & Analysis" : "Financial Analysis"}</p>
        </div>
        <div className="sr-card-body">
          {saved_analysis ? (
            <>
              <p className="sr-analysis-meta">
                Saved by {saved_analysis.saved_by_name || "—"} on{" "}
                {new Date(saved_analysis.created_at).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
              <button
                className="sr-btn sr-btn-forward"
                onClick={() => navigate("/analysis", { state: { savedAnalysis: saved_analysis, isViewMode: true } })}
              >
                View Full Analysis →
              </button>
            </>
          ) : (
            <span className="sr-card-empty">No saved analysis yet for this file.</span>
          )}
        </div>
      </div>

      {/* Review Actions */}
      <div className="sr-card">
        <div className="sr-card-header">
          <p className="sr-card-title">Review Actions</p>
        </div>

        {status === "Approved" && <div className="sr-terminal-banner approved">✓ Approved</div>}
        {status === "Cancelled" && <div className="sr-terminal-banner cancelled">✕ Cancelled</div>}

        {!isTerminal && isAuditorStage && role !== "Auditor" && (
          <div className="sr-waiting">
            <span className="sr-waiting-dot" />
            Waiting on the Auditor to resubmit.
          </div>
        )}

        {!isTerminal && !isAuditorStage && !canAct && (
          <div className="sr-waiting">
            <span className="sr-waiting-dot" />
            Waiting on {stage}
          </div>
        )}

        {canAct && !isAuditorStage && (
          <>
            <div className="sr-actions-row">
              {isLastStage ? (
                <button className="sr-btn sr-btn-approve" disabled={acting} onClick={() => handleAction("Approved", null)}>
                  {acting ? "Approving…" : "Approve"}
                </button>
              ) : (
                <button className="sr-btn sr-btn-forward" disabled={acting} onClick={() => handleAction("Under Review", nextStage)}>
                  {acting ? "Forwarding…" : `Forward to ${nextStage}`}
                </button>
              )}
              {prevStage && (
                <button className="sr-btn sr-btn-return" disabled={acting} onClick={() => handleAction("Changes Requested", prevStage)}>
                  Return to {prevStage}
                </button>
              )}
              <button className="sr-btn sr-btn-cancel" disabled={acting} onClick={() => handleAction("Cancelled", null)}>
                Cancel
              </button>
            </div>
            <input
              className="sr-note-input"
              type="text"
              placeholder="Add a note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            {actionError && <div className="sr-action-error">{actionError}</div>}
          </>
        )}

        {submission.notes && (
          <div className="sr-prior-note">
            Latest note
            <div className="sr-prior-note-text">"{submission.notes}"</div>
          </div>
        )}
      </div>
    </div>
  );
}