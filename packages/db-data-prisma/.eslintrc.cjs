/**
 * Specific eslint rules for this package, extending the shared rules.
 */

require('@teable/eslint-config-bases/patch/modern-module-resolution');

const { getDefaultIgnorePatterns } = require('@teable/eslint-config-bases/helpers');

module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    tsconfigRootDir: __dirname,
    project: 'tsconfig.eslint.json',
  },
  ignorePatterns: [
    ...getDefaultIgnorePatterns(),
    'src/**/*.js',
    'src/**/*.d.ts',
    'src/generated/**',
  ],
  extends: [
    '@teable/eslint-config-bases/typescript',
    '@teable/eslint-config-bases/prettier-plugin',
  ],
};
