// Background: holds the credentials, talks to Twitch, and streams crawl results to open browse pages.
// Chromium runs it as a service worker that loads its helpers here. Firefox runs it as an event page,
// where the Firefox manifest lists the helpers before this file.
if (typeof importScripts === 'function') importScripts('core.js', 'helix.js', 'secrets.js');

const CACHE_TTL_MS = 3 * 60 * 1000;
const PROGRESS_EVERY_PAGES = 5;
const CACHE_PREFIX = 'result:';

let tokenPromise = null;
const runs = new Map(); // filterKey -> { ports:Set, controller }

// TFSecrets keeps the Client Secret and access token where content scripts can't read them. Content
// scripts keep their filter settings in storage.sync instead.
const lockSecrets = TFSecrets.lock()
  .catch((error) => console.error('Twitch Category Filter: could not restrict storage.local', error));
chrome.runtime.onStartup.addListener(() => lockSecrets);

// Older versions kept the filter settings in storage.local, where content scripts can no longer read them.
chrome.runtime.onInstalled.addListener(async () => {
  const { settings } = await chrome.storage.local.get('settings');
  if (!settings) return;
  const synced = await chrome.storage.sync.get('settings');
  if (!synced.settings) await chrome.storage.sync.set({ settings });
  await chrome.storage.local.remove('settings');
});

async function getCredentials() {
  const { clientId = '', clientSecret = '' } = await TFSecrets.get(['clientId', 'clientSecret']);
  return { clientId: clientId.trim(), clientSecret: clientSecret.trim() };
}

async function fetchNewToken() {
  const { clientId, clientSecret } = await getCredentials();
  const token = await TFHelix.requestAppToken({ clientId, clientSecret, fetchFn: fetch });
  await TFSecrets.set({ token });
  return token.accessToken;
}

async function getToken(forceNew) {
  if (!forceNew) {
    const { token } = await TFSecrets.get('token');
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
    // 'keepalive' needs no reply: receiving it is what keeps Firefox's background running.
  });
  port.onDisconnect.addListener(() => detachPort(port));
});

async function testConnection() {
  const { clientId, clientSecret } = await getCredentials();
  const token = await TFHelix.requestAppToken({ clientId, clientSecret, fetchFn: fetch });
  await TFSecrets.set({ token });
  await TFHelix.helixGet(TFHelix.buildStreamsUrl({ languages: [] }, undefined, 1), {
    fetchFn: fetch,
    clientId,
    getToken: async () => token.accessToken,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: Date.now,
  });
  return { ok: true };
}

// Sent by the options page after it saves new credentials.
async function onCredentialsSaved() {
  tokenPromise = null;
  await TFSecrets.remove('token');
  notifyTabs({ type: 'credentials-changed' });
  return testConnection();
}

function fromOptionsPage(sender) {
  return sender.id === chrome.runtime.id && typeof sender.url === 'string'
    && sender.url.startsWith(chrome.runtime.getURL('src/options.html'));
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'open-options') {
    chrome.runtime.openOptionsPage();
    return false;
  }
  if (message.type === 'credentials-saved' && fromOptionsPage(sender)) {
    onCredentialsSaved()
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }
  return false;
});

// Only tabs with the content script (twitch.tv) answer; the rest reject, which is expected.
async function notifyTabs(message) {
  for (const tab of await chrome.tabs.query({})) {
    if (tab.id !== undefined) chrome.tabs.sendMessage(tab.id, message).catch(() => {});
  }
}
