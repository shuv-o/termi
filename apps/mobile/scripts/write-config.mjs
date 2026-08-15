// Writes apps/mobile/build-config.json with the server URL baked at build time.
// Mirrors the Electron `build:electron:config` step.
//   TERMIX_REMOTE_URL=https://your.server npm run config --workspace=apps/mobile
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url)); // apps/mobile/scripts
const out = join(dir, '..', 'build-config.json');
const remoteUrl = process.env.TERMIX_REMOTE_URL || 'https://termix.run';

writeFileSync(out, JSON.stringify({remoteUrl}, null, 2) + '\n');
console.log(`[mobile] build-config.json → ${remoteUrl}`);
