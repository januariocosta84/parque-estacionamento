import nextVitals from 'eslint-config-next/core-web-vitals';
import base from '../../eslint.config.base.mjs';

// base last so the typescript-eslint parser wins over Next's babel parser
const config = [...nextVitals, ...base];

export default config;
