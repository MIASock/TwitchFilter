// Twitch client: signing in, tokens, and the paged stream crawl.
(function (root) {
  'use strict';

  // The extension's own Twitch app. A Public client has no secret, so its ID is safe to ship. Public clients
  // sign users in with the device code flow: https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/
  const OFFICIAL_CLIENT_ID = '2z8bwz2yjayed3tri24ocv1fhww53p';

  const API_BASE = 'https://api.twitch.tv/helix';
  const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
  const DEVICE_URL = 'https://id.twitch.tv/oauth2/device';
  const VALIDATE_URL = 'https://id.twitch.tv/oauth2/validate';
  const REVOKE_URL = 'https://id.twitch.tv/oauth2/revoke';
  const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';
  const SCOPES = ''; // Reading live streams needs no permissions on the user's account.
  const PAGE_SIZE = 100;
  const MAX_PAGES = 600; // 60,000 streams. Keeps a very broad filter from running for minutes.
  const MAX_RETRIES = 4;
  const LOW_RATE_LIMIT = 5;

  class HelixError extends Error {
    constructor(code, message) {
      super(message);
      this.name = 'HelixError';
      this.code = code; // 'auth' | 'rate' | 'http' | 'network'
    }
  }

  const defaultSleep = (ms, signal) =>
    new Promise((resolve, reject) => {
      if (signal && signal.aborted) return reject(new DOMException('Aborted', 'AbortError'));
      const timer = setTimeout(resolve, ms);
      if (signal) {
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
      }
    });

  async function requestAppToken({ clientId, clientSecret, fetchFn }) {
    if (!clientId || !clientSecret) throw new HelixError('auth', 'Add your Twitch Client ID and Secret in the extension settings.');
    const body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' });
    let response;
    try {
      response = await fetchFn(TOKEN_URL, { method: 'POST', body });
    } catch (error) {
      throw new HelixError('network', `Could not reach Twitch: ${error.message}`);
    }
    if (!response.ok) {
      throw new HelixError('auth', `Twitch rejected the Client ID or Secret (HTTP ${response.status}).`);
    }
    const data = await response.json();
    return { accessToken: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  }

  async function postForm(url, params, fetchFn) {
    try {
      return await fetchFn(url, { method: 'POST', body: new URLSearchParams(params) });
    } catch (error) {
      throw new HelixError('network', `Could not reach Twitch: ${error.message}`);
    }
  }

  async function readError(response) {
    try {
      return String((await response.json()).message || '');
    } catch {
      return '';
    }
  }

  function userTokens(data, now) {
    return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: now() + data.expires_in * 1000 };
  }

  function isTwitchPage(address) {
    try {
      const url = new URL(address);
      return url.protocol === 'https:' && url.hostname === 'www.twitch.tv' && !url.username && !url.password && !url.port;
    } catch {
      return false;
    }
  }

  // Step 1 of signing in: Twitch hands out a code, and the user approves it at verificationUri.
  async function startDeviceFlow({ clientId, fetchFn, now = Date.now }) {
    const response = await postForm(DEVICE_URL, { client_id: clientId, scopes: SCOPES }, fetchFn);
    if (!response.ok) throw new HelixError('http', `Twitch couldn't start signing in (HTTP ${response.status}).`);
    const data = await response.json();
    // The options page opens this address, so it must be Twitch's own sign-in page and nothing else.
    if (!isTwitchPage(data.verification_uri)) throw new HelixError('http', 'Twitch sent an unexpected sign-in address.');
    return {
      deviceCode: data.device_code,
      userCode: data.user_code,
      verificationUri: data.verification_uri,
      interval: Number(data.interval) || 5,
      expiresAt: now() + data.expires_in * 1000,
    };
  }

  // Step 2, repeated every `interval` seconds: pending until the user approves, then the tokens.
  async function pollDeviceFlow({ clientId, deviceCode, fetchFn, now = Date.now }) {
    const response = await postForm(TOKEN_URL, { client_id: clientId, scopes: SCOPES, device_code: deviceCode, grant_type: DEVICE_GRANT }, fetchFn);
    if (response.ok) return { status: 'done', tokens: userTokens(await response.json(), now) };
    const message = await readError(response);
    if (message === 'authorization_pending') return { status: 'pending' };
    if (message === 'slow_down') return { status: 'slow_down' };
    throw new HelixError('auth', 'Signing in was cancelled or the code expired. Click Connect to try again.');
  }

  // Public clients refresh without a secret. Each refresh token works once, so the new one must be kept.
  async function refreshUserToken({ clientId, refreshToken, fetchFn, now = Date.now }) {
    const response = await postForm(TOKEN_URL, { client_id: clientId, grant_type: 'refresh_token', refresh_token: refreshToken }, fetchFn);
    if (response.ok) return userTokens(await response.json(), now);
    if (response.status === 400 || response.status === 401) {
      throw new HelixError('auth', 'Your Twitch connection has expired. Connect again in the extension settings.');
    }
    throw new HelixError('http', `Twitch returned HTTP ${response.status}.`);
  }

  // Twitch requires checking a user token when the app starts using it and hourly after that.
  // Returns null for a token Twitch no longer accepts.
  async function validateToken({ accessToken, fetchFn }) {
    let response;
    try {
      response = await fetchFn(VALIDATE_URL, { headers: { Authorization: `OAuth ${accessToken}` } });
    } catch (error) {
      throw new HelixError('network', `Could not reach Twitch: ${error.message}`);
    }
    if (response.status === 401) return null;
    if (!response.ok) throw new HelixError('http', `Twitch returned HTTP ${response.status}.`);
    const data = await response.json();
    return { clientId: data.client_id, login: data.login, userId: data.user_id, expiresIn: data.expires_in };
  }

  // Best effort: the token is forgotten locally either way.
  async function revokeToken({ clientId, accessToken, fetchFn }) {
    try {
      await fetchFn(REVOKE_URL, { method: 'POST', body: new URLSearchParams({ client_id: clientId, token: accessToken }) });
    } catch {
      // Offline or blocked; the token still expires on its own.
    }
  }

  function buildStreamsUrl(filters, cursor, pageSize = PAGE_SIZE) {
    const params = new URLSearchParams({ first: String(pageSize), type: 'live' });
    for (const language of filters.languages || []) params.append('language', language);
    if (cursor) params.set('after', cursor);
    return `${API_BASE}/streams?${params}`;
  }

  function msUntilReset(headers, now) {
    const reset = Number(headers.get('ratelimit-reset'));
    if (!reset) return 1000;
    return Math.min(65000, Math.max(1000, reset * 1000 - now()));
  }

  // One GET with token refresh on 401, waits on 429 and backoff on 5xx.
  async function helixGet(url, ctx) {
    const { fetchFn, clientId, getToken, sleep, signal, now } = ctx;
    let refreshed = false;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      const token = await getToken(false);
      let response;
      try {
        response = await fetchFn(url, { headers: { 'Client-Id': clientId, Authorization: `Bearer ${token}` }, signal });
      } catch (error) {
        if (error.name === 'AbortError') throw error;
        if (attempt === MAX_RETRIES) throw new HelixError('network', `Could not reach Twitch: ${error.message}`);
        await sleep(500 * 2 ** attempt, signal);
        continue;
      }

      if (response.status === 401 && !refreshed) {
        refreshed = true;
        attempt -= 1;
        await getToken(true);
        continue;
      }
      if (response.status === 401 || response.status === 403) {
        throw new HelixError('auth', `Twitch rejected the request (HTTP ${response.status}). Check the extension settings.`);
      }
      if (response.status === 429) {
        if (attempt === MAX_RETRIES) throw new HelixError('rate', 'Twitch rate limit reached. Try again in a minute.');
        await sleep(msUntilReset(response.headers, now), signal);
        continue;
      }
      if (response.status >= 500) {
        if (attempt === MAX_RETRIES) throw new HelixError('http', `Twitch returned HTTP ${response.status}.`);
        await sleep(500 * 2 ** attempt, signal);
        continue;
      }
      if (!response.ok) throw new HelixError('http', `Twitch returned HTTP ${response.status}.`);

      const remaining = response.headers.get('ratelimit-remaining');
      if (remaining !== null && Number(remaining) <= LOW_RATE_LIMIT) {
        await sleep(msUntilReset(response.headers, now), signal);
      }
      return response.json();
    }
    throw new HelixError('http', 'Twitch request failed.');
  }

  // Walks every live stream matching the filters. Get Streams returns all matches across pages, so summing
  // them per category gives filtered totals without one request per category.
  async function crawlStreams({ filters, clientId, getToken, fetchFn, aggregator, onProgress, signal, sleep = defaultSleep, now = Date.now, maxPages = MAX_PAGES }) {
    const ctx = { fetchFn, clientId, getToken, sleep, signal, now };
    let cursor;
    let pages = 0;

    while (pages < maxPages) {
      const page = await helixGet(buildStreamsUrl(filters, cursor), ctx);
      pages += 1;
      for (const stream of page.data || []) aggregator.add(stream);

      const next = page.pagination && page.pagination.cursor;
      if (!next || next === cursor) return { pages, truncated: false };
      cursor = next;
      if (onProgress) onProgress({ pages });
    }
    return { pages, truncated: true };
  }

  const api = {
    OFFICIAL_CLIENT_ID,
    HelixError,
    requestAppToken,
    startDeviceFlow,
    pollDeviceFlow,
    refreshUserToken,
    validateToken,
    revokeToken,
    buildStreamsUrl,
    helixGet,
    crawlStreams,
    MAX_PAGES,
  };
  root.TFHelix = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
