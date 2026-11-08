import { configDefaults, defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        environment: 'node',
        // e2e/ holds Playwright specs (npm run test:e2e / test:security).
        exclude: [...configDefaults.exclude, 'e2e/**'],
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
});
