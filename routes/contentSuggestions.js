const express = require('express');
const authMiddleware = require('../middleware/auth');
const { validateBody } = require('../middleware/validateBody');
const ContentSuggestion = require('../models/ContentSuggestion');
const { contentSuggestionCreate } = require('../validation/schemas');

const router = express.Router();

function suggestionKey(kind, title, location) {
  return [kind, title, location]
    .map((value) => String(value || '').trim().toLowerCase())
    .join(':');
}

router.post('/', authMiddleware, validateBody(contentSuggestionCreate), async (req, res) => {
  try {
    const kind = String(req.body.kind).trim();
    const title = String(req.body.title).trim();
    const secondary = String(req.body.secondary || '').trim();
    const location = String(req.body.location || '').trim();
    const description = String(req.body.description || '').trim();
    const key = suggestionKey(kind, title, location);

    const suggestion = await ContentSuggestion.findOneAndUpdate(
      { key },
      {
        $set: { kind, title, secondary, location, description, lastSuggestedAt: new Date() },
        $addToSet: { suggestedBy: req.user.id },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );

    res.status(201).json({
      id: suggestion._id,
      kind: suggestion.kind,
      title: suggestion.title,
      secondary: suggestion.secondary || '',
      location: suggestion.location || '',
      description: suggestion.description || '',
      suggestionsCount: suggestion.suggestedBy.length,
      lastSuggestedAt: suggestion.lastSuggestedAt,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
