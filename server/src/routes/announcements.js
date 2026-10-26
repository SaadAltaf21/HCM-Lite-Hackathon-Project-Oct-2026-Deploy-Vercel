const express = require('express');
const Announcement = require('../models/Announcement');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { auth, requireRole, companyFilter } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');

const router = express.Router();
router.use(auth);

router.get('/', async (req, res) => {
  res.json(await Announcement.find(companyFilter(req)).sort({ createdAt: -1 }));
});

router.post('/', requireRole('admin', 'hr'), async (req, res) => {
  const { title, body } = req.body || {};
  if (!title || !body) return res.status(400).json({ error: 'title and body are required' });
  const doc = await Announcement.create({ title, body, author: req.user._id, companyId: req.companyId || null });
  const users = await User.find({ active: true, ...companyFilter(req) }).select('_id');
  if (users.length) {
    await Notification.insertMany(users.map((u) => ({ user: u._id, companyId: req.companyId || null, message: `Announcement: ${title}`, type: 'announcement' })));
  }
  await logAudit(req, 'CREATE', 'Announcement', doc._id, null, { title });
  res.status(201).json(doc);
});

module.exports = router;
