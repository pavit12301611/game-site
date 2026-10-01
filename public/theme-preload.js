(() => {
  try {
    const pref = localStorage.getItem('psd-theme-preference');
    const sysLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    const theme = pref === 'light' || pref === 'dark' ? pref : sysLight ? 'light' : 'dark';

    // On the landing route, fetch the hero before the app module draws it.
    const hash = location.hash;
    if (!hash || hash === '#' || hash === '#/' || hash === '#/home') {
      const hero = document.createElement('link');
      hero.rel = 'preload';
      hero.as = 'image';
      hero.href = '/images/hero.webp';
      hero.setAttribute('imagesrcset', '/images/hero-800.webp 800w, /images/hero.webp 1600w');
      hero.setAttribute('imagesizes', '100vw');
      hero.setAttribute('fetchpriority', 'high');
      document.head.appendChild(hero);
    }

    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    const meta = document.getElementById('meta-theme-color');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#f6f1e8' : '#14110f');
  } catch {
    // Best-effort pre-paint only: the app applies the saved theme after it loads if this fails.
  }
})();
