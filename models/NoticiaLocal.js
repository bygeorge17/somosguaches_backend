const mongoose = require('mongoose');

const noticiaLocalSchema = new mongoose.Schema({
  kind: {
    type: String,
    enum: ['noticia', 'aviso'],
    default: 'noticia',
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 160,
  },
  summary: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1500,
  },
  body: {
    type: String,
    trim: true,
    maxlength: 15000,
    default: '',
  },
  publishedAt: {
    type: Date,
    default: Date.now,
  },
  source: {
    type: String,
    trim: true,
    maxlength: 120,
    default: '',
  },
  location: {
    type: String,
    trim: true,
    maxlength: 120,
    default: '',
  },
  coverImageUrl: {
    type: String,
    trim: true,
    default: '',
  },
  severity: {
    type: String,
    enum: ['normal', 'importante', 'urgente'],
    default: 'normal',
  },
  tags: [{
    type: String,
    trim: true,
    maxlength: 40,
  }],
  isFeatured: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('NoticiaLocal', noticiaLocalSchema);
