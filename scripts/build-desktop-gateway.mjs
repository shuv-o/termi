// Bundles the gateway into one file the desktop app runs in a utility
// process (device mode: SSH, file transfer and tunnels from this computer).
// Native add-ons are left out: ssh2 and ws fall back to pure JS, and the
// local-terminal handler (node-pty) is never used in device mode.
import { build } from 'esbuild';

await build({
    entryPoints: ['apps/gateway/src/index.ts'],
    outfile: 'apps/electron/gateway/index.mjs',
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    legalComments: 'eof',
    external: ['node-pty', 'cpu-features', 'bufferutil', 'utf-8-validate', '*.node'],
    banner: {
        js: [
            "import { createRequire as __termiCreateRequire } from 'module';",
            "import { fileURLToPath as __termiFileURLToPath } from 'url';",
            "import { dirname as __termiDirname } from 'path';",
            'const require = __termiCreateRequire(import.meta.url);',
            'const __filename = __termiFileURLToPath(import.meta.url);',
            'const __dirname = __termiDirname(__filename);',
        ].join('\n'),
    },
    logLevel: 'warning',
});
console.log('Built apps/electron/gateway/index.mjs');
