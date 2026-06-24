// ============================================================
// api.js — Audit AI API Connector
// This file handles ALL communication between the
// React frontend and the FastAPI backend.
// Every function here makes one API call.
// IMPORTANT: backticks (`) must be used for URLs, not quotes,
// because they let us insert variables like ${BASE_URL}
// ============================================================

// The base URL of your backend server
const BASE_URL = "http://localhost:8000";

// Gets the login token stored in the browser after login
// This token proves the user is authenticated
const getToken = () => localStorage.getItem("token");

// Builds the request headers for authenticated requests
// Every request after login needs the token in the header
const headers = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${getToken()}`,
});

// ============================================================
// API OBJECT — contains all functions grouped by feature
// Usage example: API.login({ email, password })
// ============================================================
const API = {

  // ── AUTH ────────────────────────────────────────────────
  // These functions handle login and password reset
  // They do NOT need a token (user is not logged in yet)
  // ────────────────────────────────────────────────────────

  // Login with email and password
  // Returns: { access_token, user: { user_id, full_name, email, role } }
  login: (data) =>
    fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then((r) => r.json()),

  // Request a password reset token (would be sent to email in production)
  // Returns: { token, message }
  requestPasswordReset: (email) =>
    fetch(`${BASE_URL}/auth/password-reset-request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).then((r) => r.json()),

  // Confirm password reset using the token
  // Returns: { message: "Password reset successful" }
  confirmPasswordReset: (token, new_password) =>
    fetch(`${BASE_URL}/auth/password-reset-confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, new_password }),
    }).then((r) => r.json()),

  // ── CLIENTS ─────────────────────────────────────────────
  // These functions manage audit clients
  // All require a logged-in user (token in headers)
  // ────────────────────────────────────────────────────────

  // Get all clients
  // Returns: array of client objects
  getClients: () =>
    fetch(`${BASE_URL}/clients`, { headers: headers() }).then((r) => r.json()),

  // Create a new client
  // data = { company_name, contact_person, email, phone, industry, address, status, kra_pin }
  createClient: (data) =>
    fetch(`${BASE_URL}/clients`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(data),
    }).then((r) => r.json()),

  // Update an existing client by ID
  updateClient: (id, data) =>
    fetch(`${BASE_URL}/clients/${id}`, {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify(data),
    }).then((r) => r.json()),

  // Delete a client by ID
  deleteClient: async (id) => {
    const res = await fetch(`${BASE_URL}/clients/${id}`, {
      method: "DELETE",
      headers: headers(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || data.message || 'Could not delete client');
    return data;
  },

  // ── USERS ────────────────────────────────────────────────
  // These functions manage system users
  // Roles: Admin, Senior Auditor, Auditor, Accountant
  // ────────────────────────────────────────────────────────

  // Get all users
  getUsers: () =>
    fetch(`${BASE_URL}/users`, { headers: headers() }).then((r) => r.json()),

  // Create a new user
  // data = { full_name, email, password, phone, role, assigned_client_id }
  createUser: (data) =>
    fetch(`${BASE_URL}/users`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(data),
    }).then((r) => r.json()),

  // Update an existing user by ID
  updateUser: (id, data) =>
    fetch(`${BASE_URL}/users/${id}`, {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify(data),
    }).then((r) => r.json()),

  // Delete a user by ID
  deleteUser: (id) =>
    fetch(`${BASE_URL}/users/${id}`, {
      method: "DELETE",
      headers: headers(),
    }).then((r) => r.json()),

  // Assign a user to a specific client
  assignUserToClient: (userId, clientId) =>
    fetch(`${BASE_URL}/users/${userId}/assign/${clientId}`, {
      method: "PUT",
      headers: headers(),
    }).then((r) => r.json()),

  // ── ENGAGEMENTS ──────────────────────────────────────────
  // These functions manage audit engagements
  // Each engagement belongs to one client
  // Creating an engagement auto-creates 4 audit sections:
  // Revenue, Expenses, Inventory, Cash & Bank
  // ────────────────────────────────────────────────────────

  // Get all engagements
  getEngagements: () =>
    fetch(`${BASE_URL}/engagements`, { headers: headers() }).then((r) => r.json()),

  // Create a new engagement
  // data = { client_id, engagement_name, financial_year, status, start_date, end_date }
  createEngagement: (data) =>
    fetch(`${BASE_URL}/engagements`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(data),
    }).then((r) => r.json()),

  // Update an engagement by ID
  updateEngagement: (id, data) =>
    fetch(`${BASE_URL}/engagements/${id}`, {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify(data),
    }).then((r) => r.json()),

  // Delete an engagement and all its sections and team
  deleteEngagement: (id) =>
    fetch(`${BASE_URL}/engagements/${id}`, {
      method: "DELETE",
      headers: headers(),
    }).then((r) => r.json()),

  // Get team members for a specific engagement
  getEngagementTeam: (id) =>
    fetch(`${BASE_URL}/engagements/${id}/team`, { headers: headers() }).then((r) => r.json()),

  // Add a team member to an engagement
  // data = { engagement_id, user_id, role }
  addTeamMember: (engagementId, data) =>
    fetch(`${BASE_URL}/engagements/${engagementId}/team`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(data),
    }).then((r) => r.json()),

  // Remove a team member from an engagement
  removeTeamMember: (engagementId, userId) =>
    fetch(`${BASE_URL}/engagements/${engagementId}/team/${userId}`, {
      method: "DELETE",
      headers: headers(),
    }).then((r) => r.json()),

  // Get audit sections for an engagement
  // Returns: Revenue, Expenses, Inventory, Cash & Bank sections
  getAuditSections: (engagementId) =>
    fetch(`${BASE_URL}/engagements/${engagementId}/sections`, { headers: headers() }).then((r) => r.json()),
  // Get a single engagement by ID
  getEngagement: (id) =>
    fetch(`${BASE_URL}/engagements/${id}`, { headers: headers() }).then((r) => r.json()),
  // Send completed audit report to client via email
sendToClient: (engagementId) =>
  fetch(`${BASE_URL}/engagements/${engagementId}/send-to-client`, {
    method: "POST",
    headers: headers(),
  }).then((r) => r.json()),


  // ── NOTIFICATIONS ────────────────────────────────────────
  // These functions manage in-app notifications
  // Notifications are created automatically when work
  // is submitted for review
  // ────────────────────────────────────────────────────────

  // Get all notifications for a user
  getNotifications: (userId) =>
    fetch(`${BASE_URL}/notifications/${userId}`, { headers: headers() }).then((r) => r.json()),

  // Get only unread notifications for a user
  getUnreadNotifications: (userId) =>
    fetch(`${BASE_URL}/notifications/${userId}/unread`, { headers: headers() }).then((r) => r.json()),

  // Mark a single notification as read
  markNotificationRead: (notificationId) =>
    fetch(`${BASE_URL}/notifications/${notificationId}/read`, {
      method: "PUT",
      headers: headers(),
    }).then((r) => r.json()),

  // Mark all notifications as read for a user
  markAllNotificationsRead: (userId) =>
    fetch(`${BASE_URL}/notifications/${userId}/read-all`, {
      method: "PUT",
      headers: headers(),
    }).then((r) => r.json()),

    // ── SUBMISSIONS ──────────────────────────────────────────
  // These manage the workflow handoffs between
  // Accountant → Auditor → Senior Auditor for each audit section
  // ────────────────────────────────────────────────────────

  // Get the most recent submission for a specific audit section
  getSectionLatestSubmission: (sectionId) =>
    fetch(`${BASE_URL}/audit-sections/${sectionId}/latest-submission`, { headers: headers() }).then((r) => r.json()),

// Get all submissions across every engagement
  getAllSubmissions: () =>
    fetch(`${BASE_URL}/submissions`, { headers: headers() }).then((r) => r.json()),
  
  // Create a new submission (the first time a section is forwarded)
  // data = { engagement_id, section_id, submitted_by, status, current_stage, notes }
  createSubmission: (data) =>
    fetch(`${BASE_URL}/submissions`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(data),
    }).then((r) => r.json()),

  // Update an existing submission's status/stage (every handoff after the first)
  // data = { status, current_stage, notes }
  updateSubmissionStatus: (submissionId, data) =>
    fetch(`${BASE_URL}/submissions/${submissionId}/status`, {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify(data),
    }).then((r) => r.json()),

  // ── FILES ────────────────────────────────────────────────
  // These functions handle file uploads
  // Supported formats: Excel, CSV, PDF, images, ERP exports
  // ────────────────────────────────────────────────────────

  // Get all uploaded files across all clients
  getFiles: () =>
    fetch(`${BASE_URL}/files`, { headers: headers() }).then((r) => r.json()),

  // Get files uploaded for a specific client
  getClientFiles: (clientId) =>
    fetch(`${BASE_URL}/clients/${clientId}/files`, { headers: headers() }).then((r) => r.json()),

  // Upload a file for a specific client
  // file = the actual File object from an input element
  uploadFile: (clientId, file) => {
    const form = new FormData();
    form.append("file", file);
    return fetch(`${BASE_URL}/clients/${clientId}/upload`, {
      method: "POST",
      // Note: no Content-Type header here — browser sets it automatically for FormData
      headers: { Authorization: `Bearer ${getToken()}` },
      body: form,
    }).then((r) => r.json());
  },
};

export default API;