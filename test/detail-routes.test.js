const test = require('node:test');
const assert = require('node:assert/strict');
const { replaceMethod } = require('../test-support/http');

const resources = [
  ['personajes', '../routes/personajes', '../models/Personaje'],
  ['historias', '../routes/historias', '../models/Historia'],
  ['leyendas', '../routes/leyendas', '../models/Leyenda'],
  ['communities', '../routes/communities', '../models/Community'],
];

for (const [name, routePath, modelPath] of resources) {
  test(`GET /${name}/:id es publico y devuelve 404`, async () => {
    const router = require(routePath);
    const Model = require(modelPath);
    const layer = router.stack.find(
      (entry) => entry.route?.path === '/:id' && entry.route.methods.get,
    );

    assert.ok(layer, `Falta GET /${name}/:id`);
    assert.equal(layer.route.stack.length, 1);

    const restore = replaceMethod(Model, 'findById', async () => null);
    try {
      const handler = layer.route.stack.at(-1).handle;
      const response = {
        statusCode: 200,
        payload: null,
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.payload = payload; return this; },
      };

      await handler(
        { params: { id: '507f1f77bcf86cd799439011' }, headers: {} },
        response,
      );
      assert.equal(response.statusCode, 404);
      assert.match(response.payload.error, /no encontrad[oa]/i);
    } finally {
      restore();
    }
  });
}
