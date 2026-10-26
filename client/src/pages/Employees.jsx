import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, errMsg, downloadBlob } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import EmptyState from '../components/EmptyState.jsx'

const fullName = (r) => `${r.firstName || ''} ${r.lastName || ''}`.trim() || r.email || ''
const deptName = (r) => (r.department && typeof r.department === 'object' ? r.department.name || '' : (typeof r.department === 'string' ? r.department : ''))
const desigName = (r) => (r.designation && typeof r.designation === 'object' ? r.designation.name || '' : (typeof r.designation === 'string' ? r.designation : ''))

export default function Employees() {
  const { user } = useAuth()
  // POST /employees is HR-only on the server; admin views but does not create.
  const canCreate = user.role === 'hr'
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [department, setDepartment] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [departments, setDepartments] = useState([])
  const [designations, setDesignations] = useState([])
  const [form, setForm] = useState({ code: '', firstName: '', lastName: '', email: '', phone: '', address: '', department: '', designation: '', joiningDate: '', salaryBasic: '', tempPassword: '' })
  const [formMsg, setFormMsg] = useState('')
  const [csv, setCsv] = useState('')
  const [dry, setDry] = useState(null)
  const [importMsg, setImportMsg] = useState('')

  useEffect(() => {
    api.get('/departments').then(({ data }) => setDepartments(Array.isArray(data) ? data : [])).catch(() => {})
    api.get('/designations').then(({ data }) => setDesignations(Array.isArray(data) ? data : [])).catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const q = new URLSearchParams({ search, department, status, page: String(page), limit: '20' })
      const { data } = await api.get(`/employees?${q}`)
      // Backend: { data: [...], page, limit, total, totalPages }
      const list = Array.isArray(data) ? data : (data.data || [])
      setRows(list); setTotal(data.total ?? list.length)
    } catch (e) { setError(errMsg(e)) } finally { setLoading(false) }
  }, [search, department, status, page])

  useEffect(() => { load() }, [load])

  const setF = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const create = async (e) => {
    e.preventDefault(); setFormMsg('')
    try {
      const payload = {
        code: form.code,
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone,
        address: form.address,
        department: form.department,
        joiningDate: form.joiningDate,
        salaryBasic: Number(form.salaryBasic),
      }
      if (form.designation) payload.designation = form.designation
      if (form.tempPassword) payload.tempPassword = form.tempPassword
      const { data } = await api.post('/employees', payload)
      setFormMsg(data.tempPassword ? `Employee created. Temporary password: ${data.tempPassword}` : 'Employee created.')
      load()
    } catch (err) { setFormMsg(errMsg(err)) }
  }
  const exportCsv = async () => {
    const { data } = await api.get('/employees/export/csv', { responseType: 'blob' })
    downloadBlob(data, 'employees.csv')
  }
  const dryRun = async () => {
    setImportMsg('')
    try { const { data } = await api.post('/employees/import/dry-run', { csv }); setDry(data) } catch (e) { setImportMsg(errMsg(e)) }
  }
  const confirmImport = async () => {
    try { const { data } = await api.post('/employees/import/confirm', { csv }); setImportMsg(data.message || 'Import confirmed.'); setDry(null); load() } catch (e) { setImportMsg(errMsg(e)) }
  }

  return (
    <div>
      <h1>Employees</h1>
      <div className="card"><div className="form-grid">
        <input placeholder="Search name / email" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
        <select value={department} onChange={(e) => { setDepartment(e.target.value); setPage(1) }}>
          <option value="">All departments</option>
          {departments.map((d) => <option key={d.id || d._id} value={d.id || d._id}>{d.name}</option>)}
        </select>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
          <option value="">All statuses</option><option value="active">Active</option><option value="probation">Probation</option><option value="exited">Exited</option>
        </select>
        {canCreate && <button className="btn" onClick={exportCsv}>Export CSV</button>}
      </div></div>

      {loading ? <div className="card">Loading employees…</div> : error ? <div className="card"><div className="error">{error}</div></div> : rows.length === 0 ? <EmptyState text="No records yet" /> : (
        <div className="card table-wrap"><table><thead><tr><th>Name</th><th>Code</th><th>Email</th><th>Department</th><th>Designation</th><th>Status</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id || r._id}>
              <td><Link to={`/employees/${r.id || r._id}`}>{fullName(r)}</Link></td>
              <td>{r.code || ''}</td>
              <td>{r.email}</td><td>{deptName(r)}</td>
              <td>{desigName(r)}</td><td>{r.status || 'active'}</td>
            </tr>))}</tbody></table>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
            <span>Page {page}{total ? ` · ${total} total` : ''}</span>
            <button className="btn" disabled={rows.length < 20} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        </div>
      )}

      {canCreate && (
        <div className="card"><h2>Add employee</h2>
          {formMsg && <p>{formMsg}</p>}
          <form className="form-grid" onSubmit={create}>
            <input required placeholder="Employee code" value={form.code} onChange={setF('code')} />
            <input required placeholder="First name" value={form.firstName} onChange={setF('firstName')} />
            <input required placeholder="Last name" value={form.lastName} onChange={setF('lastName')} />
            <input required type="email" placeholder="Email" value={form.email} onChange={setF('email')} />
            <input placeholder="Phone" value={form.phone} onChange={setF('phone')} />
            <input placeholder="Address" value={form.address} onChange={setF('address')} />
            <select required value={form.department} onChange={setF('department')}>
              <option value="">Select department</option>
              {departments.map((d) => <option key={d.id || d._id} value={d.id || d._id}>{d.name}</option>)}
            </select>
            <select value={form.designation} onChange={setF('designation')}>
              <option value="">Select designation (optional)</option>
              {designations.map((d) => <option key={d.id || d._id} value={d.id || d._id}>{d.name}</option>)}
            </select>
            <input required type="date" value={form.joiningDate} onChange={setF('joiningDate')} />
            <input required type="number" step="any" min="0" placeholder="Basic salary" value={form.salaryBasic} onChange={setF('salaryBasic')} />
            <input type="password" placeholder="Temporary password (optional — one is generated if left blank)" value={form.tempPassword} onChange={setF('tempPassword')} />
            <button className="btn primary">Create employee</button>
          </form>
        </div>
      )}

      {canCreate && (
        <div className="card"><h2>CSV import</h2>
          <p className="muted">Paste CSV, run a dry-run to check errors, then confirm.</p>
          <input type="file" accept=".csv,text/csv" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setCsv(await f.text()) }} />
          <textarea value={csv} onChange={(e) => setCsv(e.target.value)} placeholder="code,firstName,lastName,email,department,designation,..." />
          <div className="row"><button className="btn" onClick={dryRun}>Dry-run check</button><button className="btn primary" onClick={confirmImport} disabled={!dry}>Confirm import</button></div>
          {importMsg && <p>{importMsg}</p>}
          {dry && (
            <div>
              <p>Valid: {dry.validCount ?? dry.valid ?? '—'} · Errors: {(dry.errors || []).length}</p>
              {(dry.errors || []).length ? (
                <div className="table-wrap"><table><thead><tr><th>Row</th><th>Error</th></tr></thead>
                  <tbody>{dry.errors.map((er, i) => <tr key={i}><td>{er.row ?? i + 1}</td><td>{er.message || er.error || JSON.stringify(er)}</td></tr>)}</tbody></table></div>
              ) : <p>No errors found.</p>}
              {dry.preview && <p className="muted">Preview rows: {dry.preview.length}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
