import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'src/app/generated/**',
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // The React Compiler rules (eslint-plugin-react-hooks v6, enabled by
    // Next 16's flat config) flag several intentional patterns here:
    // prop-sync effects, dynamic icon-component lookups, a self-scheduling
    // reconnect callback, and reads of stable refs during render. Keep them
    // visible as warnings rather than build-breaking errors.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/immutability': 'warn',
    },
  },
  {
    // `var` is the idiomatic way to declare globals in ambient .d.ts files.
    files: ['**/*.d.ts'],
    rules: {
      'no-var': 'off',
    },
  },
];

export default config;
