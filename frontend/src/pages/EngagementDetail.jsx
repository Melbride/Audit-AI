// React hooks
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
// API functions
import {
  getEngagement,
  getAuditSections,
  getSectionLatestSubmission,
  updateSubmissionStatus,
  createSubmission,
  sendToClient,
} from "../services/api";
import "../styles/EngagementDetail.css";

// Workflow approval stages, in order. A submission moves left-to-right
// through these roles as it gets forwarded, and can be sent back
// ("Return") to the previous stage if changes are requested.
const WORKFLOW = [
  "Accountant",
  "Auditor",
  "Senior Auditor",
  "Assistant Manager",
  "Audit Manager",
  "Engagement Partner",
  "Quality Reviewer",
];

// EngagementDetail: shows one engagement's audit sections and their
// current workflow status, and lets the logged-in user approve, forward,
// return, or cancel a section's submission depending on their role and
// the submission's current stage.
export default function EngagementDetail({ user }) {
  const { engagementId } = useParams();
  const navigate = useNavigate();

  // Component state
  const [engagement, setEngagement] = useState(null);   // the engagement being viewed
  const [sections, setSections] = useState([]);           // audit sections belonging to this engagement
  const [submissions, setSubmissions] = useState({});     // latest submission per section, keyed by section_id
  const [loading, setLoading] = useState(true);            // true while engagement data is being fetched
  const [actingOn, setActingOn] = useState(null);          // section_id currently processing an action (disables its buttons)
  const [noteDrafts, setNoteDrafts] = useState({});        // in-progress note text per section, keyed by section_id

  // Load engagement data whenever the ID changes
  useEffect(() => {
    if (!engagementId) return;
    loadData();
  }, [engagementId]);

  // Fetch engagement, its sections, and the latest submission for each section
  const loadData = async () => {
    setLoading(true);

    // Fetch engagement details
    try {
      const eng = await getEngagement(engagementId);
      setEngagement(eng.data);

      // Fetch audit sections for this engagement
      const secs = await getAuditSections(engagementId);
      const list = Array.isArray(secs.data) ? secs.data : [];

      setSections(list);

      // Fetch the latest submission for every section in parallel,
      // then build a { section_id: submission } lookup object
      const entries = await Promise.all(
        list.map(async (section) => [
          section.section_id,
          (await getSectionLatestSubmission(section.section_id)).data,
        ])
      );

      setSubmissions(Object.fromEntries(entries));
    } catch (err) {
      console.error("Failed to load engagement detail", err);
    }

    setLoading(false);
  };

  // Handles workflow actions (approve, forward, return, cancel).
  // Creates a new submission if none exists yet for this section,
  // otherwise updates the existing one. Reloads data afterward so
  // the table reflects the new status/stage.
  const handleAction = async (
    section,
    submission,
    newStatus,
    newStage,
    notes = null
  ) => {
    if (!user) return;

    setActingOn(section.section_id);

    try {
      if (submission) {
        // Update an existing submission
        await updateSubmissionStatus(submission.submission_id, {
          status: newStatus,
          current_stage: newStage,
          notes,
          updated_by: user.user_id,
        });
      } else {
        // Create a new submission
        await createSubmission({
          engagement_id: engagementId,
          section_id: section.section_id,
          submitted_by: user.user_id,
          status: newStatus,
          current_stage: newStage,
          notes,
        });
      }

      // Reload latest data so the UI reflects the new status/stage
      await loadData();
    } catch (err) {
      console.error("Failed to update submission", err);
    }

    setActingOn(null);
  };

  // Converts a status string into a CSS-safe class suffix
  const getStatusClass = (status) =>
    status.toLowerCase().replace(/\s+/g, "-");

  // Renders the workflow action area for a single section
 
  const renderActions = (section, submission) => {
    if (!user) return null;

    const stage = submission?.current_stage || "Accountant";
    const status = submission?.status || "Draft";
    const isActing = actingOn === section.section_id;
    const role = user.role;

    // Admins are observers only — show status text, no action buttons
    if (role === "Admin") {
      return (
        <span className="workflow-text">
          {status === "Approved"
            ? "Approved"
            : status === "Cancelled"
            ? "Cancelled"
            : `Waiting on ${stage}`}
        </span>
      );
    }

    // Terminal state: already approved, nothing more to do
    if (status === "Approved") {
      return (
        <span className="workflow-approved">
          Approved
        </span>
      );
    }

    // Terminal state: cancelled, nothing more to do
    if (status === "Cancelled") {
      return (
        <span className="workflow-cancelled">
          Cancelled
        </span>
      );
    }

    // If the logged-in user's role is not the current workflow stage,
    // they cannot perform any action and should wait for the assigned reviewer.
    if (role !== stage) {
      return (
        <span className="workflow-text">
          Waiting on {stage}
        </span>
      );
    }

    // Find the current stage's position in the workflow
    const currentIndex = WORKFLOW.indexOf(stage);

    // Determine the previous stage (used when sending work back for revisions)
    const prevStage =
      currentIndex > 0 ? WORKFLOW[currentIndex - 1] : null;

    // Determine the next stage (used when forwarding the submission)
    const nextStage =
      currentIndex < WORKFLOW.length - 1
        ? WORKFLOW[currentIndex + 1]
        : null;

    // Check whether this is the final approval stage
    const isLastStage =
      currentIndex === WORKFLOW.length - 1;

    return (
      <div className="workflow-actions">
        {/* Action buttons for workflow progression */}
        <div className="workflow-buttons">

          {/* Final stage users approve the submission; earlier stages forward it on */}
          {isLastStage ? (
            <button
              className="action-btn success"
              disabled={isActing}
              onClick={() =>
                handleAction(
                  section,
                  submission,
                  "Approved",
                  null,
                  noteDrafts[section.section_id] || null
                )
              }
            >
              {isActing ? "Approving..." : "Approve"}
            </button>
          ) : (
            // Non-final stage users forward the submission to the next reviewer
            <button
              className="action-btn secondary"
              disabled={isActing}
              onClick={() =>
                handleAction(
                  section,
                  submission,
                  "Under Review",
                  nextStage,
                  noteDrafts[section.section_id] || null
                )
              }
            >
              {isActing
                ? "Forwarding..."
                : `Forward to ${nextStage}`}
            </button>
          )}

          {/*
            Display the "Return" button only if there is a previous stage
            in the workflow. This allows the current reviewer to send the
            submission back for corrections.
          */}
          {prevStage && (
            <button
              className="action-btn warning"
              disabled={isActing}
              onClick={() =>
                handleAction(
                  section,
                  submission,
                  "Changes Requested",
                  prevStage,
                  noteDrafts[section.section_id] || null
                )
              }
            >
              Return to {prevStage}
            </button>
          )}

          {/* Allow the current reviewer to cancel the submission workflow */}
          <button
            className="action-btn danger"
            disabled={isActing}
            onClick={() =>
              handleAction(
                section,
                submission,
                "Cancelled",
                null,
                noteDrafts[section.section_id] || null
              )
            }
          >
            Cancel
          </button>

        </div>

        {/* Input field for adding optional notes or feedback before taking an action */}
        <input
          className="note-input"
          type="text"
          placeholder="Add a note (optional)"
          value={noteDrafts[section.section_id] || ""}
          onChange={(e) =>
            setNoteDrafts((prev) => ({
              ...prev,
              [section.section_id]: e.target.value,
            }))
          }
        />
      </div>
    );
  };

  // Display a message if no engagement has been selected.
  if (!engagementId) {
    return (
      <p className="empty-message">
        Select an engagement to view details.
      </p>
    );
  }

  // Show a loading message while engagement data is being fetched.
  if (loading) {
    return (
      <p className="loading-message">
        Loading engagement...
      </p>
    );
  }

  // Wait until the authenticated user's information is available.
  if (!user) {
    return (
      <p className="loading-message">
        Loading user...
      </p>
    );
  }

  // Display an error message if the requested engagement does not exist.
  if (!engagement) {
    return (
      <p className="error-message">
        Engagement not found.
      </p>
    );
  }

  return (
    <div className="engagement-detail">

      {/* Navigate back to the Engagements page */}
      <button
        className="back-button"
        onClick={() => navigate("/engagements")}
      >
        ← Back to Engagements
      </button>

      {/* Display the selected engagement's basic information */}
      <div className="engagement-header">
        <h1>{engagement.engagement_name}</h1>

        <p>
          {engagement.company_name || "—"} · FY{" "}
          {engagement.financial_year || "—"}
        </p>
      </div>

      {/* Allow Engagement Partner, Quality Reviewer, and Admin to send the final approved report to the client */}
      {["Engagement Partner", "Quality Reviewer", "Admin"].includes(
        user.role
      ) &&
        sections.some(
          (sec) =>
            submissions[sec.section_id]?.status === "Approved"
        ) && (
          <div className="send-report">
            <button
              className="send-report-btn"
              onClick={async () => {
                try {
                  const res = await sendToClient(engagementId);

                  alert(
                    res.data?.message ||
                      "Email sent successfully."
                  );
                } catch (err) {
                  alert("Failed to send email.");
                }
              }}
            >
              Send Report to Client
            </button>
          </div>
        )}

      {/* Display all audit sections for the engagement */}
      <div className="sections-card">
        {sections.length === 0 ? (
          <p className="empty-message">
            No audit sections found for this engagement.
          </p>
        ) : (
          <table className="sections-table">

            {/* Table headings */}
            <thead>
              <tr>
                <th>Section</th>
                <th>Status</th>
                <th>Last Updated By</th>
                <th>Actions</th>
              </tr>
            </thead>

            {/* Render each audit section and its workflow status */}
            <tbody>
              {sections.map((section) => {
                const submission =
                  submissions[section.section_id];

                const status =
                  submission?.status || "Draft";

                return (
                  <tr key={section.section_id}>

                    {/* Audit section name */}
                    <td className="section-name">
                      {section.section_name}
                    </td>

                    {/* Current workflow status and reviewer notes */}
                    <td>
                      <span
                        className={`status-badge ${getStatusClass(
                          status
                        )}`}
                      >
                        {status}
                      </span>

                      {/* Display reviewer notes if available */}
                      {submission?.notes && (
                        <div className="status-note">
                          "{submission.notes}"
                        </div>
                      )}
                    </td>

                    {/* Name of the user who last updated the submission */}
                    <td className="updated-by">
                      {submission?.submitted_by_name || "—"}
                    </td>

                    {/* Render workflow action buttons based on the user's role */}
                    <td>
                      {renderActions(
                        section,
                        submission
                      )}
                    </td>

                  </tr>
                );
              })}
            </tbody>

          </table>
        )}
      </div>
    </div>
  );
}