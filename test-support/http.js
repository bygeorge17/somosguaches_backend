const { once } = require('node:events');

async function withServer(app, callback) {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();

  try {
    return await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

async function readJson(response) {
  const body = await response.json();
  return { response, body };
}

function replaceMethod(target, method, implementation) {
  const original = target[method];
  target[method] = implementation;
  return () => {
    target[method] = original;
  };
}

module.exports = { readJson, replaceMethod, withServer };
