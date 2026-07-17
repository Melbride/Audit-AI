import { useState, useEffect } from "react";
import { getClients, createClient, updateClient, deleteClient } from "../services/api";
import "../styles/Clients.css";

export default function Clients({ user }) {
  const [clients, setClients]             = useState([]);
  const [loading, setLoading]             = useState(true);
  const [showModal, setShowModal]         = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [selectedClient, setSelectedClient] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [form, setForm] = useState({
    company_name: "", contact_person: "", email: "",
    phone: "", industry: "", address: "", status: "Active",
    kra_pin: false, kra_pin_number: "",
  });
  const [saving, setSaving] = useState(false);

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

  const isAdmin  = user.role === "Admin";
  const isSenior = user.role === "Senior Auditor";
  const canEdit  = isAdmin || isSenior;

  const filteredClients = clients.filter((c) => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (
      (c.company_name || "").toLowerCase().includes(q) ||
      (c.contact_person || "").toLowerCase().includes(q) ||
      (c.email || "").toLowerCase().includes(q) ||
      (c.phone || "").toLowerCase().includes(q)
    );
  });

  const openCreate = () => {
    setEditingClient(null);
    setForm({
      company_name: "", contact_person: "", email: "",
      phone: "", industry: "", address: "", status: "Active",
      kra_pin: false, kra_pin_number: "",
    });
    setShowModal(true);
  };

  const openEdit = (c) => {
    setEditingClient(c);
    setSelectedClient(c);
    setForm({
      company_name:   c.company_name   || "",
      contact_person: c.contact_person || "",
      email:          c.email          || "",
      phone:          c.phone          || "",
      industry:       c.industry       || "",
      address:        c.address        || "",
      status:         c.status         || "Active",
      kra_pin:        c.kra_pin        || false,
      kra_pin_number: c.kra_pin_number || "",
    });
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e && e.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        kra_pin_number: form.kra_pin ? form.kra_pin_number : null,
      };
      if (editingClient) {
        const res = await updateClient(editingClient.client_id, payload);
        if (res.data?.detail) throw new Error(res.data.detail);
      } else {
        const res = await createClient(payload);
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

  const handleDelete = async (c) => {
    if (!canEdit) return;
    if (!window.confirm(`Delete client "${c.company_name}"? This cannot be undone.`)) return;
    try {
      await deleteClient(c.client_id);
      const list = await getClients();
      setClients(Array.isArray(list.data) ? list.data : []);
      if (selectedClient?.client_id === c.client_id) {
        setSelectedClient(null);
      }
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

      {/* Table */}
      <div className="cl-table-wrap">
        {loading ? (
          <p className="cl-loading">Loading clients...</p>
        ) : clients.length === 0 ? (
          <p className="cl-empty">No clients yet.</p>
        ) : (
          <div className="cl-client-picker">
            <div className="cl-picker-row">
              <label className="cl-form-label" htmlFor="client-search">
                Search clients
              </label>
              <input
                id="client-search"
                className="cl-form-input"
                placeholder="Search by company, contact, email, or phone"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="cl-picker-row">
              <label className="cl-form-label" htmlFor="client-select">
                Choose a client
              </label>
              <select
                id="client-select"
                className="cl-form-select"
                value={selectedClient?.client_id || ""}
                onChange={(e) => {
                  const client = clients.find((c) => String(c.client_id) === e.target.value);
                  setSelectedClient(client || null);
                }}
              >
                <option value="">Choose a client...</option>
                {filteredClients.map((c) => (
                  <option key={c.client_id} value={c.client_id}>
                    {c.company_name} — {c.contact_person || "No contact"}
                  </option>
                ))}
              </select>
            </div>
            {filteredClients.length === 0 && (
              <p className="cl-empty">No clients match your search.</p>
            )}

            {selectedClient ? (
              <div className="cl-detail-card">
                <div className="cl-detail-row">
                  <span className="cl-detail-label">Company</span>
                  <span>{selectedClient.company_name || "—"}</span>
                </div>
                <div className="cl-detail-row">
                  <span className="cl-detail-label">Contact</span>
                  <span>{selectedClient.contact_person || "—"}</span>
                </div>
                <div className="cl-detail-row">
                  <span className="cl-detail-label">Email</span>
                  <span>{selectedClient.email || "—"}</span>
                </div>
                <div className="cl-detail-row">
                  <span className="cl-detail-label">Phone</span>
                  <span>{selectedClient.phone || "—"}</span>
                </div>
                <div className="cl-detail-row">
                  <span className="cl-detail-label">Industry</span>
                  <span>{selectedClient.industry || "—"}</span>
                </div>
                <div className="cl-detail-row">
                  <span className="cl-detail-label">Address</span>
                  <span>{selectedClient.address || "—"}</span>
                </div>
                <div className="cl-detail-row">
                  <span className="cl-detail-label">Status</span>
                  <span>{selectedClient.status || "Unknown"}</span>
                </div>
                <div className="cl-detail-row">
                  <span className="cl-detail-label">KRA PIN</span>
                  <span>{selectedClient.kra_pin ? selectedClient.kra_pin_number || "Yes" : "No"}</span>
                </div>
                {canEdit && (
                  <div className="cl-detail-actions">
                    <button type="button" className="cl-btn-edit" onClick={() => openEdit(selectedClient)}>
                      Edit
                    </button>
                    <button type="button" className="cl-btn-delete" onClick={() => handleDelete(selectedClient)}>
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ) : (
              filteredClients.length > 0 && (
                <p className="cl-empty">Select a client to view their details.</p>
              )
            )}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && canEdit && (
        <div className="cl-modal-overlay">
          <div className="cl-modal">
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

              {/* KRA PIN checkbox */}
              <div className="cl-kra-row">
                <input
                  type="checkbox"
                  id="kra_pin_check"
                  checked={!!form.kra_pin}
                  onChange={(e) => setForm({
                    ...form,
                    kra_pin: e.target.checked,
                    kra_pin_number: e.target.checked ? form.kra_pin_number : "",
                  })}
                  className="cl-kra-checkbox"
                />
                <label htmlFor="kra_pin_check" className="cl-form-label cl-kra-label">
                  Has KRA PIN
                </label>
              </div>

              {/* PIN number — only shown when checkbox is checked */}
              {form.kra_pin && (
                <>
                  <label className="cl-form-label">KRA PIN Number</label>
                  <input
                    required
                    className="cl-form-input cl-kra-input"
                    placeholder="e.g. A000000000A"
                    value={form.kra_pin_number}
                    onChange={(e) => setForm({ ...form, kra_pin_number: e.target.value.toUpperCase() })}
                  />
                </>
              )}

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