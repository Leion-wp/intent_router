import * as crypto from 'crypto';

/**
 * Generates a cryptographically secure nonce (alphanumeric).
 * Suitable for CSP nonces.
 */
export function generateSecureNonce(): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    // Generate 32 bytes of random data.
    const bytes = crypto.randomBytes(32);
    for (let i = 0; i < 32; i++) {
        result += charset[bytes[i] % charset.length];
    }
    return result;
}

/**
 * Validates that a string does not contain malicious characters for a file path.
 * throws Error if invalid.
 */
export function validateCwdString(cwd: string): void {
    const forbidden = ['"', '\n', '\r', '`', '$'];
    const found = forbidden.filter(char => cwd.includes(char));
    if (found.length > 0) {
        throw new Error(`Security Error: cwd contains forbidden characters: ${found.map(c => JSON.stringify(c)).join(', ')}`);
    }
}

/**
 * Generates a trace ID consisting of a timestamp and a secure random hex suffix.
 */
export function generateSecureTraceId(): string {
    // 4 bytes = 8 hex chars. Matches original approx length.
    const rand = crypto.randomBytes(4).toString('hex');
    return `${Date.now().toString(16)}-${rand}`;
}

/**
 * Generates a secure random token (alphanumeric lowercase).
 * @param length Length of the token.
 */
export function generateSecureToken(length: number = 8): string {
    const charset = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    const bytes = crypto.randomBytes(length);
    for (let i = 0; i < length; i++) {
        result += charset[bytes[i] % charset.length];
    }
    return result;
}
