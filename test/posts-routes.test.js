const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const postsRouter = require('../routes/posts');
const Post = require('../models/Post');
const { readJson, replaceMethod, withServer } = require('../test-support/http');

function testApp() {
  const app = express();
  app.use(express.json());
  app.use('/posts', postsRouter);
  return app;
}

test('busqueda combina texto, comunidad, etiquetas, fecha y popularidad', async () => {
  const communityId = '507f1f77bcf86cd799439011';
  let receivedFilter;
  let receivedSort;
  let receivedSkip;
  let receivedLimit;
  const posts = [
    {
      _id: 'recent',
      author: null,
      type: 'text',
      text: 'Contenido reciente',
      tags: ['cultura'],
      ratings: [],
      comments: [],
      createdAt: new Date('2026-07-20'),
    },
    {
      _id: 'popular',
      author: null,
      type: 'text',
      text: 'Contenido popular',
      community: { _id: communityId, name: 'Memoria' },
      tags: ['memoria'],
      ratings: [{ stars: 5 }, { stars: 4 }],
      comments: [{ reactions: [] }],
      createdAt: new Date('2026-07-19'),
    },
  ];

  const restore = replaceMethod(Post, 'find', (filter) => ({
    sort(value) {
      receivedFilter = filter;
      receivedSort = value;
      return this;
    },
    skip(value) { receivedSkip = value; return this; },
    limit(value) { receivedLimit = value; return this; },
    populate() { return this; },
    then(resolve) { resolve(posts); },
  }));

  try {
    await withServer(testApp(), async (baseUrl) => {
      const params = new URLSearchParams({
        search: 'fiesta.*',
        community: communityId,
        tags: 'cultura,memoria',
        dateFrom: '2026-07-01',
        dateTo: '2026-07-31',
        sort: 'popularidad',
      });
      const { response, body } = await readJson(
        await fetch(`${baseUrl}/posts?${params}`),
      );

      assert.equal(response.status, 200);
      assert.equal(receivedFilter.text.$regex, 'fiesta\\.\\*');
      assert.equal(receivedFilter.community, communityId);
      assert.equal(receivedFilter.tags.$in.length, 2);
      assert.ok(receivedFilter.createdAt.$gte instanceof Date);
      assert.ok(receivedFilter.createdAt.$lte instanceof Date);
      assert.deepEqual(receivedSort, { createdAt: -1, _id: -1 });
      assert.equal(receivedSkip, undefined);
      assert.equal(receivedLimit, undefined);
      assert.equal(body[0].id, 'popular');
      assert.deepEqual(body[0].community, { id: communityId, name: 'Memoria' });
    });
  } finally {
    restore();
  }
});

test('pagina resultados y expone si hay una pagina siguiente', async () => {
  let receivedSkip;
  let receivedLimit;
  const posts = Array.from({ length: 3 }, (_, index) => ({
    _id: `post-${index + 1}`,
    author: null,
    type: 'text',
    text: `Publicacion ${index + 1}`,
    ratings: [],
    comments: [],
    createdAt: new Date(`2026-07-${20 - index}`),
  }));

  const restore = replaceMethod(Post, 'find', () => ({
    sort() { return this; },
    skip(value) { receivedSkip = value; return this; },
    limit(value) { receivedLimit = value; return this; },
    populate() { return this; },
    then(resolve) { resolve(posts); },
  }));

  try {
    await withServer(testApp(), async (baseUrl) => {
      const { response, body } = await readJson(
        await fetch(`${baseUrl}/posts?page=2&limit=2`),
      );

      assert.equal(response.status, 200);
      assert.equal(receivedSkip, 2);
      assert.equal(receivedLimit, 3);
      assert.equal(response.headers.get('x-has-more'), 'true');
      assert.equal(response.headers.get('x-next-page'), '3');
      assert.equal(body.length, 2);
    });
  } finally {
    restore();
  }
});

test('filtros invalidos responden 400 antes de consultar Mongo', async () => {
  let findCalled = false;
  const restore = replaceMethod(Post, 'find', () => {
    findCalled = true;
    throw new Error('No debe ejecutarse');
  });

  try {
    await withServer(testApp(), async (baseUrl) => {
      let result = await readJson(
        await fetch(`${baseUrl}/posts?community=invalida`),
      );
      assert.equal(result.response.status, 400);
      assert.equal(findCalled, false);

      result = await readJson(await fetch(`${baseUrl}/posts?sort=desconocido`));
      assert.equal(result.response.status, 400);
      assert.equal(findCalled, false);

      result = await readJson(await fetch(`${baseUrl}/posts?page=0`));
      assert.equal(result.response.status, 400);
      assert.equal(findCalled, false);

      result = await readJson(await fetch(`${baseUrl}/posts?limit=100`));
      assert.equal(result.response.status, 400);
      assert.equal(findCalled, false);
    });
  } finally {
    restore();
  }
});
