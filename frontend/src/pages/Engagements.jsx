// React hooks
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getEngagements, getClients, getUsers, createEngagement, addTeamMember } from "../services/api";
import "../styles/Engagements.css";

// Components state
// Engagements page: lists all audit engagements and allows authorized users
// to create a new engagement along with assigning a workflow review team.
export default function Engagements({ user }) {
  const navigate = useNavigate();

  // Data loaded from the API
  const [engagements, setEngagements] = useState([]); // list of engagements shown in the table
  const [clients, setClients] = useState([]);          // clients available to attach an engagement to
  const [users, setUsers] = useState([]);               // all users, later filtered by role for team assignment

  // UI state
  const [loading, setLoading] = useState(true);   // true while initial data is being fetched
  const [showModal, setShowModal] = useState(false); // controls visibility of the "New Engagement" modal
  const [error, setError] = useState("");           // error message shown inside the modal
  const [saving, setSaving] = useState(false);       // true while the create-engagement request is in flight

  // Form state for the "New Engagement" modal.
  // Includes core engagement fields plus one user id per workflow role.
  const [form, setForm] = useState({
    client_id: "", engagement_name: "", financial_year: "", status: "Planning",
    start_date: "", end_date: "", accountant_id: "", auditor_id: "",
    senior_auditor_id: "", assistant_manager_id: "", audit_manager_id: "",
    engagement_partner_id: "", quality_reviewer_id: "",
  });

  // Only Admins and Senior Auditors are allowed to create new engagements
  const canCreate = user.role === "Admin" || user.role === "Senior Auditor";

  // Fetches engagements, clients, and users in parallel and populates state.
  // Falls back to empty arrays if the response isn't shaped as expected.
  const loadData = async () => {
    setLoading(true);
    try {
      const [e, c, u] = await Promise.all([getEngagements(), getClients(), getUsers()]);
      setEngagements(Array.isArray(e.data) ? e.data : []);
      setClients(Array.isArray(c.data) ? c.data : []);
      setUsers(Array.isArray(u.data) ? u.data : []);
    } catch (err) {
      console.error("Failed to load engagements", err);
    }
    setLoading(false);
  };

  // Load all data once when the component mounts
  useEffect(() => { loadData(); }, []);

  // Split the full user list into role-specific lists so each dropdown
  // in the team-assignment section only shows relevant candidates.
  const accountants        = users.filter((u) => u.role === "Accountant");
  const auditors           = users.filter((u) => u.role === "Auditor");
  const seniorAuditors     = users.filter((u) => u.role === "Senior Auditor");
  const assistantManagers  = users.filter((u) => u.role === "Assistant Manager");
  const auditManagers      = users.filter((u) => u.role === "Audit Manager");
  const engagementPartners = users.filter((u) => u.role === "Engagement Partner");
  const qualityReviewers   = users.filter((u) => u.role === "Quality Reviewer");

  // Resets the form to blank values and opens the "New Engagement" modal.
  // No-ops if the current user isn't allowed to create engagements.
  const openCreateModal = () => {
    if (!canCreate) return;
    setForm({
      client_id: "", engagement_name: "", financial_year: "", status: "Planning",
      start_date: "", end_date: "", accountant_id: "", auditor_id: "",
      senior_auditor_id: "", assistant_manager_id: "", audit_manager_id: "",
      engagement_partner_id: "", quality_reviewer_id: "",
    });
    setError("");
    setShowModal(true);
  };

  // Handles submission of the New Engagement form
  const handleSave = async (e) => {
    e.preventDefault();
    if (!canCreate) return;
    setSaving(true);
    setError("");
    try {
      // Build the core engagement payload (team members are added separately below)
      const payload = {
        client_id: Number(form.client_id),
        engagement_name: form.engagement_name,
        financial_year: form.financial_year,
        status: form.status,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
      };
      const res = await createEngagement(payload);

      // API may return a 200 with an error detail instead of throwing
      if (res.data?.detail) { setError(res.data.detail); setSaving(false); return; }

      const engagementId = res.data.engagement_id;

      // Pair each selected user id with its corresponding workflow role
      const teamAssignments = [
        { id: form.accountant_id,         role: "Accountant" },
        { id: form.auditor_id,            role: "Auditor" },
        { id: form.senior_auditor_id,     role: "Senior Auditor" },
        { id: form.assistant_manager_id,  role: "Assistant Manager" },
        { id: form.audit_manager_id,      role: "Audit Manager" },
        { id: form.engagement_partner_id, role: "Engagement Partner" },
        { id: form.quality_reviewer_id,   role: "Quality Reviewer" },
      ];

      // Only add a team member if a user was actually selected for that role.
      // Sequential awaits keep this simple; could be parallelized with Promise.all if needed.
      for (const member of teamAssignments) {
        if (member.id) {
          await addTeamMember(engagementId, { engagement_id: engagementId, user_id: Number(member.id), role: member.role });
        }
      }

      setShowModal(false);
      loadData(); // refresh the table with the newly created engagement
    } catch (err) {
      setError("Could not create engagement. Check your connection.");
    }
    setSaving(false);
  };

  // Maps an engagement status string to its corresponding CSS badge class
  const statusBadgeClass = (status) => {
    const map = {
      "Planning":    "eng-status-planning",
      "In Progress": "eng-status-inprogress",
      "Review":      "eng-status-review",
      "Completed":   "eng-status-completed",
    };
    return map[status] || "eng-status-default";
  };

  return (
    <div>
      {/* Page header with title and "New Engagement" button (visible only to authorized roles) */}
      <div className="eng-header">
        <div>
          <h1>Engagements</h1>
          <p>Manage audit engagements and assign teams</p>
        </div>
        {canCreate && (
          <button onClick={openCreateModal} className="eng-btn-new">New Engagement</button>
        )}
      </div>

      {/* Engagements table: loading state, empty state, or populated table */}
      <div className="eng-table-card">
        {loading ? (
          <p className="eng-loading">Loading engagements...</p>
        ) : engagements.length === 0 ? (
          <p className="eng-empty">No engagements yet. Click "New Engagement" to create one.</p>
        ) : (
          <table className="eng-table">
            <thead>
              <tr>
                {["Engagement", "Client", "Financial Year", "Status", ""].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {engagements.map((e) => (
                <tr key={e.engagement_id}>
                  <td className="eng-table-name">{e.engagement_name}</td>
                  <td className="eng-table-muted">{e.company_name}</td>
                  <td className="eng-table-muted">{e.financial_year}</td>
                  <td className="eng-table-status">
                    <span className={`eng-status-badge ${statusBadgeClass(e.status)}`}>{e.status}</span>
                  </td>
                  <td className="eng-table-action">
                    {/* Navigate to the detail page for this engagement */}
                    <button onClick={() => navigate(`/engagements/${e.engagement_id}`)} className="eng-btn-view">View →</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* "New Engagement" modal — only rendered when open and user has permission */}
      {showModal && canCreate && (
        <div className="eng-modal-overlay">
          <div className="eng-modal">
            <h3>New Engagement</h3>
            {error && <div className="eng-error">{error}</div>}
            <form onSubmit={handleSave}>
              {/* --- Core engagement fields --- */}
              <label className="eng-label">Client</label>
              <select className="eng-select" required value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })}>
                <option value="">— Select a client —</option>
                {clients.map((c) => <option key={c.client_id} value={c.client_id}>{c.company_name}</option>)}
              </select>

              <label className="eng-label">Engagement Name</label>
              <input className="eng-input" required value={form.engagement_name} onChange={(e) => setForm({ ...form, engagement_name: e.target.value })} placeholder="e.g. Alpha Tech Ltd 2025 Audit" />

              <label className="eng-label">Financial Year</label>
              <input className="eng-input" required value={form.financial_year} onChange={(e) => setForm({ ...form, financial_year: e.target.value })} placeholder="e.g. 2025" />

              <label className="eng-label">Start Date</label>
              <input className="eng-input" type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />

              <label className="eng-label">End Date</label>
              <input className="eng-input" type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />

              {/* --- Workflow team assignment section --- */}
              {/* Each dropdown is optional and scoped to users with the matching role */}
              <div className="eng-team-divider">
                <p>Assign Workflow Team</p>
              </div>

              <label className="eng-label">Accountant (prepares the work)</label>
              <select className="eng-select" value={form.accountant_id} onChange={(e) => setForm({ ...form, accountant_id: e.target.value })}>
                <option value="">— None yet —</option>
                {accountants.map((a) => <option key={a.user_id} value={a.user_id}>{a.full_name}</option>)}
              </select>

              <label className="eng-label">Auditor (fieldwork & testing)</label>
              <select className="eng-select" value={form.auditor_id} onChange={(e) => setForm({ ...form, auditor_id: e.target.value })}>
                <option value="">— None yet —</option>
                {auditors.map((a) => <option key={a.user_id} value={a.user_id}>{a.full_name}</option>)}
              </select>

              <label className="eng-label">Senior Auditor (first-level review)</label>
              <select className="eng-select" value={form.senior_auditor_id} onChange={(e) => setForm({ ...form, senior_auditor_id: e.target.value })}>
                <option value="">— None yet —</option>
                {seniorAuditors.map((a) => <option key={a.user_id} value={a.user_id}>{a.full_name}</option>)}
              </select>

              <label className="eng-label">Assistant Manager (complex review)</label>
              <select className="eng-select" value={form.assistant_manager_id} onChange={(e) => setForm({ ...form, assistant_manager_id: e.target.value })}>
                <option value="">— None yet —</option>
                {assistantManagers.map((a) => <option key={a.user_id} value={a.user_id}>{a.full_name}</option>)}
              </select>

              <label className="eng-label">Audit Manager (in-depth review)</label>
              <select className="eng-select" value={form.audit_manager_id} onChange={(e) => setForm({ ...form, audit_manager_id: e.target.value })}>
                <option value="">— None yet —</option>
                {auditManagers.map((a) => <option key={a.user_id} value={a.user_id}>{a.full_name}</option>)}
              </select>

              <label className="eng-label">Engagement Partner (final sign-off)</label>
              <select className="eng-select" value={form.engagement_partner_id} onChange={(e) => setForm({ ...form, engagement_partner_id: e.target.value })}>
                <option value="">— None yet —</option>
                {engagementPartners.map((a) => <option key={a.user_id} value={a.user_id}>{a.full_name}</option>)}
              </select>

              <label className="eng-label">Quality Reviewer (independent check)</label>
              <select className="eng-select" value={form.quality_reviewer_id} onChange={(e) => setForm({ ...form, quality_reviewer_id: e.target.value })}>
                <option value="">— None yet —</option>
                {qualityReviewers.map((a) => <option key={a.user_id} value={a.user_id}>{a.full_name}</option>)}
              </select>

              {/* Cancel closes the modal without saving; submit triggers handleSave */}
              <div className="eng-modal-actions">
                <button type="button" onClick={() => setShowModal(false)} className="eng-btn-cancel">Cancel</button>
                <button type="submit" disabled={saving} className="eng-btn-submit">{saving ? "Creating..." : "Create Engagement"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}