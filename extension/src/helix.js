// Twitch Helix client: app token handling and the paged stream crawl.
(function (root) {
  'use strict';

  const API_BASE = 'https://api.twitch.tv/helix';
  const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
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

  const api = { HelixError, requestAppToken, buildStreamsUrl, helixGet, crawlStreams, MAX_PAGES };
  root.TFHelix = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
