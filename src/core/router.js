// Hash router: '#/' home, '#/game/<id>?mode=cpu&diff=hard' game page.

export function parseHash(hash = typeof location !== 'undefined' ? location.hash : '') {
  const raw = hash.replace(/^#/, '') || '/';
  const [path, queryString] = raw.split('?');
  const params = Object.fromEntries(new URLSearchParams(queryString || ''));
  const gameMatch = path.match(/^\/game\/([\w-]+)\/?$/);
  if (gameMatch) return { name: 'game', id: gameMatch[1], params };
  if (path === '/' || path === '') return { name: 'home', params };
  return { name: 'notfound', params };
}

export function navigate(path) {
  if (typeof location === 'undefined') return;
  const target = `#${path.startsWith('/') ? path : `/${path}`}`;
  if (location.hash === target) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    location.hash = target;
  }
}

export function subscribe(fn) {
  window.addEventListener('hashchange', fn);
  return () => window.removeEventListener('hashchange', fn);
}

export function gamePath(id, params = {}) {
  const q = new URLSearchParams(params);
  const qs = q.toString();
  return `/game/${id}${qs ? `?${qs}` : ''}`;
}
