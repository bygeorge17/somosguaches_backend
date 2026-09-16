const express = require('express');
const adminAuthorization = require('../middleware/adminAuthorization');
const { validateBody } = require('../middleware/validateBody');
const Leyenda = require('../models/Leyenda');
const { leyendaCreate, leyendaUpdate } = require('../validation/schemas');
const router = express.Router();

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

function buildLeyendaUpdate(body) {
  const update = {};

  const requiredStrings = {
    title: 'El titulo es obligatorio',
    synopsis: 'La sinopsis es obligatoria',
    storyteller: 'El narrador es obligatorio',
  };

  for (const [field, message] of Object.entries(requiredStrings)) {
    if (hasField(body, field)) {
      update[field] = String(body[field] || '').trim();
      if (!update[field]) {
        throw new Error(message);
      }
    }
  }

  for (const field of [
    'body',
    'coverImageUrl',
    'sourceType',
    'location',
    'era',
  ]) {
    if (hasField(body, field)) {
      update[field] = String(body[field] || '').trim();
    }
  }

  if (hasField(body, 'tags')) {
    update.tags = normalizeTags(body.tags);
  }

  for (const field of [
    'avgStars',
    'commentsCount',
    'mysteryLevel',
    'isFeatured',
  ]) {
    if (hasField(body, field)) {
      update[field] = body[field];
    }
  }

  return update;
}

function mapLeyenda(leyenda) {
  return {
    id: leyenda._id,
    title: leyenda.title,
    synopsis: leyenda.synopsis,
    body: leyenda.body || '',
    coverImageUrl: leyenda.coverImageUrl || '',
    storyteller: leyenda.storyteller,
    sourceType: leyenda.sourceType || '',
    location: leyenda.location || '',
    era: leyenda.era || '',
    tags: leyenda.tags || [],
    avgStars: leyenda.avgStars || 0,
    commentsCount: leyenda.commentsCount || 0,
    mysteryLevel: leyenda.mysteryLevel || 3,
    isFeatured: leyenda.isFeatured,
    createdAt: leyenda.createdAt,
    updatedAt: leyenda.updatedAt,
  };
}

router.get('/', async (req, res) => {
  try {
    const leyendas = await Leyenda.find().sort({
      isFeatured: -1,
      createdAt: -1,
    });

    res.json(leyendas.map(mapLeyenda));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const leyenda = await Leyenda.findById(req.params.id);

    if (!leyenda) {
      return res.status(404).json({ error: 'Leyenda no encontrada' });
    }

    res.json(mapLeyenda(leyenda));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/', adminAuthorization, validateBody(leyendaCreate), async (req, res) => {
  try {
    const {
      title,
      synopsis,
      body = '',
      coverImageUrl = '',
      storyteller,
      sourceType = '',
      location = '',
      era = '',
      tags = [],
      avgStars = 0,
      commentsCount = 0,
      mysteryLevel = 3,
      isFeatured = false,
    } = req.body;

    const trimmedTitle = String(title || '').trim();
    const trimmedSynopsis = String(synopsis || '').trim();
    const trimmedStoryteller = String(storyteller || '').trim();

    if (!trimmedTitle) {
      return res.status(400).json({ error: 'El titulo es obligatorio' });
    }
    if (!trimmedSynopsis) {
      return res.status(400).json({ error: 'La sinopsis es obligatoria' });
    }
    if (!trimmedStoryteller) {
      return res.status(400).json({ error: 'El narrador es obligatorio' });
    }

    const leyenda = new Leyenda({
      title: trimmedTitle,
      synopsis: trimmedSynopsis,
      body: String(body).trim(),
      coverImageUrl: String(coverImageUrl).trim(),
      storyteller: trimmedStoryteller,
      sourceType: String(sourceType).trim(),
      location: String(location).trim(),
      era: String(era).trim(),
      tags: normalizeTags(tags),
      avgStars,
      commentsCount,
      mysteryLevel,
      isFeatured,
    });

    await leyenda.save();
    res.status(201).json(mapLeyenda(leyenda));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/:id', adminAuthorization, validateBody(leyendaUpdate), async (req, res) => {
  try {
    const update = buildLeyendaUpdate(req.body);

    if (Object.keys(update).length === 0) {
      return res.status(400).json({
        error: 'No hay campos validos para actualizar',
      });
    }

    const leyenda = await Leyenda.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true, runValidators: true }
    );

    if (!leyenda) {
      return res.status(404).json({ error: 'Leyenda no encontrada' });
    }

    res.json(mapLeyenda(leyenda));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:id', adminAuthorization, async (req, res) => {
  try {
    const leyenda = await Leyenda.findByIdAndDelete(req.params.id);
    if (!leyenda) {
      return res.status(404).json({ error: 'Leyenda no encontrada' });
    }

    res.json({ message: 'Leyenda eliminada', leyenda: mapLeyenda(leyenda) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
