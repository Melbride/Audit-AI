// React hooks
import { useState, useEffect, Fragment } from "react";
import { useParams, useNavigate } from "react-router-dom";
// API functions
import {
  getEngagement,
  getAuditSections,
  getSectionLatestSubmission,
  sendToClient,
  downloadStatementTemplate,
} from "../services/api";
import SectionMilestones from "../components/SectionMilestones";
import SectionReviews from "../components/SectionReviews";
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
  const [expandedSection, setExpandedSection] = useState(null); // section_id currently showing milestones/reviews
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);

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

  // Converts a status string into a CSS-safe class suffix
  const getStatusClass = (status) =>
    status.toLowerCase().replace(/\s+/g, "-");

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
        Back to Engagements
      </button>

      {/* Display the selected engagement's basic information */}
      <div className="engagement-header">
        <h1>{engagement.engagement_name}</h1>

        <p>
          {engagement.company_name || "—"} · FY{" "}
          {engagement.financial_year || "—"}
        </p>

        <button
          className="action-btn secondary"
          onClick={() => navigate(`/analysis/${engagementId}`)}
        >
          View Analysis
        </button>

        <button
          className="action-btn secondary"
          disabled={downloadingTemplate}
          onClick={async () => {
            setDownloadingTemplate(true);
            try {
              await downloadStatementTemplate(engagementId, engagement.engagement_name);
            } catch (err) {
              alert("Failed to download template.");
            } finally {
              setDownloadingTemplate(false);
            }
          }}
        >
          {downloadingTemplate ? "Preparing…" : "Download Statement Template"}
        </button>
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
                <th>Milestones</th>
                <th>Actions</th>
              </tr>
            </thead>

            {/* Render each audit section and its workflow status */}
            <tbody>
              {sections.map((section) => {
                const submission = submissions[section.section_id];
                const status = submission?.status || "Draft";

                return (
                  <Fragment key={section.section_id}>
                  <tr>

                    {/* Audit section name */}
                    <td className="section-name">
                      {section.section_name}
                    </td>

                    {/* Current workflow status and reviewer notes */}
                    <td>
                      <span className={`status-badge ${getStatusClass(status)}`}>
                        {status}
                      </span>
                      {submission?.notes && (
                        <div className="status-note">"{submission.notes}"</div>
                      )}
                    </td>

                    {/* Name of the user who last updated the submission */}
                    <td className="updated-by">
                      {submission?.submitted_by_name || "—"}
                    </td>

                    {/* Toggle to expand/collapse this section's milestones + review log */}
                    <td>
                      <button
                        className="action-btn secondary"
                        style={{ padding: "4px 10px", fontSize: "11px" }}
                        onClick={() =>
                          setExpandedSection(
                            expandedSection === section.section_id ? null : section.section_id
                          )
                        }
                      >
                        {expandedSection === section.section_id ? "Hide" : "View"}
                      </button>
                    </td>

                    {/* Render workflow action buttons based on the user's role */}
                    <td>
                      {submission ? (
                        <button
                          className="action-btn secondary"
                          onClick={() => navigate(`/submissions/${submission.submission_id}/review`)}
                        >
                          📋 Review Submission
                        </button>
                      ) : (
                        <span className="workflow-text">Not yet submitted</span>
                      )}
                    </td>
                  </tr>

                  {/* Expanded panel: milestone tracker + review log for this section */}
                  {expandedSection === section.section_id && (
                    <tr>
                      <td colSpan={5} style={{ background: "#F9FAFB", padding: "16px 20px" }}>
                        <div style={{ marginBottom: "16px" }}>
                          <p style={{ fontSize: "11px", fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "8px" }}>
                            Milestones
                          </p>
                          <SectionMilestones sectionId={section.section_id} user={user} />
                        </div>
                        <SectionReviews sectionId={section.section_id} user={user} />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>

          </table>
        )}
      </div>
    </div>
  );
}