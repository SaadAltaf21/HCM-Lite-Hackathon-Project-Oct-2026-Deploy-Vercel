// Employees: HR registers (creates the login), server search/filter/paging,
// Employee 360, CSV export / import with dry-run.
const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const Employee = require('../models/Employee');
const User = require('../models/User');
const Department = require('../models/Department');
const Designation = require('../models/Designation');
const Attendance = require('../models/Attendance');
const PayrollRun = require('../models/PayrollRun');
const { auth, requireRole, assertOwnEmployee, ownEmployeeId, companyFilter } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');
const { leaveBalanceFor } = require('../services/dashboard');
const { isValidDateStr, todayStr } = require('../services/rules');

const router = express.Router();
router.use(auth);

function csvEscape(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
// Minimal CSV parser handling quoted fields.
function parseCsv(text) {
  const rows = [];
  let row = []; let cur = ''; let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i += 1; } else inQuotes = false;
      } else cur += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cur); rows.push(row); row = []; cur = '';
    } else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

async function validateCsvRows(rows, header, companyId) {
  const cf = companyId ? { companyId } : {};
  const idx = (name) => header.findIndex((h) => h.trim().toLowerCase() === name);
  const errors = []; const valid = [];
  const depts = await Department.find(cf).lean();
  const deptByName = new Map(depts.map((d) => [d.name.toLowerCase(), d]));
  const desigs = await Designation.find(cf).lean();
  const desigByName = new Map(desigs.map((d) => [d.name.toLowerCase(), d]));
  const existing = await Employee.find(cf).select('code email').lean();
  const seenCode = new Set(existing.map((e) => e.code.toLowerCase()));
  const seenEmail = new Set(existing.map((e) => e.email.toLowerCase()));
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  for (let i = 1; i < rows.length; i += 1) {
    const rowNum = i + 1; // 1-based incl. header
    const get = (name) => (idx(name) >= 0 ? String(rows[i][idx(name)] || '').trim() : '');
    const rowErrors = [];
    const check = (field, reason) => rowErrors.push({ row: rowNum, field, reason });
    const code = get('code'); const firstName = get('firstname'); const lastName = get('lastname');
    const email = get('email').toLowerCase(); const deptName = get('department');
    const joiningDate = get('joiningdate'); const salary = Number(get('salarybasic'));
    if (!code) check('code', 'required'); else if (seenCode.has(code.toLowerCase())) check('code', 'duplicate code');
    if (!firstName) check('firstName', 'required');
    if (!lastName) check('lastName', 'required');
    if (!email) check('email', 'required'); else if (!emailRe.test(email)) check('email', 'invalid email'); else if (seenEmail.has(email)) check('email', 'duplicate email');
    if (!deptName) check('department', 'required'); else if (!deptByName.has(deptName.toLowerCase())) check('department', 'unknown department');
    if (!joiningDate) check('joiningDate', 'required'); else if (!isValidDateStr(joiningDate)) check('joiningDate', 'must be an ISO date YYYY-MM-DD');
    if (!get('salarybasic')) check('salaryBasic', 'required'); else if (!(salary > 0)) check('salaryBasic', 'must be greater than 0');
    const desigName = get('designation');
    if (desigName && !desigByName.has(desigName.toLowerCase())) check('designation', 'unknown designation');
    if (rowErrors.length) errors.push(...rowErrors);
    else {
      seenCode.add(code.toLowerCase()); seenEmail.add(email);
      valid.push({
        code, firstName, lastName, email, phone: get('phone'), address: get('address'),
        department: deptByName.get(deptName.toLowerCase())._id,
        designation: desigName ? desigByName.get(desigName.toLowerCase())._id : null,
        joiningDate, salaryBasic: salary, status: get('status') || 'active',
        gender: get('gender'), employmentType: get('employmenttype') || 'full-time',
        tempPassword: get('temppassword') || null,
      });
    }
  }
  return { errors, valid };
}

// GET /api/employees/export/csv (hr) — before /:id
router.get('/export/csv', requireRole('hr'), async (req, res) => {
  const rows = await Employee.find(companyFilter(req)).populate('department', 'name').populate('designation', 'name').sort({ code: 1 }).lean();
  const header = ['code', 'firstName', 'lastName', 'email', 'phone', 'department', 'designation', 'joiningDate', 'salaryBasic', 'status'];
  const lines = [header.join(',')];
  for (const e of rows) {
    lines.push([e.code, e.firstName, e.lastName, e.email, e.phone, e.department?.name || '', e.designation?.name || '', e.joiningDate, e.salaryBasic, e.status].map(csvEscape).join(','));
  }
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="employees.csv"');
  res.send(lines.join('\n'));
});

router.post('/import/dry-run', requireRole('hr'), async (req, res) => {
  const { csv } = req.body || {};
  if (!csv || typeof csv !== 'string') return res.status(400).json({ error: 'csv text is required' });
  const rows = parseCsv(csv);
  if (rows.length < 2) return res.status(400).json({ error: 'csv must have a header row and at least one data row' });
  const { errors, valid } = await validateCsvRows(rows, rows[0], req.companyId);
  res.json({ errors, validCount: valid.length, totalRows: rows.length - 1 });
});

router.post('/import/confirm', requireRole('hr'), async (req, res) => {
  const { csv } = req.body || {};
  if (!csv || typeof csv !== 'string') return res.status(400).json({ error: 'csv text is required' });
  const rows = parseCsv(csv);
  if (rows.length < 2) return res.status(400).json({ error: 'csv must have a header row and at least one data row' });
  const { errors, valid } = await validateCsvRows(rows, rows[0], req.companyId);
  const created = [];
  for (const v of valid) {
    const tempPassword = v.tempPassword || crypto.randomBytes(6).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10);
    const user = await User.create({
      name: `${v.firstName} ${v.lastName}`, email: v.email,
      passwordHash: await bcrypt.hash(tempPassword, 10), role: 'employee', mustChangePassword: true,
      companyId: req.companyId || null,
    });
    const emp = await Employee.create({ ...v, tempPassword: undefined, user: user._id, companyId: req.companyId || null });
    user.employeeId = emp._id; await user.save();
    created.push({ id: emp._id, code: emp.code, email: emp.email, tempPassword });
    await logAudit(req, 'CREATE', 'Employee', emp._id, null, { code: emp.code, email: emp.email });
  }
  res.status(201).json({ created, errors });
});

// POST /api/employees (hr only) — creates Employee + login with temp password.
router.post('/', requireRole('hr'), async (req, res) => {
  const { code, firstName, lastName, email, phone, address, department, designation, joiningDate, salaryBasic, status, gender, employmentType, tempPassword } = req.body || {};
  if (!code || !firstName || !lastName || !email || !department || !joiningDate || !(salaryBasic > 0)) {
    return res.status(400).json({ error: 'code, firstName, lastName, email, department, joiningDate and salaryBasic > 0 are required' });
  }
  if (!isValidDateStr(joiningDate)) return res.status(400).json({ error: 'joiningDate must be YYYY-MM-DD' });
  // Validate references before creating the login, so a bad department cannot
  // leave an orphan User row behind.
  if (!(await Department.findOne({ _id: department, ...companyFilter(req) }))) return res.status(400).json({ error: 'Unknown department' });
  if (designation && !(await Designation.findOne({ _id: designation, ...companyFilter(req) }))) return res.status(400).json({ error: 'Unknown designation' });
  try {
    const temp = tempPassword || crypto.randomBytes(6).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10);
    const user = await User.create({
      name: `${firstName} ${lastName}`, email: String(email).toLowerCase(),
      passwordHash: await bcrypt.hash(temp, 10), role: 'employee', mustChangePassword: true,
      companyId: req.companyId || null,
    });
    const emp = await Employee.create({
      code, firstName, lastName, email: String(email).toLowerCase(), phone: phone || '',
      address: address || '', department, designation: designation || null, joiningDate,
      salaryBasic, status: status || 'active', gender: gender || '', employmentType: employmentType || 'full-time',
      user: user._id, companyId: req.companyId || null,
    });
    user.employeeId = emp._id; await user.save();
    await logAudit(req, 'CREATE', 'Employee', emp._id, null, { code, email });
    return res.status(201).json({ employee: emp, tempPassword: temp });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Employee code or email already exists' });
    return res.status(400).json({ error: err.message });
  }
});

// GET /api/employees — server search/filter/paging; employees see only themselves.
router.get('/', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const filter = companyFilter(req);
  if (req.user.role === 'employee') {
    if (!ownEmployeeId(req)) return res.json({ data: [], page, limit, total: 0, totalPages: 0 });
    filter._id = req.user.employeeId;
  }
  if (req.query.department) filter.department = req.query.department;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.search) {
    const q = new RegExp(req.query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ firstName: q }, { lastName: q }, { code: q }, { email: q }];
  }
  const total = await Employee.countDocuments(filter);
  const data = await Employee.find(filter).populate('department', 'name').populate('designation', 'name')
    .sort({ createdAt: 1 }).skip((page - 1) * limit).limit(limit);
  res.json({ data, page, limit, total, totalPages: Math.ceil(total / limit) });
});

// GET /api/employees/:id — Employee 360: profile + attendance summary + leave balance + latest payslip.
router.get('/:id', async (req, res) => {
  if (!assertOwnEmployee(req, res, req.params.id)) return;
  const emp = await Employee.findOne({ _id: req.params.id, ...companyFilter(req) }).populate('department', 'name').populate('designation', 'name');
  if (!emp) return res.status(404).json({ error: 'Employee not found' });
  const att = await Attendance.find({ employee: emp._id }).lean();
  const attendanceSummary = {
    total: att.length,
    present: att.filter((a) => a.status === 'present').length,
    late: att.filter((a) => a.status === 'late').length,
    halfDay: att.filter((a) => a.status === 'half_day').length,
    missingCheckout: att.filter((a) => a.status === 'missing_checkout').length,
    hours: Math.round(att.reduce((s, a) => s + (a.hours || 0), 0) * 100) / 100,
  };
  const leaveBalance = await leaveBalanceFor(emp._id, Number(todayStr().slice(0, 4)), req.companyId);
  const runs = await PayrollRun.find(companyFilter(req)).sort({ month: -1 }).lean();
  let latestPayslip = null;
  for (const run of runs) {
    const item = run.items.find((i) => String(i.employee) === String(emp._id));
    if (item) { latestPayslip = { month: run.month, status: run.status, ...item }; break; }
  }
  res.json({ employee: emp, attendanceSummary, leaveBalance, latestPayslip });
});

// PATCH — hr edits details; employee edits only own phone/address.
router.patch('/:id', async (req, res) => {
  if (req.user.role === 'employee') {
    if (!assertOwnEmployee(req, res, req.params.id)) return;
    const allowed = {};
    if (req.body.phone !== undefined) allowed.phone = req.body.phone;
    if (req.body.address !== undefined) allowed.address = req.body.address;
    const doc = await Employee.findOneAndUpdate({ _id: req.params.id, ...companyFilter(req) }, allowed, { new: true, runValidators: true });
    if (!doc) return res.status(404).json({ error: 'Employee not found' });
    await logAudit(req, 'UPDATE', 'Employee', doc._id, null, allowed);
    return res.json(doc);
  }
  if (req.user.role !== 'hr') return res.status(403).json({ error: 'Forbidden: insufficient role' });
  const before = await Employee.findOne({ _id: req.params.id, ...companyFilter(req) });
  if (!before) return res.status(404).json({ error: 'Employee not found' });
  if (req.body.salaryBasic !== undefined && !(req.body.salaryBasic > 0)) {
    return res.status(400).json({ error: 'salaryBasic must be greater than 0' });
  }
  const doc = await Employee.findOneAndUpdate({ _id: req.params.id, ...companyFilter(req) }, req.body, { new: true, runValidators: true });
  await logAudit(req, 'UPDATE', 'Employee', doc._id, before, doc);
  res.json(doc);
});

module.exports = router;
