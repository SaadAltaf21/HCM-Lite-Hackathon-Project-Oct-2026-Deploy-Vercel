const express = require('express');
const AuditLog = require('../models/AuditLog');
const { auth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(auth, requireRole('admin'));

// Read-only: there is deliberately no create/update/delete route for audit logs.
router.get('/', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const filter = {};
  if (req.query.entity) filter.entity = req.query.entity;
  if (req.query.action) filter.action = req.query.action;
  const total = await AuditLog.countDocuments(filter);
  const data = await AuditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit);
  res.json({ data, page, limit, total, totalPages: Math.ceil(total / limit) });
});

module.exports = router;
