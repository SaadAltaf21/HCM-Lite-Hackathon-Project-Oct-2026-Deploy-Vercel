import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function Navbar({ theme, onToggleTheme }) {
  const { user, logout } = useAuth()
  const nav = useNavigate()
  return (
    <header className="topbar">
      <Link className="brand" to="/dashboard"><span className="brand-mark" aria-hidden="true">H</span>HCM Lite</Link>
      <div className="top-actions">
        <button className="btn ghost" onClick={onToggleTheme} aria-label="Toggle dark mode">
          {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
        </button>
        {user && <Link className="btn ghost" to="/notifications">Notifications</Link>}
        {user && <span className="user-chip">{user.email} · {user.role}</span>}
        {user && <button className="btn" onClick={() => { logout(); nav('/login') }}>Logout</button>}
      </div>
    </header>
  )
}
