/**
 * Runs the read-only security scan on a server and returns its report.
 *
 * The script is piped to `sh -s` over a plain exec channel (no PTY), so it
 * never appears in a terminal session or a recording, and nothing is written
 * to the server's disk.
 */

import { sshPool, type SSHPoolConfig } from '../ssh-pool';
import { SCAN_SCRIPT } from './scan-script';
import {
    evaluateScan,
    parseScanOutput,
    ScanOutputError,
    type ScanContext,
    type SecurityReport,
} from './evaluate';

const SCAN_TIMEOUT_MS = 60_000;
const MAX_OUTPUT_BYTES = 256 * 1024;

export class ScanFailedError extends Error {}

function runScript(config: SSHPoolConfig): Promise<string> {
    return new Promise((resolve, reject) => {
        let key: string | undefined;
        let settled = false;
        const finish = (err: Error | null, output?: string) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (key) sshPool.release(key);
            if (err) reject(err);
            else resolve(output ?? '');
        };
        const timer = setTimeout(
            () => finish(new ScanFailedError('The scan timed out after 60 seconds')),
            SCAN_TIMEOUT_MS,
        );

        sshPool
            .acquire(config)
            .then(({ client, key: k }) => {
                key = k;
                client.exec('sh -s', (err, stream) => {
                    if (err) return finish(new ScanFailedError('Could not start the scan'));
                    let out = '';
                    let size = 0;
                    stream.on('data', (chunk: Buffer) => {
                        size += chunk.length;
                        if (size <= MAX_OUTPUT_BYTES) out += chunk.toString('utf8');
                    });
                    stream.stderr.on('data', () => {
                        /* individual probes are allowed to fail quietly */
                    });
                    stream.on('close', () => finish(null, out));
                    stream.on('error', () =>
                        finish(new ScanFailedError('The scan was interrupted')),
                    );
                    stream.end(SCAN_SCRIPT);
                });
            })
            .catch((err: Error) =>
                finish(new ScanFailedError(`Could not connect over SSH: ${err.message}`)),
            );
    });
}

export async function scanServer(config: SSHPoolConfig, ctx: ScanContext): Promise<SecurityReport> {
    const output = await runScript(config);
    try {
        return evaluateScan(parseScanOutput(output), ctx);
    } catch (err) {
        if (err instanceof ScanOutputError) {
            throw new ScanFailedError(
                `${err.message}. The server may not have a POSIX shell (sh), or it may not be Linux.`,
            );
        }
        throw err;
    }
}
