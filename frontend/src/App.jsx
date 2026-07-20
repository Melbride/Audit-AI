import { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'

// AI pipeline pages
import UploadPage from './pages/UploadPage'
import MappingPage from './pages/MappingPage'
import CleanPage from './pages/CleanPage'
import AnalysisPage from './pages/AnalysisPage'
import CorrectedResultsPage from './pages/CorrectedResultsPage'

// App/management pages
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Users from './pages/Users'
import LoginManagement from './pages/LoginManagement'
import Clients from './pages/Clients'
import Engagements from './pages/Engagements'
import EngagementDetail from './pages/EngagementDetail'
import Notifications from './pages/Notifications'
import Submissions from './pages/Submissions'
import AllFiles from './pages/AllFiles'
import Reports from './pages/Reports'
import ReportDetail from './pages/ReportDetail'
import Layout from './pages/Layout'
import './App.css'

function RequireAuth({ user, children }) {
  if (!user) return <Navigate to="/login" replace />
  return children
}

function App() {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem("user")
      if (!stored) return null
      const parsed = JSON.parse(stored)
      if (!parsed || !parsed.full_name) return null
      return parsed
    } catch {
      return null
    }
  })

  const handleLogin = (userData) => {
    setUser(userData)
  }

  const handleLogout = () => {
    localStorage.removeItem("token")
    localStorage.removeItem("user")
    setUser(null)
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Login (no sidebar) */}
        <Route
          path="/login"
          element={user ? <Navigate to="/dashboard" replace /> : <Login onLogin={handleLogin} />}
        />

        {/* All authenticated pages (wrapped in Layout — persistent sidebar) */}

        {/* AI Pipeline pages */}
        <Route
          path="/upload"
          element={
            <RequireAuth user={user}>
              <Layout user={user} onLogout={handleLogout}>
                <UploadPage />
              </Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/mapping"
          element={
            <RequireAuth user={user}>
              <Layout user={user} onLogout={handleLogout}>
                <MappingPage />
              </Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/clean"
          element={
            <RequireAuth user={user}>
              <Layout user={user} onLogout={handleLogout}>
                <CleanPage />
              </Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/analysis"
          element={
            <RequireAuth user={user}>
              <Layout user={user} onLogout={handleLogout}>
                <AnalysisPage user={user} />
              </Layout>
            </RequireAuth>
          }
        />
        {/* Analysis scoped to a specific engagement, linked from EngagementDetail */}
        <Route
          path="/analysis/:engagementId"
          element={
            <RequireAuth user={user}>
              <Layout user={user} onLogout={handleLogout}>
                <AnalysisPage user={user} />
              </Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/corrected-results"
          element={
            <RequireAuth user={user}>
              <Layout user={user} onLogout={handleLogout}>
                <CorrectedResultsPage />
              </Layout>
            </RequireAuth>
          }
        />

        {/* Management pages */}
        <Route
          path="/dashboard"
          element={
            <RequireAuth user={user}>
              <Layout user={user} onLogout={handleLogout}>
                <Dashboard user={user} />
              </Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/clients"
          element={
            <RequireAuth user={user}>
              <Layout user={user} onLogout={handleLogout}>
                <Clients user={user} />
              </Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/engagements"
          element={
            <RequireAuth user={user}>
              <Layout user={user} onLogout={handleLogout}>
                <Engagements user={user} />
              </Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/engagements/:engagementId"
          element={
            <RequireAuth user={user}>
              <Layout user={user} onLogout={handleLogout}>
                <EngagementDetail user={user} />
              </Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/submissions"
          element={
            <RequireAuth user={user}>
              <Layout user={user} onLogout={handleLogout}>
                <Submissions user={user} />
              </Layout>
            </RequireAuth>
          }
        />
        {/* Reports (Month 3) */}
        <Route
          path="/reports"
          element={
            <RequireAuth user={user}>
              <Layout user={user} onLogout={handleLogout}>
                <Reports user={user} />
              </Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/reports/:reportId"
          element={
            <RequireAuth user={user}>
              <Layout user={user} onLogout={handleLogout}>
                <ReportDetail user={user} />
              </Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/users"
          element={
            <RequireAuth user={user}>
              <Layout user={user} onLogout={handleLogout}>
                <Users user={user} />
              </Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/login-management"
          element={
            <RequireAuth user={user}>
              <Layout user={user} onLogout={handleLogout}>
                <LoginManagement user={user} />
              </Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/users/:userId/login-management"
          element={
            <RequireAuth user={user}>
              <Layout user={user} onLogout={handleLogout}>
                <LoginManagement user={user} />
              </Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/notifications"
          element={
            <RequireAuth user={user}>
              <Layout user={user} onLogout={handleLogout}>
                <Notifications user={user} />
              </Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/files"
          element={
            <RequireAuth user={user}>
              <Layout user={user} onLogout={handleLogout}>
                <AllFiles user={user} />
              </Layout>
            </RequireAuth>
          }
        />

        {/* Default: / goes to login if not logged in, dashboard if logged in */}
        <Route path="/" element={<Navigate to={user ? "/dashboard" : "/login"} replace />} />

        {/* Anything unmatched */}
        <Route path="*" element={<Navigate to={user ? "/dashboard" : "/login"} replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App