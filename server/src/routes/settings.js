const express = require('express');
const Setting = require('../models/Setting');
const { auth, requireRole, companyFilter } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');

const router = express.Router();
router.use(auth);

router.get('/', requireRole('admin', 'hr'), async (req, res) => {
  // Only this caller's own company — never the first Setting row in the DB.
  const setting = req.companyId
    ? await Setting.findById(req.companyId)
    : await Setting.findOne();
  if (!setting) return res.status(404).json({ error: 'Company not set up yet' });
  res.json(setting);
});

router.put('/', requireRole('admin'), async (req, res) => {
  const allowed = ['companyName', 'officeStart', 'graceMinutes', 'weekendDays', 'officeLat', 'officeLng', 'officeRadiusMeters', 'halfDayHours'];
  const patch = {};
  for (const k of allowed) if (req.body[k] !== undefined) patch[k] = req.body[k];
  const filter = req.companyId ? { _id: req.companyId } : {};
  const before = await Setting.findOne(filter);
  const setting = await Setting.findOneAndUpdate(filter, patch, { new: true, upsert: true });
  await logAudit(req, 'UPDATE', 'Setting', setting._id, before, setting);
  res.json(setting);
});

module.exports = router;
