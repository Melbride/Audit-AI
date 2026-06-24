import { useState, useEffect } from "react";
import API from "../api";


// Notifications.jsx — Audit AI Notifications Page
//
// What this page does:
// - Shows ALL notifications for the logged-in user
// - Unread notifications are highlighted with a blue dot + light background
// - Clicking a notification marks it as read
// - "Mark all as read" button clears all unread badges at once
//
// Uses the SAME sidebar layout as Dashboard/Clients/Users/Engagements
// so navigation is always visible no matter which page is open.


// Color theme — same colors used across the whole app
const colors = {
  primary:    "#1E3A5F",
  secondary:  "#2E86C1",
  accent:     "#3498DB",
  background: "#F4F6F9",
  white:      "#FFFFFF",
  text:       "#2C3E50",
  success:    "#27AE60",
  warning:    "#F39C12",
  danger:     "#E74C3C",
};

export default function Notifications({ user, onLogout, onNavigate }) {

  //  STATE 
  const [notifications, setNotifications] = useState([]); // all notifications for this user
  const [loading, setLoading] = useState(true);

  // LOAD NOTIFICATIONS 
  // Fetches ALL notifications (read + unread) for the logged-in user
  const loadData = async () => {
    setLoading(true);
    try {
      const n = await API.getNotifications(user.user_id);
      setNotifications(Array.isArray(n) ? n : []);
    } catch (err) {
      console.error("Failed to load notifications", err);
    }
    setLoading(false);
  };

  // Run loadData() once when the page first opens
  useEffect(() => { loadData(); }, []);

  //  MARK ONE NOTIFICATION AS READ 
  // Called when a user clicks on a single notification
  const handleMarkRead = async (notification) => {
    if (notification.is_read) return; // already read, do nothing
    await API.markNotificationRead(notification.notification_id);
    loadData(); // refresh the list to show the updated read state
  };

  //  MARK ALL AS READ 
  const handleMarkAllRead = async () => {
    await API.markAllNotificationsRead(user.user_id);
    loadData();
  };

  //  HELPER: format date nicely
  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) +
           " · " + date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  };

  // Count how many are unread — shown in the page subtitle
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  //  RENDER
  // This is now the root element of the Notifications page
  return ( 
    <div style={{ flex: 1, padding: "32px" }}> 

        {/* Page header with title and "Mark all as read" button */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
          <div>
            <h1 style={{ fontSize: "24px", fontWeight: "700", color: colors.text, marginBottom: "4px" }}>Notifications</h1>
            <p style={{ fontSize: "14px", color: "#7f8c8d" }}>
              {unreadCount > 0 ? `You have ${unreadCount} unread notification${unreadCount > 1 ? "s" : ""}` : "You're all caught up"}
            </p>
          </div>

          {/* Only show this button if there's something to mark */}
          {unreadCount > 0 && (
            <button onClick={handleMarkAllRead} style={{
              padding: "10px 20px", background: colors.primary, color: colors.white,
              border: "none", borderRadius: "8px", fontSize: "14px", fontWeight: "600", cursor: "pointer",
            }}>Mark all as read</button>
          )}
        </div>

        {/* ── NOTIFICATIONS LIST ── */}
        <div style={{ background: colors.white, borderRadius: "12px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", overflow: "hidden" }}>

          {/* Loading state */}
          {loading ? (
            <p style={{ padding: "24px", color: "#7f8c8d" }}>Loading notifications...</p>

          // Empty state — no notifications at all
          ) : notifications.length === 0 ? (
            <p style={{ padding: "24px", color: "#7f8c8d" }}>No notifications yet.</p>

          // Main list — one row per notification
          ) : (
            notifications.map((n) => (
              <div
                key={n.notification_id}
                onClick={() => handleMarkRead(n)}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "14px",
                  padding: "18px 24px",
                  borderBottom: "1px solid #f0f0f0",
                  // Unread notifications get a light blue background to stand out
                  background: n.is_read ? colors.white : "#EBF5FB",
                  cursor: n.is_read ? "default" : "pointer",
                  transition: "background 0.15s",
                }}
              >
                {/* Blue dot for unread, empty space for read — keeps alignment consistent */}
                <div style={{
                  width: "10px", height: "10px", borderRadius: "50%",
                  background: n.is_read ? "transparent" : colors.accent,
                  marginTop: "6px", flexShrink: 0,
                }} />

                <div style={{ flex: 1 }}>
                  <p style={{
                    fontSize: "14px",
                    color: colors.text,
                    fontWeight: n.is_read ? "400" : "600", // unread messages are bolder
                    marginBottom: "4px",
                  }}>
                    {n.message}
                  </p>
                  <span style={{ fontSize: "12px", color: "#9aa5b1" }}>
                    {formatDate(n.created_at)}
                  </span>
                </div>

                {/* Small "Unread" badge on the right, only for unread items */}
                {!n.is_read && (
                  <span style={{
                    background: colors.accent, color: colors.white,
                    fontSize: "11px", fontWeight: "600",
                    padding: "2px 8px", borderRadius: "20px",
                    flexShrink: 0,
                  }}>New</span>
                )}
              </div>
            ))
          )}
        </div>
      </div>
  );
}
