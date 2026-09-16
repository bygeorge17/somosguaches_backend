const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const {
  globalErrorHandler,
  notFoundHandler,
} = require('../middleware/errorHandler');
const { readJson, withServer } = require('../test-support/http');

function testApp() {
  const app = express();
  app.set('env', 'production');
  app.use(express.json());
  app.get('/failure', () => {
    throw new Error('detalle sensible');
  });
  app.use(notFoundHandler);
  app.use(globalErrorHandler);
  return app;
}

test('404 siempre responde JSON estructurado', async () => {
  await withServer(testApp(), async (baseUrl) => {
    const { response, body } = await readJson(await fetch(`${baseUrl}/missing`));
    assert.equal(response.status, 404);
    assert.match(response.headers.get('content-type'), /application\/json/);
    assert.equal(body.code, 'NOT_FOUND');
    assert.equal(body.path, '/missing');
  });
});

test('JSON malformado responde 400 sin HTML', async () => {
  await withServer(testApp(), async (baseUrl) => {
    const { response, body } = await readJson(await fetch(`${baseUrl}/failure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{invalido',
    }));
    assert.equal(response.status, 400);
    assert.equal(body.code, 'INVALID_JSON');
    assert.equal(body.stack, undefined);
  });
});

test('errores internos ocultan detalles en produccion', async () => {
  await withServer(testApp(), async (baseUrl) => {
    const { response, body } = await readJson(await fetch(`${baseUrl}/failure`));
    assert.equal(response.status, 500);
    assert.equal(body.code, 'INTERNAL_ERROR');
    assert.equal(body.error, 'Error interno del servidor');
    assert.equal(body.stack, undefined);
  });
});
