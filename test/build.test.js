'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { firefoxManifest, createZip } = require('../scripts/build.js');

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'extension', 'manifest.json'), 'utf8'));

test('Firefox manifest loads the background helpers as scripts instead of a service worker', () => {
  const firefox = firefoxManifest(manifest);
  assert.equal(firefox.background.service_worker, undefined);
  assert.deepEqual(firefox.background.scripts, ['src/core.js', 'src/helix.js', 'src/secrets.js', 'src/background.js']);
});

test('Firefox manifest has a fixed add-on ID and drops Chrome-only keys', () => {
  const firefox = firefoxManifest(manifest);
  assert.match(firefox.browser_specific_settings.gecko.id, /@/);
  assert.deepEqual(firefox.browser_specific_settings.gecko.data_collection_permissions, { required: ['authenticationInfo'] });
  assert.equal(firefox.minimum_chrome_version, undefined);
  assert.deepEqual(firefox.content_scripts, manifest.content_scripts);
  assert.equal(firefox.version, manifest.version);
});

test('every helper the service worker imports is listed for Firefox', () => {
  const background = fs.readFileSync(path.join(__dirname, '..', 'extension', 'src', 'background.js'), 'utf8');
  const imported = /importScripts\(([^)]*)\)/.exec(background)[1].match(/'[^']+'/g).map((name) => `src/${name.slice(1, -1)}`);
  assert.deepEqual(firefoxManifest(manifest).background.scripts, [...imported, 'src/background.js']);
});

// Reads back the archive with the central directory, as unzip tools do.
function readZip(buffer) {
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buffer.readUInt16LE(end + 10);
  let pos = buffer.readUInt32LE(end + 16);
  const files = {};
  for (let i = 0; i < count; i += 1) {
    assert.equal(buffer.readUInt32LE(pos), 0x02014b50);
    const size = buffer.readUInt32LE(pos + 20);
    const nameLength = buffer.readUInt16LE(pos + 28);
    const local = buffer.readUInt32LE(pos + 42);
    const name = buffer.toString('utf8', pos + 46, pos + 46 + nameLength);
    const dataStart = local + 30 + buffer.readUInt16LE(local + 26);
    const data = zlib.inflateRawSync(buffer.subarray(dataStart, dataStart + size));
    assert.equal(zlib.crc32(data), buffer.readUInt32LE(pos + 16));
    files[name] = data.toString('utf8');
    pos += 46 + nameLength;
  }
  return files;
}

test('zip archives round-trip and are byte-for-byte reproducible', () => {
  const entries = [
    { name: 'manifest.json', data: Buffer.from('{"name":"x"}') },
    { name: 'src/ünïcode.js', data: Buffer.from('const a = 1;\n'.repeat(50)) },
  ];
  const zip = createZip(entries);
  assert.deepEqual(readZip(zip), { 'manifest.json': '{"name":"x"}', 'src/ünïcode.js': 'const a = 1;\n'.repeat(50) });
  assert.ok(zip.equals(createZip(entries)));
});
