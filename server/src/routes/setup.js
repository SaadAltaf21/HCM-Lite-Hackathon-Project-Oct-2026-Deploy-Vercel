const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Setting = require('../models/Setting');
const { getDefaultLeaveTypes } = require('../services/rules');
const { logAudit } = require('../utils/audit');

const router = express.Router();

// GET /api/setup/status — kept for backward compatibility with older
// clients. It no longer gates signup: any visitor may create a new company,
// even when hundreds already exist, so needsSetup is always true here.
// The frontend no longer redirects on it (see Setup.jsx).
router.get('/status', async (req, res) => {
  res.json({ needsSetup: true });
});

// POST /api/setup — create a NEW company + its Admin account.
// This is the public signup, and it is deliberately NOT limited to the
// first user: the old global check (User.countDocuments() > 0 => 409) was
// the root cause of the "blank page, then back to login" bug, because the
// Setup page redirected away whenever any company already existed.
// Required body: ONLY companyName, adminName (full name), adminEmail,
// adminPassword. Everything else (office start 09:00, grace 15 min,
// weekend Sat-Sun, radius 150m, half-day 5h) is filled in automatically
// from the brief's defaults and can be changed later in Settings.
// Email is globally unique, so duplicate registration is rejected with 409
// and no orphan company row is left behind. Passwords are bcrypt-hashed.
router.post('/', async (req, res) => {
  const { companyName, adminName, adminEmail, adminPassword } = req.body || {};
  if (!companyName || !adminName || !adminEmail || !adminPassword) {
    return res.status(400).json({ error: 'companyName, adminName, adminEmail and adminPassword are required' });
  }
  if (String(adminPassword).length < 6) return res.status(400).json({ error: 'adminPassword must be at least 6 characters' });
  const email = String(adminEmail).toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'adminEmail must be a valid email address' });
  }
  // Check first, so a duplicate email never creates an orphan company.
  if (await User.findOne({ email })) {
    return res.status(409).json({ error: 'Email already exists' });
  }
  let setting = null;
  try {
    setting = await Setting.create({
      companyName: String(companyName).trim(),
      officeStart: '09:00', graceMinutes: 15,
      weekendDays: ['Sat', 'Sun'], officeLat: null, officeLng: null,
      officeRadiusMeters: 150, halfDayHours: 5,
    });
    const admin = await User.create({
      name: String(adminName).trim(), email,
      passwordHash: await bcrypt.hash(adminPassword, 10), role: 'admin',
      companyId: setting._id,
    });
    await getDefaultLeaveTypes(setting._id);
    await logAudit({ user: admin }, 'CREATE', 'Setting', setting._id, null, { companyName: setting.companyName });
    return res.status(201).json({ message: 'Setup complete', setting, admin: admin.toSafeJSON() });
  } catch (err) {
    // Race on the unique email index: roll the company back.
    if (setting) { try { await Setting.findByIdAndDelete(setting._id); } catch (e) { /* ignore */ } }
    if (err.code === 11000) return res.status(409).json({ error: 'Email already exists' });
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
