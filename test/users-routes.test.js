const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const usersRouter = require('../routes/users');
const User = require('../models/User');
const { JWT_SECRET } = require('../config/env');
const { readJson, replaceMethod, withServer } = require('../test-support/http');

function token(id, isAdmin = false) {
  return jwt.sign({ id, isAdmin, role: isAdmin ? 'admin' : 'user' }, JWT_SECRET);
}

function testApp() {
  const app = express();
  app.use(express.json());
  app.use('/users', usersRouter);
  return app;
}

function serializedUser(id, overrides = {}) {
  return {
    _id: id,
    email: 'user@example.com',
    name: 'Usuario',
    bio: '',
    avatar: '',
    role: 'user',
    isAdmin: false,
    isActive: true,
    followers: [],
    following: [],
    ...overrides,
  };
}

test('perfil propio devuelve datos privados y métricas', async () => {
  const userId = '507f1f77bcf86cd799439011';
  const restore = replaceMethod(User, 'findById', async () => serializedUser(
    userId,
    {
      bio: 'Cronista calentano',
      followers: ['507f191e810c19729de860ea'],
      following: ['507f191e810c19729de860eb'],
      createdAt: new Date('2026-01-15T00:00:00.000Z'),
    },
  ));

  try {
    await withServer(testApp(), async (baseUrl) => {
      const { response, body } = await readJson(await fetch(
        `${baseUrl}/users/me`,
        {
          headers: { Authorization: `Bearer ${token(userId)}` },
        },
      ));

      assert.equal(response.status, 200);
      assert.equal(body.user.email, 'user@example.com');
      assert.equal(body.user.bio, 'Cronista calentano');
      assert.equal(body.user.followersCount, 1);
      assert.equal(body.user.followingCount, 1);
    });
  } finally {
    restore();
  }
});

test('perfil propio acepta solo name, bio y avatar', async () => {
  const userId = '507f1f77bcf86cd799439011';
  let receivedUpdate;
  const restore = replaceMethod(User, 'findByIdAndUpdate', async (id, update) => {
    receivedUpdate = update;
    return serializedUser(id, update);
  });

  try {
    await withServer(testApp(), async (baseUrl) => {
      let result = await readJson(await fetch(`${baseUrl}/users/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token(userId)}`,
        },
        body: JSON.stringify({ name: 'Nuevo', bio: 'Bio', role: 'admin' }),
      }));
      assert.equal(result.response.status, 400);
      assert.equal(receivedUpdate, undefined);

      result = await readJson(await fetch(`${baseUrl}/users/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token(userId)}`,
        },
        body: JSON.stringify({
          name: ' Nuevo nombre ',
          bio: ' Nueva bio ',
          avatar: 'https://example.com/avatar.jpg',
        }),
      }));
      assert.equal(result.response.status, 200);
      assert.deepEqual(receivedUpdate, {
        name: 'Nuevo nombre',
        bio: 'Nueva bio',
        avatar: 'https://example.com/avatar.jpg',
      });
    });
  } finally {
    restore();
  }
});

test('usuario normal no puede cambiar roles', async () => {
  const userId = '507f1f77bcf86cd799439011';
  const targetId = '507f191e810c19729de860ea';
  const restore = replaceMethod(User, 'findById', () => ({
    select: async () => serializedUser(userId),
  }));

  try {
    await withServer(testApp(), async (baseUrl) => {
      const { response, body } = await readJson(await fetch(
        `${baseUrl}/users/${targetId}/role`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token(userId)}`,
          },
          body: JSON.stringify({ role: 'admin' }),
        },
      ));
      assert.equal(response.status, 403);
      assert.match(body.error, /administrador/);
    });
  } finally {
    restore();
  }
});

test('admin puede asignar rol y se sincroniza isAdmin', async () => {
  const adminId = '507f1f77bcf86cd799439011';
  const targetId = '507f191e810c19729de860ea';
  const restoreFind = replaceMethod(User, 'findById', () => ({
    select: async () => serializedUser(adminId, { role: 'admin', isAdmin: true }),
  }));
  const restoreUpdate = replaceMethod(User, 'findByIdAndUpdate', async (id, update) => (
    serializedUser(id, update)
  ));

  try {
    await withServer(testApp(), async (baseUrl) => {
      const { response, body } = await readJson(await fetch(
        `${baseUrl}/users/${targetId}/role`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token(adminId, true)}`,
          },
          body: JSON.stringify({ role: 'admin' }),
        },
      ));
      assert.equal(response.status, 200);
      assert.equal(body.user.role, 'admin');
      assert.equal(body.user.isAdmin, true);
    });
  } finally {
    restoreUpdate();
    restoreFind();
  }
});

test('seguir y dejar de seguir actualiza ambos usuarios', async () => {
  const currentId = '507f1f77bcf86cd799439011';
  const targetId = '507f191e810c19729de860ea';
  const currentUser = serializedUser(currentId);
  const targetUser = serializedUser(targetId, { name: 'Objetivo' });
  let operation = 'follow';
  let updates = [];

  const restoreFind = replaceMethod(User, 'findById', async (id) => {
    if (id.toString() === currentId) return currentUser;
    return serializedUser(targetId, {
      name: 'Objetivo',
      followers: operation === 'follow' && updates.length > 0
        ? [currentId]
        : [],
    });
  });
  const restoreUpdate = replaceMethod(User, 'updateOne', async (filter, update) => {
    updates.push({ filter, update });
  });

  try {
    await withServer(testApp(), async (baseUrl) => {
      let result = await readJson(await fetch(`${baseUrl}/users/${targetId}/follow`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token(currentId)}` },
      }));
      assert.equal(result.response.status, 200);
      assert.equal(result.body.user.isFollowing, true);
      assert.equal(updates.length, 2);
      assert.ok(updates.every((item) => item.update.$addToSet));

      operation = 'unfollow';
      updates = [];
      result = await readJson(await fetch(`${baseUrl}/users/${targetId}/follow`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token(currentId)}` },
      }));
      assert.equal(result.response.status, 200);
      assert.equal(result.body.user.isFollowing, false);
      assert.equal(updates.length, 2);
      assert.ok(updates.every((item) => item.update.$pull));
    });
  } finally {
    restoreUpdate();
    restoreFind();
  }
});
