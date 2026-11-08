'use strict';

const $ = (id) => document.getElementById(id);
const ui = {
  account: $('account'),
  connectArea: $('connect-area'),
  connect: $('connect'),
  codeArea: $('code-area'),
  userCode: $('user-code'),
  verifyLink: $('verify-link'),
  cancel: $('cancel'),
  disconnectArea: $('disconnect-area'),
  disconnect: $('disconnect'),
  own: $('own'),
  ownForm: $('own-form'),
  clientId: $('clientId'),
  clientSecret: $('clientSecret'),
  result: $('result'),
};
const clientId = TFHelix.OFFICIAL_CLIENT_ID;
let signIn = null; // the device flow in progress, if any

function show(message, ok) {
  ui.result.textContent = message;
  ui.result.className = ok === undefined ? '' : ok ? 'ok' : 'bad';
}

async function render() {
  const stored = await TFSecrets.get(['mode', 'userAuth', 'clientId', 'clientSecret']);
  const mode = stored.mode || (stored.clientSecret ? 'own' : 'twitch');
  const connected = mode === 'twitch' && Boolean(stored.userAuth);

  if (connected) ui.account.textContent = `Connected as ${stored.userAuth.login}.`;
  else if (mode === 'own') ui.account.textContent = 'Not connected. The extension is using your own Twitch app, set up below.';
  else ui.account.textContent = 'Not connected. Connect your Twitch account to start.';

  ui.connect.textContent = mode === 'own' ? 'Connect with Twitch instead' : 'Connect with Twitch';
  ui.connectArea.hidden = connected || Boolean(signIn);
  ui.codeArea.hidden = !signIn;
  ui.disconnectArea.hidden = !connected || Boolean(signIn);

  if (document.activeElement !== ui.clientId) ui.clientId.value = stored.clientId || '';
  if (document.activeElement !== ui.clientSecret) ui.clientSecret.value = stored.clientSecret || '';
  if (mode === 'own') ui.own.open = true;
}

// Tells the background, which drops old tokens, refreshes open Twitch tabs, and tests the connection.
async function credentialsChanged() {
  return chrome.runtime.sendMessage({ type: 'credentials-saved' });
}

function openTab(url) {
  if (chrome.tabs && chrome.tabs.create) chrome.tabs.create({ url });
  else window.open(url, '_blank', 'noreferrer');
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function connect() {
  show('');
  let flow;
  try {
    flow = await TFHelix.startDeviceFlow({ clientId, fetchFn: fetch });
  } catch (error) {
    show(error.message, false);
    return;
  }
  const attempt = { cancelled: false };
  signIn = attempt;
  ui.userCode.textContent = flow.userCode;
  ui.verifyLink.href = flow.verificationUri;
  await render();
  openTab(flow.verificationUri);

  let interval = flow.interval;
  try {
    while (!attempt.cancelled) {
      if (Date.now() > flow.expiresAt) throw new TFHelix.HelixError('auth', 'The code expired. Click Connect to try again.');
      await sleep(interval * 1000);
      if (attempt.cancelled) return;
      const outcome = await TFHelix.pollDeviceFlow({ clientId, deviceCode: flow.deviceCode, fetchFn: fetch });
      if (outcome.status === 'slow_down') interval += 5;
      if (outcome.status !== 'done') continue;

      const user = await TFHelix.validateToken({ accessToken: outcome.tokens.accessToken, fetchFn: fetch });
      if (!user || user.clientId !== clientId) throw new TFHelix.HelixError('auth', 'Twitch didn\'t accept the new connection. Click Connect to try again.');
      await TFSecrets.set({
        mode: 'twitch',
        userAuth: { ...outcome.tokens, login: user.login, userId: user.userId, validatedAt: Date.now() },
      });
      signIn = null;
      await render();
      show('Connecting…');
      const response = await credentialsChanged();
      if (response && response.ok) show('Connected. Open twitch.tv/directory to use the filter.', true);
      else show((response && response.message) || 'The connection test failed.', false);
      return;
    }
  } catch (error) {
    if (signIn === attempt) show(error.message, false);
  } finally {
    if (signIn === attempt) {
      signIn = null;
      await render();
    }
  }
}

async function disconnect() {
  const { userAuth } = await TFSecrets.get('userAuth');
  if (userAuth) await TFHelix.revokeToken({ clientId, accessToken: userAuth.accessToken, fetchFn: fetch });
  await TFSecrets.remove('userAuth');
  await render();
  show('Disconnected.');
  await credentialsChanged(); // Open Twitch tabs stop scanning and point to these settings.
}

async function saveOwnApp(event) {
  event.preventDefault();
  show('Testing…');
  await TFSecrets.set({ mode: 'own', clientId: ui.clientId.value.trim(), clientSecret: ui.clientSecret.value.trim() });
  await render();
  const response = await credentialsChanged();
  if (response && response.ok) show('Connected to Twitch with your own app. Open twitch.tv/directory to use the filter.', true);
  else show((response && response.message) || 'The test failed.', false);
}

ui.connect.addEventListener('click', connect);
ui.cancel.addEventListener('click', () => {
  if (signIn) signIn.cancelled = true;
  signIn = null;
  show('');
  render();
});
ui.disconnect.addEventListener('click', disconnect);
ui.ownForm.addEventListener('submit', saveOwnApp);
render();
