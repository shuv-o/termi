import { expect, test } from '@playwright/test';
import { BASE } from './env';
import { signInPage } from './helpers';

/**
 * A fake USB console cable: a "router" that echoes what it receives and
 * prints a prompt after each Enter. Installed before the page loads, as the
 * Web Serial API the console uses.
 */
function installFakeSerial() {
    const enc = new TextEncoder();
    const dec = new TextDecoder();
    const w = window as unknown as {
        __serial: { opened?: unknown; written: string; signals: unknown[]; closed: boolean };
    };
    w.__serial = { written: '', signals: [], closed: false };
    class FakePort {
        readable: ReadableStream<Uint8Array> | null = null;
        writable: WritableStream<Uint8Array> | null = null;
        private ctrl: ReadableStreamDefaultController<Uint8Array> | null = null;
        async open(options: unknown) {
            w.__serial.opened = options;
            this.readable = new ReadableStream({
                start: (c) => {
                    this.ctrl = c;
                    c.enqueue(enc.encode('\r\nRouter> '));
                },
            });
            this.writable = new WritableStream({
                write: (chunk) => {
                    const text = dec.decode(chunk);
                    w.__serial.written += text;
                    this.ctrl?.enqueue(text.includes('\r') ? enc.encode('\r\nRouter> ') : chunk);
                },
            });
        }
        async close() {
            w.__serial.closed = true;
        }
        async setSignals(s: unknown) {
            w.__serial.signals.push(s);
        }
        getInfo() {
            return {};
        }
    }
    Object.defineProperty(navigator, 'serial', {
        configurable: true,
        value: {
            requestPort: async () => new FakePort(),
            addEventListener() {},
            removeEventListener() {},
        },
    });
}

test('the serial console opens a device with the chosen settings and talks to it', async ({
    page,
}) => {
    await page.addInitScript(installFakeSerial);
    await signInPage(page, 'alice');
    await page.goto(`${BASE}/panel/serial`);
    await page.getByLabel('Baud rate').selectOption('115200');
    await page.getByLabel('Parity').selectOption('even');
    await page.getByRole('button', { name: 'Connect' }).click();

    const screen = page.getByTestId('serial-terminal').locator('.xterm-rows');
    await expect(screen).toContainText('Connected at 115200 baud (8E1)');
    await expect(screen).toContainText('Router>');
    expect(
        await page.evaluate(
            () => (window as never as { __serial: { opened: unknown } }).__serial.opened,
        ),
    ).toMatchObject({
        baudRate: 115200,
        parity: 'even',
        dataBits: 8,
        stopBits: 1,
    });
    // Settings can't change under an open connection.
    await expect(page.getByLabel('Baud rate')).toBeDisabled();

    await page.getByTestId('serial-terminal').click();
    await page.keyboard.type('show version');
    await page.keyboard.press('Enter');
    await expect(screen).toContainText('show version');
    expect(
        await page.evaluate(
            () => (window as never as { __serial: { written: string } }).__serial.written,
        ),
    ).toBe('show version\r');

    await page.getByRole('button', { name: 'Break' }).click();
    await expect
        .poll(() =>
            page.evaluate(
                () => (window as never as { __serial: { signals: unknown[] } }).__serial.signals,
            ),
        )
        .toEqual([{ break: true }, { break: false }]);

    await page.getByRole('button', { name: 'Disconnect' }).click();
    await expect(screen).toContainText('Disconnected.');
    expect(
        await page.evaluate(
            () => (window as never as { __serial: { closed: boolean } }).__serial.closed,
        ),
    ).toBe(true);
});

test('browsers without Web Serial get a clear explanation', async ({ page }) => {
    await page.addInitScript(() => {
        // Hide the API (as in Firefox or Safari).
        delete (Navigator.prototype as unknown as { serial?: unknown }).serial;
    });
    await signInPage(page, 'alice');
    await page.goto(`${BASE}/panel/serial`);
    await expect(page.getByText(/need Chrome, Edge or the Termi desktop app/)).toBeVisible();
});
