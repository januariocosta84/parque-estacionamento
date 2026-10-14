import expoConfig from 'eslint-config-expo/flat.js';
import base from '../../eslint.config.base.mjs';

export default [
  ...base,
  ...expoConfig,
  // Metro loads its config with require(), so it stays CommonJS.
  { files: ['metro.config.js'], rules: { '@typescript-eslint/no-require-imports': 'off' } },
];
