const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const authMiddleware = require('../middleware/auth');
const adminAuthorization = require('../middleware/adminAuthorization');
const { validateBody } = require('../middleware/validateBody');
const Community = require('../models/Community');
const CommunityDirectoryEntry = require('../models/CommunityDirectoryEntry');
const CommunitySuggestion = require('../models/CommunitySuggestion');
const Historia = require('../models/Historia');
const Leyenda = require('../models/Leyenda');
const Personaje = require('../models/Personaje');
const Post = require('../models/Post');
const User = require('../models/User');
const { JWT_SECRET } = require('../config/env');
const { resourceId, serializeUser } = require('../utils/user');
const {
  adminCreateUser,
  officialAccountCreate,
  profileUpdate,
  roleUpdate,
} = require('../validation/schemas');
const router = express.Router();
const AVATAR_UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads', 'avatars');
const AVATAR_URL_PREFIX = '/uploads/avatars/';
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const AVATAR_MIME_BY_EXTENSION = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

fs.mkdirSync(AVATAR_UPLOAD_DIR, { recursive: true });

function avatarExtension(originalName, mimeType) {
  const extension = path.extname(originalName || '').toLowerCase();
  if (AVATAR_MIME_BY_EXTENSION[extension]) return extension;
  return Object.entries(AVATAR_MIME_BY_EXTENSION)
    .find(([, expectedMime]) => expectedMime === mimeType)?.[0] || '';
}

function isAvatarImage(originalName, mimeType) {
  const extension = path.extname(originalName || '').toLowerCase();
  const expectedMime = AVATAR_MIME_BY_EXTENSION[extension];
  return Boolean(expectedMime)
    && [expectedMime, 'application/octet-stream'].includes(mimeType);
}

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, AVATAR_UPLOAD_DIR),
    filename: (_req, file, callback) => {
      const extension = avatarExtension(file.originalname, file.mimetype);
      const safeBaseName = path
        .basename(file.originalname, path.extname(file.originalname))
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'avatar';
      callback(null, `${Date.now()}-${safeBaseName}${extension}`);
    },
  }),
  fileFilter: (_req, file, callback) => {
    if (!isAvatarImage(file.originalname, file.mimetype)) {
      return callback(new Error('El avatar debe ser JPG, PNG o WEBP'));
    }
    callback(null, true);
  },
  limits: { fileSize: MAX_AVATAR_BYTES, files: 1 },
});

function currentUserId(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return null;

  try {
    return jwt.verify(authHeader.split(' ')[1], JWT_SECRET).id;
  } catch (_) {
    return null;
  }
}

function hasField(object, field) {
  return Object.prototype.hasOwnProperty.call(object, field);
}

function buildProfileUpdate(body) {
  const update = {};

  if (hasField(body, 'name')) {
    update.name = String(body.name || '').trim();
    if (!update.name) {
      throw new Error('El nombre es obligatorio');
    }
  }

  if (hasField(body, 'bio')) {
    update.bio = String(body.bio || '').trim();
  }

  if (hasField(body, 'username')) {
    update.username = String(body.username || '')
      .trim()
      .replace(/^@+/, '')
      .toLowerCase();
  }

  if (hasField(body, 'origin')) {
    update.origin = String(body.origin || '').trim();
  }

  if (hasField(body, 'currentLocation')) {
    update.currentLocation = String(body.currentLocation || '').trim();
  }

  if (hasField(body, 'occupation')) {
    update.occupation = String(body.occupation || '').trim();
  }

  if (hasField(body, 'avatar')) {
    update.avatar = String(body.avatar || '').trim();
  }

  return update;
}

async function updateOwnProfile(userId, body, res) {
  const update = buildProfileUpdate(body);
  if (Object.keys(update).length === 0) {
    return res.status(400).json({
      error: 'No hay campos validos para actualizar',
    });
  }

  const user = await User.findByIdAndUpdate(
    userId,
    update,
    { new: true, runValidators: true },
  );
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  return res.json({ user: serializeUser(user, { includePrivate: true }) });
}

function removeUploadedFile(file) {
  if (!file?.path) return Promise.resolve();
  return fs.promises.unlink(file.path).catch(() => {});
}

async function refreshEngagementCounters(Model, userId) {
  const resources = await Model.find({
    $or: [
      { 'comments.author': userId },
      { 'ratings.user': userId },
    ],
  });

  await Promise.all(resources.map(async (resource) => {
    resource.comments = (resource.comments || []).filter(
      (comment) => resourceId(comment.author) !== userId,
    );
    resource.ratings = (resource.ratings || []).filter(
      (rating) => resourceId(rating.user) !== userId,
    );
    resource.commentsCount = resource.comments.length;
    resource.ratingsCount = resource.ratings.length;
    resource.avgStars = resource.ratings.length === 0
      ? 0
      : resource.ratings.reduce((sum, rating) => sum + rating.stars, 0)
        / resource.ratings.length;
    await resource.save();
  }));
}

async function removeUserAccount(user) {
  const userId = user._id.toString();
  const ownedPosts = await Post.find({ author: user._id }).select('community');
  const postsByCommunity = ownedPosts.reduce((counts, post) => {
    const communityId = resourceId(post.community);
    if (!communityId) return counts;
    counts.set(communityId, (counts.get(communityId) || 0) + 1);
    return counts;
  }, new Map());

  await Promise.all([
    Post.deleteMany({ author: user._id }),
    Post.updateMany(
      {},
      {
        $pull: {
          comments: { author: user._id },
          ratings: { user: user._id },
        },
      },
    ),
    Post.updateMany(
      {},
      { $pull: { 'comments.$[].reactions': { user: user._id } } },
    ),
    CommunityDirectoryEntry.deleteMany({ owner: user._id }),
    Community.updateMany({}, { $pull: { members: user._id } }),
    CommunitySuggestion.updateMany({}, { $pull: { suggestedBy: user._id } }),
    User.updateMany({}, { $pull: { followers: user._id, following: user._id } }),
    refreshEngagementCounters(Personaje, userId),
    refreshEngagementCounters(Historia, userId),
    refreshEngagementCounters(Leyenda, userId),
  ]);

  await Promise.all(
    [...postsByCommunity.entries()].map(([communityId, count]) => (
      Community.updateOne(
        { _id: communityId },
        { $inc: { postsCount: -count } },
      )
    )),
  );
  await CommunitySuggestion.deleteMany({ suggestedBy: { $size: 0 } });
  await User.deleteOne({ _id: user._id });
}

router.post('/', adminAuthorization, validateBody(adminCreateUser), async (req, res) => {
  try {
    const {
      email,
      password,
      name,
      bio = '',
      avatar = '',
      role = 'user',
    } = req.body;

    if (!['admin', 'user'].includes(role)) {
      return res.status(400).json({ error: 'Rol invalido' });
    }

    const user = new User({ email, password, name, bio, avatar, role });
    await user.save();
    res.status(201).json({
      user: serializeUser(user, { includePrivate: true }),
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/official', adminAuthorization, async (_req, res) => {
  try {
    const users = await User.find({
      accountType: { $in: ['official', 'automated'] },
    }).sort({ createdAt: -1 });
    res.json(users.map((user) => serializeUser(user)));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post(
  '/official',
  adminAuthorization,
  validateBody(officialAccountCreate),
  async (req, res) => {
    try {
      const accountType = req.body.accountType || 'official';
      const identity = crypto.randomUUID();
      const user = new User({
        name: req.body.name,
        bio: req.body.bio || '',
        avatar: req.body.avatar || '',
        accountType,
        role: 'user',
        email: `official+${identity}@somosguaches.internal`,
        password: crypto.randomBytes(32).toString('base64url'),
      });
      await user.save();
      res.status(201).json({ user: serializeUser(user) });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },
);

router.get('/', async (req, res) => {
  try {
    const viewerId = currentUserId(req);
    const users = await User.find({ isActive: { $ne: false } })
      .sort({ createdAt: -1 });

    res.json(users.map((user) => serializeUser(user, {
      currentUserId: viewerId,
    })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || user.isActive === false) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json({ user: serializeUser(user, { includePrivate: true }) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/me/avatar', authMiddleware, (req, res) => {
  avatarUpload.single('avatar')(req, res, async (uploadError) => {
    if (uploadError) {
      const message = uploadError instanceof multer.MulterError
        ? 'La imagen no puede superar 5 MB'
        : uploadError.message;
      return res.status(400).json({ error: message });
    }

    const file = req.file;
    try {
      if (!file) return res.status(400).json({ error: 'Selecciona una imagen' });
      if (file.size > MAX_AVATAR_BYTES) {
        await removeUploadedFile(file);
        return res.status(400).json({ error: 'La imagen no puede superar 5 MB' });
      }

      const avatar = `${AVATAR_URL_PREFIX}${file.filename}`;
      const user = await User.findByIdAndUpdate(
        req.user.id,
        { avatar },
        { new: true, runValidators: true },
      );
      if (!user) {
        await removeUploadedFile(file);
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }

      return res.status(201).json({
        avatar,
        user: serializeUser(user, { includePrivate: true }),
      });
    } catch (error) {
      await removeUploadedFile(file);
      return res.status(400).json({ error: error.message });
    }
  });
});

router.put('/me', authMiddleware, validateBody(profileUpdate), async (req, res) => {
  try {
    await updateOwnProfile(req.user.id, req.body, res);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || user.isActive === false) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    await removeUserAccount(user);
    return res.json({ message: 'Cuenta eliminada correctamente' });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const viewerId = currentUserId(req);
    const user = await User.findById(req.params.id);
    if (!user || user.isActive === false) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json({ user: serializeUser(user, { currentUserId: viewerId }) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/:id', authMiddleware, validateBody(profileUpdate), async (req, res) => {
  try {
    if (req.user.id !== req.params.id) {
      return res.status(403).json({
        error: 'Solo puedes editar tu propio perfil',
      });
    }

    await updateOwnProfile(req.user.id, req.body, res);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/:id/follow', authMiddleware, async (req, res) => {
  try {
    if (req.user.id === req.params.id) {
      return res.status(400).json({ error: 'No puedes seguirte a ti mismo' });
    }

    const [currentUser, targetUser] = await Promise.all([
      User.findById(req.user.id),
      User.findById(req.params.id),
    ]);
    if (!currentUser || currentUser.isActive === false) {
      return res.status(401).json({ error: 'Usuario no autorizado' });
    }
    if (!targetUser || targetUser.isActive === false) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    await Promise.all([
      User.updateOne(
        { _id: currentUser._id },
        { $addToSet: { following: targetUser._id } },
      ),
      User.updateOne(
        { _id: targetUser._id },
        { $addToSet: { followers: currentUser._id } },
      ),
    ]);

    const updatedUser = await User.findById(targetUser._id);
    res.json({
      user: serializeUser(updatedUser, { currentUserId: req.user.id }),
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:id/follow', authMiddleware, async (req, res) => {
  try {
    if (req.user.id === req.params.id) {
      return res.status(400).json({ error: 'No puedes dejar de seguirte' });
    }

    const [currentUser, targetUser] = await Promise.all([
      User.findById(req.user.id),
      User.findById(req.params.id),
    ]);
    if (!currentUser || currentUser.isActive === false) {
      return res.status(401).json({ error: 'Usuario no autorizado' });
    }
    if (!targetUser || targetUser.isActive === false) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    await Promise.all([
      User.updateOne(
        { _id: currentUser._id },
        { $pull: { following: targetUser._id } },
      ),
      User.updateOne(
        { _id: targetUser._id },
        { $pull: { followers: currentUser._id } },
      ),
    ]);

    const updatedUser = await User.findById(targetUser._id);
    res.json({
      user: serializeUser(updatedUser, { currentUserId: req.user.id }),
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/:id/role', adminAuthorization, validateBody(roleUpdate), async (req, res) => {
  try {
    const role = String(req.body.role || '').trim();
    if (!['admin', 'user'].includes(role)) {
      return res.status(400).json({ error: 'Rol invalido' });
    }
    if (req.user.id === req.params.id && role !== 'admin') {
      return res.status(400).json({
        error: 'No puedes quitar tu propio rol de administrador',
      });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role, isAdmin: role === 'admin' },
      { new: true, runValidators: true },
    );
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    res.json({ user: serializeUser(user, { includePrivate: true }) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:id', adminAuthorization, async (req, res) => {
  try {
    if (req.user.id === req.params.id) {
      return res.status(400).json({
        error: 'No puedes eliminar tu propia cuenta administrativa',
      });
    }

    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    await User.updateMany({}, {
      $pull: { followers: user._id, following: user._id },
    });
    res.json({ message: 'Usuario eliminado', id: req.params.id });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
