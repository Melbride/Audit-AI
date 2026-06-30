import { useState, useEffect } from "react";
import { getNotifications } from "../services/api";
import "../styles/Notifications.css";

export default function Notifications({ user }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => { loadData(); }, []);

  const handleMarkRead = async (notification) => {
    if (notification.is_read) return;
    await API.markNotificationRead(notification.notification_id);
    loadData();
  };

  const handleMarkAllRead = async () => {
    await API.markAllNotificationsRead(user.user_id);
    loadData();
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return (
      date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) +
      " · " +
      date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    );
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="notif-page">
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

      <div className="notif-card">
        {loading ? (
          <p className="notif-loading">Loading notifications...</p>
        ) : notifications.length === 0 ? (
          <p className="notif-empty">No notifications yet.</p>
        ) : (
          notifications.map((n) => (
            <div
              key={n.notification_id}
              onClick={() => handleMarkRead(n)}
              className={`notif-item ${n.is_read ? "notif-item--read" : "notif-item--unread"}`}
            >
              <div className={`notif-dot ${n.is_read ? "notif-dot--read" : "notif-dot--unread"}`} />

              <div className="notif-body">
                <p className={`notif-message ${n.is_read ? "notif-message--read" : "notif-message--unread"}`}>
                  {n.message}
                </p>
                <span className="notif-timestamp">{formatDate(n.created_at)}</span>
              </div>

              {!n.is_read && <span className="notif-badge-new">New</span>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}