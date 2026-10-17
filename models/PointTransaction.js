const mongoose = require('mongoose');

const pointTransactionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  action: { type: String, required: true, trim: true, maxlength: 60 },
  points: { type: Number, required: true, min: 0 },
  sourceType: { type: String, trim: true, maxlength: 40, default: '' },
  sourceId: { type: String, trim: true, maxlength: 120, default: '' },
  idempotencyKey: { type: String, required: true, unique: true, trim: true },
  reason: { type: String, trim: true, maxlength: 240, default: '' },
  reversedAt: { type: Date, default: null },
}, { timestamps: true });

pointTransactionSchema.index({ user: 1, createdAt: -1 });
pointTransactionSchema.index({ user: 1, action: 1, createdAt: -1 });

module.exports = mongoose.model('PointTransaction', pointTransactionSchema);
