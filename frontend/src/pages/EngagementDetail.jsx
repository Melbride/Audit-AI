import { useState, useEffect } from "react";
import API from "../api";

const colors = {
  primary: "#1E3A5F",
  secondary: "#2E86C1",
  accent: "#3498DB",
  background: "#F4F6F9",
  white: "#FFFFFF",
  text: "#2C3E50",
  success: "#27AE60",
  warning: "#F39C12",
  danger: "#E74C3C",
  muted: "#95A5A6",
};

const statusColors = {
  Draft: colors.muted,
  "Under Review": colors.accent,
  "Changes Requested": colors.warning,
  Approved: colors.success,
  Cancelled: colors.danger,
};

const btnStyle = (color) => ({
  padding: "6px 14px",
  fontSize: "13px",
  fontWeight: "600",
  color,
  background: "transparent",
  border: `1px solid ${color}`,
  borderRadius: "6px",
  cursor: "pointer",
});

const WORKFLOW = [
  "Accountant",
  "Auditor",
  "Senior Auditor",
  "Assistant Manager",
  "Audit Manager",
  "Engagement Partner",
  "Quality Reviewer",
];

export default function EngagementDetail({ engagementId, user, onNavigate }) {
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
      const eng = await API.getEngagement(engagementId);
      setEngagement(eng);
      const secs = await API.getAuditSections(engagementId);
      const list = Array.isArray(secs) ? secs : [];
      setSections(list);
      const entries = await Promise.all(
        list.map(async (sec) => [sec.section_id, await API.getSectionLatestSubmission(sec.section_id)])
      );
      setSubmissions(Object.fromEntries(entries));
    } catch (err) {
      console.error("Failed to load engagement detail", err);
    }
    setLoading(false);
  };

  const handleAction = async (section, submission, newStatus, newStage, notes = null) => {
    if (!user) return;
    setActingOn(section.section_id);
    try {
      if (submission) {
        await API.updateSubmissionStatus(submission.submission_id, {
          status: newStatus,
          current_stage: newStage,
          notes,
          updated_by: user?.user_id,
        });
      } else {
        await API.createSubmission({
          engagement_id: engagementId,
          section_id: section.section_id,
          submitted_by: user?.user_id,
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

  const renderActions = (section, submission) => {
    if (!user) return null;
    const stage = submission?.current_stage || "Accountant";
    const status = submission?.status || "Draft";
    const isActing = actingOn === section.section_id;
    const role = user.role;

    if (role === "Admin") {
      return (
        <span style={{ fontSize: "13px", color: colors.muted }}>
          {status === "Approved" ? "Approved ✓" : status === "Cancelled" ? "Cancelled ✗" : `Waiting on ${stage}`}
        </span>
      );
    }
    if (status === "Approved") {
      return <span style={{ fontSize: "13px", fontWeight: "600", color: colors.success }}>Approved ✓</span>;
    }
    if (status === "Cancelled") {
      return <span style={{ fontSize: "13px", fontWeight: "600", color: colors.danger }}>Cancelled ✗</span>;
    }
    if (role !== stage) {
      return <span style={{ fontSize: "13px", color: colors.muted }}>Waiting on {stage}</span>;
    }

    const currentIndex = WORKFLOW.indexOf(stage);
    const prevStage = currentIndex > 0 ? WORKFLOW[currentIndex - 1] : null;
    const nextStage = currentIndex < WORKFLOW.length - 1 ? WORKFLOW[currentIndex + 1] : null;
    const isLastStage = currentIndex === WORKFLOW.length - 1;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", minWidth: "240px" }}>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {isLastStage ? (
            <button
              disabled={isActing}
              onClick={() => handleAction(section, submission, "Approved", null, noteDrafts[section.section_id] || null)}
              style={btnStyle(colors.success)}
            >
              {isActing ? "Approving..." : "Approve"}
            </button>
          ) : (
            <button
              disabled={isActing}
              onClick={() => handleAction(section, submission, "Under Review", nextStage, noteDrafts[section.section_id] || null)}
              style={btnStyle(colors.secondary)}
            >
              {isActing ? "Forwarding..." : `Forward to ${nextStage}`}
            </button>
          )}
          {prevStage && (
            <button
              disabled={isActing}
              onClick={() => handleAction(section, submission, "Changes Requested", prevStage, noteDrafts[section.section_id] || null)}
              style={btnStyle(colors.warning)}
            >
              Return to {prevStage}
            </button>
          )}
          <button
            disabled={isActing}
            onClick={() => handleAction(section, submission, "Cancelled", null, noteDrafts[section.section_id] || null)}
            style={btnStyle(colors.danger)}
          >
            Cancel
          </button>
        </div>
        <input
          type="text"
          placeholder="Add a note (optional)"
          value={noteDrafts[section.section_id] || ""}
          onChange={(e) => setNoteDrafts((prev) => ({ ...prev, [section.section_id]: e.target.value }))}
          style={{ padding: "6px 10px", fontSize: "13px", border: "1px solid #ddd", borderRadius: "6px" }}
        />
      </div>
    );
  };

  if (!engagementId) return <p style={{ padding: "24px", color: "#7f8c8d" }}>Select an engagement to view details.</p>;
  if (loading) return <p style={{ padding: "24px", color: "#7f8c8d" }}>Loading engagement...</p>;
  if (!user) return <p style={{ padding: "24px", color: "#7f8c8d" }}>Loading user...</p>;
  if (!engagement) return <p style={{ padding: "24px", color: "#7f8c8d" }}>Engagement not found.</p>;

  return (
    <div>
      <button
        onClick={() => onNavigate("engagements")}
        style={{ background: "none", border: "none", color: colors.secondary, cursor: "pointer", marginBottom: "16px", fontSize: "14px", padding: 0 }}
      >
        ← Back to Engagements
      </button>

      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: "700", color: colors.text, marginBottom: "4px" }}>
          {engagement.engagement_name}
        </h1>
        <p style={{ fontSize: "14px", color: "#7f8c8d" }}>
          {engagement.company_name || "—"} · FY {engagement.financial_year || "—"}
        </p>
      </div>

      {["Engagement Partner", "Quality Reviewer", "Admin"].includes(user.role) &&
        sections.some(sec => submissions[sec.section_id]?.status === "Approved") && (
        <div style={{ marginBottom: "16px" }}>
          <button
            onClick={async () => {
              try {
                const res = await API.sendToClient(engagementId);
                alert(res.message || "Email sent successfully");
              } catch (err) {
                alert("Failed to send email");
              }
            }}
            style={{
              padding: "10px 20px",
              background: colors.success,
              color: colors.white,
              border: "none",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: "600",
              cursor: "pointer",
            }}
          >
            📧 Send Report to Client
          </button>
        </div>
      )}

      <div style={{ background: colors.white, borderRadius: "12px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", overflow: "hidden" }}>
        {sections.length === 0 ? (
          <p style={{ padding: "24px", color: "#7f8c8d" }}>No audit sections found for this engagement.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#FAFBFC", borderBottom: "1px solid #eee" }}>
                {["Section", "Status", "Last Updated By", "Actions"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "14px 20px", fontSize: "12px", fontWeight: "600", color: "#7f8c8d", textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sections.map((section) => {
                const submission = submissions[section.section_id];
                const status = submission?.status || "Draft";
                return (
                  <tr key={section.section_id} style={{ borderBottom: "1px solid #f5f5f5" }}>
                    <td style={{ padding: "14px 20px", fontSize: "14px", color: colors.text, fontWeight: "500" }}>{section.section_name}</td>
                    <td style={{ padding: "14px 20px" }}>
                      <span style={{ fontSize: "12px", fontWeight: "600", color: statusColors[status] || colors.muted, background: `${statusColors[status] || colors.muted}1A`, padding: "4px 10px", borderRadius: "12px" }}>
                        {status}
                      </span>
                      {submission?.notes && (
                        <div style={{ fontSize: "12px", color: "#7f8c8d", marginTop: "4px" }}>"{submission.notes}"</div>
                      )}
                    </td>
                    <td style={{ padding: "14px 20px", fontSize: "14px", color: "#7f8c8d" }}>{submission?.submitted_by_name || "—"}</td>
                    <td style={{ padding: "14px 20px" }}>{renderActions(section, submission)}</td>
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