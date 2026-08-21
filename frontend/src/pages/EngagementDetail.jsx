// React hooks
import { useState, useEffect, Fragment } from "react";
import { useParams, useNavigate } from "react-router-dom";
import FinancialCharts, { BarChart, DonutPanel } from "../components/FinancialCharts";
// API functions
import {
  getEngagement,
  getAuditSections,
  getSectionLatestSubmission,
  sendToClient,
  saveEngagementFinalAnalysis,
  generateReport,
} from "../services/api";
import SectionMilestones from "../components/SectionMilestones";
import SectionReviews from "../components/SectionReviews";
import "../styles/EngagementDetail.css";

// Workflow approval stages, in order.
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

  // Component state
  const [engagement, setEngagement] = useState(null);
  const [sections, setSections] = useState([]);
  const [submissions, setSubmissions] = useState({});
  const [loading, setLoading] = useState(true);
  const [expandedSection, setExpandedSection] = useState(null);
  const [analysisState, setAnalysisState] = useState("idle"); // idle | saving | saved | error
  const [analysisResult, setAnalysisResult] = useState(null);
  const [generatingReport, setGeneratingReport] = useState(false);

  // Load engagement data whenever the ID changes
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

  const getStatusClass = (status) =>
    status.toLowerCase().replace(/\s+/g, "-");

  if (!engagementId) {
    return <p className="empty-message">Select an engagement to view details.</p>;
  }
  if (loading) {
    return <p className="loading-message">Loading engagement...</p>;
  }
  if (!user) {
    return <p className="loading-message">Loading user...</p>;
  }
  if (!engagement) {
    return <p className="error-message">Engagement not found.</p>;
  }

  return (
    <div className="engagement-detail">
      <button
        className="back-button"
        onClick={() => navigate("/engagements")}
      >
        Back to Engagements
      </button>

      <div className="engagement-header">
        <h1>{engagement.engagement_name}</h1>
        <p>
          {engagement.company_name || "—"} · FY{" "}
          {engagement.financial_year || "—"}
        </p>
     </div>

      {/* Engagement-level readiness card */}
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
              <p style={{ fontWeight: 700, marginBottom: "12px", fontSize: "16px" }}>Financial Analysis & Interactive Trends</p>

              {/* Advanced Multi-Period Financial Charts Component with Variance & Anomaly Flags */}
              {analysisResult.period_summaries && analysisResult.period_summaries.length > 0 ? (
                <FinancialCharts 
                  periodSummaries={analysisResult.period_summaries}
                  expenseDonutData={analysisResult.expense_breakdown?.map(e => ({ label: e.category, value: Number(e.amount) }))}
                  revenueDonutData={analysisResult.revenue_breakdown?.map(r => ({ label: r.category, value: Number(r.amount) }))}
                  anomalies={analysisResult.anomalies || []}
                />
              ) : (
                /* Fallback to Balance Sheet & Income Statement visual breakdown if summaries aren't structured */
                <>
                  {analysisResult.financial_statements?.balance_sheet && (
                    <div style={{ marginBottom: "20px" }}>
                      <p style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", color: "#6B7280", marginBottom: "6px" }}>
                        Balance Sheet Overview
                      </p>
                      <BarChart 
                        data={[
                          { label: "Assets", value: analysisResult.financial_statements.balance_sheet.total_assets },
                          { label: "Liabilities", value: analysisResult.financial_statements.balance_sheet.total_liabilities }
                        ]} 
                        keys={["value"]} 
                        colors={["#2563eb", "#ef4444"]}
                      />
                    </div>
                  )}
                </>
              )}

              {analysisResult.ai_insights?.length > 0 && (
                <>
                  <p style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", color: "#6B7280", marginBottom: "6px", marginTop: "16px" }}>
                    AI Audit Insights & Flags
                  </p>
                  <ul style={{ fontSize: "13px", marginBottom: "16px", paddingLeft: "18px" }}>
                    {analysisResult.ai_insights.map((insight, i) => (
                      <li key={i}>{typeof insight === "string" ? insight : insight.text || JSON.stringify(insight)}</li>
                    ))}
                  </ul>
                </>
              )}

              {user.role === "Auditor" && (
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
              )}
            </div>
          )}
        </div>
      )}

      {/* Send Report to Client section */}
      {["Engagement Partner", "Admin"].includes(user.role) &&
        sections.length > 0 &&
        sections.every((sec) => submissions[sec.section_id]?.status === "Approved") && (
          <div className="send-report">
            <button
              className="send-report-btn"
              onClick={async () => {
                try {
                  const res = await sendToClient(engagementId);
                  alert(res.data?.message || "Email sent successfully.");
                  loadData();
                } catch (err) {
                  alert(err.response?.data?.detail || "Failed to send email.");
                }
              }}
            >
              Send Report to Client
            </button>
          </div>
        )}

      {/* Audit Sections Table */}
      <div className="sections-card">
        {sections.length === 0 ? (
          <p className="empty-message">No audit sections found for this engagement.</p>
        ) : (
          <table className="sections-table">
            <thead>
              <tr>
                <th>Section</th>
                <th>Status</th>
                <th>Last Updated By</th>
                <th>Milestones</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sections.map((section) => {
                const submission = submissions[section.section_id];
                const status = submission?.status || "Draft";

                return (
                  <Fragment key={section.section_id}>
                  <tr>
                    <td className="section-name">{section.section_name}</td>
                    <td>
                      <span className={`status-badge ${getStatusClass(status)}`}>
                        {status}
                      </span>
                      {submission?.notes && (
                        <div className="status-note">"{submission.notes}"</div>
                      )}
                    </td>
                    <td className="updated-by">{submission?.submitted_by_name || "—"}</td>
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

                  {expandedSection === section.section_id && (
                    <tr>
                      <td colSpan={5} className="expanded-row-cell">
                        <div className="milestones-block">
                          <p className="milestones-heading">Milestones</p>
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