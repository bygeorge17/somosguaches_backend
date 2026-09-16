const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('node:fs/promises');
const jwt = require('jsonwebtoken');
const path = require('node:path');
const mediaRouter = require('../routes/media');
const User = require('../models/User');
const { JWT_SECRET } = require('../config/env');
const { readJson, replaceMethod, withServer } = require('../test-support/http');

function testApp() {
  const app = express();
  app.use('/media', mediaRouter);
  return app;
}

function token(isAdmin) {
  return jwt.sign(
    {
      id: '507f1f77bcf86cd799439011',
      role: isAdmin ? 'admin' : 'user',
      isAdmin,
    },
    JWT_SECRET,
  );
}

function mockRole(isAdmin) {
  return replaceMethod(User, 'findById', () => ({
    select: async () => ({
      role: isAdmin ? 'admin' : 'user',
      isAdmin,
      isActive: true,
    }),
  }));
}

test('la subida de medios exige autenticación administrativa', async () => {
  await withServer(testApp(), async (baseUrl) => {
    let result = await readJson(await fetch(`${baseUrl}/media`, {
      method: 'POST',
    }));
    assert.equal(result.response.status, 401);

    const restore = mockRole(false);
    try {
      result = await readJson(await fetch(`${baseUrl}/media`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token(false)}` },
      }));
      assert.equal(result.response.status, 403);
    } finally {
      restore();
    }
  });
});

test('un administrador debe seleccionar un archivo', async () => {
  const restore = mockRole(true);
  try {
    await withServer(testApp(), async (baseUrl) => {
      const { response, body } = await readJson(await fetch(`${baseUrl}/media`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token(true)}` },
      }));
      assert.equal(response.status, 400);
      assert.equal(body.error, 'Selecciona un archivo');
    });
  } finally {
    restore();
  }
});

test('un administrador puede subir una imagen real', async () => {
  const restore = mockRole(true);
  let uploadedPath;
  try {
    await withServer(testApp(), async (baseUrl) => {
      const form = new FormData();
      form.append('kind', 'image');
      form.append(
        'media',
        new Blob([Buffer.from('imagen-de-prueba')], { type: 'image/png' }),
        'portada.png',
      );

      const { response, body } = await readJson(await fetch(`${baseUrl}/media`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token(true)}` },
        body: form,
      }));

      assert.equal(response.status, 201);
      assert.equal(body.kind, 'image');
      assert.match(body.mediaUrl, /^\/uploads\/content\/\d+-portada\.png$/);
      uploadedPath = path.join(
        __dirname,
        '..',
        'public',
        'uploads',
        'content',
        path.basename(body.mediaUrl),
      );
      await fs.access(uploadedPath);
    });
  } finally {
    restore();
    if (uploadedPath) await fs.unlink(uploadedPath).catch(() => {});
  }
});
