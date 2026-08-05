import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import '../styles/ClientDetailsPage.css'

const API_BASE = 'http://localhost:8000'

function ClientDetailsPage() {
    const { clientId } = useParams()
    const navigate = useNavigate()

    const [client, setClient] = useState(null)
    const [files, setFiles] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [search, setSearch] = useState('')

    useEffect(() => {
        const loadData = async () => {
            setLoading(true)
            setError(null)
            try {
                // Load client info and all uploads in parallel
                const [clientRes, uploadsRes] = await Promise.all([
                    axios.get(`${API_BASE}/clients/${clientId}`),
                    axios.get(`${API_BASE}/uploads/${clientId}`)
                ])
                setClient(clientRes.data)
                setFiles(uploadsRes.data.uploads || [])
            } catch (err) {
                setError('Could not load client details.')
            } finally {
                setLoading(false)
            }
        }
        loadData()
    }, [clientId])

    const PREVIEW_LIMIT = 200

    if (loading) return <div className="page"><p>Loading client details...</p></div>
    if (error) return <div className="page"><p className="error">{error}</p></div>
    if (!client) return null

    return (
        <div className="page">
            <button className="btn-back" onClick={() => navigate('/clients')}>← Back to Clients</button>

            {/* Client profile card */}
            <div className="card">
                <div className="client-header">
                    <h2 className="title">{client.company_name}</h2>
                    <span className={`status-pill ${client.status?.toLowerCase()}`}>{client.status}</span>
                </div>
                <div className="client-info-grid">
                    <div><span className="info-label">Contact:</span> {client.contact_person || '—'}</div>
                    <div><span className="info-label">Email:</span> {client.email || '—'}</div>
                    <div><span className="info-label">Phone:</span> {client.phone || '—'}</div>
                    <div><span className="info-label">Industry:</span> {client.industry || '—'}</div>
                    <div><span className="info-label">Address:</span> {client.address || '—'}</div>
                    <div><span className="info-label">KRA PIN:</span> {client.kra_pin ? 'Yes' : 'No'}</div>
                </div>
            </div>

            {/* Files table */}
            <div className="card">
                <div className="files-card-header">
                    <h2 className="title">Uploaded Files</h2>
                    <div className="files-filter-bar">
                        <input
                            className="files-search"
                            type="text"
                            placeholder="Search by filename or file type…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                </div>
                {files.length === 0 ? (
                    <p className="mapping-note">No files uploaded yet for this client.</p>
                ) : (() => {
                    const q = search.toLowerCase()
                    const filtered = files.filter(f =>
                        (!q || (f.filename || '').toLowerCase().includes(q) || (f.file_type || '').toLowerCase().includes(q))
                    )
                    return (
                    <div className="table-wrapper">
                        {filtered.length === 0 && (
                            <p className="mapping-note">No files match your search.</p>
                        )}
                        {filtered.length > 0 && (
                        <table>
                            <thead>
                                <tr>
                                    <th>Filename</th>
                                    <th>File Type</th>
                                    <th>Rows</th>
                                    <th>Uploaded</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((file) => (
                                    <tr key={file.file_id}>
                                        <td className="cl-td-name">{file.filename || file.file_id}</td>
                                        <td>{file.file_type}</td>
                                        <td>{file.row_count || '—'}</td>
                                        <td>{file.upload_time ? new Date(file.upload_time).toLocaleDateString() : '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        )}
                    </div>
                    )
                })()}
            </div>
        </div>
    )
}

export default ClientDetailsPage
