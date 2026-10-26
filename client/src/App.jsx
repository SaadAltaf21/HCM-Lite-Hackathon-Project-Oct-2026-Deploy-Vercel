import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Navbar from './components/Navbar.jsx'
import Sidebar from './components/Sidebar.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import { useAuth } from './context/AuthContext.jsx'
import Setup from './pages/Setup.jsx'
import Login from './pages/Login.jsx'
import ChangePassword from './pages/ChangePassword.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Employees from './pages/Employees.jsx'
import EmployeeDetail from './pages/EmployeeDetail.jsx'
import Org from './pages/Org.jsx'
import Attendance from './pages/Attendance.jsx'
import CameraCheckIn from './pages/CameraCheckIn.jsx'
import Leave from './pages/Leave.jsx'
import Payroll from './pages/Payroll.jsx'
import AiPage from './pages/AiPage.jsx'
import Announcements from './pages/Announcements.jsx'
import Notifications from './pages/Notifications.jsx'
import Audit from './pages/Audit.jsx'

export default function App() {
  const { user } = useAuth()
  const [theme, setTheme] = useState(() => localStorage.getItem('hcm_theme') || 'light')
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('hcm_theme', theme)
  }, [theme])

  if (!user) {
    return (
      <div>
        <Navbar theme={theme} onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))} />
        <Routes>
          <Route path="/setup" element={<Setup />} />
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </div>
    )
  }

  return (
    <div>
      <Navbar theme={theme} onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))} />
      <div className="layout">
        <Sidebar />
        <main className="main">
          <Routes>
            <Route path="/change-password" element={<ChangePassword />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/employees" element={<Employees />} />
              <Route path="/employees/:id" element={<EmployeeDetail />} />
              <Route path="/org" element={<Org />} />
              <Route path="/attendance" element={<Attendance />} />
              <Route path="/attendance/camera" element={<CameraCheckIn />} />
              <Route path="/leave" element={<Leave />} />
              <Route path="/payroll" element={<Payroll />} />
              <Route path="/ai" element={<AiPage />} />
              <Route path="/announcements" element={<Announcements />} />
              <Route path="/notifications" element={<Notifications />} />
            </Route>
            <Route element={<ProtectedRoute roles={['admin']} />}>
              <Route path="/audit" element={<Audit />} />
            </Route>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}
