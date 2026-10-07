import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    ignores: [
      'dist/',
      'functions/vendor/',
      'public/',
      'tests/fixtures/',
      'node_modules/',
    ],
  },
];