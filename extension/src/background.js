// Service worker: holds the credentials, talks to Twitch, and streams crawl results to open browse pages.
importScripts('core.js', 'helix.js');

const CACHE_TTL_MS = 3 * 60 * 1000;
const PROGRESS_EVERY_PAGES = 5;
const CACHE_PREFIX = 'result:';

let tokenPromise = null;
const runs = new Map(); // filterKey -> { ports:Set, controller }

// storage.local holds the Client Secret and the access token, so only the service worker and the options
// page may read it. Content scripts run inside twitch.tv and keep their filter settings in storage.sync.
// The access level does not survive a browser restart, so it is set every time the worker starts.
const lockLocalStorage = chrome.storage.local
  .setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })
  .catch((error) => console.error('Twitch Category Filter: could not restrict storage.local', error));
chrome.runtime.onStartup.addListener(() => lockLocalStorage);

// Older versions kept the filter settings in storage.local, where content scripts can no longer read them.
chrome.runtime.onInstalled.addListener(async () => {
  const { settings } = await chrome.storage.local.get('settings');
  if (!settings) return;
  const synced = await chrome.storage.sync.get('settings');
  if (!synced.settings) await chrome.storage.sync.set({ settings });
  await chrome.storage.local.remove('settings');
});

async function getCredentials() {
  const { clientId = '', clientSecret = '' } = await chrome.storage.local.get(['clientId', 'clientSecret']);
  return { clientId: clientId.trim(), clientSecret: clientSecret.trim() };
}

async function fetchNewToken() {
  const { clientId, clientSecret } = await getCredentials();
  const token = await TFHelix.requestAppToken({ clientId, clientSecret, fetchFn: fetch });
  await chrome.storage.local.set({ token });
  return token.accessToken;
}

async function getToken(forceNew) {
  if (!forceNew) {
    const { token } = await chrome.storage.local.get('token');
    if (token && token.expiresAt > Date.now() + 60000) return token.accessToken;
  }
  // Concurrent crawls share one token request.
  if (!tokenPromise) tokenPromise = fetchNewToken().finally(() => { tokenPromise = null; });
  return tokenPromise;
}

function broadcast(run, message) {
  for (const port of run.ports) {
    try {
      port.postMessage(message);
    } catch {
      run.ports.delete(port);
    }
  }
}

async function readCache(key) {
  const cacheKey = CACHE_PREFIX + key;
  const stored = await chrome.storage.session.get(cacheKey);
  const entry = stored[cacheKey];
  return entry && Date.now() - entry.updatedAt < CACHE_TTL_MS ? entry : null;
}

async function writeCache(key, entry) {
  try {
    await chrome.storage.session.remove(Object.keys(await chrome.storage.session.get(null)));
    await chrome.storage.session.set({ [CACHE_PREFIX + key]: entry });
  } catch (error) {
    console.warn('Twitch Category Filter: result too large to cache', error);
  }
}

async function startRun(key, filters, run) {
  const aggregator = TF.createAggregator(filters);
  try {
    const { clientId } = await getCredentials();
    const outcome = await TFHelix.crawlStreams({
      filters,
      clientId,
      getToken,
      fetchFn: fetch,
      aggregator,
      signal: run.controller.signal,
      onProgress: ({ pages }) => {
        if (pages % PROGRESS_EVERY_PAGES === 0) {
          broadcast(run, { type: 'progress', key, pages, ...aggregator.snapshot() });
        }
      },
    });
    const entry = { ...aggregator.snapshot(), key, pages: outcome.pages, truncated: outcome.truncated, updatedAt: Date.now() };
    await writeCache(key, entry);
    broadcast(run, { type: 'done', ...entry });
  } catch (error) {
    if (error.name !== 'AbortError') {
      broadcast(run, { type: 'error', key, code: error.code || 'unknown', message: error.message });
    }
  } finally {
    if (runs.get(key) === run) runs.delete(key);
  }
}

function detachPort(port) {
  for (const [key, run] of runs) {
    if (run.ports.delete(port) && run.ports.size === 0) {
      run.controller.abort();
      runs.delete(key);
    }
  }
}

async function handleCrawl(port, { filters, force }) {
  detachPort(port); // A port follows only its latest filter.
  const key = TF.filterKey(filters);

  if (!force) {
    const cached = await readCache(key);
    if (cached) {
      port.postMessage({ type: 'done', ...cached, cached: true });
      return;
    }
  }

  const existing = runs.get(key);
  if (existing) {
    existing.ports.add(port);
    port.postMessage({ type: 'started', key });
    return;
  }

  const run = { ports: new Set([port]), controller: new AbortController() };
  runs.set(key, run);
  port.postMessage({ type: 'started', key });
  startRun(key, TF.normalizeFilters(filters), run);
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'tf-crawl') return;
  port.onMessage.addListener((message) => {
    if (message.type === 'crawl') handleCrawl(port, message);
    if (message.type === 'cancel') detachPort(port);
  });
  port.onDisconnect.addListener(() => detachPort(port));
});

async function testConnection() {
  const { clientId, clientSecret } = await getCredentials();
  const token = await TFHelix.requestAppToken({ clientId, clientSecret, fetchFn: fetch });
  await chrome.storage.local.set({ token });
  await TFHelix.helixGet(TFHelix.buildStreamsUrl({ languages: [] }, undefined, 1), {
    fetchFn: fetch,
    clientId,
    getToken: async () => token.accessToken,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: Date.now,
  });
  return { ok: true };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'open-options') {
    chrome.runtime.openOptionsPage();
    return false;
  }
  if (message.type === 'test-connection') {
    testConnection()
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }
  return false;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.clientId || changes.clientSecret)) {
    chrome.storage.local.remove('token');
    notifyTabs({ type: 'credentials-changed' });
  }
});

// Only tabs with the content script (twitch.tv) answer; the rest reject, which is expected.
async function notifyTabs(message) {
  for (const tab of await chrome.tabs.query({})) {
    if (tab.id !== undefined) chrome.tabs.sendMessage(tab.id, message).catch(() => {});
  }
}
