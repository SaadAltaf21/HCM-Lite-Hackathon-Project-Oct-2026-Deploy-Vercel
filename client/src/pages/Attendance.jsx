import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, errMsg } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import EmptyState from '../components/EmptyState.jsx'

const empName = (r) => {
  if (r && typeof r === 'object') return `${r.firstName || ''} ${r.lastName || ''}`.trim() || r.code || ''
  return typeof r === 'string' ? r : ''
}

export default function Attendance() {
  const { user } = useAuth()
  const canCheckIn = user.role === 'hr' || user.role === 'employee'
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [department, setDepartment] = useState('')
  const [board, setBoard] = useState([])
  const [mine, setMine] = useState([])
  const [calendar, setCalendar] = useState([])
  const [month, setMonth] = useState(today.slice(0, 7))
  const [corrections, setCorrections] = useState([])
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [corr, setCorr] = useState({ date: today, requestedCheckIn: '', requestedCheckOut: '', reason: '' })
  const [comment, setComment] = useState('')

  const load = async () => {
    setError('')
    try {
      const q = new URLSearchParams({ date, department })
      // Backend: { date, records: [...], summary }
      const b = await api.get(`/attendance/board?${q}`); setBoard(Array.isArray(b.data?.records) ? b.data.records : (Array.isArray(b.data) ? b.data : []))
      const m = await api.get('/attendance/mine').catch(() => ({ data: [] })); setMine(Array.isArray(m.data) ? m.data : [])
      const c = await api.get(`/attendance/calendar?month=${month}${user.employeeId ? `&employeeId=${user.employeeId}` : ''}`).catch(() => ({ data: [] })); setCalendar(Array.isArray(c.data) ? c.data : [])
      const cr = await api.get('/attendance/corrections').catch(() => ({ data: [] })); setCorrections(Array.isArray(cr.data) ? cr.data : [])
    } catch (e) { setError(errMsg(e)) }
  }
  useEffect(() => { load() }, [date, department, month])

  const act = async (kind) => {
    try { const { data } = await api.post(`/attendance/check-${kind}`); setMsg(data.message || `Checked ${kind}.`); load() } catch (e) { setMsg(errMsg(e)) }
  }
  const requestCorr = async (e) => {
    e.preventDefault()
    try {
      await api.post('/attendance/corrections', {
        date: corr.date,
        reason: corr.reason,
        requestedCheckIn: corr.requestedCheckIn || null,
        requestedCheckOut: corr.requestedCheckOut || null,
      })
      setMsg('Correction request submitted.'); load()
    } catch (err) { setMsg(errMsg(err)) }
  }
  const decide = async (id, status) => {
    try { await api.patch(`/attendance/corrections/${id}`, { status, approverComment: comment }); load() } catch (err) { setMsg(errMsg(err)) }
  }

  return (
    <div>
      <h1>Attendance</h1>
      {msg && <p>{msg}</p>}
      {error && <div className="error">{error}</div>}
      {canCheckIn && (
        <div className="card"><h2>Check in / out</h2>
          <div className="row">
            <button className="btn primary" onClick={() => act('in')}>Check in</button>
            <button className="btn" onClick={() => act('out')}>Check out</button>
            <Link className="btn" to="/attendance/camera">Camera check-in</Link>
          </div>
        </div>
      )}
      <div className="card"><h2>Attendance board</h2>
        <div className="form-grid">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <input placeholder="Department filter" value={department} onChange={(e) => setDepartment(e.target.value)} />
        </div>
        {board.length === 0 ? <EmptyState text="No records yet" /> : (
          <div className="table-wrap"><table><thead><tr><th>Employee</th><th>Check-in</th><th>Check-out</th><th>Status</th><th>Hours</th></tr></thead>
            <tbody>{board.map((r, i) => <tr key={r.id || r._id || i}><td>{empName(r.employee)}</td><td>{r.checkIn || ''}</td><td>{r.checkOut || ''}</td><td>{r.status || ''}</td><td>{r.hours ?? ''}</td></tr>)}</tbody></table></div>
        )}
      </div>
      <div className="card"><h2>My attendance</h2>
        {mine.length === 0 ? <EmptyState text="No records yet" /> : <ul>{mine.map((r, i) => <li key={i}>{r.date} — {r.checkIn || ''} to {r.checkOut || ''} ({r.status || ''})</li>)}</ul>}
      </div>
      <div className="card"><h2>Calendar</h2>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        {calendar.length === 0 ? <EmptyState text="No records yet" /> : (
          <div className="table-wrap"><table><thead><tr><th>Date</th><th>Status</th><th>Hours</th></tr></thead>
            <tbody>{calendar.map((d, i) => <tr key={i}><td>{d.date || d.day}</td><td>{d.status}</td><td>{d.hours ?? ''}</td></tr>)}</tbody></table></div>
        )}
      </div>
      <div className="card"><h2>Request a correction</h2>
        <form className="form-grid" onSubmit={requestCorr}>
          <input type="date" value={corr.date} onChange={(e) => setCorr({ ...corr, date: e.target.value })} required />
          <label>Requested check-in<input type="time" value={corr.requestedCheckIn} onChange={(e) => setCorr({ ...corr, requestedCheckIn: e.target.value })} /></label>
          <label>Requested check-out<input type="time" value={corr.requestedCheckOut} onChange={(e) => setCorr({ ...corr, requestedCheckOut: e.target.value })} /></label>
          <input placeholder="Reason" value={corr.reason} onChange={(e) => setCorr({ ...corr, reason: e.target.value })} required />
          <button className="btn primary">Submit request</button>
        </form>
      </div>
      {user.role === 'hr' && (
        <div className="card"><h2>Correction approvals</h2>
          <input placeholder="Approval comment" value={comment} onChange={(e) => setComment(e.target.value)} />
          {corrections.length === 0 ? <EmptyState text="No records yet" /> : (
            <ul>{corrections.map((c) => <li key={c.id || c._id} className="row">{empName(c.employee)} — {c.date} — {c.requestedCheckIn || ''}{c.requestedCheckOut ? ` to ${c.requestedCheckOut}` : ''} — {c.reason || ''} ({c.status || 'pending'})
              <button className="btn primary" onClick={() => decide(c.id || c._id, 'approved')}>Approve</button>
              <button className="btn danger" onClick={() => decide(c.id || c._id, 'rejected')}>Reject</button>
            </li>)}</ul>
          )}
        </div>
      )}
    </div>
  )
}
