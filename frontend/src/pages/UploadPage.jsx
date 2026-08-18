import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { uploadFile, submitFile, inspectExcelSheets, getSheetPreview, getClients, getEngagements, getAuditSections } from '../services/api'
import '../styles/UploadPage.css'
// import axios from 'axios'

// UploadPage component allows users to upload financial documents for a selected client. It handles file selection, drag-and-drop functionality, client search and selection, and displays a preview of the uploaded file before proceeding to the mapping page.
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
    const [submitting, setSubmitting] = useState(false)
    const [submitSuccess, setSubmitSuccess] = useState(false) 
    const [engagements, setEngagements] = useState([])
    const [selectedEngagement, setSelectedEngagement] = useState(null)
    const [sections, setSections] = useState([])
    const [selectedSectionId, setSelectedSectionId] = useState('')
    const [sheets, setSheets] = useState([])
    const [selectedSheet, setSelectedSheet] = useState('')
    const [selectedSheets, setSelectedSheets] = useState([])
    const [sheetPreview, setSheetPreview] = useState(null)
    const [loadingPreview, setLoadingPreview] = useState(false)

    const clientEngagements = selectedClient
        ? engagements.filter(e => e.client_id === selectedClient.client_id)
        : [] 

    // Load the client list once on mount
    useEffect(() => {
        getClients()
            .then(res => setClients(res.data))
            .catch(err => console.error('Clients load failed', err))
        getEngagements()
            .then(res => setEngagements(res.data))
            .catch(err => console.error('Engagements load failed', err))
    }, [])

    // Load sections whenever an engagement is picked
    useEffect(() => {
        if (!selectedEngagement) {
            setSections([])
            setSelectedSectionId('')
            return
        }
        getAuditSections(selectedEngagement.engagement_id)
            .then(res => setSections(res.data))
            .catch(err => console.error('Sections load failed', err))
    }, [selectedEngagement])

    const inspectSheets = async (f) => {
        setSheets([])
        setSelectedSheet('')
        setSheetPreview(null)
        const ext = f.name.split('.').pop().toLowerCase()
        if (!['xlsx', 'xls'].includes(ext)) return
        try {
            const fd = new FormData()
            fd.append('file', f)
            const res = await inspectExcelSheets(fd)
            const sheetInfo = res.data.sheets || []
            if (sheetInfo.length >= 1) {
                setSheets(sheetInfo)
                setSelectedSheet(sheetInfo[0].name)
                setSelectedSheets([sheetInfo[0].name])
                // Auto-load preview for first sheet
                loadSheetPreview(f, sheetInfo[0].name)
            }
        } catch (err) {
            console.error('Sheet inspection failed', err)
        }
    }

    const loadSheetPreview = async (f, sheetName) => {
        if (!f || !sheetName) return
        setLoadingPreview(true)
        try {
            const fd = new FormData()
            fd.append('file', f)
            fd.append('sheet_name', sheetName)
            const res = await getSheetPreview(fd)
            setSheetPreview(res.data)
        } catch (err) {
            console.error('Sheet preview failed', err)
            setSheetPreview(null)
        } finally {
            setLoadingPreview(false)
        }
    }

    // Handles a file dropped onto the dropzone
    const onDropFile = (e) => {
        e.preventDefault()
        setDragging(false)
        if (e.dataTransfer.files?.length) {
            setFile(e.dataTransfer.files[0])
            setError('')
            inspectSheets(e.dataTransfer.files[0])
        }
    }

    // Handles a file picked via the file input
    const onChangeFile = (e) => {
        if (e.target.files?.length) {
            setFile(e.target.files[0])
            setError('')
            inspectSheets(e.target.files[0])
        }
    }

    const handleSheetChange = (sheetName) => {
        setSelectedSheet(sheetName)
        loadSheetPreview(file, sheetName)
    }
    
    // Sends the staged file + selected client to the backend
    const handleUpload = async () => {
        if (!selectedClient || !file || !selectedSectionId || !selectedEngagement) return
        if (sheets.length >= 1 && selectedSheets.length === 0) {
            setError('Select at least one sheet before uploading.')
            return
        }
        setError('')
        setUploading(true)
        try {
            const user = JSON.parse(localStorage.getItem('user'))
            const fd = new FormData()
            fd.append('file', file)
            fd.append('client_id', selectedClient.client_id)
            fd.append('section_id', selectedSectionId)
            fd.append('engagement_id', selectedEngagement.engagement_id)
            fd.append('uploaded_by', user.user_id)
            if (selectedSheet) fd.append('sheet_name', selectedSheet)
            if (selectedSheets.length > 0) fd.append('selected_sheets', JSON.stringify(selectedSheets))
            const res = await uploadFile(fd)
            setUploadResult(res.data)
        } catch (err) {
            setError(err.response?.data?.detail || 'Upload failed.')
        } finally {
            setUploading(false)
        }
    }
    
    // Handle file submission to auditor
    const handleSubmit = async () => {
        if (!selectedClient || !uploadResult) {
            
            return
        }
        setSubmitting(true)
        try {
            const user = JSON.parse(localStorage.getItem('user'))
            console.log('DEBUG: Submitting file', { 
                file_id: uploadResult.file_id, 
                client_id: selectedClient.client_id, 
                submitted_by: user.user_id 
            })
            const fd = new FormData()
            fd.append('file_id', uploadResult.file_id)
            fd.append('client_id', selectedClient.client_id)
            fd.append('submitted_by', user.user_id)
            const res = await submitFile(fd)
            
            setSubmitSuccess(true)
        } catch (err) {
            
            setError(err.response?.data?.detail || 'Submission failed.')
        } finally {
            setSubmitting(false)
        }
    }
    
    return (
        <div className="page">
            {/* Upload form, hidden once a file has been uploaded and previewed */}
            {!uploadResult && (
                <div className="card">
                    <h2 className="title">Upload Financial Documents</h2>
                    <div className="field client-field">
                        <label className="label">Client</label>
                        {/* Search input that filters and opens the client dropdown */}
                        <input
                            className="input"
                            type="text"
                            placeholder="Search client..."
                            value={clientSearch}
                            onChange={(e) => {
                                setClientSearch(e.target.value)
                                setSelectedClient(null)
                                setSelectedEngagement(null)
                                setSelectedSectionId('')
                                setShowDropdown(true)
                            }}
                            onFocus={() => setShowDropdown(true)}
                            onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                        />
                        {/* Dropdown list of clients matching the search text */}
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
                                                setSelectedEngagement(null)
                                                setSelectedSectionId('')
                                                setShowDropdown(false)
                                            }}
                                        >
                                            {c.company_name}
                                        </div>
                                    ))
                                }
                            </div>
                        )}
                        {/* Confirmation text once a client has been chosen */}
                        {selectedClient && (
                            <p className="selected-client">
                                Selected: {selectedClient.company_name} (ID: {selectedClient.client_id})
                            </p>
                        )}
                    </div>

                    {selectedClient && (
                        <div className="field">
                            <label className="label">Engagement</label>
                            <select
                                className="input"
                                value={selectedEngagement?.engagement_id || ''}
                                onChange={(e) => {
                                    const eng = clientEngagements.find(x => String(x.engagement_id) === e.target.value)
                                    setSelectedEngagement(eng || null)
                                    setSelectedSectionId('')
                                }}
                            >
                                <option value="">-- Select engagement --</option>
                                {clientEngagements.map(eng => (
                                    <option key={eng.engagement_id} value={eng.engagement_id}>
                                        {eng.engagement_name} (FY {eng.financial_year})
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {selectedEngagement && (
                        <div className="field">
                            <label className="label">Audit Section</label>
                            <select
                                className="input"
                                value={selectedSectionId}
                                onChange={(e) => setSelectedSectionId(e.target.value)}
                            >
                                <option value="">-- Select section this file belongs to --</option>
                                {sections.map(sec => (
                                    <option key={sec.section_id} value={sec.section_id}>
                                        {sec.section_name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Shows staged file name, or the dropzone if no file picked yet */}
                    {file ? (
                        <div className="selected-file-container">
                            <div className="selected-file-text-wrapper">
                                <span className="file-label">File staged: </span>
                                <span className="file-name" title={file.name}>{file.name}</span>
                            </div>
                            <button type="button" className="btn-remove-file" onClick={() => { setFile(null); setSheets([]); setSelectedSheet(''); setSheetPreview(null); }}>
                                Change File
                            </button>
                        </div>
                    ) : (
                        // Drag-and-drop zone, also clickable to open the file picker
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
                            <p className="drop-text">Drag and drop file here or click to browse</p>
                        </div>
                    )}

                   {sheets.length >= 1 && (
                        <div className="field">
                            <label className="label">Select sheets containing your work:</label>
                            <div className="sheet-selection-container">
                                {sheets.map((sheet, index) => (
                                    <div
                                        key={sheet.name}
                                        className={`sheet-option ${selectedSheet === sheet.name ? 'selected' : ''}`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selectedSheets.includes(sheet.name)}
                                            onChange={() => {
                                                setSelectedSheets(prev =>
                                                    prev.includes(sheet.name)
                                                        ? prev.filter(s => s !== sheet.name)
                                                        : [...prev, sheet.name]
                                                )
                                            }}
                                        />
                                        <div className="sheet-option-content" onClick={() => handleSheetChange(sheet.name)}>
                                            <div className="sheet-name">{sheet.name}</div>
                                            {/* Backend (/upload/inspect-sheets) returns "cols", not "columns" */}
                                            <div className="sheet-meta">{sheet.rows.toLocaleString()} rows × {sheet.cols} columns</div>
                                        </div>
                                        {selectedSheet === sheet.name && <div className="sheet-selected-indicator">● previewing</div>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {sheetPreview && (
                        <div className="field">
                            <label className="label">Preview: {selectedSheet}</label>
                            <div className="sheet-preview-container">
                                {loadingPreview ? (
                                    <p className="loading-preview">Loading preview...</p>
                                ) : (
                                    <div className="sheet-preview-table">
                                        <table>
                                            <thead>
                                                <tr>
                                                    {/* Backend (/upload/sheet-preview) returns "columns", not "headers" */}
                                                    {sheetPreview.columns.map((header, i) => (
                                                        <th key={i}>{header}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {/* Backend "rows" is a row COUNT, not the row data.
                                                    The actual row data lives in "preview", as an
                                                    array of { column_name: value } records — not
                                                    arrays — so we index each row by column name. */}
                                                {sheetPreview.preview.map((row, i) => (
                                                    <tr key={i}>
                                                        {sheetPreview.columns.map((col, j) => (
                                                            <td key={j}>{row[col]}</td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    <p className="formats">Excel (.xlsx, .xls), CSV, PDF, DOCX - Max 50MB</p>
                    {error && <div className="error">{error}</div>}
                    {/* Disabled until both a client and a file are selected */}
                    <button className="btn" onClick={handleUpload} disabled={uploading || !selectedClient || !file || !selectedSectionId || (sheets.length >= 1 && selectedSheets.length === 0)}>                        {uploading ? 'Uploading...' : 'Upload File'}
                    </button>
                </div>
            )}

            {/* Preview shown after a successful upload */}
            {uploadResult && (
                <div className="preview-card">
                    {/* Header row with title and a button to reset back to the upload form */}
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

                    {/* Quick summary of the uploaded file */}
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

                    {/* Preview table of the uploaded file's first rows */}
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
                    {/* Submit button for accountants to send file to auditor */}
                    {!submitSuccess ? (
                        <button className="btn" onClick={handleSubmit} disabled={submitting} style={{ marginTop: '24px' }}>
                            {submitting ? 'Submitting...' : 'Submit to Auditor'}
                        </button>
                    ) : (
                        <div className="success" style={{ marginTop: '24px' }}>
                            File submitted successfully! The assigned auditor has been notified.
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}