import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, errMsg } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import StatCard from '../components/StatCard.jsx'
import EmptyState from '../components/EmptyState.jsx'

const label = (k) => k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())
const isNum = (v) => typeof v === 'number'

function Bars({ data }) {
  const rows = Array.isArray(data) ? data : []
  if (!rows.length) return null
  // headcountByDept: { department, headcount }; payrollCostByDept: { department, gross, net }
  const max = Math.max(1, ...rows.map((r) => Number(r.count ?? r.value ?? r.headcount ?? r.gross ?? r.net ?? 0)))
  return (
    <div className="card"><h3>Breakdown</h3>
      {rows.map((r, i) => {
        const v = Number(r.count ?? r.value ?? r.headcount ?? r.gross ?? r.net ?? 0)
        return <div className="bar-row" key={i}><span>{r.name || (typeof r.department === 'object' ? r.department.name : r.department) || r.label || `Row ${i + 1}`}</span><div><div className="bar" style={{ width: `${(v / max) * 100}%` }} /></div><span>{v}</span></div>
      })}
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [ann, setAnn] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [department, setDepartment] = useState('')
  const [departments, setDepartments] = useState([])
  const [summary, setSummary] = useState([])
  const [sumLoading, setSumLoading] = useState(false)
  const [sumError, setSumError] = useState('')
  const [checkMsg, setCheckMsg] = useState('')

  useEffect(() => {
    api.get('/departments').then(({ data: d }) => setDepartments(Array.isArray(d) ? d : [])).catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const q = new URLSearchParams()
      if (from) q.set('from', from); if (to) q.set('to', to); if (department) q.set('department', department)
      const qs = q.toString() ? `?${q}` : ''
      const { data: d } = await api.get(`/dashboard/${user.role}${qs}`)
      setData(d)
      const a = await api.get('/announcements').catch(() => ({ data: [] }))
      setAnn(Array.isArray(a.data) ? a.data : (a.data.announcements || []))
    } catch (e) { setError(errMsg(e)) } finally { setLoading(false) }
  }, [user.role, from, to, department])

  useEffect(() => { load() }, [load])

  const summarize = async () => {
    setSumLoading(true); setSumError(''); setSummary([])
    try {
      const { data: d } = await api.post('/ai/summary', { kpis: data })
      setSummary(d.bullets || d.summary || [])
    } catch (e) { setSumError(errMsg(e, 'AI summary is unavailable right now.')) } finally { setSumLoading(false) }
  }

  const check = async (kind) => {
    setCheckMsg('')
    try {
      const { data: d } = await api.post(`/attendance/check-${kind}`)
      setCheckMsg(d.message || `Checked ${kind} successfully.`)
      load()
    } catch (e) { setCheckMsg(errMsg(e)) }
  }

  if (loading) return <div className="card">Loading dashboard…</div>
  if (error) return <div className="card"><div className="error">{error}</div><button className="btn" onClick={load}>Retry</button></div>
  const kpis = data || {}
  const numeric = Object.entries(kpis).filter(([, v]) => isNum(v))
  // Backend admin/hr shape: headcountByDept [{ department, headcount }]
  const barData = data?.headcountByDept || data?.payrollCostByDept || []
  const announcements = ann.length ? ann : (data?.announcements || [])

  return (
    <div>
      <h1>{user.role === 'admin' ? 'Admin Dashboard' : user.role === 'hr' ? 'HR Dashboard' : 'My Dashboard'}</h1>
      {(user.role !== 'employee') && (
        <div className="card"><div className="form-grid">
          <label>From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label>To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <label>Department<select value={department} onChange={(e) => setDepartment(e.target.value)}>
            <option value="">All departments</option>
            {departments.map((d) => <option key={d.id || d._id} value={d.id || d._id}>{d.name}</option>)}
          </select></label>
        </div></div>
      )}
      {user.role === 'employee' && (
        <div className="card"><h2>Today's attendance</h2>
          <div className="row">
            <button className="btn primary" onClick={() => check('in')}>Check in</button>
            <button className="btn" onClick={() => check('out')}>Check out</button>
            <Link className="btn" to="/attendance/camera">Camera check-in</Link>
          </div>
          {checkMsg && <p>{checkMsg}</p>}
          {/* Employee widget reads the /dashboard/employee response itself. */}
          <p className="muted">Hours this week: {data?.hoursThisWeek ?? '—'} / {data?.hoursTarget ?? 40} · Late count: {data?.lateCount ?? '—'} · Attendance rate: {data?.attendanceRate ?? '—'}%</p>
        </div>
      )}
      <div className="grid" style={{ marginBottom: 16 }}>
        {numeric.length ? numeric.map(([k, v]) => <StatCard key={k} label={label(k)} value={v} />) : <EmptyState text="No KPIs yet — records will appear once employees, attendance and leave are added." />}
      </div>
      <Bars data={barData} />
      {user.role === 'employee' && (
        <div className="grid" style={{ marginBottom: 16 }}>
          {(data?.leaveBalance || []).map((b, i) => <StatCard key={b.leaveType || i} label={`${b.name || 'Leave'} balance`} value={b.quota === null ? 'Unlimited' : `${b.remaining ?? '—'} / ${b.quota}`} />)}
          {data?.lastPayslip ? <StatCard label="Last payslip" value={`${data.lastPayslip.month || ''} — Net ${data.lastPayslip.net ?? '—'}`} /> : null}
        </div>
      )}
      {user.role !== 'employee' && (
        <div className="card">
          <h2>AI Summary</h2>
          <button className="btn primary" onClick={summarize} disabled={sumLoading}>{sumLoading ? 'Summarizing…' : 'Summarize'}</button>
          {sumError && <div className="error">{sumError}</div>}
          {summary.length ? <ul>{summary.map((s, i) => <li key={i}>{typeof s === 'string' ? s : s.text || JSON.stringify(s)}</li>)}</ul> : <p className="muted">Get 3–5 bullets from the KPIs above.</p>}
        </div>
      )}
      <div className="card"><h2>Announcements</h2>
        {announcements.length ? announcements.map((a, i) => <div key={a.id || a._id || i}><strong>{a.title || 'Announcement'}</strong><p>{a.message || a.body || ''}</p></div>) : <EmptyState text="No announcements yet" />}
      </div>
    </div>
  )
}
