import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api, errMsg } from '../api.js'
import EmptyState from '../components/EmptyState.jsx'

const strField = (v) => (v && typeof v === 'object' ? (v.name || '') : (typeof v === 'string' ? v : ''))

export default function EmployeeDetail() {
  const { id } = useParams()
  const [d, setD] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    api.get(`/employees/${id}`).then(({ data }) => setD(data)).catch((e) => setError(errMsg(e))).finally(() => setLoading(false))
  }, [id])
  if (loading) return <div className="card">Loading profile…</div>
  if (error) return <div className="card"><div className="error">{error}</div></div>
  if (!d) return <EmptyState text="No records yet" />
  const emp = d.employee || d
  const fullName = `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || emp.email || ''
  // Backend keys: attendanceSummary, leaveBalance, latestPayslip
  const has360 = Boolean(d.attendanceSummary) || (Array.isArray(d.leaveBalance) && d.leaveBalance.length > 0) || Boolean(d.latestPayslip)
  return (
    <div>
      <h1>{fullName}</h1>
      <div className="card"><div className="form-grid">
        <div><strong>Code:</strong> {emp.code || '—'}</div>
        <div><strong>Email:</strong> {emp.email}</div>
        <div><strong>Department:</strong> {strField(emp.department) || '—'}</div>
        <div><strong>Designation:</strong> {strField(emp.designation) || '—'}</div>
        <div><strong>Status:</strong> {emp.status || '—'}</div>
        <div><strong>Phone:</strong> {emp.phone || '—'}</div>
        <div><strong>Address:</strong> {emp.address || '—'}</div>
        <div><strong>Joining date:</strong> {emp.joiningDate || '—'}</div>
        <div><strong>Basic salary:</strong> {emp.salaryBasic ?? '—'}</div>
      </div></div>
      {d.attendanceSummary && (
        <div className="card"><h2>Attendance summary</h2>
          <div className="form-grid">
            {Object.entries(d.attendanceSummary).map(([k, v]) => <div key={k}><strong>{k}:</strong> {String(v)}</div>)}
          </div>
        </div>
      )}
      {Array.isArray(d.leaveBalance) && d.leaveBalance.length > 0 && (
        <div className="card"><h2>Leave balance</h2>
          <ul>{d.leaveBalance.map((b, i) => <li key={b.leaveType || i}>{b.name || 'Leave'}: {b.quota === null ? 'Unlimited' : `${b.remaining ?? '—'} remaining of ${b.quota}`} (used {b.used ?? 0}, pending {b.pending ?? 0})</li>)}</ul>
        </div>
      )}
      {d.latestPayslip && (
        <div className="card"><h2>Latest payslip</h2>
          <div className="form-grid">
            <div><strong>Month:</strong> {d.latestPayslip.month || '—'}</div>
            <div><strong>Status:</strong> {d.latestPayslip.status || '—'}</div>
            <div><strong>Gross:</strong> {d.latestPayslip.gross ?? '—'}</div>
            <div><strong>Deduction:</strong> {d.latestPayslip.deduction ?? '—'}</div>
            <div><strong>Tax:</strong> {d.latestPayslip.tax ?? '—'}</div>
            <div><strong>Net:</strong> {d.latestPayslip.net ?? '—'}</div>
          </div>
        </div>
      )}
      {!has360 && <EmptyState text="No 360 records yet" />}
    </div>
  )
}
