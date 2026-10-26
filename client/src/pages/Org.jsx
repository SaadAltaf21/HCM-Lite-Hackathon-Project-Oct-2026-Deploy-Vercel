import { useEffect, useState } from 'react'
import { api, errMsg } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import EmptyState from '../components/EmptyState.jsx'

function Crud({ title, path, fields, readOnly }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState({})
  const [msg, setMsg] = useState('')
  const load = () => {
    setLoading(true)
    api.get(path).then(({ data }) => setRows(Array.isArray(data) ? data : (data.items || []))).catch((e) => setError(errMsg(e))).finally(() => setLoading(false))
  }
  useEffect(load, [path])
  const submit = async (e) => {
    e.preventDefault()
    const payload = { ...form }
    // LeaveType: annualQuota is a number; empty means unlimited (null).
    if ('annualQuota' in payload) payload.annualQuota = payload.annualQuota === '' || payload.annualQuota === undefined ? null : Number(payload.annualQuota)
    try { await api.post(path, payload); setForm({}); setMsg('Saved.'); load() } catch (err) { setMsg(errMsg(err)) }
  }
  const remove = async (id) => {
    if (!confirm('Delete this record?')) return
    try { await api.delete(`${path}/${id}`); load() } catch (err) { setMsg(errMsg(err)) }
  }
  return (
    <div className="card"><h2>{title}</h2>
      {loading ? <p>Loading…</p> : error ? <div className="error">{error}</div> : rows.length === 0 ? <EmptyState text="No records yet" /> : (
        <ul>{rows.map((r) => <li key={r.id || r._id} className="row">{r.name || r.title || r.type || r.email || JSON.stringify(r)} {!readOnly && <button className="btn danger" onClick={() => remove(r.id || r._id)}>Delete</button>}</li>)}</ul>
      )}
      {!readOnly && (
        <form className="form-grid" onSubmit={submit}>
          {fields.map((f) => <input key={f} placeholder={f} value={form[f] || ''} onChange={(e) => setForm((s) => ({ ...s, [f]: e.target.value }))} />)}
          <button className="btn primary">Add</button>
        </form>
      )}
      {msg && <p>{msg}</p>}
    </div>
  )
}

export default function Org() {
  const { user } = useAuth()
  const readOnly = user.role === 'hr'
  const [settings, setSettings] = useState({ officeStart: '', graceMinutes: '', officeLat: '', officeLng: '', officeRadiusMeters: '' })
  const [msg, setMsg] = useState('')
  const [users, setUsers] = useState([])
  const [userForm, setUserForm] = useState({ name: '', email: '', password: '', role: 'hr' })
  useEffect(() => {
    api.get('/settings').then(({ data }) => setSettings({ ...settings, ...(data.settings || data) })).catch(() => {})
    if (user.role === 'admin') api.get('/users').then(({ data }) => setUsers(Array.isArray(data) ? data : (data.users || []))).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.role])
  const saveSettings = async (e) => {
    e.preventDefault()
    try { await api.put('/settings', { ...settings, graceMinutes: Number(settings.graceMinutes), officeLat: settings.officeLat === '' ? null : Number(settings.officeLat), officeLng: settings.officeLng === '' ? null : Number(settings.officeLng), officeRadiusMeters: Number(settings.officeRadiusMeters) }); setMsg('Settings saved.') } catch (err) { setMsg(errMsg(err)) }
  }
  const createUser = async (e) => {
    e.preventDefault()
    // POST /users only accepts role='hr'.
    try { await api.post('/users', { ...userForm, role: 'hr' }); setMsg('User created.'); const { data } = await api.get('/users'); setUsers(Array.isArray(data) ? data : (data.users || [])) } catch (err) { setMsg(errMsg(err)) }
  }
  return (
    <div>
      <h1>Organization {readOnly && <span className="muted">(read-only for HR)</span>}</h1>
      {msg && <p>{msg}</p>}
      {!readOnly && (
        <div className="card"><h2>Company settings</h2>
          <form className="form-grid" onSubmit={saveSettings}>
            <label>Office start<input type="time" value={settings.officeStart || ''} onChange={(e) => setSettings({ ...settings, officeStart: e.target.value })} /></label>
            <label>Grace minutes<input type="number" value={settings.graceMinutes || ''} onChange={(e) => setSettings({ ...settings, graceMinutes: e.target.value })} /></label>
            <label>Office latitude<input type="number" step="any" value={settings.officeLat || ''} onChange={(e) => setSettings({ ...settings, officeLat: e.target.value })} /></label>
            <label>Office longitude<input type="number" step="any" value={settings.officeLng || ''} onChange={(e) => setSettings({ ...settings, officeLng: e.target.value })} /></label>
            <label>Office radius (m)<input type="number" value={settings.officeRadiusMeters || ''} onChange={(e) => setSettings({ ...settings, officeRadiusMeters: e.target.value })} /></label>
            <button className="btn primary">Save settings</button>
          </form>
        </div>
      )}
      <Crud title="Departments" path="/departments" fields={['name']} readOnly={readOnly} />
      <Crud title="Designations" path="/designations" fields={['name']} readOnly={readOnly} />
      <Crud title="Leave types" path="/leave-types" fields={['name', 'annualQuota']} readOnly={readOnly} />
      <Crud title="Holidays" path="/holidays" fields={['name', 'date']} readOnly={readOnly} />
      {user.role === 'admin' && (
        <div className="card"><h2>Users / HR logins</h2>
          {users.length === 0 ? <EmptyState text="No records yet" /> : (
            <ul>{users.map((u) => (
              <li key={u.id || u._id} className="row">{u.name || u.email} · {u.role} · {u.status || 'active'}
                <button className="btn" onClick={async () => { await api.patch(`/users/${u.id || u._id}/deactivate`); const { data } = await api.get('/users'); setUsers(Array.isArray(data) ? data : (data.users || [])) }}>Deactivate</button>
                <button className="btn" onClick={async () => { const p = prompt('New temporary password:'); if (p) await api.patch(`/users/${u.id || u._id}/reset-password`, { newPassword: p }) }}>Reset password</button>
              </li>))}</ul>
          )}
          <form className="form-grid" onSubmit={createUser}>
            <input placeholder="Name" value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} />
            <input type="email" placeholder="Email" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} />
            <input type="password" placeholder="Password" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} />
            <select value="hr" onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}><option value="hr">HR</option></select>
            <button className="btn primary">Create user</button>
          </form>
        </div>
      )}
    </div>
  )
}
