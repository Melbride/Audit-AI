import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { uploadFile } from '../services/api'
import '../styles/UploadPage.css'
import axios from 'axios'

export default function UploadPage() {
    const navigate = useNavigate()
    const [file, setFile] = useState(null)
    const [dragging, setDragging] = useState(false)
    const [uploading, setUploading] = useState(false)
    const [uploadResult, setUploadResult] = useState(null)
    const [error, setError] = useState('')
    const [clients, setClients] = useState([])
    const [clientSearch, setClientSearch] = useState('')
    const [selectedClient, setSelectedClient] = useState(null)
    const [showDropdown, setShowDropdown] = useState(false)

    useEffect(() => {
        axios.get('http://localhost:8000/clients')
            .then(res => setClients(res.data))
            .catch(err => console.error('Clients load failed', err))
    }, [])

    const onDropFile = (e) => {
        e.preventDefault()
        setDragging(false)
        if (e.dataTransfer.files?.length) {
            setFile(e.dataTransfer.files[0])
            setError('')
        }
    }
    
    const onChangeFile = (e) => {
        if (e.target.files?.length) {
            setFile(e.target.files[0])
            setError('')
        }
    }
    
    const handleUpload = async () => {
        if (!selectedClient || !file) return
        setError('')
        setUploading(true)
        try {
            const fd = new FormData()
            fd.append('file', file)
            fd.append('client_id', selectedClient.client_id)
            const res = await uploadFile(fd)
            setUploadResult(res.data)
        } catch (err) {
            setError(err.response?.data?.detail || 'Upload failed.')
        } finally {
            setUploading(false)
        }
    }
    
    return (
        <div className="page">
            {!uploadResult && (
                <div className="card">
                    <h2 className="title">Upload Financial Documents</h2>
                    <div className="field client-field">
                        <label className="label">Client</label>
                        <input
                            className="input"
                            type="text"
                            placeholder="Search client..."
                            value={clientSearch}
                            onChange={(e) => {
                                setClientSearch(e.target.value)
                                setSelectedClient(null)
                                setShowDropdown(true)
                            }}
                            onFocus={() => setShowDropdown(true)}
                            onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                        />
                        {showDropdown && (
                            <div className="client-dropdown">
                                {clients
                                    .filter(c => c.company_name.toLowerCase().includes(clientSearch.toLowerCase()))
                                    .map(c => (
                                        <div
                                            key={c.client_id}
                                            className="client-option"
                                            onMouseDown={() => {
                                                setSelectedClient(c)
                                                setClientSearch(c.company_name)
                                                setShowDropdown(false)
                                            }}
                                        >
                                            {c.company_name}
                                        </div>
                                    ))
                                }
                            </div>
                        )}
                        {selectedClient && (
                            <p className="selected-client">
                                Selected: {selectedClient.company_name} (ID: {selectedClient.client_id})
                            </p>
                        )}
                    </div>

                    {file ? (
                        <div className="selected-file-container">
                            <div className="selected-file-text-wrapper">
                                <span className="file-label">File staged: </span>
                                <span className="file-name" title={file.name}>{file.name}</span>
                            </div>
                            <button type="button" className="btn-remove-file" onClick={() => setFile(null)}>
                                Change File
                            </button>
                        </div>
                    ) : (
                        <div
                            className={`dropzone ${dragging ? 'dragging' : 'idle'}`}
                            onDragOver={e => { e.preventDefault(); setDragging(true) }}
                            onDragLeave={() => setDragging(false)}
                            onDrop={onDropFile}
                            onClick={() => document.getElementById('file-input').click()}
                        >
                            <input
                                id="file-input"
                                className="file-input"
                                type="file"
                                accept=".xlsx,.xls,.csv,.pdf,.docx"
                                onChange={onChangeFile}
                            />
                            <p className="drop-text">Drag & drop file here or click to browse</p>
                        </div>
                    )}
                    <p className="formats">Excel (.xlsx, .xls), CSV, PDF, DOCX - Max 50MB</p>
                    {error && <div className="error">{error}</div>}
                    <button className="btn" onClick={handleUpload} disabled={uploading || !selectedClient || !file}>
                        {uploading ? 'Uploading...' : 'Upload File'}
                    </button>
                </div>
            )}

            {uploadResult && (
                <div className="preview-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <h2 className="title" style={{ margin: 0 }}>File Preview</h2>
                        <button 
                            type="button" 
                            className="btn-remove-file" 
                            style={{ border: '1px solid var(--border)', padding: '6px 12px', borderRadius: '6px' }}
                            onClick={() => { setUploadResult(null); setFile(null); setClientSearch(''); setSelectedClient(null) }}
                        >
                            Go Back
                        </button>
                    </div>

                    <div className="preview-summary">
                        <div className="summary-item">
                            <span className="summary-label">Filename:</span>
                            <span className="summary-value">{uploadResult.filename}</span>
                        </div>
                        <div className="summary-item">
                            <span className="summary-label">Rows:</span>
                            <span className="summary-value">{uploadResult.rows}</span>
                        </div>
                        <div className="summary-item">
                            <span className="summary-label">Columns:</span>
                            <span className="summary-value">{uploadResult.columns?.length || 0}</span>
                        </div>
                    </div>

                    <div className="table-wrapper">
                        <table>
                            <thead>
                                <tr>
                                    {uploadResult.columns?.map(col => <th key={col}>{col}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {uploadResult.preview?.map((row, idx) => (
                                    <tr key={idx}>
                                        {uploadResult.columns?.map(col => <td key={col}>{row[col]}</td>)}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <button className="btn" onClick={() => navigate('/mapping', { state: { uploadResult, clientId: selectedClient?.client_id } })} style={{ marginTop: '24px' }}>
                        Detect Columns
                    </button>
                </div>
            )}
        </div>
    )
}
