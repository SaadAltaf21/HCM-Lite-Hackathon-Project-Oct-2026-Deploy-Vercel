const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { auth, requireRole, companyFilter } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');

const router = express.Router();
router.use(auth, requireRole('admin'));

// GET /api/users (admin only)
router.get('/', async (req, res) => {
  const users = await User.find(companyFilter(req)).select('-passwordHash').sort({ createdAt: 1 });
  res.json(users);
});

// POST /api/users — admin creates an HR login.
router.post('/', async (req, res) => {
  const { email, password, role, name } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });
  if (role !== 'hr') return res.status(422).json({ error: 'Only HR logins can be created here (employees are created via /employees)' });
  try {
    const user = await User.create({
      name: name || '', email: String(email).toLowerCase(),
      passwordHash: await bcrypt.hash(password, 10), role: 'hr',
      companyId: req.companyId || null,
    });
    await logAudit(req, 'CREATE', 'User', user._id, null, { email: user.email, role: 'hr' });
    return res.status(201).json(user.toSafeJSON());
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Email already exists' });
    return res.status(400).json({ error: err.message });
  }
});

router.patch('/:id/deactivate', async (req, res) => {
  const user = await User.findOne({ _id: req.params.id, ...companyFilter(req) });
  if (!user) return res.status(404).json({ error: 'User not found' });
  const before = { active: user.active };
  user.active = false; await user.save();
  await logAudit(req, 'UPDATE', 'User', user._id, before, { active: false });
  res.json(user.toSafeJSON());
});

router.patch('/:id/activate', async (req, res) => {
  const user = await User.findOne({ _id: req.params.id, ...companyFilter(req) });
  if (!user) return res.status(404).json({ error: 'User not found' });
  const before = { active: user.active };
  user.active = true; await user.save();
  await logAudit(req, 'UPDATE', 'User', user._id, before, { active: true });
  res.json(user.toSafeJSON());
});

router.patch('/:id/reset-password', async (req, res) => {
  const { newPassword, tempPassword } = req.body || {};
  const next = newPassword || tempPassword;
  if (!next || next.length < 6) return res.status(400).json({ error: 'newPassword must be at least 6 characters' });
  const user = await User.findOne({ _id: req.params.id, ...companyFilter(req) });
  if (!user) return res.status(404).json({ error: 'User not found' });
  user.passwordHash = await bcrypt.hash(next, 10);
  user.mustChangePassword = true;
  await user.save();
  await logAudit(req, 'UPDATE', 'User', user._id, { mustChangePassword: false }, { mustChangePassword: true });
  res.json({ message: 'Password reset; user must change it on next sign-in', user: user.toSafeJSON() });
});

module.exports = router;
