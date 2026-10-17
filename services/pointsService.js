const mongoose = require('mongoose');
const PointTransaction = require('../models/PointTransaction');
const User = require('../models/User');

const LEVELS = [
  { level: 1, points: 0, name: 'Guache nuevo' },
  { level: 2, points: 100, name: 'Guache curioso' },
  { level: 3, points: 250, name: 'Guache caminante' },
  { level: 4, points: 500, name: 'Guache conversador' },
  { level: 5, points: 850, name: 'Guache de palabra' },
  { level: 6, points: 1300, name: 'Guache cronista' },
  { level: 7, points: 1900, name: 'Guache de memoria' },
  { level: 8, points: 2700, name: 'Guache comunitario' },
  { level: 9, points: 3800, name: 'Guache referente' },
  { level: 10, points: 5200, name: 'Guache supremo' },
];

const ACTIONS = {
  profileComplete: { points: 25, max: 1, periodMs: null },
  profileField: { points: 5, max: 2, periodMs: null },
  postText: { points: 8, max: 3, periodMs: 24 * 60 * 60 * 1000 },
  postImage: { points: 10, max: 3, periodMs: 24 * 60 * 60 * 1000 },
  postVideo: { points: 12, max: 2, periodMs: 24 * 60 * 60 * 1000 },
  comment: { points: 4, max: 5, periodMs: 24 * 60 * 60 * 1000 },
  rating: { points: 2, max: 10, periodMs: 24 * 60 * 60 * 1000 },
  reaction: { points: 1, max: 20, periodMs: 24 * 60 * 60 * 1000 },
  communityJoin: { points: 3, max: 3, periodMs: 24 * 60 * 60 * 1000 },
  approvedSuggestion: { points: 20, max: null, periodMs: null },
  validReport: { points: 15, max: 3, periodMs: 7 * 24 * 60 * 60 * 1000 },
  weeklyStreak: { points: 10, max: 1, periodMs: 7 * 24 * 60 * 60 * 1000 },
};

function levelForPoints(points) {
  const total = Math.max(0, Number(points) || 0);
  return LEVELS.reduce((current, item) => (
    total >= item.points ? item : current
  ), LEVELS[0]);
}

function progressForPoints(points) {
  const current = levelForPoints(points);
  const next = LEVELS.find((item) => item.level === current.level + 1);
  if (!next) {
    return { current, next: null, pointsIntoLevel: 0, pointsToNext: 0, progress: 1 };
  }
  const span = next.points - current.points;
  const pointsIntoLevel = Math.max(0, Number(points) - current.points);
  return {
    current,
    next,
    pointsIntoLevel,
    pointsToNext: Math.max(0, next.points - Number(points)),
    progress: Math.min(1, pointsIntoLevel / span),
  };
}

async function hasReachedLimit(userId, action, rule) {
  if (rule.max == null) return false;
  const since = rule.periodMs == null
    ? null
    : new Date(Date.now() - rule.periodMs);
  const filter = { user: userId, action, reversedAt: null };
  if (since) filter.createdAt = { $gte: since };
  return (await PointTransaction.countDocuments(filter)) >= rule.max;
}

async function awardPoints({
  userId,
  action,
  sourceType = '',
  sourceId = '',
  idempotencyKey,
  reason = '',
}) {
  const rule = ACTIONS[action];
  if (!rule || !userId || !idempotencyKey || mongoose.connection.readyState !== 1) {
    return { awarded: false, points: 0, reason: 'database_not_ready' };
  }

  const existing = await PointTransaction.findOne({ idempotencyKey });
  if (existing) return { awarded: false, points: 0, transaction: existing };
  if (await hasReachedLimit(userId, action, rule)) {
    return { awarded: false, points: 0, reason: 'limit_reached' };
  }

  let transaction;
  try {
    transaction = await PointTransaction.create({
      user: userId,
      action,
      points: rule.points,
      sourceType,
      sourceId,
      idempotencyKey,
      reason,
    });
  } catch (error) {
    if (error?.code === 11000) return { awarded: false, points: 0 };
    throw error;
  }

  try {
    const user = await User.findByIdAndUpdate(
      userId,
      { $inc: { points: rule.points } },
      { new: true },
    );
    if (!user) throw new Error('Usuario no encontrado');
    const level = levelForPoints(user.points);
    if (user.level !== level.level) {
      await User.updateOne({ _id: userId }, { $set: { level: level.level } });
    }
    return { awarded: true, points: rule.points, transaction, level };
  } catch (error) {
    await PointTransaction.deleteOne({ _id: transaction._id }).catch(() => {});
    throw error;
  }
}

async function pointsSummary(userId) {
  const user = await User.findById(userId).select('points level');
  if (!user) return null;
  return {
    points: Number(user.points || 0),
    ...progressForPoints(user.points),
  };
}

module.exports = {
  ACTIONS,
  LEVELS,
  awardPoints,
  levelForPoints,
  pointsSummary,
  progressForPoints,
};
