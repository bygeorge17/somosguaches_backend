const express = require('express');
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
const { JWT_SECRET } = require('../config/env');
const {
  communityCreate,
  communitySuggestionCreate,
  communityUpdate,
  directoryEntryCreate,
  directoryEntryUpdate,
} = require('../validation/schemas');
const router = express.Router();
const directoryUploadDir = path.join(__dirname, '..', 'public', 'uploads', 'directory');
const directoryUploadUrlPrefix = '/uploads/directory/';
const maxDirectoryImageBytes = 8 * 1024 * 1024;
const imageMimeByExtension = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

fs.mkdirSync(directoryUploadDir, { recursive: true });

const directoryUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, directoryUploadDir),
    filename: (_req, file, callback) => {
      const extension = directoryImageExtension(file.originalname, file.mimetype);
      const baseName = path
        .basename(file.originalname, path.extname(file.originalname))
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'directory';
      callback(null, `${Date.now()}-${baseName}${extension}`);
    },
  }),
  fileFilter: (_req, file, callback) => {
    if (!directoryImageKind(file.originalname, file.mimetype)) {
      return callback(new Error('El archivo debe ser una imagen valida'));
    }
    callback(null, true);
  },
  limits: { fileSize: maxDirectoryImageBytes, files: 1 },
});

function directoryImageKind(originalName, mimeType) {
  const extension = path.extname(originalName || '').toLowerCase();
  return imageMimeByExtension[extension] &&
    [imageMimeByExtension[extension], 'application/octet-stream'].includes(mimeType);
}

function directoryImageExtension(originalName, mimeType) {
  const extension = path.extname(originalName || '').toLowerCase();
  if (imageMimeByExtension[extension]) return extension;
  return Object.entries(imageMimeByExtension)
    .find(([, value]) => value === mimeType)?.[0] || extension;
}

function removeUploadedDirectoryFile(file) {
  if (!file?.path) return Promise.resolve();
  return fs.promises.unlink(file.path).catch(() => {});
}

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

function suggestionKey(name, location) {
  return `${name}|${location}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

function isCommunityMember(community, userId) {
  if (!community || !userId) return false;
  return (community.members || []).some((member) => member.toString() === userId);
}

function mapDirectoryEntry(entry) {
  return {
    id: entry._id,
    communityId: entry.community?._id?.toString() || entry.community?.toString() || '',
    owner: {
      id: entry.owner?._id?.toString() || entry.owner?.toString() || '',
      name: entry.owner?.name || 'Guache',
      avatar: entry.owner?.avatar || '',
    },
    name: entry.name,
    category: entry.category,
    description: entry.description,
    contact: entry.contact || '',
    location: entry.location || '',
    imageUrl: entry.imageUrl || '',
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

function buildDirectoryUpdate(body) {
  const update = {};
  for (const field of ['name', 'category', 'description']) {
    if (hasField(body, field)) {
      update[field] = String(body[field] || '').trim();
      if (!update[field]) throw new Error('Hay campos obligatorios vacios');
    }
  }
  for (const field of ['contact', 'location', 'imageUrl']) {
    if (hasField(body, field)) update[field] = String(body[field] || '').trim();
  }
  return update;
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

router.post('/suggestions', authMiddleware, validateBody(communitySuggestionCreate), async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const location = String(req.body.location || '').trim();
    const description = String(req.body.description || '').trim();
    const key = suggestionKey(name, location);

    const suggestion = await CommunitySuggestion.findOneAndUpdate(
      { key },
      {
        $setOnInsert: { key, name, location },
        $set: {
          description,
          lastSuggestedAt: new Date(),
        },
        $addToSet: { suggestedBy: req.user.id },
      },
      { new: true, upsert: true, runValidators: true },
    );

    res.status(201).json({
      id: suggestion._id,
      name: suggestion.name,
      location: suggestion.location || '',
      description: suggestion.description || '',
      suggestionsCount: suggestion.suggestedBy.length,
      lastSuggestedAt: suggestion.lastSuggestedAt,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/:id/directory', async (req, res) => {
  try {
    const community = await Community.findById(req.params.id);
    if (!community) {
      return res.status(404).json({ error: 'Comunidad no encontrada' });
    }

    const entries = await CommunityDirectoryEntry.find({
      community: req.params.id,
    })
      .sort({ createdAt: -1 })
      .populate('owner', 'name avatar');

    res.json(entries.map(mapDirectoryEntry));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/:id/directory', authMiddleware, validateBody(directoryEntryCreate), async (req, res) => {
  try {
    const community = await Community.findById(req.params.id);
    if (!community) {
      return res.status(404).json({ error: 'Comunidad no encontrada' });
    }
    if (!isCommunityMember(community, req.user.id)) {
      return res.status(403).json({
        error: 'Debes unirte a la comunidad para anunciarte en el directorio',
      });
    }

    const entry = new CommunityDirectoryEntry({
      community: community._id,
      owner: req.user.id,
      name: String(req.body.name || '').trim(),
      category: String(req.body.category || '').trim(),
      description: String(req.body.description || '').trim(),
      contact: String(req.body.contact || '').trim(),
      location: String(req.body.location || '').trim(),
      imageUrl: String(req.body.imageUrl || '').trim(),
    });

    await entry.save();
    await entry.populate('owner', 'name avatar');
    res.status(201).json(mapDirectoryEntry(entry));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/:id/directory/media', authMiddleware, async (req, res) => {
  directoryUpload.single('media')(req, res, async (uploadError) => {
    if (uploadError) {
      const message = uploadError instanceof multer.MulterError
        ? 'La imagen no puede superar 8 MB'
        : uploadError.message;
      return res.status(400).json({ error: message });
    }

    try {
      const community = await Community.findById(req.params.id);
      if (!community) {
        await removeUploadedDirectoryFile(req.file);
        return res.status(404).json({ error: 'Comunidad no encontrada' });
      }
      if (!isCommunityMember(community, req.user.id)) {
        await removeUploadedDirectoryFile(req.file);
        return res.status(403).json({
          error: 'Debes unirte a la comunidad para subir imagenes del directorio',
        });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'Selecciona una imagen' });
      }

      res.status(201).json({
        imageUrl: `${directoryUploadUrlPrefix}${req.file.filename}`,
      });
    } catch (error) {
      await removeUploadedDirectoryFile(req.file);
      res.status(400).json({ error: error.message });
    }
  });
});

router.put('/:id/directory/:entryId', authMiddleware, validateBody(directoryEntryUpdate), async (req, res) => {
  try {
    const entry = await CommunityDirectoryEntry.findOne({
      _id: req.params.entryId,
      community: req.params.id,
    });
    if (!entry) {
      return res.status(404).json({ error: 'Anuncio no encontrado' });
    }
    const isOwner = entry.owner.toString() === req.user.id;
    if (!isOwner && req.user.isAdmin !== true) {
      return res.status(403).json({ error: 'Solo puedes editar tus anuncios' });
    }

    Object.assign(entry, buildDirectoryUpdate(req.body));
    await entry.save();
    await entry.populate('owner', 'name avatar');
    res.json(mapDirectoryEntry(entry));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:id/directory/:entryId', authMiddleware, async (req, res) => {
  try {
    const entry = await CommunityDirectoryEntry.findOne({
      _id: req.params.entryId,
      community: req.params.id,
    });
    if (!entry) {
      return res.status(404).json({ error: 'Anuncio no encontrado' });
    }
    const isOwner = entry.owner.toString() === req.user.id;
    if (!isOwner && req.user.isAdmin !== true) {
      return res.status(403).json({ error: 'Solo puedes eliminar tus anuncios' });
    }

    await entry.deleteOne();
    res.json({ message: 'Anuncio eliminado', id: req.params.entryId });
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
