const express = require('express');
const Notification = require('../models/Notification');
const { auth } = require('../middleware/auth');

const router = express.Router();
router.use(auth);

router.get('/mine', async (req, res) => {
  res.json(await Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(100));
});

router.patch('/:id/read', async (req, res) => {
  const doc = await Notification.findOne({ _id: req.params.id, user: req.user._id });
  if (!doc) return res.status(404).json({ error: 'Notification not found' });
  doc.read = true; await doc.save();
  res.json(doc);
});

module.exports = router;
