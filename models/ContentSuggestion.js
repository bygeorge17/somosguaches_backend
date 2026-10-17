const mongoose = require('mongoose');

const contentSuggestionSchema = new mongoose.Schema({
  kind: {
    type: String,
    enum: ['personaje', 'historia', 'leyenda'],
    required: true,
  },
  title: { type: String, required: true, trim: true, maxlength: 140 },
  secondary: { type: String, trim: true, maxlength: 120, default: '' },
  location: { type: String, trim: true, maxlength: 120, default: '' },
  description: { type: String, trim: true, maxlength: 1200, default: '' },
  key: { type: String, required: true, unique: true, trim: true },
  suggestedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  lastSuggestedAt: { type: Date, default: Date.now },
}, { timestamps: true });

contentSuggestionSchema.index({ kind: 1, lastSuggestedAt: -1 });

module.exports = mongoose.model('ContentSuggestion', contentSuggestionSchema);
