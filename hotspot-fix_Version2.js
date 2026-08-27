// hotspot-fix.js
// Responsive hotspot alignment helper
// Converts percentage-based hotspot inline styles (left/top/width/height) into
// pixel-accurate positions relative to the displayed image inside .frame-photo-wrap.
// Runs on image load, window resize, and when overlays change (MutationObserver).

(function () {
  function parsePercent(value) {
    if (!value) return null;
    value = String(value).trim();
    if (value.endsWith('%')) return parseFloat(value.slice(0, -1));
    const m = value.match(/([0-9.]+)\s*%/);
    return m ? parseFloat(m[1]) : null;
  }

  function adjustHotspotsForWrapper(wrapper) {
    const img = wrapper.querySelector('img');
    if (!img) return;
    const w = img.clientWidth;
    const h = img.clientHeight;
    if (!w || !h) return;

    const hotspots = wrapper.querySelectorAll('.frame-hotspot, .title-hotspot');
    hotspots.forEach(hs => {
      const raw = hs.getAttribute('style') || '';
      let left = null, top = null, width = null, height = null;

      const extract = (prop) => {
        const rx = new RegExp(prop + '\\s*:\\s*([0-9]+(?:\\.[0-9]+)?)%');
        const m = raw.match(rx);
        if (m) return parseFloat(m[1]);
        const inline = hs.style && hs.style[prop];
        if (inline && String(inline).includes('%')) return parsePercent(inline);
        return null;
      };

      left = extract('left');
      top = extract('top');
      width = extract('width');
      height = extract('height');

      try {
        const cs = window.getComputedStyle(hs);
        if (left == null && cs.left && cs.left.indexOf('%') !== -1) left = parsePercent(cs.left);
        if (top == null && cs.top && cs.top.indexOf('%') !== -1) top = parsePercent(cs.top);
        if (width == null && cs.width && cs.width.indexOf('%') !== -1) width = parsePercent(cs.width);
        if (height == null && cs.height && cs.height.indexOf('%') !== -1) height = parsePercent(cs.height);
      } catch (e) { /* ignore */ }

      if (left != null) hs.style.left = Math.round((left / 100) * w) + 'px';
      if (top != null) hs.style.top = Math.round((top / 100) * h) + 'px';
      if (width != null) hs.style.width = Math.round((width / 100) * w) + 'px';
      if (height != null) hs.style.height = Math.round((height / 100) * h) + 'px';

      hs.style.position = 'absolute';
      hs.style.transform = 'none';
      hs.style.display = 'block';
    });
  }

  function adjustAll() {
    document.querySelectorAll('.frame-photo-wrap').forEach(wrapper => adjustHotspotsForWrapper(wrapper));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', adjustAll);
  else adjustAll();

  window.addEventListener('resize', () => {
    clearTimeout(window.__hotspotResizeTimer);
    window.__hotspotResizeTimer = setTimeout(adjustAll, 80);
  }, { passive: true });

  const observeImages = () => {
    document.querySelectorAll('.frame-photo-wrap img').forEach(img => {
      if (img.__hotspot_bound) return;
      img.__hotspot_bound = true;
      if (img.complete) adjustHotspotsForWrapper(img.closest('.frame-photo-wrap'));
      else img.addEventListener('load', () => adjustHotspotsForWrapper(img.closest('.frame-photo-wrap')));
    });
  };
  observeImages();

  const mo = new MutationObserver(muts => {
    let touched = false;
    for (const m of muts) {
      if (m.type === 'childList' && m.addedNodes.length) touched = true;
      if (m.type === 'attributes' && (m.attributeName === 'style' || m.attributeName === 'class')) touched = true;
    }
    if (touched) {
      observeImages();
      clearTimeout(window.__hotspotMutateTimer);
      window.__hotspotMutateTimer = setTimeout(adjustAll, 40);
    }
  });
  mo.observe(document.body, { childList: true, subtree: true, attributes: true });

  window.__fixHotspotsNow = adjustAll;
})();