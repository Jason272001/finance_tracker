(function () {
  'use strict';
  // Keep two narrated videos from speaking over one another.
  document.addEventListener('play', event => {
    if (!event.target.matches?.('#watch video')) return;
    for (const video of document.querySelectorAll('#watch video')) {
      if (video !== event.target) video.pause();
    }
  }, true);
})();
