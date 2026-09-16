const mongoose = require('mongoose');

const personajeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
  },
  aliasOrRole: {
    type: String,
    trim: true,
    maxlength: 120,
    default: '',
  },
  body: {
    type: String,
    required: true,
    trim: true,
    maxlength: 3000,
  },
  imageUrl: {
    type: String,
    trim: true,
    default: '',
  },
  avatarUrl: {
    type: String,
    trim: true,
    default: '',
  },
  categories: [{
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
  ratingsCount: {
    type: Number,
    min: 0,
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

module.exports = mongoose.model('Personaje', personajeSchema);
