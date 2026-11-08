'use strict';

const form = document.getElementById('form');
const clientId = document.getElementById('clientId');
const clientSecret = document.getElementById('clientSecret');
const result = document.getElementById('result');

function show(message, ok) {
  result.textContent = message;
  result.className = ok ? 'ok' : 'bad';
}

TFSecrets.get(['clientId', 'clientSecret']).then((stored) => {
  clientId.value = stored.clientId || '';
  clientSecret.value = stored.clientSecret || '';
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  result.textContent = 'Testing…';
  result.className = '';
  await TFSecrets.set({ clientId: clientId.value.trim(), clientSecret: clientSecret.value.trim() });
  // The background drops the old token, tells open Twitch tabs, and tests the new credentials.
  const response = await chrome.runtime.sendMessage({ type: 'credentials-saved' });
  if (response && response.ok) show('Connected to Twitch. Open twitch.tv/directory to use the filter.', true);
  else show((response && response.message) || 'The test failed.', false);
});
