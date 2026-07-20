import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import axios from 'axios'
import '../styles/CleanPage.css'
// import '../styles/AnalysisPage.css'
import '../styles/CleanPage.css'

const API_BASE = 'http://localhost:8000'

function TrialBalancePage() {
    const location = useLocation()
    const navigate = useNavigate()
    const { cleanResult, clientId, uploadResult, fileType } = location.state || {}

    const [validating, setValidating] = useState(false)
    const [result, setResult] = useState(null)
    const [error, setError] = useState(null)

    if (!cleanResult || !uploadResult) {
        return (
            <div className="page">
                <p className="error">No cleaned data found. Please go back and complete cleaning first.</p>
                <button className="btn" onClick={() => navigate('/')}>Go Back</button>
            </div>
        )
    }

    const fileId = cleanResult.file_id || uploadResult.file_id

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
        } catch (err) {
            setError(err.response?.data?.detail || 'Trial balance validation failed. Please try again.')
        } finally {
            setValidating(false)
        }
    }

    const severityClass = (severity) => {
        switch (severity) {
            case 'high': return 'insight-high'
            case 'medium': return 'insight-medium'
            default: return 'insight-medium'
        }
    }

    return (
        <div className="page">

            <div className="header">
                <h1 className="logo">Audit AI</h1>
                <p className="subtitle">AI Financial Intelligence System</p>
            </div>

            <div className="card">
                <h2 className="title">Trial Balance Validation</h2>
                <div className="info-row">
                    <span className="info-label">File:</span>
                    <span>{uploadResult.filename}</span>
                </div>
                <div className="info-row">
                    <span className="info-label">Client:</span>
                    <span>{clientId}</span>
                </div>

                {error && <div className="error">{error}</div>}

                {!result ? (
                    <button className="btn" onClick={handleValidate} disabled={validating}>
                        {validating ? 'Validating...' : 'Run Trial Balance Validation'}
                    </button>
                ) : (
                    <div className="clean-complete">Validation Complete</div>
                )}
            </div>

            {result && (
                <>
                    {/* Not applicable — missing debit/credit mapping */}
                    {!result.applicable && (
                        <div className="card scope-banner scope-partial">
                            {result.message}
                        </div>
                    )}

                    {/* Applicable — show totals and status */}
                    {result.applicable && (
                        <>
                            <div className={`card scope-banner ${result.is_balanced ? 'scope-full' : 'scope-undetermined'}`}>
                                {result.is_balanced
                                    ? 'Trial balance is balanced ✔'
                                    : `Trial balance does not balance — difference of ${Math.abs(result.difference).toLocaleString()}`}
                            </div>

                            <div className="card">
                                <h2 className="title">Summary</h2>
                                <div className="stats-grid">
                                    <div className="stat-card">
                                        <h3>{result.total_debits.toLocaleString()}</h3>
                                        <p>Total Debits</p>
                                    </div>
                                    <div className="stat-card">
                                        <h3>{result.total_credits.toLocaleString()}</h3>
                                        <p>Total Credits</p>
                                    </div>
                                    <div className="stat-card">
                                        <h3>{result.difference.toLocaleString()}</h3>
                                        <p>Difference</p>
                                    </div>
                                    <div className="stat-card">
                                        <h3>{result.high_issues}</h3>
                                        <p>High Issues</p>
                                    </div>
                                    <div className="stat-card">
                                        <h3>{result.medium_issues}</h3>
                                        <p>Medium Issues</p>
                                    </div>
                                </div>

                                {result.issues.length > 0 ? (
                                    <div className="insights-list">
                                        {result.issues.map((issue, i) => (
                                            <div key={i} className={`insight-row ${severityClass(issue.severity)}`}>
                                                <span className="insight-type-badge">{issue.severity.toUpperCase()}</span>
                                                <p>{issue.message}</p>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="all-clean">No issues found — trial balance passed all checks.</div>
                                )}
                            </div>

                            <div className="card">
                                <button
                                    className="btn btn-proceed"
                                    disabled={result.high_issues > 0}
                                    onClick={() => navigate('/account-mapping', {
                                        state: { cleanResult, clientId, uploadResult, fileType }
                                    })}
                                >
                                    Proceed to Account Mapping →
                                </button>
                                {result.high_issues > 0 && (
                                    <p className="mapping-note" style={{ color: 'var(--danger)', marginTop: '8px' }}>
                                        Resolve the trial balance imbalance before proceeding.
                                    </p>
                                )}
                            </div>
                        </>
                    )}
                </>
            )}
        </div>
    )
}

export default TrialBalancePage