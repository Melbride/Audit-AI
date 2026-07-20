import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import axios from 'axios'
import '../styles/CleanPage.css'
import '../styles/MappingPage.css'

const API_BASE = 'http://localhost:8000'

function AccountMappingPage() {
    const location = useLocation()
    const navigate = useNavigate()
    const { cleanResult, clientId, uploadResult, fileType } = location.state || {}

    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [categories, setCategories] = useState([])
    const [accounts, setAccounts] = useState([])
    const [nearDuplicates, setNearDuplicates] = useState([])
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [acknowledgedWarnings, setAcknowledgedWarnings] = useState({})

    const fileId = cleanResult?.file_id || uploadResult?.file_id

    useEffect(() => {
        if (!fileId) return
        const load = async () => {
            setLoading(true)
            setError(null)
            try {
                const formData = new FormData()
                formData.append('file_id', fileId)
                formData.append('client_id', clientId)
                formData.append('file_type', fileType || 'general')
                const response = await axios.post(`${API_BASE}/detect-account-mapping`, formData)
                const result = response.data.account_mapping
                if (!result.applicable) {
                    setError(result.message)
                } else {
                    setCategories(result.categories)
                    setAccounts(result.accounts)
                    setNearDuplicates(result.near_duplicate_accounts || [])
                    const preAcknowledged = {}
                    result.accounts.forEach(acc => {
                        if (acc.warning_acknowledged) preAcknowledged[acc.account_name] = true
                    })
                    setAcknowledgedWarnings(preAcknowledged)
                }
            } catch (err) {
                setError(err.response?.data?.detail || 'Could not load account mapping.')
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [fileId])

    if (!cleanResult || !uploadResult) {
        return (
            <div className="page">
                <p className="error">No cleaned data found. Please go back and complete cleaning first.</p>
                <button className="btn" onClick={() => navigate('/')}>Go Back</button>
            </div>
        )
    }

    const handleCategoryChange = (accountName, newCategory) => {
        setAccounts(prev => prev.map(acc =>
            acc.account_name === accountName
                ? { ...acc, suggested_category: newCategory }
                : acc
        ))
        // Clear acknowledgment if category changes, warning needs re-evaluation
        setAcknowledgedWarnings(prev => {
            const next = { ...prev }
            delete next[accountName]
            return next
        })
    }

    const handleAcknowledgeWarning = (accountName) => {
        setAcknowledgedWarnings(prev => ({ ...prev, [accountName]: true }))
    }

    const isUnresolved = (acc) => {
        return !acc.suggested_category || acc.suggested_category === 'unknown' || acc.suggested_category.trim() === ''
    }

    const unresolvedCount = accounts.filter(isUnresolved).length

    const handleSave = async () => {
        setSaving(true)
        setError(null)
        try {
            const payload = accounts.map(acc => ({
                account_name: acc.account_name,
                category: acc.suggested_category,
                warning_acknowledged: !!acknowledgedWarnings[acc.account_name],
            }))
            const formData = new FormData()
            formData.append('client_id', clientId)
            formData.append('file_type', fileType || 'general')
            formData.append('accounts', JSON.stringify(payload))
            formData.append('confirmed_by', 'Auditor')
            await axios.post(`${API_BASE}/save-account-mapping`, formData)
            setSaved(true)
        } catch (err) {
            setError(err.response?.data?.detail || 'Could not save account mapping.')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="page">
            <div className="header">
                <h1 className="logo">Audit AI</h1>
                <p className="subtitle">AI Financial Intelligence System</p>
            </div>

            <div className="card">
                <h2 className="title">Account Mapping</h2>
                <div className="info-row">
                    <span className="info-label">File:</span>
                    <span>{uploadResult.filename}</span>
                </div>
                <div className="info-row">
                    <span className="info-label">Client:</span>
                    <span>{clientId}</span>
                </div>

                {error && <div className="error">{error}</div>}
                {loading && <p className="mapping-note">Classifying accounts using AI...</p>}
            </div>

            {!loading && accounts.length > 0 && (
                <div className="card-mapping-body">
                    <h2 className="title">Confirm Account Categories</h2>
                    <p className="mapping-note">
                        Review each account's suggested category. Unclassified accounts must be resolved before saving.
                    </p>

                    {unresolvedCount > 0 ? (
                        <div className="review-counter">
                            {unresolvedCount} account{unresolvedCount > 1 ? 's' : ''} still need{unresolvedCount === 1 ? 's' : ''} a category
                        </div>
                    ) : (
                        <div className="review-counter review-counter-done">
                            All accounts classified, ready to save
                        </div>
                    )}

                    {nearDuplicates.length > 0 && (
                        <div className="issues-summary">
                            <strong>{nearDuplicates.length} possible duplicate account name{nearDuplicates.length > 1 ? 's' : ''} found:</strong>
                            <ul style={{ marginTop: '8px', paddingLeft: '20px' }}>
                                {nearDuplicates.map((dup, i) => (
                                    <li key={i} style={{ marginBottom: '4px' }}>{dup.message}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div className="table-wrapper">
                        <table>
                            <thead>
                                <tr>
                                    <th>Account Name</th>
                                    <th>Debit</th>
                                    <th>Credit</th>
                                    <th>Category</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {accounts.map((acc) => {
                                    const unresolved = isUnresolved(acc)
                                    const hasWarning = !!acc.warning && !acknowledgedWarnings[acc.account_name] && !acc.warning_acknowledged
                                    return (
                                        <tr key={acc.account_name} className={unresolved ? 'row-needs-review' : ''}>
                                            <td><span className="original-col">{acc.account_name}</span></td>
                                            <td>{acc.total_debit.toLocaleString()}</td>
                                            <td>{acc.total_credit.toLocaleString()}</td>
                                            <td>
                                                <select
                                                    className="mapping-select select-text"
                                                    value={acc.suggested_category === 'unknown' ? '' : acc.suggested_category}
                                                    onChange={(e) => handleCategoryChange(acc.account_name, e.target.value)}
                                                >
                                                    <option value="">-- Select category --</option>
                                                    {categories.map(cat => (
                                                        <option key={cat} value={cat}>{cat}</option>
                                                    ))}
                                                </select>
                                            </td>
                                            <td>
                                                {unresolved ? (
                                                    <span className="badge badge-unknown">Needs Category</span>
                                                ) : hasWarning ? (
                                                    <div className="review-cell">
                                                        <span className="badge badge-unknown">Unusual</span>
                                                        <span className="unknown-reason">{acc.warning}</span>
                                                        <button
                                                            className="skip-btn"
                                                            onClick={() => handleAcknowledgeWarning(acc.account_name)}
                                                        >
                                                            Confirm as-is
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span className="badge badge-ok">Confirmed</span>
                                                )}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>

                    {!saved ? (
                        <button className="btn" onClick={handleSave} disabled={saving || unresolvedCount > 0}>
                            {saving ? 'Saving...' : 'Confirm & Save Account Mapping'}
                        </button>
                    ) : (
                        <div>
                            <div className="success">Account mapping saved successfully!</div>
                            <button
                                className="btn btn-secondary"
                                onClick={() => navigate('/financial-statements', {
                                    state: { cleanResult, clientId, uploadResult, fileType }
                                })}
                            >
                                Proceed to Financial Statements →
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

export default AccountMappingPage