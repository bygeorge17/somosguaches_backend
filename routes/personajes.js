const express = require('express');
const adminAuthorization = require('../middleware/adminAuthorization');
const { validateBody } = require('../middleware/validateBody');
const Personaje = require('../models/Personaje');
const {
  personajeCreate,
  personajeUpdate,
} = require('../validation/schemas');
const router = express.Router();
const { mapEngagement, optionalUserId, populateComments, registerContentEngagement } = require('./contentEngagement');

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

function buildPersonajeUpdate(body) {
  const update = {};

  if (hasField(body, 'name')) {
    update.name = String(body.name || '').trim();
    if (!update.name) {
      throw new Error('El nombre es obligatorio');
    }
  }

  if (hasField(body, 'body')) {
    update.body = String(body.body || '').trim();
    if (!update.body) {
      throw new Error('La descripción es obligatoria');
    }
  }

  for (const field of ['aliasOrRole', 'imageUrl', 'avatarUrl']) {
    if (hasField(body, field)) {
      update[field] = String(body[field] || '').trim();
    }
  }

  if (hasField(body, 'categories')) {
    update.categories = normalizeTags(body.categories);
  }

  for (const field of [
    'avgStars',
    'ratingsCount',
    'commentsCount',
    'isFeatured',
  ]) {
    if (hasField(body, field)) {
      update[field] = body[field];
    }
  }

  return update;
}

function mapPersonaje(personaje, currentUserId = null, includeComments = false) {
  return {
    id: personaje._id,
    name: personaje.name,
    aliasOrRole: personaje.aliasOrRole || '',
    body: personaje.body,
    imageUrl: personaje.imageUrl || '',
    avatarUrl: personaje.avatarUrl || '',
    categories: personaje.categories || [],
    ...mapEngagement(personaje, currentUserId, { includeComments }),
    isFeatured: personaje.isFeatured,
    createdAt: personaje.createdAt,
    updatedAt: personaje.updatedAt,
  };
}

router.get('/', async (req, res) => {
  try {
    const personajes = await Personaje.find().sort({
      isFeatured: -1,
      createdAt: -1,
    });

    res.json(personajes.map(mapPersonaje));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const personaje = await Personaje.findById(req.params.id);

    if (!personaje) {
      return res.status(404).json({ error: 'Personaje no encontrado' });
    }

    await populateComments(personaje);
    res.json(mapPersonaje(personaje, optionalUserId(req), true));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/', adminAuthorization, validateBody(personajeCreate), async (req, res) => {
  try {
    const {
      name,
      aliasOrRole = '',
      body,
      imageUrl = '',
      avatarUrl = '',
      categories = [],
      avgStars = 0,
      ratingsCount = 0,
      commentsCount = 0,
      isFeatured = false,
    } = req.body;

    const trimmedName = String(name || '').trim();
    const trimmedBody = String(body || '').trim();

    if (!trimmedName) {
      return res.status(400).json({ error: 'El nombre es obligatorio' });
    }
    if (!trimmedBody) {
      return res.status(400).json({ error: 'La descripción es obligatoria' });
    }

    const personaje = new Personaje({
      name: trimmedName,
      aliasOrRole: String(aliasOrRole).trim(),
      body: trimmedBody,
      imageUrl: String(imageUrl).trim(),
      avatarUrl: String(avatarUrl).trim(),
      categories: normalizeTags(categories),
      avgStars,
      ratingsCount,
      commentsCount,
      isFeatured,
    });

    await personaje.save();
    res.status(201).json(mapPersonaje(personaje));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/:id', adminAuthorization, validateBody(personajeUpdate), async (req, res) => {
  try {
    const update = buildPersonajeUpdate(req.body);

    if (Object.keys(update).length === 0) {
      return res.status(400).json({
        error: 'No hay campos validos para actualizar',
      });
    }

    const personaje = await Personaje.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true, runValidators: true }
    );

    if (!personaje) {
      return res.status(404).json({ error: 'Personaje no encontrado' });
    }

    res.json(mapPersonaje(personaje));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:id', adminAuthorization, async (req, res) => {
  try {
    const personaje = await Personaje.findByIdAndDelete(req.params.id);
    if (!personaje) {
      return res.status(404).json({ error: 'Personaje no encontrado' });
    }

    res.json({
      message: 'Personaje eliminado',
      personaje: mapPersonaje(personaje),
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

registerContentEngagement(router, {
  Model: Personaje,
  mapResource: mapPersonaje,
  label: 'Personaje',
});

module.exports = router;
