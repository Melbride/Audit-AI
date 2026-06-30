import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { getFiles, getClients, getClientFiles } from "../services/api";
import "../styles/AllFiles.css";

export default function AllFiles({ user }) {
  const navigate = useNavigate();

  const [files, setFiles]                   = useState([]);
  const [clients, setClients]               = useState([]);
  const [selectedClient, setSelectedClient] = useState("");
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState(null);
  const [dropdownOpen, setDropdownOpen]     = useState(false);
  const dropdownRef                         = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Load clients once on mount
  useEffect(() => {
    getClients()
      .then((res) => setClients(Array.isArray(res.data) ? res.data : []))
      .catch((err) => console.error("Failed to load clients", err));
  }, []);

  // Load files whenever selected client changes
  useEffect(() => {
    setLoading(true);
    setError(null);
    const request = selectedClient ? getClientFiles(selectedClient) : getFiles();
    request
      .then((res) => setFiles(Array.isArray(res.data) ? res.data : []))
      .catch((err) => {
        console.error("Failed to load files", err);
        setError("Failed to load files. Please try again.");
      })
      .finally(() => setLoading(false));
  }, [selectedClient]);

  const selectedClientName = selectedClient
    ? clients.find((c) => String(c.client_id) === String(selectedClient))?.company_name || "Selected Client"
    : null;

  // For per-client view, /clients/{id}/files has no company_name — look it up
  const resolveClientName = (file) => {
    if (file.company_name) return file.company_name;
    const match = clients.find((c) => String(c.client_id) === String(file.client_id));
    return match?.company_name || file.client_id || "—";
  };

  const badgeClass = (status) => {
    if (status === "clean")   return "af-badge af-badge--clean";
    if (status === "flagged") return "af-badge af-badge--flagged";
    return "af-badge af-badge--default";
  };

  const dropdownOptions = [{ client_id: "", company_name: "All Clients" }, ...clients];

  return (
    <div className="af-page">

      {/* Breadcrumb + title */}
      <div className="af-breadcrumb">
        <span className="af-breadcrumb-link" onClick={() => navigate("/dashboard")}>Dashboard</span>
        <span className="af-breadcrumb-sep">/</span>
        <span className="af-breadcrumb-current">
          {selectedClientName ? `${selectedClientName} Files` : "All Uploaded Files"}
        </span>
      </div>

      <div className="af-header">
        <div>
          <h1 className="af-title">
            {selectedClientName ? `${selectedClientName} Files` : "All Uploaded Files"}
          </h1>
          <p className="af-subtitle">
            {loading ? "Loading…" : `${files.length} file${files.length !== 1 ? "s" : ""} found`}
          </p>
        </div>
      </div>

      {/* Custom dropdown filter */}
      <div className="af-filter-row">
        <span className="af-filter-label">Filter by client:</span>
        <div className="af-dropdown" ref={dropdownRef}>
          <button
            className="af-dropdown-toggle"
            onClick={() => setDropdownOpen((o) => !o)}
          >
            <span>{selectedClientName || "All Clients"}</span>
            <span className="af-dropdown-arrow">{dropdownOpen ? "▲" : "▼"}</span>
          </button>
          {dropdownOpen && (
            <ul className="af-dropdown-menu">
              {dropdownOptions.map((c) => (
                <li
                  key={c.client_id}
                  className={`af-dropdown-item${String(selectedClient) === String(c.client_id) ? " af-dropdown-item--active" : ""}`}
                  onClick={() => {
                    setSelectedClient(c.client_id);
                    setDropdownOpen(false);
                  }}
                >
                  {c.company_name}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Error */}
      {error && <div className="af-error">{error}</div>}

      {/* Loading / empty / table */}
      {loading ? (
        <div className="af-empty">Loading files…</div>
      ) : files.length === 0 ? (
        <div className="af-empty">
          No files found{selectedClientName ? ` for ${selectedClientName}` : ""}.
        </div>
      ) : (
        <div className="af-table-wrap">
          <table className="af-table">
            <thead>
              <tr>
                <th>File Name</th>
                <th>Type</th>
                <th>Client</th>
                <th>Uploaded At</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {files.map((file, i) => (
                <tr key={file.upload_id ?? i}>
                  <td className="af-td-filename" title={file.file_name}>
                    {file.filename || "—"}
                  </td>
                  <td className="af-td-muted af-td-type">
                    {file.file_type || "—"}
                  </td>
                  <td className="af-td-muted">{resolveClientName(file)}</td>
                  <td className="af-td-muted">
                    {file.upload_date ? new Date(file.upload_date).toLocaleString() : "—"}
                  </td>
                  <td>
                    <span className={badgeClass(file.status)}>
                      {file.status || "uploaded"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}