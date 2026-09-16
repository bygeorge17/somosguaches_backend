const mongoose = require('mongoose');

const historiaSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 140,
  },
  excerpt: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1200,
  },
  body: {
    type: String,
    trim: true,
    maxlength: 12000,
    default: '',
  },
  coverImageUrl: {
    type: String,
    trim: true,
    default: '',
  },
  authorName: {
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
  publishedAt: {
    type: Date,
    default: Date.now,
  },
  readMinutes: {
    type: Number,
    min: 1,
    default: 3,
  },
  tags: [{
    type: String,
    trim: true,
    maxlength: 40,
  }],
  avgStars: {
    type: Number,
    min: 0,
    max: 5,
    default: 0,
  },
  commentsCount: {
    type: Number,
    min: 0,
    default: 0,
  },
  isFeatured: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Historia', historiaSchema);
