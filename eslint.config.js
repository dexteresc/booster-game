import js from '@eslint/js';
import globals from 'globals';

// Game logic that also runs in Node (tests, the dev server): no DOM.
const NO_DOM = ['src/sim/**', 'src/maps/parse.js', 'src/editor/model.js', 'src/snapshot.js', 'src/remote-game.js'];

export default [
  { ignores: ['dist/', '.claude/'] },
  js.configs.recommended,
  { files: ['src/**/*.js'], ignores: NO_DOM, languageOptions: { globals: globals.browser } },
  { files: NO_DOM, languageOptions: { globals: globals['shared-node-browser'] } },
  { files: ['worker/**/*.js'], languageOptions: { globals: globals.worker } },
  { files: ['test/**/*.js', '*.config.js'], languageOptions: { globals: globals.node } },
  {
    // The sim is pure: same inputs → same state. No clock, no randomness, nothing from outside src/sim/.
    files: ['src/sim/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ regex: '^\\.\\./', message: 'src/sim/ imports only from src/sim/.' }] }],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'The sim is deterministic: no randomness.' },
        { object: 'Date', property: 'now', message: 'The sim is deterministic: use game.time.' },
        { object: 'performance', property: 'now', message: 'The sim is deterministic: use game.time.' },
      ],
    },
  },
  {
    rules: {
      // Size: force logic into small, named pieces.
      'max-lines-per-function': ['error', { max: 40, skipBlankLines: true, skipComments: true }],
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
      'max-params': ['error', 4],
      'complexity': ['error', 10],
      'max-depth': ['error', 3],
      'max-nested-callbacks': ['error', 3],

      // Errors fail loud.
      'no-empty': ['error', { allowEmptyCatch: false }],
      'no-unused-vars': ['error', { caughtErrors: 'all' }],

      // Boring over clever.
      'eqeqeq': ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-nested-ternary': 'error',
      'no-param-reassign': 'error',
      'no-shadow': 'error',
      'no-else-return': 'error',
      'consistent-return': 'error',
    },
  },
];
