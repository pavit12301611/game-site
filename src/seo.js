/**
 * Per-route title, description and social-preview tags.
 */

const META = {
  home: { title: 'PSD-gaming — Play together, anywhere', description: 'Forty bite-size retro games for 2–3 friends. Share a link and play in the browser.' },
  catalog: { title: 'Game Library — PSD-gaming', description: 'Browse 40 original retro mini-games across four categories.' },
  friends: { title: 'Friends — PSD-gaming', description: 'Find, add and challenge your friends.' },
  reviews: { title: 'Reviews — PSD-gaming', description: 'See what players are saying about the arcade.' },
  admin: { title: 'Admin Studio — PSD-gaming', description: 'Manage rooms, players, reviews and access.' },
  privacy: { title: 'Privacy — PSD-gaming', description: 'How PSD-gaming handles your data.' },
  safety: { title: 'Terms & Safety — PSD-gaming', description: 'Rules and safety information for PSD-gaming.' },
  room: { title: 'Game Room — PSD-gaming', description: 'An online game room in PSD-gaming.' },
  game: { title: 'Play — PSD-gaming', description: 'A game session in PSD-gaming.' },
  maintenance: { title: 'PSD-gaming — Closed for maintenance', description: 'The arcade is temporarily closed.' },
};

export function applyPageMeta(page) {
  const meta = META[page] || META.home;
  document.title = meta.title;
  const desc = document.querySelector('meta[name="description"]');
  if (desc) desc.setAttribute('content', meta.description);
}