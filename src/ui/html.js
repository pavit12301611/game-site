/**
 * HTML utilities: escaping, icon rendering.
 */

/**
 * Escapes a string for safe HTML insertion.
 * @param {string} str
 * @returns {string}
 */
export function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Renders a simple icon from the icon library.
 * @param {string} name
 * @returns {string}
 */
export function icon(name) {
  const icons = {
    star: '★',
    heart: '♥',
    close: '✕',
    arrow: '→',
    back: '←',
    search: '🔍',
    settings: '⚙',
    share: '↗',
    copy: '📋',
    check: '✓',
    warning: '⚠',
    info: 'ℹ',
    play: '▶',
    stop: '■',
    refresh: '↻',
    user: '👤',
    users: '👥',
    lock: '🔒',
    unlock: '🔓',
    chat: '💬',
    admin: '🛡️',
    logout: '🚪',
    moon: '🌙',
    sun: '☀',
    speaker: '🔊',
    mute: '🔇',
    trophy: '🏆',
    fire: '🔥',
    shield: '🛡',
    code: '⌨',
    link: '🔗',
    eye: '👁',
    trash: '🗑',
  };
  return icons[name] || name || '';
}