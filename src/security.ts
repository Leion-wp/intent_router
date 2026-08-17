import * as crypto from 'crypto';
import * as path from 'path';

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
 * Validates that a shell argument contains only safe characters.
 * Allowed: alphanumeric, -, _, ., /, :, @
 * Throws an error if invalid.
 */
export function validateStrictShellArg(arg: string, context: string): void {
    if (!arg) return; // Allow empty? Caller usually checks required.
    // Strict allowlist
    if (!/^[a-zA-Z0-9\-_./:@]+$/.test(arg)) {
        throw new Error(`Invalid characters in ${context}: ${arg}`);
    }
}

/**
 * Sanitizes a shell argument by escaping dangerous characters and wrapping in double quotes.
 * Escapes: " $ `
 */
export function sanitizeShellArg(arg: string): string {
    if (arg === undefined || arg === null) return '""';
    // Escape backslash, double quote, dollar, and backtick
    const escaped = arg.replace(/([\\"$`])/g, '\\$1');
    return `"${escaped}"`;
}

/**
 * Validates that a path does not escape a trusted root directory.
 * @param p The path to validate (relative or absolute).
 * @param trustedRoot The absolute path of the trusted root directory.
 * @param currentCwd The current working directory to resolve relative paths against. Defaults to trustedRoot.
 */
export function validateSafeRelativePath(p: string, trustedRoot: string, currentCwd?: string): void {
    if (!p) return;

    // Block null bytes
    if (p.includes('\0')) {
         throw new Error('Path contains null bytes');
    }

    const resolvedRoot = path.resolve(trustedRoot);
    const base = currentCwd ? path.resolve(currentCwd) : resolvedRoot;
    const target = path.resolve(base, p);

    // Ensure strict containment
    // Check for exact match or subdirectory (startsWith root + sep) to prevent partial path attacks
    // e.g. /root/safe-suffix vs /root/safe
    const rootWithSep = resolvedRoot.endsWith(path.sep) ? resolvedRoot : resolvedRoot + path.sep;
    if (target !== resolvedRoot && !target.startsWith(rootWithSep)) {
        throw new Error(`Path ${p} resolves to ${target} which is outside trusted root ${resolvedRoot}`);
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
