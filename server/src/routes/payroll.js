// Payroll Lite: salary structure, monthly draft runs, admin finalize (locks),
// payslip list + PDF (pdfkit, scope-checked).
const express = require('express');
const PDFDocument = require('pdfkit');
const PayrollRun = require('../models/PayrollRun');
const Employee = require('../models/Employee');
const Notification = require('../models/Notification');
const { auth, requireRole, assertOwnEmployee, ownEmployeeId, companyFilter } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');
const { computePayrollRun, structureFor } = require('../services/payroll');
const { isValidMonthStr } = require('../services/rules');

const router = express.Router();
router.use(auth);

router.get('/structure/:employeeId', requireRole('admin', 'hr'), async (req, res) => {
  const emp = await Employee.findOne({ _id: req.params.employeeId, ...companyFilter(req) });
  if (!emp) return res.status(404).json({ error: 'Employee not found' });
  res.json({ employee: emp._id, ...structureFor(emp) });
});

router.patch('/structure/:employeeId', requireRole('hr'), async (req, res) => {
  const emp = await Employee.findOne({ _id: req.params.employeeId, ...companyFilter(req) });
  if (!emp) return res.status(404).json({ error: 'Employee not found' });
  const before = emp.toObject();
  if (req.body.salaryBasic !== undefined) {
    if (!(req.body.salaryBasic > 0)) return res.status(400).json({ error: 'salaryBasic must be greater than 0' });
    emp.salaryBasic = req.body.salaryBasic;
  }
  if (req.body.salaryHra !== undefined) emp.salaryHra = req.body.salaryHra;
  if (req.body.salaryMedical !== undefined) emp.salaryMedical = req.body.salaryMedical;
  // Accept the brief's "basic/allowances" wording too.
  if (req.body.basic !== undefined) emp.salaryBasic = req.body.basic;
  if (req.body.hra !== undefined) emp.salaryHra = req.body.hra;
  if (req.body.medical !== undefined) emp.salaryMedical = req.body.medical;
  await emp.save();
  await logAudit(req, 'UPDATE', 'Employee', emp._id, before, emp);
  res.json({ employee: emp._id, ...structureFor(emp) });
});

router.post('/runs', requireRole('hr'), async (req, res) => {
  const { month } = req.body || {};
  if (!isValidMonthStr(month)) return res.status(400).json({ error: 'month must be YYYY-MM' });
  if (await PayrollRun.findOne({ month, ...companyFilter(req) })) return res.status(409).json({ error: `Payroll run for ${month} already exists` });
  const computed = await computePayrollRun(month, req.companyId);
  const run = await PayrollRun.create({ month, status: 'draft', items: computed.items, companyId: req.companyId || null });
  await logAudit(req, 'CREATE', 'PayrollRun', run._id, null, { month, itemCount: run.items.length });
  res.status(201).json(run);
});

router.get('/runs', requireRole('admin', 'hr'), async (req, res) => {
  res.json(await PayrollRun.find(companyFilter(req)).sort({ month: -1 }));
});

router.get('/payslips/mine', async (req, res) => {
  if (!ownEmployeeId(req)) return res.status(403).json({ error: 'This login is not linked to an employee record' });
  const runs = await PayrollRun.find(companyFilter(req)).sort({ month: -1 }).lean();
  const out = [];
  for (const run of runs) {
    const item = run.items.find((i) => String(i.employee) === String(ownEmployeeId(req)));
    if (item) out.push({ runId: run._id, month: run.month, status: run.status, ...item });
  }
  res.json(out);
});

router.get('/runs/:id', requireRole('admin', 'hr'), async (req, res) => {
  const run = await PayrollRun.findOne({ _id: req.params.id, ...companyFilter(req) }).populate('items.employee', 'code firstName lastName');
  if (!run) return res.status(404).json({ error: 'Payroll run not found' });
  res.json(run);
});

router.post('/runs/:id/finalize', requireRole('admin'), async (req, res) => {
  const run = await PayrollRun.findOne({ _id: req.params.id, ...companyFilter(req) });
  if (!run) return res.status(404).json({ error: 'Payroll run not found' });
  if (run.status === 'finalized') return res.status(409).json({ error: 'Payroll run is already finalized' });
  const before = run.toObject();
  run.status = 'finalized'; run.finalizedAt = new Date(); await run.save();
  // Notify every employee in the run.
  for (const item of run.items) {
    const emp = await Employee.findById(item.employee);
    if (emp && emp.user) {
      await Notification.create({ user: emp.user, companyId: emp.companyId || req.companyId || null, message: `Your payslip for ${run.month} is ready.`, type: 'payroll' });
    }
  }
  await logAudit(req, 'FINALIZE', 'PayrollRun', run._id, before, run);
  res.json(run);
});

// Payslip PDF — admin/hr any, employee only their own.
router.get('/payslips/:runId/:employeeId/pdf', async (req, res) => {
  if (!assertOwnEmployee(req, res, req.params.employeeId)) return;
  const run = await PayrollRun.findOne({ _id: req.params.runId, ...companyFilter(req) });
  if (!run) return res.status(404).json({ error: 'Payroll run not found' });
  const item = run.items.find((i) => String(i.employee) === String(req.params.employeeId));
  if (!item) return res.status(404).json({ error: 'Payslip not found for this employee in this run' });
  const emp = await Employee.findOne({ _id: req.params.employeeId, ...companyFilter(req) }).populate('department', 'name').populate('designation', 'name');
  const Setting = require('../models/Setting');
  const setting = req.companyId ? await Setting.findById(req.companyId) : await Setting.findOne();
  const doc = new PDFDocument({ margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="payslip-${run.month}-${item.employeeCode}.pdf"`);
  doc.pipe(res);
  doc.fontSize(20).text(setting?.companyName || 'HCM Lite', { align: 'center' });
  doc.fontSize(14).text(`Payslip — ${run.month}`, { align: 'center' });
  doc.moveDown();
  doc.fontSize(12)
    .text(`Employee: ${item.employeeName} (${item.employeeCode})`)
    .text(`Department: ${emp?.department?.name || ''} | Designation: ${emp?.designation?.name || ''}`)
    .text(`Run status: ${run.status}`)
    .moveDown()
    .text(`Basic: ${item.basic}`)
    .text(`HRA: ${item.hra}`)
    .text(`Medical: ${item.medical}`)
    .text(`Gross: ${item.gross}`)
    .text(`Working days: ${item.workingDays} | Days employed: ${item.daysEmployed}`)
    .text(`Absent days: ${item.absentDays} | Unpaid days: ${item.unpaidDays} | Half days: ${item.halfDays}`)
    .text(`Deduction: ${item.deduction}`)
    .text(`Tax: ${item.tax}`)
    .moveDown().fontSize(14).text(`Net pay: ${item.net}`);
  doc.end();
});

module.exports = router;
