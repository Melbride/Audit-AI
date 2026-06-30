import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getEngagement,
  getAuditSections,
  getSectionLatestSubmission,
  updateSubmissionStatus,
  createSubmission,
  sendToClient,
} from "../services/api";
import "../styles/EngagementDetail.css";

const WORKFLOW = [
  "Accountant",
  "Auditor",
  "Senior Auditor",
  "Assistant Manager",
  "Audit Manager",
  "Engagement Partner",
  "Quality Reviewer",
];

export default function EngagementDetail({ user }) {
  const { engagementId } = useParams();
  const navigate = useNavigate();

  const [engagement, setEngagement] = useState(null);
  const [sections, setSections] = useState([]);
  const [submissions, setSubmissions] = useState({});
  const [loading, setLoading] = useState(true);
  const [actingOn, setActingOn] = useState(null);
  const [noteDrafts, setNoteDrafts] = useState({});

  useEffect(() => {
    if (!engagementId) return;
    loadData();
  }, [engagementId]);

  const loadData = async () => {
    setLoading(true);

    try {
      const eng = await getEngagement(engagementId);
      setEngagement(eng.data);

      const secs = await getAuditSections(engagementId);
      const list = Array.isArray(secs.data) ? secs.data : [];

      setSections(list);

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
        await updateSubmissionStatus(submission.submission_id, {
          status: newStatus,
          current_stage: newStage,
          notes,
          updated_by: user.user_id,
        });
      } else {
        await createSubmission({
          engagement_id: engagementId,
          section_id: section.section_id,
          submitted_by: user.user_id,
          status: newStatus,
          current_stage: newStage,
          notes,
        });
      }

      await loadData();
    } catch (err) {
      console.error("Failed to update submission", err);
    }

    setActingOn(null);
  };

  const getStatusClass = (status) =>
    status.toLowerCase().replace(/\s+/g, "-");

  const renderActions = (section, submission) => {
    if (!user) return null;

    const stage = submission?.current_stage || "Accountant";
    const status = submission?.status || "Draft";
    const isActing = actingOn === section.section_id;
    const role = user.role;

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

    if (status === "Approved") {
      return (
        <span className="workflow-approved">
          Approved
        </span>
      );
    }

    if (status === "Cancelled") {
      return (
        <span className="workflow-cancelled">
          Cancelled
        </span>
      );
    }

    if (role !== stage) {
      return (
        <span className="workflow-text">
          Waiting on {stage}
        </span>
      );
    }

    const currentIndex = WORKFLOW.indexOf(stage);

    const prevStage =
      currentIndex > 0 ? WORKFLOW[currentIndex - 1] : null;

    const nextStage =
      currentIndex < WORKFLOW.length - 1
        ? WORKFLOW[currentIndex + 1]
        : null;

    const isLastStage =
      currentIndex === WORKFLOW.length - 1;

    return (
      <div className="workflow-actions">
        <div className="workflow-buttons">
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

  if (!engagementId) {
    return (
      <p className="empty-message">
        Select an engagement to view details.
      </p>
    );
  }

  if (loading) {
    return (
      <p className="loading-message">
        Loading engagement...
      </p>
    );
  }

  if (!user) {
    return (
      <p className="loading-message">
        Loading user...
      </p>
    );
  }

  if (!engagement) {
    return (
      <p className="error-message">
        Engagement not found.
      </p>
    );
  }

    return (
    <div className="engagement-detail">
      <button
        className="back-button"
        onClick={() => navigate("/engagements")}
      >
        ← Back to Engagements
      </button>

      <div className="engagement-header">
        <h1>{engagement.engagement_name}</h1>

        <p>
          {engagement.company_name || "—"} · FY{" "}
          {engagement.financial_year || "—"}
        </p>
      </div>

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

      <div className="sections-card">
        {sections.length === 0 ? (
          <p className="empty-message">
            No audit sections found for this engagement.
          </p>
        ) : (
          <table className="sections-table">
            <thead>
              <tr>
                <th>Section</th>
                <th>Status</th>
                <th>Last Updated By</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {sections.map((section) => {
                const submission =
                  submissions[section.section_id];

                const status =
                  submission?.status || "Draft";

                return (
                  <tr key={section.section_id}>
                    <td className="section-name">
                      {section.section_name}
                    </td>

                    <td>
                      <span
                        className={`status-badge ${getStatusClass(
                          status
                        )}`}
                      >
                        {status}
                      </span>

                      {submission?.notes && (
                        <div className="status-note">
                          "{submission.notes}"
                        </div>
                      )}
                    </td>

                    <td className="updated-by">
                      {submission?.submitted_by_name || "—"}
                    </td>

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