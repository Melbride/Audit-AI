import { useState, useEffect } from "react";
import API from "../api";


// Engagements.jsx — Audit AI Engagement Management Page
//
// IMPORTANT: This page does NOT render its own sidebar.
// Layout.jsx (in App.jsx) already provides the sidebar nav —
// this component only returns the page CONTENT that goes
// inside Layout's <main> area.
//
// What this page does:
// - Shows a table of ALL engagements (e.g. "Alpha Tech Ltd 2025 Audit")
// - Lets Admin/Senior Auditor CREATE a new engagement
// - In the SAME popup, lets you assign an Accountant and an Auditor
//   to the engagement team right away (so the workflow can start)
// - "View →" button on each row navigates to EngagementDetail
//   by calling onNavigate("engagement-detail", engagement_id)


const colors = {
  primary:    "#1E3A5F",
  secondary:  "#2E86C1",
  accent:     "#3498DB",
  background: "#F4F6F9",
  white:      "#FFFFFF",
  text:       "#2C3E50",
  success:    "#27AE60",
  warning:    "#F39C12",
  danger:     "#E74C3C",
};

export default function Engagements({ user, onNavigate }) {

  // STATE 
  const [engagements, setEngagements] = useState([]); // list of all engagements
  const [clients, setClients] = useState([]);          // for the "Client" dropdown
  const [users, setUsers] = useState([]);              // for the Accountant/Auditor dropdowns
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false); // popup form open/closed
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

 const [form, setForm] = useState({
    client_id: "",
    engagement_name: "",
    financial_year: "",
    status: "Planning",
    start_date: "",
    end_date: "",
    accountant_id: "",
    auditor_id: "",
    senior_auditor_id: "",
    assistant_manager_id: "",
    audit_manager_id: "",
    engagement_partner_id: "",
    quality_reviewer_id: "",
  });

  // PERMISSION CHECK 
  // Only Admin and Senior Auditor can create engagements
  const canCreate = user.role === "Admin" || user.role === "Senior Auditor";

  // ── LOAD DATA FROM BACKEND 
  // Fetches engagements, clients, and users all together
  // Clients populate the "Client" dropdown
  // Users are filtered into Accountants and Auditors for their dropdowns
  const loadData = async () => {
    setLoading(true);
    try {
      const [e, c, u] = await Promise.all([
        API.getEngagements(),
        API.getClients(),
        API.getUsers(),
      ]);
      setEngagements(Array.isArray(e) ? e : []);
      setClients(Array.isArray(c) ? c : []);
      setUsers(Array.isArray(u) ? u : []);
    } catch (err) {
      console.error("Failed to load engagements", err);
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);
// Filter users by role for team assignment dropdowns
  const accountants = users.filter((u) => u.role === "Accountant");
  const auditors = users.filter((u) => u.role === "Auditor");
  const seniorAuditors = users.filter((u) => u.role === "Senior Auditor");
  const assistantManagers = users.filter((u) => u.role === "Assistant Manager");
  const auditManagers = users.filter((u) => u.role === "Audit Manager");
  const engagementPartners = users.filter((u) => u.role === "Engagement Partner");
  const qualityReviewers = users.filter((u) => u.role === "Quality Reviewer");

  // OPEN MODAL: CREATE NEW ENGAGEMENT
const openCreateModal = () => {
    if (!canCreate) return;
    setForm({
      client_id: "", engagement_name: "", financial_year: "", status: "Planning",
      start_date: "", end_date: "",
      accountant_id: "", auditor_id: "", senior_auditor_id: "",
      assistant_manager_id: "", audit_manager_id: "",
      engagement_partner_id: "", quality_reviewer_id: "",
    });
    setError("");
    setShowModal(true);
  };

  //  SAVE: CREATE ENGAGEMENT + ASSIGN TEAM 
  // This does 3 things in sequence:
  // 1. Create the engagement (backend auto-creates 4 audit sections)
  // 2. If an Accountant was selected, add them to the engagement team
  // 3. If an Auditor was selected, add them to the engagement team too
  const handleSave = async (e) => {
    e.preventDefault();
    if (!canCreate) return;
    setSaving(true);
    setError("");
    try {
      // Step 1 — create the engagement itself
      const payload = {
        client_id: Number(form.client_id),
        engagement_name: form.engagement_name,
        financial_year: form.financial_year,
        status: form.status,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
      };
      const res = await API.createEngagement(payload);
      if (res.detail) { setError(res.detail); setSaving(false); return; }

      const engagementId = res.engagement_id;

      // Assign all team members who were selected
      const teamAssignments = [
        { id: form.accountant_id,         role: "Accountant" },
        { id: form.auditor_id,            role: "Auditor" },
        { id: form.senior_auditor_id,     role: "Senior Auditor" },
        { id: form.assistant_manager_id,  role: "Assistant Manager" },
        { id: form.audit_manager_id,      role: "Audit Manager" },
        { id: form.engagement_partner_id, role: "Engagement Partner" },
        { id: form.quality_reviewer_id,   role: "Quality Reviewer" },
      ];

      for (const member of teamAssignments) {
  if (member.id) {
    console.log("Adding team member:", member);
    const teamRes = await API.addTeamMember(engagementId, {
      engagement_id: engagementId,
      user_id: Number(member.id),
      role: member.role,
    });
    console.log("Team member result:", teamRes);
  }
}
      // Step 3 — assign the Auditor to this engagement's team (if one was picked)
      if (form.auditor_id) {
        await API.addTeamMember(engagementId, {
          engagement_id: engagementId,
          user_id: Number(form.auditor_id),
          role: "Auditor",
        });
      }

      setShowModal(false);
      loadData(); // refresh the table
    } catch (err) {
      setError("Could not create engagement. Check your connection.");
    }
    setSaving(false);
  };

  //  STATUS BADGE COLORS 
  const statusBadge = (status) => {
    const map = {
      "Planning":    { bg: "#EBF5FB", color: colors.accent },
      "In Progress": { bg: "#EAF5EA", color: colors.success },
      "Review":      { bg: "#FEF9E7", color: colors.warning },
      "Completed":   { bg: "#EAFAF1", color: colors.success },
    };
    return map[status] || { bg: "#F4F6F9", color: colors.text };
  };

  // ── REUSABLE INLINE STYLES 
  const inputStyle = {
    width: "100%", padding: "10px 12px", border: "1.5px solid #dce1e7",
    borderRadius: "8px", fontSize: "14px", color: colors.text,
    outline: "none", boxSizing: "border-box", marginBottom: "16px",
  };
  const labelStyle = { display: "block", fontSize: "13px", fontWeight: "600", color: colors.text, marginBottom: "6px" };

  // RENDER 
  // NOTE: no sidebar here — Layout.jsx in App.jsx already wraps this
  // entire return value with the sidebar via {children}
  return (
    <div>

      {/* Page header with title and "New Engagement" button (Admin + Senior Auditor only) */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: "700", color: colors.text, marginBottom: "4px" }}>Engagements</h1>
          <p style={{ fontSize: "14px", color: "#7f8c8d" }}>Manage audit engagements and assign teams</p>
        </div>

        {canCreate && (
          <button onClick={openCreateModal} style={{
            padding: "10px 20px", background: colors.primary, color: colors.white,
            border: "none", borderRadius: "8px", fontSize: "14px", fontWeight: "600", cursor: "pointer",
          }}>+ New Engagement</button>
        )}
      </div>

      {/* ── ENGAGEMENTS TABLE ── */}
      <div style={{ background: colors.white, borderRadius: "12px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", overflow: "hidden" }}>

        {loading ? (
          <p style={{ padding: "24px", color: "#7f8c8d" }}>Loading engagements...</p>
        ) : engagements.length === 0 ? (
          <p style={{ padding: "24px", color: "#7f8c8d" }}>No engagements yet. Click "+ New Engagement" to create one.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#FAFBFC", borderBottom: "1px solid #eee" }}>
                {["Engagement", "Client", "Financial Year", "Status", ""].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "14px 20px", fontSize: "12px", fontWeight: "600", color: "#7f8c8d", textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {engagements.map((e) => {
                const badge = statusBadge(e.status);
                return (
                  <tr key={e.engagement_id} style={{ borderBottom: "1px solid #f5f5f5" }}>
                    <td style={{ padding: "14px 20px", fontSize: "14px", color: colors.text, fontWeight: "500" }}>{e.engagement_name}</td>
                    <td style={{ padding: "14px 20px", fontSize: "14px", color: "#7f8c8d" }}>{e.company_name}</td>
                    <td style={{ padding: "14px 20px", fontSize: "14px", color: "#7f8c8d" }}>{e.financial_year}</td>
                    <td style={{ padding: "14px 20px" }}>
                      <span style={{ background: badge.bg, color: badge.color, padding: "3px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: "600" }}>{e.status}</span>
                    </td>
                    <td style={{ padding: "14px 20px" }}>
                      {/* Matches App.jsx's handleNavigate(newPage, params) signature exactly */}
                      <button onClick={() => onNavigate("engagement-detail", e.engagement_id)} style={{
                        background: "none", border: "none", color: colors.secondary,
                        cursor: "pointer", fontSize: "13px", fontWeight: "600",
                      }}>View →</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/*  CREATE ENGAGEMENT MODAL (with team assignment built in)  */}
      {showModal && canCreate && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
        }}>
          <div style={{ background: colors.white, borderRadius: "12px", padding: "32px", width: "460px", maxHeight: "90vh", overflowY: "auto" }}>

            <h3 style={{ fontSize: "18px", fontWeight: "700", color: colors.text, marginBottom: "20px" }}>
              New Engagement
            </h3>

            {error && (
              <div style={{ background: "#fdecea", border: `1px solid ${colors.danger}`, color: colors.danger, padding: "10px 14px", borderRadius: "8px", fontSize: "13px", marginBottom: "16px" }}>
                {error}
              </div>
            )}

            <form onSubmit={handleSave}>

              {/* Client dropdown */}
              <label style={labelStyle}>Client</label>
              <select style={inputStyle} required value={form.client_id}
                onChange={(e) => setForm({ ...form, client_id: e.target.value })}>
                <option value="">— Select a client —</option>
                {clients.map((c) => (
                  <option key={c.client_id} value={c.client_id}>{c.company_name}</option>
                ))}
              </select>

              {/* Engagement name */}
              <label style={labelStyle}>Engagement Name</label>
              <input style={inputStyle} required value={form.engagement_name}
                onChange={(e) => setForm({ ...form, engagement_name: e.target.value })}
                placeholder="e.g. Alpha Tech Ltd 2025 Audit" />

              {/* Financial year */}
              <label style={labelStyle}>Financial Year</label>
              <input style={inputStyle} required value={form.financial_year}
                onChange={(e) => setForm({ ...form, financial_year: e.target.value })}
                placeholder="e.g. 2025" />

              {/* Start / End dates */}
              <label style={labelStyle}>Start Date</label>
              <input style={inputStyle} type="date" value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })} />

              <label style={labelStyle}>End Date</label>
              <input style={inputStyle} type="date" value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })} />

              {/* ── TEAM ASSIGNMENT SECTION ── */}
              <div style={{ borderTop: "1px solid #eee", marginTop: "8px", paddingTop: "16px", marginBottom: "8px" }}>
                <p style={{ fontSize: "13px", fontWeight: "700", color: colors.text, marginBottom: "12px" }}>
                  Assign Workflow Team
                </p>
              </div>
{/* TEAM ASSIGNMENT — all 7 workflow roles  */}

              <label style={labelStyle}>Accountant (prepares the work)</label>
              <select style={inputStyle} value={form.accountant_id}
                onChange={(e) => setForm({ ...form, accountant_id: e.target.value })}>
                <option value="">— None yet —</option>
                {accountants.map((a) => <option key={a.user_id} value={a.user_id}>{a.full_name}</option>)}
              </select>

              <label style={labelStyle}>Auditor (fieldwork & testing)</label>
              <select style={inputStyle} value={form.auditor_id}
                onChange={(e) => setForm({ ...form, auditor_id: e.target.value })}>
                <option value="">— None yet —</option>
                {auditors.map((a) => <option key={a.user_id} value={a.user_id}>{a.full_name}</option>)}
              </select>

              <label style={labelStyle}>Senior Auditor (first-level review)</label>
              <select style={inputStyle} value={form.senior_auditor_id}
                onChange={(e) => setForm({ ...form, senior_auditor_id: e.target.value })}>
                <option value="">— None yet —</option>
                {seniorAuditors.map((a) => <option key={a.user_id} value={a.user_id}>{a.full_name}</option>)}
              </select>

              <label style={labelStyle}>Assistant Manager (complex review)</label>
              <select style={inputStyle} value={form.assistant_manager_id}
                onChange={(e) => setForm({ ...form, assistant_manager_id: e.target.value })}>
                <option value="">— None yet —</option>
                {assistantManagers.map((a) => <option key={a.user_id} value={a.user_id}>{a.full_name}</option>)}
              </select>

              <label style={labelStyle}>Audit Manager (in-depth review)</label>
              <select style={inputStyle} value={form.audit_manager_id}
                onChange={(e) => setForm({ ...form, audit_manager_id: e.target.value })}>
                <option value="">— None yet —</option>
                {auditManagers.map((a) => <option key={a.user_id} value={a.user_id}>{a.full_name}</option>)}
              </select>

              <label style={labelStyle}>Engagement Partner (final sign-off)</label>
              <select style={inputStyle} value={form.engagement_partner_id}
                onChange={(e) => setForm({ ...form, engagement_partner_id: e.target.value })}>
                <option value="">— None yet —</option>
                {engagementPartners.map((a) => <option key={a.user_id} value={a.user_id}>{a.full_name}</option>)}
              </select>

              <label style={labelStyle}>Quality Reviewer (independent check)</label>
              <select style={inputStyle} value={form.quality_reviewer_id}
                onChange={(e) => setForm({ ...form, quality_reviewer_id: e.target.value })}>
                <option value="">— None yet —</option>
                {qualityReviewers.map((a) => <option key={a.user_id} value={a.user_id}>{a.full_name}</option>)}
              </select>

              {/* Cancel / Save buttons */}
              <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
                <button type="button" onClick={() => setShowModal(false)} style={{
                  flex: 1, padding: "11px", background: "#F4F6F9", color: colors.text,
                  border: "1px solid #dce1e7", borderRadius: "8px", cursor: "pointer", fontWeight: "600",
                }}>Cancel</button>
                <button type="submit" disabled={saving} style={{
                  flex: 1, padding: "11px", background: colors.primary, color: colors.white,
                  border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "600",
                }}>{saving ? "Creating..." : "Create Engagement"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}