const express = require('express');
const authMiddleware = require('../middleware/auth');
const { validateBody } = require('../middleware/validateBody');
const Post = require('../models/Post');
const PostReport = require('../models/PostReport');
const User = require('../models/User');
const { postReport } = require('../validation/schemas');

const router = express.Router();

router.post('/:postId', authMiddleware, validateBody(postReport), async (req, res, next) => {
  try {
    const reporter = await User.findById(req.user.id).select('isActive moderation');
    const suspendedUntil = reporter?.moderation?.suspendedUntil;
    if (!reporter || reporter.isActive === false || reporter.moderation?.permanentlyBanned || (suspendedUntil && suspendedUntil > new Date())) {
      return res.status(403).json({ error: 'Tu cuenta no puede enviar reportes en este momento' });
    }
    const post = await Post.findById(req.params.postId);
    if (!post || post.moderationStatus === 'removed') {
      return res.status(404).json({ error: 'Post no encontrado' });
    }

    const existing = await PostReport.findOne({
      post: post._id,
      reporter: req.user.id,
      status: 'pending',
    });
    if (existing) {
      return res.status(409).json({ error: 'Ya reportaste este post y esta pendiente de revision' });
    }

    const report = await PostReport.create({
      post: post._id,
      reporter: req.user.id,
      reason: req.body.reason,
      details: req.body.details || '',
    });

    if (post.moderationStatus === 'visible') {
      post.moderationStatus = 'hidden';
      post.reportedAt = new Date();
      await post.save();
    }

    res.status(201).json({ message: 'Reporte enviado. El post quedara oculto mientras lo revisamos.', id: report._id });
  } catch (error) { next(error); }
});

module.exports = router;
