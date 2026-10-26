import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, errMsg } from '../api.js'

const initial = { companyName: '', adminName: '', adminEmail: '', adminPassword: '', officeStart: '09:00', graceMinutes: 15, officeLat: '', officeLng: '', officeRadiusMeters: 150 }

export default function Setup() {
  const [form, setForm] = useState(initial)
  const [error, setError] = useState('')
  const [backendError, setBackendError] = useState('')
  const [done, setDone] = useState('')
  const [loading, setLoading] = useState(false)
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
        if (!data.needsSetup) nav('/login')
      }).catch(() => {
        if (!stopped) setBackendError('Waiting for the backend… Start the server (run.bat / ./run.sh, only once) and check its terminal says "MongoDB connected". If you see "Port 5000 is already in use", run stop.bat / ./stop.sh first, then start once. This page will retry automatically — no need to refresh.')
      })
    }
    check()
    const id = setInterval(check, 3000)
    return () => { stopped = true; clearInterval(id) }
  }, [nav])
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const submit = async (e) => {
    e.preventDefault(); setLoading(true); setError('')
    try {
      const payload = { ...form, graceMinutes: Number(form.graceMinutes), officeLat: form.officeLat === '' ? null : Number(form.officeLat), officeLng: form.officeLng === '' ? null : Number(form.officeLng), officeRadiusMeters: Number(form.officeRadiusMeters) }
      await api.post('/setup', payload)
      setDone('Setup complete. Now log in with the Admin email and password you just created.')
      setTimeout(() => nav('/login'), 900)
    } catch (err) {
      const status = err?.response?.status
      if (status === 409) {
        setError('Setup already completed. Log in with the Admin account created earlier.')
        setTimeout(() => nav('/login'), 900)
      } else {
        setError(errMsg(err))
      }
    } finally { setLoading(false) }
  }
  return (
    <div className="auth-wrap"><div className="card">
      <h1>HCM Lite — First-time setup</h1>
      <p className="muted">The system starts empty. This page <strong>is</strong> the signup: set up the company and the first Admin account. After that, Admin creates HR logins and HR creates employee logins — there is no public signup page.</p>
      {backendError && <div className="error">{backendError}</div>}
      {error && <div className="error">{error}</div>}
      {done && <p>{done}</p>}
      <form className="form" onSubmit={submit}>
        <label>Company name<input required value={form.companyName} onChange={set('companyName')} /></label>
        <label>Admin name<input required value={form.adminName} onChange={set('adminName')} /></label>
        <label>Admin email<input required type="email" value={form.adminEmail} onChange={set('adminEmail')} /></label>
        <label>Admin password<input required type="password" value={form.adminPassword} onChange={set('adminPassword')} placeholder="At least 6 characters" /></label>
        <label>Office start time<input type="time" value={form.officeStart} onChange={set('officeStart')} /></label>
        <label>Grace minutes (late threshold)<input type="number" value={form.graceMinutes} onChange={set('graceMinutes')} /></label>
        <label>Office latitude<input type="number" step="any" value={form.officeLat} onChange={set('officeLat')} placeholder="Optional" /></label>
        <label>Office longitude<input type="number" step="any" value={form.officeLng} onChange={set('officeLng')} placeholder="Optional" /></label>
        <label>Office radius (meters)<input type="number" value={form.officeRadiusMeters} onChange={set('officeRadiusMeters')} /></label>
        <button className="btn primary" disabled={loading}>{loading ? 'Setting up…' : 'Create company & admin'}</button>
      </form>
      <p className="muted" style={{ marginTop: 16 }}>Already set up? <Link to="/login">Go to Login →</Link></p>
    </div></div>
  )
}
