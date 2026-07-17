import { useState, useEffect } from "react";
import {
  getUsers,
  getClients,
  createUser,
  updateUser,
  deleteUser,
  createClient,
} from "../services/api";
import "../styles/Users.css";

// Roles
// Full list of selectable roles for the role dropdown in the user form
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

// Users component
// Admin-facing user management page: lists all users, and allows Admins
// to create/edit/delete users. Senior Auditors get a side capability to
// quickly create a new client via a prompt.
export default function Users({ user }) {
  const [users, setUsers] = useState([]);     // full list of users shown in the table
  const [clients, setClients] = useState([]); // clients available for the "Assigned Client" dropdown
  const [loading, setLoading] = useState(true); // true while initial data is being fetched

  const [showModal, setShowModal] = useState(false); // controls visibility of the add/edit user modal
  const [editingUser, setEditingUser] = useState(null); // the user being edited, or null when creating

  // Form fields for both create and edit flows
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
    phone: "",
    role: "Auditor",
    assigned_client_id: "",
    status: "Active",
  });

  // State
  const [error, setError] = useState("");   // error message shown inside the modal
  const [saving, setSaving] = useState(false); // true while a save request is in flight
  const isAdmin = user.role === "Admin";          // only Admins can create/edit/delete users
  const isSenior = user.role === "Senior Auditor"; // Senior Auditors can quick-create clients

  // Load users and clients once on mount
  useEffect(() => {
    loadData();
  }, []);

  // Fetches users and clients in parallel and populates state
  const loadData = async () => {
    setLoading(true);

    try {
      const [u, c] = await Promise.all([
        getUsers(),
        getClients(),
      ]);

      setUsers(Array.isArray(u.data) ? u.data : []);
      setClients(Array.isArray(c.data) ? c.data : []);
    } catch (err) {
      console.error("Failed to load users", err);
    }

    setLoading(false);
  };

  // Resets the form and opens the modal in "create" mode
  const openCreateModal = () => {
    if (!isAdmin) return;

    setEditingUser(null);

    setForm({
      full_name: "",
      email: "",
      password: "",
      phone: "",
      role: "Auditor",
      assigned_client_id: "",
      status: "Active",
    });

    setError("");
    setShowModal(true);
  };

  // Pre-fills the form with the selected user's data and opens the modal
  // in "edit" mode. Password is intentionally left blank (not editable here).
  const openEditModal = (u) => {
    if (!isAdmin) return;

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

  // Handles form submission for both create and edit modes.
  // Edit: strips the password field (not updatable here) and calls updateUser.
  // Create: includes the password and calls createUser.
  // Both convert assigned_client_id to a number (or null if not selected).
  const handleSave = async (e) => {
    e.preventDefault();

    if (!isAdmin) return;

    setSaving(true);
    setError("");

    try {
      if (editingUser) {
        const payload = { ...form };

        delete payload.password;

        payload.assigned_client_id = form.assigned_client_id
          ? Number(form.assigned_client_id)
          : null;

        const res = await updateUser(
          editingUser.user_id,
          payload
        );

        if (res.data?.detail) {
          setError(res.data.detail);
          setSaving(false);
          return;
        }
      } else {
        const payload = { ...form };

        payload.assigned_client_id = form.assigned_client_id
          ? Number(form.assigned_client_id)
          : null;

        const res = await createUser(payload);

        if (res.data?.detail) {
          setError(res.data.detail);
          setSaving(false);
          return;
        }
      }

      setShowModal(false);
      loadData(); // refresh table with the new/updated user
    } catch (err) {
      setError(
        "Could not save user. Check your connection."
      );
    }

    setSaving(false);
  };

  // Deletes a user after confirmation, then refreshes the list
  const handleDelete = async (u) => {
    if (!isAdmin) return;

    if (
      !window.confirm(
        `Delete user "${u.full_name}"? This cannot be undone.`
      )
    ) {
      return;
    }

    await deleteUser(u.user_id);
    loadData();
  };

  // Quick-create flow for Senior Auditors: prompts for a company name
  // and creates a new client without opening the full client form.
  const handleAddClient = async () => {
    if (!isSenior) return;

    const name = window.prompt(
      "Enter company name for new client:"
    );

    if (!name) return;

    try {
      const res = await createClient({
        company_name: name,
      });

      if (res.data?.client_id) {
        alert("Client created successfully");
        loadData();
      } else {
        alert(
          res.data?.detail ||
            "Failed to create client"
        );
      }
    } catch (err) {
      console.error(err);
      alert("Error creating client");
    }
  };

  // Converts a role name into a CSS-safe class suffix, e.g.
  // "Senior Auditor" -> "role-senior-auditor"
  const getRoleClass = (role) =>
    `role-${role.toLowerCase().replace(/\s+/g, "-")}`;
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("All");

  // Apply search across name, email and company_name
  const matchesQuery = (u) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      (u.full_name || "").toLowerCase().includes(q) ||
      (u.email || "").toLowerCase().includes(q) ||
      (u.company_name || "").toLowerCase().includes(q)
    );
  };

  const visibleUsers = users.filter((u) => {
    return (
      matchesQuery(u) &&
      (roleFilter === "All" || u.role === roleFilter)
    );
  });

  return (
    <div className="users-page">
      {/* Header with page title and "Add User" button (Admin only) */}
      <div className="users-header">
        <div className="users-header-left">
          <h1>User Management</h1>
          <p>Manage admins, auditors and accountants</p>
        </div>

        <div className="users-header-actions">
          {isAdmin && (
            <button
              className="btn btn-primary"
              onClick={openCreateModal}
            >
              Add User
            </button>
          )}
        </div>
      </div>

      {/* Users area with search and role dropdown */}
      <div className="users-card">
        {loading ? (
          <p className="page-message">Loading users...</p>
        ) : (
          <div className="users-list-root">
            <div className="users-search-row">
              <select
                className="form-select role-select"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
              >
                <option value="All">All Roles</option>
                {ROLES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>

              <input
                className="form-input users-search-input"
                placeholder="Search users by name, email or client..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            <div className="role-list">
              {visibleUsers.length === 0 ? (
                <div className="page-message">No users match your query.</div>
              ) : (
                <table className="users-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Assigned Client</th>
                      <th>Status</th>
                      {isAdmin && <th>Actions</th>}
                    </tr>
                  </thead>

                  <tbody>
                    {visibleUsers.map((u) => (
                      <tr key={u.user_id}>
                        <td className="user-name">{u.full_name}</td>
                        <td className="user-email">{u.email}</td>
                        <td>
                          <span className={`role-badge ${getRoleClass(u.role)}`}>{u.role}</span>
                        </td>
                        <td className="user-client">{u.company_name || "—"}</td>
                        <td>
                          <span className={`user-status ${u.status.toLowerCase()}`}>{u.status}</span>
                        </td>

                        {isAdmin && (
                          <td>
                            <button className="btn-link btn-edit" onClick={() => openEditModal(u)}>Edit</button>
                            <button className="btn-link btn-delete" onClick={() => handleDelete(u)}>Delete</button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit user modal — shared form, fields vary slightly between modes */}
      {showModal && isAdmin && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>
              {editingUser
                ? "Edit User"
                : "Add New User"}
            </h3>

            {error && (
              <div className="error-box">
                {error}
              </div>
            )}

            <form onSubmit={handleSave}>
              <label className="form-label">
                Full Name
              </label>

              <input
                className="form-input"
                required
                value={form.full_name}
                placeholder="e.g. John Kamau"
                onChange={(e) =>
                  setForm({
                    ...form,
                    full_name: e.target.value,
                  })
                }
              />

              <label className="form-label">
                Email
              </label>

              <input
                className="form-input"
                type="email"
                required
                value={form.email}
                placeholder="e.g. john@auditai.com"
                onChange={(e) =>
                  setForm({
                    ...form,
                    email: e.target.value,
                  })
                }
              />

              {/* Password field only shown when creating a new user, not when editing */}
              {!editingUser && (
                <>
                  <label className="form-label">
                    Password
                  </label>

                  <input
                    className="form-input"
                    type="password"
                    required
                    value={form.password}
                    placeholder="Set a password"
                    onChange={(e) =>
                      setForm({
                        ...form,
                        password: e.target.value,
                      })
                    }
                  />
                </>
              )}

              <label className="form-label">
                Phone
              </label>

              <input
                className="form-input"
                value={form.phone}
                placeholder="e.g. 0712345678"
                onChange={(e) =>
                  setForm({
                    ...form,
                    phone: e.target.value,
                  })
                }
              />

              <label className="form-label">
                Role
              </label>

              <select
                className="form-select"
                value={form.role}
                onChange={(e) =>
                  setForm({
                    ...form,
                    role: e.target.value,
                  })
                }
              >
                {ROLES.map((role) => (
                  <option
                    key={role}
                    value={role}
                  >
                    {role}
                  </option>
                ))}
              </select>

              <label className="form-label">
                Assigned Client (optional)
              </label>

              <select
                className="form-select"
                value={form.assigned_client_id}
                onChange={(e) =>
                  setForm({
                    ...form,
                    assigned_client_id:
                      e.target.value,
                  })
                }
              >
                <option value="">
                  — None —
                </option>

                {clients.map((client) => (
                  <option
                    key={client.client_id}
                    value={client.client_id}
                  >
                    {client.company_name}
                  </option>
                ))}
              </select>

              <label className="form-label">
                Status
              </label>

              <select
                className="form-select"
                value={form.status}
                onChange={(e) =>
                  setForm({
                    ...form,
                    status: e.target.value,
                  })
                }
              >
                <option value="Active">
                  Active
                </option>

                <option value="Inactive">
                  Inactive
                </option>
              </select>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() =>
                    setShowModal(false)
                  }
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving}
                >
                  {saving
                    ? "Saving..."
                    : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}