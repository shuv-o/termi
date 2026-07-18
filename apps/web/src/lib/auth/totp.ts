/**
 * TOTP Two-Factor Authentication
 *
 * Implements Time-based One-Time Password (TOTP) for 2FA.
 * Compatible with Google Authenticator, Authy, etc.
 */

import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import { randomBytes } from 'crypto';

// CONSTANTS

const TOTP_ISSUER = 'Termi';
const TOTP_ALGORITHM = 'SHA1';
const TOTP_DIGITS = 6;
const TOTP_PERIOD = 30;

// Recovery codes count
const RECOVERY_CODE_COUNT = 10;
const RECOVERY_CODE_LENGTH = 8;

/**
 * Unambiguous recovery-code alphabet: A–Z without I/O, digits 2–9. Exactly 32
 * symbols, which is what makes the `% RECOVERY_ALPHABET.length` mapping below
 * unbiased — 256 possible byte values divide evenly into 32 buckets.
 */
export const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// The zero-bias property holds only while the alphabet divides 256 evenly.
// Fail loudly at import time if someone shortens or extends it, rather than
// silently skewing every recovery code that follows.
if (256 % RECOVERY_ALPHABET.length !== 0) {
    throw new Error(
        `RECOVERY_ALPHABET must divide 256 evenly to avoid modulo bias; got length ${RECOVERY_ALPHABET.length}`,
    );
}

// TOTP FUNCTIONS

/**
 * Generate a new TOTP secret for a user
 *
 * @param email - User's email for the label
 * @returns Secret and QR code data URL
 */
export async function generateTOTPSecret(email: string): Promise<{
    secret: string;
    uri: string;
    qrCode: string;
}> {
    // Generate random secret
    const secret = new OTPAuth.Secret({ size: 20 });

    // Create TOTP object
    const totp = new OTPAuth.TOTP({
        issuer: TOTP_ISSUER,
        label: email,
        algorithm: TOTP_ALGORITHM,
        digits: TOTP_DIGITS,
        period: TOTP_PERIOD,
        secret,
    });

    // Get the otpauth:// URI for QR code
    const uri = totp.toString();

    // Generate QR code as data URL
    const qrCode = await QRCode.toDataURL(uri, {
        width: 256,
        margin: 2,
        color: {
            dark: '#000000',
            light: '#ffffff',
        },
    });

    return {
        secret: secret.base32,
        uri,
        qrCode,
    };
}

/**
 * Verify a TOTP code
 *
 * @param secret - The user's TOTP secret (base32)
 * @param code - The code to verify
 * @param window - Number of periods to check before/after (default 1)
 * @returns true if code is valid
 */
export function verifyTOTP(secret: string, code: string, window: number = 1): boolean {
    try {
        const totp = new OTPAuth.TOTP({
            algorithm: TOTP_ALGORITHM,
            digits: TOTP_DIGITS,
            period: TOTP_PERIOD,
            secret: OTPAuth.Secret.fromBase32(secret),
        });

        // Validate returns delta (how many periods off) or null
        const delta = totp.validate({
            token: code,
            window,
        });

        return delta !== null;
    } catch {
        return false;
    }
}

/**
 * Generate recovery codes for backup access
 * These should be stored hashed, not in plain text
 */
export function generateRecoveryCodes(): string[] {
    const codes: string[] = [];

    for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
        // Draw exactly RECOVERY_CODE_LENGTH characters so the code is always
        // well-formed (the old base64url-strip approach yielded 5–6 chars).
        const bytes = randomBytes(RECOVERY_CODE_LENGTH);
        let code = '';
        for (let j = 0; j < RECOVERY_CODE_LENGTH; j++) {
            // Unbiased: 256 % 32 === 0, enforced by the guard above.
            code += RECOVERY_ALPHABET[bytes[j] % RECOVERY_ALPHABET.length];
        }
        // Format: XXXX-XXXX
        codes.push(`${code.slice(0, 4)}-${code.slice(4, RECOVERY_CODE_LENGTH)}`);
    }

    return codes;
}

/**
 * Format a recovery code for comparison
 */
export function normalizeRecoveryCode(code: string): string {
    return code.replace(/[-\s]/g, '').toUpperCase();
}
