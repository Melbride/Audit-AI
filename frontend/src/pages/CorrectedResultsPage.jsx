import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import axios from 'axios'
import '../styles/CorrectedResultsPage.css'

function CorrectedResultsPage() {
    const location = useLocation()
    const navigate = useNavigate()
    const { cleanResult, uploadResult, clientId, fileType } = location.state || {}

    const [currentResult, setCurrentResult] = useState(cleanResult)
    const [pendingEdits, setPendingEdits] = useState({})
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState(null)
    // Tracks which issue_id is currently being acknowledged, for a small
    // per-issue loading state without blocking the whole page.
    const [acknowledging, setAcknowledging] = useState(null)
    // Tracks which row to scroll/highlight when "Edit this cell" is clicked
    const [highlightedRowIndex, setHighlightedRowIndex] = useState(null)

    if (!cleanResult || !uploadResult) {
        return (
            <div className="cr-page-wrapper">
                <div className="cr-error-box">
                    <p>No results found. Please go back and run cleaning first.</p>
                    <button className="cr-btn" onClick={() => navigate('/')}>Go Back</button>
                </div>
            </div>
        )
    }

    const report = currentResult.validation_report
    const allRows = currentResult.cleaned_data || []
    const columns = allRows.length > 0 ? Object.keys(allRows[0]) : []
    const flaggedRowIndices = new Set(report.issues.filter(i => i.row_index !== 'N/A' && i.row_index !== null).map(i => parseInt(i.row_index)))
    const flaggedRowsData = allRows.map((row, rowIndex) => ({ row, rowIndex })).filter(({ rowIndex }) => flaggedRowIndices.has(rowIndex))
    const editCount = Object.keys(pendingEdits).length

    const handleCellEdit = (rowIndex, col, originalValue, newValue) => {
        const key = `${rowIndex}__${col}`
        setPendingEdits(prev => ({ ...prev, [key]: { row_index: rowIndex, column: col, original_value: originalValue, corrected_value: newValue } }))
    }

    const handleSaveCorrections = async () => {
        const corrections = Object.values(pendingEdits)
        if (corrections.length === 0) { setError('No changes made yet.'); return; }
        setSaving(true); setError(null);
        try {
            const formData = new FormData()
            formData.append('file_id', uploadResult.file_id); formData.append('client_id', String(clientId));
            formData.append('file_type', fileType || 'general'); formData.append('corrections', JSON.stringify(corrections));
            formData.append('corrected_by', 'Auditor');
            const response = await axios.post('http://localhost:8000/clean/submit-inline-corrections', formData )
            setCurrentResult(response.data); setPendingEdits({});
        } catch (err) { setError(err.response?.data?.detail || 'Could not save corrections.'); } finally { setSaving(false); }
    }

    // "Correct as-is" — auditor reviewed an info-severity issue (e.g. an
    // ambiguous date) and confirmed the system's guess is right. Calls the
    // existing acknowledge-issue endpoint, which records who confirmed it
    // and re-cleans with that issue filtered out. The cell value itself is
    // left untouched — this is a deliberate, logged decision, not a silent
    // dismissal, and it's required before Proceed will unlock (can_proceed
    // counts every severity, info included).
    const handleConfirmCorrect = async (issue) => {
        setAcknowledging(issue.issue_id)
        setError(null)
        try {
            const formData = new FormData()
            formData.append('file_id', uploadResult.file_id)
            formData.append('client_id', String(clientId))
            formData.append('file_type', fileType || 'general')
            formData.append('issue', JSON.stringify(issue))
            formData.append('acknowledged_by', 'Auditor')
            const response = await axios.post('http://localhost:8000/clean/acknowledge-issue', formData)
            setCurrentResult(response.data)
        } catch (err) {
            setError(err.response?.data?.detail || 'Could not confirm this issue. Please try again.')
        } finally {
            setAcknowledging(null)
        }
    }

    // "Edit this cell" — no backend call. Scrolls the matching row into view
    // in the table below and briefly highlights it, so the auditor lands
    // exactly where they need to type the correct value. Editing and saving
    // clears the issue naturally on the next clean cycle, since the
    // ambiguous/incorrect value is gone.
    const handleEditThisCell = (issue) => {
        const rowIndex = parseInt(issue.row_index)
        if (isNaN(rowIndex)) return
        setHighlightedRowIndex(rowIndex)
        const rowEl = document.getElementById(`cr-row-${rowIndex}`)
        if (rowEl) rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setTimeout(() => setHighlightedRowIndex(null), 3000)
    }

    const severityClass = (severity) => {
        switch (severity?.toLowerCase()) { 
            case 'high': return 'cr-issue-high'; 
            case 'medium': return 'cr-issue-medium'; 
            case 'info': return 'cr-issue-info'; 
            default: return 'cr-issue-medium'; 
        }
    }

    return (
        <div className="cr-page-wrapper">
            <div className="cr-header-section">
                <button className="cr-btn-back-only" onClick={() => navigate(-1)}>Back to Cleaning</button>
                <div className="cr-title-group">
                    <h1 className="cr-main-logo">Audit AI</h1>
                    <p className="cr-main-subtitle">AI Financial Intelligence System</p>
                </div>
            </div>

            <div className="cr-main-card">
                <h2 className="cr-section-title">Updated Validation Report</h2>
                <div className="cr-stats-container">
                    <div className="cr-stat-box"><span className="cr-stat-num">{report.total_rows}</span><span className="cr-stat-text">Total Rows</span></div>
                    <div className="cr-stat-box"><span className="cr-stat-num">{report.clean_rows}</span><span className="cr-stat-text">Clean Rows</span></div>
                    <div className="cr-stat-box"><span className="cr-stat-num">{report.flagged_rows}</span><span className="cr-stat-text">Flagged Rows</span></div>
                    <div className="cr-stat-box"><span className="cr-stat-num">{report.high_issues}</span><span className="cr-stat-text">High Issues</span></div>
                    <div className="cr-stat-box"><span className="cr-stat-num">{report.medium_issues}</span><span className="cr-stat-text">Medium Issues</span></div>
                </div>

                {report.issues.length > 0 ? (
                    <div className="cr-issues-wrapper">
                        <h3 className="cr-sub-title">Remaining Issues</h3>
                        <div className="cr-issues-scroll-box">
                            {report.issues.map((issue, i) => (
                                <div key={i} className={`cr-issue-item ${severityClass(issue.severity)}`}>
                                    <div className="cr-issue-header">
                                        <span className="cr-severity-tag">{issue.severity?.toUpperCase()}</span>
                                        <span className="cr-location-tag">Row {issue.row} — {issue.column}</span>
                                    </div>
                                    <p className="cr-issue-desc">{issue.issue}</p>

                                    {/*
                                      Info-severity issues (currently: ambiguous-date warnings)
                                      get a real decision instead of being silently exempt.
                                      "Correct as-is" confirms the system's guess via
                                      acknowledge-issue. "Edit this cell" jumps to the row in
                                      the table below. Either path is required to clear the
                                      issue — can_proceed counts info issues just like high/medium.
                                    */}
                                    {issue.severity === 'info' && issue.row_index !== 'N/A' && (
                                        <div className="cr-issue-actions">
                                            <button
                                                className="cr-btn cr-btn-small"
                                                disabled={acknowledging === issue.issue_id}
                                                onClick={() => handleConfirmCorrect(issue)}
                                            >
                                                {acknowledging === issue.issue_id ? 'Confirming...' : '✓ Correct as-is'}
                                            </button>
                                            <button
                                                className="cr-btn cr-btn-small cr-btn-secondary"
                                                disabled={acknowledging === issue.issue_id}
                                                onClick={() => handleEditThisCell(issue)}
                                            >
                                                ✎ Edit this cell
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="cr-clean-banner">✔ No issues remaining — data is clean and ready.</div>
                )}
            </div>

            <div className="cr-main-card">
                <h2 className="cr-section-title">Correct Remaining Issues</h2>
                <p className="cr-hint-text">Showing {flaggedRowsData.length} flagged rows. Click any cell to edit directly.</p>

                {editCount > 0 && <div className="cr-edit-indicator">✏ {editCount} unsaved edits — click Save to apply</div>}
                {error && <div className="cr-error-banner">⚠ {error}</div>}

                <div className="cr-table-overflow">
                    <table className="cr-data-table">
                        <thead><tr><th>#</th>{columns.map(col => <th key={col}>{col}</th>)}</tr></thead>
                        <tbody>
                            {flaggedRowsData.map(({ row, rowIndex }) => (
                                <tr
                                    key={rowIndex}
                                    id={`cr-row-${rowIndex}`}
                                    className={`cr-row-is-flagged${highlightedRowIndex === rowIndex ? ' cr-row-highlighted' : ''}`}
                                >
                                    <td className="cr-row-idx">{rowIndex + 2}</td>
                                    {columns.map(col => {
                                        const editKey = `${rowIndex}__${col}`;
                                        const isEdited = !!pendingEdits[editKey];
                                        return (
                                            <td key={col} className={isEdited ? 'cr-cell-is-edited' : ''} contentEditable suppressContentEditableWarning onBlur={(e) => {
                                                const newValue = e.target.innerText.trim();
                                                if (newValue !== String(row[col] ?? '')) handleCellEdit(rowIndex, col, row[col] ?? '', newValue);
                                            }}>{isEdited ? pendingEdits[editKey].corrected_value : (row[col] ?? '')}</td>
                                        )
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="cr-action-footer">
                    <div className="cr-footer-left-group">
                        <button className="cr-action-btn cr-btn-save-data" onClick={handleSaveCorrections} disabled={saving || editCount === 0}>
                            {saving ? 'Saving...' : `Save Corrections (${editCount})`}
                        </button>
                        {/*
                          can_proceed now counts ALL severities (high, medium, info) — so this
                          warning stays visible, and Proceed stays locked, until every info-level
                          issue has been explicitly confirmed or edited, not just skipped.
                        */}
                        {!currentResult.can_proceed ? (
                            <span className="cr-warn-text">⚠ Resolve remaining issues ({report.issues.length} remaining)</span>
                        ) : (
                            <span className="cr-success-text">✔ Data is ready for analysis.</span>
                        )}
                    </div>
                    <button className={`cr-action-btn ${currentResult.can_proceed ? 'cr-btn-go' : 'cr-btn-locked'}`} disabled={!currentResult.can_proceed} onClick={() => navigate('/analysis', { state: { cleanResult: currentResult, clientId, uploadResult } })}>
                        Proceed to Analysis →
                    </button>
                </div>
            </div>
        </div>
    )
}

export default CorrectedResultsPage