const express = require('express');
const adminAuthorization = require('../middleware/adminAuthorization');
const models = {
  communities: require('../models/Community'),
  personajes: require('../models/Personaje'),
  historias: require('../models/Historia'),
  leyendas: require('../models/Leyenda'),
};
const User = require('../models/User');
const Post = require('../models/Post');
const CommunitySuggestion = require('../models/CommunitySuggestion');
const ContentSuggestion = require('../models/ContentSuggestion');
const PostReport = require('../models/PostReport');
const router = express.Router();

router.get('/overview', adminAuthorization, async (_req, res, next) => {
  try {
    const [results, userStats, postStats] = await Promise.all([
      Promise.all(Object.entries(models).map(async ([resource, Model]) => {
        const [count, records] = await Promise.all([
          Model.countDocuments({}),
          Model.find().select('name title createdAt').sort({ createdAt: -1 }).limit(5).lean(),
        ]);
        return { resource, count, records };
      })),
      Promise.all([
        User.countDocuments({}),
        User.countDocuments({ isActive: true }),
        User.countDocuments({ role: 'admin' }),
      ]),
      Promise.all([
        Post.countDocuments({}),
        Post.countDocuments({ mediaUrl: { $ne: '' } }),
        Post.aggregate([{ $group: { _id: null, comments: { $sum: { $size: '$comments' } }, ratings: { $sum: { $size: '$ratings' } } } }]),
      ]),
    ]);
    const [totalUsers, activeUsers, adminUsers] = userStats;
    const [totalPosts, postsWithMedia, postEngagement] = postStats;
    const engagement = postEngagement[0] || { comments: 0, ratings: 0 };
    res.set('Cache-Control', 'no-store');
    res.json({
      counts: Object.fromEntries(results.map(({ resource, count }) => [resource, count])),
      stats: {
        users: { total: totalUsers, active: activeUsers, admins: adminUsers },
        posts: { total: totalPosts, withMedia: postsWithMedia, comments: engagement.comments, ratings: engagement.ratings },
      },
      recent: results.flatMap(({ resource, records }) => records.map(record => ({
        resource, id: String(record._id), title: record.name || record.title,
        createdAt: record.createdAt,
      }))).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5),
    });
  } catch (error) { next(error); }
});

router.get('/community-suggestions', adminAuthorization, async (_req, res, next) => {
  try {
    const suggestions = await CommunitySuggestion.find()
      .populate('suggestedBy', 'name email')
      .sort({ lastSuggestedAt: -1 })
      .lean();

    res.set('Cache-Control', 'no-store');
    res.json(suggestions.map((suggestion) => ({
      id: String(suggestion._id),
      name: suggestion.name,
      location: suggestion.location || '',
      description: suggestion.description || '',
      suggestionsCount: suggestion.suggestedBy?.length || 0,
      suggestedBy: (suggestion.suggestedBy || []).map((user) => ({
        id: String(user._id),
        name: user.name,
        email: user.email,
      })),
      lastSuggestedAt: suggestion.lastSuggestedAt,
      createdAt: suggestion.createdAt,
      updatedAt: suggestion.updatedAt,
    })));
  } catch (error) { next(error); }
});

router.get('/content-suggestions', adminAuthorization, async (_req, res, next) => {
  try {
    const suggestions = await ContentSuggestion.find()
      .populate('suggestedBy', 'name email')
      .sort({ lastSuggestedAt: -1 })
      .lean();

    res.set('Cache-Control', 'no-store');
    res.json(suggestions.map((suggestion) => ({
      id: String(suggestion._id),
      kind: suggestion.kind,
      title: suggestion.title,
      secondary: suggestion.secondary || '',
      location: suggestion.location || '',
      description: suggestion.description || '',
      suggestionsCount: suggestion.suggestedBy?.length || 0,
      suggestedBy: (suggestion.suggestedBy || []).map((user) => ({
        id: String(user._id),
        name: user.name,
        email: user.email,
      })),
      lastSuggestedAt: suggestion.lastSuggestedAt,
      createdAt: suggestion.createdAt,
      updatedAt: suggestion.updatedAt,
    })));
  } catch (error) { next(error); }
});

router.get('/post-reports', adminAuthorization, async (req, res, next) => {
  try {
    const status = ['pending', 'accepted', 'rejected'].includes(req.query.status)
      ? req.query.status
      : 'pending';
    const reports = await PostReport.find({ status })
      .populate({ path: 'post', populate: [{ path: 'author', select: 'name email avatar' }, { path: 'community', select: 'name' }] })
      .populate('reporter', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    res.set('Cache-Control', 'no-store');
    res.json(reports.filter((report) => report.post).map((report) => ({
      id: String(report._id),
      reason: report.reason,
      details: report.details || '',
      status: report.status,
      createdAt: report.createdAt,
      reporter: report.reporter ? { id: String(report.reporter._id), name: report.reporter.name, email: report.reporter.email } : null,
      post: {
        id: String(report.post._id),
        text: report.post.text || '',
        type: report.post.type,
        mediaUrl: report.post.mediaUrl || '',
        moderationStatus: report.post.moderationStatus,
        createdAt: report.post.createdAt,
        author: report.post.author ? { id: String(report.post.author._id), name: report.post.author.name, email: report.post.author.email, avatar: report.post.author.avatar || '' } : null,
        community: report.post.community ? { id: String(report.post.community._id), name: report.post.community.name } : null,
      },
    })));
  } catch (error) { next(error); }
});

router.patch('/post-reports/:id', adminAuthorization, async (req, res, next) => {
  try {
    const action = String(req.body?.action || '');
    if (!['delete', 'restore'].includes(action)) {
      return res.status(400).json({ error: 'La accion debe ser delete o restore' });
    }
    const report = await PostReport.findById(req.params.id);
    if (!report || report.status !== 'pending') return res.status(404).json({ error: 'Reporte pendiente no encontrado' });
    const post = await Post.findById(report.post);
    if (!post) return res.status(404).json({ error: 'Post no encontrado' });

    const pending = await PostReport.find({ post: post._id, status: 'pending' });
    if (action === 'delete') {
      post.moderationStatus = 'removed';
      await post.save();
      await PostReport.updateMany({ post: post._id, status: 'pending' }, { $set: { status: 'accepted', reviewedBy: req.user.id, reviewedAt: new Date(), reviewNote: 'Contenido retirado por moderacion.' } });
    } else {
      post.moderationStatus = 'visible';
      post.reportedAt = null;
      await post.save();
      await PostReport.updateMany({ post: post._id, status: 'pending' }, { $set: { status: 'rejected', reviewedBy: req.user.id, reviewedAt: new Date(), reviewNote: 'Reporte no confirmado.' } });
      for (const pendingReport of pending) await applyFalseReportConsequence(pendingReport.reporter);
    }

    res.json({ message: action === 'delete' ? 'Post eliminado.' : 'Post reactivado.', id: post._id });
  } catch (error) { next(error); }
});

async function applyFalseReportConsequence(userId) {
  const user = await User.findById(userId);
  if (!user || user.isAdmin) return;
  const count = Number(user.moderation?.falseReportCount || 0) + 1;
  user.moderation = user.moderation || {};
  user.moderation.falseReportCount = count;
  if (count >= 3) {
    user.moderation.permanentlyBanned = true;
    user.isActive = false;
  } else {
    user.moderation.suspendedUntil = new Date(Date.now() + (count === 1 ? 24 : 24 * 7) * 60 * 60 * 1000);
  }
  await user.save();
}

module.exports = router;
