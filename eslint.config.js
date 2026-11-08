'use strict';

const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['dist/', 'node_modules/'] },
  js.configs.recommended,
  {
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^_', argsIgnorePattern: '^_' }],
    },
  },
  {
    // Extension code: plain browser scripts, no bundler. core.js and helix.js also export for the tests.
    files: ['extension/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        TF: 'readonly',
        TFHelix: 'readonly',
        module: 'readonly',
      },
    },
  },
  {
    files: ['extension/src/background.js'],
    languageOptions: { globals: { ...globals.serviceworker, TFSecrets: 'readonly' } },
  },
  {
    files: ['extension/src/options.js'],
    languageOptions: { globals: { TFSecrets: 'readonly' } },
  },
  {
    files: ['scripts/**/*.js', 'test/**/*.js', 'eslint.config.js'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
  },
];
