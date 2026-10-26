import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { errMsg } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'

// Login: ONLY email and password. No global setup redirect: any registered
// account logs in here, whether it belongs to the first company or the
// hundredth. A visitor with no account signs up on the Setup page instead.
export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const nav = useNavigate()
  const submit = async (e) => {
    e.preventDefault(); setLoading(true); setError('')
    try {
      const user = await login(email, password)
      nav(user.mustChangePassword ? '/change-password' : '/dashboard')
    } catch (err) {
      setError(errMsg(err, 'Login failed. Check your email and password.'))
    } finally { setLoading(false) }
  }
  return (
    <div className="auth-wrap"><div className="card">
      <h1>Login to HCM Lite</h1>
      <p className="muted">Admin, HR and Employee accounts sign in here.</p>
      {error && <div className="error">{error}</div>}
      <form className="form" onSubmit={submit}>
        <label>Email<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Password<input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <button className="btn primary" disabled={loading}>{loading ? 'Signing in…' : 'Login'}</button>
      </form>
      <p className="muted" style={{ marginTop: 16 }}>
        First time here? <Link to="/setup">Create company &amp; Admin account →</Link>
      </p>
    </div></div>
  )
}
