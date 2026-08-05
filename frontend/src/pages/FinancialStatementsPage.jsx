import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { completeWorkflowStep } from '../services/api'
import '../styles/CleanPage.css'
// import '../styles/AnalysisPage.css'

const API_BASE = 'http://localhost:8000'

const formatAmount = (value) =>
    Number(value || 0).toLocaleString()

const formatRatio = (value, suffix = '') =>
    value === null || value === undefined ? 'N/A' : `${Number(value).toLocaleString()}${suffix}`

function FinancialStatementsPage() {
    const location = useLocation()
    const navigate = useNavigate()
    const { cleanResult, clientId, uploadResult, fileType } = location.state || {}

    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [statements, setStatements] = useState(null)

    const fileId = cleanResult?.file_id || uploadResult?.file_id
    const ratios = statements?.financial_ratios

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
                const response = await axios.post(`${API_BASE}/generate-financial-statements`, formData)
                setStatements(response.data.financial_statements)
            } catch (err) {
                setError(err.response?.data?.detail || 'Could not generate financial statements.')
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

    return (
        <div className="page">
            <div className="header">
                <h1 className="logo">Audit AI</h1>
                <p className="subtitle">AI Financial Intelligence System</p>
            </div>

            <div className="card">
                <h2 className="title">Financial Statements</h2>
                <div className="info-row">
                    <span className="info-label">File:</span>
                    <span>{uploadResult.filename}</span>
                </div>
                <div className="info-row">
                    <span className="info-label">Client:</span>
                    <span>{clientId}</span>
                </div>

                {loading && <p className="mapping-note">Generating financial statements...</p>}
                {error && <div className="error">{error}</div>}
            </div>

            {statements?.applicable && (
                <>
                    {statements.unclassified_accounts.length > 0 && (
                        <div className="card scope-banner scope-partial">
                            {statements.unclassified_accounts.length} account(s) were excluded because
                            they have not been classified in Account Mapping yet:
                            {' '}{statements.unclassified_accounts.join(', ')}
                        </div>
                    )}

                    {ratios && (
                        <div className="card">
                            <h2 className="title">Financial Ratios</h2>
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
                                            <thead><tr><th>Category</th><th>Percentage of Expenses</th></tr></thead>
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

                            {ratios.note && (
                                <div className="scope-banner scope-partial" style={{ marginTop: '16px' }}>
                                    {ratios.note}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Income Statement */}
                    <div className="card">
                        <h2 className="title">Income Statement</h2>

                        <h3 className="breakdown-title">Revenue</h3>
                        <div className="table-wrapper">
                            <table>
                                <thead><tr><th>Account</th><th>Category</th><th>Amount</th></tr></thead>
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

                        <h3 className="breakdown-title" style={{ marginTop: '20px' }}>Expenses</h3>
                        <div className="table-wrapper">
                            <table>
                                <thead><tr><th>Account</th><th>Category</th><th>Amount</th></tr></thead>
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

                        <div className={`scope-banner ${statements.income_statement.net_profit >= 0 ? 'scope-full' : 'scope-undetermined'}`} style={{ marginTop: '16px' }}>
                            Net {statements.income_statement.net_profit >= 0 ? 'Profit' : 'Loss'}: {' '}
                            {formatAmount(Math.abs(statements.income_statement.net_profit))}
                        </div>
                    </div>

                    {/* Balance Sheet */}
                    <div className="card">
                        <h2 className="title">Balance Sheet</h2>

                        <h3 className="breakdown-title">Assets</h3>
                        <div className="table-wrapper">
                            <table>
                                <thead><tr><th>Account</th><th>Category</th><th>Amount</th></tr></thead>
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
                                <thead><tr><th>Account</th><th>Category</th><th>Amount</th></tr></thead>
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
                                <thead><tr><th>Account</th><th>Category</th><th>Amount</th></tr></thead>
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

                        {statements.balance_sheet.note && (
                            <div className="scope-banner scope-partial" style={{ marginTop: '16px' }}>
                                {statements.balance_sheet.note}
                            </div>
                        )}
                    </div>

                    <div className="card">
                        <button
                            className="btn btn-proceed"
                            onClick={async () => {
                                try {
                                    const formData = new FormData()
                                    formData.append('file_id', cleanResult.file_id)
                                    formData.append('client_id', clientId)
                                    formData.append('file_type', fileType || 'general')
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
                        >
                            Proceed to Financial Analytics →
                        </button>
                    </div>
                </>
            )}
        </div>
    )
}

export default FinancialStatementsPage
