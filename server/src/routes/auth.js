const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { signToken, auth } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });
  // Login is per-account, not per-system: any registered email works,
  // whether it belongs to the first company or the hundredth. There is no
  // global "not set up" state any more — a visitor with no account signs
  // up on the Setup page instead.
  const user = await User.findOne({ email: String(email).toLowerCase() });
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  if (!user.active) return res.status(403).json({ error: 'Account is deactivated' });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  return res.json({
    token: signToken(user), user: user.toSafeJSON(),
    mustChangePassword: user.mustChangePassword,
  });
});

// Authenticated; also handles first-sign-in forced password change.
router.post('/change-password', auth, async (req, res) => {
  // Accept both field names: the frontend sends oldPassword, older clients
  // send currentPassword. Previously a non-forced change with oldPassword
  // failed with "currentPassword is required".
  const { currentPassword, oldPassword, newPassword } = req.body || {};
  const current = currentPassword || oldPassword;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'newPassword must be at least 6 characters' });
  }
  const user = req.user;
  if (!user.mustChangePassword) {
    if (!current) return res.status(400).json({ error: 'currentPassword is required' });
    const ok = await bcrypt.compare(current, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Current password is incorrect' });
  }
  const before = { mustChangePassword: user.mustChangePassword };
  user.passwordHash = await bcrypt.hash(newPassword, 10);
  user.mustChangePassword = false;
  await user.save();
  await logAudit(req, 'UPDATE', 'User', user._id, before, { mustChangePassword: false });
  return res.json({ message: 'Password changed' });
});

// Stateless JWT: the client simply discards the token.
router.post('/logout', auth, (req, res) => res.json({ message: 'Logged out' }));

module.exports = router;
