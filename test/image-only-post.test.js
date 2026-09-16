const test = require('node:test');
const assert = require('node:assert/strict');
const Post = require('../models/Post');
const router = require('../routes/posts');
const { postCreate, postUpdate } = require('../validation/schemas');
const { replaceMethod } = require('../test-support/http');

const author = '507f1f77bcf86cd799439011';
const mediaUrl = '/uploads/posts/foto.png';

test('imagen sin texto pasa schema y modelo; texto y video lo requieren', () => {
  for (const text of [undefined, '', '   ']) {
    const body = postCreate.parse({ type: 'image', text, mediaUrl });
    assert.equal(new Post({ author, ...body }).validateSync(), undefined);
  }
  assert.equal(postUpdate.parse({ text: '' }).text, '');
  for (const type of ['text', 'video']) {
    assert.ok(new Post({ author, type, text: '' }).validateSync().errors.text);
  }
});

test('crear y editar imagen sin texto; rechazar imagen sin archivo y cambio a texto vacio', async () => {
  let stored;
  const restoreSave = replaceMethod(Post.prototype, 'save', async function () {
    await this.validate();
    stored = this;
    return this;
  });
  const restoreFind = replaceMethod(Post, 'findById', () => ({
    populate() { return this; },
    then(resolve, reject) { return Promise.resolve(stored).then(resolve, reject); },
  }));
  async function call(method, body) {
    const handler = router.stack.find(entry =>
      entry.route?.path === (method === 'post' ? '/' : '/:id') &&
      entry.route.methods[method]).route.stack.at(-1).handle;
    const response = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };
    const schema = method === 'post' ? postCreate : postUpdate;
    await handler({ body: schema.parse(body), user: { id: author },
      params: { id: stored?.id } }, response);
    return response;
  }
  try {
    assert.equal((await call('post', { type: 'image', mediaUrl })).statusCode, 201);
    assert.equal(stored.text, '');
    assert.equal((await call('put', { text: '   ' })).statusCode, 200);
    assert.equal(stored.text, '');
    assert.equal((await call('put', { type: 'text' })).statusCode, 400);
    assert.equal((await call('post', { type: 'image', text: '' })).statusCode, 400);
    assert.equal((await call('post', { type: 'text', text: '' })).statusCode, 400);
  } finally {
    restoreSave();
    restoreFind();
  }
});
