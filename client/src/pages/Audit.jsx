import { useEffect, useState } from 'react'
import { api, errMsg } from '../api.js'
import EmptyState from '../components/EmptyState.jsx'

export default function Audit() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    api.get('/audit').then(({ data }) => setRows(Array.isArray(data) ? data : (data.audit || data.logs || []))).catch((e) => setError(errMsg(e))).finally(() => setLoading(false))
  }, [])
  return (
    <div><h1>Audit log</h1>
      {loading ? <div className="card">Loading…</div> : error ? <div className="card"><div className="error">{error}</div></div> : rows.length === 0 ? <EmptyState text="No records yet" /> : (
        <div className="card table-wrap"><table><thead><tr><th>Time</th><th>User</th><th>Action</th><th>Details</th></tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i}><td>{r.createdAt || r.time || ''}</td><td>{r.user?.email || r.user || r.actor || ''}</td><td>{r.action || r.event || ''}</td><td>{r.details || r.message || ''}</td></tr>)}</tbody></table></div>
      )}
    </div>
  )
}
