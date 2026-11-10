// Writes dist/latest-mac.yml for the macOS DMGs.
//
// macOS builds can't self-update (unsigned), and from 1.2.1 the app asks
// GitHub's API for the latest release instead. Apps up to 1.2.0 still look
// for latest-mac.yml, though, and fail their update check without it, so
// every release keeps publishing one: it only tells them a newer version
// exists, and they send the user to the download page.
import { createHash } from 'crypto';
import { createReadStream, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';

const dist = 'dist';
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const dmgs = readdirSync(dist).filter((f) => f.endsWith('.dmg') && f.includes(version));
if (dmgs.length === 0) throw new Error(`No ${version} DMGs in ${dist}`);

const sha512 = (file) =>
    new Promise((resolve, reject) => {
        const hash = createHash('sha512');
        createReadStream(file)
            .on('data', (d) => hash.update(d))
            .on('end', () => resolve(hash.digest('base64')))
            .on('error', reject);
    });

const files = [];
for (const name of dmgs.sort()) {
    const file = join(dist, name);
    files.push({ url: name, sha512: await sha512(file), size: statSync(file).size });
}
// The Intel DMG (no arch suffix) is the default; arm64 otherwise.
const main = files.find((f) => !f.url.includes('arm64')) ?? files[0];

const yml = [
    `version: ${version}`,
    'files:',
    ...files.flatMap((f) => [`  - url: ${f.url}`, `    sha512: ${f.sha512}`, `    size: ${f.size}`]),
    `path: ${main.url}`,
    `sha512: ${main.sha512}`,
    `releaseDate: '${new Date().toISOString()}'`,
    '',
].join('\n');
writeFileSync(join(dist, 'latest-mac.yml'), yml);
console.log(yml);
