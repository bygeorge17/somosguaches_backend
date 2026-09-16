const mongoose = require('mongoose');

const communitySchema = new mongoose.Schema({
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
    required: true,
    trim: true,
    maxlength: 2000,
  },
  coverImageUrl: {
    type: String,
    trim: true,
    default: '',
  },
  tags: [{
    type: String,
    trim: true,
    maxlength: 30,
  }],
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  members: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  postsCount: {
    type: Number,
    min: 0,
    default: 0,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Community', communitySchema);
