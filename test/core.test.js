'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const TF = require('../extension/src/core.js');

const stream = (id, gameId, gameName, viewers, language = 'de', tags = []) => ({
  id, game_id: gameId, game_name: gameName, viewer_count: viewers, language, tags,
  user_login: `user${id}`, user_name: `User${id}`, title: `title ${id}`,
});

test('aggregates viewers and streams per category, most viewers first', () => {
  const agg = TF.createAggregator({ languages: ['de'] });
  agg.add(stream('1', '10', 'Alpha', 5));
  agg.add(stream('2', '20', 'Beta', 100));
  agg.add(stream('3', '10', 'Alpha', 7));
  const snap = agg.snapshot();
  assert.deepEqual(snap.games.map((g) => [g.id, g.viewers, g.streams]), [['20', 100, 1], ['10', 12, 2]]);
  assert.equal(snap.totalViewers, 112);
  assert.equal(snap.totalStreams, 3);
});

test('a stream repeated across pages is counted once', () => {
  const agg = TF.createAggregator({ languages: ['de'] });
  agg.add(stream('1', '10', 'Alpha', 5));
  agg.add(stream('1', '10', 'Alpha', 5));
  assert.equal(agg.snapshot().games[0].viewers, 5);
});

test('zero-viewer streams still count as live hits', () => {
  const agg = TF.createAggregator({ languages: ['de'] });
  agg.add(stream('1', '10', 'Alpha', 0));
  assert.deepEqual(agg.snapshot().games.map((g) => [g.viewers, g.streams]), [[0, 1]]);
});

test('streams with no category count in totals but create no category', () => {
  const agg = TF.createAggregator({ languages: ['de'] });
  agg.add(stream('1', '', '', 9));
  const snap = agg.snapshot();
  assert.equal(snap.games.length, 0);
  assert.equal(snap.totalViewers, 9);
});

test('keeps only the top streams per category but the true totals', () => {
  const agg = TF.createAggregator({ languages: ['de'] });
  for (let i = 0; i < 40; i += 1) agg.add(stream(String(i), '10', 'Alpha', 1));
  const [game] = agg.snapshot().games;
  assert.equal(game.streams, 40);
  assert.equal(game.top.length, 30);
});

test('language and tag filters both apply, case-insensitively', () => {
  const f = { languages: ['DE', 'fr'], tags: ['Chill', 'rp'] };
  assert.equal(TF.streamMatches(stream('1', '1', 'A', 1, 'de', ['chill']), f), true);
  assert.equal(TF.streamMatches(stream('1', '1', 'A', 1, 'fr', ['RP']), f), true);
  assert.equal(TF.streamMatches(stream('1', '1', 'A', 1, 'en', ['chill']), f), false);
  assert.equal(TF.streamMatches(stream('1', '1', 'A', 1, 'de', ['other']), f), false);
});

test('filter keys ignore order, case and duplicates', () => {
  assert.equal(TF.filterKey({ languages: ['de', 'FR', 'de'], tags: [] }), TF.filterKey({ languages: ['fr', 'de'] }));
  assert.notEqual(TF.filterKey({ languages: ['de'] }), TF.filterKey({ languages: ['fr'] }));
});

test('hasFilters ignores blank entries', () => {
  assert.equal(TF.hasFilters({ languages: [], tags: [' ', ''] }), false);
  assert.equal(TF.hasFilters({ languages: ['de'] }), true);
});

test('reads game IDs from box art URLs seen on the live page', () => {
  assert.equal(TF.parseBoxArtId('https://static-cdn.jtvnw.net/ttv-boxart/509658-285x380.jpg'), '509658');
  assert.equal(TF.parseBoxArtId('https://static-cdn.jtvnw.net/ttv-boxart/27471_IGDB-285x380.jpg'), '27471');
  assert.equal(TF.parseBoxArtId('https://static-cdn.jtvnw.net/ttv-boxart/shopping-2026-d4d9e556.png'), null);
  assert.equal(TF.parseBoxArtId(null), null);
});

test('reads category slugs and builds matching ones', () => {
  assert.equal(TF.parseCategorySlug('/directory/category/just-chatting'), 'just-chatting');
  assert.equal(TF.parseCategorySlug('/directory/category/just-chatting?lang=de'), 'just-chatting');
  assert.equal(TF.slugify('Just Chatting'), 'just-chatting');
  assert.equal(TF.slugify("Tom Clancy's Rainbow Six Siege"), 'tom-clancys-rainbow-six-siege');
  assert.equal(TF.slugify('Pokémon Go'), 'pokemon-go');
});

test('cards match by ID first, then slug, even when the name is translated', () => {
  const index = TF.buildIndex([{ id: '509663', name: 'Special Events', slug: 'special-events' }, { id: '9', name: 'Shopping', slug: 'shopping' }]);
  assert.equal(TF.findGame(index, { id: '509663', slug: 'besondere-events' }).name, 'Special Events');
  assert.equal(TF.findGame(index, { id: null, slug: 'shopping' }).name, 'Shopping');
  assert.equal(TF.findGame(index, { id: '123', slug: 'nothing' }), null);
});
