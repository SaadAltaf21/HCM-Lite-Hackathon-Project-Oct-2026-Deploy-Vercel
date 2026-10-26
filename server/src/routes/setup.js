const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Setting = require('../models/Setting');
const { getDefaultLeaveTypes } = require('../services/rules');
const { logAudit } = require('../utils/audit');

const router = express.Router();

// GET /api/setup/status -> { needsSetup: true } on a fresh install.
router.get('/status', async (req, res) => {
  const count = await User.countDocuments();
  res.json({ needsSetup: count === 0 });
});

// POST /api/setup — only when no users exist (409 afterwards).
router.post('/', async (req, res) => {
  try {
    if (await User.countDocuments() > 0) {
      return res.status(409).json({ error: 'Setup already completed' });
    }
    const { companyName, adminName, adminEmail, adminPassword, officeStart, graceMinutes, officeLat, officeLng, officeRadiusMeters } = req.body || {};
    if (!companyName || !adminEmail || !adminPassword) {
      return res.status(400).json({ error: 'companyName, adminEmail and adminPassword are required' });
    }
    if (adminPassword.length < 6) return res.status(400).json({ error: 'adminPassword must be at least 6 characters' });
    const setting = await Setting.create({
      companyName, officeStart: officeStart || '09:00', graceMinutes: graceMinutes ?? 15,
      officeLat: officeLat ?? null, officeLng: officeLng ?? null,
      officeRadiusMeters: officeRadiusMeters ?? 150,
    });
    const admin = await User.create({
      name: adminName || 'Admin', email: adminEmail.toLowerCase(),
      passwordHash: await bcrypt.hash(adminPassword, 10), role: 'admin',
    });
    await getDefaultLeaveTypes();
    await logAudit({ user: admin }, 'CREATE', 'Setting', setting._id, null, { companyName });
    return res.status(201).json({ message: 'Setup complete', setting, admin: admin.toSafeJSON() });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Email already exists' });
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
