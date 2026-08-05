import { useLocation, useNavigate } from 'react-router-dom'
import '../styles/UploadPage.css'
import '../styles/CleanPage.css'

import { useState } from 'react'
// import { useLocation, useNavigate } from 'react-router-dom'
import axios from 'axios'
// import '../styles/CleanPage.css'
// import '../styles/AnalysisPage.css'

const API_BASE = 'http://localhost:8000'

const formatAmount = (value) =>
    Number(value || 0).toLocaleString()

const formatPercent = (value) =>
    value === null || value === undefined ? 'N/A' : `${Number(value).toLocaleString()}%`

const formatRatio = (value) =>
    value === null || value === undefined ? 'N/A' : Number(value).toLocaleString()

const formatSignedPercent = (value) => {
    if (value === null || value === undefined) return 'N/A'
    const number = Number(value)
    return `${number > 0 ? '+' : ''}${number.toLocaleString()}%`
}

function AnalysisPage() {
    const location = useLocation()
    const navigate = useNavigate()
    const { cleanResult, clientId, uploadResult } = location.state || {}

    const [analyzing, setAnalyzing] = useState(false)
    const [analysisResult, setAnalysisResult] = useState(null)
    const [generatingInsights, setGeneratingInsights] = useState(false)
    const [insights, setInsights] = useState(null)
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
    const fileType = cleanResult.file_type || 'general'

    const handleRunAnalysis = async () => {
        setAnalyzing(true)
        setError(null)
        try {
            const formData = new FormData()
            formData.append('file_id', fileId)
            formData.append('file_type', fileType)
            const response = await axios.post(`${API_BASE}/analyze/${clientId}`, formData)
            setAnalysisResult(response.data)
        } catch (err) {
            setError(err.response?.data?.detail || 'Analysis failed. Please try again.')
        } finally {
            setAnalyzing(false)
        }
    }

    const handleGenerateInsights = async () => {
        setGeneratingInsights(true)
        setError(null)
        try {
            const formData = new FormData()
            formData.append('file_id', fileId)
            formData.append('file_type', fileType)
            const response = await axios.post(`${API_BASE}/analyze/${clientId}/insights`, formData)
            setInsights(response.data.ai_insights || [])
        } catch (err) {
            setError(err.response?.data?.detail || 'Could not generate insights. Please try again.')
        } finally {
            setGeneratingInsights(false)
        }
    }

    const scopeLabel = (scope) => {
        switch (scope) {
            case 'financial_statements': return { text: 'Statement-aware analysis from classified accounts', className: 'scope-full' }
            case 'full': return { text: 'Full financial analysis available', className: 'scope-full' }
            case 'partial': return { text: 'Partial analysis ΓÇö some data types missing', className: 'scope-partial' }
            case 'undetermined': return { text: 'Not enough numeric/date data for financial analysis', className: 'scope-undetermined' }
            default: return { text: scope, className: '' }
        }
    }

    const severityClass = (severity) => {
        switch (severity) {
            case 'high': return 'insight-high'
            case 'medium': return 'insight-medium'
            case 'info': return 'insight-info'
            default: return 'insight-medium'
        }
    }

    // Format a breakdown key like "amount_usd_by_department" into a readable title
    const formatBreakdownTitle = (key) => {
        return key
            .replace(/_/g, ' ')
            .replace(/\bby\b/, 'ΓÇö')
            .replace(/\b\w/g, c => c.toUpperCase())
    }

    return (
        <div className="page">

            <div className="header">
                <h1 className="logo">Audit AI</h1>
                <p className="subtitle">AI Financial Intelligence System</p>
            </div>

            <div className="card">
                <h2 className="title">Financial Analysis Engine</h2>
                <div className="info-row">
                    <span className="info-label">File:</span>
                    <span>{uploadResult.filename}</span>
                </div>
                <div className="info-row">
                    <span className="info-label">Client:</span>
                    <span>{clientId}</span>
                </div>

                {error && <div className="error">{error}</div>}

                {!analysisResult ? (
                    <button className="btn" onClick={handleRunAnalysis} disabled={analyzing}>
                        {analyzing ? 'Analyzing...' : 'Run Financial Analysis'}
                    </button>
                ) : (
                    <div className="clean-complete">Analysis Complete</div>
                )}
            </div>

            {analysisResult && (
                <>
                    {/* Analysis scope banner */}
                    <div className={`card scope-banner ${scopeLabel(analysisResult.analysis_scope).className}`}>
                        {scopeLabel(analysisResult.analysis_scope).text}
                    </div>

                    {analysisResult.financial_analytics && (
                        <>
                            <div className="card">
                                <h2 className="title">Statement Analytics</h2>
                                <div className="ratio-grid">
                                    <div className="ratio-tile">
                                        <span className="ratio-label">Revenue</span>
                                        <strong>{formatAmount(analysisResult.financial_analytics.profit_loss.total_revenue)}</strong>
                                    </div>
                                    <div className="ratio-tile">
                                        <span className="ratio-label">Net {analysisResult.financial_analytics.profit_loss.status}</span>
                                        <strong>{formatAmount(Math.abs(analysisResult.financial_analytics.profit_loss.net_profit))}</strong>
                                    </div>
                                    <div className="ratio-tile">
                                        <span className="ratio-label">Working Capital</span>
                                        <strong>{formatAmount(analysisResult.financial_analytics.balance_sheet_summary.working_capital)}</strong>
                                    </div>
                                </div>
                            </div>

                            <div className="card">
                                <h2 className="title">Key Ratios</h2>
                                <div className="ratio-grid">
                                    <div className="ratio-tile">
                                        <span className="ratio-label">Current Ratio</span>
                                        <strong>{formatRatio(analysisResult.financial_analytics.ratios.current_ratio)}</strong>
                                    </div>
                                    <div className="ratio-tile">
                                        <span className="ratio-label">Debt Ratio</span>
                                        <strong>{formatPercent(analysisResult.financial_analytics.ratios.debt_ratio)}</strong>
                                    </div>
                                    <div className="ratio-tile">
                                        <span className="ratio-label">Gross Margin</span>
                                        <strong>{formatPercent(analysisResult.financial_analytics.ratios.gross_margin)}</strong>
                                    </div>
                                    <div className="ratio-tile">
                                        <span className="ratio-label">Operating Margin</span>
                                        <strong>{formatPercent(analysisResult.financial_analytics.ratios.operating_margin)}</strong>
                                    </div>
                                    <div className="ratio-tile">
                                        <span className="ratio-label">Net Margin</span>
                                        <strong>{formatPercent(analysisResult.financial_analytics.ratios.net_margin)}</strong>
                                    </div>
                                    <div className="ratio-tile">
                                        <span className="ratio-label">Debt to Equity</span>
                                        <strong>{formatRatio(analysisResult.financial_analytics.ratios.debt_to_equity)}</strong>
                                    </div>
                                </div>
                            </div>

                            {analysisResult.comparative_analytics && (
                                <div className="card">
                                    <h2 className="title">Comparative Analytics</h2>
                                    {analysisResult.comparative_analytics.available ? (
                                        <>
                                            {analysisResult.comparative_analytics.latest_period_comparison && (
                                                <div className="ratio-grid">
                                                    <div className="ratio-tile">
                                                        <span className="ratio-label">Revenue Change</span>
                                                        <strong>{formatSignedPercent(analysisResult.comparative_analytics.latest_period_comparison.revenue_change_pct)}</strong>
                                                    </div>
                                                    <div className="ratio-tile">
                                                        <span className="ratio-label">Expense Change</span>
                                                        <strong>{formatSignedPercent(analysisResult.comparative_analytics.latest_period_comparison.expense_change_pct)}</strong>
                                                    </div>
                                                    <div className="ratio-tile">
                                                        <span className="ratio-label">Net Profit Change</span>
                                                        <strong>{formatSignedPercent(analysisResult.comparative_analytics.latest_period_comparison.net_profit_change_pct)}</strong>
                                                    </div>
                                                </div>
                                            )}

                                            <h3 className="breakdown-title" style={{ marginTop: '20px' }}>Period Summary</h3>
                                            <div className="table-wrapper">
                                                <table>
                                                    <thead>
                                                        <tr><th>Period</th><th>Revenue</th><th>Expenses</th><th>Net Profit</th><th>Gross Margin</th><th>Net Margin</th></tr>
                                                    </thead>
                                                    <tbody>
                                                        {analysisResult.comparative_analytics.period_summaries.map((period) => (
                                                            <tr key={period.period}>
                                                                <td>{period.period}</td>
                                                                <td>{formatAmount(period.total_revenue)}</td>
                                                                <td>{formatAmount(period.total_expenses)}</td>
                                                                <td>{formatAmount(period.net_profit)}</td>
                                                                <td>{formatPercent(period.gross_margin)}</td>
                                                                <td>{formatPercent(period.net_margin)}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="scope-banner scope-partial">
                                            {analysisResult.comparative_analytics.reason || 'Comparison needs at least two usable periods.'}
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="card">
                                <h2 className="title">Expense Breakdown</h2>
                                <div className="table-wrapper">
                                    <table>
                                        <thead>
                                            <tr><th>Category</th><th>Amount</th><th>Percentage</th></tr>
                                        </thead>
                                        <tbody>
                                            {Object.entries(analysisResult.financial_analytics.expense_breakdown.by_category || {})
                                                .sort((a, b) => b[1].amount - a[1].amount)
                                                .map(([category, data]) => (
                                                    <tr key={category}>
                                                        <td>{category}</td>
                                                        <td>{formatAmount(data.amount)}</td>
                                                        <td>{formatPercent(data.percentage)}</td>
                                                    </tr>
                                                ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {Object.keys(analysisResult.financial_analytics.revenue_breakdown.by_category || {}).length > 0 && (
                                <div className="card">
                                    <h2 className="title">Revenue Breakdown</h2>
                                    <div className="table-wrapper">
                                        <table>
                                            <thead>
                                                <tr><th>Category</th><th>Amount</th><th>Percentage</th></tr>
                                            </thead>
                                            <tbody>
                                                {Object.entries(analysisResult.financial_analytics.revenue_breakdown.by_category || {})
                                                    .sort((a, b) => b[1].amount - a[1].amount)
                                                    .map(([category, data]) => (
                                                        <tr key={category}>
                                                            <td>{category}</td>
                                                            <td>{formatAmount(data.amount)}</td>
                                                            <td>{formatPercent(data.percentage)}</td>
                                                        </tr>
                                                    ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {/* Breakdowns */}
                    {Object.keys(analysisResult.breakdowns || {}).length > 0 && (
                        <div className="card">
                            <h2 className="title">Breakdowns</h2>
                            {Object.entries(analysisResult.breakdowns).map(([key, data]) => (
                                <div key={key} className="breakdown-block">
                                    <h3 className="breakdown-title">{formatBreakdownTitle(key)}</h3>
                                    <div className="table-wrapper">
                                        <table>
                                            <thead>
                                                <tr><th>Category</th><th>Total</th></tr>
                                            </thead>
                                            <tbody>
                                                {Object.entries(data)
                                                    .sort((a, b) => b[1] - a[1])
                                                    .map(([label, value]) => (
                                                        <tr key={label}>
                                                            <td>{label}</td>
                                                            <td>{formatAmount(value)}</td>
                                                        </tr>
                                                    ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Monthly trend */}
                    {Object.keys(analysisResult.monthly_trend || {}).length > 0 && (
                        <div className="card">
                            <h2 className="title">Monthly Trends</h2>
                            {Object.entries(analysisResult.monthly_trend).map(([key, series]) => (
                                <div key={key} className="breakdown-block">
                                    <h3 className="breakdown-title">{formatBreakdownTitle(key)}</h3>
                                    <div className="table-wrapper">
                                        <table>
                                            <thead>
                                                <tr><th>Period</th><th>Total</th></tr>
                                            </thead>
                                            <tbody>
                                                {series.map((point) => (
                                                    <tr key={point.period}>
                                                        <td>{point.period}</td>
                                                        <td>{formatAmount(point.total)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Anomalies */}
                    {analysisResult.anomalies && analysisResult.anomalies.length > 0 && (
                        <div className="card">
                            <h2 className="title">Anomalies Detected</h2>
                            {analysisResult.anomalies.map((a, i) => (
                                <div key={i} className={`insight-row ${a.direction === 'spike' ? 'insight-high' : 'insight-medium'}`}>
                                    <p>
                                        <strong>{formatBreakdownTitle(a.field)}</strong> ΓÇö {a.period}: {a.value.toLocaleString()}
                                        {' '}({a.direction}, average {formatAmount(a.average)})
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* AI Insights */}
                    <div className="card">
                        <h2 className="title">AI Insights</h2>
                        <p className="mapping-note">
                            Generate plain-language explanations of the numbers above using AI.
                        </p>

                        {!insights ? (
                            <button
                                className="btn btn-secondary"
                                onClick={handleGenerateInsights}
                                disabled={generatingInsights}
                            >
                                {generatingInsights ? 'Generating Insights...' : 'Generate Insights'}
                            </button>
                        ) : insights.length === 0 ? (
                            <div className="all-clean">No notable insights found for this data.</div>
                        ) : (
                            <div className="insights-list">
                                {insights.map((insight, i) => (
                                    <div key={i} className={`insight-row ${severityClass(insight.severity)}`}>
                                        <span className="insight-type-badge">{insight.type?.toUpperCase()}</span>
                                        <p>{insight.message}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    )
}

export default AnalysisPage
