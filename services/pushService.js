const crypto = require('crypto');
const http2 = require('http2');
const jwt = require('jsonwebtoken');

let fcmAccessToken = null;
let fcmAccessTokenExpiresAt = 0;

function env(name) {
  return String(process.env[name] || '').trim();
}

function configuredForFcm() {
  return Boolean(env('FCM_PROJECT_ID') && env('FCM_CLIENT_EMAIL')
    && env('FCM_PRIVATE_KEY'));
}

function configuredForApns() {
  return Boolean(env('APNS_KEY_ID') && env('APNS_TEAM_ID')
    && env('APNS_PRIVATE_KEY') && env('APNS_BUNDLE_ID'));
}

async function fcmToken() {
  if (fcmAccessToken && Date.now() < fcmAccessTokenExpiresAt - 60_000) {
    return fcmAccessToken;
  }

  const privateKey = env('FCM_PRIVATE_KEY').replace(/\\n/g, '\n');
  const assertion = jwt.sign(
    {
      iss: env('FCM_CLIENT_EMAIL'),
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
    },
    privateKey,
    { algorithm: 'RS256', expiresIn: '1h' },
  );
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!response.ok) throw new Error(`FCM OAuth respondió ${response.status}`);
  const payload = await response.json();
  fcmAccessToken = payload.access_token;
  fcmAccessTokenExpiresAt = Date.now() + Number(payload.expires_in || 3600) * 1000;
  return fcmAccessToken;
}

async function sendFcm(token, notification) {
  const accessToken = await fcmToken();
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(env('FCM_PROJECT_ID'))}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: notification.title, body: notification.body },
          data: notification.data || {},
        },
      }),
    },
  );
  if (!response.ok) {
    const text = await response.text();
    const error = new Error(`FCM respondió ${response.status}: ${text}`);
    error.status = response.status;
    throw error;
  }
}

function sendApns(token, notification) {
  return new Promise((resolve, reject) => {
    const privateKey = env('APNS_PRIVATE_KEY').replace(/\\n/g, '\n');
    const issuedAt = Math.floor(Date.now() / 1000);
    const bearer = jwt.sign(
      { iss: env('APNS_TEAM_ID'), iat: issuedAt },
      privateKey,
      { algorithm: 'ES256', keyid: env('APNS_KEY_ID') },
    );
    const host = env('APNS_PRODUCTION') === 'true'
      ? 'api.push.apple.com'
      : 'api.sandbox.push.apple.com';
    const client = http2.connect(`https://${host}`);
    client.on('error', reject);
    const request = client.request({
      ':method': 'POST',
      ':path': `/3/device/${token}`,
      authorization: `bearer ${bearer}`,
      'apns-topic': env('APNS_BUNDLE_ID'),
      'apns-push-type': 'alert',
      'content-type': 'application/json',
    });
    let responseBody = '';
    let status = 500;
    request.on('response', (headers) => { status = Number(headers[':status']); });
    request.setEncoding('utf8');
    request.on('data', (chunk) => { responseBody += chunk; });
    request.on('end', () => {
      client.close();
      if (status >= 200 && status < 300) return resolve();
      const error = new Error(`APNs respondió ${status}: ${responseBody}`);
      error.status = status;
      reject(error);
    });
    request.on('error', reject);
    request.end(JSON.stringify({
      aps: { alert: { title: notification.title, body: notification.body }, sound: 'default' },
      ...(notification.data || {}),
    }));
  });
}

async function deliverPush(deviceToken, notification) {
  if (deviceToken.platform === 'android') {
    if (!configuredForFcm()) return { delivered: false, reason: 'fcm_not_configured' };
    await sendFcm(deviceToken.token, notification);
    return { delivered: true };
  }
  if (deviceToken.platform === 'ios') {
    if (!configuredForApns()) return { delivered: false, reason: 'apns_not_configured' };
    await sendApns(deviceToken.token, notification);
    return { delivered: true };
  }
  return { delivered: false, reason: 'unsupported_platform' };
}

function isInvalidDeviceToken(error) {
  return [400, 404, 410].includes(error?.status)
    || /UNREGISTERED|BadDeviceToken|Unregistered/i.test(error?.message || '');
}

module.exports = { deliverPush, isInvalidDeviceToken };
