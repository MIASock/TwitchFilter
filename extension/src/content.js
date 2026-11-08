// Runs on twitch.tv: adds the filter bar, the per-card numbers, hard filtering and the ranking drawer.
(function () {
  'use strict';

  const TF = globalThis.TF;
  const REFRESH_MS = 5 * 60 * 1000;
  const DRAWER_ROWS = 300;
  const PUMP_WAIT_MS = 1000;
  const PUMP_MAX_IDLE_TRIES = 4;
  const PUMP_MAX_CARDS = 1000;
  const KEEPALIVE_MS = 10000;
  const MAX_LOST_SCANS = 2;
  const DEFAULT_SETTINGS = { languages: defaultLanguages(), tags: [], hard: false };
  const fmt = (n) => Number(n).toLocaleString();
  const count = (n, one, many = `${one}s`) => `${fmt(n)} ${Number(n) === 1 ? one : many}`;

  const state = {
    settings: { ...DEFAULT_SETTINGS },
    display: null, // { key, games, totalStreams, totalViewers, complete, truncated, updatedAt }
    index: TF.buildIndex([]),
    status: { phase: 'idle' }, // idle | crawling | done | error
    port: null,
    found: 0,
  };
  let lostScans = 0; // scans in a row that ended with the background gone

  // Starts with the browser's language. English is left for the user to pick: it's the largest language
  // on Twitch, so its scan is the slowest and the one least likely to be what they came for.
  function defaultLanguages() {
    const code = String(navigator.language || '').toLowerCase().split('-')[0];
    const supported = TF.LANGUAGES.some(([language]) => language === code);
    return supported && code !== 'en' ? [code] : [];
  }

  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (key === 'class') node.className = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else if (key in node) node[key] = value;
      else node.setAttribute(key, value);
    }
    node.append(...children);
    return node;
  }

  function setText(node, text) {
    if (node.textContent !== text) node.textContent = text;
  }

  // --- Page detection -------------------------------------------------------------------------------------

  function isBrowsePage() {
    return /^\/directory(\/|$)/.test(location.pathname) && !/^\/directory\/(category|game|following|collection)\b/.test(location.pathname);
  }

  function findCards() {
    return [...document.querySelectorAll('.game-card')];
  }

  function readCard(card) {
    const image = card.querySelector('img');
    const link = card.querySelector('a[href*="/directory/"]');
    return {
      id: TF.parseBoxArtId(image && image.getAttribute('src')),
      slug: TF.parseCategorySlug(link && link.getAttribute('href')),
    };
  }

  // The element that takes up a slot in Twitch's card grid.
  function cardSlot(card) {
    return card.closest('.tw-tower > *') || card;
  }

  // --- Twitch API connection ------------------------------------------------------------------------------

  function connect() {
    if (state.port) return state.port;
    const port = chrome.runtime.connect({ name: 'tf-crawl' });
    state.port = port;
    port.onMessage.addListener(onCrawlMessage);
    // Firefox stops an idle background after 30 s even mid-scan; a message from this side counts as
    // activity. Chromium doesn't need it, and it costs nothing there.
    const keepAlive = setInterval(() => {
      if (state.status.phase !== 'crawling') return;
      try { port.postMessage({ type: 'keepalive' }); } catch { /* disconnected; handled below */ }
    }, KEEPALIVE_MS);
    port.onDisconnect.addListener(() => {
      clearInterval(keepAlive);
      state.port = null;
      if (state.status.phase === 'crawling') {
        // A scan that keeps getting cut off would start over forever and use up API requests.
        lostScans += 1;
        state.status = lostScans >= MAX_LOST_SCANS
          ? { phase: 'error', code: 'lost', message: 'The scan keeps stopping before it finishes. Click Refresh to try again.' }
          : { phase: 'idle' };
      }
      render();
    });
    return port;
  }

  function currentKey() {
    return TF.filterKey(state.settings);
  }

  function requestCrawl(force) {
    if (!TF.hasFilters(state.settings)) {
      state.status = { phase: 'idle' };
      state.display = null;
      state.index = TF.buildIndex([]);
      if (state.port) state.port.postMessage({ type: 'cancel' });
      render();
      return;
    }
    if (force) lostScans = 0;
    state.status = { phase: 'crawling', pages: 0 };
    render();
    connect().postMessage({
      type: 'crawl',
      force: Boolean(force),
      filters: TF.normalizeFilters(state.settings),
    });
  }

  function showResult(message, complete) {
    state.display = {
      key: message.key,
      games: message.games,
      totalStreams: message.totalStreams,
      totalViewers: message.totalViewers,
      complete,
      truncated: Boolean(message.truncated),
      updatedAt: message.updatedAt || null,
    };
    state.index = TF.buildIndex(message.games);
  }

  function onCrawlMessage(message) {
    if (message.key !== currentKey()) return;

    if (message.type === 'progress') {
      state.status = { phase: 'crawling', pages: message.pages };
      // A refresh keeps showing the last finished result rather than a partial one.
      const hasFinished = state.display && state.display.key === message.key && state.display.complete;
      if (!hasFinished) showResult(message, false);
    } else if (message.type === 'done') {
      lostScans = 0;
      state.status = { phase: 'done' };
      showResult(message, true);
    } else if (message.type === 'error') {
      state.status = { phase: 'error', code: message.code, message: message.message };
    }
    render();
    refreshDrawer();
  }

  // --- Filter bar -----------------------------------------------------------------------------------------

  let bar = null;
  const ui = {};

  function saveSettings(patch) {
    const before = currentKey();
    const filters = TF.normalizeFilters({ ...state.settings, ...patch });
    state.settings = { ...state.settings, ...patch, ...filters };
    chrome.storage.sync.set({ settings: state.settings });
    if (currentKey() !== before) {
      state.display = null;
      state.index = TF.buildIndex([]);
      resetPump();
      requestCrawl(false);
    }
    if (patch.hard) resetPump();
    render();
  }

  function buildBar() {
    const languageList = el('div', { class: 'tf-menu' });
    for (const [code, name] of TF.LANGUAGES) {
      const box = el('input', {
        type: 'checkbox',
        value: code,
        onchange: () => {
          const picked = [...languageList.querySelectorAll('input:checked')].map((input) => input.value);
          saveSettings({ languages: picked });
        },
      });
      languageList.append(el('label', { class: 'tf-menu-item' }, box, ` ${name}`));
    }

    ui.languages = languageList;
    ui.languageSummary = el('summary', { class: 'tf-button' }, 'Languages');
    ui.tags = el('input', {
      class: 'tf-input',
      type: 'text',
      placeholder: 'Tags, comma separated',
      title: 'Show streams that have any of these tags',
      onchange: () => saveSettings({ tags: ui.tags.value.split(',') }),
    });
    ui.hard = el('input', { type: 'checkbox', onchange: () => saveSettings({ hard: ui.hard.checked }) });
    ui.ranking = el('button', { class: 'tf-button', type: 'button', onclick: () => drawDrawer(null) }, 'Ranking');
    ui.refresh = el('button', { class: 'tf-button', type: 'button', title: 'Scan again now', onclick: () => requestCrawl(true) }, 'Refresh');
    ui.status = el('span', { class: 'tf-status', 'aria-live': 'polite' });
    ui.setup = el('button', {
      class: 'tf-button tf-link-button',
      type: 'button',
      onclick: () => chrome.runtime.sendMessage({ type: 'open-options' }),
    }, 'Settings');

    const details = el('details', { class: 'tf-languages' }, ui.languageSummary, languageList);
    document.addEventListener('click', (event) => {
      if (details.open && !details.contains(event.target)) details.open = false;
    });

    return el('div', { class: 'tf-bar', 'data-tf-bar': '' },
      details,
      ui.tags,
      el('label', { class: 'tf-toggle' }, ui.hard, ' Hide categories with no matches'),
      ui.ranking,
      ui.refresh,
      ui.setup,
      ui.status,
    );
  }

  function placeBar(cards) {
    const onPage = isBrowsePage() && cards.length > 0;
    if (!onPage) {
      if (bar) bar.remove();
      return;
    }
    const tower = cards[0].closest('.tw-tower');
    if (!tower || !tower.parentElement) return;
    if (!bar) bar = buildBar();
    if (bar.nextElementSibling !== tower) tower.parentElement.insertBefore(bar, tower);
  }

  function statusText() {
    const { status, display, settings } = state;
    if (!TF.hasFilters(settings)) return 'Pick a language or tag to start.';
    if (status.phase === 'error') return status.message;

    const parts = [];
    if (display) {
      parts.push(`${count(display.totalViewers, 'viewer')} on ${count(display.totalStreams, 'stream')} in ${count(display.games.length, 'category', 'categories')}`);
    }
    if (status.phase === 'crawling') parts.push(`Scanning${status.pages ? ` (${fmt(status.pages * 100)} streams so far)` : ''}…`);
    if (settings.hard && canHide()) {
      const missing = display.games.length - state.found;
      parts.push(`Showing ${fmt(state.found)} of ${fmt(display.games.length)} here`);
      if (missing > 0) parts.push(pump.active ? 'Loading more…' : `${fmt(missing)} more in Ranking`);
    }
    if (display && display.truncated) parts.push('Too many streams to scan them all, so small channels may be missing');
    return parts.join(' · ');
  }

  function renderBar() {
    if (!bar) return;
    const { settings, status } = state;
    for (const input of ui.languages.querySelectorAll('input')) {
      input.checked = settings.languages.includes(input.value);
    }
    setText(ui.languageSummary, settings.languages.length ? `Languages: ${settings.languages.map((l) => l.toUpperCase()).join(', ')}` : 'Languages');
    if (document.activeElement !== ui.tags) ui.tags.value = settings.tags.join(', ');
    ui.hard.checked = settings.hard;
    ui.refresh.disabled = status.phase === 'crawling' || !TF.hasFilters(settings);
    ui.ranking.disabled = !(state.display && state.display.games.length);
    setText(ui.status, statusText());
    ui.status.classList.toggle('tf-status-error', status.phase === 'error');
    ui.setup.classList.toggle('tf-attention', status.phase === 'error' && status.code === 'auth');
  }

  // --- Cards ----------------------------------------------------------------------------------------------

  // Only a finished scan can prove a category has no matches, so nothing is hidden before then.
  function canHide() {
    return Boolean(state.display && state.display.complete && state.display.key === currentKey());
  }

  function renderCard(card, label) {
    const body = card.querySelector('.tw-card-body');
    let badge = card.querySelector('.tf-badge');
    const show = TF.hasFilters(state.settings) && state.display && body;

    if (!show) {
      if (badge) badge.remove();
      return null;
    }

    const game = TF.findGame(state.index, readCard(card));
    if (!badge) {
      badge = el('button', {
        class: 'tf-badge',
        type: 'button',
        onclick: (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (badge.dataset.gameId) drawDrawer(badge.dataset.gameId);
        },
      });
    }
    if (badge.parentElement !== body) body.append(badge);

    const pending = !game && !state.display.complete;
    const text = game
      ? `${label}: ${count(game.viewers, 'viewer')} · ${fmt(game.streams)} live`
      : `${label}: ${pending ? '…' : '0 viewers'}`;
    setText(badge, text);
    badge.dataset.gameId = game ? game.id : '';
    badge.disabled = !game;
    badge.classList.toggle('tf-badge-empty', !game);
    return game;
  }

  function renderCards(cards) {
    const onPage = isBrowsePage();
    const label = TF.filterLabel(state.settings);
    const hide = onPage && state.settings.hard && canHide() && TF.hasFilters(state.settings);
    const found = new Set();

    for (const card of cards) {
      const game = onPage ? renderCard(card, label) : null;
      if (game) found.add(game.id);
      const slot = cardSlot(card);
      if (hide && !game) {
        if (!slot.hasAttribute('data-tf-hidden')) slot.setAttribute('data-tf-hidden', '');
      } else if (slot.hasAttribute('data-tf-hidden')) {
        slot.removeAttribute('data-tf-hidden');
      }
    }
    state.found = found.size;
    pumpCards(cards, hide, found.size);
  }

  // --- Loading more cards while hard filtering ------------------------------------------------------------

  // Twitch loads the next cards as the user scrolls towards a marker below the grid. Hiding cards can leave the
  // page too short to scroll, so loading would stop. page.js asks for the next batch directly in that case.
  const pump = { busy: false, active: false, idleTries: 0, lastCount: 0 };

  function resetPump() {
    pump.idleTries = 0;
    pump.lastCount = 0;
  }

  function markerInView(tower) {
    const area = tower.parentElement && tower.parentElement.querySelector('.scrollable-trigger__trigger-area');
    return Boolean(area) && area.getBoundingClientRect().top <= window.innerHeight;
  }

  function pumpCards(cards, hide, found) {
    if (cards.length !== pump.lastCount) {
      if (cards.length > pump.lastCount) pump.idleTries = 0;
      pump.lastCount = cards.length;
    }
    const wanted = hide && found < state.display.games.length;
    const exhausted = pump.idleTries >= PUMP_MAX_IDLE_TRIES || cards.length >= PUMP_MAX_CARDS;
    pump.active = Boolean(wanted && !exhausted);
    if (!pump.active || pump.busy || document.visibilityState !== 'visible' || !cards.length) return;

    const tower = cards[0].closest('.tw-tower');
    if (!tower || !markerInView(tower)) return;

    pump.busy = true;
    pump.idleTries += 1;
    document.dispatchEvent(new CustomEvent('tf-load-more'));
    setTimeout(() => {
      pump.busy = false;
      scheduleRender();
    }, PUMP_WAIT_MS);
  }

  // --- Ranking drawer -------------------------------------------------------------------------------------

  let drawer = null;

  function closeDrawer() {
    if (drawer) drawer.remove();
    drawer = null;
  }

  function buildStreamRow(stream) {
    return el('a', { class: 'tf-stream', href: `https://www.twitch.tv/${encodeURIComponent(stream.login)}` },
      el('span', { class: 'tf-stream-top' },
        el('span', { class: 'tf-stream-name' }, stream.name),
        el('span', { class: 'tf-stream-viewers' }, `${fmt(stream.viewers)} · ${String(stream.language).toUpperCase()}`),
      ),
      el('span', { class: 'tf-stream-title' }, stream.title || ''),
    );
  }

  function buildGameRow(game, open) {
    const list = el('div', { class: 'tf-streams' });
    const fill = () => {
      if (list.childElementCount) return;
      list.append(...game.top.map(buildStreamRow));
      if (game.streams > game.top.length) {
        list.append(el('div', { class: 'tf-more' }, `Showing the top ${game.top.length} of ${fmt(game.streams)} streams`));
      }
    };
    if (open) fill();
    const row = el('details', { class: 'tf-game', open, ontoggle: () => { if (row.open) fill(); } },
      el('summary', { class: 'tf-game-row' },
        el('span', { class: 'tf-game-name' }, game.name),
        el('span', { class: 'tf-game-count' }, `${count(game.viewers, 'viewer')} · ${fmt(game.streams)} live`),
      ),
      list,
    );
    row.dataset.gameId = game.id;
    return row;
  }

  // Opens the drawer, or redraws it if it's already open. A category passed as focusId moves to the top, expanded.
  function drawDrawer(focusId) {
    if (!state.display) return;
    const isOpen = drawer && drawer.isConnected;
    const openIds = new Set(isOpen ? [...drawer.querySelectorAll('details[open]')].map((d) => d.dataset.gameId) : []);
    if (focusId) openIds.add(focusId);

    const games = state.display.games;
    const focused = focusId ? games.find((g) => g.id === focusId) : null;
    const ordered = focused ? [focused, ...games.filter((g) => g !== focused)] : games;
    const rows = ordered.slice(0, DRAWER_ROWS).map((game) => buildGameRow(game, openIds.has(game.id)));

    const fresh = el('aside', { class: 'tf-drawer', role: 'dialog', 'aria-label': 'Filtered category ranking' },
      el('header', { class: 'tf-drawer-head' },
        el('div', {},
          el('h2', { class: 'tf-drawer-title' }, `Categories for ${TF.filterLabel(state.settings)}`),
          el('p', { class: 'tf-drawer-sub' }, `${count(games.length, 'category', 'categories')}, most viewers first`),
        ),
        el('button', { class: 'tf-button', type: 'button', onclick: closeDrawer }, 'Close'),
      ),
      el('div', { class: 'tf-drawer-list' }, ...rows),
    );
    const scrollTop = isOpen && !focusId ? drawer.querySelector('.tf-drawer-list').scrollTop : 0;
    if (isOpen) drawer.replaceWith(fresh);
    else document.body.append(fresh);
    drawer = fresh;
    drawer.querySelector('.tf-drawer-list').scrollTop = scrollTop;
  }

  function refreshDrawer() {
    if (!drawer || !drawer.isConnected) return;
    if (state.display) drawDrawer(null);
    else closeDrawer();
  }

  // --- Render loop ----------------------------------------------------------------------------------------

  function render() {
    const cards = findCards();
    placeBar(cards);
    renderCards(cards);
    renderBar();
    if (!isBrowsePage()) {
      if (drawer) closeDrawer();
      if (state.status.phase === 'crawling' && state.port) {
        state.port.postMessage({ type: 'cancel' });
        state.status = { phase: 'idle' };
      }
    }
  }

  let scheduled = false;
  function scheduleRender() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      render();
      maybeStartOnBrowse();
    }, 120);
  }

  // Twitch is a single page app, so the script stays loaded while the user moves around the site.
  let lastCrawlAt = 0;
  function maybeStartOnBrowse() {
    if (!isBrowsePage() || !findCards().length || !TF.hasFilters(state.settings)) return;
    // Twitch keeps changing the page in background tabs, which must not use up API requests.
    if (document.visibilityState !== 'visible') return;
    if (state.status.phase === 'crawling' || state.status.phase === 'error') return;
    // An interrupted scan leaves an incomplete result, which is scanned again rather than kept.
    if (canHide() && Date.now() - lastCrawlAt < REFRESH_MS) return;
    lastCrawlAt = Date.now();
    requestCrawl(false);
  }

  async function start() {
    // storage.sync, because storage.local (credentials) is closed to content scripts.
    const { settings } = await chrome.storage.sync.get('settings');
    state.settings = { ...DEFAULT_SETTINGS, ...settings };

    new MutationObserver(scheduleRender).observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src'],
    });

    setInterval(maybeStartOnBrowse, 30000);
    document.addEventListener('visibilitychange', scheduleRender);

    chrome.runtime.onMessage.addListener((message) => {
      if (message && message.type === 'credentials-changed') {
        state.status = { phase: 'idle' };
        lastCrawlAt = 0;
        scheduleRender();
      }
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
      if (changes.settings) {
        const before = currentKey();
        state.settings = { ...DEFAULT_SETTINGS, ...changes.settings.newValue };
        if (currentKey() !== before) {
          state.display = null;
          state.index = TF.buildIndex([]);
          state.status = { phase: 'idle' };
          lastCrawlAt = 0;
          resetPump();
        }
        scheduleRender();
      }
    });

    scheduleRender();
  }

  start();
})();
