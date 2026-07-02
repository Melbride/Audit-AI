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
    API.post(`/engagements/${engagementId}/send-to-client`)

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
export const getSectionLatestSubmission = (sectionId) =>
    API.get(`/audit-sections/${sectionId}/latest-submission`)

// Get all submissions across every engagement
export const getAllSubmissions = () =>
    API.get('/submissions')

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

// Get upload history for a client
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

// Upload a corrected Excel file (downloaded, edited, and re-uploaded by the auditor)
export const submitCorrectedExcel = (formData) =>
    API.post('/clean/submit-corrected-excel', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    })

export default API
