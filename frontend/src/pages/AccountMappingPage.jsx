import { useState, useEffect, Fragment } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { completeWorkflowStep } from '../services/api'
import '../styles/AccountMappingPage.css'

const API_BASE = 'http://localhost:8000'
const CUSTOM_CATEGORY_VALUE = '__custom__'

function AccountMappingPage() {
    const location = useLocation()
    const navigate = useNavigate()
    const { cleanResult, clientId, uploadResult, fileType } = location.state || {}

    const fileId = cleanResult?.file_id || uploadResult?.file_id
    const effectiveCleanResult = cleanResult || (fileId ? { file_id: fileId } : null)
    const effectiveFileType = fileType || uploadResult?.file_type || 'trial_balance'

    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [categories, setCategories] = useState([])
    const [accounts, setAccounts] = useState([])
    const [nearDuplicates, setNearDuplicates] = useState([])
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [acknowledgedWarnings, setAcknowledgedWarnings] = useState({})

    const workflowSteps = [
        { id: 'trial-balance', label: 'Trial Balance', status: 'done' },
        { id: 'account-mapping', label: 'Account Mapping', status: 'active' },
        { id: 'financial-statements', label: 'Financial Statements', status: '' },
    ]

    useEffect(() => {
        if (!fileId) return
        const load = async () => {
            setLoading(true)
            setError(null)
            try {
                const formData = new FormData()
                formData.append('file_id', fileId)
                formData.append('client_id', clientId)
                formData.append('file_type', effectiveFileType)
                const response = await axios.post(`${API_BASE}/detect-account-mapping`, formData)
                const result = response.data.account_mapping
                
                if (!result.applicable) {
                    setError(result.message)
                } else {
                    setCategories(result.categories || [])
                    
                    const normalizedAccounts = (result.accounts || []).map((acc) => {
                        const rawCat = acc.suggested_category || ''
                        const isKnownCategory = (result.categories || []).includes(rawCat)
                        const isCustom = rawCat && rawCat !== 'unknown' && !isKnownCategory

                        return {
                            ...acc,
                            category_mode: isCustom ? 'custom' : 'preset',
                            original_suggested_category: isCustom ? rawCat : '',
                            suggested_category: isKnownCategory ? rawCat : '',
                            custom_category: isCustom ? rawCat : '',
                        }
                    })
                    
                    setAccounts(normalizedAccounts)
                    setNearDuplicates(result.near_duplicate_accounts || [])
                    
                    const preAcknowledged = {}
                    normalizedAccounts.forEach(acc => {
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
    }, [fileId, clientId, effectiveFileType])

    if (!uploadResult || !fileId) {
        return (
            <div className="page mapping-page">
                <p className="error">No file data found. Please return to the previous step and continue from there.</p>
                <button className="btn btn-secondary" onClick={() => navigate('/')}>Go Back</button>
            </div>
        )
    }

    const handleCategoryChange = (accountName, newCategory) => {
        setAccounts(prev => prev.map(acc => {
            if (acc.account_name !== accountName) return acc

            const isCustomMode = newCategory === CUSTOM_CATEGORY_VALUE
            return {
                ...acc,
                category_mode: isCustomMode ? 'custom' : 'preset',
                suggested_category: isCustomMode ? '' : newCategory,
                custom_category: isCustomMode ? acc.custom_category || '' : '',
            }
        }))
        
        setAcknowledgedWarnings(prev => {
            const next = { ...prev }
            delete next[accountName]
            return next
        })
    }

    const handleCustomCategoryChange = (accountName, value) => {
        setAccounts(prev => prev.map(acc =>
            acc.account_name === accountName
                ? { ...acc, category_mode: 'custom', custom_category: value }
                : acc
        ))
        
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
        if (acc.category_mode === 'custom') {
            return !acc.custom_category || acc.custom_category.trim() === ''
        }
        return !acc.suggested_category || acc.suggested_category === 'unknown' || acc.suggested_category.trim() === ''
    }

    const unresolvedCount = accounts.filter(isUnresolved).length

    const unusualCount = accounts.filter(acc => 
        !!acc.warning && !acknowledgedWarnings[acc.account_name] && !acc.warning_acknowledged
    ).length

    const handleSave = async () => {
        setSaving(true)
        setError(null)
        try {
            const payload = accounts.map(acc => {
                const finalCategory = acc.category_mode === 'custom' 
                    ? acc.custom_category.trim() 
                    : acc.suggested_category.trim()

                return {
                    account_name: acc.account_name,
                    category: finalCategory,
                    warning_acknowledged: !!acknowledgedWarnings[acc.account_name],
                }
            })

            const formData = new FormData()
            formData.append('client_id', clientId)
            formData.append('file_type', effectiveFileType)
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
        <div className="page mapping-page">
            <div className="card mapping-shell mapping-hero">
                <div className="mapping-hero-top">
                    <div>
                        <h2 className="title">Account Mapping</h2>
                        <p className="mapping-note mapping-hero-copy">
                            Confirm the suggested categories before moving from the TB into Financial Statements.
                        </p>
                    </div>
                    <div className="mapping-badge">
                        {loading ? 'Classifying' : saved ? 'Saved' : 'Ready for review'}
                    </div>
                </div>

                <div className="mapping-meta-grid">
                    <div className="mapping-meta-item">
                        <span className="mapping-meta-label">File</span>
                        <strong title={uploadResult.filename}>{uploadResult.filename}</strong>
                    </div>
                    <div className="mapping-meta-item">
                        <span className="mapping-meta-label">Client</span>
                        <strong title={String(clientId)}>{clientId}</strong>
                    </div>
                    <div className="mapping-meta-item">
                        <span className="mapping-meta-label">Source</span>
                        <strong>{cleanResult ? 'Cleaned TB' : 'Corrected TB handoff'}</strong>
                    </div>
                </div>
            </div>

            <div className="card mapping-shell mapping-flow-card">
                <div className="mapping-flow">
                    {workflowSteps.map((step, index) => (
                        <Fragment key={step.id}>
                            <div className={`mapping-flow-step ${step.status}`}>
                                <span className="mapping-flow-number">{step.status === 'done' ? '✓' : index + 1}</span>
                                <span>{step.label}</span>
                            </div>
                            {index < workflowSteps.length - 1 && (
                                <span className="mapping-flow-connector" aria-hidden="true" />
                            )}
                        </Fragment>
                    ))}
                </div>
            </div>

            {error && <div className="card mapping-shell mapping-alert">{error}</div>}
            {loading && <div className="card mapping-shell mapping-alert mapping-alert-info">Classifying accounts...</div>}

            {!loading && accounts.length > 0 && (
                <div className="card-mapping-body mapping-shell mapping-body">
                    <h2 className="title">Confirm Account Categories</h2>
                    <p className="mapping-note">
                        Review each account's suggested category. Unclassified accounts must be resolved before saving.
                    </p>

                    {unresolvedCount > 0 ? (
                        <div className="review-counter">
                            {unresolvedCount} account{unresolvedCount > 1 ? 's' : ''} still need{unresolvedCount === 1 ? 's' : ''} a category
                        </div>
                    ) : unusualCount > 0 ? (
                        <div className="review-counter review-counter-done">
                            All accounts have suggested categories. Review the flagged items before saving.
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
                                    
                                    const currentSelectValue = acc.category_mode === 'custom' 
                                        ? CUSTOM_CATEGORY_VALUE 
                                        : (acc.suggested_category === 'unknown' ? '' : acc.suggested_category)

                                    return (
                                        <tr key={acc.account_name} className={unresolved ? 'row-needs-review' : ''}>
                                            <td>
                                                {acc.account_name.includes(':') ? (
                                                    <span className="original-col account-hierarchy">
                                                        <span className="account-parent">{acc.account_name.split(':')[0]}</span>
                                                        <span className="account-child">{acc.account_name.split(':').slice(1).join(':')}</span>
                                                    </span>
                                                ) : (
                                                    <span className="original-col">{acc.account_name}</span>
                                                )}
                                            </td>
                                            <td>{Number(acc.total_debit || 0).toLocaleString()}</td>
                                            <td>{Number(acc.total_credit || 0).toLocaleString()}</td>
                                            <td>
                                                <div className="mapping-choice-stack">
                                                    <select
                                                        className="mapping-select select-text"
                                                        value={currentSelectValue}
                                                        onChange={(e) => handleCategoryChange(acc.account_name, e.target.value)}
                                                    >
                                                        <option value="">-- Select category --</option>
                                                        {categories.map(cat => (
                                                            <option key={cat} value={cat}>{cat}</option>
                                                        ))}
                                                        <option value={CUSTOM_CATEGORY_VALUE}>Other / Custom</option>
                                                    </select>
                                                    
                                                    {acc.category_mode === 'custom' && (
                                                        <div className="mapping-custom-wrap">
                                                            <input
                                                                className="mapping-custom-input"
                                                                type="text"
                                                                value={acc.custom_category || ''}
                                                                onChange={(e) => handleCustomCategoryChange(acc.account_name, e.target.value)}
                                                                placeholder="Type custom category..."
                                                            />
                                                            {acc.original_suggested_category && (
                                                                <span className="mapping-custom-hint">
                                                                    Previously suggested: {acc.original_suggested_category}
                                                                </span>
                                                            )}
                                                            <span className="mapping-custom-hint">Enter the category you need.</span>
                                                        </div>
                                                    )}
                                                </div>
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

                    <div className="mapping-footer-actions">
                        {!saved ? (
                            <button className="btn" onClick={handleSave} disabled={saving || unresolvedCount > 0}>
                                {saving ? 'Saving...' : 'Confirm & Save Account Mapping'}
                            </button>
                        ) : (
                            <div className="mapping-save-stack">
                                <div className="success">Account mapping saved successfully!</div>
                                <button
                                    className="btn btn-secondary"
                                    onClick={async () => {
                                        try {
                                            const formData = new FormData()
                                            formData.append('file_id', fileId)
                                            formData.append('client_id', clientId)
                                            formData.append('file_type', effectiveFileType)
                                            formData.append('step', 'account_mapping')
                                            formData.append('next_stage', 'financial_analysis')
                                            await completeWorkflowStep(formData)
                                        } catch (err) {
                                            console.error('Failed to mark workflow step complete:', err)
                                        }
                                        navigate('/financial-statements', {
                                            state: { cleanResult: effectiveCleanResult, clientId, uploadResult, fileType: effectiveFileType }
                                        })
                                    }}
                                >
                                    Proceed to Financial Statements 
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

export default AccountMappingPage