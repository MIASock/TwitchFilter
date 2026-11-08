// Writes dist/firefox: the shared extension source with a Firefox manifest.
// Firefox runs MV3 backgrounds as event pages ("scripts") rather than service workers, and needs a
// fixed add-on ID for storage.sync.
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'extension');
const OUT = path.join(ROOT, 'dist', 'firefox');

const manifest = JSON.parse(fs.readFileSync(path.join(SOURCE, 'manifest.json'), 'utf8'));

manifest.background = {
  scripts: ['src/core.js', 'src/helix.js', 'src/secrets.js', 'src/background.js'],
};
manifest.browser_specific_settings = {
  gecko: {
    id: 'twitch-category-filter@miasock',
    // 128 added world: "MAIN" content scripts; 140 added data_collection_permissions.
    strict_min_version: '140.0',
    // The extension sends nothing to its developer. Its only requests go to Twitch, with your own app.
    data_collection_permissions: { required: ['none'] },
  },
};

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(SOURCE, OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('Firefox build written to ' + path.relative(ROOT, OUT));
