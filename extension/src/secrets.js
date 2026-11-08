// Storage for the Client ID, Client Secret and access token, used by the background and the options page.
// Content scripts run inside twitch.tv and must not be able to read any of it.
// - Chromium: storage.local, restricted to trusted contexts with setAccessLevel.
// - Firefox has no setAccessLevel, so it uses the extension's own IndexedDB, which content scripts
//   cannot open (theirs belongs to twitch.tv).
'use strict';
/* exported TFSecrets */

const TFSecrets = (() => {
  const canLockStorage = typeof chrome.storage.local.setAccessLevel === 'function';

  // Must run every time the background starts: the access level does not survive a browser restart.
  function lock() {
    if (!canLockStorage) return Promise.resolve();
    return chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  }

  if (canLockStorage) {
    return {
      lock,
      get: (keys) => chrome.storage.local.get(keys),
      set: (values) => chrome.storage.local.set(values),
      remove: (keys) => chrome.storage.local.remove(keys),
    };
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('tf-secrets', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('kv');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function transaction(mode, work) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('kv', mode);
      const result = work(tx.objectStore('kv'));
      tx.oncomplete = () => { db.close(); resolve(result); };
      tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
    });
  }

  return {
    lock,
    get: (keys) => transaction('readonly', (store) => {
      const values = {};
      for (const key of [].concat(keys)) {
        const request = store.get(key);
        request.onsuccess = () => { if (request.result !== undefined) values[key] = request.result; };
      }
      return values;
    }),
    set: (values) => transaction('readwrite', (store) => {
      for (const [key, value] of Object.entries(values)) store.put(value, key);
    }),
    remove: (keys) => transaction('readwrite', (store) => {
      for (const key of [].concat(keys)) store.delete(key);
    }),
  };
})();
