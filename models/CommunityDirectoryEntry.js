const mongoose = require('mongoose');

const communityDirectoryEntrySchema = new mongoose.Schema({
  community: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Community',
    required: true,
    index: true,
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 120,
  },
  category: {
    type: String,
    required: true,
    trim: true,
    maxlength: 80,
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000,
  },
  contact: {
    type: String,
    trim: true,
    maxlength: 160,
    default: '',
  },
  location: {
    type: String,
    trim: true,
    maxlength: 120,
    default: '',
  },
  imageUrl: {
    type: String,
    trim: true,
    default: '',
  },
}, {
  timestamps: true,
});

communityDirectoryEntrySchema.index({ community: 1, createdAt: -1 });

module.exports = mongoose.model(
  'CommunityDirectoryEntry',
  communityDirectoryEntrySchema,
);
