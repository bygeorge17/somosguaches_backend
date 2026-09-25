const authMiddleware = require('../middleware/auth');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/env');
const { validateBody } = require('../middleware/validateBody');
const { comment, rating } = require('../validation/schemas');

function resourceId(value) {
  return value?._id?.toString() || value?.toString() || '';
}

function optionalUserId(req) {
  const authorization = req.headers.authorization || '';
  if (!authorization.startsWith('Bearer ')) return null;
  try {
    return jwt.verify(authorization.slice(7), JWT_SECRET).id;
  } catch (_) {
    return null;
  }
}

function mapEngagement(resource, currentUserId = null, options = {}) {
  const ratings = resource.ratings || [];
  const comments = resource.comments || [];
  const hasRatings = ratings.length > 0;
  const hasComments = comments.length > 0;
  const myRating = currentUserId
    ? ratings.find((item) => resourceId(item.user) === currentUserId)
    : null;

  return {
    avgStars: hasRatings
      ? ratings.reduce((sum, item) => sum + item.stars, 0) / ratings.length
      : resource.avgStars || 0,
    ratingsCount: hasRatings ? ratings.length : resource.ratingsCount || 0,
    commentsCount: hasComments ? comments.length : resource.commentsCount || 0,
    myStars: myRating?.stars || 0,
    comments: options.includeComments ? comments.map((item) => ({
      id: resourceId(item),
      author: {
        id: resourceId(item.author),
        name: item.author?.name || 'Guache',
        avatar: item.author?.avatar || '',
      },
      text: item.text,
      createdAt: item.createdAt,
    })) : [],
  };
}

async function populateComments(resource) {
  if (resource?.populate) {
    await resource.populate('comments.author', 'name avatar');
  }
  return resource;
}

function registerContentEngagement(router, { Model, mapResource, label }) {
  router.post('/:id/comments', authMiddleware, validateBody(comment), async (req, res) => {
    try {
      const resource = await Model.findById(req.params.id);
      if (!resource) return res.status(404).json({ error: `${label} no encontrado` });
      resource.comments.push({ author: req.user.id, text: req.body.text });
      await resource.save();
      await populateComments(resource);
      res.json(mapResource(resource, req.user.id, true));
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/:id/ratings', authMiddleware, validateBody(rating), async (req, res) => {
    try {
      const resource = await Model.findById(req.params.id);
      if (!resource) return res.status(404).json({ error: `${label} no encontrado` });
      const current = resource.ratings.find(
        (item) => resourceId(item.user) === req.user.id,
      );
      if (current) current.stars = req.body.stars;
      else resource.ratings.push({ user: req.user.id, stars: req.body.stars });
      await resource.save();
      await populateComments(resource);
      res.json(mapResource(resource, req.user.id, true));
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });
}

module.exports = {
  mapEngagement,
  optionalUserId,
  populateComments,
  registerContentEngagement,
};
