const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const communitiesRouter = require('../routes/communities');
const CommunitySuggestion = require('../models/CommunitySuggestion');
const { JWT_SECRET } = require('../config/env');
const { readJson, replaceMethod, withServer } = require('../test-support/http');

function testApp() {
  const app = express();
  app.use(express.json());
  app.use('/communities', communitiesRouter);
  return app;
}

test('sugerencias de comunidad iguales se agrupan por usuarios unicos', async () => {
  const suggestedBy = [];
  const restore = replaceMethod(
    CommunitySuggestion,
    'findOneAndUpdate',
    async (_filter, update) => {
      const userId = update.$addToSet.suggestedBy;
      if (!suggestedBy.includes(userId)) suggestedBy.push(userId);
      return {
        _id: 'suggestion-1',
        name: update.$setOnInsert.name,
        location: update.$setOnInsert.location,
        description: update.$set.description,
        suggestedBy,
        lastSuggestedAt: update.$set.lastSuggestedAt,
      };
    },
  );

  try {
    await withServer(testApp(), async (baseUrl) => {
      for (const userId of [
        '507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439012',
      ]) {
        const authorization = `Bearer ${jwt.sign({ id: userId, role: 'user' }, JWT_SECRET)}`;
        const result = await readJson(await fetch(
          `${baseUrl}/communities/suggestions`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: authorization,
            },
            body: JSON.stringify({
              name: '  Nueva Comunidad  ',
              location: 'Tierra Caliente',
              description: 'Hace falta este espacio',
            }),
          },
        ));

        assert.equal(result.response.status, 201);
      }

      assert.equal(suggestedBy.length, 2);
    });
  } finally {
    restore();
  }
});
