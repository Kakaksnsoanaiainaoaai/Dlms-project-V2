import crypto from 'crypto';

/**
 * Cryptographically secure activation key generator.
 * Format: DLMS-XXXX-XXXX-XXXX
 * Uses unambiguous uppercase characters: A-Z (excluding O, I) and 2-9.
 */
const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateActivationKey(): string {
  const bytes = crypto.randomBytes(12);
  let key = 'DLMS-';
  for (let i = 0; i < 12; i++) {
    const charIndex = bytes[i] % CHARSET.length;
    key += CHARSET[charIndex];
    if (i === 3 || i === 7) {
      key += '-';
    }
  }
  return key;
}

/**
 * Normalize and SHA-256 hash an activation key for secure comparison/indexing.
 */
export function hashActivationKey(key: string): string {
  const normalized = key.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Generate cryptographically secure random session token (64 hex characters).
 */
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash password using standard scrypt with unique salt.
 */
export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return {
    hash: derivedKey.toString('hex'),
    salt,
  };
}

/**
 * Constant-time password verification against timing attacks.
 */
export function verifyPassword(password: string, storedHash: string, salt: string): boolean {
  try {
    const derivedKey = crypto.scryptSync(password, salt, 64);
    const hashBuffer = Buffer.from(storedHash, 'hex');
    if (derivedKey.length !== hashBuffer.length) {
      return false;
    }
    return crypto.timingSafeEqual(derivedKey, hashBuffer);
  } catch {
    return false;
  }
}

/**
 * Verify WebCrypto ECDSA P-256 signature against stored SPKI public key.
 * WebCrypto subtle.sign uses IEEE P1363 raw signature encoding (64 bytes).
 */
export function verifyDeviceSignature(publicKeySpkiB64: string, challenge: string, signatureB64: string): boolean {
  try {
    const pubKey = crypto.createPublicKey({
      key: Buffer.from(publicKeySpkiB64, 'base64'),
      format: 'der',
      type: 'spki',
    });

    const sigBuffer = Buffer.from(signatureB64, 'base64');
    const challengeBuffer = Buffer.from(challenge, 'utf-8');

    return crypto.verify(
      'sha256',
      challengeBuffer,
      { key: pubKey, dsaEncoding: 'ieee-p1363' },
      sigBuffer
    );
  } catch (err) {
    console.error('[Crypto] Error verifying device signature:', err);
    return false;
  }
}

/**
 * Fallback signature verification using HMAC-SHA256 for environments lacking WebCrypto.
 */
export function verifyFallbackSignature(secretToken: string, challenge: string, signatureHex: string): boolean {
  try {
    const expected = crypto.createHmac('sha256', secretToken).update(challenge).digest('hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    const sigBuffer = Buffer.from(signatureHex, 'hex');
    if (expectedBuffer.length !== sigBuffer.length) return false;
    return crypto.timingSafeEqual(expectedBuffer, sigBuffer);
  } catch {
    return false;
  }
}

/**
 * Mask an activation key for non-sensitive display (e.g. DLMS-****-****-98AA).
 */
export function maskActivationKey(keyCode: string): string {
  if (!keyCode) return 'UNKNOWN';
  const parts = keyCode.split('-');
  if (parts.length === 4) {
    return `DLMS-****-****-${parts[3]}`;
  }
  return keyCode.substring(0, 4) + '...' + keyCode.substring(Math.max(0, keyCode.length - 4));
}
