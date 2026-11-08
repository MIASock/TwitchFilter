// Builds the extension for Chromium browsers and Firefox from the shared source in extension/.
//
//   dist/chrome/   and  dist/<name>-<version>-chrome.zip    (Chrome, Edge, Brave, Opera)
//   dist/firefox/  and  dist/<name>-<version>-firefox.zip   (Firefox 140+)
//
// Archives get fixed timestamps and a sorted file order, so the same source always gives the same zip.
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'extension');
const DIST = path.join(ROOT, 'dist');
const ARCHIVE_NAME = 'category-filter-for-twitch';
const FIREFOX_ID = 'category-filter-for-twitch@miasock';

// Firefox runs MV3 backgrounds as event pages rather than service workers, so it loads the helper scripts
// that the service worker otherwise pulls in with importScripts. It also needs a fixed add-on ID for
// storage.sync.
function firefoxManifest(manifest) {
  const { minimum_chrome_version: _chromeOnly, ...rest } = manifest;
  return {
    ...rest,
    background: { scripts: ['src/core.js', 'src/helix.js', 'src/secrets.js', 'src/background.js'] },
    browser_specific_settings: {
      gecko: {
        id: FIREFOX_ID,
        // 128 added world: "MAIN" content scripts; 140 added data_collection_permissions.
        strict_min_version: '140.0',
        // Nothing goes to the developer. The only requests are to Twitch, with the user's own app.
        data_collection_permissions: { required: ['none'] },
      },
      // Firefox for Android reads data_collection_permissions from 142.
      gecko_android: { strict_min_version: '142.0' },
    },
  };
}

function listFiles(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? listFiles(full, base) : [path.relative(base, full).split(path.sep).join('/')];
    })
    .sort();
}

// Minimal zip writer: deflate, UTF-8 names, every entry dated 1980-01-01 00:00.
function createZip(entries) {
  const DOS_TIME = 0;
  const DOS_DATE = (1 << 5) | 1;
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBytes = Buffer.from(name, 'utf8');
    const compressed = zlib.deflateRawSync(data, { level: 9 });
    const crc = zlib.crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    locals.push(local, nameBytes, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);

    offset += local.length + nameBytes.length + compressed.length;
  }

  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

function writeTarget(target, manifest, version) {
  const dir = path.join(DIST, target);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.cpSync(SOURCE, dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  const entries = listFiles(dir).map((name) => ({ name, data: fs.readFileSync(path.join(dir, name)) }));
  const zipPath = path.join(DIST, `${ARCHIVE_NAME}-${version}-${target}.zip`);
  fs.writeFileSync(zipPath, createZip(entries));
  return path.relative(ROOT, zipPath);
}

function build() {
  const manifest = JSON.parse(fs.readFileSync(path.join(SOURCE, 'manifest.json'), 'utf8'));
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  if (manifest.version !== pkg.version) {
    throw new Error(`Version mismatch: extension/manifest.json has ${manifest.version}, package.json has ${pkg.version}.`);
  }

  fs.mkdirSync(DIST, { recursive: true });
  for (const old of fs.readdirSync(DIST).filter((name) => name.endsWith('.zip'))) fs.rmSync(path.join(DIST, old));

  const outputs = [
    writeTarget('chrome', manifest, manifest.version),
    writeTarget('firefox', firefoxManifest(manifest), manifest.version),
  ];
  for (const output of outputs) console.log(`Built ${output}`);
}

if (require.main === module) {
  try {
    build();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = { firefoxManifest, createZip, listFiles };
