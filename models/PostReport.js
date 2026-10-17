const mongoose = require('mongoose');

const postReportSchema = new mongoose.Schema({
  post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true, index: true },
  reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  reason: { type: String, enum: ['harassment', 'hate', 'sexual', 'violence', 'spam', 'misinformation', 'other'], required: true },
  details: { type: String, trim: true, maxlength: 1000, default: '' },
  status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending', index: true },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  reviewNote: { type: String, trim: true, maxlength: 500, default: '' },
}, { timestamps: true });

postReportSchema.index({ post: 1, reporter: 1, status: 1 });

module.exports = mongoose.model('PostReport', postReportSchema);
