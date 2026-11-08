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
  .catch((error) => console.error('Category Filter for Twitch: could not restrict storage.local', error));
chrome.runtime.onStartup.addListener(() => lockSecrets);

// --- Signing in ---------------------------------------------------------------------------------------------
//
// Two ways to reach Twitch:
// - 'twitch' (default): the user connects their Twitch account to the extension's own app, with the device
//   code flow in the options page. The background keeps the 4-hour access token fresh with the refresh token.
// - 'own': the user's own registered app, with its Client ID and Secret and an app access token.

const VALIDATE_EVERY_MS = 60 * 60 * 1000;
const EXPIRY_MARGIN_MS = 60 * 1000;
const EXPIRED_MESSAGE = 'Your Twitch connection has expired. Connect again in the extension settings.';

async function getAuth() {
  const stored = await TFSecrets.get(['mode', 'clientId', 'clientSecret', 'token', 'userAuth']);
  const mode = stored.mode || (stored.clientSecret ? 'own' : 'twitch');
  const clientId = mode === 'own' ? String(stored.clientId || '').trim() : TFHelix.OFFICIAL_CLIENT_ID;
  return { ...stored, mode, clientId };
}

async function appToken(auth, forceNew) {
  if (!forceNew && auth.token && auth.token.expiresAt > Date.now() + EXPIRY_MARGIN_MS) return auth.token.accessToken;
  const token = await TFHelix.requestAppToken({
    clientId: auth.clientId,
    clientSecret: String(auth.clientSecret || '').trim(),
    fetchFn: fetch,
  });
  await TFSecrets.set({ token });
  return token.accessToken;
}

async function forgetUser(message) {
  await TFSecrets.remove('userAuth');
  throw new TFHelix.HelixError('auth', message);
}

async function refreshUser(auth) {
  let tokens;
  try {
    tokens = await TFHelix.refreshUserToken({ clientId: auth.clientId, refreshToken: auth.userAuth.refreshToken, fetchFn: fetch });
  } catch (error) {
    if (error.code === 'auth') return forgetUser(EXPIRED_MESSAGE);
    throw error;
  }
  const user = await TFHelix.validateToken({ accessToken: tokens.accessToken, fetchFn: fetch });
  if (!user) return forgetUser(EXPIRED_MESSAGE);
  const userAuth = { ...tokens, login: user.login, userId: user.userId, validatedAt: Date.now() };
  await TFSecrets.set({ userAuth });
  return userAuth.accessToken;
}

async function userToken(auth, forceNew) {
  const { userAuth } = auth;
  if (!userAuth) throw new TFHelix.HelixError('auth', 'Connect your Twitch account in the extension settings to start.');
  if (forceNew || userAuth.expiresAt <= Date.now() + EXPIRY_MARGIN_MS) return refreshUser(auth);
  if (Date.now() - (userAuth.validatedAt || 0) >= VALIDATE_EVERY_MS) {
    const user = await TFHelix.validateToken({ accessToken: userAuth.accessToken, fetchFn: fetch });
    if (!user) return refreshUser(auth);
    await TFSecrets.set({ userAuth: { ...userAuth, validatedAt: Date.now() } });
  }
  return userAuth.accessToken;
}

async function getToken(forceNew) {
  // Concurrent crawls share one token request. That matters for refresh tokens, which work only once.
  if (!tokenPromise) {
    tokenPromise = getAuth()
      .then((auth) => (auth.mode === 'own' ? appToken(auth, forceNew) : userToken(auth, forceNew)))
      .finally(() => { tokenPromise = null; });
  }
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
    console.warn('Category Filter for Twitch: result too large to cache', error);
  }
}

async function startRun(key, filters, run) {
  const aggregator = TF.createAggregator(filters);
  try {
    const { clientId } = await getAuth();
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
      port.postMessage({ type: 'done', ...cached });
      return;
    }
  }

  const existing = runs.get(key);
  if (existing) {
    existing.ports.add(port);
    return;
  }

  const run = { ports: new Set([port]), controller: new AbortController() };
  runs.set(key, run);
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
  const { clientId } = await getAuth();
  await TFHelix.helixGet(TFHelix.buildStreamsUrl({ languages: [] }, undefined, 1), {
    fetchFn: fetch,
    clientId,
    getToken,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: Date.now,
  });
  return { ok: true };
}

// Sent by the options page whenever it connects, disconnects or saves an own app.
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
