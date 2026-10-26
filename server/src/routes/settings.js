const express = require('express');
const Setting = require('../models/Setting');
const { auth, requireRole } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');

const router = express.Router();
router.use(auth);

router.get('/', requireRole('admin', 'hr'), async (req, res) => {
  const setting = await Setting.findOne();
  if (!setting) return res.status(404).json({ error: 'Company not set up yet' });
  res.json(setting);
});

router.put('/', requireRole('admin'), async (req, res) => {
  const allowed = ['companyName', 'officeStart', 'graceMinutes', 'weekendDays', 'officeLat', 'officeLng', 'officeRadiusMeters', 'halfDayHours'];
  const patch = {};
  for (const k of allowed) if (req.body[k] !== undefined) patch[k] = req.body[k];
  const before = await Setting.findOne();
  const setting = await Setting.findOneAndUpdate({}, patch, { new: true, upsert: true });
  await logAudit(req, 'UPDATE', 'Setting', setting._id, before, setting);
  res.json(setting);
});

module.exports = router;
