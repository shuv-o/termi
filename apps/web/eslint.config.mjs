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
    // The React Compiler rules (eslint-plugin-react-hooks v6, pulled in by
    // Next 16's flat config) only apply when the React Compiler is enabled,
    // which this project does not use. They flag intentional patterns here —
    // prop-sync effects, dynamic icon-component lookups, a self-scheduling
    // reconnect callback, and reads of stable refs during render — so they
    // are turned off rather than maintained as perpetual warnings.
    rules: {
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/static-components': 'off',
      'react-hooks/immutability': 'off',
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
