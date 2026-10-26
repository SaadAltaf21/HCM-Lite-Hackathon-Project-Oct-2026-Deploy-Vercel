// Departments, designations, leave types, holidays.
// CRUD: admin. Read: admin/hr (+ employee read for leave-types & holidays only).
const express = require('express');
const Department = require('../models/Department');
const Designation = require('../models/Designation');
const LeaveType = require('../models/LeaveType');
const Holiday = require('../models/Holiday');
const { auth, requireRole } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');
const { isValidDateStr } = require('../services/rules');

const router = express.Router();
router.use(auth);

function crud(Model, entity, { employeeReadable = false } = {}) {
  const r = express.Router();
  r.get('/', async (req, res) => {
    if (req.user.role === 'employee' && !employeeReadable) {
      return res.status(403).json({ error: 'Forbidden: insufficient role' });
    }
    res.json(await Model.find().sort({ name: 1, date: 1 }));
  });
  r.post('/', requireRole('admin'), async (req, res) => {
    try {
      const doc = await Model.create(req.body);
      await logAudit(req, 'CREATE', entity, doc._id, null, doc);
      return res.status(201).json(doc);
    } catch (err) {
      if (err.code === 11000) return res.status(409).json({ error: `${entity} already exists` });
      return res.status(400).json({ error: err.message });
    }
  });
  r.patch('/:id', requireRole('admin'), async (req, res) => {
    const before = await Model.findById(req.params.id);
    if (!before) return res.status(404).json({ error: `${entity} not found` });
    const doc = await Model.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    await logAudit(req, 'UPDATE', entity, doc._id, before, doc);
    res.json(doc);
  });
  r.delete('/:id', requireRole('admin'), async (req, res) => {
    const doc = await Model.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ error: `${entity} not found` });
    await logAudit(req, 'DELETE', entity, doc._id, doc, null);
    res.json({ message: `${entity} deleted` });
  });
  return r;
}

router.use('/departments', crud(Department, 'Department'));
router.use('/designations', crud(Designation, 'Designation'));
router.use('/leave-types', crud(LeaveType, 'LeaveType', { employeeReadable: true }));
// Holidays: validate the date format on create.
const holidayRouter = crud(Holiday, 'Holiday', { employeeReadable: true });
router.use('/holidays', (req, res, next) => {
  if (req.method === 'POST' && req.body && req.body.date && !isValidDateStr(req.body.date)) {
    return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
  }
  return next();
}, holidayRouter);

module.exports = router;
