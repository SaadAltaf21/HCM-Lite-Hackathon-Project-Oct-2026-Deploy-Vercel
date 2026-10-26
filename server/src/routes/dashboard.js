const express = require('express');
const { auth, requireRole } = require('../middleware/auth');
const { buildDashboard, employeeDashboard } = require('../services/dashboard');

const router = express.Router();
router.use(auth);

router.get('/admin', requireRole('admin'), async (req, res) => {
  res.json(await buildDashboard({ from: req.query.from, to: req.query.to, department: req.query.department }));
});
router.get('/hr', requireRole('admin', 'hr'), async (req, res) => {
  res.json(await buildDashboard({ from: req.query.from, to: req.query.to, department: req.query.department }));
});
router.get('/employee', requireRole('employee'), async (req, res) => {
  const data = await employeeDashboard(req.user, { from: req.query.from, to: req.query.to });
  if (!data) return res.status(404).json({ error: 'Employee record not found' });
  res.json(data);
});

module.exports = router;
