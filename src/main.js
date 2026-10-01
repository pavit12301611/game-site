/**
 * Browser entry point.
 *
 * Only two jobs: pull in the stylesheet (a Vite-only import) and start the app. Everything that
 * used to live in this file is now reachable from src/app.js and its modules, so the UI can also be
 * imported by the jsdom smoke tests in tests/app-render.test.js, which cannot load a .css file.
 */
import './styles.css';
import './app.js';
