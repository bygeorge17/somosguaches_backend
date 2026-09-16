const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const authRouter = require('../routes/auth');
const User = require('../models/User');
const { readJson, replaceMethod, withServer } = require('../test-support/http');

function testApp() {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRouter);
  return app;
}

function fakeUser(overrides = {}) {
  return {
    _id: '507f1f77bcf86cd799439011',
    email: 'user@example.com',
    name: 'Usuario',
    bio: 'Bio',
    avatar: 'https://example.com/avatar.jpg',
    role: 'user',
    isAdmin: false,
    isActive: true,
    followers: [],
    following: [],
    comparePassword: async () => true,
    ...overrides,
  };
}

test('login válido devuelve token y perfil sin password', async () => {
  const restore = replaceMethod(User, 'findOne', async () => fakeUser());
  try {
    await withServer(testApp(), async (baseUrl) => {
      const { response, body } = await readJson(await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: ' USER@EXAMPLE.COM ', password: '12345678' }),
      }));
      assert.equal(response.status, 200);
      assert.ok(body.token);
      assert.equal(body.user.email, 'user@example.com');
      assert.equal(body.user.role, 'user');
      assert.equal(body.user.password, undefined);
    });
  } finally {
    restore();
  }
});

test('login rechaza credenciales incorrectas o usuario inactivo', async () => {
  const restore = replaceMethod(
    User,
    'findOne',
    async () => fakeUser({ isActive: false }),
  );
  try {
    await withServer(testApp(), async (baseUrl) => {
      const { response, body } = await readJson(await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'user@example.com', password: '12345678' }),
      }));
      assert.equal(response.status, 400);
      assert.match(body.error, /incorrectos/);
    });
  } finally {
    restore();
  }
});

test('registro rechaza campos desconocidos y password debil', async () => {
  await withServer(testApp(), async (baseUrl) => {
    const { response, body } = await readJson(await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'user@example.com',
        password: '123',
        name: 'Usuario',
        isAdmin: true,
      }),
    }));
    assert.equal(response.status, 400);
    assert.equal(body.error, 'Request body invalido');
    assert.ok(body.details.some((detail) => detail.field === 'password'));
  });
});
