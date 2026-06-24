import { useState, useEffect } from "react";
import API from "../api";


// Users.jsx — Audit AI User Management Page
//
// What this page does:
// - Shows a table of ALL users (Admin, Senior Auditor, Auditor, Accountant)
// - Lets you CREATE a new user (popup form) — ADMIN ONLY
// - Lets you EDIT an existing user (popup form, pre-filled) — ADMIN ONLY
// - Lets you DELETE a user — ADMIN ONLY
// - Lets you ASSIGN a user to a client (dropdown inside the form)


// Color theme — same colors used across the whole app
const colors = {
  primary:    "#1E3A5F",  // dark navy - navbar, buttons
  secondary:  "#2E86C1",  // medium blue - edit links
  accent:     "#3498DB",  // bright blue - logo
  background: "#F4F6F9",  // light grey - page background
  white:      "#FFFFFF",  // cards, modal
  text:       "#2C3E50",  // dark grey - body text
  success:    "#27AE60",  // green - active status, auditor badge
  warning:    "#F39C12",  // orange - accountant badge
  danger:     "#E74C3C",  // red - delete button, admin badge
};

// The 8 roles available in the system
const ROLES = [
  "Admin",
  "Accountant",
  "Auditor",
  "Senior Auditor",
  "Assistant Manager",
  "Audit Manager",
  "Engagement Partner",
  "Quality Reviewer",
];

export default function Users({ user, onNavigate }) {

  //  STATE 
  const [users, setUsers] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
    phone: "",
    role: "Auditor",
    assigned_client_id: "",
    status: "Active",
  });

  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  //  PERMISSION CHECK 
  // Only Admin role can create, edit, or delete users
  const isAdmin = user.role === "Admin";

  // LOAD DATA FROM BACKEND 
  const loadData = async () => {
    setLoading(true);
    try {
      const [u, c] = await Promise.all([API.getUsers(), API.getClients()]);
      setUsers(Array.isArray(u) ? u : []);
      setClients(Array.isArray(c) ? c : []);
    } catch (err) {
      console.error("Failed to load users", err);
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  //  OPEN MODAL: CREATE NEW USER 
  const openCreateModal = () => {
    if (!isAdmin) return; // safety check — non-admins cannot open this
    setEditingUser(null);
    setForm({ full_name: "", email: "", password: "", phone: "", role: "Auditor", assigned_client_id: "", status: "Active" });
    setError("");
    setShowModal(true);
  };

  //  OPEN MODAL: EDIT EXISTING USER 
  const openEditModal = (u) => {
    if (!isAdmin) return; // safety check — non-admins cannot open this
    setEditingUser(u);
    setForm({
      full_name: u.full_name || "",
      email: u.email || "",
      password: "",
      phone: u.phone || "",
      role: u.role || "Auditor",
      assigned_client_id: u.assigned_client_id || "",
      status: u.status || "Active",
    });
    setError("");
    setShowModal(true);
  };

  // SAVE USER (CREATE OR UPDATE) 
  const handleSave = async (e) => {
    e.preventDefault();
    if (!isAdmin) return; // safety check
    setSaving(true);
    setError("");
    try {
      if (editingUser) {
        const payload = { ...form };
        delete payload.password;
        payload.assigned_client_id = form.assigned_client_id ? Number(form.assigned_client_id) : null;

        const res = await API.updateUser(editingUser.user_id, payload);
        if (res.detail) { setError(res.detail); setSaving(false); return; }
      } else {
        const payload = { ...form };
        payload.assigned_client_id = form.assigned_client_id ? Number(form.assigned_client_id) : null;

        const res = await API.createUser(payload);
        if (res.detail) { setError(res.detail); setSaving(false); return; }
      }
      setShowModal(false);
      loadData();
    } catch (err) {
      setError("Could not save user. Check your connection.");
    }
    setSaving(false);
  };

  // DELETE USER 
  const handleDelete = async (u) => {
    if (!isAdmin) return; // safety check
    if (!window.confirm(`Delete user "${u.full_name}"? This cannot be undone.`)) return;
    await API.deleteUser(u.user_id);
    loadData();
  };

  // ROLE BADGE COLORS 
 const roleBadge = (role) => {
    const map = {
      "Admin":               { bg: "#FDEDEC", color: colors.danger },
      "Accountant":          { bg: "#FEF9E7", color: colors.warning },
      "Auditor":             { bg: "#EAF5EA", color: colors.success },
      "Senior Auditor":      { bg: "#EBF5FB", color: colors.secondary },
      "Assistant Manager":   { bg: "#F0E6FF", color: "#7D3C98" },
      "Audit Manager":       { bg: "#E8F8F5", color: "#1A5276" },
      "Engagement Partner":  { bg: "#FEF5E7", color: "#B7770D" },
      "Quality Reviewer":    { bg: "#EAFAF1", color: "#1E8449" },
    };
    return map[role] || { bg: "#F4F6F9", color: colors.text };
  };

  // REUSABLE INLINE STYLES 
  const inputStyle = {
    width: "100%",
    padding: "10px 12px",
    border: "1.5px solid #dce1e7",
    borderRadius: "8px",
    fontSize: "14px",
    color: colors.text,
    outline: "none",
    boxSizing: "border-box",
    marginBottom: "16px",
  };

  const labelStyle = {
    display: "block",
    fontSize: "13px",
    fontWeight: "600",
    color: colors.text,
    marginBottom: "6px",
  };

  // RENDER 
  // This page no longer renders its own sidebar. The shared
  // `Layout.jsx` provides the persistent navigation; Users only
  // renders the page content (header, table, and modals).
  const isSenior = user.role === "Senior Auditor";

  const handleAddClient = async () => {
    if (!isSenior) return;
    const name = window.prompt("Enter company name for new client:");
    if (!name) return;
    try {
      const res = await API.createClient({ company_name: name });
      if (res && res.client_id) {
        alert("Client created successfully");
        loadData();
      } else {
        alert(res.detail || "Failed to create client");
      }
    } catch (err) {
      console.error(err);
      alert("Error creating client");
    }
  };

  const headers = ["Name", "Email", "Role", "Assigned Client", "Status"];
  if (isAdmin) headers.push("Actions");

  return (
    <div>

      {/* Page header with title and action buttons */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: "700", color: colors.text, marginBottom: "4px" }}>User Management</h1>
          <p style={{ fontSize: "14px", color: "#7f8c8d" }}>Manage admins, auditors and accountants</p>
        </div>

        <div style={{ display: "flex", gap: "10px" }}>
         

          {isAdmin && (
            <button onClick={openCreateModal} style={{ padding: "10px 20px", background: colors.primary, color: colors.white, border: "none", borderRadius: "8px", fontSize: "14px", fontWeight: "600", cursor: "pointer" }}>+ Add User</button>
          )}
        </div>
      </div>

      {/* ── USERS TABLE ── */}
      <div style={{ background: colors.white, borderRadius: "12px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", overflow: "hidden" }}>

        {loading ? (
          <p style={{ padding: "24px", color: "#7f8c8d" }}>Loading users...</p>
        ) : users.length === 0 ? (
          <p style={{ padding: "24px", color: "#7f8c8d" }}>No users yet.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#FAFBFC", borderBottom: "1px solid #eee" }}>
                {headers.map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "14px 20px", fontSize: "12px", fontWeight: "600", color: "#7f8c8d", textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const badge = roleBadge(u.role);
                return (
                  <tr key={u.user_id} style={{ borderBottom: "1px solid #f5f5f5" }}>
                    <td style={{ padding: "14px 20px", fontSize: "14px", color: colors.text, fontWeight: "500" }}>{u.full_name}</td>
                    <td style={{ padding: "14px 20px", fontSize: "14px", color: "#7f8c8d" }}>{u.email}</td>
                    <td style={{ padding: "14px 20px" }}>
                      <span style={{ background: badge.bg, color: badge.color, padding: "3px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: "600" }}>{u.role}</span>
                    </td>
                    <td style={{ padding: "14px 20px", fontSize: "14px", color: "#7f8c8d" }}>{u.company_name || "—"}</td>
                    <td style={{ padding: "14px 20px" }}>
                      <span style={{ color: u.status === "Active" ? colors.success : colors.danger, fontSize: "13px", fontWeight: "600" }}>{u.status}</span>
                    </td>

                    {isAdmin && (
                      <td style={{ padding: "14px 20px" }}>
                        <>
                          <button onClick={() => openEditModal(u)} style={{ marginRight: "10px", background: "none", border: "none", color: colors.secondary, cursor: "pointer", fontSize: "13px", fontWeight: "600" }}>Edit</button>
                          <button onClick={() => handleDelete(u)} style={{ background: "none", border: "none", color: colors.danger, cursor: "pointer", fontSize: "13px", fontWeight: "600" }}>Delete</button>
                        </>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* CREATE / EDIT MODAL (popup form) only reachable by Admin  */}
      {showModal && isAdmin && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
        }}>
          <div style={{ background: colors.white, borderRadius: "12px", padding: "32px", width: "440px", maxHeight: "90vh", overflowY: "auto" }}>

            <h3 style={{ fontSize: "18px", fontWeight: "700", color: colors.text, marginBottom: "20px" }}>
              {editingUser ? "Edit User" : "Add New User"}
            </h3>

            {error && (
              <div style={{ background: "#fdecea", border: `1px solid ${colors.danger}`, color: colors.danger, padding: "10px 14px", borderRadius: "8px", fontSize: "13px", marginBottom: "16px" }}>
                {error}
              </div>
            )}

            <form onSubmit={handleSave}>
              <label style={labelStyle}>Full Name</label>
              <input style={inputStyle} required value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="e.g. John Kamau" />

              <label style={labelStyle}>Email</label>
              <input style={inputStyle} type="email" required value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="e.g. john@auditai.com" />

              {!editingUser && (
                <>
                  <label style={labelStyle}>Password</label>
                  <input style={inputStyle} type="password" required value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Set a password" />
                </>
              )}

              <label style={labelStyle}>Phone</label>
              <input style={inputStyle} value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="e.g. 0712345678" />

              <label style={labelStyle}>Role</label>
              <select style={inputStyle} value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>

              <label style={labelStyle}>Assigned Client (optional)</label>
              <select style={inputStyle} value={form.assigned_client_id}
                onChange={(e) => setForm({ ...form, assigned_client_id: e.target.value })}>
                <option value="">— None —</option>
                {clients.map((c) => (
                  <option key={c.client_id} value={c.client_id}>{c.company_name}</option>
                ))}
              </select>

              <label style={labelStyle}>Status</label>
              <select style={inputStyle} value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>

              <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
                <button type="button" onClick={() => setShowModal(false)} style={{
                  flex: 1, padding: "11px", background: "#F4F6F9", color: colors.text,
                  border: "1px solid #dce1e7", borderRadius: "8px", cursor: "pointer", fontWeight: "600",
                }}>Cancel</button>
                <button type="submit" disabled={saving} style={{
                  flex: 1, padding: "11px", background: colors.primary, color: colors.white,
                  border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "600",
                }}>{saving ? "Saving..." : "Save"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}