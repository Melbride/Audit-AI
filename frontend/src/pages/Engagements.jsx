// React hooks
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getEngagements, getClients, getUsers, createEngagement, addTeamMember } from "../services/api";
import "../styles/Engagements.css";

// Sections an auditor can choose from when scoping a new engagement
const AVAILABLE_SECTIONS = ["Revenue", "Expenses", "Inventory", "Cash & Bank"];

// Engagements page: lists all audit engagements and allows authorized users
// to create a new engagement along with assigning a workflow review team.
export default function Engagements({ user }) {
  const navigate = useNavigate();

  const [engagements, setEngagements] = useState([]);
  const [clients, setClients]         = useState([]);
  const [users, setUsers]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [showModal, setShowModal]     = useState(false);
  const [error, setError]             = useState("");
  const [saving, setSaving]           = useState(false);
  const [selectedEngagement, setSelectedEngagement] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  const [form, setForm] = useState({
    client_id: "", engagement_name: "", financial_year: "", status: "Planning",
    start_date: "", end_date: "", sections: [], accountant_id: "", auditor_id: "",
    senior_auditor_id: "", assistant_manager_id: "", audit_manager_id: "",
    engagement_partner_id: "", quality_reviewer_id: "",
  });

  const canCreate = user.role === "Admin" || user.role === "Senior Auditor";

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

  useEffect(() => { loadData(); }, []);

  const accountants        = users.filter((u) => u.role === "Accountant");
  const auditors           = users.filter((u) => u.role === "Auditor");
  const seniorAuditors     = users.filter((u) => u.role === "Senior Auditor");
  const assistantManagers  = users.filter((u) => u.role === "Assistant Manager");
  const auditManagers      = users.filter((u) => u.role === "Audit Manager");
  const engagementPartners = users.filter((u) => u.role === "Engagement Partner");
  const qualityReviewers   = users.filter((u) => u.role === "Quality Reviewer");

  const filteredEngagements = engagements.filter((e) => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (
      (e.engagement_name || "").toLowerCase().includes(q) ||
      (e.company_name || "").toLowerCase().includes(q) ||
      (e.financial_year || "").toLowerCase().includes(q) ||
      (e.status || "").toLowerCase().includes(q)
    );
  });

  const openCreateModal = () => {
    if (!canCreate) return;
    setForm({
      client_id: "", engagement_name: "", financial_year: "", status: "Planning",
      start_date: "", end_date: "", sections: [], accountant_id: "", auditor_id: "",
      senior_auditor_id: "", assistant_manager_id: "", audit_manager_id: "",
      engagement_partner_id: "", quality_reviewer_id: "",
    });
    setError("");
    setShowModal(true);
  };

  // Clear end date if it's now before the newly picked start date
  const handleStartDateChange = (value) => {
    setForm((prev) => ({
      ...prev,
      start_date: value,
      end_date: prev.end_date && prev.end_date < value ? "" : prev.end_date,
    }));
  };

  // Toggle a section in/out of the selected scope
  const toggleSection = (section) => {
    setForm((prev) => ({
      ...prev,
      sections: prev.sections.includes(section)
        ? prev.sections.filter((s) => s !== section)
        : [...prev.sections, section],
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!canCreate) return;
    setSaving(true);
    setError("");
    if (form.sections.length === 0) {
      setError("Select at least one audit section.");
      setSaving(false);
      return;
    }
    try {
      const payload = {
        client_id: Number(form.client_id),
        engagement_name: form.engagement_name,
        financial_year: form.financial_year,
        status: form.status,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        sections: form.sections,
      };
      const res = await createEngagement(payload);
      if (res.data?.detail) { setError(res.data.detail); setSaving(false); return; }

      const engagementId = res.data.engagement_id;

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
          await addTeamMember(engagementId, {
            engagement_id: engagementId,
            user_id: Number(member.id),
            role: member.role,
          });
        }
      }

      setShowModal(false);
      loadData();
    } catch (err) {
      setError(err.response?.data?.detail || "Could not create engagement. Check your connection.");
    }
    setSaving(false);
  };

  const statusBadgeClass = (status) => {
    const map = {
      "Planning":     "eng-status-planning",
      "In Progress":  "eng-status-inprogress",
      "Under Review": "eng-status-review",
      "Completed":    "eng-status-completed",
    };
    return map[status] || "eng-status-default";
  };

  return (
    <div>
      <div className="eng-header">
        <div>
          <h1>Engagements</h1>
          <p>Manage audit engagements and search for engagement details.</p>
        </div>
        {canCreate && (
          <button onClick={openCreateModal} className="eng-btn-new">New Engagement</button>
        )}
      </div>

      <div className="eng-table-card">
        {loading ? (
          <p className="eng-loading">Loading engagements...</p>
        ) : engagements.length === 0 ? (
          <p className="eng-empty">No engagements yet. Click "New Engagement" to create one.</p>
        ) : (
          <div className="eng-client-picker">
            <div className="eng-picker-grid">
              <div className="eng-picker-field">
                <label className="eng-label" htmlFor="engagement-search">
                  Search engagements
                </label>
                <input
                  id="engagement-search"
                  className="eng-input"
                  placeholder="Search by name, client, year, or status"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="eng-picker-field">
                <label className="eng-label" htmlFor="engagement-select">
                  Choose an engagement
                </label>
                <select
                  id="engagement-select"
                  className="eng-select"
                  value={selectedEngagement?.engagement_id || ""}
                  onChange={(e) => {
                    const engagement = engagements.find((item) => String(item.engagement_id) === e.target.value);
                    setSelectedEngagement(engagement || null);
                  }}
                >
                  <option value="">Choose an engagement...</option>
                  {filteredEngagements.map((e) => (
                    <option key={e.engagement_id} value={e.engagement_id}>
                      {e.engagement_name} — {e.company_name} ({e.financial_year})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {filteredEngagements.length === 0 && (
              <p className="eng-empty">No engagements match your search.</p>
            )}

            {selectedEngagement && (
              <div className="eng-detail-card">
                <div className="eng-detail-grid">
                  <div className="eng-detail-field">
                    <span className="eng-detail-label">Engagement</span>
                    <span className="eng-detail-value">{selectedEngagement.engagement_name || "—"}</span>
                  </div>
                  <div className="eng-detail-field">
                    <span className="eng-detail-label">Client</span>
                    <span className="eng-detail-value">{selectedEngagement.company_name || "—"}</span>
                  </div>
                  <div className="eng-detail-field">
                    <span className="eng-detail-label">Financial Year</span>
                    <span className="eng-detail-value">{selectedEngagement.financial_year || "—"}</span>
                  </div>
                  <div className="eng-detail-field">
                    <span className="eng-detail-label">Status</span>
                    <span className={`eng-status-pill ${statusBadgeClass(selectedEngagement.display_status || selectedEngagement.status)}`}>
                      {selectedEngagement.display_status || selectedEngagement.status || "Unknown"}
                    </span>
                  </div>
                  <div className="eng-detail-field">
                    <span className="eng-detail-label">Start Date</span>
                    <span className="eng-detail-value">{selectedEngagement.start_date || "—"}</span>
                  </div>
                  <div className="eng-detail-field">
                    <span className="eng-detail-label">End Date</span>
                    <span className="eng-detail-value">{selectedEngagement.end_date || "—"}</span>
                  </div>
                </div>
                <div className="eng-detail-actions">
                  <button
                    type="button"
                    className="eng-btn-view"
                    onClick={() => navigate(`/engagements/${selectedEngagement.engagement_id}`)}
                  >
                    View Details
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {showModal && canCreate && (
        <div className="eng-modal-overlay">
          <div className="eng-modal">
            <h3>New Engagement</h3>
            {error && <div className="eng-error">{error}</div>}
            <form onSubmit={handleSave}>

              <label className="eng-label">Client</label>
              <select className="eng-select" required value={form.client_id}
                onChange={(e) => setForm({ ...form, client_id: e.target.value })}>
                <option value="">— Select a client —</option>
                {clients.map((c) => <option key={c.client_id} value={c.client_id}>{c.company_name}</option>)}
              </select>

              <label className="eng-label">Engagement Name</label>
              <input className="eng-input" required value={form.engagement_name}
                onChange={(e) => setForm({ ...form, engagement_name: e.target.value })}
                placeholder="e.g. Alpha Tech Ltd 2025 Audit" />

              <label className="eng-label">Financial Year</label>
              <input className="eng-input" required value={form.financial_year}
                onChange={(e) => setForm({ ...form, financial_year: e.target.value })}
                placeholder="e.g. 2025" />

              <label className="eng-label">Audit Sections</label>
              {AVAILABLE_SECTIONS.map((section) => (
                <label key={section} style={{ display: "block", fontWeight: 400 }}>
                  <input
                    type="checkbox"
                    checked={form.sections.includes(section)}
                    onChange={() => toggleSection(section)}
                  />
                  {" "}{section}
                </label>
              ))}

              <label className="eng-label">Start Date</label>
              <input
                className="eng-input"
                type="date"
                value={form.start_date}
                onChange={(e) => handleStartDateChange(e.target.value)}
              />

              <label className="eng-label">End Date</label>
              <input
                className="eng-input"
                type="date"
                value={form.end_date}
                min={form.start_date || undefined}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                disabled={!form.start_date}
                title={!form.start_date ? "Please select a start date first" : ""}
              />
              {!form.start_date && (
                <p style={{ fontSize: "12px", color: "#95A5A6", margin: "-8px 0 8px" }}>
                  Select a start date first to enable the end date.
                </p>
              )}

              <div className="eng-team-divider">
                <p>Assign Workflow Team</p>
              </div>

              <label className="eng-label">Accountant (prepares the work)</label>
              <select className="eng-select" value={form.accountant_id}
                onChange={(e) => setForm({ ...form, accountant_id: e.target.value })}>
                <option value="">— None yet —</option>
                {accountants.map((a) => <option key={a.user_id} value={a.user_id}>{a.full_name}</option>)}
              </select>

              <label className="eng-label">Auditor (fieldwork & testing)</label>
              <select className="eng-select" value={form.auditor_id}
                onChange={(e) => setForm({ ...form, auditor_id: e.target.value })}>
                <option value="">— None yet —</option>
                {auditors.map((a) => <option key={a.user_id} value={a.user_id}>{a.full_name}</option>)}
              </select>

              <label className="eng-label">Senior Auditor (first-level review)</label>
              <select className="eng-select" value={form.senior_auditor_id}
                onChange={(e) => setForm({ ...form, senior_auditor_id: e.target.value })}>
                <option value="">— None yet —</option>
                {seniorAuditors.map((a) => <option key={a.user_id} value={a.user_id}>{a.full_name}</option>)}
              </select>

              <label className="eng-label">Assistant Manager (complex review)</label>
              <select className="eng-select" value={form.assistant_manager_id}
                onChange={(e) => setForm({ ...form, assistant_manager_id: e.target.value })}>
                <option value="">— None yet —</option>
                {assistantManagers.map((a) => <option key={a.user_id} value={a.user_id}>{a.full_name}</option>)}
              </select>

              <label className="eng-label">Audit Manager (in-depth review)</label>
              <select className="eng-select" value={form.audit_manager_id}
                onChange={(e) => setForm({ ...form, audit_manager_id: e.target.value })}>
                <option value="">— None yet —</option>
                {auditManagers.map((a) => <option key={a.user_id} value={a.user_id}>{a.full_name}</option>)}
              </select>

              <label className="eng-label">Engagement Partner (final sign-off)</label>
              <select className="eng-select" value={form.engagement_partner_id}
                onChange={(e) => setForm({ ...form, engagement_partner_id: e.target.value })}>
                <option value="">— None yet —</option>
                {engagementPartners.map((a) => <option key={a.user_id} value={a.user_id}>{a.full_name}</option>)}
              </select>

              <label className="eng-label">Quality Reviewer (independent check)</label>
              <select className="eng-select" value={form.quality_reviewer_id}
                onChange={(e) => setForm({ ...form, quality_reviewer_id: e.target.value })}>
                <option value="">— None yet —</option>
                {qualityReviewers.map((a) => <option key={a.user_id} value={a.user_id}>{a.full_name}</option>)}
              </select>

              <div className="eng-modal-actions">
                <button type="button" onClick={() => setShowModal(false)} className="eng-btn-cancel">Cancel</button>
                <button type="submit" disabled={saving} className="eng-btn-submit">
                  {saving ? "Creating..." : "Create Engagement"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}