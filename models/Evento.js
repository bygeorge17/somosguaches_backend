const mongoose = require('mongoose');

const eventoSchema = new mongoose.Schema({
  kind: {
    type: String,
    enum: ['evento', 'tradicion'],
    default: 'evento',
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 140,
  },
  start: {
    type: Date,
    required: true,
  },
  end: {
    type: Date,
    default: null,
  },
  location: {
    type: String,
    trim: true,
    maxlength: 120,
    default: '',
  },
  organizer: {
    type: String,
    trim: true,
    maxlength: 120,
    default: '',
  },
  description: {
    type: String,
    trim: true,
    maxlength: 3000,
    default: '',
  },
  coverImageUrl: {
    type: String,
    trim: true,
    default: '',
  },
  tags: [{
    type: String,
    trim: true,
    maxlength: 40,
  }],
  attendeesCount: {
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

eventoSchema.pre('validate', function validateDateRange(next) {
  if (this.end && this.start && this.end < this.start) {
    this.invalidate('end', 'La fecha final debe ser posterior a la fecha inicial');
  }
  next();
});

module.exports = mongoose.model('Evento', eventoSchema);
