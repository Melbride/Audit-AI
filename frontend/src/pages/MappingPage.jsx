import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { detectColumns, saveMapping, getFilePreview } from '../services/api'
import '../styles/MappingPage.css'

function MappingPage() {
    
    const location = useLocation()
    const navigate = useNavigate()

    // Read from localStorage first, fallback to location.state
    const fileId = localStorage.getItem('pendingFileId') || location.state?.fileId
    const clientId = localStorage.getItem('pendingClientId') || location.state?.clientId
    const { uploadResult } = location.state || {}
    
    
    
    
    
    
    // Debug logging
    
    
    
    
    const [mapping, setMapping] = useState(null)
    const [loadingFile, setLoadingFile] = useState(false)
    const [loadedUploadResult, setLoadedUploadResult] = useState(null)
    const [detecting, setDetecting] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState(null)
    const [saved, setSaved] = useState(false)
    const [reviewedUnknowns, setReviewedUnknowns] = useState({})
    const [editingCol, setEditingCol] = useState(null)
    const [fileType, setFileType] = useState('other')
    // Custom label kept separate from fileType so toggling presets doesn't lose typed text
    const [customFileTypeLabel, setCustomFileTypeLabel] = useState('')
    // Where the mapping came from (AI / saved mapping / fingerprint cache), used for the banner
    const [detectionSource, setDetectionSource] = useState(null)
    const [detectionMessage, setDetectionMessage] = useState(null)
    
    // Canonical field names for controlled mapping interface
    const CANONICAL_FIELDS = [
        { value: 'account_name', label: 'Account Name' },
        { value: 'debit', label: 'Debit' },
        { value: 'credit', label: 'Credit' },
        { value: 'date', label: 'Date' },
        { value: 'amount', label: 'Amount' },
        { value: 'account_code', label: 'Account Code' },
        { value: 'unknown', label: 'Unknown / Skip' },
        { value: 'other', label: 'Other (custom field)' }
    ]
    
    // Track which columns are using custom "Other" field names
    const [customFieldNames, setCustomFieldNames] = useState({})

    const FILE_TYPE_CATEGORIES = {
        fixed_assets: 'Fixed Assets Register',
        bank_transactions: 'Bank Transactions',
        payroll: 'Payroll',
        general_ledger: 'General Ledger',
        trial_balance: 'Trial Balance',
        accounts_receivable: 'Accounts Receivable',
        accounts_payable: 'Accounts Payable',
        inventory: 'Inventory',
        other: 'Other',
    }

    // Resolves the actual file_type value to send to the backend
    const effectiveFileType = () => {
        if (fileType === 'other' && customFileTypeLabel.trim() !== '') {
            return customFileTypeLabel.trim().toLowerCase().replace(/\s+/g, '_')
        }
        return fileType
    }

    // Adds reviewed_unknown flags before saving/persisting the mapping
    const buildPersistedMapping = () => {
        if (!mapping) return null
        return Object.fromEntries(
            Object.entries(mapping).map(([originalCol, info]) => [
                originalCol,
                { ...info, reviewed_unknown: !!reviewedUnknowns[originalCol] }
            ])
        )
    }

    useEffect(() => {
        if (uploadResult) handleDetect()
    }, [])

    // Don't clear localStorage for debugging
    // useEffect(() => {
    //     if (fileId && loadedUploadResult) {
    //         localStorage.removeItem('pendingFileId')
    //         localStorage.removeItem('pendingClientId')
    //     }
    // }, [fileId, loadedUploadResult])

    // Load file data if coming from notification (fileId provided but no uploadResult)
    useEffect(() => {
        
        if (fileId && clientId && !uploadResult) {
            
            setLoadingFile(true)
            const loadFileAndDetect = async () => {
                try {
                    
                    const response = await getFilePreview(fileId, clientId)
                    const data = response.data || response
                    
                    // Create uploadResult-like object
                    const loadedUploadResult = {
                        file_id: fileId,
                        filename: data.filename,
                        rows: data.rows,
                        columns: data.columns,
                        preview: data.preview,
                        file_type: data.file_type || 'other'
                    }
                    // Set uploadResult state so the page can display file info
                    setLoadedUploadResult(loadedUploadResult)
                    
                    // Manually trigger detection with loaded data
                    const formData = new FormData()
                    formData.append('client_id', String(clientId))
                    formData.append('file_id', fileId)
                    formData.append('columns', JSON.stringify(data.columns))
                    formData.append('fill_rates', JSON.stringify({}))
                    formData.append('fingerprint', '')
                    // Don't pass file_type initially - let backend return the saved one
                    formData.append('file_type', 'general')
                    const detectResponse = await detectColumns(formData)
                    const mapping = detectResponse.data.mapping
                    setMapping(mapping)
                    
                    // Initialize custom field names for non-canonical values
                    const customNames = {}
                    Object.entries(mapping).forEach(([col, info]) => {
                        const mappedTo = info.mapped_to
                        if (mappedTo && mappedTo !== 'unknown' && !CANONICAL_FIELDS.some(f => f.value === mappedTo)) {
                            customNames[col] = mappedTo
                        }
                    })
                    setCustomFieldNames(customNames)
                    
                    setDetectionSource(detectResponse.data.source || null)
                    setDetectionMessage(detectResponse.data.message || null)
                } catch (err) {
                    
                    setError('Failed to load file or detect columns: ' + (err.message || err))
                } finally {
                    setLoadingFile(false)
                }
            }
            loadFileAndDetect()
        }
    }, [fileId, clientId, uploadResult, fileType])

    // Load file data if coming from notification (fileId provided but no uploadResult)
    useEffect(() => {
        if (fileId && clientId && !uploadResult) {
            setLoadingFile(true)
            const loadFileAndDetect = async () => {
                try {
                    const response = await getFilePreview(fileId, clientId)
                    const data = response.data || response
                    const loadedUploadResult = {
                        file_id: fileId,
                        filename: data.filename,
                        rows: data.rows,
                        columns: data.columns,
                        preview: data.preview,
                        file_type: data.file_type || 'other'
                    }
                    setLoadedUploadResult(loadedUploadResult)
                    const formData = new FormData()
                    formData.append('client_id', String(clientId))
                    formData.append('file_id', fileId)
                    formData.append('columns', JSON.stringify(data.columns))
                    formData.append('fill_rates', JSON.stringify({}))
                    formData.append('fingerprint', '')
                    formData.append('file_type', 'general')
                    const detectResponse = await detectColumns(formData)
                    const mapping = detectResponse.data.mapping
                    setMapping(mapping)
                    
                    // Initialize custom field names for non-canonical values
                    const customNames = {}
                    Object.entries(mapping).forEach(([col, info]) => {
                        const mappedTo = info.mapped_to
                        if (mappedTo && mappedTo !== 'unknown' && !CANONICAL_FIELDS.some(f => f.value === mappedTo)) {
                            customNames[col] = mappedTo
                        }
                    })
                    setCustomFieldNames(customNames)
                    
                    setDetectionSource(detectResponse.data.source || null)
                    setDetectionMessage(detectResponse.data.message || null)
                } catch (err) {
                    setError('Failed to load file or detect columns')
                } finally {
                    setLoadingFile(false)
                }
            }
            loadFileAndDetect()
        }
    }, [fileId, clientId, uploadResult, fileType])

    // Calls backend to detect/suggest column mappings for the uploaded file
    const handleDetect = async () => {
        setDetecting(true)
        setError(null)
        try {
            const formData = new FormData()
            formData.append('client_id', String(clientId))
            formData.append('file_id', (uploadResult || loadedUploadResult).file_id)
            formData.append('columns', JSON.stringify(uploadResult.columns))
            formData.append('fill_rates', JSON.stringify(uploadResult.fill_rates || {}))
            formData.append('fingerprint', uploadResult.fingerprint || '')
            formData.append('file_type', fileType)
            const response = await detectColumns(formData)
            const mapping = response.data.mapping
            setMapping(mapping)
            
            // Initialize custom field names for non-canonical values
            const customNames = {}
            Object.entries(mapping).forEach(([col, info]) => {
                const mappedTo = info.mapped_to
                if (mappedTo && mappedTo !== 'unknown' && !CANONICAL_FIELDS.some(f => f.value === mappedTo)) {
                    customNames[col] = mappedTo
                }
            })
            setCustomFieldNames(customNames)
            
            setDetectionSource(response.data.source || null)
            setDetectionMessage(response.data.message || null)
            if (response.data.suggested_file_type) {
                const suggested = response.data.suggested_file_type
                if (Object.prototype.hasOwnProperty.call(FILE_TYPE_CATEGORIES, suggested)) {
                    setFileType(suggested)
                } else {
                    // Not a preset, treat as a previously-saved custom category
                    setFileType('other')
                    setCustomFileTypeLabel(response.data.suggested_file_type_label || suggested)
                }
            }
        } catch (err) {
            setError(err.response?.data?.detail || 'Detection failed. Please try again.')
        } finally {
            setDetecting(false)
        }
    }

    // Updates a single mapping field for a column
    const handleMappingChange = (originalCol, field, value) => {
        if (field === 'mapped_to') {
            // Handle canonical field selection or custom field name
            if (value === 'other') {
                // Switch to custom field mode - keep existing value or empty
                const currentCustom = customFieldNames[originalCol] || ''
                setCustomFieldNames(prev => ({ ...prev, [originalCol]: currentCustom }))
                setMapping(prev => ({
                    ...prev,
                    [originalCol]: { ...prev[originalCol], mapped_to: currentCustom }
                }))
            } else if (value === 'unknown') {
                // Clear custom field name when switching to unknown
                setCustomFieldNames(prev => {
                    const next = { ...prev }
                    delete next[originalCol]
                    return next
                })
                setMapping(prev => ({
                    ...prev,
                    [originalCol]: { ...prev[originalCol], mapped_to: 'unknown' }
                }))
            } else {
                // Canonical field selected
                setCustomFieldNames(prev => {
                    const next = { ...prev }
                    delete next[originalCol]
                    return next
                })
                setMapping(prev => ({
                    ...prev,
                    [originalCol]: { ...prev[originalCol], mapped_to: value }
                }))
            }
            
            // Auto-set field type for canonical fields
            if (value !== 'other' && value !== 'unknown' && value.trim() !== '') {
                const fieldTypeForCanonical = (canonical) => {
                    if (canonical === 'date') return 'date'
                    if (['debit', 'credit', 'amount'].includes(canonical)) return 'numeric'
                    return 'text'
                }
                setMapping(prev => ({
                    ...prev,
                    [originalCol]: {
                        ...prev[originalCol],
                        field_type: fieldTypeForCanonical(value)
                    }
                }))
            }
            
            // Remove from reviewed unknowns if mapping to a real field
            if (value !== 'unknown') {
                setReviewedUnknowns(prev => {
                    const next = { ...prev }
                    delete next[originalCol]
                    return next
                })
            }
        } else {
            // Handle other field changes (field_type, etc.)
            setMapping(prev => ({
                ...prev,
                [originalCol]: { ...prev[originalCol], [field]: value }
            }))
        }
    }
    
    // Handle custom field name input for "Other" selection
    const handleCustomFieldNameChange = (originalCol, value) => {
        const normalized = value.toLowerCase().trim().replace(/\s+/g, '_')
        setCustomFieldNames(prev => ({ ...prev, [originalCol]: normalized }))
        setMapping(prev => ({
            ...prev,
            [originalCol]: { ...prev[originalCol], mapped_to: normalized }
        }))
    }

    const handleReviewedToggle = (originalCol) => {
        setReviewedUnknowns(prev => ({ ...prev, [originalCol]: !prev[originalCol] }))
    }

    // True if this row still needs the auditor's attention
    const isRowUnresolved = (col, info) => {
        if (!info.mapped_to || info.mapped_to.trim() === '') return true
        if (info.mapped_to === 'unknown' && !reviewedUnknowns[col]) return true
        if (info.mapped_to !== 'unknown' && info.field_type === 'unknown') return true
        return false
    }

    const hasUnresolvedRows = () => {
        if (!mapping) return false
        return Object.entries(mapping).some(([col, info]) => isRowUnresolved(col, info))
    }

    const fileTypeIsIncomplete = () => fileType === 'other' && customFileTypeLabel.trim() === ''

    // Detect duplicate target mappings before saving
    const getDuplicateTargets = () => {
        if (!mapping) return []
        const counts = {}
        Object.entries(mapping).forEach(([col, info]) => {
            const target = info?.mapped_to?.trim()?.toLowerCase()
            if (target && target !== 'unknown') {
                counts[target] = (counts[target] || 0) + 1
            }
        })
        return Object.keys(counts).filter(target => counts[target] > 1)
    }

    const hasDuplicateTargets = () => {
        return getDuplicateTargets().length > 0
    }

    // Validates mapping/file type, then saves the confirmed mapping to the backend
    const handleSave = async () => {
        if (hasUnresolvedRows()) {
            setError('Please review all "Needs Review" columns before saving, either map them or confirm they should stay unknown.')
            return
        }
        if (fileTypeIsIncomplete()) {
            setError('Please type a name for this file type, or choose one of the listed categories.')
            return
        }
        if (hasDuplicateTargets()) {
            const duplicates = getDuplicateTargets()
            setError(`Mapping conflict detected. Multiple columns are mapped to the same target field(s): ${duplicates.join(', ')}. Please ensure each target field is used by only one source column.`)
            return
        }
        const persistedMapping = buildPersistedMapping()
        if (!persistedMapping) return
        setSaving(true)
        setError(null)
        try {
            const formData = new FormData()
            formData.append('client_id', clientId)
            formData.append('file_id', (uploadResult || loadedUploadResult).file_id)   
            formData.append('file_type', effectiveFileType())
            formData.append('mapping', JSON.stringify(persistedMapping))
            formData.append('confirmed_by', 'Auditor')
            formData.append('fingerprint', (uploadResult || loadedUploadResult).fingerprint || '')

            await saveMapping(formData)
            setMapping(persistedMapping)
            setSaved(true)
        } catch (err) {
            setError(err.response?.data?.detail || 'Could not save mapping. Please try again.')
        } finally {
            setSaving(false)
        }
    }

    const handleProceed = () => {
        navigate('/clean', {
            state: { uploadResult: uploadResult || loadedUploadResult, clientId, fileType: effectiveFileType(), mapping: buildPersistedMapping() }
        })
    }

    const fieldTypeClass = (type) => {
        switch (type) {
            case 'date':    return 'select-date'
            case 'numeric': return 'select-numeric'
            case 'text':    return 'select-text'
            default:        return 'select-unknown'
        }
    }

    const unknownReason = (info) => {
        if ((info.fill_rate ?? 1) < 0.20)
            return `Too little data (${Math.round(info.fill_rate * 100)}% fill rate)`
        return 'AI could not determine meaning'
    }

    const fillRateDisplay = (rate) => {
        const pct = Math.round((rate ?? 1) * 100)
        let cls = 'fill-high'
        if (pct < 50) cls = 'fill-low'
        else if (pct < 80) cls = 'fill-mid'
        return { pct, cls }
    }

    // Banner text shown when mapping came from a cache/saved profile instead of fresh AI detection
    const cacheBannerText = () => {
        if (detectionSource === 'saved_mapping' || detectionSource === 'fingerprint_cache') {
            return "This mapping was loaded from this client's saved profile.Review, change and confirm as needed."
        }
        if (detectionSource === 'file_specific') {
            return "This mapping was loaded from this specific file.Review, change and confirm as needed."
        }
        return null
    }

    if (!uploadResult && !fileId) {
        return (
            <div className="page">
                <p className="error">No file uploaded. Please go back and upload a file first.</p>
                <button className="btn" onClick={() => navigate('/upload')}>Go Back</button>
            </div>
        )
    }

    return (
        <div className="page">

            {/* <div className="header">
                <h1 className="logo">Audit AI</h1>
                <p className="subtitle">Financial Intelligence System</p>
            </div> */}

            <div className="card">
                <h2 className="title">Column Detection</h2>
                {loadingFile ? (
                    <p>Loading file data...</p>
                ) : (
                    <>
                        <div className="info-row">
                            <span className="info-label">File:</span>
                            <span>{(uploadResult || loadedUploadResult)?.filename || 'No file'}</span>
                        </div>
                        <div className="info-row">
                            <span className="info-label">Client:</span>
                            <span>{clientId}</span>
                        </div>
                        {loadedUploadResult && (
                            <>
                                <div className="info-row">
                                    <span className="info-label">Rows:</span>
                                    <span>{loadedUploadResult.rows}</span>
                                </div>
                                <div className="info-row">
                                    <span className="info-label">Columns:</span>
                                    <span>{loadedUploadResult.columns?.join(', ') || 'None'}</span>
                                </div>
                            </>
                        )}
                    </>
                )}
            </div>

            {detecting && (
                <div className="card">
                    <p className="detecting-text">Analyzing columns... This may take a moment.</p>
                </div>
            )}

            {error && <div className="error">{error}</div>}

            {mapping && !detecting && (
                <div className="card-mapping-body">
                    <h2 className="title">Detected Mappings</h2>

                    {cacheBannerText() && (
                        <div className="cache-banner">
                            {cacheBannerText()}
                        </div>
                    )}

                    <p className="mapping-note">
                        Unknown columns must be fixed before saving.
                    </p>

                    {/* File type selector: dropdown of presets, or text input when "Other" is chosen */}
                    <div className="file-type-row">
                        <label className="file-type-label">File Type:</label>

                        {fileType === 'other' ? (
                            <>
                                <input
                                    className="file-type-custom-input"
                                    type="text"
                                    autoFocus
                                    placeholder="Type the file type here"
                                    value={customFileTypeLabel}
                                    onChange={(e) => setCustomFileTypeLabel(e.target.value)}
                                />
                                <button
                                    type="button"
                                    className="file-type-back-link"
                                    onClick={() => {
                                        setCustomFileTypeLabel('')
                                        setFileType(Object.keys(FILE_TYPE_CATEGORIES)[0])
                                    }}
                                >
                                    choose from list instead
                                </button>
                            </>
                        ) : (
                            <select
                                className="file-type-select"
                                value={fileType}
                                onChange={(e) => setFileType(e.target.value)}
                            >
                                {Object.entries(FILE_TYPE_CATEGORIES).map(([key, label]) => (
                                    <option key={key} value={key}>{label}</option>
                                ))}
                            </select>
                        )}

                        <span className="file-type-hint">
                            {detectionSource === 'saved_mapping' || detectionSource === 'fingerprint_cache' || detectionSource === 'file_specific'
                                ? 'Loaded from saved profile, confirm or change'
                                : 'AI suggested, confirm or change before saving'}
                        </span>
                    </div>

                    {(() => {
                        const count = Object.entries(mapping).filter(([col, info]) => isRowUnresolved(col, info)).length
                        return count > 0 ? (
                            <div className="review-counter">
                                {count} column{count > 1 ? 's' : ''} still need{count === 1 ? 's' : ''} your review
                            </div>
                        ) : (
                            <div className="review-counter review-counter-done">
                                All columns reviewed, ready to save
                            </div>
                        )
                    })()}

                    {/* Table listing each detected column with its mapping details */}
                    <div className="table-wrapper">
                        <table>
                            <thead>
                                <tr>
                                    <th>Original Column</th>
                                    <th>Sample Value</th>
                                    <th>Fill Rate</th>
                                    <th>Mapped To</th>
                                    <th>Field Type</th>
                                    <th>Status</th>
                                </tr>
                            </thead>

                            <tbody>
                                {Object.entries(mapping).map(([col, info]) => {
                                    const unresolved = isRowUnresolved(col, info)
                                    const { pct, cls } = fillRateDisplay(info.fill_rate)

                                    
                                    return (
                                        <tr key={col} className={unresolved ? 'row-needs-review' : ''}>
                                            <td>
                                                <span className="original-col">{col}</span>
                                            </td>
                                            <td>
                                                <span className="sample-value">
                                                    {info.sample_value ? info.sample_value : <em>empty</em>}
                                                </span>
                                            </td>
                                            <td>
                                                <span className={`fill-rate ${cls}`}>{pct}%</span>
                                            </td>
                                            {/* Canonical field selection dropdown */}
                                            <td>
                                                <div className="mapped-to-cell">
                                                    {editingCol === col ? (
                                                        <div className="mapping-dropdown-container">
                                                            <select
                                                                className="mapping-select"
                                                                value={
                                                                    customFieldNames[col] !== undefined ? 'other' :
                                                                    CANONICAL_FIELDS.some(f => f.value === info.mapped_to) ? info.mapped_to : 'other'
                                                                }
                                                                onChange={(e) => handleMappingChange(col, 'mapped_to', e.target.value)}
                                                                onBlur={() => setEditingCol(null)}
                                                                autoFocus
                                                            >
                                                                {CANONICAL_FIELDS.map(field => (
                                                                    <option key={field.value} value={field.value}>
                                                                        {field.label}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                            {customFieldNames[col] !== undefined && (
                                                                <input
                                                                    className="custom-field-input"
                                                                    type="text"
                                                                    value={customFieldNames[col]}
                                                                    placeholder="Enter custom field name"
                                                                    onChange={(e) => handleCustomFieldNameChange(col, e.target.value)}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                />
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span
                                                            className="mapped-to-text"
                                                            title="Click to edit"
                                                            onClick={() => setEditingCol(col)}
                                                        >
                                                            {info.mapped_to}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td>
                                                {info.mapped_to === 'unknown' || !info.mapped_to.trim() ? (
                                                    <span className="muted-na">—</span>
                                                ) : (
                                                    <select
                                                        className={`mapping-select ${fieldTypeClass(info.field_type)}`}
                                                        value={info.field_type}
                                                        onChange={(e) => handleMappingChange(col, 'field_type', e.target.value)}
                                                    >
                                                        <option value="date">Date</option>
                                                        <option value="numeric">Number</option>
                                                        <option value="text">Text</option>
                                                        <option value="unknown">Don't know</option>
                                                    </select>
                                                )}
                                            </td>
                                            <td>
                                                {info.mapped_to === 'unknown' || !info.mapped_to.trim() ? (
                                                    <div className="review-cell">
                                                        {reviewedUnknowns[col] && info.mapped_to === 'unknown' ? (
                                                            <>
                                                                <span className="badge badge-info">Skipped</span>
                                                                <button className="skip-btn" onClick={() => handleReviewedToggle(col)}>Undo</button>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <span className="badge badge-unknown">Needs Review</span>
                                                                <span className="unknown-reason">{unknownReason(info)}</span>
                                                                <button className="skip-btn" onClick={() => handleReviewedToggle(col)}>Looks good, skip</button>
                                                            </>
                                                        )}
                                                    </div>
                                                ) : info.field_type === 'unknown' ? (
                                                    <span className="badge badge-unknown">Set field type</span>
                                                ) : (
                                                    <span className="badge badge-ok">Detected</span>
                                                )}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>

                    {error && <div className="error">{error}</div>}

                    {!saved ? (
                        <button className="btn" onClick={handleSave} disabled={saving || hasUnresolvedRows() || fileTypeIsIncomplete()}>
                            {saving ? 'Saving...' : 'Confirm & Save Mapping'}
                        </button>
                    ) : (
                        <div>
                            <div className="success">Mapping saved successfully! You can now proceed.</div>
                            <button className="btn btn-secondary" onClick={handleProceed}>Proceed to Clean</button>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
export default MappingPage