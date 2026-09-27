const mongoose = require('mongoose');

const communitySuggestionSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 80,
  },
  location: {
    type: String,
    trim: true,
    maxlength: 120,
    default: '',
  },
  description: {
    type: String,
    trim: true,
    maxlength: 1000,
    default: '',
  },
  suggestedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  lastSuggestedAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('CommunitySuggestion', communitySuggestionSchema);
