// Leave: working-day calculation, overlap + balance guards (422), approval inbox.
const express = require('express');
const LeaveRequest = require('../models/LeaveRequest');
const LeaveType = require('../models/LeaveType');
const Employee = require('../models/Employee');
const Notification = require('../models/Notification');
const { auth, requireRole, ownEmployeeId, scopeFilter } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');
const { getSetting, workingDaysBetween, isValidDateStr, todayStr } = require('../services/rules');
const { leaveBalanceFor } = require('../services/dashboard');

const router = express.Router();
router.use(auth);

async function resolveEmployee(req, res) {
  const id = ownEmployeeId(req);
  if (!id) { res.status(403).json({ error: 'This login is not linked to an employee record' }); return null; }
  const emp = await Employee.findById(id);
  if (!emp) { res.status(404).json({ error: 'Employee record not found' }); return null; }
  return emp;
}

router.post('/', async (req, res) => {
  const emp = await resolveEmployee(req, res); if (!emp) return;
  const { leaveType, startDate, endDate, reason } = req.body || {};
  if (!leaveType || !startDate || !endDate) return res.status(400).json({ error: 'leaveType, startDate and endDate are required' });
  if (!isValidDateStr(startDate) || !isValidDateStr(endDate) || endDate < startDate) {
    return res.status(400).json({ error: 'Invalid date range (YYYY-MM-DD, endDate >= startDate)' });
  }
  const type = await LeaveType.findById(leaveType);
  if (!type) return res.status(404).json({ error: 'Leave type not found' });
  const setting = await getSetting();
  const workingDays = (await workingDaysBetween(startDate, endDate, setting)).length;
  if (workingDays === 0) return res.status(422).json({ error: 'Selected range has no working days (weekends/holidays only)' });

  // Overlap with any pending/approved request.
  const overlap = await LeaveRequest.findOne({
    employee: emp._id, status: { $in: ['pending', 'approved'] },
    startDate: { $lte: endDate }, endDate: { $gte: startDate },
  });
  if (overlap) return res.status(422).json({ error: 'Leave overlaps an existing pending or approved request' });

  // Over-balance: approved + pending in the same calendar year vs quota (unpaid unlimited).
  const unlimited = type.annualQuota === null || type.name.toLowerCase() === 'unpaid';
  if (!unlimited) {
    const year = startDate.slice(0, 4);
    const existing = await LeaveRequest.find({
      employee: emp._id, leaveType: type._id, status: { $in: ['pending', 'approved'] },
      startDate: { $gte: `${year}-01-01`, $lte: `${year}-12-31` },
    });
    const used = existing.reduce((s, r) => s + r.workingDays, 0);
    if (used + workingDays > type.annualQuota) {
      return res.status(422).json({ error: `Over balance: ${used} days already used/pending of ${type.annualQuota} for ${type.name}` });
    }
  }
  const doc = await LeaveRequest.create({
    employee: emp._id, leaveType: type._id, startDate, endDate, workingDays, reason: reason || '',
  });
  await logAudit(req, 'CREATE', 'LeaveRequest', doc._id, null, { startDate, endDate, workingDays });
  res.status(201).json(doc);
});

// Balance before /:id so "balance" is not mistaken for an id.
router.get('/balance', async (req, res) => {
  const emp = await resolveEmployee(req, res); if (!emp) return;
  const year = Number((req.query.year || todayStr().slice(0, 4)));
  res.json(await leaveBalanceFor(emp._id, year));
});

router.get('/', async (req, res) => {
  const filter = scopeFilter(req);
  if (req.query.status) filter.status = req.query.status;
  if (req.query.employeeId && req.user.role !== 'employee') filter.employee = req.query.employeeId;
  const rows = await LeaveRequest.find(filter)
    .populate('employee', 'code firstName lastName').populate('leaveType', 'name annualQuota')
    .sort({ createdAt: -1 });
  res.json(rows);
});

router.patch('/:id/approve', requireRole('hr'), async (req, res) => {
  const doc = await LeaveRequest.findById(req.params.id).populate('employee');
  if (!doc) return res.status(404).json({ error: 'Leave request not found' });
  if (doc.status !== 'pending') return res.status(409).json({ error: 'Leave request already decided' });
  const before = doc.toObject();
  doc.status = 'approved'; doc.approverComment = req.body?.approverComment || '';
  await doc.save();
  if (doc.employee && doc.employee.user) {
    await Notification.create({ user: doc.employee.user, message: `Your leave ${doc.startDate} to ${doc.endDate} was approved.`, type: 'leave' });
  }
  await logAudit(req, 'APPROVE', 'LeaveRequest', doc._id, before, doc);
  res.json(doc);
});

router.patch('/:id/reject', requireRole('hr'), async (req, res) => {
  const doc = await LeaveRequest.findById(req.params.id).populate('employee');
  if (!doc) return res.status(404).json({ error: 'Leave request not found' });
  if (doc.status !== 'pending') return res.status(409).json({ error: 'Leave request already decided' });
  const before = doc.toObject();
  doc.status = 'rejected'; doc.approverComment = req.body?.approverComment || '';
  await doc.save();
  if (doc.employee && doc.employee.user) {
    await Notification.create({ user: doc.employee.user, message: `Your leave ${doc.startDate} to ${doc.endDate} was rejected.${doc.approverComment ? ` ${doc.approverComment}` : ''}`, type: 'leave' });
  }
  await logAudit(req, 'REJECT', 'LeaveRequest', doc._id, before, doc);
  res.json(doc);
});

router.patch('/:id/cancel', async (req, res) => {
  const doc = await LeaveRequest.findById(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Leave request not found' });
  if (req.user.role === 'employee' && String(doc.employee) !== ownEmployeeId(req)) {
    return res.status(403).json({ error: 'Forbidden: employees can only cancel their own leave' });
  }
  if (doc.status !== 'pending') return res.status(409).json({ error: 'Only pending leave can be cancelled' });
  const before = doc.toObject();
  doc.status = 'cancelled'; await doc.save();
  await logAudit(req, 'CANCEL', 'LeaveRequest', doc._id, before, doc);
  res.json(doc);
});

module.exports = router;
