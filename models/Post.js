const mongoose = require('mongoose');

const commentReactionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  value: {
    type: String,
    enum: ['like', 'dislike'],
    required: true,
  },
}, {
  timestamps: true,
});

const commentSchema = new mongoose.Schema({
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  text: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000,
  },
  reactions: [commentReactionSchema],
}, {
  timestamps: true,
});

const ratingSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  stars: {
    type: Number,
    required: true,
    min: 1,
    max: 5,
  },
}, {
  timestamps: true,
});

const postSchema = new mongoose.Schema({
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  type: {
    type: String,
    enum: ['text', 'image', 'video'],
    default: 'text',
  },
  text: {
    type: String,
    required: function () { return this.type !== 'image'; },
    default: '',
    trim: true,
    maxlength: 3000,
  },
  mediaUrl: {
    type: String,
    trim: true,
    default: '',
  },
  community: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Community',
    default: null,
    index: true,
  },
  tags: [{
    type: String,
    trim: true,
    maxlength: 40,
  }],
  comments: [commentSchema],
  ratings: [ratingSchema],
}, {
  timestamps: true,
});

postSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Post', postSchema);
