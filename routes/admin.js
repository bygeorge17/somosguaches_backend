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

module.exports = router;
