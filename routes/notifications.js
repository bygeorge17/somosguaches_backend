const express = require('express');
const authMiddleware = require('../middleware/auth');
const Notification = require('../models/Notification');

const router = express.Router();

router.get('/', authMiddleware, async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
    const notifications = await Notification.find({ recipient: req.user.id })
      .sort({ createdAt: -1 }).limit(limit).lean();
    const unreadCount = await Notification.countDocuments({
      recipient: req.user.id,
      readAt: null,
    });
    res.json({ notifications, unreadCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/:id/read', authMiddleware, async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user.id },
      { $set: { readAt: new Date() } },
      { new: true },
    );
    if (!notification) return res.status(404).json({ error: 'Notificación no encontrada' });
    res.json({ notification });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/read-all', authMiddleware, async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.user.id, readAt: null },
      { $set: { readAt: new Date() } },
    );
    res.json({ message: 'Notificaciones marcadas como leídas' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
