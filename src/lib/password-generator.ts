/**
 * Secure Password Generator
 *
 * Generates cryptographically random passwords that comply with
 * Windows default password complexity requirements:
 *
 *   - Minimum 12 characters (our default: 16)
 *   - At least 1 uppercase letter   (A-Z)
 *   - At least 1 lowercase letter   (a-z)
 *   - At least 1 digit              (0-9)
 *   - At least 1 special character  (!@#$%^&*_+-=)
 *
 * This ensures the generated password is valid across all operating
 * systems (Linux, Windows, BSD) without modification.
 *
 * Uses `crypto.getRandomValues()` for cryptographic randomness.
 */

const UPPERCASE = "ABCDEFGHJKLMNPQRSTUVWXYZ";     // Excludes I, O (ambiguous)
const LOWERCASE = "abcdefghjkmnpqrstuvwxyz";       // Excludes i, l, o (ambiguous)
const DIGITS    = "23456789";                       // Excludes 0, 1 (ambiguous)
const SPECIALS  = "!@#$%^&*_+-=";
const ALL_CHARS = UPPERCASE + LOWERCASE + DIGITS + SPECIALS;

/**
 * Generate a secure random password compliant with Windows complexity.
 *
 * @param length - Password length (default: 16, minimum: 12)
 * @returns A password string guaranteed to contain all 4 character classes
 */
export function generateSecurePassword(length = 16): string {
    const effectiveLength = Math.max(length, 12);

    // Guarantee at least one of each required class
    const mandatory = [
        randomChar(UPPERCASE),
        randomChar(LOWERCASE),
        randomChar(DIGITS),
        randomChar(SPECIALS),
    ];

    // Fill remaining positions with random chars from the full set
    const remaining = effectiveLength - mandatory.length;
    const filler: string[] = [];
    for (let i = 0; i < remaining; i++) {
        filler.push(randomChar(ALL_CHARS));
    }

    // Combine and shuffle to avoid predictable positions
    const combined = [...mandatory, ...filler];
    shuffleArray(combined);

    return combined.join("");
}

/**
 * Validate that a password meets Windows complexity requirements.
 *
 * @returns An object with `valid` boolean and optional `reason` string
 */
export function validatePasswordComplexity(
    password: string
): { valid: boolean; reason?: string } {
    if (password.length < 8) {
        return { valid: false, reason: "Password must be at least 8 characters." };
    }

    let classCount = 0;
    if (/[A-Z]/.test(password)) classCount++;
    if (/[a-z]/.test(password)) classCount++;
    if (/[0-9]/.test(password)) classCount++;
    if (/[^A-Za-z0-9]/.test(password)) classCount++;

    if (classCount < 3) {
        return {
            valid: false,
            reason: "Password must contain at least 3 of: uppercase, lowercase, digit, special character.",
        };
    }

    return { valid: true };
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

/** Pick a single random character from a character set. */
function randomChar(charset: string): string {
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    return charset[array[0] % charset.length];
}

/** Fisher-Yates shuffle (in-place, cryptographically random). */
function shuffleArray(arr: string[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
        const array = new Uint32Array(1);
        crypto.getRandomValues(array);
        const j = array[0] % (i + 1);
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}
