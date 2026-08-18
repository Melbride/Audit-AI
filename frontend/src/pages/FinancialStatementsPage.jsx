import { useState, useEffect, Fragment } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { completeWorkflowStep } from '../services/api'
import '../styles/FinancialStatementsPage.css'

const API_BASE = 'http://localhost:8000'

const formatAmount = (value) => Number(value || 0).toLocaleString()

const formatRatio = (value, suffix = '') =>
    value === null || value === undefined ? 'N/A' : `${Number(value).toLocaleString()}${suffix}`

function FinancialStatementsPage() {
    const location = useLocation()
    const navigate = useNavigate()
    const { cleanResult, clientId, uploadResult, fileType, workflow } = location.state || {}

    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [statements, setStatements] = useState(null)

    const fileId = cleanResult?.file_id || uploadResult?.file_id
    const ratios = statements?.financial_ratios
    const statementApplicable = statements?.applicable !== false
    const workflowSteps = [
        { id: 'trial-balance', label: 'Trial Balance', status: 'done' },
        { id: 'mapping', label: 'Account Mapping', status: 'done' },
        { id: 'financial-statements', label: 'Financial Statements', status: 'active' },
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
                formData.append(
                    'file_type',
                    fileType || uploadResult?.file_type || 'trial_balance'
                )

                console.log('=== FINANCIAL STATEMENTS REQUEST ===')
                console.log('fileId:', fileId)
                console.log('clientId:', clientId)
                console.log('fileType:', fileType)
                console.log('uploadResult:', uploadResult)
                console.log('effective file_type:', fileType || uploadResult?.file_type || 'trial_balance')

                const response = await axios.post(`${API_BASE}/generate-financial-statements`, formData)
                setStatements(response.data.financial_statements)
            } catch (err) {
                setError(err.response?.data?.detail || 'Could not generate financial statements.')
            } finally {
                setLoading(false)
            }
        }

        load()
    }, [clientId, fileId, fileType])

    if (!cleanResult || !uploadResult) {
        return (
            <div className="page fs-page">
                <p className="error">No cleaned data found. Please go back and complete cleaning first.</p>
                <button className="btn btn-secondary" onClick={() => navigate('/')}>Go Back</button>
            </div>
        )
    }

    return (
        <div className="page fs-page">
            <div className="fs-shell">
                <div className="card-clean-body relative-card fs-hero">
                    <div className="fs-hero-top">
                        <div className="fs-hero-copy">
                            {/* <p className="fs-kicker">Audit AI workflow</p> */}
                            <h1 className="title">Financial Statements</h1>
                            <p className="fs-description">
                                This is the final checkpoint after account mapping. Review the generated statements,
                                then continue into financial analytics.
                            </p>
                        </div>
                        <div
                            className={`tb-badge ${
                                loading
                                    ? 'tb-badge-neutral'
                                    : error
                                        ? 'tb-badge-warning'
                                        : statementApplicable
                                            ? 'tb-badge-success'
                                            : 'tb-badge-warning'
                            }`}
                        >
                            {loading
                                ? 'Generating'
                                : error
                                    ? 'Action needed'
                                    : statementApplicable
                                        ? 'Ready'
                                        : 'Not available'}
                        </div>
                    </div>

                    <div className="tb-meta-grid fs-meta-grid">
                        <div className="tb-meta-item">
                            <span className="tb-meta-label">File</span>
                            <strong>{uploadResult?.filename || 'Selected TB'}</strong>
                        </div>
                        <div className="tb-meta-item">
                            <span className="tb-meta-label">Client</span>
                            <strong>{clientId || '—'}</strong>
                        </div>
                        <div className="tb-meta-item">
                            <span className="tb-meta-label">Source stage</span>
                            <strong>{workflow?.stage || 'Account Mapping'}</strong>
                        </div>
                    </div>
                </div>

                <div className="card-clean-body relative-card fs-flow-card">
                    <div className="tb-flow">
                        {workflowSteps.map((step, index) => (
                            <Fragment key={step.id}>
                                <div className={`tb-flow-step ${step.status}`}>
                                    <span className="tb-flow-number">{step.status === 'done' ? '✓' : index + 1}</span>
                                    <span className="tb-flow-label">{step.label}</span>
                                </div>
                                {index < workflowSteps.length - 1 && (
                                    <span className="tb-flow-connector" aria-hidden="true" />
                                )}
                            </Fragment>
                        ))}
                    </div>
                </div>

                {loading && (
                    <div className="card-clean-body relative-card fs-banner fs-banner-loading">
                        Generating financial statements from the mapped and cleaned TB.
                    </div>
                )}

                {error && (
                    <div className="card-clean-body relative-card fs-banner fs-banner-error">
                        {error}
                    </div>
                )}

                {statements && !loading && !error && !statementApplicable && (
                    <div className="card-clean-body relative-card fs-banner fs-banner-warning">
                        Financial statements could not be generated from the current mapping yet. Review the account
                        mapping or return to the previous step, then try again.
                    </div>
                )}

                {statements?.applicable && (
                    <>
                        {statements.unclassified_accounts?.length > 0 && (
                            <div className="card-clean-body relative-card fs-banner fs-banner-warning">
                                {statements.unclassified_accounts.length} account(s) were excluded because they are
                                still unclassified in Account Mapping:{' '}
                                {statements.unclassified_accounts.join(', ')}
                            </div>
                        )}

                        {ratios && (
                            <div className="card-clean-body relative-card">
                                <div className="fs-section-head">
                                    <h2 className="title">Financial Ratios</h2>
                                    <p className="fs-section-copy">
                                        These ratios are derived from the final classified statements.
                                    </p>
                                </div>

                                <div className="ratio-grid">
                                    <div className="ratio-tile">
                                        <span className="ratio-label">Gross Profit Margin</span>
                                        <strong>{formatRatio(ratios.gross_profit_margin, '%')}</strong>
                                    </div>
                                    <div className="ratio-tile">
                                        <span className="ratio-label">Net Profit Margin</span>
                                        <strong>{formatRatio(ratios.net_profit_margin, '%')}</strong>
                                    </div>
                                    <div className="ratio-tile">
                                        <span className="ratio-label">Debt to Equity</span>
                                        <strong>{formatRatio(ratios.debt_to_equity)}</strong>
                                    </div>
                                </div>

                                {Object.keys(ratios.expense_breakdown_pct || {}).length > 0 && (
                                    <>
                                        <h3 className="breakdown-title" style={{ marginTop: '20px' }}>Expense Breakdown</h3>
                                        <div className="table-wrapper">
                                            <table>
                                                <thead>
                                                    <tr>
                                                        <th>Category</th>
                                                        <th>Percentage of Expenses</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {Object.entries(ratios.expense_breakdown_pct).map(([category, value]) => (
                                                        <tr key={category}>
                                                            <td>{category}</td>
                                                            <td>{formatRatio(value, '%')}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </>
                                )}

                                {ratios.note && <div className="fs-inline-note">{ratios.note}</div>}
                            </div>
                        )}

                        <div className="card-clean-body relative-card">
                            <div className="fs-section-head">
                                <h2 className="title">Income Statement</h2>
                                <p className="fs-section-copy">Revenue and expense rollup from the mapped accounts.</p>
                            </div>

                            <div className="fs-two-col">
                                <div>
                                    <h3 className="breakdown-title" style={{ marginTop: 0 }}>Revenue</h3>
                                    <div className="table-wrapper">
                                        <table>
                                            <thead>
                                                <tr>
                                                    <th>Account</th>
                                                    <th>Category</th>
                                                    <th>Amount</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {statements.income_statement.revenue.map((item, i) => (
                                                    <tr key={i}>
                                                        <td>{item.account_name}</td>
                                                        <td>{item.category}</td>
                                                        <td>{formatAmount(item.amount)}</td>
                                                    </tr>
                                                ))}
                                                <tr style={{ fontWeight: 700 }}>
                                                    <td colSpan="2">Total Revenue</td>
                                                    <td>{formatAmount(statements.income_statement.total_revenue)}</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                <div>
                                    <h3 className="breakdown-title" style={{ marginTop: 0 }}>Expenses</h3>
                                    <div className="table-wrapper">
                                        <table>
                                            <thead>
                                                <tr>
                                                    <th>Account</th>
                                                    <th>Category</th>
                                                    <th>Amount</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {statements.income_statement.expenses.map((item, i) => (
                                                    <tr key={i}>
                                                        <td>{item.account_name}</td>
                                                        <td>{item.category}</td>
                                                        <td>{formatAmount(item.amount)}</td>
                                                    </tr>
                                                ))}
                                                <tr style={{ fontWeight: 700 }}>
                                                    <td colSpan="2">Total Expenses</td>
                                                    <td>{formatAmount(statements.income_statement.total_expenses)}</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>

                            <div
                                className={`fs-inline-note ${
                                    statements.income_statement.net_profit >= 0
                                        ? 'fs-inline-note-positive'
                                        : 'fs-inline-note-warning'
                                }`}
                            >
                                Net {statements.income_statement.net_profit >= 0 ? 'Profit' : 'Loss'}:{' '}
                                {formatAmount(Math.abs(statements.income_statement.net_profit))}
                            </div>
                        </div>

                        <div className="card-clean-body relative-card">
                            <div className="fs-section-head">
                                <h2 className="title">Balance Sheet</h2>
                                <p className="fs-section-copy">Assets, liabilities, and equity as classified in mapping.</p>
                            </div>

                            <h3 className="breakdown-title">Assets</h3>
                            <div className="table-wrapper">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Account</th>
                                            <th>Category</th>
                                            <th>Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {statements.balance_sheet.assets.map((item, i) => (
                                            <tr key={i}>
                                                <td>{item.account_name}</td>
                                                <td>{item.category}</td>
                                                <td>{formatAmount(item.amount)}</td>
                                            </tr>
                                        ))}
                                        <tr style={{ fontWeight: 700 }}>
                                            <td colSpan="2">Total Assets</td>
                                            <td>{formatAmount(statements.balance_sheet.total_assets)}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            <h3 className="breakdown-title" style={{ marginTop: '20px' }}>Liabilities</h3>
                            <div className="table-wrapper">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Account</th>
                                            <th>Category</th>
                                            <th>Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {statements.balance_sheet.liabilities.map((item, i) => (
                                            <tr key={i}>
                                                <td>{item.account_name}</td>
                                                <td>{item.category}</td>
                                                <td>{formatAmount(item.amount)}</td>
                                            </tr>
                                        ))}
                                        <tr style={{ fontWeight: 700 }}>
                                            <td colSpan="2">Total Liabilities</td>
                                            <td>{formatAmount(statements.balance_sheet.total_liabilities)}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            <h3 className="breakdown-title" style={{ marginTop: '20px' }}>Equity</h3>
                            <div className="table-wrapper">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Account</th>
                                            <th>Category</th>
                                            <th>Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {statements.balance_sheet.equity.map((item, i) => (
                                            <tr key={i}>
                                                <td>{item.account_name}</td>
                                                <td>{item.category}</td>
                                                <td>{formatAmount(item.amount)}</td>
                                            </tr>
                                        ))}
                                        <tr style={{ fontWeight: 700 }}>
                                            <td colSpan="2">Total Equity</td>
                                            <td>{formatAmount(statements.balance_sheet.total_equity)}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            {statements.balance_sheet.note && <div className="fs-inline-note">{statements.balance_sheet.note}</div>}
                        </div>

                        <div className="card-clean-body relative-card fs-footer">
                            <p className="fs-footer-copy">
                                This completes the Financial Statements checkpoint.
                            </p>
                            <button
                                className="btn btn-proceed"
                                onClick={async () => {
                                    try {
                                        const formData = new FormData()
                                        formData.append('file_id', cleanResult.file_id)
                                        formData.append('client_id', clientId)
                                        formData.append(
                                            'file_type',
                                            fileType || uploadResult?.file_type || 'trial_balance'
                                        )
                                        formData.append('step', 'financial_analysis')
                                        formData.append('next_stage', 'analysis')
                                        await completeWorkflowStep(formData)
                                        console.log('Workflow step completed successfully')
                                    } catch (err) {
                                        console.error('Failed to mark workflow step complete:', err)
                                    }

                                    navigate('/analysis', {
                                        state: { cleanResult, clientId, uploadResult, fileType }
                                    })
                                }}
                                disabled={!statementApplicable || loading || Boolean(error)}
                            >
                                Mark Complete & Continue 
                            </button>
                        </div>
                    </>
                )}

                {!loading && !error && statements && !statementApplicable && (
                    <div className="card-clean-body relative-card fs-footer">
                        <button
                            className="btn btn-secondary"
                            onClick={() => navigate('/mapping', {
                                state: { cleanResult, clientId, uploadResult, fileType }
                            })}
                        >
                            Back to Account Mapping
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}

export default FinancialStatementsPage