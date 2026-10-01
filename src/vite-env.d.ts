/**
 * Vite's ambient types: `import.meta.env`, and the side-effect imports of `.css` files that only the
 * bundler understands (`src/main.js` imports the stylesheet and the @fontsource CSS this way).
 *
 * Without this, `tsc --checkJs` reports every stylesheet import in src/main.js as a missing module,
 * which is why the entry point used to be excluded from the typecheck.
 */
/// <reference types="vite/client" />
