import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/', '.claude/'] },
  js.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.worker, ...globals.node },
    },
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
