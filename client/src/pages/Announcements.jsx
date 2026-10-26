import { useEffect, useState } from 'react'
import { api, errMsg } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import EmptyState from '../components/EmptyState.jsx'

export default function Announcements() {
  const { user } = useAuth()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ title: '', message: '' })
  const [msg, setMsg] = useState('')
  const load = () => {
    setLoading(true)
    api.get('/announcements').then(({ data }) => setRows(Array.isArray(data) ? data : (data.announcements || []))).catch((e) => setError(errMsg(e))).finally(() => setLoading(false))
  }
  useEffect(load, [])
  const submit = async (e) => {
    e.preventDefault()
    try { await api.post('/announcements', form); setForm({ title: '', message: '' }); setMsg('Announcement posted.'); load() } catch (err) { setMsg(errMsg(err)) }
  }
  return (
    <div><h1>Announcements</h1>
      {(user.role === 'admin' || user.role === 'hr') && (
        <div className="card"><h2>New announcement</h2>
          <form className="form" onSubmit={submit}>
            <input required placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <textarea required placeholder="Message" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
            <button className="btn primary">Post</button>
          </form>
          {msg && <p>{msg}</p>}
        </div>
      )}
      {loading ? <div className="card">Loading…</div> : error ? <div className="card"><div className="error">{error}</div></div> : rows.length === 0 ? <EmptyState text="No records yet" /> : (
        rows.map((a, i) => <div className="card" key={a.id || i}><h2>{a.title || 'Announcement'}</h2><p>{a.message || a.body || ''}</p><p className="muted">{a.createdAt || ''}</p></div>)
      )}
    </div>
  )
}
