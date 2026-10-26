import { useEffect, useState } from 'react'
import { api, errMsg } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import StatCard from '../components/StatCard.jsx'
import EmptyState from '../components/EmptyState.jsx'

const empName = (r) => {
  if (r && typeof r === 'object') return `${r.firstName || ''} ${r.lastName || ''}`.trim() || r.code || ''
  return typeof r === 'string' ? r : ''
}
const typeName = (t) => (t && typeof t === 'object' ? t.name || '' : (typeof t === 'string' ? t : ''))

export default function Leave() {
  const { user } = useAuth()
  const isAdmin = user.role === 'admin'
  const isHr = user.role === 'hr'
  const [rows, setRows] = useState([])
  const [balance, setBalance] = useState([])
  const [types, setTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [form, setForm] = useState({ leaveType: '', startDate: '', endDate: '', reason: '' })
  const [smartText, setSmartText] = useState('')
  const [comment, setComment] = useState('')

  const load = async () => {
    setLoading(true); setError('')
    try {
      const l = await api.get('/leave'); setRows(Array.isArray(l.data) ? l.data : [])
    } catch (e) { setError(errMsg(e)) }
    // Balance is per-employee; admin/hr logins are not linked to an employee
    // record, so a failure here must not wipe out the history above.
    try {
      const b = await api.get('/leave/balance'); setBalance(Array.isArray(b.data) ? b.data : [])
    } catch { setBalance([]) }
    try {
      const t = await api.get('/leave-types'); setTypes(Array.isArray(t.data) ? t.data : [])
    } catch { setTypes([]) }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const setF = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const apply = async (e) => {
    e.preventDefault()
    try { await api.post('/leave', form); setMsg('Leave request submitted.'); load() } catch (err) { setMsg(errMsg(err)) }
  }
  const smart = async () => {
    try {
      const { data } = await api.post('/ai/smart-leave', { text: smartText })
      // Backend returns a type NAME string (e.g. 'casual'), not an ObjectId:
      // map it case-insensitively to the loaded leave-type's ObjectId.
      const matched = data.type ? types.find((t) => String(t.name || '').toLowerCase() === String(data.type).toLowerCase()) : null
      setForm((f) => ({
        ...f,
        leaveType: matched ? (matched.id || matched._id) : f.leaveType,
        startDate: data.start || f.startDate,
        endDate: data.end || f.endDate,
        reason: data.reason || f.reason,
      }))
      setMsg(`Smart-leave filled the form below — please review and confirm before submitting.${matched ? '' : (data.type ? ` (No leave type named "${data.type}" exists — pick one from the list.)` : '')}${data.balanceNote ? ` ${data.balanceNote}` : ''}`)
    } catch (err) { setMsg(errMsg(err, 'Smart leave is unavailable right now. Fill the form manually.')) }
  }
  const decide = async (id, action) => {
    try { await api.patch(`/leave/${id}/${action}`, { approverComment: comment }); load() } catch (err) { setMsg(errMsg(err)) }
  }
  const cancel = async (id) => {
    try { await api.patch(`/leave/${id}/cancel`); load() } catch (err) { setMsg(errMsg(err)) }
  }

  return (
    <div>
      <h1>Leave</h1>
      {msg && <p>{msg}</p>}
      {error && <div className="error">{error}</div>}
      <div className="grid" style={{ marginBottom: 16 }}>
        {balance.length ? balance.map((b, i) => <StatCard key={b.leaveType || i} label={`${b.name || 'Leave'}`} value={b.quota === null || b.quota === undefined ? 'Unlimited' : `${b.remaining ?? '—'} / ${b.quota}`} />) : <EmptyState text="No leave balance yet" />}
      </div>
      {!isAdmin && (
        <>
          <div className="card"><h2>Smart leave</h2>
            <p className="muted">Type a sentence, e.g. “I need annual leave from Monday to Wednesday for a family trip.”</p>
            <div className="row"><input className="grow" value={smartText} onChange={(e) => setSmartText(e.target.value)} placeholder="Describe your leave in one sentence…" /><button className="btn" onClick={smart}>Parse with AI</button></div>
          </div>
          <div className="card"><h2>Apply for leave</h2>
            <form className="form-grid" onSubmit={apply}>
              {types.length ? (
                <select value={form.leaveType} onChange={setF('leaveType')} required><option value="">Select type</option>{types.map((t) => <option key={t.id || t._id} value={t.id || t._id}>{t.name}</option>)}</select>
              ) : <input placeholder="Leave type" value={form.leaveType} onChange={setF('leaveType')} required />}
              <input type="date" value={form.startDate} onChange={setF('startDate')} required />
              <input type="date" value={form.endDate} onChange={setF('endDate')} required />
              <input placeholder="Reason" value={form.reason} onChange={setF('reason')} required />
              <button className="btn primary">Submit leave request</button>
            </form>
          </div>
        </>
      )}
      <div className="card"><h2>Leave history</h2>
        {loading ? <p>Loading…</p> : rows.length === 0 ? <EmptyState text="No records yet" /> : (
          <div>
            {isHr && <input placeholder="Approval comment" value={comment} onChange={(e) => setComment(e.target.value)} style={{ marginBottom: 10 }} />}
            <div className="table-wrap"><table><thead><tr><th>Employee</th><th>Type</th><th>Dates</th><th>Reason</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.id || r._id}>
                  <td>{empName(r.employee)}</td><td>{typeName(r.leaveType)}</td>
                  <td>{r.startDate} → {r.endDate}</td><td>{r.reason}</td><td>{r.status}</td>
                  <td><div className="row">
                    {isHr && <><button className="btn primary" onClick={() => decide(r.id || r._id, 'approve')}>Approve</button><button className="btn danger" onClick={() => decide(r.id || r._id, 'reject')}>Reject</button></>}
                    <button className="btn" onClick={() => cancel(r.id || r._id)}>Cancel</button>
                  </div></td>
                </tr>))}</tbody></table></div>
          </div>
        )}
      </div>
    </div>
  )
}
