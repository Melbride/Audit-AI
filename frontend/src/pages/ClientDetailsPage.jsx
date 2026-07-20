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
    const [viewingFile, setViewingFile] = useState(null)
    const [viewLoading, setViewLoading] = useState(null)
    const [search, setSearch] = useState('')
    const [stageFilter, setStageFilter] = useState('')

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

                const uploads = uploadsRes.data.uploads || []

                // For each upload, fetch its resume state to get stage info
                const enriched = await Promise.all(
                    uploads.map(async (u) => {
                        try {
                            const res = await axios.get(
                                `${API_BASE}/files/${u.file_id}/resume-state?client_id=${clientId}`
                            )
                            return res.data
                        } catch {
                            // If resume-state fails, return a minimal record
                            return {
                                file_id: u.file_id,
                                client_id: clientId,
                                filename: u.filename || u.file_name,
                                file_type: u.file_type,
                                row_count: u.row_count,
                                upload_time: u.upload_time,
                                stage: 'uploaded',
                                has_mapping: false,
                                total_issues: null,
                                can_proceed: false,
                                last_cleaned_at: null,
                            }
                        }
                    })
                )
                setFiles(enriched)
            } catch (err) {
                setError('Could not load client details.')
            } finally {
                setLoading(false)
            }
        }
        loadData()
    }, [clientId])

    const PREVIEW_LIMIT = 200

    // View the cleaned file in a modal using the /view endpoint
    const handleViewFile = async (file) => {
        setViewLoading(file.file_id)
        setViewingFile(null)
        try {
            const res = await axios.get(`${API_BASE}/cleaned-files/${file.file_id}/view`, {
                params: { client_id: clientId, file_type: file.file_type }
            })
            const allRows = res.data.cleaned_data || []
            setViewingFile({ ...file, rows: allRows.slice(0, PREVIEW_LIMIT), totalRows: allRows.length })
        } catch {
            setError('Could not load file data.')
        } finally {
            setViewLoading(null)
        }
    }

    const handleDownloadFile = (file) => {
        const url = `${API_BASE}/cleaned-files/${file.file_id}/download?client_id=${clientId}&file_type=${encodeURIComponent(file.file_type)}`
        window.open(url, '_blank')
    }

    // Navigate to the correct page based on the file's current stage,
    // passing the full uploadResult shape each page expects
    const handleResume = async (file) => {
        const uploadResult = {
            file_id: file.file_id,
            filename: file.filename,
            file_type: file.file_type,
            rows: file.row_count,
            columns: file.columns || [],
            fill_rates: file.fill_rates || {},
            fingerprint: file.fingerprint || '',
        }

        switch (file.stage) {
            case 'uploaded':
                navigate('/mapping', { state: { uploadResult, clientId: String(clientId) } })
                break
            case 'mapped':
                navigate('/clean', { state: { uploadResult, clientId: String(clientId), fileType: file.file_type } })
                break
            case 'cleaning_in_progress': {
                try {
                    const formData = new FormData()
                    formData.append('file_id', file.file_id)
                    formData.append('client_id', String(clientId))
                    formData.append('file_type', file.file_type)
                    const res = await axios.post(`${API_BASE}/clean`, formData)
                    const cleanResult = {
                        file_id: file.file_id,
                        file_type: file.file_type,
                        can_proceed: res.data.can_proceed,
                        cleaned_data: res.data.cleaned_data,
                        validation_report: res.data.validation_report
                    }
                    if (file.has_corrections) {
                        navigate('/corrected-results', { state: { cleanResult, uploadResult, clientId: String(clientId), fileType: file.file_type } })
                    } else {
                        navigate('/clean', { state: { uploadResult, clientId: String(clientId), fileType: file.file_type, cleanResult } })
                    }
                } catch {
                    navigate('/clean', { state: { uploadResult, clientId: String(clientId), fileType: file.file_type } })
                }
                break
            }
            case 'clean':
                navigate('/analysis', { state: {
                    cleanResult: { file_id: file.file_id, file_type: file.file_type, can_proceed: true, cleaned_data: [], validation_report: { issues: [] } },
                    clientId: String(clientId),
                    uploadResult
                }})
                break
            default:
                break
        }
    }

    const stageBadge = (file) => {
        switch (file.stage) {
            case 'uploaded':
                return <span className="stage-badge stage-uploaded">Uploaded</span>
            case 'mapped':
                return <span className="stage-badge stage-mapped">Mapped</span>
            case 'cleaning_in_progress':
                return <span className="stage-badge stage-cleaning">{file.total_issues} issue(s)</span>
            case 'clean':
                return <span className="stage-badge stage-clean">Clean ✓</span>
            default:
                return <span className="stage-badge stage-uploaded">Unknown</span>
        }
    }

    const actionButton = (file) => {
        switch (file.stage) {
            case 'uploaded':
                return <button className="btn-action" onClick={() => handleResume(file)}>Start Mapping</button>
            case 'mapped':
                return <button className="btn-action" onClick={() => handleResume(file)}>Run Cleaning</button>
            case 'cleaning_in_progress':
                return <button className="btn-action btn-action-warn" onClick={() => handleResume(file)}>Resume Cleaning</button>
            case 'clean':
                return <button className="btn-action btn-action-success" onClick={() => handleResume(file)}>Run Analysis</button>
            default:
                return null
        }
    }

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
                        <select
                            className="files-stage-select"
                            value={stageFilter}
                            onChange={e => setStageFilter(e.target.value)}
                        >
                            <option value="">All Stages</option>
                            <option value="uploaded">Uploaded</option>
                            <option value="mapped">Mapped</option>
                            <option value="cleaning_in_progress">In Progress</option>
                            <option value="clean">Clean</option>
                        </select>
                    </div>
                </div>
                {files.length === 0 ? (
                    <p className="mapping-note">No files uploaded yet for this client.</p>
                ) : (() => {
                    const q = search.toLowerCase()
                    const filtered = files.filter(f =>
                        (!q || (f.filename || '').toLowerCase().includes(q) || (f.file_type || '').toLowerCase().includes(q)) &&
                        (!stageFilter || f.stage === stageFilter)
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
                                    <th>Stage</th>
                                    <th>Last Cleaned</th>
                                    <th>Action</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((file) => (
                                    <tr key={file.file_id}>
                                        <td className="cl-td-name">{file.filename || file.file_id}</td>
                                        <td>{file.file_type}</td>
                                        <td>{file.row_count || '—'}</td>
                                        <td>{file.upload_time ? new Date(file.upload_time).toLocaleDateString() : '—'}</td>
                                        <td>{stageBadge(file)}</td>
                                        <td>{file.last_cleaned_at ? new Date(file.last_cleaned_at).toLocaleDateString() : '—'}</td>
                                        <td>{actionButton(file)}</td>
                                        <td>
                                            {/* View/Download only available once cleaning has run */}
                                            {(file.stage === 'cleaning_in_progress' || file.stage === 'clean') && (
                                                <>
                                                    <button className="btn-small" onClick={() => handleViewFile(file)} disabled={viewLoading === file.file_id}>
                                                        {viewLoading === file.file_id ? '...' : 'View'}
                                                    </button>
                                                    <button className="btn-small" onClick={() => handleDownloadFile(file)}>Download</button>
                                                </>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        )}
                    </div>
                    )
                })()}
            </div>

            {/* File preview modal */}
            {viewingFile && (
                <div className="modal-overlay" onClick={() => setViewingFile(null)}>
                    <div className="modal-box" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <div>
                                <h2 className="modal-title">{viewingFile.filename}</h2>
                                <p className="modal-subtitle">
                                    Showing {viewingFile.rows.length} of {viewingFile.totalRows} rows
                                    {viewingFile.totalRows > viewingFile.rows.length && ' — download for full data'}
                                </p>
                            </div>
                            <button className="modal-close" onClick={() => setViewingFile(null)}>✕</button>
                        </div>
                        <div className="modal-table-wrapper">
                            <table>
                                <thead>
                                    <tr>
                                        {viewingFile.rows[0] && Object.keys(viewingFile.rows[0]).map(col => (
                                            <th key={col}>{col}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {viewingFile.rows.map((row, i) => (
                                        <tr key={i}>
                                            {Object.values(row).map((val, j) => <td key={j}>{val}</td>)}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default ClientDetailsPage
