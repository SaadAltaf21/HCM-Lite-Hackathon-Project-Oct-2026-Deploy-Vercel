import { useEffect, useState } from 'react'
import { api, errMsg, downloadBlob } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import EmptyState from '../components/EmptyState.jsx'

const fullName = (e) => `${e.firstName || ''} ${e.lastName || ''}`.trim() || e.email || ''
const itemName = (r) => {
  if (r.employeeName) return r.employeeName
  if (r.employee && typeof r.employee === 'object') return `${r.employee.firstName || ''} ${r.employee.lastName || ''}`.trim() || r.employee.code || ''
  return r.employeeCode || ''
}

export default function Payroll() {
  const { user } = useAuth()
  const [employees, setEmployees] = useState([])
  const [empId, setEmpId] = useState('')
  const [structure, setStructure] = useState({ basic: '', hra: '', medical: '', gross: '' })
  const [runs, setRuns] = useState([])
  const [runDetail, setRunDetail] = useState(null)
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const [payslips, setPayslips] = useState([])
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  const loadRuns = async () => {
    try {
      const r = await api.get('/payroll/runs'); setRuns(Array.isArray(r.data) ? r.data : [])
    } catch { /* HR/employee may not list runs */ }
  }
  useEffect(() => {
    // Backend GET /employees: { data: [...], ... }
    api.get('/employees?limit=100').then(({ data }) => setEmployees(Array.isArray(data) ? data : (data.data || []))).catch(() => {})
    loadRuns()
    api.get('/payroll/payslips/mine').then(({ data }) => setPayslips(Array.isArray(data) ? data : [])).catch(() => {})
  }, [])

  const loadStructure = async (id) => {
    setEmpId(id)
    if (!id) return
    try {
      // Backend: { employee, basic, hra, medical, gross }
      const { data } = await api.get(`/payroll/structure/${id}`)
      setStructure({ basic: data.basic ?? '', hra: data.hra ?? '', medical: data.medical ?? '', gross: data.gross ?? '' })
    } catch (e) { setError(errMsg(e)) }
  }
  const saveStructure = async (e) => {
    e.preventDefault()
    try { await api.patch(`/payroll/structure/${empId}`, { basic: Number(structure.basic), hra: Number(structure.hra), medical: Number(structure.medical) }); setMsg('Salary structure saved.') } catch (err) { setMsg(errMsg(err)) }
  }
  const createRun = async () => {
    try { const { data } = await api.post('/payroll/runs', { month }); setMsg(data.message || 'Payroll run created.'); loadRuns() } catch (err) { setMsg(errMsg(err)) }
  }
  const viewRun = async (id) => {
    try { const { data } = await api.get(`/payroll/runs/${id}`); setRunDetail(data) } catch (err) { setMsg(errMsg(err)) }
  }
  const finalize = async (id) => {
    if (!confirm('Finalize this payroll run?')) return
    try { await api.post(`/payroll/runs/${id}/finalize`); setMsg('Run finalized.'); loadRuns() } catch (err) { setMsg(errMsg(err)) }
  }
  const downloadPayslip = async (runId, employeeId, filename) => {
    try {
      const { data } = await api.get(`/payroll/payslips/${runId}/${employeeId}/pdf`, { responseType: 'blob' })
      downloadBlob(data, filename || 'payslip.pdf')
    } catch (err) { setMsg(errMsg(err)) }
  }

  const runItems = runDetail ? (runDetail.items || []) : []

  return (
    <div>
      <h1>Payroll</h1>
      {msg && <p>{msg}</p>}
      {error && <div className="error">{error}</div>}
      {(user.role === 'hr' || user.role === 'admin') && (
        <>
          <div className="card"><h2>Salary structure</h2>
            <select value={empId} onChange={(e) => loadStructure(e.target.value)}>
              <option value="">Select employee</option>
              {employees.map((e) => <option key={e.id || e._id} value={e.id || e._id}>{fullName(e)}</option>)}
            </select>
            {empId && (
              <form className="form-grid" onSubmit={saveStructure} style={{ marginTop: 10 }}>
                <label>Basic<input type="number" step="any" value={structure.basic} onChange={(e) => setStructure({ ...structure, basic: e.target.value })} /></label>
                <label>HRA<input type="number" step="any" value={structure.hra} onChange={(e) => setStructure({ ...structure, hra: e.target.value })} /></label>
                <label>Medical<input type="number" step="any" value={structure.medical} onChange={(e) => setStructure({ ...structure, medical: e.target.value })} /></label>
                <label>Gross (read-only)<input type="number" step="any" value={structure.gross} readOnly disabled /></label>
                <button className="btn primary">Save structure</button>
              </form>
            )}
          </div>
          <div className="card"><h2>Monthly payroll run</h2>
            <div className="row"><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /><button className="btn primary" onClick={createRun}>Create run</button></div>
            {runs.length === 0 ? <EmptyState text="No records yet" /> : (
              <ul>{runs.map((r) => <li key={r.id || r._id} className="row">{r.month} — {r.status || 'draft'}
                <button className="btn" onClick={() => viewRun(r.id || r._id)}>View</button>
                {user.role === 'admin' && <button className="btn primary" onClick={() => finalize(r.id || r._id)}>Finalize</button>}
              </li>)}</ul>
            )}
            {runDetail && (
              <div className="table-wrap"><table><thead><tr><th>Employee</th><th>Gross</th><th>Deduction</th><th>Net</th></tr></thead>
                <tbody>{runItems.map((r, i) => <tr key={i}><td>{itemName(r)}</td><td>{r.gross ?? ''}</td><td>{r.deduction ?? ''}</td><td>{r.net ?? ''}</td></tr>)}</tbody></table>
                {runItems.length === 0 && <p className="muted">This run has no items yet.</p>}
              </div>
            )}
          </div>
        </>
      )}
      <div className="card"><h2>My payslips</h2>
        {payslips.length === 0 ? <EmptyState text="No records yet" /> : (
          <ul>{payslips.map((p, i) => <li key={p.runId || i} className="row">{p.month || ''} — {p.status || ''} — Net: {p.net ?? ''}
            {/* Payslip items carry `employee` (ObjectId), not `employeeId`. */}
            <button className="btn" onClick={() => downloadPayslip(p.runId || p.run, p.employee || user.employeeId, `payslip-${p.month || 'pay'}.pdf`)}>Download PDF</button>
          </li>)}</ul>
        )}
      </div>
    </div>
  )
}
