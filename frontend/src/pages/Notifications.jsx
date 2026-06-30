import { useState, useEffect } from "react";
import { getNotifications } from "../services/api";
import "../styles/Notifications.css";

// Notifications page: shows the current user's notifications, lets them
// mark individual notifications as read by clicking them, or mark all
// as read at once.
export default function Notifications({ user }) {
  const [notifications, setNotifications] = useState([]); // list of notifications for this user
  const [loading, setLoading] = useState(true); // true while notifications are being fetched

  // Fetches the current user's notifications from the API
  const loadData = async () => {
    setLoading(true);
    try {
      const n = await getNotifications(user.user_id);
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
    await API.markNotificationRead(notification.notification_id);
    loadData();
  };

  // Marks all of the user's notifications as read, then reloads the list.
  const handleMarkAllRead = async () => {
    await API.markAllNotificationsRead(user.user_id);
    loadData();
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
              ? `You have ${unreadCount} unread notification${unreadCount > 1 ? "s" : ""}`
              : "You're all caught up"}
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
          notifications.map((n) => (
            // Clicking any notification marks it as read
            <div
              key={n.notification_id}
              onClick={() => handleMarkRead(n)}
              className={`notif-item ${n.is_read ? "notif-item--read" : "notif-item--unread"}`}
            >
              {/* Status dot: filled for unread, muted for read */}
              <div className={`notif-dot ${n.is_read ? "notif-dot--read" : "notif-dot--unread"}`} />

              <div className="notif-body">
                <p className={`notif-message ${n.is_read ? "notif-message--read" : "notif-message--unread"}`}>
                  {n.message}
                </p>
                <span className="notif-timestamp">{formatDate(n.created_at)}</span>
              </div>

              {/* "New" badge only shown for unread notifications */}
              {!n.is_read && <span className="notif-badge-new">New</span>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}