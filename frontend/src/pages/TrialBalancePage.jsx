import { useEffect, useState, Fragment } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { completeWorkflowStep } from '../services/api'
import '../styles/TrialBalancePage.css'

const API_BASE = 'http://localhost:8000'

function TrialBalancePage() {
    const location = useLocation()
    const navigate = useNavigate()
    const { cleanResult, clientId, uploadResult, fileType, workflow } = location.state || {}

    const [validating, setValidating] = useState(false)
    const [result, setResult] = useState(workflow?.tb_validation_result || null)
    const [error, setError] = useState(null)
    const [showCorrectedUpload, setShowCorrectedUpload] = useState(false)
    const [correctedFile, setCorrectedFile] = useState(null)
    const [correctedUploading, setCorrectedUploading] = useState(false)
    const [correctedError, setCorrectedError] = useState(null)

    useEffect(() => {
        if (workflow?.tb_validation_result) {
            setResult(workflow.tb_validation_result)
        }
    }, [workflow])

    if (!cleanResult || !uploadResult) {
        return (
            <div className="page tb-page">
                <div className="card tb-shell">
                    <h2 className="title">Trial Balance Validation</h2>
                    <p className="mapping-note">No cleaned data found. Please go back and complete cleaning first.</p>
                    <button className="btn btn-secondary" onClick={() => navigate('/')}>Go Back</button>
                </div>
            </div>
        )
    }

    const fileId = cleanResult.file_id || uploadResult.file_id
    const isBalanced = Boolean((result?.applicable ?? true) && result?.is_balanced)
    const canProceed = Boolean(result?.can_proceed)

    const handleValidate = async () => {
        setValidating(true)
        setError(null)
        try {
            const formData = new FormData()
            formData.append('file_id', fileId)
            formData.append('client_id', clientId)
            formData.append('file_type', fileType || 'general')
            const response = await axios.post(`${API_BASE}/validate-trial-balance`, formData)
            setResult(response.data.trial_balance_validation)
            setShowCorrectedUpload(false)
            setCorrectedFile(null)
        } catch (err) {
            setError(err.response?.data?.detail || 'Trial balance validation failed. Please try again.')
        } finally {
            setValidating(false)
        }
    }

    const handleCorrectedUpload = async () => {
        if (!correctedFile) return
        setCorrectedUploading(true)
        setCorrectedError(null)
        try {
            const formData = new FormData()
            formData.append('file', correctedFile)
            formData.append('file_id', fileId)
            formData.append('client_id', clientId)
            formData.append('file_type', fileType || 'trial_balance')

            const response = await axios.post(`${API_BASE}/trial-balance/upload-corrected`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            })

            if (response.data?.same_structure) {
                if (response.data.validation_result) {
                    setResult(response.data.validation_result)
                }
                setShowCorrectedUpload(false)
                setCorrectedFile(null)
                return
            }

            navigate('/mapping', {
                state: {
                    cleanResult: { file_id: fileId },
                    uploadResult: {
                        file_id: fileId,
                        filename: response.data.filename || uploadResult.filename,
                        client_id: clientId,
                        columns: response.data.columns || [],
                        fingerprint: response.data.fingerprint || '',
                        rows: response.data.rows || 0,
                        preview: response.data.preview || [],
                    },
                    clientId,
                    fileType: fileType || 'trial_balance',
                },
            })
        } catch (err) {
            setCorrectedError(err.response?.data?.detail || 'Corrected TB upload failed. Please try again.')
        } finally {
            setCorrectedUploading(false)
        }
    }

    const severityClass = (severity) => {
        switch (severity) {
            case 'high': return 'insight-high'
            case 'medium': return 'insight-medium'
            default: return 'insight-medium'
        }
    }

    const tbSteps = [
        { label: 'Validate', done: Boolean(result), active: !result },
        { label: 'Correct if needed', done: isBalanced, active: Boolean(result) && !isBalanced },
        { label: 'Proceed', done: isBalanced && canProceed, active: isBalanced && !canProceed },
    ]

    return (
        <div className="page tb-page">
            <div className="header">
                <h1 className="logo">Audit AI</h1>
                <p className="subtitle">Financial Intelligence System</p>
            </div>

            <div className="card tb-shell tb-hero">
                <div className="tb-hero-top">
                    <div>
                        <h2 className="title">Trial Balance Validation</h2>
                        <p className="mapping-note tb-hero-copy">
                            This is the checkpoint for the TB. If it is not balanced, stay here and upload the corrected file on this page.
                        </p>
                    </div>
                    <div className={`tb-badge ${isBalanced ? 'tb-badge-success' : result ? 'tb-badge-warning' : 'tb-badge-neutral'}`}>
                        {result ? (isBalanced ? 'Balanced' : 'Needs correction') : 'Not yet validated'}
                    </div>
                </div>

                <div className="tb-meta-grid">
                    <div className="tb-meta-item">
                        <span className="tb-meta-label">File</span>
                        <strong title={uploadResult.filename}>{uploadResult.filename}</strong>
                    </div>
                    <div className="tb-meta-item">
                        <span className="tb-meta-label">Client</span>
                        <strong title={String(clientId)}>{clientId}</strong>
                    </div>
                    <div className="tb-meta-item">
                        <span className="tb-meta-label">Current step</span>
                        <strong>{result ? (isBalanced ? 'Ready to proceed' : 'Correct and recheck') : 'Awaiting validation'}</strong>
                    </div>
                </div>
            </div>

            <div className="card tb-shell tb-flow-card">
                <div className="tb-flow">
                    {tbSteps.map((step, index) => (
                        <Fragment key={step.label}>
                            <div className={`tb-flow-step ${step.done ? 'done' : ''} ${step.active ? 'active' : ''}`}>
                                <span className="tb-flow-number">{step.done ? '✓' : index + 1}</span>
                                <span className="tb-flow-label">{step.label}</span>
                            </div>
                            {index < tbSteps.length - 1 && (
                                <span className="tb-flow-connector" aria-hidden="true" />
                            )}
                        </Fragment>
                    ))}
                </div>
            </div>

            {error && (
                <div className="card tb-shell tb-alert">
                    {error}
                </div>
            )}
            {correctedError && (
                <div className="card tb-shell tb-alert">
                    {correctedError}
                </div>
            )}

            <div className="card tb-shell tb-action-row">
                <button className="btn" onClick={handleValidate} disabled={validating}>
                    {validating ? 'Validating...' : (result ? 'Re-run Validation' : 'Run Trial Balance Validation')}
                </button>
                {result && (
                    <div className="tb-status-inline">
                        <span className={`tb-status-dot ${isBalanced ? 'tb-status-dot-success' : 'tb-status-dot-warning'}`} />
                        <span>{isBalanced ? 'Balanced TB' : 'Open exception'}</span>
                    </div>
                )}
            </div>

            {result && (result.applicable ?? true) && (
                <>
                    <div className={`card tb-shell tb-banner ${isBalanced ? 'tb-banner-success' : 'tb-banner-warning'}`}>
                        <div className="tb-banner-title">
                            {isBalanced ? 'Trial balance is balanced' : `Trial balance does not balance - difference of ${Math.abs(result.difference).toLocaleString()}`}
                        </div>
                        <div className="tb-banner-copy">
                            {isBalanced
                                ? 'You can continue to Account Mapping and then Financial Statements.'
                                : 'This is an accounting exception. Correct the TB here, then validate again.'}
                        </div>
                    </div>

                    <div className="card tb-shell">
                        <h2 className="title">Validation Summary</h2>
                        <div className="stats-grid tb-stats-grid">
                            <div className="stat-card">
                                <h3>{Number(result.total_debits || 0).toLocaleString()}</h3>
                                <p>Total Debits</p>
                            </div>
                            <div className="stat-card">
                                <h3>{Number(result.total_credits || 0).toLocaleString()}</h3>
                                <p>Total Credits</p>
                            </div>
                            <div className="stat-card">
                                <h3>{Number(result.difference || 0).toLocaleString()}</h3>
                                <p>Difference</p>
                            </div>
                            <div className="stat-card">
                                <h3>{result.high_issues ?? 0}</h3>
                                <p>High Issues</p>
                            </div>
                            <div className="stat-card">
                                <h3>{result.medium_issues ?? 0}</h3>
                                <p>Medium Issues</p>
                            </div>
                        </div>

                        {Array.isArray(result.issues) && result.issues.length > 0 ? (
                            <div className="insights-list tb-issue-list">
                                {result.issues.map((issue, i) => (
                                    <div key={i} className={`insight-row ${severityClass(issue.severity)}`}>
                                        <span className="insight-type-badge">{String(issue.severity || 'medium').toUpperCase()}</span>
                                        <p>{issue.message}</p>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="all-clean">No issues found. Trial balance passed all checks.</div>
                        )}
                    </div>

                    {!isBalanced && (
                        <div className="card tb-shell tb-correction-panel">
                            <div className="tb-panel-head">
                                <h2 className="title">Corrected TB</h2>
                                <p className="mapping-note">
                                    Upload the corrected file here. You do not need to return to the main Upload page.
                                </p>
                            </div>

                            {!showCorrectedUpload ? (
                                <button className="btn btn-secondary" onClick={() => setShowCorrectedUpload(true)}>
                                    Upload Corrected TB
                                </button>
                            ) : (
                                <div className="tb-upload-box">
                                    <input
                                        className="input"
                                        type="file"
                                        accept=".xlsx,.xls,.csv,.pdf,.docx"
                                        onChange={(e) => setCorrectedFile(e.target.files?.[0] || null)}
                                    />
                                    <div className="tb-upload-actions">
                                        <button className="btn btn-secondary" onClick={handleCorrectedUpload} disabled={correctedUploading || !correctedFile}>
                                            {correctedUploading ? 'Uploading...' : 'Upload Corrected TB'}
                                        </button>
                                        <button className="btn" onClick={() => { setShowCorrectedUpload(false); setCorrectedFile(null); setCorrectedError(null); }}>
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="card tb-shell tb-proceed-panel">
                        <div className="tb-proceed-copy">
                            <h2 className="title">Next Step</h2>
                            <p className="mapping-note">
                                {isBalanced
                                    ? 'Proceed to Account Mapping once the TB is balanced.'
                                    : 'Proceed remains locked until the TB balances.'}
                            </p>
                        </div>
                        <button
                            className="btn btn-proceed"
                            disabled={!canProceed}
                            onClick={async () => {
                                try {
                                    const formData = new FormData()
                                    formData.append('file_id', fileId)
                                    formData.append('client_id', clientId)
                                    formData.append('file_type', fileType || 'general')
                                    formData.append('step', 'tb_validation')
                                    formData.append('next_stage', 'account_mapping')
                                    await completeWorkflowStep(formData)
                                } catch (err) {
                                    console.error('Failed to mark workflow step complete:', err)
                                }
                                navigate('/account-mapping', {
                                    state: { cleanResult, clientId, uploadResult, fileType }
                                })
                            }}
                        >
                            Proceed to Account Mapping
                        </button>
                    </div>
                </>
            )}
        </div>
    )
}

export default TrialBalancePage