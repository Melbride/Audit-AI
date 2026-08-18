import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getNotifications, markNotificationRead, markAllNotificationsRead, openWorkspace } from "../services/api";
import "../styles/Notifications.css";

// Notifications page: shows the current user's notifications, lets them
// mark individual notifications as read by clicking them, or mark all
// as read at once.
export default function Notifications({ user }) {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]); // list of notifications for this user
  const [loading, setLoading] = useState(true); // true while notifications are being fetched

  const handleOpenNotificationWorkspace = async (n, fileId, clientId) => {
    handleMarkRead(n);
    localStorage.setItem('pendingFileId', fileId);
    localStorage.setItem('pendingClientId', clientId);

    try {
      const res = await openWorkspace({
        user_id: user.user_id,
        file_id: fileId,
        client_id: String(clientId) // Ensure client_id is a string
      });
      const ws = res.data || res;
      if (ws && ws.workspace_id) {
        navigate(`/workspace/${ws.workspace_id}`);
        return;
      } else {
        console.error("No workspace_id in response:", ws);
        alert("Could not open workspace. Please try again.");
      }
    } catch (err) {
      console.error("Failed to open workspace:", err);
      console.error("Error details:", err.response?.data || err.message);
      alert(err.response?.data?.detail || "Could not open workspace. Please try again.");
    }
  };

  // Fetches the current user's notifications from the API
  const loadData = async () => {
    setLoading(true);
    try {
      const response = await getNotifications(user.user_id);
      const n = response.data || response;
      setNotifications(Array.isArray(n) ? n : []);
    } catch (err) {
      console.error("Failed to load notifications", err);
    }
    setLoading(false);
  };

  // Load notifications once on mount
  useEffect(() => { loadData(); }, []);

  // Marks a single notification as read 
  const handleMarkRead = async (notification) => {
    if (notification.is_read) return;
    await markNotificationRead(notification.notification_id);
    loadData();
    // Dispatch event to refresh badge in Layout
    window.dispatchEvent(new CustomEvent('notification-refresh'));
  };

  // Marks all of the user's notifications as read, then reloads the list.
  const handleMarkAllRead = async () => {
    await markAllNotificationsRead(user.user_id);
    loadData();
    // Dispatch event to refresh badge in Layout
    window.dispatchEvent(new CustomEvent('notification-refresh'));
  };

  // Parse file details from notification (use columns if available, fallback to message parsing)
  const parseNotificationDetails = (notification) => {
    // First try to use the dedicated columns
    if (notification.file_id && notification.client_id) {
      return {
        baseMessage: notification.message,
        fileId: notification.file_id,
        clientId: notification.client_id,
        engagementId: notification.engagement_id,
      };
    }
    const parts = notification.message.split('|');
    const baseMessage = parts[0];
    let fileId = null;
    let clientId = null;
    parts.forEach(part => {
      if (part.startsWith('file_id:')) fileId = part.split(':')[1];
      if (part.startsWith('client_id:')) clientId = part.split(':')[1];
    });
    return { baseMessage, fileId, clientId, engagementId: notification.engagement_id };
  };

  // Formats an ISO date string into "12 Jan 2025 · 14:30" style output
  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return (
      date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) +
      " · " +
      date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    );
  };

  // Count of unread notifications, used in the header summary text and to
  // conditionally show the "Mark all as read" button
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="notif-page">
      {/* Header: summary text + "mark all as read" action (only shown if there are unread items) */}
      <div className="notif-header">
        <div>
          <h1>Notifications</h1>
          <p>
            {unreadCount > 0
              ? `${unreadCount} new notification${unreadCount > 1 ? "s" : ""} waiting for you`
              : "You're all caught up — no new notifications"}
          </p>
        </div>
        {unreadCount > 0 && (
          <button onClick={handleMarkAllRead} className="notif-btn-mark-all">
            Mark all as read
          </button>
        )}
      </div>

      {/* Notification list: loading state, empty state, or populated list */}
      <div className="notif-card">
        {loading ? (
          <p className="notif-loading">Loading notifications...</p>
        ) : notifications.length === 0 ? (
          <p className="notif-empty">No notifications yet.</p>
        ) : (
          notifications.map((n) => {
            const { baseMessage, fileId, clientId, engagementId } = parseNotificationDetails(n);
            const isFileSubmission = n.type === 'file_submission' && fileId;
            const isSubmissionReview = n.type === 'submission_review' && engagementId;
            const isEngagementReady = n.type === 'engagement_ready' && engagementId;

            return (
            <div
              key={n.notification_id}
              className={`notif-item ${n.is_read ? "notif-item--read" : "notif-item--unread"}`}
            >
              {/* Status dot: filled for unread, muted for read */}
              <div className={`notif-dot ${n.is_read ? "notif-dot--read" : "notif-dot--unread"}`} />

              <div className="notif-body">
                <p className={`notif-message ${n.is_read ? "notif-message--read" : "notif-message--unread"}`}>
                  {baseMessage}
                </p>
                <span className="notif-timestamp">{formatDate(n.created_at)}</span>

                {/* Action buttons for file submissions */}
                {isFileSubmission && user.role === "Auditor" && (
                  <div className="notif-actions">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenNotificationWorkspace(n, fileId, clientId);
                      }}
                      className="notif-btn-proceed"
                    >
                      Open Workspace
                    </button>
                  </div>
                )}

                {isSubmissionReview && (
                  <div className="notif-actions">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMarkRead(n);
                        navigate(`/engagements/${engagementId}`);
                      }}
                      className="notif-btn-proceed"
                    >
                      Review Submission
                    </button>
                  </div>
                )}

                {isEngagementReady && (
                  <div className="notif-actions">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMarkRead(n);
                        navigate(`/engagements/${engagementId}`);
                      }}
                      className="notif-btn-proceed"
                    >
                      Review Engagement
                    </button>
                  </div>
                )}
              </div>

              {/* "New" badge only shown for unread notifications */}
              {!n.is_read && <span className="notif-badge-new">New</span>}
            </div>
          );
          })
        )}
      </div>
    </div>
  );
}