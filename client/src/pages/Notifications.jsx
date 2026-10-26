import { useEffect, useState } from 'react'
import { api, errMsg } from '../api.js'
import EmptyState from '../components/EmptyState.jsx'

export default function Notifications() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = () => {
    setLoading(true)
    api.get('/notifications/mine').then(({ data }) => setRows(Array.isArray(data) ? data : (data.notifications || []))).catch((e) => setError(errMsg(e))).finally(() => setLoading(false))
  }
  useEffect(load, [])
  const markRead = async (id) => {
    try { await api.patch(`/notifications/${id}/read`); load() } catch { /* ignore */ }
  }
  return (
    <div><h1>Notifications</h1>
      {loading ? <div className="card">Loading…</div> : error ? <div className="card"><div className="error">{error}</div></div> : rows.length === 0 ? <EmptyState text="No records yet" /> : (
        rows.map((n, i) => <div className="card" key={n.id || n._id || i}><p>{n.message || n.title || JSON.stringify(n)}</p><p className="muted">{n.createdAt || ''} · {n.read ? 'Read' : 'Unread'}</p>{!n.read && <button className="btn" onClick={() => markRead(n.id || n._id)}>Mark as read</button>}</div>)
      )}
    </div>
  )
}
