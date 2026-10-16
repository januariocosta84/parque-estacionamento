import expoConfig from 'eslint-config-expo/flat.js';
import base from '../../eslint.config.base.mjs';

export default [
  ...base,
  ...expoConfig,
  // Metro and Expo config plugins are loaded with require(), so they stay CommonJS.
  {
    files: ['metro.config.js', 'plugins/*.js'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
];
