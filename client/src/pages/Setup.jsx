import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, errMsg } from '../api.js'

// Company signup: ONLY these 4 fields. Everything else the backend needs
// (office start 09:00, grace 15 minutes, weekend Sat-Sun, radius 150m,
// half-day 5 hours, default leave types) is filled in automatically and can
// be changed later in Settings by the Admin.
// This page is always open: any new visitor can create their own company,
// even when hundreds of companies already exist. The old page redirected
// to Login (after a blank flash) whenever any user already existed, because
// it checked a global "needsSetup" flag — that check is gone, on purpose.
const initial = { companyName: '', adminName: '', adminEmail: '', adminPassword: '' }

export default function Setup() {
  const [form, setForm] = useState(initial)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const [loading, setLoading] = useState(false)
  const nav = useNavigate()
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const submit = async (e) => {
    e.preventDefault(); setLoading(true); setError('')
    try {
      await api.post('/setup', form)
      setDone('Setup complete. Now log in with the email and password you just created.')
      setTimeout(() => nav('/login'), 900)
    } catch (err) {
      setError(errMsg(err))
    } finally { setLoading(false) }
  }
  return (
    <div className="auth-wrap"><div className="card">
      <h1>HCM Lite — Create company &amp; Admin account</h1>
      <p className="muted">Create your own company. Your data stays in your company only — other companies cannot see it.</p>
      {error && <div className="error">{error}</div>}
      {done && <p>{done}</p>}
      <form className="form" onSubmit={submit}>
        <label>Company name<input required value={form.companyName} onChange={set('companyName')} /></label>
        <label>Full name<input required value={form.adminName} onChange={set('adminName')} /></label>
        <label>Email<input required type="email" value={form.adminEmail} onChange={set('adminEmail')} /></label>
        <label>Password<input required type="password" value={form.adminPassword} onChange={set('adminPassword')} placeholder="At least 6 characters" /></label>
        <button className="btn primary" disabled={loading}>{loading ? 'Creating…' : 'Create company & admin'}</button>
      </form>
      <p className="muted" style={{ marginTop: 16 }}>Already have an account? <Link to="/login">Go to Login →</Link></p>
    </div></div>
  )
}
