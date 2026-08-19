import { useState, useRef, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { cleanFile, submitCorrectedExcel, getFilePreview } from '../services/api'
import '../styles/UploadPage.css'
import '../styles/CleanPage.css'
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// Add a loading spinner to the "Run Cleaning Engine" button
function CleanPage( ) {
    const location = useLocation()
    const navigate = useNavigate()
    const { uploadResult, clientId, fileType, cleanResult: resumedCleanResult } = location.state || {}
    
    const fileId = location.state?.fileId || localStorage.getItem('pendingFileId') || uploadResult?.file_id
    const activeClientId = clientId || location.state?.clientId || localStorage.getItem('pendingClientId')

    const [currentUpload, setCurrentUpload] = useState(uploadResult)
    const [loadingFile, setLoadingFile] = useState(false)
    const [cleaning, setCleaning] = useState(false)
    const [cleanResult, setCleanResult] = useState(resumedCleanResult || null)
    const [error, setError] = useState(null)
    const [downloaded, setDownloaded] = useState(false)
    const [showDownloadMessage, setShowDownloadMessage] = useState(false) // New state for temporary message
    const [uploadingCorrected, setUploadingCorrected] = useState(false)
    const correctedFileInputRef = useRef(null)

    // Load file metadata if coming directly from workspace or notification without full uploadResult object
    useEffect(() => {
        if (!currentUpload && fileId && activeClientId) {
            setLoadingFile(true)
            getFilePreview(fileId, activeClientId)
                .then((res) => {
                    const data = res.data || res
                    setCurrentUpload({
                        file_id: fileId,
                        filename: data.filename,
                        client_id: activeClientId
                    })
                })
                .catch((err) => console.error("Failed to load file preview for cleaning", err))
                .finally(() => setLoadingFile(false))
        }
    }, [fileId, activeClientId, currentUpload])

    // Add a loading spinner to the "Run Cleaning Engine" button
    const handleClean = async () => {
        setCleaning(true)
        setError(null)
        try {
            const formData = new FormData()
            formData.append('file_id', currentUpload.file_id)
            formData.append('client_id', clientId)
            formData.append('file_type', fileType || 'other')
            const response = await cleanFile(formData)
            setCleanResult(response.data)
        } catch (err) {
            setError(err.response?.data?.detail || 'Cleaning failed. Please try again.')
        } finally {
            setCleaning(false)
        }
    }
    // Handle downloading the cleaned Excel file
    const handleDownloadExcel = () => {
        if (!cleanResult) return
        const url = `${API_BASE}/clean/export-cleaned/${cleanResult.file_id}?client_id=${encodeURIComponent(clientId)}&file_type=${encodeURIComponent(fileType || 'other')}`
        window.open(url, '_blank')
        setDownloaded(true)
        setShowDownloadMessage(true) // Show the message
        
        // Automatically hide the message after 5 seconds
        setTimeout(() => {
            setShowDownloadMessage(false)
        }, 5000)
    }
    // Handle downloading the final cleaned file directly, no highlighting, no correction workflow
    const handleDownloadCleanedFile = () => {
        if (!cleanResult) return
        const url = `${API_BASE}/cleaned-files/${cleanResult.file_id}/download?client_id=${encodeURIComponent(clientId)}&file_type=${encodeURIComponent(fileType || 'other')}`
        window.open(url, '_blank')
    }
    // Handle uploading the corrected Excel file
    const handleUploadCorrectedFile = async (e) => {
        const selectedFile = e.target.files[0]
        if (!selectedFile || !cleanResult) return

        setUploadingCorrected(true)
        setError(null)
        try {
            const formData = new FormData()
            formData.append('file', selectedFile)
            formData.append('file_id', cleanResult.file_id)
            formData.append('client_id', clientId)
            formData.append('file_type', fileType || 'other')
            formData.append('corrected_by', 'Auditor')

            const response = await submitCorrectedExcel(formData)
            navigate('/corrected-results', {
                state: {
                    cleanResult: response.data,
                    uploadResult: currentUpload,
                    clientId,
                    fileType: fileType || 'other'
                }
            })
        } catch (err) {
            setError(err.response?.data?.detail || 'Could not process the corrected file.')
        } finally {
            setUploadingCorrected(false)
            if (correctedFileInputRef.current) {
                correctedFileInputRef.current.value = ''
            }
        }
    }
    // Reset the downloaded state when the component mounts
    const report = cleanResult?.validation_report
    const allRows = cleanResult?.cleaned_data || []
    const previewRows = allRows.slice(0, 5)
    const totalRows = allRows.length
    const flaggedRows = cleanResult ? new Set((report?.issues || []).filter(i => i.row_index !== 'N/A').map(i => Number(i.row_index))) : new Set()
    if (loadingFile) {
        return (
            <div className="page">
                <p className="loading">Loading file for data cleaning...</p>
            </div>
        )
    }

    if (!currentUpload) {
        return (
            <div className="page">
                <p className="error">No file found for cleaning. Please check your workspace or upload a file first.</p>
                <button className="btn" onClick={() => navigate('/engagements')}>Go to Engagements</button>
            </div>
        )
    }

    // Return the component
    return (
        <div className="page">
            {/* <div className="header">
                <h1 className="logo">Audit AI</h1>
                <p className="subtitle">Financial Intelligence System</p>
            </div> */}

            <div className="card relative-card">
                <div className="card-header-row">
                    <h2 className="title">Data Cleaning Engine</h2>
                    {cleanResult && <div className="clean-complete-pill">Cleaning Complete</div>}
                </div>
                
                <div className="info-row"><span className="info-label">File:</span><span>{currentUpload?.filename}</span></div>
                <div className="info-row"><span className="info-label">Client:</span><span>{clientId}</span></div>
                <div className="info-row"><span className="info-label">Rows:</span><span>{currentUpload?.rows}</span></div>
                {error && <div className="error">{error}</div>}
                {!cleanResult && (
                    <button className="btn btn-primary" onClick={handleClean} disabled={cleaning}>
                        {cleaning ? 'Cleaning...' : 'Run Cleaning Engine'}
                    </button>
                )}
            </div>

            {cleanResult && (
                <>
                    <div className="card">
                        <h2 className="title">Validation Report</h2>
                        <div className="stats-grid">
                            <div className="stat-card"><h3>{report?.total_rows}</h3><p>Total Rows</p></div>
                            <div className="stat-card"><h3>{report?.clean_rows}</h3><p>Clean Rows</p></div>
                            <div className="stat-card"><h3>{report?.flagged_rows}</h3><p>Flagged Rows</p></div>
                            <div className="stat-card"><h3>{report?.high_issues}</h3><p>High Issues</p></div>
                            <div className="stat-card"><h3>{report?.medium_issues}</h3><p>Medium Issues</p></div>
                        </div>
                        {/* Only show the issues summary when issues actually exist, otherwise show the all-clean message */}
                        {cleanResult.can_proceed ? (
                            <div className="all-clean">No issues found.</div>
                        ) : (
                            <div className="issues-summary">
                                <strong>{report.total_issues} issues found</strong> download the workbook below to see all issues highlighted and fix them in Excel, then upload the corrected file back.
                            </div>
                        )}
                    </div>

                    <div className="card">
                        <h2 className="title">Cleaned Data Preview</h2>
                        
                        {/* Only show the workbook/upload correction flow when issues remain.
                            Once can_proceed is true there's nothing left to review or fix,
                            so show the plain cleaned file download instead */}
                        <div className="correction-toolbar">
                            {!cleanResult.can_proceed ? (
                                <>
                                    <button className="btn btn-secondary" onClick={handleDownloadExcel}>
                                        Download Full Workbook
                                    </button>

                                    {downloaded && (
                                        <div className="upload-group">
                                            <button className="btn btn-inline" onClick={() => correctedFileInputRef.current?.click()} disabled={uploadingCorrected}>
                                                {uploadingCorrected ? 'Processing...' : 'Upload Corrected File'}
                                            </button>
                                            <input type="file" accept=".xlsx" ref={correctedFileInputRef} style={{ display: 'none' }} onChange={handleUploadCorrectedFile} />
                                        </div>
                                    )}
                                </>
                            ) : (
                                <button className="btn btn-secondary" onClick={handleDownloadCleanedFile}>
                                    Download Cleaned File
                                </button>
                            )}
                        </div>

                        {/* The message disappears after 5 seconds */}
                        {showDownloadMessage && (
                            <p className="status-note success">
                                Workbook downloaded.
                            </p>
                        )}

                        <p className="mapping-note">Showing first 5 of {totalRows} rows.{flaggedRows.size > 0 ? ' Rows highlighted in red have issues.' : ''}</p>

                        <div className="table-wrapper">
                            <table>
                                <thead>
                                    <tr>
                                        <th>#</th>
                                        {Object.keys(allRows[0] || {}).map(col => <th key={col}>{col}</th>)}
                                    </tr>
                                </thead>
                                <tbody>
                                    {previewRows.map((row, i) => (
                                        <tr key={i} className={flaggedRows.has(i) ? 'row-flagged' : ''}>
                                            <td>{i + 2}</td>
                                            {Object.values(row).map((val, j) => <td key={j}>{val}</td>)}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="proceed-area">
                            {/* {!cleanResult.can_proceed && (
                                <p className="status-note error">Fix all issues before proceeding to analysis.</p>
                            )} */}
                            <button
                                className="btn btn-proceed"
                                disabled={!cleanResult.can_proceed}
                                onClick={() => {
                                    const isLedgerFile = fileType === 'trial_balance' || fileType === 'general_ledger'
                                    const targetRoute = isLedgerFile ? '/trial-balance' : '/analysis'
                                    navigate(targetRoute, { state: { cleanResult, clientId, uploadResult: currentUpload, fileType } })
                                }}
                            >
                                {(fileType === 'trial_balance' || fileType === 'general_ledger')
                                    ? 'Proceed to Trial Balance Validation'
                                    : 'Proceed to Analysis'}
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}

export default CleanPage