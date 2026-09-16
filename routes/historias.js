const express = require('express');
const adminAuthorization = require('../middleware/adminAuthorization');
const { validateBody } = require('../middleware/validateBody');
const Historia = require('../models/Historia');
const { historiaCreate, historiaUpdate } = require('../validation/schemas');
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

function buildHistoriaUpdate(body) {
  const update = {};

  const requiredStrings = {
    title: 'El titulo es obligatorio',
    excerpt: 'El extracto es obligatorio',
    authorName: 'El autor es obligatorio',
  };

  for (const [field, message] of Object.entries(requiredStrings)) {
    if (hasField(body, field)) {
      update[field] = String(body[field] || '').trim();
      if (!update[field]) {
        throw new Error(message);
      }
    }
  }

  for (const field of ['body', 'coverImageUrl', 'location']) {
    if (hasField(body, field)) {
      update[field] = String(body[field] || '').trim();
    }
  }

  if (hasField(body, 'publishedAt')) {
    const publishedAt = new Date(body.publishedAt);
    if (Number.isNaN(publishedAt.getTime())) {
      throw new Error('La fecha de publicación no es válida');
    }
    update.publishedAt = publishedAt;
  }

  if (hasField(body, 'tags')) {
    update.tags = normalizeTags(body.tags);
  }

  for (const field of [
    'readMinutes',
    'avgStars',
    'commentsCount',
    'isFeatured',
  ]) {
    if (hasField(body, field)) {
      update[field] = body[field];
    }
  }

  return update;
}

function mapHistoria(historia) {
  return {
    id: historia._id,
    title: historia.title,
    excerpt: historia.excerpt,
    body: historia.body || '',
    coverImageUrl: historia.coverImageUrl || '',
    authorName: historia.authorName,
    location: historia.location || '',
    publishedAt: historia.publishedAt,
    readMinutes: historia.readMinutes || 3,
    tags: historia.tags || [],
    avgStars: historia.avgStars || 0,
    commentsCount: historia.commentsCount || 0,
    isFeatured: historia.isFeatured,
    createdAt: historia.createdAt,
    updatedAt: historia.updatedAt,
  };
}

router.get('/', async (req, res) => {
  try {
    const historias = await Historia.find().sort({
      isFeatured: -1,
      publishedAt: -1,
      createdAt: -1,
    });

    res.json(historias.map(mapHistoria));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const historia = await Historia.findById(req.params.id);

    if (!historia) {
      return res.status(404).json({ error: 'Historia no encontrada' });
    }

    res.json(mapHistoria(historia));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/', adminAuthorization, validateBody(historiaCreate), async (req, res) => {
  try {
    const {
      title,
      excerpt,
      body = '',
      coverImageUrl = '',
      authorName,
      location = '',
      publishedAt,
      readMinutes = 3,
      tags = [],
      avgStars = 0,
      commentsCount = 0,
      isFeatured = false,
    } = req.body;

    const trimmedTitle = String(title || '').trim();
    const trimmedExcerpt = String(excerpt || '').trim();
    const trimmedAuthor = String(authorName || '').trim();

    if (!trimmedTitle) {
      return res.status(400).json({ error: 'El titulo es obligatorio' });
    }
    if (!trimmedExcerpt) {
      return res.status(400).json({ error: 'El extracto es obligatorio' });
    }
    if (!trimmedAuthor) {
      return res.status(400).json({ error: 'El autor es obligatorio' });
    }

    const historia = new Historia({
      title: trimmedTitle,
      excerpt: trimmedExcerpt,
      body: String(body).trim(),
      coverImageUrl: String(coverImageUrl).trim(),
      authorName: trimmedAuthor,
      location: String(location).trim(),
      publishedAt: publishedAt ? new Date(publishedAt) : Date.now(),
      readMinutes,
      tags: normalizeTags(tags),
      avgStars,
      commentsCount,
      isFeatured,
    });

    await historia.save();
    res.status(201).json(mapHistoria(historia));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/:id', adminAuthorization, validateBody(historiaUpdate), async (req, res) => {
  try {
    const update = buildHistoriaUpdate(req.body);

    if (Object.keys(update).length === 0) {
      return res.status(400).json({
        error: 'No hay campos validos para actualizar',
      });
    }

    const historia = await Historia.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true, runValidators: true }
    );

    if (!historia) {
      return res.status(404).json({ error: 'Historia no encontrada' });
    }

    res.json(mapHistoria(historia));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:id', adminAuthorization, async (req, res) => {
  try {
    const historia = await Historia.findByIdAndDelete(req.params.id);
    if (!historia) {
      return res.status(404).json({ error: 'Historia no encontrada' });
    }

    res.json({ message: 'Historia eliminada', historia: mapHistoria(historia) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
