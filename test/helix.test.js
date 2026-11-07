'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const TF = require('../extension/src/core.js');
const { crawlStreams, requestAppToken, buildStreamsUrl } = require('../extension/src/helix.js');

function response(status, body, headers = {}) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name) => (name.toLowerCase() in lower ? lower[name.toLowerCase()] : null) },
    json: async () => body,
  };
}

const s = (id, game, viewers) => ({ id, game_id: game, game_name: `Game ${game}`, viewer_count: viewers, language: 'de', tags: [], user_login: id, user_name: id, title: '' });

function setup(script) {
  const calls = [];
  const sleeps = [];
  const tokens = [];
  return {
    calls,
    sleeps,
    tokens,
    aggregator: TF.createAggregator({ languages: ['de'] }),
    args: {
      filters: { languages: ['de'] },
      clientId: 'cid',
      now: () => 1000000,
      sleep: async (ms) => { sleeps.push(ms); },
      getToken: async (force) => { tokens.push(force); return force ? 'new' : 'old'; },
      fetchFn: async (url, init) => {
        calls.push({ url, auth: init.headers.Authorization, clientId: init.headers['Client-Id'] });
        const next = script[calls.length - 1];
        if (next instanceof Error) throw next;
        return next;
      },
    },
  };
}

test('requests the language filter at the maximum page size', () => {
  const url = new URL(buildStreamsUrl({ languages: ['de', 'fr'] }, 'abc'));
  assert.equal(url.origin + url.pathname, 'https://api.twitch.tv/helix/streams');
  assert.deepEqual(url.searchParams.getAll('language'), ['de', 'fr']);
  assert.equal(url.searchParams.get('first'), '100');
  assert.equal(url.searchParams.get('after'), 'abc');
});

test('follows cursors to the end, through an empty page, and sends auth headers', async () => {
  const t = setup([
    response(200, { data: [s('1', '10', 50)], pagination: { cursor: 'A' } }),
    response(200, { data: [], pagination: { cursor: 'B' } }),
    response(200, { data: [s('1', '10', 50), s('2', '20', 3)], pagination: {} }),
  ]);
  const out = await crawlStreams({ ...t.args, aggregator: t.aggregator });
  assert.deepEqual(out, { pages: 3, truncated: false });
  assert.match(t.calls[1].url, /after=A/);
  assert.match(t.calls[2].url, /after=B/);
  assert.equal(t.calls[0].auth, 'Bearer old');
  assert.equal(t.calls[0].clientId, 'cid');
  assert.deepEqual(t.aggregator.snapshot().games.map((g) => [g.id, g.viewers]), [['10', 50], ['20', 3]]);
});

test('stops and reports truncation at the page cap', async () => {
  const t = setup([response(200, { data: [s('1', '10', 1)], pagination: { cursor: 'A' } }), response(200, { data: [s('2', '10', 1)], pagination: { cursor: 'B' } })]);
  const out = await crawlStreams({ ...t.args, aggregator: t.aggregator, maxPages: 2 });
  assert.deepEqual(out, { pages: 2, truncated: true });
});

test('a repeating cursor ends the crawl instead of looping', async () => {
  const t = setup([response(200, { data: [], pagination: { cursor: 'A' } }), response(200, { data: [], pagination: { cursor: 'A' } })]);
  const out = await crawlStreams({ ...t.args, aggregator: t.aggregator });
  assert.equal(out.pages, 2);
});

test('an expired token is replaced once and the request retried', async () => {
  const t = setup([response(401, {}), response(200, { data: [s('1', '10', 1)], pagination: {} })]);
  await crawlStreams({ ...t.args, aggregator: t.aggregator });
  assert.deepEqual(t.tokens, [false, true, false]);
  assert.equal(t.calls.length, 2);
});

test('a second 401 surfaces as an auth error', async () => {
  const t = setup([response(401, {}), response(401, {})]);
  await assert.rejects(crawlStreams({ ...t.args, aggregator: t.aggregator }), (e) => e.code === 'auth');
});

test('a 429 waits for the reset time and retries', async () => {
  const t = setup([response(429, {}, { 'Ratelimit-Reset': 1030 }), response(200, { data: [], pagination: {} })]);
  await crawlStreams({ ...t.args, aggregator: t.aggregator });
  assert.deepEqual(t.sleeps, [30000]);
});

test('a nearly empty rate limit bucket pauses before the next page', async () => {
  const t = setup([
    response(200, { data: [], pagination: { cursor: 'A' } }, { 'Ratelimit-Remaining': 2, 'Ratelimit-Reset': 1010 }),
    response(200, { data: [], pagination: {} }, { 'Ratelimit-Remaining': 700 }),
  ]);
  await crawlStreams({ ...t.args, aggregator: t.aggregator });
  assert.deepEqual(t.sleeps, [10000]);
});

test('server errors back off and then succeed', async () => {
  const t = setup([response(503, {}), new Error('offline'), response(200, { data: [], pagination: {} })]);
  await crawlStreams({ ...t.args, aggregator: t.aggregator });
  assert.deepEqual(t.sleeps, [500, 1000]);
});

test('token request uses client credentials and reports bad credentials', async () => {
  let sent;
  const good = await requestAppToken({
    clientId: 'a', clientSecret: 'b',
    fetchFn: async (url, init) => { sent = { url, body: init.body.toString() }; return response(200, { access_token: 'tok', expires_in: 100 }); },
  });
  assert.equal(good.accessToken, 'tok');
  assert.equal(sent.url, 'https://id.twitch.tv/oauth2/token');
  assert.equal(sent.body, 'client_id=a&client_secret=b&grant_type=client_credentials');
  await assert.rejects(requestAppToken({ clientId: 'a', clientSecret: 'b', fetchFn: async () => response(403, {}) }), (e) => e.code === 'auth');
  await assert.rejects(requestAppToken({ clientId: '', clientSecret: '', fetchFn: async () => response(200, {}) }), (e) => e.code === 'auth');
});
