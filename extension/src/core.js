// Pure logic shared by the background, the content script and the tests.
(function (root) {
  'use strict';

  // Twitch's supported stream languages: https://help.twitch.tv/s/article/languages-on-twitch
  const LANGUAGES = [
    ['de', 'German'], ['en', 'English'], ['fr', 'French'], ['es', 'Spanish'], ['it', 'Italian'],
    ['nl', 'Dutch'], ['pl', 'Polish'], ['pt', 'Portuguese'], ['ru', 'Russian'], ['uk', 'Ukrainian'],
    ['tr', 'Turkish'], ['sv', 'Swedish'], ['no', 'Norwegian'], ['da', 'Danish'], ['fi', 'Finnish'],
    ['cs', 'Czech'], ['sk', 'Slovak'], ['hu', 'Hungarian'], ['ro', 'Romanian'], ['bg', 'Bulgarian'],
    ['el', 'Greek'], ['hr', 'Croatian'], ['sr', 'Serbian'], ['sl', 'Slovenian'], ['lt', 'Lithuanian'],
    ['lv', 'Latvian'], ['et', 'Estonian'], ['ca', 'Catalan'], ['ar', 'Arabic'], ['he', 'Hebrew'],
    ['hi', 'Hindi'], ['id', 'Indonesian'], ['ms', 'Malay'], ['th', 'Thai'], ['vi', 'Vietnamese'],
    ['tl', 'Tagalog'], ['ko', 'Korean'], ['ja', 'Japanese'], ['zh', 'Chinese'], ['asl', 'Sign language'],
    ['other', 'Other'],
  ];

  const TOP_STREAMS_PER_GAME = 30;

  function normalizeFilters(filters) {
    const clean = (list) => [...new Set((list || []).map((v) => String(v).trim().toLowerCase()).filter(Boolean))].sort();
    return { languages: clean(filters && filters.languages), tags: clean(filters && filters.tags) };
  }

  function filterKey(filters) {
    const f = normalizeFilters(filters);
    return JSON.stringify([f.languages, f.tags]);
  }

  function hasFilters(filters) {
    const f = normalizeFilters(filters);
    return f.languages.length > 0 || f.tags.length > 0;
  }

  function filterLabel(filters) {
    const f = normalizeFilters(filters);
    const langs = f.languages.length > 2 ? `${f.languages.length} languages` : f.languages.map((l) => l.toUpperCase()).join('+');
    const tags = f.tags.length > 2 ? `${f.tags.length} tags` : f.tags.map((t) => `#${t}`).join(' ');
    return [langs, tags].filter(Boolean).join(' ') || 'Filter';
  }

  // Languages are matched by the API request as well; checking here keeps the result correct regardless.
  // A stream matches a tag filter if it carries any of the listed tags.
  function streamMatches(stream, filters) {
    const f = normalizeFilters(filters);
    if (f.languages.length && !f.languages.includes(String(stream.language || '').toLowerCase())) return false;
    if (f.tags.length) {
      const tags = (stream.tags || []).map((t) => String(t).toLowerCase());
      if (!f.tags.some((t) => tags.includes(t))) return false;
    }
    return true;
  }

  // Approximates Twitch's category slugs. Used only for cards with no ID in their box art URL.
  function slugify(name) {
    return String(name || '')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/['’.:!?,()]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  // ".../ttv-boxart/509658-285x380.jpg" and ".../ttv-boxart/27471_IGDB-285x380.jpg" hold the game ID.
  function parseBoxArtId(src) {
    const match = /\/ttv-boxart\/(\d+)(?:_[A-Za-z]+)?-/.exec(String(src || ''));
    return match ? match[1] : null;
  }

  function parseCategorySlug(href) {
    const match = /\/directory\/(?:category|game)\/([^/?#]+)/.exec(String(href || ''));
    return match ? decodeURIComponent(match[1]).toLowerCase() : null;
  }

  // Collects streams into per-category totals. Pages can repeat a stream, so streams are deduplicated by ID.
  function createAggregator(filters) {
    const seen = new Set();
    const games = new Map();
    let streams = 0;
    let viewers = 0;

    return {
      add(stream) {
        if (seen.has(stream.id)) return;
        seen.add(stream.id);
        if (!streamMatches(stream, filters)) return;

        const count = Number(stream.viewer_count) || 0;
        streams += 1;
        viewers += count;
        if (!stream.game_id) return; // Channels with no category set can't appear on a category card.

        let game = games.get(stream.game_id);
        if (!game) {
          game = { id: stream.game_id, name: stream.game_name, slug: slugify(stream.game_name), viewers: 0, streams: 0, top: [] };
          games.set(stream.game_id, game);
        }
        game.viewers += count;
        game.streams += 1;
        if (game.top.length < TOP_STREAMS_PER_GAME) {
          game.top.push({
            login: stream.user_login,
            name: stream.user_name,
            title: stream.title,
            viewers: count,
            language: stream.language,
          });
        }
      },
      snapshot() {
        const list = [...games.values()].map((game) => ({
          ...game,
          top: [...game.top].sort((a, b) => b.viewers - a.viewers),
        }));
        list.sort((a, b) => b.viewers - a.viewers || b.streams - a.streams || a.name.localeCompare(b.name));
        return { games: list, totalStreams: streams, totalViewers: viewers };
      },
    };
  }

  function buildIndex(games) {
    const byId = new Map();
    const bySlug = new Map();
    for (const game of games || []) {
      byId.set(game.id, game);
      bySlug.set(game.slug, game);
    }
    return { byId, bySlug };
  }

  function findGame(index, card) {
    if (card.id && index.byId.has(card.id)) return index.byId.get(card.id);
    if (card.slug && index.bySlug.has(card.slug)) return index.bySlug.get(card.slug);
    return null;
  }

  const api = {
    LANGUAGES,
    normalizeFilters,
    filterKey,
    hasFilters,
    filterLabel,
    streamMatches,
    slugify,
    parseBoxArtId,
    parseCategorySlug,
    createAggregator,
    buildIndex,
    findGame,
  };

  root.TF = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
