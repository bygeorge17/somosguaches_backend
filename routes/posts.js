const express = require('express');
const { execFile } = require('child_process');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const ffprobe = require('@ffprobe-installer/ffprobe');
const authMiddleware = require('../middleware/auth');
const { validateBody } = require('../middleware/validateBody');
const Community = require('../models/Community');
const Post = require('../models/Post');
const { JWT_SECRET } = require('../config/env');
const {
  comment: commentBody,
  postCreate,
  postUpdate,
  rating: ratingBody,
  reaction: reactionBody,
} = require('../validation/schemas');
const router = express.Router();
const POST_TYPES = ['text', 'image', 'video'];
const COMMENT_REACTIONS = ['like', 'dislike'];
const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads', 'posts');
const UPLOAD_URL_PREFIX = '/uploads/posts/';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const MAX_VIDEO_SECONDS = 30;
const IMAGE_MIME_BY_EXTENSION = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};
const VIDEO_MIME_BY_EXTENSION = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
};

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => {
      callback(null, UPLOAD_DIR);
    },
    filename: (_req, file, callback) => {
      const extension = mediaExtension(file.originalname, file.mimetype);
      const safeBaseName = path
        .basename(file.originalname, path.extname(file.originalname))
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'media';

      callback(null, `${Date.now()}-${safeBaseName}${extension}`);
    },
  }),
  fileFilter: (_req, file, callback) => {
    if (!mediaKind(file.originalname, file.mimetype)) {
      return callback(new Error('Tipo de archivo no permitido'));
    }
    callback(null, true);
  },
  limits: {
    fileSize: MAX_VIDEO_BYTES,
    files: 1,
  },
});

function publicUser(user) {
  if (!user) return { id: '', name: 'Guache', avatar: '' };
  return {
    id: resourceUserId(user),
    name: user.name || 'Guache',
    avatar: user.avatar || '',
  };
}

function resourceUserId(user) {
  return user?._id?.toString() || user?.toString() || '';
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];

  return tags
    .map((tag) => String(tag).trim())
    .filter(Boolean)
    .slice(0, 8);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function queryTags(value) {
  const values = Array.isArray(value) ? value : [value];
  return values
    .flatMap((item) => String(item || '').split(','))
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function queryDate(value, message) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw badRequest(message);
  return date;
}

function buildPostFilters(query) {
  const filter = {};
  const type = String(query.type || '').trim().toLowerCase();
  if (type) {
    if (!POST_TYPES.includes(type)) {
      throw badRequest('Tipo de publicacion invalido');
    }
    filter.type = type;
  }
  const text = String(query.q || query.text || query.search || '')
    .trim()
    .slice(0, 200);
  if (text) {
    filter.text = { $regex: escapeRegex(text), $options: 'i' };
  }

  const communityId = String(query.community || query.communityId || '').trim();
  if (communityId) {
    if (!mongoose.isValidObjectId(communityId)) {
      throw badRequest('El identificador de comunidad no es válido');
    }
    filter.community = communityId;
  }

  const tags = queryTags(query.tags || query.tag || []);
  if (tags.length > 0) {
    filter.tags = {
      $in: tags.map((tag) => new RegExp(`^${escapeRegex(tag)}$`, 'i')),
    };
  }

  const dateFrom = queryDate(
    query.dateFrom || query.from,
    'La fecha inicial no es válida',
  );
  const dateTo = queryDate(
    query.dateTo || query.to,
    'La fecha final no es válida',
  );
  if (dateFrom && dateTo && dateTo < dateFrom) {
    throw badRequest('La fecha final debe ser posterior a la fecha inicial');
  }
  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) filter.createdAt.$gte = dateFrom;
    if (dateTo) filter.createdAt.$lte = dateTo;
  }

  return filter;
}

function readPostOrder(query) {
  const aliases = {
    date: 'recent',
    fecha: 'recent',
    newest: 'recent',
    popularity: 'popular',
    popularidad: 'popular',
  };
  const requested = String(query.sort || query.order || 'recent').toLowerCase();
  const order = aliases[requested] || requested;
  if (!['recent', 'oldest', 'popular'].includes(order)) {
    throw badRequest('Orden invalido: usa recent, oldest o popular');
  }
  return order;
}

function readPostPagination(query) {
  const page = Number(query.page || 1);
  const limit = Number(query.limit || 12);

  if (!Number.isInteger(page) || page < 1) {
    throw badRequest('Página inválida: usa un entero mayor o igual a 1');
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw badRequest('Límite inválido: usa un entero entre 1 y 50');
  }

  return { page, limit, skip: (page - 1) * limit };
}

function popularityScore(post) {
  return (post.ratings?.length || 0) * 2 + (post.comments?.length || 0);
}

async function resolveCommunityId(value) {
  if (value === undefined) return undefined;
  if (value === null || String(value).trim() === '') return null;

  const communityId = String(value).trim();
  if (!mongoose.isValidObjectId(communityId)) {
    throw new Error('El identificador de comunidad no es válido');
  }
  if (!await Community.exists({ _id: communityId })) {
    throw new Error('Comunidad no encontrada');
  }
  return communityId;
}

async function adjustCommunityPostsCount(communityId, amount) {
  if (!communityId || amount === 0) return;
  if (amount > 0) {
    await Community.findByIdAndUpdate(
      communityId,
      { $inc: { postsCount: amount } },
    );
    return;
  }

  await Community.updateOne(
    { _id: communityId, postsCount: { $gt: 0 } },
    { $inc: { postsCount: amount } },
  );
}

function mediaExtension(originalName, mimeType) {
  const extension = path.extname(originalName || '').toLowerCase();
  const allowedMime = {
    ...IMAGE_MIME_BY_EXTENSION,
    ...VIDEO_MIME_BY_EXTENSION,
  }[extension];

  if (allowedMime === mimeType) return extension;
  if (allowedMime && mimeType === 'application/octet-stream') return extension;

  const entry = Object.entries({
    ...IMAGE_MIME_BY_EXTENSION,
    ...VIDEO_MIME_BY_EXTENSION,
  }).find(([, value]) => value === mimeType);

  return entry?.[0] || extension;
}

function mediaKind(originalName, mimeType) {
  const extension = path.extname(originalName || '').toLowerCase();

  if (
    IMAGE_MIME_BY_EXTENSION[extension] &&
    [IMAGE_MIME_BY_EXTENSION[extension], 'application/octet-stream'].includes(mimeType)
  ) {
    return 'image';
  }

  if (
    VIDEO_MIME_BY_EXTENSION[extension] &&
    [VIDEO_MIME_BY_EXTENSION[extension], 'application/octet-stream'].includes(mimeType)
  ) {
    return 'video';
  }

  return null;
}

function isUploadedMediaUrl(value) {
  const text = String(value || '').trim();
  if (text.startsWith(UPLOAD_URL_PREFIX)) return true;

  try {
    return new URL(text).pathname.startsWith(UPLOAD_URL_PREFIX);
  } catch (_) {
    return false;
  }
}

function toUploadedMediaPath(value) {
  const text = String(value || '').trim();
  if (text.startsWith(UPLOAD_URL_PREFIX)) return text;

  try {
    const url = new URL(text);
    if (url.pathname.startsWith(UPLOAD_URL_PREFIX)) {
      return url.pathname;
    }
  } catch (_) {
    return text;
  }

  return text;
}

function normalizePostMediaUrl(type, mediaUrl) {
  if (type === 'text') return '';

  const normalized = toUploadedMediaPath(mediaUrl);
  if (!isUploadedMediaUrl(normalized)) {
    throw new Error('Sube un archivo local antes de publicar');
  }

  return normalized;
}

function removeUploadedFile(file) {
  if (!file?.path) return Promise.resolve();
  return fs.promises.unlink(file.path).catch(() => {});
}

function videoDurationSeconds(filePath) {
  return new Promise((resolve, reject) => {
    execFile(
      ffprobe.path,
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        filePath,
      ],
      (error, stdout) => {
        if (error) return reject(error);
        resolve(Number(stdout.toString().trim() || 0));
      },
    );
  });
}

function mapPost(post, currentUserId, currentUserIsAdmin = false) {
  const ratings = post.ratings || [];
  const ratingsCount = ratings.length;
  const authorId = resourceUserId(post.author);
  const isOwnPost = currentUserId ? authorId === currentUserId : false;
  const avgStars = ratingsCount === 0
    ? 0
    : ratings.reduce((sum, rating) => sum + rating.stars, 0) / ratingsCount;
  const myRating = currentUserId
    ? ratings.find((rating) => rating.user.toString() === currentUserId)
    : null;

  return {
    id: post._id,
    author: publicUser(post.author),
    type: post.type,
    text: post.text,
    mediaUrl: post.mediaUrl || '',
    community: post.community ? {
      id: resourceUserId(post.community),
      name: post.community.name || '',
    } : null,
    tags: post.tags || [],
    createdAt: post.createdAt,
    isOwnPost,
    canEditPost: isOwnPost,
    canDeletePost: isOwnPost || currentUserIsAdmin,
    canModerateComments: currentUserIsAdmin,
    myStars: myRating ? myRating.stars : 0,
    avgStars,
    ratingsCount,
    comments: (post.comments || []).map((comment) => {
      const commentAuthorId = resourceUserId(comment.author);
      const isOwnComment = currentUserId
        ? commentAuthorId === currentUserId
        : false;
      const reactions = comment.reactions || [];
      const myCommentReaction = currentUserId
        ? reactions.find((reaction) => resourceUserId(reaction.user) === currentUserId)
        : null;

      return {
        id: comment._id,
        author: publicUser(comment.author),
        text: comment.text,
        createdAt: comment.createdAt,
        canEditComment: isOwnComment,
        canDeleteComment: isOwnComment || currentUserIsAdmin,
        likesCount: reactions.filter((reaction) => reaction.value === 'like').length,
        dislikesCount: reactions.filter((reaction) => reaction.value === 'dislike').length,
        myReaction: myCommentReaction ? myCommentReaction.value : '',
      };
    }),
  };
}

function isPostOwner(post, userId) {
  return resourceUserId(post.author) === userId;
}

function canDeletePost(post, user) {
  return isPostOwner(post, user.id) || user.isAdmin === true;
}

function isCommentOwner(comment, userId) {
  return resourceUserId(comment.author) === userId;
}

function canDeleteComment(comment, user) {
  return isCommentOwner(comment, user.id) || user.isAdmin === true;
}

async function findPost(id) {
  return Post.findById(id)
    .populate('author', 'name avatar')
    .populate('community', 'name')
    .populate('comments.author', 'name avatar');
}

router.get('/', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    let currentUserId = null;
    let currentUserIsAdmin = false;

    if (authHeader.startsWith('Bearer ')) {
      try {
        const currentUser = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
        currentUserId = currentUser.id;
        currentUserIsAdmin = currentUser.isAdmin === true;
      } catch (_) {
        currentUserId = null;
        currentUserIsAdmin = false;
      }
    }

    const filter = buildPostFilters(req.query);
    const order = readPostOrder(req.query);
    const { page, limit, skip } = readPostPagination(req.query);
    const dateSort = order === 'oldest' ? 1 : -1;
    let query = Post.find(filter).sort({ createdAt: dateSort, _id: dateSort });

    if (order !== 'popular') {
      query = query.skip(skip).limit(limit + 1);
    }

    const posts = await query
      .populate('author', 'name avatar')
      .populate('community', 'name')
      .populate('comments.author', 'name avatar');

    if (order === 'popular') {
      posts.sort((left, right) => (
        popularityScore(right) - popularityScore(left)
        || new Date(right.createdAt) - new Date(left.createdAt)
      ));
    }

    const pagePosts = order === 'popular'
      ? posts.slice(skip, skip + limit + 1)
      : posts;
    const hasMore = pagePosts.length > limit;
    const visiblePosts = hasMore ? pagePosts.slice(0, limit) : pagePosts;

    res
      .set('X-Has-More', String(hasMore))
      .set('X-Next-Page', hasMore ? String(page + 1) : '')
      .json(visiblePosts.map((post) => mapPost(
      post,
      currentUserId,
      currentUserIsAdmin,
      )));
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

router.post('/media', authMiddleware, (req, res) => {
  upload.single('media')(req, res, async (uploadError) => {
    if (uploadError) {
      const message = uploadError instanceof multer.MulterError
        ? 'El archivo supera el tamano maximo permitido'
        : uploadError.message;
      return res.status(400).json({ error: message });
    }

    try {
      const { type } = req.body;
      const file = req.file;

      if (!['image', 'video'].includes(type)) {
        await removeUploadedFile(file);
        return res.status(400).json({ error: 'Tipo de media invalido' });
      }

      if (!file) {
        return res.status(400).json({ error: 'Selecciona un archivo' });
      }

      const detectedKind = mediaKind(file.originalname, file.mimetype);
      if (detectedKind !== type) {
        await removeUploadedFile(file);
        return res.status(400).json({
          error: type === 'image'
            ? 'El archivo debe ser una imagen válida'
            : 'El archivo debe ser un video válido',
        });
      }

      if (type === 'image' && file.size > MAX_IMAGE_BYTES) {
        await removeUploadedFile(file);
        return res.status(400).json({ error: 'La imagen no puede superar 8 MB' });
      }

      if (type === 'video') {
        if (file.size > MAX_VIDEO_BYTES) {
          await removeUploadedFile(file);
          return res.status(400).json({ error: 'El video no puede superar 50 MB' });
        }

        const duration = await videoDurationSeconds(file.path);
        if (!Number.isFinite(duration) || duration <= 0) {
          await removeUploadedFile(file);
          return res.status(400).json({ error: 'No se pudo leer la duracion del video' });
        }

        if (duration > MAX_VIDEO_SECONDS) {
          await removeUploadedFile(file);
          return res.status(400).json({ error: 'El video no puede durar mas de 30 segundos' });
        }
      }

      res.status(201).json({
        mediaUrl: `${UPLOAD_URL_PREFIX}${file.filename}`,
        limits: {
          maxImageMb: 8,
          maxVideoMb: 50,
          maxVideoSeconds: MAX_VIDEO_SECONDS,
        },
      });
    } catch (error) {
      await removeUploadedFile(req.file);
      res.status(400).json({ error: error.message });
    }
  });
});

router.post('/', authMiddleware, validateBody(postCreate), async (req, res) => {
  try {
    const {
      type = 'text',
      text,
      mediaUrl = '',
      communityId,
      community,
      tags = [],
    } = req.body;
    const trimmedText = (text || '').trim();

    if (!POST_TYPES.includes(type)) {
      return res.status(400).json({ error: 'Tipo de post invalido' });
    }

    if (type !== 'image' && !trimmedText) {
      return res.status(400).json({ error: 'El texto es obligatorio' });
    }

    const normalizedMediaUrl = normalizePostMediaUrl(type, mediaUrl);
    const normalizedCommunityId = await resolveCommunityId(
      communityId !== undefined ? communityId : community,
    );

    const post = new Post({
      author: req.user.id,
      type,
      text: trimmedText,
      mediaUrl: normalizedMediaUrl,
      community: normalizedCommunityId || null,
      tags: normalizeTags(tags),
    });
    await post.save();
    await adjustCommunityPostsCount(normalizedCommunityId, 1);

    const populatedPost = await findPost(post._id);
    res.status(201).json(mapPost(populatedPost, req.user.id, req.user.isAdmin));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/:id', authMiddleware, validateBody(postUpdate), async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post no encontrado' });

    if (!isPostOwner(post, req.user.id)) {
      return res.status(403).json({
        error: 'Solo puedes editar tus propios posts',
      });
    }

    const { type, text, mediaUrl, communityId, community, tags } = req.body;
    let nextType = post.type;
    const previousCommunityId = resourceUserId(post.community);

    if (type !== undefined) {
      if (!POST_TYPES.includes(type)) {
        return res.status(400).json({ error: 'Tipo de post invalido' });
      }
      nextType = type;
    }

    if (text !== undefined) {
      const trimmedText = String(text || '').trim();
      post.text = trimmedText;
    }

    if (nextType !== 'image' && !String(post.text || '').trim()) {
      return res.status(400).json({ error: 'El texto es obligatorio' });
    }

    const nextMediaUrl = mediaUrl === undefined ? post.mediaUrl : mediaUrl;
    post.type = nextType;
    post.mediaUrl = normalizePostMediaUrl(nextType, nextMediaUrl);

    const requestedCommunity = communityId !== undefined ? communityId : community;
    if (requestedCommunity !== undefined) {
      post.community = await resolveCommunityId(requestedCommunity);
    }
    if (tags !== undefined) {
      post.tags = normalizeTags(tags);
    }

    await post.save();

    const nextCommunityId = resourceUserId(post.community);
    if (nextCommunityId !== previousCommunityId) {
      await adjustCommunityPostsCount(previousCommunityId, -1);
      await adjustCommunityPostsCount(nextCommunityId, 1);
    }

    const populatedPost = await findPost(post._id);
    res.json(mapPost(populatedPost, req.user.id, req.user.isAdmin));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post no encontrado' });

    if (!canDeletePost(post, req.user)) {
      return res.status(403).json({
        error: 'No tienes permiso para eliminar este post',
      });
    }

    const communityId = resourceUserId(post.community);
    await post.deleteOne();
    await adjustCommunityPostsCount(communityId, -1);
    res.json({ message: 'Post eliminado', id: req.params.id });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/:id/comments', authMiddleware, validateBody(commentBody), async (req, res) => {
  try {
    const text = String(req.body.text || '').trim();
    if (!text) {
      return res.status(400).json({ error: 'El comentario es obligatorio' });
    }

    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post no encontrado' });

    post.comments.push({ author: req.user.id, text });
    await post.save();

    const populatedPost = await findPost(post._id);
    res.json(mapPost(populatedPost, req.user.id, req.user.isAdmin));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/:id/comments/:commentId', authMiddleware, validateBody(commentBody), async (req, res) => {
  try {
    const text = String(req.body.text || '').trim();
    if (!text) {
      return res.status(400).json({ error: 'El comentario es obligatorio' });
    }

    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post no encontrado' });

    const comment = post.comments.find(
      (item) => item._id.toString() === req.params.commentId
    );
    if (!comment) {
      return res.status(404).json({ error: 'Comentario no encontrado' });
    }

    if (!isCommentOwner(comment, req.user.id)) {
      return res.status(403).json({
        error: 'Solo puedes editar tus propios comentarios',
      });
    }

    comment.text = text;
    await post.save();

    const populatedPost = await findPost(post._id);
    res.json(mapPost(populatedPost, req.user.id, req.user.isAdmin));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:id/comments/:commentId', authMiddleware, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post no encontrado' });

    const comment = post.comments.find(
      (item) => item._id.toString() === req.params.commentId
    );
    if (!comment) {
      return res.status(404).json({ error: 'Comentario no encontrado' });
    }

    if (!canDeleteComment(comment, req.user)) {
      return res.status(403).json({
        error: 'No tienes permiso para eliminar este comentario',
      });
    }

    post.comments.pull(comment._id);
    await post.save();

    const populatedPost = await findPost(post._id);
    res.json(mapPost(populatedPost, req.user.id, req.user.isAdmin));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post(
  '/:id/comments/:commentId/reactions',
  authMiddleware,
  validateBody(reactionBody),
  async (req, res) => {
  try {
    const reactionValue = String(req.body.reaction || '').trim();
    if (!COMMENT_REACTIONS.includes(reactionValue)) {
      return res.status(400).json({ error: 'Reaccion de comentario invalida' });
    }

    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post no encontrado' });

    const comment = post.comments.find(
      (item) => item._id.toString() === req.params.commentId
    );
    if (!comment) {
      return res.status(404).json({ error: 'Comentario no encontrado' });
    }

    const currentReaction = (comment.reactions || []).find(
      (item) => resourceUserId(item.user) === req.user.id
    );

    if (currentReaction) {
      if (currentReaction.value === reactionValue) {
        comment.reactions.pull(currentReaction._id);
      } else {
        currentReaction.value = reactionValue;
      }
    } else {
      comment.reactions.push({
        user: req.user.id,
        value: reactionValue,
      });
    }

    await post.save();

    const populatedPost = await findPost(post._id);
    res.json(mapPost(populatedPost, req.user.id, req.user.isAdmin));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/:id/ratings', authMiddleware, validateBody(ratingBody), async (req, res) => {
  try {
    const stars = Number(req.body.stars);
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
      return res.status(400).json({ error: 'La calificacion debe estar entre 1 y 5' });
    }

    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post no encontrado' });

    const currentRating = post.ratings.find(
      (rating) => rating.user.toString() === req.user.id
    );

    if (currentRating) {
      currentRating.stars = stars;
    } else {
      post.ratings.push({ user: req.user.id, stars });
    }

    await post.save();

    const populatedPost = await findPost(post._id);
    res.json(mapPost(populatedPost, req.user.id, req.user.isAdmin));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
