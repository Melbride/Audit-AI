// React hooks
import { useState, useEffect, Fragment } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { BalanceSheetSummaryChart, AccountBreakdownChart, IncomeStatementChart } from "../components/FinancialCharts";
// API functions
import {
  getEngagement,
  getAuditSections,
  getSectionLatestSubmission,
  sendToClient,
  downloadStatementTemplate,
  saveEngagementFinalAnalysis,
  generateReport,
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
  const [analysisState, setAnalysisState] = useState("idle"); // idle | saving | saved | error
  const [analysisResult, setAnalysisResult] = useState(null);
  const [generatingReport, setGeneratingReport] = useState(false);

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

        {/* <button
          className="action-btn secondary"
          onClick={() => navigate(`/analysis/${engagementId}`)}
        >
          View Analysis
        </button> */}
{/* 
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
        </button> */}
     </div>

      {/* Engagement-level readiness card: appears once every in-scope
          section is approved. display_status comes from the existing
          backend calculation (apply_display_status) — nothing recalculated here. */}
      {engagement.display_status === "Under Review" && (
        <div className="ready-card">
          <p className="ready-card-title">
            Engagement Ready for Analysis
          </p>
          <p className="ready-card-copy">
            All in-scope sections have been completed and approved.
          </p>

          <button
            className="action-btn secondary"
            disabled={analysisState === "saving"}
            onClick={async () => {
              setAnalysisState("saving");
              try {
                const res = await saveEngagementFinalAnalysis(engagementId, {
                  saved_by: user.user_id,
                });
                setAnalysisResult(res.data);
                setAnalysisState("saved");
              } catch (err) {
                setAnalysisState("error");
                alert(err.response?.data?.detail || "Failed to generate analysis.");
              }
            }}
          >
            {analysisState === "saving" ? "Generating…" : "Generate Analysis"}
          </button>

          {analysisState === "saved" && analysisResult && (
            <div style={{ marginTop: "16px", border: "1px solid #E5E7EB", borderRadius: "8px", padding: "16px 20px", background: "#fff" }}>
              <p style={{ fontWeight: 700, marginBottom: "12px" }}>Financial Analysis</p>

              {analysisResult.financial_statements?.applicable ? (
                <>
                  {/* Balance Sheet */}
                  <p style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", color: "#6B7280", marginBottom: "6px" }}>
                    Balance Sheet
                  </p>
                  <table style={{ width: "100%", fontSize: "13px", marginBottom: "16px", borderCollapse: "collapse" }}>
                    <tbody>
                      <tr><td colSpan={2} style={{ fontWeight: 700, paddingTop: "6px" }}>Assets</td></tr>
                      {analysisResult.financial_statements.balance_sheet.assets.map((a, i) => (
                        <tr key={`asset-${i}`}>
                          <td style={{ paddingLeft: "12px" }}>{a.account_name} <span style={{ color: "#9CA3AF" }}>({a.category})</span></td>
                          <td style={{ textAlign: "right" }}>{Number(a.amount).toLocaleString()}</td>
                        </tr>
                      ))}
                      <tr>
                        <td style={{ fontWeight: 600 }}>Total Assets</td>
                        <td style={{ textAlign: "right", fontWeight: 600 }}>
                          {Number(analysisResult.financial_statements.balance_sheet.total_assets).toLocaleString()}
                        </td>
                      </tr>

                      <tr><td colSpan={2} style={{ fontWeight: 700, paddingTop: "12px" }}>Liabilities</td></tr>
                      {analysisResult.financial_statements.balance_sheet.liabilities.map((l, i) => (
                        <tr key={`liability-${i}`}>
                          <td style={{ paddingLeft: "12px" }}>{l.account_name} <span style={{ color: "#9CA3AF" }}>({l.category})</span></td>
                          <td style={{ textAlign: "right" }}>{Number(l.amount).toLocaleString()}</td>
                        </tr>
                      ))}
                      <tr>
                        <td style={{ fontWeight: 600 }}>Total Liabilities</td>
                        <td style={{ textAlign: "right", fontWeight: 600 }}>
                          {Number(analysisResult.financial_statements.balance_sheet.total_liabilities).toLocaleString()}
                        </td>
                      </tr>

                      {analysisResult.financial_statements.balance_sheet.equity.length > 0 && (
                        <>
                          <tr><td colSpan={2} style={{ fontWeight: 700, paddingTop: "12px" }}>Equity</td></tr>
                          {analysisResult.financial_statements.balance_sheet.equity.map((eq, i) => (
                            <tr key={`equity-${i}`}>
                              <td style={{ paddingLeft: "12px" }}>{eq.account_name}</td>
                              <td style={{ textAlign: "right" }}>{Number(eq.amount).toLocaleString()}</td>
                            </tr>
                          ))}
                        </>
                      )}
                    </tbody>
                  </table>
            <div style={{ marginBottom: "20px" }}>
             <BalanceSheetSummaryChart balanceSheet={analysisResult.financial_statements.balance_sheet} />
            </div>

             {analysisResult.financial_statements.balance_sheet.assets.length > 0 && (
              <div style={{ marginBottom: "20px" }}>
               <p style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", color: "#6B7280", marginBottom: "6px" }}>
                  Asset Breakdown
                 </p>
                <AccountBreakdownChart accounts={analysisResult.financial_statements.balance_sheet.assets} color="#2563EB" />
              </div>
            )}      


                  {/* Income Statement */}
                  {(analysisResult.financial_statements.income_statement.revenue.length > 0 ||
                    analysisResult.financial_statements.income_statement.expenses.length > 0) && (
                    <>
                      <p style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", color: "#6B7280", marginBottom: "6px" }}>
                        Income Statement
                      </p>
                      <table style={{ width: "100%", fontSize: "13px", marginBottom: "16px", borderCollapse: "collapse" }}>
                        <tbody>
                          <tr><td colSpan={2} style={{ fontWeight: 700 }}>Revenue</td></tr>
                          {analysisResult.financial_statements.income_statement.revenue.map((r, i) => (
                            <tr key={`rev-${i}`}>
                              <td style={{ paddingLeft: "12px" }}>{r.account_name}</td>
                              <td style={{ textAlign: "right" }}>{Number(r.amount).toLocaleString()}</td>
                            </tr>
                          ))}
                          <tr><td colSpan={2} style={{ fontWeight: 700, paddingTop: "8px" }}>Expenses</td></tr>
                          {analysisResult.financial_statements.income_statement.expenses.map((e, i) => (
                            <tr key={`exp-${i}`}>
                              <td style={{ paddingLeft: "12px" }}>{e.account_name}</td>
                              <td style={{ textAlign: "right" }}>{Number(e.amount).toLocaleString()}</td>
                            </tr>
                          ))}
                          <tr>
                            <td style={{ fontWeight: 700, paddingTop: "8px" }}>Net Profit</td>
                            <td style={{ textAlign: "right", fontWeight: 700, paddingTop: "8px" }}>
                              {Number(analysisResult.financial_statements.income_statement.net_profit).toLocaleString()}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                      <IncomeStatementChart incomeStatement={analysisResult.financial_statements.income_statement} />
                    </>
                  )}
                </>
              ) : (
                <p style={{ color: "#6B7280", fontSize: "13px" }}>
                  No account mapping was found — showing raw breakdown instead.
                </p>
              )}

              {analysisResult.ai_insights?.length > 0 && (
                <>
                  <p style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", color: "#6B7280", marginBottom: "6px" }}>
                    Insights
                  </p>
                  <ul style={{ fontSize: "13px", marginBottom: "16px", paddingLeft: "18px" }}>
                    {analysisResult.ai_insights.map((insight, i) => (
                      <li key={i}>{typeof insight === "string" ? insight : insight.text || JSON.stringify(insight)}</li>
                    ))}
                  </ul>
                </>
              )}

              <button
                className="action-btn secondary"
                disabled={generatingReport}
                onClick={async () => {
                  setGeneratingReport(true);
                  try {
                    const res = await generateReport({
                      client_id: engagement.client_id,
                      engagement_id: Number(engagementId),
                      report_type: "custom",
                      start_date: engagement.start_date,
                      end_date: engagement.end_date,
                      generated_by: user.user_id,
                    });
                    navigate(`/reports/${res.data.report_id}`);
                  } catch (err) {
                    alert(err.response?.data?.detail || "Failed to generate report.");
                  } finally {
                    setGeneratingReport(false);
                  }
                }}
              >
                {generatingReport ? "Generating Report…" : "Generate Report"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Allow Engagement Partner and Admin to send the final approved report
          to the client. Backend restricts this to "Engagement Partner" only
          (see require_role), so the frontend condition matches that — Quality
          Reviewer sees the section table but not this action. */}
      {["Engagement Partner", "Admin"].includes(
        user.role
      ) &&
        sections.length > 0 &&
        sections.every(
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
                  loadData();
                } catch (err) {
                  // Surface the real backend reason (e.g. "Cannot send to
                  // client until every section's latest submission is
                  // Approved") instead of a generic failure message
                  alert(err.response?.data?.detail || "Failed to send email.");
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
                        className="action-btn secondary compact"
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
                          Review Submission
                        </button>
                      ) : (
                        <span className="workflow-text">Not yet submitted</span>
                      )}
                    </td>
                  </tr>

                  {/* Expanded panel: milestone tracker + review log for this section */}
                  {expandedSection === section.section_id && (
                    <tr>
                      <td colSpan={5} className="expanded-row-cell">
                        <div className="milestones-block">
                          <p className="milestones-heading">
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