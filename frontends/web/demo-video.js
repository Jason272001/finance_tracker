(function () {
  'use strict';
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-narrator][data-video-target]');
    if (!button) return;
    const video = document.getElementById(button.dataset.videoTarget);
    if (!video) return;
    const style = button.dataset.narrator;
    const walkthrough = video.id === 'walkthroughVideo';
    const base = walkthrough ? 'keeperbma-walkthrough' : 'keeperbma-social';
    const alternate = walkthrough ? style === 'female' : style === 'male';
    const source = video.querySelector('source');
    const url = new URL(source.getAttribute('src'), document.baseURI);
    url.pathname = url.pathname.replace(/keeperbma-(?:walkthrough|social)(?:-male|-female)?\.mp4$/, base + (alternate ? '-' + style : '') + '.mp4');
    url.search = '?v=3';
    video.pause();
    source.src = url.href;
    video.load();
    for (const sibling of document.querySelectorAll('[data-narrator][data-video-target]')) {
      if (sibling.dataset.videoTarget === video.id) sibling.setAttribute('aria-pressed', String(sibling === button));
    }
    for (const link of document.querySelectorAll('[data-video-download]')) {
      if (link.dataset.videoDownload === video.id) link.href = url.href;
    }
    const status = document.getElementById(video.id + 'NarratorStatus');
    if (status) status.textContent = button.textContent + ' selected. Press Play to hear this voice. The music stays the same.';
  });
  // Keep two narrated videos from speaking over one another.
  document.addEventListener('play', event => {
    if (!event.target.matches?.('#watch video')) return;
    for (const video of document.querySelectorAll('#watch video')) {
      if (video !== event.target) video.pause();
    }
  }, true);
})();
