const express = require('express');
const adminAuthorization = require('../middleware/adminAuthorization');
const { validateBody } = require('../middleware/validateBody');
const Evento = require('../models/Evento');
const { eventoCreate, eventoUpdate } = require('../validation/schemas');
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

function parseDate(value, message, allowEmpty = false) {
  if (allowEmpty && (value === null || value === '')) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(message);
  }

  return date;
}

function buildEventoUpdate(body) {
  const update = {};

  if (hasField(body, 'title')) {
    update.title = String(body.title || '').trim();
    if (!update.title) {
      throw new Error('El titulo es obligatorio');
    }
  }

  for (const field of [
    'location',
    'organizer',
    'description',
    'coverImageUrl',
  ]) {
    if (hasField(body, field)) {
      update[field] = String(body[field] || '').trim();
    }
  }

  if (hasField(body, 'start')) {
    update.start = parseDate(body.start, 'La fecha inicial no es válida');
  }

  if (hasField(body, 'end')) {
    update.end = parseDate(body.end, 'La fecha final no es válida', true);
  }

  if (hasField(body, 'tags')) {
    update.tags = normalizeTags(body.tags);
  }

  for (const field of ['kind', 'attendeesCount', 'isFeatured']) {
    if (hasField(body, field)) {
      update[field] = body[field];
    }
  }

  return update;
}

function mapEvento(evento) {
  return {
    id: evento._id,
    kind: evento.kind || 'evento',
    title: evento.title,
    start: evento.start,
    end: evento.end || null,
    location: evento.location || '',
    organizer: evento.organizer || '',
    description: evento.description || '',
    coverImageUrl: evento.coverImageUrl || '',
    tags: evento.tags || [],
    attendeesCount: evento.attendeesCount || 0,
    isFeatured: evento.isFeatured,
    createdAt: evento.createdAt,
    updatedAt: evento.updatedAt,
  };
}

router.get('/', async (req, res) => {
  try {
    const eventos = await Evento.find().sort({
      isFeatured: -1,
      start: 1,
      createdAt: -1,
    });

    res.json(eventos.map(mapEvento));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const evento = await Evento.findById(req.params.id);

    if (!evento) {
      return res.status(404).json({ error: 'Evento no encontrado' });
    }

    res.json(mapEvento(evento));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/', adminAuthorization, validateBody(eventoCreate), async (req, res) => {
  try {
    const {
      kind = 'evento',
      title,
      start,
      end = null,
      location = '',
      organizer = '',
      description = '',
      coverImageUrl = '',
      tags = [],
      attendeesCount = 0,
      isFeatured = false,
    } = req.body;

    const trimmedTitle = String(title || '').trim();
    if (!trimmedTitle) {
      return res.status(400).json({ error: 'El titulo es obligatorio' });
    }

    const startDate = parseDate(start, 'La fecha inicial es obligatoria');
    const endDate = parseDate(end, 'La fecha final no es válida', true);
    if (endDate && endDate < startDate) {
      return res.status(400).json({
        error: 'La fecha final debe ser posterior a la fecha inicial',
      });
    }

    const evento = new Evento({
      kind,
      title: trimmedTitle,
      start: startDate,
      end: endDate,
      location: String(location).trim(),
      organizer: String(organizer).trim(),
      description: String(description).trim(),
      coverImageUrl: String(coverImageUrl).trim(),
      tags: normalizeTags(tags),
      attendeesCount,
      isFeatured,
    });

    await evento.save();
    res.status(201).json(mapEvento(evento));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/:id', adminAuthorization, validateBody(eventoUpdate), async (req, res) => {
  try {
    const update = buildEventoUpdate(req.body);
    if (Object.keys(update).length === 0) {
      return res.status(400).json({
        error: 'No hay campos validos para actualizar',
      });
    }

    const currentEvento = await Evento.findById(req.params.id);
    if (!currentEvento) {
      return res.status(404).json({ error: 'Evento no encontrado' });
    }

    const resultingStart = update.start || currentEvento.start;
    const resultingEnd = hasField(update, 'end') ? update.end : currentEvento.end;
    if (resultingEnd && resultingEnd < resultingStart) {
      return res.status(400).json({
        error: 'La fecha final debe ser posterior a la fecha inicial',
      });
    }

    const evento = await Evento.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true, runValidators: true }
    );

    res.json(mapEvento(evento));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:id', adminAuthorization, async (req, res) => {
  try {
    const evento = await Evento.findByIdAndDelete(req.params.id);

    if (!evento) {
      return res.status(404).json({ error: 'Evento no encontrado' });
    }

    res.json({ message: 'Evento eliminado', evento: mapEvento(evento) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
