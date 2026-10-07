import './styles/tokens.css';
import './styles/base.css';
import './styles/shell.css';
import './styles/home.css';
import './styles/game.css';
import './styles/games.css';
import { start } from './app.js';

const root = document.getElementById('app');

window.addEventListener('error', (event) => {
  // Last-resort overlay: never leave the player staring at a blank page.
  if (root && !root.hasChildNodes()) {
    root.innerHTML =
      '<div class="fatal"><h1>Something glitched</h1>' +
      '<p>Reload the page to get back to the arcade.</p></div>';
  }
  console.error(event.error ?? event.message);
});

start(root);
