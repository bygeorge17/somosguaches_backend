const express = require('express');
const jwt = require('jsonwebtoken');
const authMiddleware = require('../middleware/auth');
const adminAuthorization = require('../middleware/adminAuthorization');
const { validateBody } = require('../middleware/validateBody');
const User = require('../models/User');
const { JWT_SECRET } = require('../config/env');
const { serializeUser } = require('../utils/user');
const {
  adminCreateUser,
  profileUpdate,
  roleUpdate,
} = require('../validation/schemas');
const router = express.Router();

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

router.put('/me', authMiddleware, validateBody(profileUpdate), async (req, res) => {
  try {
    await updateOwnProfile(req.user.id, req.body, res);
  } catch (error) {
    res.status(400).json({ error: error.message });
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
