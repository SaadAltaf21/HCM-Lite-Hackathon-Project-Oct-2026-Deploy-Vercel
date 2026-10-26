import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

const MENUS = {
  admin: [
    ['Dashboard', '/dashboard', '📊'], ['Employees', '/employees', '👥'], ['Organization', '/org', '🏢'],
    ['Attendance', '/attendance', '🕒'], ['Leave', '/leave', '🌴'], ['Payroll', '/payroll', '💰'],
    ['AI Assistant', '/ai', '✨'], ['Announcements', '/announcements', '📣'], ['Notifications', '/notifications', '🔔'], ['Audit Log', '/audit', '📋'],
  ],
  hr: [
    ['Dashboard', '/dashboard', '📊'], ['Employees', '/employees', '👥'], ['Organization', '/org', '🏢'],
    ['Attendance', '/attendance', '🕒'], ['Leave', '/leave', '🌴'], ['Payroll', '/payroll', '💰'],
    ['AI Assistant', '/ai', '✨'], ['Announcements', '/announcements', '📣'], ['Notifications', '/notifications', '🔔'],
  ],
  employee: [
    ['Dashboard', '/dashboard', '📊'], ['Attendance', '/attendance', '🕒'], ['Leave', '/leave', '🌴'],
    ['Payroll', '/payroll', '💰'], ['AI Assistant', '/ai', '✨'], ['Announcements', '/announcements', '📣'], ['Notifications', '/notifications', '🔔'],
  ],
}

export default function Sidebar() {
  const { user } = useAuth()
  const items = MENUS[user?.role] || MENUS.employee
  return (
    <nav className="sidebar" aria-label="Main menu">
      {items.map(([label, to, icon]) => (
        <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}><span className="nav-icon" aria-hidden="true">{icon}</span>{label}</NavLink>
      ))}
    </nav>
  )
}
