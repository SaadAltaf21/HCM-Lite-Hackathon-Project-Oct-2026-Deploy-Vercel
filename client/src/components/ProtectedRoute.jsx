import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function ProtectedRoute({ roles }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (user.mustChangePassword) return <Navigate to="/change-password" replace />
  if (roles && !roles.includes(user.role)) return <div className="card"><h2>Access denied</h2><p>You do not have permission to view this page.</p></div>
  return <Outlet />
}
