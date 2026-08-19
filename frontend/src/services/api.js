// API Service calls for FastAPI backend

import axios from 'axios'

const API = axios.create({
    baseURL: 'http://localhost:8000',
    headers: {
        'Content-Type': 'application/json'
    }
})

// Attach auth token to every request automatically
API.interceptors.request.use((config) => {
    const token = localStorage.getItem('token')
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
})

// Authentication
// Login with email and password
// Returns: { access_token, user: { user_id, full_name, email, role } }
export const login = (data) =>
    API.post('/auth/login', data)

// Request a password reset token (sent to email in production)
// Returns: { token, message }
export const requestPasswordReset = (email) =>
    API.post('/auth/password-reset-request', { email })

// Confirm password reset using the token
// Returns: { message: "Password reset successful" }
export const confirmPasswordReset = (token, new_password) =>
    API.post('/auth/password-reset-confirm', { token, new_password })

// Get all clients
// Returns: array of client objects
export const getClients = () =>
    API.get('/clients')

// Create a new client
// data = { company_name, contact_person, email, phone, industry, address, status, kra_pin }
export const createClient = (data) =>
    API.post('/clients', data)

// Update an existing client by ID
export const updateClient = (id, data) =>
    API.put(`/clients/${id}`, data)

// Delete a client by ID
export const deleteClient = (id) =>
    API.delete(`/clients/${id}`)


// Get all users
export const getUsers = () =>
    API.get('/users')

// Create a new user
// data = { full_name, email, password, phone, role, assigned_client_id }
export const createUser = (data) =>
    API.post('/users', data)

// Update an existing user by ID
export const updateUser = (id, data) =>
    API.put(`/users/${id}`, data)

// Delete a user by ID
export const deleteUser = (id) =>
    API.delete(`/users/${id}`)

// Assign a user to a specific client
export const assignUserToClient = (userId, clientId) =>
    API.put(`/users/${userId}/assign/${clientId}`)


// Get all engagements
export const getEngagements = () =>
    API.get('/engagements')

// Get a single engagement by ID
export const getEngagement = (id) =>
    API.get(`/engagements/${id}`)

// Create a new engagement
// data = { client_id, engagement_name, financial_year, status, start_date, end_date }
export const createEngagement = (data) =>
    API.post('/engagements', data)

// Update an engagement by ID
export const updateEngagement = (id, data) =>
    API.put(`/engagements/${id}`, data)

// Delete an engagement and all its sections and team
export const deleteEngagement = (id) =>
    API.delete(`/engagements/${id}`)

// Get team members for a specific engagement
export const getEngagementTeam = (id) =>
    API.get(`/engagements/${id}/team`)

// Add a team member to an engagement
// data = { engagement_id, user_id, role }
export const addTeamMember = (engagementId, data) =>
    API.post(`/engagements/${engagementId}/team`, data)

// Remove a team member from an engagement
export const removeTeamMember = (engagementId, userId) =>
    API.delete(`/engagements/${engagementId}/team/${userId}`)

// Get audit sections for an engagement
// Returns: Revenue, Expenses, Inventory, Cash & Bank sections
export const getAuditSections = (engagementId) =>
    API.get(`/engagements/${engagementId}/sections`)

// Send completed audit report to client via email
export const sendToClient = (engagementId) =>
    API.put(`/engagements/${engagementId}/send-to-client`)

// NOTIFICATIONS: Get all notifications for a user
export const getNotifications = (userId) =>
    API.get(`/notifications/${userId}`)

// Get only unread notifications for a user
export const getUnreadNotifications = (userId) =>
    API.get(`/notifications/${userId}/unread`)

// Mark a single notification as read
export const markNotificationRead = (notificationId) =>
    API.put(`/notifications/${notificationId}/read`)

// Mark all notifications as read for a user
export const markAllNotificationsRead = (userId) =>
    API.put(`/notifications/${userId}/read-all`)

// SUBMISSIONS: Accountant → Auditor → Senior Auditor for each audit section

// Get the most recent submission for a specific audit section
export const getSectionLatestSubmission = (sectionId, fileId = null) =>
    API.get(`/audit-sections/${sectionId}/latest-submission`, fileId ? { params: { file_id: fileId } } : undefined)

// Get all submissions across every engagement
export const getAllSubmissions = () =>
    API.get('/submissions')

// Get a single submission by id
export const getSubmission = (submissionId) =>
    API.get(`/submissions/${submissionId}`)

// Get comprehensive review data for a submission
export const getSubmissionReviewData = (submissionId) =>
    API.get(`/submissions/${submissionId}/review-data`)

// Create a new submission (first time a section is forwarded)
// data = { engagement_id, section_id, submitted_by, status, current_stage, notes }
export const createSubmission = (data) =>
    API.post('/submissions', data)

// Update an existing submission's status/stage (every handoff after the first)
// data = { status, current_stage, notes }
export const updateSubmissionStatus = (submissionId, data) =>
    API.put(`/submissions/${submissionId}/status`, data)

// FILES: Get all uploaded files across all clients
export const getFiles = () =>
    API.get('/files')

// Get files uploaded for a specific client
export const getClientFiles = (clientId) =>
    API.get(`/clients/${clientId}/files`)

// Upload a file for a client
export const uploadFile = (formData) =>
    API.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    })

// Inspect Excel sheets for multi-sheet file upload
export const inspectExcelSheets = (formData) =>
    API.post('/upload/inspect-sheets', formData, { headers: { 'Content-Type': 'multipart/form-data' } })

// Get preview data for a specific Excel sheet
export const getSheetPreview = (formData) =>
    API.post('/upload/sheet-preview', formData, { headers: { 'Content-Type': 'multipart/form-data' } })

// Generate AI insights for a file
export const generateInsights = (clientId, formData) =>
    API.post(`/analyze/${clientId}/insights`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })

// Get file preview by file_id
export const getFilePreview = (fileId, clientId) =>
    API.get(`/file-preview/${fileId}`, { params: { client_id: clientId } })

// Get upload history for a client

// Submit an uploaded file for auditor review
export const submitFile = (formData) =>
    API.post('/upload/submit', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    })

export const getUploads = (clientId) =>
    API.get(`/uploads/${clientId}`)

// EXCEL PROCESSING: Upload → Detect Columns → Map → Clean → Correct
// Detect columns for an uploaded file
export const detectColumns = (formData) =>
    API.post('/detect-columns', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    })

// Save confirmed column mapping for a client
export const saveMapping = (formData) =>
    API.post('/save-mapping', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    })

// Get saved mapping for a client
export const getMapping = (clientId, fileType = 'general') =>
    API.get(`/get-mapping/${clientId}`, { params: { file_type: fileType } })

// Clean an uploaded file using confirmed mapping
export const cleanFile = (formData) =>
    API.post('/clean', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    })

// Acknowledge a flagged issue as correct as-is
export const acknowledgeIssue = (formData) =>
    API.post('/clean/acknowledge-issue', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    })

// Submit inline corrections made directly on the cleaning results screen
export const submitInlineCorrections = (formData) =>
    API.post('/clean/submit-inline-corrections', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    })

// Standardize a value
export const standardizeValue = (formData) =>
    API.post('/clean/standardize-value', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    })

// Download a cleaned file
export const downloadCleanedFile = (fileId, clientId, fileType) =>
    `${API.defaults.baseURL}/cleaned-files/${fileId}/download?client_id=${encodeURIComponent(clientId)}&file_type=${encodeURIComponent(fileType)}`

// Upload a corrected Excel file (downloaded, edited, and re-uploaded by the auditor)
export const submitCorrectedExcel = (formData) =>
    API.post('/clean/submit-corrected-excel', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    })

//
// Workflow step completion
export const completeWorkflowStep = (formData) =>
    API.post('/workflow/complete-step', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    })

export const getWorkflowStage = (fileId, clientId, fileType = 'general') =>
    API.get(`/workflow/stage/${fileId}`, { params: { client_id: clientId, file_type: fileType } })

// ===============================
// REPORTS (Month 3) — versioned reports/report_versions/report_approvals
// system, served from /api/reports (see report_routes.py)
//

// Generate a new report from a cleaned file (creates the report + version 1)
// data = { client_id, file_id, file_type, report_type, year, month, start_date, end_date, commentary, generated_by }
export const generateReport = (data) =>
    API.post('/api/reports/generate', data)

// List reports, optionally filtered to one client
export const getReports = (clientId) =>
    API.get('/api/reports', clientId ? { params: { client_id: clientId } } : undefined)

// Fetch a report's current version, edit history, and full detail
export const getReport = (reportId) =>
    API.get(`/api/reports/${reportId}`)

// data = { commentary, edited_by }
export const updateReportCommentary = (reportId, data) =>
    API.patch(`/api/reports/${reportId}/commentary`, data)

// data = { insights: [{ id, severity, text }], edited_by }
export const updateReportInsights = (reportId, data) =>
    API.patch(`/api/reports/${reportId}/insights`, data)

// Approve the current version. Restricted to Engagement Partner (backend-enforced).
// data = { notes }
export const approveReport = (reportId, data) =>
    API.post(`/api/reports/${reportId}/approve`, data)

// Send the current version back for revision. Restricted to Engagement Partner.
// data = { notes }
export const requestReportChanges = (reportId, data) =>
    API.post(`/api/reports/${reportId}/request-changes`, data)

// Generate an export file (pdf | excel | csv) of the report's current version
export const exportReport = (reportId, format, exportedBy) =>
    API.post(`/api/reports/${reportId}/export`, { format, exported_by: exportedBy })
// List every export previously generated for a report
export const getReportExports = (reportId) =>
    API.get(`/api/reports/${reportId}/exports`)

// Build the direct download URL for a previously generated export
export const getExportDownloadUrl = (exportId) =>
    `${API.defaults.baseURL}/api/reports/exports/${exportId}/download`

//
// LOGIN MANAGEMENT
//

// Get login history for a user
export const getUserLoginHistory = (userId) =>
    API.get(`/users/${userId}/login-history`);

// Reset a user's password
export const resetUserPassword = (userId, newPassword) =>
    API.put(`/users/${userId}/reset-password`, {
        new_password: newPassword,
    });

// Lock or unlock a user's account
export const setUserLoginLock = (userId, locked) =>
    API.put(`/users/${userId}/login-lock`, {
        locked,
    });
//
// SECTION MILESTONES (preset checkpoints: Planning, Fieldwork, Testing, Wrap-up)
//
export const getSectionMilestones = (sectionId) =>
    API.get(`/audit-sections/${sectionId}/milestones`)

// data = { status, due_date, notes, updated_by }
export const updateMilestone = (milestoneId, data) =>
    API.put(`/milestones/${milestoneId}`, data)

//
// SECTION REVIEWS (issues / highlights / redo requests, logged per section)
//
export const getSectionReviews = (sectionId, status) =>
    API.get(`/audit-sections/${sectionId}/reviews`, status ? { params: { status } } : undefined)

// data = { review_type, notes, due_date, raised_by }
export const createReview = (sectionId, data) =>
    API.post(`/audit-sections/${sectionId}/reviews`, data)

// data = { notes, due_date, status, resolved_by }
export const updateReview = (reviewId, data) =>
    API.put(`/reviews/${reviewId}`, data)

export const deleteReview = (reviewId) =>
    API.delete(`/reviews/${reviewId}`)

//
// FINANCIAL STATEMENT STARTER TEMPLATE
//
// Downloads a multi-sheet Excel workbook (Trial Balance + Balance Sheet +
// Income Statement + Cash Flow Statement) for this engagement. Triggers a
// browser download rather than returning JSON.
export const downloadStatementTemplate = async (engagementId, engagementName = "engagement") => {
    const res = await API.get(`/api/engagements/${engagementId}/statement-template`, {
        responseType: "blob",
    })
    const url = window.URL.createObjectURL(new Blob([res.data]))
    const link = document.createElement("a")
    link.href = url
    link.setAttribute("download", `financial_statements_template_${engagementName}.xlsx`)
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
}

// ===============================
// FINANCIAL ANALYSIS
// ===============================

// Run financial analysis on a cleaned file
export const analyzeFinancials = (clientId, fileId, fileType) => {
    const formData = new FormData();
    formData.append('file_id', fileId);
    formData.append('file_type', fileType);
    return API.post(`/analyze/${clientId}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
}

// Generate AI insights for financial analysis
export const analyzeInsights = (clientId, fileId, fileType) => {
    const formData = new FormData();
    formData.append('file_id', fileId);
    formData.append('file_type', fileType);
    return API.post(`/analyze/${clientId}/insights`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
}

// ===============================
// SAVED ANALYSES
// ===============================

// Save a financial analysis result
export const saveAnalysis = (data) =>
    API.post('/saved-analyses', data, {
        headers: { 'Content-Type': 'multipart/form-data' }
    })

// Get all saved analyses for a user
export const getSavedAnalyses = (userId) =>
    API.get(`/saved-analyses/${userId}`)

// Get all saved analyses for an engagement (team-scoped, not just the
// current user's own saves) — every snapshot saved by anyone for this
// engagement, most recent first per file. Use to build a per-file history
// with attribution (who saved it, when).
export const getSavedAnalysesForEngagement = (engagementId) =>
    API.get(`/engagements/${engagementId}/saved-analyses`)

// Get saved analyses for a specific file within an engagement — this is
// what an auditor needs when working on a particular file. Returns all
// analysis snapshots for that specific file, with attribution.
export const getSavedAnalysesForFile = (engagementId, fileId) =>
    API.get(`/engagements/${engagementId}/saved-analyses/${fileId}`)

// Get a specific saved analysis
export const getSavedAnalysis = (analysisId) =>
    API.get(`/saved-analyses/${analysisId}/view`)

// Delete a saved analysis
export const deleteSavedAnalysis = (analysisId) =>
    API.delete(`/saved-analyses/${analysisId}`)

// ===============================
// AUDITOR WORKSPACES
// ===============================

// Open or auto-create an auditor workspace
export const openWorkspace = (data) =>
    API.post('/workspaces/open', data)

// Get a workspace by ID
export const getWorkspace = (workspaceId) =>
    API.get(`/workspaces/${workspaceId}`)

// Get all workspaces belonging to a specific user, across all engagements
export const getUserWorkspaces = (userId) =>
    API.get(`/users/${userId}/workspaces`)

// Update workspace (status, notes, progress_data, file_id)
export const updateWorkspace = (workspaceId, data) =>
    API.put(`/workspaces/${workspaceId}`, data)

// Submit workspace for review
export const submitWorkspaceForReview = (workspaceId, data) =>
    API.post(`/workspaces/${workspaceId}/submit-for-review`, data)

// Get all workspaces for an engagement
export const getEngagementWorkspaces = (engagementId) =>
    API.get(`/engagements/${engagementId}/workspaces`)
export const getEngagementFinalAnalysis = (engagementId) =>
    API.get(`/engagements/${engagementId}/final-analysis`)
export const saveEngagementFinalAnalysis = (engagementId, data) =>
    API.post(`/engagements/${engagementId}/final-analysis/save`, data)
// Move a draft report into the approval chain (draft -> pending_audit_manager)
export const submitReportForApproval = (reportId) =>
    API.post(`/api/reports/${reportId}/submit-for-approval`)



export default API


