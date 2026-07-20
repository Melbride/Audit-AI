import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getClients,
  getUsers,
  getUserLoginHistory,
  resetUserPassword,
  setUserLoginLock,
} from "../services/api";
import "../styles/LoginManagement.css";

// LoginManagement page
// Admin-only page for managing a single user's login: lock/unlock login
// access, force a password reset, and review recent login activity.
// Reached from the Users page via the "Login" action on a row
// (route: /users/:userId/login-management).
export default function LoginManagement({ user }) {
  const { userId } = useParams();
  const navigate = useNavigate();
  const isAdmin = user?.role === "Admin";

  const [targetUser, setTargetUser] = useState(null); // the user whose login is being managed
  const [loadingUser, setLoadingUser] = useState(true); // true while fetching that user's record
  const [clients, setClients] = useState([]); // clients used to resolve assigned client names
  const [users, setUsers] = useState([]); // full list of users for selection
  const [loadingUsers, setLoadingUsers] = useState(true); // true while fetching all users
  const [selectedRole, setSelectedRole] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");

  const [loginHistory, setLoginHistory] = useState([]); // recent login attempts for that user
  const [loadingHistory, setLoadingHistory] = useState(true); // true while fetching login history
  const [lockToggling, setLockToggling] = useState(false); // true while a lock/unlock request is in flight

  const [passwordForm, setPasswordForm] = useState({
    newPassword: "",
    confirmPassword: "",
  });
  const [passwordError, setPasswordError] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);

  // Non-admins can't view this page at all — send them back to Users
  useEffect(() => {
    if (!isAdmin) {
      navigate("/users", { replace: true });
    }
  }, [isAdmin, navigate]);

  // Load the target user's record, login history, and clients whenever the
  // :userId route param changes
  useEffect(() => {
    if (!isAdmin) return;

    loadClients();
    loadUsers();

    if (userId) {
      loadUser();
      loadHistory();
    } else {
      setTargetUser(null);
      setLoadingUser(false);
      setLoadingHistory(false);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // There's no single-user GET endpoint, so fetch the full list and
  // find the matching record — mirrors how the Users page already loads data
  const loadUser = async () => {
    setLoadingUser(true);

    try {
      const res = await getUsers();
      const list = Array.isArray(res.data) ? res.data : [];
      const found = list.find(
        (u) => String(u.user_id) === String(userId)
      );

      setTargetUser(found || null);
    } catch (err) {
      console.error("Failed to load user", err);
      setTargetUser(null);
    }

    setLoadingUser(false);
  };

  const loadHistory = async () => {
    setLoadingHistory(true);

    try {
      const res = await getUserLoginHistory(userId);
      setLoginHistory(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Failed to load login history", err);
      setLoginHistory([]);
    }

    setLoadingHistory(false);
  };

  const loadUsers = async () => {
    setLoadingUsers(true);

    try {
      const res = await getUsers();
      setUsers(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Failed to load users", err);
      setUsers([]);
    }

    setLoadingUsers(false);
  };

  const assignedClientName = targetUser
    ?
        targetUser.company_name ||
        clients.find(
          (c) => String(c.client_id) === String(targetUser.assigned_client_id)
        )?.company_name ||
        "—"
    :
        "—";

  const matchesSearch = (u) => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (
      (u.full_name || "").toLowerCase().includes(q) ||
      (u.email || "").toLowerCase().includes(q) ||
      (u.role || "").toLowerCase().includes(q) ||
      (u.company_name || "").toLowerCase().includes(q)
    );
  };

  const availableRoles = [
    "All",
    ...Array.from(new Set(users.map((u) => u.role))).sort(),
  ];

  const filteredUsers = users.filter(matchesSearch);
  const usersByRole = selectedRole === "All"
    ? filteredUsers
    : filteredUsers.filter((u) => u.role === selectedRole);

  const handleSelectUser = (id) => {
    if (!id) return;
    navigate(`/users/${id}/login-management`);
  };

  const renderUserPicker = () => {
    if (loadingUsers) {
      return <p className="page-message">Loading users...</p>;
    }

    return (
      <div className="login-mgmt-card">
        <div className="login-section">
          <div className="login-section-header">
            <span>Select a user</span>
          </div>

          <label className="form-label" htmlFor="role-select">
            Role
          </label>
          <select
            id="role-select"
            className="form-select"
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            style={{ marginBottom: '12px' }}
          >
            {availableRoles.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>

          <label className="form-label" htmlFor="user-select">
            User
          </label>
          <select
            id="user-select"
            className="form-select"
            value={userId || ""}
            onChange={(e) => handleSelectUser(e.target.value)}
          >
            <option value="">Choose a user...</option>
            {usersByRole.map((u) => (
              <option key={u.user_id} value={u.user_id}>
                {u.full_name} — {u.email}
              </option>
            ))}
          </select>

          <input
            className="form-input"
            style={{ marginTop: '12px' }}
            placeholder="Search users by name, email, role, or client"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />

          {usersByRole.length === 0 && (
            <p className="page-message">No users found for this role.</p>
          )}
        </div>
      </div>
    );
  };

  const loadClients = async () => {
    try {
      const res = await getClients();
      setClients(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Failed to load clients", err);
      setClients([]);
    }
  };

  // Locks or unlocks the user's ability to log in. This does not delete
  // or deactivate the account — it only blocks authentication.
  const handleToggleLock = async () => {
    if (!targetUser) return;

    setLockToggling(true);

    try {
      const nextLocked = !targetUser.login_locked;
      const res = await setUserLoginLock(
        targetUser.user_id,
        nextLocked
      );

      if (res.data?.detail) {
        alert(res.data.detail);
      } else {
        setTargetUser({ ...targetUser, login_locked: nextLocked });
      }
    } catch (err) {
      console.error(err);
      alert("Could not update login access. Check your connection.");
    }

    setLockToggling(false);
  };

  // Sets a new password for the user. Requires the two password fields
  // to match and be at least 8 characters.
  const handleResetPassword = async (e) => {
    e.preventDefault();

    if (!targetUser) return;

    const { newPassword, confirmPassword } = passwordForm;

    if (newPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }

    setPasswordSaving(true);
    setPasswordError("");

    try {
      const res = await resetUserPassword(
        targetUser.user_id,
        newPassword
      );

      if (res.data?.detail) {
        setPasswordError(res.data.detail);
      } else {
        alert(`Password reset for ${targetUser.full_name}.`);
        setPasswordForm({ newPassword: "", confirmPassword: "" });
      }
    } catch (err) {
      setPasswordError(
        "Could not reset password. Check your connection."
      );
    }

    setPasswordSaving(false);
  };

  // Redirect is handled in the effect above; render nothing while it fires
  if (!isAdmin) return null;

  return (
    <div className="login-mgmt-page">
      <div className="login-mgmt-header">
        <button
          type="button"
          className="login-mgmt-back"
          onClick={() => navigate("/users")}
        >
          ← Back to Users
        </button>

        <div className="login-mgmt-title">
          <h1>Manage Login</h1>
          <p>
            {loadingUser
              ? "Loading user..."
              : targetUser
              ? `${targetUser.full_name} · ${targetUser.email}`
              : "User not found"}
          </p>
        </div>
      </div>

      {userId ? (
        loadingUser ? (
          <p className="page-message">Loading user...</p>
        ) : !targetUser ? (
          <p className="page-message">
            This user could not be found. They may have been deleted.
          </p>
        ) : (
          <div className="login-mgmt-card">
          {/* Lock / unlock login access */}
          <div className="login-section">
            <div className="login-section-header">
              <span>User details</span>
            </div>

            <div className="login-user-details">
              <div>
                <div className="detail-label">Name</div>
                <div>{targetUser.full_name}</div>
              </div>
              <div>
                <div className="detail-label">Email</div>
                <div>{targetUser.email}</div>
              </div>
              <div>
                <div className="detail-label">Role</div>
                <div>{targetUser.role}</div>
              </div>
              <div>
                <div className="detail-label">Assigned client</div>
                <div>{assignedClientName}</div>
              </div>
            </div>
          </div>

          <div className="login-section">
            <div className="login-section-header">
              <span>Login access</span>

              <span
                className={`login-badge ${
                  targetUser.login_locked ? "locked" : "active"
                }`}
              >
                {targetUser.login_locked ? "Locked" : "Active"}
              </span>
            </div>

            <p className="login-section-hint">
              {targetUser.login_locked
                ? "This user cannot log in until access is restored."
                : "This user can currently log in normally."}
            </p>

            <button
              type="button"
              className={`btn ${
                targetUser.login_locked ? "btn-primary" : "btn-danger"
              }`}
              onClick={handleToggleLock}
              disabled={lockToggling}
            >
              {lockToggling
                ? "Updating..."
                : targetUser.login_locked
                ? "Unlock login access"
                : "Lock login access"}
            </button>
          </div>

          {/* Reset password */}
          <div className="login-section">
            <div className="login-section-header">
              <span>Reset password</span>
            </div>

            {passwordError && (
              <div className="error-box">{passwordError}</div>
            )}

            <form onSubmit={handleResetPassword}>
              <label className="form-label">New password</label>

              <input
                className="form-input"
                type="password"
                required
                value={passwordForm.newPassword}
                placeholder="At least 8 characters"
                onChange={(e) =>
                  setPasswordForm({
                    ...passwordForm,
                    newPassword: e.target.value,
                  })
                }
              />

              <label className="form-label">Confirm password</label>

              <input
                className="form-input"
                type="password"
                required
                value={passwordForm.confirmPassword}
                placeholder="Re-enter password"
                onChange={(e) =>
                  setPasswordForm({
                    ...passwordForm,
                    confirmPassword: e.target.value,
                  })
                }
              />

              <button
                type="submit"
                className="btn btn-primary"
                disabled={passwordSaving}
              >
                {passwordSaving ? "Saving..." : "Set new password"}
              </button>
            </form>
          </div>

          {/* Recent login activity */}
          <div className="login-section">
            <div className="login-section-header">
              <span>Recent login activity</span>
            </div>

            {loadingHistory ? (
              <p className="page-message">Loading activity...</p>
            ) : loginHistory.length === 0 ? (
              <p className="page-message">
                No login activity recorded.
              </p>
            ) : (
              <table className="login-history-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>IP address</th>
                    <th>Device</th>
                    <th>Result</th>
                  </tr>
                </thead>

                <tbody>
                  {loginHistory.map((entry) => (
                    <tr key={entry.id}>
                      <td>
                        {new Date(entry.timestamp).toLocaleString()}
                      </td>

                      <td>{entry.ip_address || "—"}</td>
                      <td>{entry.device || "—"}</td>

                      <td>
                        <span
                          className={`login-result ${
                            entry.status === "Success"
                              ? "success"
                              : "failed"
                          }`}
                        >
                          {entry.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
         </div>
        </div>
      )
    ) : renderUserPicker()}
    </div>
  );
}