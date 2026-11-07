// Runs in the page's own context, because Twitch's React props can't be read from a content script.
// It has no extension privileges: all it does is ask Twitch's card list to load its next batch.
(function () {
  'use strict';

  const MAX_DEPTH = 6;

  function findLoadMoreProps(node) {
    const key = Object.keys(node).find((name) => name.startsWith('__reactFiber'));
    let fiber = key ? node[key] : null;
    for (let depth = 0; fiber && depth < MAX_DEPTH; depth += 1) {
      const props = fiber.memoizedProps;
      if (props && typeof props.loadMore === 'function') return props;
      fiber = fiber.return;
    }
    return null;
  }

  document.addEventListener('tf-load-more', () => {
    const marker = document.querySelector('.scrollable-trigger__wrapper');
    const props = marker && findLoadMoreProps(marker);
    if (props && props.enabled !== false) props.loadMore();
  });
})();
