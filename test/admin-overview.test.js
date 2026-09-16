const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const router = require('../routes/admin');
const User = require('../models/User');
const Post = require('../models/Post');
const { JWT_SECRET } = require('../config/env');
const { replaceMethod, withServer } = require('../test-support/http');
const models = ['Community', 'Personaje', 'Historia', 'Leyenda'].map(name => require(`../models/${name}`));
function app() { const result = express(); result.use('/admin', router); return result; }
const authorization = `Bearer ${jwt.sign({ id: '507f1f77bcf86cd799439011', isAdmin: true }, JWT_SECRET)}`;

test('resumen exige sesión y consulta el rol vigente aunque el token diga admin', async () => {
  const restore = replaceMethod(User, 'findById', () => ({ select: async () => ({ role: 'user', isActive: true }) }));
  try {
    await withServer(app(), async base => {
      assert.equal((await fetch(`${base}/admin/overview`)).status, 401);
      assert.equal((await fetch(`${base}/admin/overview`, { headers: { authorization } })).status, 403);
    });
  } finally { restore(); }
});

test('resumen cuenta recursos y limita los recientes sin exponer documentos completos', async () => {
  const restore = [replaceMethod(User, 'findById', () => ({ select: async () => ({ role: 'admin', isActive: true }) }))];
  const userQueries = [];
  restore.push(replaceMethod(User, 'countDocuments', async query => {
    userQueries.push(query);
    if (query?.isActive) return 7;
    if (query?.role === 'admin') return 2;
    return 9;
  }));
  const postQueries = [];
  restore.push(replaceMethod(Post, 'countDocuments', async query => {
    postQueries.push(query);
    return query?.mediaUrl ? 3 : 8;
  }));
  restore.push(replaceMethod(Post, 'aggregate', async pipeline => {
    assert.deepEqual(pipeline, [{ $group: { _id: null, comments: { $sum: { $size: '$comments' } }, ratings: { $sum: { $size: '$ratings' } } } }]);
    return [{ comments: 14, ratings: 5 }];
  }));
  for (const [index, Model] of models.entries()) {
    restore.push(replaceMethod(Model, 'countDocuments', async () => index + 10));
    restore.push(replaceMethod(Model, 'find', () => ({
      select(fields) {
        assert.equal(fields, 'name title createdAt');
        return { sort: () => ({ limit(n) {
          assert.equal(n, 5);
          return { lean: async () => Array.from({ length: 5 }, (_, i) => ({
            _id: `${index}-${i}`, title: `Contenido ${index}`, createdAt: new Date(2026, index, i + 1),
          })) };
        } }) };
      },
    })));
  }
  try {
    await withServer(app(), async base => {
      const response = await fetch(`${base}/admin/overview`, { headers: { authorization } });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      const body = await response.json();
      assert.deepEqual(body.counts, { communities: 10, personajes: 11, historias: 12, leyendas: 13 });
      assert.deepEqual(body.stats, {
        users: { total: 9, active: 7, admins: 2 },
        posts: { total: 8, withMedia: 3, comments: 14, ratings: 5 },
      });
      assert.deepEqual(userQueries, [{}, { isActive: true }, { role: 'admin' }]);
      assert.deepEqual(postQueries, [{}, { mediaUrl: { $ne: '' } }]);
      assert.equal(body.recent.length, 5);
      assert.equal(body.recent[0].resource, 'leyendas');
      assert.equal(body.recent[0].id, '3-4');
    });
  } finally { restore.reverse().forEach(fn => fn()); }
});
