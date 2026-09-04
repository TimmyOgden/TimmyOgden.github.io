/**
 * Cookie consent bar — shown once (until a choice is stored), then wires
 * the decision into Google's Consent Mode. The inline gtag snippet in
 * index.html defaults `analytics_storage` to 'denied' before GA ever
 * loads; accepting here is what flips it to 'granted'. Declining just
 * remembers the choice so the bar doesn't reappear, leaving GA denied.
 */
export function initConsent() {
  const bar = document.getElementById('cookie-bar');
  const acceptBtn = document.getElementById('cookie-accept');
  const declineBtn = document.getElementById('cookie-decline');
  if (!bar || !acceptBtn || !declineBtn) return;

  let stored = null;
  try {
    stored = localStorage.getItem('cookie-consent');
  } catch (e) {
    // Storage unavailable (private mode, disabled) — the bar will just
    // reappear next visit rather than persisting a choice, which is an
    // acceptable fallback rather than breaking the page over it.
  }

  if (stored === 'granted' || stored === 'denied') return;

  bar.hidden = false;
  // Two-step show so the initial (pre-transition) state actually paints
  // before the class flips, letting the CSS transition animate in.
  requestAnimationFrame(() => requestAnimationFrame(() => bar.classList.add('is-visible')));

  const persist = (value) => {
    try {
      localStorage.setItem('cookie-consent', value);
    } catch (e) {}
  };

  const hide = () => {
    bar.classList.remove('is-visible');
    window.setTimeout(() => {
      bar.hidden = true;
    }, 400);
  };

  acceptBtn.addEventListener('click', () => {
    if (window.gtag) {
      window.gtag('consent', 'update', { analytics_storage: 'granted' });
    }
    persist('granted');
    hide();
  });

  declineBtn.addEventListener('click', () => {
    persist('denied');
    hide();
  });
}
