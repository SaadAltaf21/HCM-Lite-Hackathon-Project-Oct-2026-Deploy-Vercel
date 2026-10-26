import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, errMsg } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [backendError, setBackendError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const nav = useNavigate()
  useEffect(() => {
    // Retry until the backend answers: on first run the backend downloads
    // the in-memory MongoDB binary, so it can take up to a minute to be
    // ready. A one-shot check used to show "Cannot reach the backend"
    // forever, even after the backend came up seconds later.
    let stopped = false
    const check = () => {
      api.get('/setup/status').then(({ data }) => {
        if (stopped) return
        setBackendError('')
        if (data.needsSetup) nav('/setup')
      }).catch(() => {
        if (!stopped) setBackendError('Waiting for the backend… Start the server (run.bat / ./run.sh, only once) and check its terminal says "MongoDB connected". If you see "Port 5000 is already in use", run stop.bat / ./stop.sh first, then start once. This page will retry automatically — no need to refresh.')
      })
    }
    check()
    const id = setInterval(check, 3000)
    return () => { stopped = true; clearInterval(id) }
  }, [nav])
  const submit = async (e) => {
    e.preventDefault(); setLoading(true); setError('')
    try {
      const user = await login(email, password)
      nav(user.mustChangePassword ? '/change-password' : '/dashboard')
    } catch (err) {
      const code = err?.response?.data?.code
      if (code === 'NOT_SETUP') {
        setError('System not set up yet. Create the company and Admin account first.')
        nav('/setup')
        return
      }
      setError(errMsg(err, 'Login failed. Check your email and password.'))
    } finally { setLoading(false) }
  }
  return (
    <div className="auth-wrap"><div className="card">
      <h1>Login to HCM Lite</h1>
      <p className="muted">Admin, HR and Employee accounts sign in here.</p>
      {backendError && <div className="error">{backendError}</div>}
      {error && <div className="error">{error}</div>}
      <form className="form" onSubmit={submit}>
        <label>Email<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Password<input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <button className="btn primary" disabled={loading}>{loading ? 'Signing in…' : 'Login'}</button>
      </form>
      <p className="muted" style={{ marginTop: 16 }}>
        There is no signup page by design: the first account is created once on the Setup page,
        then Admin creates HR logins and HR creates employee logins.
        <br />
        First time here? <Link to="/setup">Create company &amp; Admin account →</Link>
      </p>
    </div></div>
  )
}
