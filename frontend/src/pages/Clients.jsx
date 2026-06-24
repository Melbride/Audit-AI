import { useState, useEffect } from "react";
import API from "../api";
 // Clients.jsx _ shows a table of clients. This page is rendered
 // inside the shared 'Layout' so the navigation stays visible.

 //Centalized color palette used throughout this page so styling
 // stays consistent and easy to tweak in one place.
const colors = {
  primary:    "#1E3A5F",
  secondary:  "#2E86C1",
  accent:     "#3498DB",
  background: "#F4F6F9",
  white:      "#FFFFFF",
  text:       "#2C3E50",
};

export default function Clients({ user }) {
    // 'clients' holds the list of client records fetched from the API.
    const [clients, setClients] = useState([]);
    // 'loading' tracks whetheer the initial fetch is still in progress,
    // so we can also show a loading message instead of an empty table.
    const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [form, setForm] = useState({ company_name: "", contact_person: "", email: "", phone: "", industry: "", address: "", status: "Active" });
  const [saving, setSaving] = useState(false);

    // Fetch the client list once when the component first mounts.
    useEffect(() => {
      const load = async () => {
        setLoading(true);
        try {
          const c = await API.getClients();
          setClients(Array.isArray(c) ? c : []);
        } catch (err) {
          console.error("Failed to load clients", err);
        }
        setLoading(false);
      };
      load();
    }, []);

    const isAdmin = user.role === "Admin";
    const isSenior = user.role === "Senior Auditor";

    const openCreate = () => { setEditingClient(null); setForm({ company_name: "", contact_person: "", email: "", phone: "", industry: "", address: "", status: "Active" }); setShowModal(true); };
    const openEdit = (c) => { setEditingClient(c); setForm({ company_name: c.company_name||"", contact_person: c.contact_person||"", email: c.email||"", phone: c.phone||"", industry: c.industry||"", address: c.address||"", status: c.status||"Active" }); setShowModal(true); };

    const handleSave = async (e) => {
      e && e.preventDefault();
      if (!isAdmin && !isSenior) return;
      setSaving(true);
      try {
        if (editingClient) {
          const res = await API.updateClient(editingClient.client_id, form);
          if (res.detail) throw new Error(res.detail);
        } else {
          const res = await API.createClient(form);
          if (res.detail) throw new Error(res.detail);
        }
        setShowModal(false);
        const c = await API.getClients();
        setClients(Array.isArray(c) ? c : []);
      } catch (err) {
        console.error(err);
        alert(err.message || 'Could not save client');
      }
      setSaving(false);
    };

    const handleDelete = async (c) => {
      if (!isAdmin && !isSenior) return;
      if (!window.confirm(`Delete client "${c.company_name}"? This cannot be undone.`)) return;
      try {
        const res = await API.deleteClient(c.client_id);
        const list = await API.getClients();
        setClients(Array.isArray(list) ? list : []);
        if (res && res.message) {
          // optionally show success
        }
      } catch (err) {
        console.error(err);
        alert(err.message || 'Could not delete client');
      }
    };

    return (
        <div>
            {/* Page header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px" }}>
              <div>
                <h1 style={{ fontSize: "20px", fontWeight: "700", color: colors.text }}>Clients</h1>
                <p style={{ color: "#7f8c8d" }}>Manage client records and view metadata.</p>
              </div>
              <div style={{ display: "flex", gap: "10px" }}>
                {(isAdmin || isSenior) && (
                  <button onClick={openCreate} style={{ padding: "10px 20px", background: colors.secondary, color: colors.white, border: "none", borderRadius: "8px", fontSize: "14px", fontWeight: "600", cursor: "pointer" }}>+ Add Client</button>
                )}
              </div>
            </div>

                {/* Card container wrapping the table / loading / empty states */}
                <div style={{ background: colors.white, borderRadius: "12px", boxshadow: "o 2px 8px rgba(0,0,0,0.06)", overflow: "hidden" }}>
                  {loading ?  (
                    <p style={{ padding: "24px", color: "#7f8c8d" }}>Loading clients...</p>
                  ) : clients.length === 0 ? (
          <p style={{ padding: "24px", color: "#7f8c8d" }}>No clients yet.</p>
        ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                    <tr style={{ background: "#FAFBFC", borderBottom: "1px solid #eee"}}>
  {/* Column headers generated from a static list to keep markup DRY */}
                {['Company', 'Contact', 'Email', 'Phone', 'Status'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '14px 20px', fontSize: '12px', fontWeight: '600', color: '#7f8c8d', textTransform: 'uppercase' }}>{h}</th>
                ))}
                </tr>
                </thead>
                <tbody>
                     {/* One row per client; fall back to an em dash for missing fields */}
              {clients.map(c => (
                <tr key={c.client_id} style={{ borderBottom: '1px solid #f5f5f5' }}>
                  <td style={{ padding: '14px 20px', fontSize: '14px', color: colors.text, fontWeight: '500' }}>{c.company_name}</td>
                  <td style={{ padding: '14px 20px', fontSize: '14px', color: '#7f8c8d' }}>{c.contact_person || '—'}</td>
                  <td style={{ padding: '14px 20px', fontSize: '14px', color: '#7f8c8d' }}>{c.email || '—'}</td>
                  <td style={{ padding: '14px 20px', fontSize: '14px', color: '#7f8c8d' }}>{c.phone || '—'}</td>
                  {/* Status text is highlighted in the primary color when "Active", greyed out otherwise */}
                  <td style={{ padding: '14px 20px', fontSize: '14px', color: c.status === 'Active' ? colors.primary : '#bbb', fontWeight: '600' }}>{c.status || 'Unknown'}</td>
                  <td style={{ padding: '14px 20px' }}>
                    {(isAdmin || isSenior) && (
                      <>
                        <button onClick={() => openEdit(c)} style={{ marginRight: "10px", background: "none", border: "none", color: colors.secondary, cursor: "pointer", fontSize: "13px", fontWeight: "600" }}>Edit</button>
                        <button onClick={() => handleDelete(c)} style={{ background: "none", border: "none", color: colors.danger, cursor: "pointer", fontSize: "13px", fontWeight: "600" }}>Delete</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              </tbody>
              </table>
        )}
        </div>
        {showModal && (isAdmin || isSenior) && (
          <div style={{
            position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
          }}>
            <div style={{ background: colors.white, borderRadius: "12px", padding: "24px", width: "520px", maxHeight: "90vh", overflowY: "auto" }}>
              <h3 style={{ fontSize: "18px", fontWeight: "700", color: colors.text, marginBottom: "12px" }}>{editingClient ? "Edit Client" : "Add Client"}</h3>
              <form onSubmit={handleSave}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: colors.text, marginBottom: '6px' }}>Company</label>
                <input required value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} style={{ width: '100%', padding: '10px', marginBottom: '12px', borderRadius: '8px', border: '1px solid #dce1e7' }} />

                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: colors.text, marginBottom: '6px' }}>Contact Person</label>
                <input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} style={{ width: '100%', padding: '10px', marginBottom: '12px', borderRadius: '8px', border: '1px solid #dce1e7' }} />

                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: colors.text, marginBottom: '6px' }}>Email</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={{ width: '100%', padding: '10px', marginBottom: '12px', borderRadius: '8px', border: '1px solid #dce1e7' }} />

                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: colors.text, marginBottom: '6px' }}>Phone</label>
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={{ width: '100%', padding: '10px', marginBottom: '12px', borderRadius: '8px', border: '1px solid #dce1e7' }} />

                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: colors.text, marginBottom: '6px' }}>Industry</label>
                <input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} style={{ width: '100%', padding: '10px', marginBottom: '12px', borderRadius: '8px', border: '1px solid #dce1e7' }} />

                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: colors.text, marginBottom: '6px' }}>Address</label>
                <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} style={{ width: '100%', padding: '10px', marginBottom: '12px', borderRadius: '8px', border: '1px solid #dce1e7' }} />

                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: colors.text, marginBottom: '6px' }}>Status</label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} style={{ width: '100%', padding: '10px', marginBottom: '12px', borderRadius: '8px', border: '1px solid #dce1e7' }}>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>

                <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                  <button type="button" onClick={() => setShowModal(false)} style={{ flex: 1, padding: '11px', background: '#F4F6F9', color: colors.text, border: '1px solid #dce1e7', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>Cancel</button>
                  <button type="submit" disabled={saving} style={{ flex: 1, padding: '11px', background: colors.primary, color: colors.white, border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>{saving ? 'Saving...' : 'Save'}</button>
                </div>
              </form>
            </div>
          </div>
        )}
        </div>
    );
}

