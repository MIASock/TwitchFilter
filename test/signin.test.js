'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  OFFICIAL_CLIENT_ID, startDeviceFlow, pollDeviceFlow, refreshUserToken, validateToken, revokeToken,
} = require('../extension/src/helix.js');

// Response bodies below are the ones Twitch actually sent for these requests.
function response(status, body) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

function recorder(reply) {
  const sent = [];
  const fetchFn = async (url, init = {}) => {
    sent.push({ url, method: init.method || 'GET', body: init.body ? Object.fromEntries(init.body) : null, headers: init.headers || {} });
    if (reply instanceof Error) throw reply;
    return typeof reply === 'function' ? reply(sent.length) : reply;
  };
  return { sent, fetchFn };
}

const now = () => 1_000_000;

test('the official app ID is a Twitch client ID', () => {
  assert.match(OFFICIAL_CLIENT_ID, /^[a-z0-9]{30}$/);
});

test('signing in starts a device flow with no scopes', async () => {
  const { sent, fetchFn } = recorder(response(200, {
    device_code: 'dev', expires_in: 1800, interval: 5, user_code: 'RHFNJMWD',
    verification_uri: 'https://www.twitch.tv/activate?device-code=RHFNJMWD',
  }));
  const flow = await startDeviceFlow({ clientId: 'cid', fetchFn, now });
  assert.deepEqual(sent[0], { url: 'https://id.twitch.tv/oauth2/device', method: 'POST', body: { client_id: 'cid', scopes: '' }, headers: {} });
  assert.deepEqual(flow, {
    deviceCode: 'dev', userCode: 'RHFNJMWD', verificationUri: 'https://www.twitch.tv/activate?device-code=RHFNJMWD',
    interval: 5, expiresAt: 1_000_000 + 1_800_000,
  });
});

test('polling stays pending until the user approves, then returns both tokens', async () => {
  const pending = recorder(response(400, { status: 400, message: 'authorization_pending' }));
  assert.deepEqual(await pollDeviceFlow({ clientId: 'cid', deviceCode: 'dev', fetchFn: pending.fetchFn, now }), { status: 'pending' });
  assert.deepEqual(pending.sent[0].body, {
    client_id: 'cid', scopes: '', device_code: 'dev', grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
  });

  const done = recorder(response(200, { access_token: 'at', refresh_token: 'rt', expires_in: 14400, token_type: 'bearer', scope: [] }));
  assert.deepEqual(await pollDeviceFlow({ clientId: 'cid', deviceCode: 'dev', fetchFn: done.fetchFn, now }), {
    status: 'done', tokens: { accessToken: 'at', refreshToken: 'rt', expiresAt: 1_000_000 + 14_400_000 },
  });
});

test('polling asks to slow down, and reports a used or expired code as a sign-in error', async () => {
  const slow = recorder(response(400, { status: 400, message: 'slow_down' }));
  assert.equal((await pollDeviceFlow({ clientId: 'cid', deviceCode: 'dev', fetchFn: slow.fetchFn })).status, 'slow_down');
  const used = recorder(response(400, { status: 400, message: 'invalid device code' }));
  await assert.rejects(pollDeviceFlow({ clientId: 'cid', deviceCode: 'dev', fetchFn: used.fetchFn }), (e) => e.code === 'auth');
});

test('refreshing sends no secret and returns the new refresh token', async () => {
  const { sent, fetchFn } = recorder(response(200, { access_token: 'at2', refresh_token: 'rt2', expires_in: 14400 }));
  const tokens = await refreshUserToken({ clientId: 'cid', refreshToken: 'rt1', fetchFn, now });
  assert.deepEqual(sent[0].body, { client_id: 'cid', grant_type: 'refresh_token', refresh_token: 'rt1' });
  assert.deepEqual(tokens, { accessToken: 'at2', refreshToken: 'rt2', expiresAt: 1_000_000 + 14_400_000 });
});

test('a rejected refresh token means connecting again', async () => {
  const { fetchFn } = recorder(response(400, { status: 400, message: 'Invalid refresh token' }));
  await assert.rejects(refreshUserToken({ clientId: 'cid', refreshToken: 'old', fetchFn }), (e) => e.code === 'auth' && /Connect again/.test(e.message));
  const offline = recorder(new Error('offline'));
  await assert.rejects(refreshUserToken({ clientId: 'cid', refreshToken: 'old', fetchFn: offline.fetchFn }), (e) => e.code === 'network');
});

test('validation sends the OAuth header and returns the user, or null for a dead token', async () => {
  const good = recorder(response(200, { client_id: 'cid', login: 'someone', user_id: '42', scopes: [], expires_in: 14000 }));
  assert.deepEqual(await validateToken({ accessToken: 'at', fetchFn: good.fetchFn }), { clientId: 'cid', login: 'someone', userId: '42', expiresIn: 14000 });
  assert.deepEqual(good.sent[0].headers, { Authorization: 'OAuth at' });
  assert.equal(good.sent[0].url, 'https://id.twitch.tv/oauth2/validate');

  const dead = recorder(response(401, { status: 401, message: 'invalid access token' }));
  assert.equal(await validateToken({ accessToken: 'at', fetchFn: dead.fetchFn }), null);
  const down = recorder(response(503, {}));
  await assert.rejects(validateToken({ accessToken: 'at', fetchFn: down.fetchFn }), (e) => e.code === 'http');
});

test('revoking posts the token and never throws', async () => {
  const { sent, fetchFn } = recorder(response(200, {}));
  await revokeToken({ clientId: 'cid', accessToken: 'at', fetchFn });
  assert.deepEqual(sent[0].body, { client_id: 'cid', token: 'at' });
  await revokeToken({ clientId: 'cid', accessToken: 'at', fetchFn: recorder(new Error('offline')).fetchFn });
});
