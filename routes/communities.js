const express = require('express');
const jwt = require('jsonwebtoken');
const authMiddleware = require('../middleware/auth');
const adminAuthorization = require('../middleware/adminAuthorization');
const { validateBody } = require('../middleware/validateBody');
const Community = require('../models/Community');
const { JWT_SECRET } = require('../config/env');
const {
  communityCreate,
  communityUpdate,
} = require('../validation/schemas');
const router = express.Router();

function readOptionalUserId(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return null;

  try {
    return jwt.verify(authHeader.split(' ')[1], JWT_SECRET).id;
  } catch (_) {
    return null;
  }
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];

  return tags
    .map((tag) => String(tag).trim())
    .filter(Boolean)
    .slice(0, 8);
}

function hasField(object, field) {
  return Object.prototype.hasOwnProperty.call(object, field);
}

function buildCommunityUpdate(body) {
  const update = {};

  if (hasField(body, 'name')) {
    update.name = String(body.name || '').trim();
    if (!update.name) {
      throw new Error('El nombre es obligatorio');
    }
  }

  if (hasField(body, 'description')) {
    update.description = String(body.description || '').trim();
    if (!update.description) {
      throw new Error('La descripción es obligatoria');
    }
  }

  if (hasField(body, 'location')) {
    update.location = String(body.location || '').trim();
  }

  if (hasField(body, 'coverImageUrl')) {
    update.coverImageUrl = String(body.coverImageUrl || '').trim();
  }

  if (hasField(body, 'tags')) {
    update.tags = normalizeTags(body.tags);
  }

  return update;
}

function mapCommunity(community, currentUserId) {
  const members = community.members || [];
  const isMember = currentUserId
    ? members.some((member) => member.toString() === currentUserId)
    : false;

  return {
    id: community._id,
    name: community.name,
    location: community.location || '',
    description: community.description,
    coverImageUrl: community.coverImageUrl || '',
    tags: community.tags || [],
    membersCount: members.length,
    postsCount: community.postsCount || 0,
    isMember,
    createdAt: community.createdAt,
    updatedAt: community.updatedAt,
  };
}

router.get('/', async (req, res) => {
  try {
    const currentUserId = readOptionalUserId(req);
    const communities = await Community.find().sort({ createdAt: -1 });

    res.json(
      communities.map((community) => mapCommunity(community, currentUserId))
    );
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const currentUserId = readOptionalUserId(req);
    const community = await Community.findById(req.params.id);

    if (!community) {
      return res.status(404).json({ error: 'Comunidad no encontrada' });
    }

    res.json(mapCommunity(community, currentUserId));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/', adminAuthorization, validateBody(communityCreate), async (req, res) => {
  try {
    const {
      name,
      location = '',
      description,
      coverImageUrl = '',
      tags = [],
    } = req.body;

    const trimmedName = String(name || '').trim();
    const trimmedDescription = String(description || '').trim();

    if (!trimmedName) {
      return res.status(400).json({ error: 'El nombre es obligatorio' });
    }
    if (!trimmedDescription) {
      return res.status(400).json({ error: 'La descripción es obligatoria' });
    }

    const community = new Community({
      name: trimmedName,
      location: String(location).trim(),
      description: trimmedDescription,
      coverImageUrl: String(coverImageUrl).trim(),
      tags: normalizeTags(tags),
      owner: req.user.id,
      members: [req.user.id],
    });

    await community.save();
    res.status(201).json(mapCommunity(community, req.user.id));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/:id', adminAuthorization, validateBody(communityUpdate), async (req, res) => {
  try {
    const update = buildCommunityUpdate(req.body);

    if (Object.keys(update).length === 0) {
      return res.status(400).json({
        error: 'No hay campos validos para actualizar',
      });
    }

    const community = await Community.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true, runValidators: true }
    );

    if (!community) {
      return res.status(404).json({ error: 'Comunidad no encontrada' });
    }

    res.json(mapCommunity(community, req.user.id));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:id', adminAuthorization, async (req, res) => {
  try {
    const community = await Community.findByIdAndDelete(req.params.id);

    if (!community) {
      return res.status(404).json({ error: 'Comunidad no encontrada' });
    }

    res.json({
      message: 'Comunidad eliminada',
      community: mapCommunity(community, req.user.id),
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/:id/join', authMiddleware, async (req, res) => {
  try {
    const community = await Community.findById(req.params.id);
    if (!community) {
      return res.status(404).json({ error: 'Comunidad no encontrada' });
    }

    const alreadyMember = community.members.some(
      (member) => member.toString() === req.user.id
    );

    if (!alreadyMember) {
      community.members.push(req.user.id);
      await community.save();
    }

    res.json(mapCommunity(community, req.user.id));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:id/join', authMiddleware, async (req, res) => {
  try {
    const community = await Community.findById(req.params.id);
    if (!community) {
      return res.status(404).json({ error: 'Comunidad no encontrada' });
    }

    community.members = community.members.filter(
      (member) => member.toString() !== req.user.id
    );
    await community.save();

    res.json(mapCommunity(community, req.user.id));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
