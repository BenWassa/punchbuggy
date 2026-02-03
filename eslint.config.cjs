const globals = require('globals');

module.exports = [
  {
    ignores: ['node_modules/**', 'dist/**', '.vite/**'],
  },
  {
    files: ['**/*.js', '**/*.cjs'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.worker,
      },
    },
    rules: {
      'no-unused-vars': 'warn',
    },
  },
  {
    files: ['scripts/**/*.js', 'vite.config.cjs'],
    languageOptions: {
      sourceType: 'script',
      globals: globals.node,
    },
  },
];
