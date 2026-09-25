const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const Personaje = require('../models/Personaje');
const personajesRouter = require('../routes/personajes');
const { JWT_SECRET } = require('../config/env');
const { readJson, replaceMethod, withServer } = require('../test-support/http');

function testApp() {
  const app = express();
  app.use(express.json());
  app.use('/personajes', personajesRouter);
  return app;
}

test('usuario comenta y califica un personaje una sola vez', async () => {
  const userId = '507f1f77bcf86cd799439011';
  const personaje = new Personaje({
    name: 'Cronista',
    body: 'Memoria regional',
  });
  personaje.save = async () => personaje;
  personaje.populate = async () => personaje;
  const restore = replaceMethod(Personaje, 'findById', async () => personaje);
  const authorization = `Bearer ${jwt.sign({ id: userId, role: 'user' }, JWT_SECRET)}`;

  try {
    await withServer(testApp(), async (baseUrl) => {
      let result = await readJson(await fetch(
        `${baseUrl}/personajes/${personaje._id}/comments`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: authorization },
          body: JSON.stringify({ text: 'Una historia muy valiosa' }),
        },
      ));
      assert.equal(result.response.status, 200);
      assert.equal(result.body.commentsCount, 1);
      assert.equal(result.body.comments[0].text, 'Una historia muy valiosa');

      for (const stars of [4, 5]) {
        result = await readJson(await fetch(
          `${baseUrl}/personajes/${personaje._id}/ratings`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: authorization },
            body: JSON.stringify({ stars }),
          },
        ));
        assert.equal(result.response.status, 200);
      }
      assert.equal(result.body.ratingsCount, 1);
      assert.equal(result.body.avgStars, 5);
      assert.equal(result.body.myStars, 5);
    });
  } finally {
    restore();
  }
});
