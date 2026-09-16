const express = require('express');
const adminAuthorization = require('../middleware/adminAuthorization');
const { validateBody } = require('../middleware/validateBody');
const NoticiaLocal = require('../models/NoticiaLocal');
const { noticiaCreate, noticiaUpdate } = require('../validation/schemas');
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

function parsePublishedAt(value) {
  const publishedAt = new Date(value);
  if (Number.isNaN(publishedAt.getTime())) {
    throw new Error('La fecha de publicación no es válida');
  }
  return publishedAt;
}

function buildNoticiaUpdate(body) {
  const update = {};

  const requiredStrings = {
    title: 'El titulo es obligatorio',
    summary: 'El resumen es obligatorio',
  };

  for (const [field, message] of Object.entries(requiredStrings)) {
    if (hasField(body, field)) {
      update[field] = String(body[field] || '').trim();
      if (!update[field]) {
        throw new Error(message);
      }
    }
  }

  for (const field of ['body', 'source', 'location', 'coverImageUrl']) {
    if (hasField(body, field)) {
      update[field] = String(body[field] || '').trim();
    }
  }

  if (hasField(body, 'publishedAt')) {
    update.publishedAt = parsePublishedAt(body.publishedAt);
  }

  if (hasField(body, 'tags')) {
    update.tags = normalizeTags(body.tags);
  }

  for (const field of ['kind', 'severity', 'isFeatured']) {
    if (hasField(body, field)) {
      update[field] = body[field];
    }
  }

  return update;
}

function mapNoticiaLocal(noticia) {
  return {
    id: noticia._id,
    kind: noticia.kind || 'noticia',
    title: noticia.title,
    summary: noticia.summary,
    body: noticia.body || '',
    publishedAt: noticia.publishedAt,
    source: noticia.source || '',
    location: noticia.location || '',
    coverImageUrl: noticia.coverImageUrl || '',
    severity: noticia.severity || 'normal',
    tags: noticia.tags || [],
    isFeatured: noticia.isFeatured,
    createdAt: noticia.createdAt,
    updatedAt: noticia.updatedAt,
  };
}

router.get('/', async (req, res) => {
  try {
    const noticias = await NoticiaLocal.find().sort({
      isFeatured: -1,
      publishedAt: -1,
      createdAt: -1,
    });

    res.json(noticias.map(mapNoticiaLocal));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const noticia = await NoticiaLocal.findById(req.params.id);

    if (!noticia) {
      return res.status(404).json({ error: 'Noticia local no encontrada' });
    }

    res.json(mapNoticiaLocal(noticia));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/', adminAuthorization, validateBody(noticiaCreate), async (req, res) => {
  try {
    const {
      kind = 'noticia',
      title,
      summary,
      body = '',
      publishedAt = Date.now(),
      source = '',
      location = '',
      coverImageUrl = '',
      severity = 'normal',
      tags = [],
      isFeatured = false,
    } = req.body;

    const trimmedTitle = String(title || '').trim();
    const trimmedSummary = String(summary || '').trim();
    if (!trimmedTitle) {
      return res.status(400).json({ error: 'El titulo es obligatorio' });
    }
    if (!trimmedSummary) {
      return res.status(400).json({ error: 'El resumen es obligatorio' });
    }

    const noticia = new NoticiaLocal({
      kind,
      title: trimmedTitle,
      summary: trimmedSummary,
      body: String(body || '').trim(),
      publishedAt: parsePublishedAt(publishedAt),
      source: String(source || '').trim(),
      location: String(location || '').trim(),
      coverImageUrl: String(coverImageUrl || '').trim(),
      severity,
      tags: normalizeTags(tags),
      isFeatured,
    });

    await noticia.save();
    res.status(201).json(mapNoticiaLocal(noticia));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/:id', adminAuthorization, validateBody(noticiaUpdate), async (req, res) => {
  try {
    const update = buildNoticiaUpdate(req.body);
    if (Object.keys(update).length === 0) {
      return res.status(400).json({
        error: 'No hay campos validos para actualizar',
      });
    }

    const noticia = await NoticiaLocal.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true, runValidators: true }
    );

    if (!noticia) {
      return res.status(404).json({ error: 'Noticia local no encontrada' });
    }

    res.json(mapNoticiaLocal(noticia));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:id', adminAuthorization, async (req, res) => {
  try {
    const noticia = await NoticiaLocal.findByIdAndDelete(req.params.id);

    if (!noticia) {
      return res.status(404).json({ error: 'Noticia local no encontrada' });
    }

    res.json({
      message: 'Noticia local eliminada',
      noticia: mapNoticiaLocal(noticia),
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
