/**
 * Browser entry point.
 *
 * Only two jobs: pull in the stylesheet (a Vite-only import) and start the app. Everything that
 * used to live in this file is now reachable from src/app.js and its modules, so the UI can also be
 * imported by the jsdom smoke tests in tests/app-render.test.js, which cannot load a .css file.
 */
// Fonts are self-hosted through npm (@fontsource/*), not pulled from a CDN, so the app keeps
// working under the strict CSP in vercel.json (font-src 'self' data:) with no external requests.
// Only the latin subset and the weights the stylesheet actually asks for: shipping every subset
// and weight would put ~2 MB of font files in dist for scripts nobody sees. Anything outside
// latin (a Hindi username, an emoji) falls back to a system font, which is what it did before.
import '@fontsource/chakra-petch/latin-600.css';
import '@fontsource/chakra-petch/latin-700.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/shell.css';
import './styles/home.css';
import './styles/rooms.css';
import './styles/boards.css';
import './styles/modals.css';
import './styles/fx.css';
import './app.js';

import './styles/expansion.css';
