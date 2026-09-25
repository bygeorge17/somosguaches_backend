const mongoose = require('mongoose');
const { commentSchema, ratingSchema } = require('./contentEngagement');

const leyendaSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 140,
  },
  synopsis: {
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
  storyteller: {
    type: String,
    required: true,
    trim: true,
    maxlength: 80,
  },
  sourceType: {
    type: String,
    trim: true,
    maxlength: 60,
    default: '',
  },
  location: {
    type: String,
    trim: true,
    maxlength: 120,
    default: '',
  },
  era: {
    type: String,
    trim: true,
    maxlength: 80,
    default: '',
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
  comments: [commentSchema],
  ratings: [ratingSchema],
  mysteryLevel: {
    type: Number,
    min: 1,
    max: 5,
    default: 3,
  },
  isFeatured: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Leyenda', leyendaSchema);
