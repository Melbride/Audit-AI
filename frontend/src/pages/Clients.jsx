import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getClients, createClient, updateClient, deleteClient } from "../services/api";
import "../styles/Clients.css";

// Clients page: lists all client records and (for authorized roles)
// supports creating, editing, and deleting clients via a shared modal form.
export default function Clients({ user }) {
  const navigate = useNavigate();
  const [clients, setClients]         = useState([]); // client list shown in the table
  const [loading, setLoading]         = useState(true); // true while clients are being fetched
  const [showModal, setShowModal]     = useState(false); // controls visibility of the add/edit modal
  const [editingClient, setEditingClient] = useState(null); // the client being edited, or null when creating

  // Form fields for both create and edit flows (same modal/form is reused for both)
  const [form, setForm] = useState({
    company_name: "", contact_person: "", email: "",
    phone: "", industry: "", address: "", status: "Active",
  });
  const [saving, setSaving] = useState(false); // true while a save (create/update) request is in flight

  // Load the client list once on mount
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const c = await getClients();
        setClients(Array.isArray(c.data) ? c.data : []);
      } catch (err) {
        console.error("Failed to load clients", err);
      }
      setLoading(false);
    };
    load();
  }, []);

  // Only Admins and Senior Auditors can create/edit/delete clients
  const isAdmin  = user.role === "Admin";
  const isSenior = user.role === "Senior Auditor";
  const canEdit  = isAdmin || isSenior;

  // Opens the modal in "create" mode with a blank form
  const openCreate = () => {
    setEditingClient(null);
    setForm({ company_name: "", contact_person: "", email: "", phone: "", industry: "", address: "", status: "Active" });
    setShowModal(true);
  };

  // Opens the modal in "edit" mode, pre-filling the form with the
  // selected client's existing values (falling back to "" for any missing field)
  const openEdit = (c) => {
    setEditingClient(c);
    setForm({
      company_name:   c.company_name   || "",
      contact_person: c.contact_person || "",
      email:          c.email          || "",
      phone:          c.phone          || "",
      industry:       c.industry       || "",
      address:        c.address        || "",
      status:         c.status         || "Active",
    });
    setShowModal(true);
  };

  // Handles form submission for both create and edit modes.
  const handleSave = async (e) => {
    e && e.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    try {
      if (editingClient) {
        const res = await updateClient(editingClient.client_id, form);
        if (res.data?.detail) throw new Error(res.data.detail);
      } else {
        const res = await createClient(form);
        if (res.data?.detail) throw new Error(res.data.detail);
      }
      setShowModal(false);
      const c = await getClients();
      setClients(Array.isArray(c.data) ? c.data : []);
    } catch (err) {
      console.error(err);
      alert(err.message || "Could not save client");
    }
    setSaving(false);
  };

  // Deletes a client after a confirmation prompt, then refreshes the list
  const handleDelete = async (c) => {
    if (!canEdit) return;
    if (!window.confirm(`Delete client "${c.company_name}"? This cannot be undone.`)) return;
    try {
      await deleteClient(c.client_id);
      const list = await getClients();
      setClients(Array.isArray(list.data) ? list.data : []);
    } catch (err) {
      console.error(err);
      alert(err.message || "Could not delete client");
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="cl-header">
        <div>
          <h1 className="cl-title">Clients</h1>
          <p className="cl-subtitle">Manage client records and view metadata.</p>
        </div>
        {canEdit && (
          <button className="cl-add-btn" onClick={openCreate}>Add Client</button>
        )}
      </div>

      {/* Table: loading state, empty state, or populated client list */}
      <div className="cl-table-wrap">
        {loading ? (
          <p className="cl-loading">Loading clients...</p>
        ) : clients.length === 0 ? (
          <p className="cl-empty">No clients yet.</p>
        ) : (
          <table className="cl-table">
            <thead>
              <tr>
                {["Company", "Contact", "Email", "Phone", "Status", ""].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.client_id}>
                  <td className="cl-td-name">{c.company_name}</td>
                  <td>{c.contact_person || "—"}</td>
                  <td>{c.email || "—"}</td>
                  <td>{c.phone || "—"}</td>
                  {/* Status cell styled green/active vs. grey/inactive */}
                  <td className={c.status === "Active" ? "cl-td-status--active" : "cl-td-status--inactive"}>
                    {c.status || "Unknown"}
                  </td>
                  <td>
                    {/* Edit/Delete actions only visible to authorized roles */}
                    {canEdit && (
                      <>
                        <button className="cl-btn-edit" onClick={() => openEdit(c)}>Edit</button>
                        <button className="cl-btn-delete" onClick={() => handleDelete(c)}>Delete</button>
                      </>
                    )}
                    <button className="cl-btn-view" onClick={() => navigate(`/clients/${c.client_id}`)}>View</button> 
                    
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add/Edit modal — shared form for both create and edit flows */}
      {showModal && canEdit && (
        <div className="cl-modal-overlay">
          <div className="cl-modal">
            {/* Title switches based on whether we're editing an existing client */}
            <h3 className="cl-modal-title">{editingClient ? "Edit Client" : "Add Client"}</h3>
            <form onSubmit={handleSave}>

              <label className="cl-form-label">Company</label>
              <input required className="cl-form-input" value={form.company_name}
                onChange={(e) => setForm({ ...form, company_name: e.target.value })} />

              <label className="cl-form-label">Contact Person</label>
              <input className="cl-form-input" value={form.contact_person}
                onChange={(e) => setForm({ ...form, contact_person: e.target.value })} />

              <label className="cl-form-label">Email</label>
              <input type="email" className="cl-form-input" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })} />

              <label className="cl-form-label">Phone</label>
              <input className="cl-form-input" value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })} />

              <label className="cl-form-label">Industry</label>
              <input className="cl-form-input" value={form.industry}
                onChange={(e) => setForm({ ...form, industry: e.target.value })} />

              <label className="cl-form-label">Address</label>
              <input className="cl-form-input" value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })} />

              <label className="cl-form-label">Status</label>
              <select className="cl-form-select" value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>

              <div className="cl-modal-actions">
                <button type="button" className="cl-btn-cancel" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="cl-btn-save" disabled={saving}>
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}