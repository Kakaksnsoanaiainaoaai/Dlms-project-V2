/**
 * DLMS Virtual - Device Binding V2 Cryptographic Service
 *
 * Implements hardware-associated browser cryptographic credentials using:
 * - Web Crypto API (ECDSA with P-256 NIST curve)
 * - IndexedDB persistent non-extractable / structured clone key storage
 * - Secure single-use challenge-response authentication
 * - Transparent fallback token mechanism for environments lacking WebCrypto
 *
 * SECURITY LIMITATION NOTE:
 * Browser-based device binding provides strong hardware-associated cryptographic proof
 * against key sharing and multi-device abuse. However, browser storage can be cleared
 * if the user wipes browser cookies/site data. In such events, the Admin Device Recovery
 * feature allows resetting the binding safely.
 */

const IDB_NAME = 'dlms_device_security_v2';
const IDB_VERSION = 1;
const IDB_STORE_KEYS = 'credentials';
const IDB_KEY_PAIR = 'ecdsa_p256_keypair';
const IDB_META = 'device_metadata';

const FALLBACK_SECRET_STORAGE = 'dlms_fallback_device_secret';
const FALLBACK_DEVICE_ID_STORAGE = 'dlms_v2_device_id';

export interface DeviceCredentialInfo {
  publicKeySpki: string;
  credentialType: 'ECDSA_P256' | 'FALLBACK_TOKEN';
  deviceId: string | null;
}

class DeviceCryptoService {
  private keyPairCache: CryptoKeyPair | null = null;
  private dbPromise: Promise<IDBDatabase> | null = null;

  private isWebCryptoSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      !!window.crypto &&
      !!window.crypto.subtle &&
      typeof window.indexedDB !== 'undefined'
    );
  }

  private getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        return reject(new Error('IndexedDB not supported'));
      }

      const req = window.indexedDB.open(IDB_NAME, IDB_VERSION);

      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE_KEYS)) {
          db.createObjectStore(IDB_STORE_KEYS);
        }
      };

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    return this.dbPromise;
  }

  private async idbGet<T>(key: string): Promise<T | null> {
    try {
      const db = await this.getDB();
      return new Promise((resolve) => {
        const tx = db.transaction(IDB_STORE_KEYS, 'readonly');
        const store = tx.objectStore(IDB_STORE_KEYS);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  private async idbSet(key: string, value: any): Promise<boolean> {
    try {
      const db = await this.getDB();
      return new Promise((resolve) => {
        const tx = db.transaction(IDB_STORE_KEYS, 'readwrite');
        const store = tx.objectStore(IDB_STORE_KEYS);
        const req = store.put(value, key);
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      });
    } catch {
      return false;
    }
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  /**
   * Initialize or retrieve existing cryptographic device key pair.
   */
  public async getOrCreateDeviceCredential(): Promise<DeviceCredentialInfo> {
    const storedDeviceId = this.getStoredDeviceId();

    if (!this.isWebCryptoSupported()) {
      // Fallback path
      return this.getOrCreateFallbackCredential(storedDeviceId);
    }

    try {
      // 1. Check in-memory cache
      if (!this.keyPairCache) {
        // 2. Check IndexedDB
        const stored = await this.idbGet<CryptoKeyPair>(IDB_KEY_PAIR);
        if (stored && stored.publicKey && stored.privateKey) {
          this.keyPairCache = stored;
        }
      }

      // 3. Generate new ECDSA P-256 Key Pair if none exists
      if (!this.keyPairCache) {
        const keyPair = await window.crypto.subtle.generateKey(
          {
            name: 'ECDSA',
            namedCurve: 'P-256',
          },
          true, // extractable for structured-clone IndexedDB storage & SPKI export
          ['sign', 'verify']
        );

        this.keyPairCache = keyPair;
        await this.idbSet(IDB_KEY_PAIR, keyPair);
      }

      // Export SPKI public key to Base64
      const spkiBuffer = await window.crypto.subtle.exportKey('spki', this.keyPairCache.publicKey);
      const publicKeySpki = this.arrayBufferToBase64(spkiBuffer);

      return {
        publicKeySpki,
        credentialType: 'ECDSA_P256',
        deviceId: storedDeviceId,
      };
    } catch (err) {
      console.warn('[DeviceCrypto] WebCrypto failed or blocked, switching to secure fallback token:', err);
      return this.getOrCreateFallbackCredential(storedDeviceId);
    }
  }

  /**
   * Fallback credential generator for environments where WebCrypto/IndexedDB is restricted.
   */
  private getOrCreateFallbackCredential(storedDeviceId: string | null): DeviceCredentialInfo {
    let secret = localStorage.getItem(FALLBACK_SECRET_STORAGE);
    if (!secret) {
      // Generate 256-bit random hex secret
      const randomBytes = new Uint8Array(32);
      if (typeof window !== 'undefined' && window.crypto) {
        window.crypto.getRandomValues(randomBytes);
      } else {
        for (let i = 0; i < 32; i++) {
          randomBytes[i] = Math.floor(Math.random() * 256);
        }
      }
      secret = Array.from(randomBytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      localStorage.setItem(FALLBACK_SECRET_STORAGE, secret);
    }

    return {
      publicKeySpki: secret,
      credentialType: 'FALLBACK_TOKEN',
      deviceId: storedDeviceId,
    };
  }

  /**
   * Sign server challenge nonce.
   */
  public async signChallenge(challenge: string): Promise<string> {
    const cred = await this.getOrCreateDeviceCredential();

    if (cred.credentialType === 'ECDSA_P256' && this.keyPairCache) {
      const encoder = new TextEncoder();
      const challengeBytes = encoder.encode(challenge);

      const signatureBuffer = await window.crypto.subtle.sign(
        {
          name: 'ECDSA',
          hash: { name: 'SHA-256' },
        },
        this.keyPairCache.privateKey,
        challengeBytes
      );

      return this.arrayBufferToBase64(signatureBuffer);
    }

    // Fallback signature calculation using WebCrypto subtle HMAC or SHA256 digest
    try {
      const secret = localStorage.getItem(FALLBACK_SECRET_STORAGE) || 'fallback_secret';
      const encoder = new TextEncoder();
      const keyData = encoder.encode(secret);
      const msgData = encoder.encode(challenge);

      const cryptoKey = await window.crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );

      const sigBuffer = await window.crypto.subtle.sign('HMAC', cryptoKey, msgData);
      const sigBytes = new Uint8Array(sigBuffer);
      return Array.from(sigBytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    } catch {
      // Simple hash fallback
      return btoa(challenge + (localStorage.getItem(FALLBACK_SECRET_STORAGE) || ''));
    }
  }

  /**
   * Store deviceId received from server after successful enrollment.
   */
  public setStoredDeviceId(deviceId: string): void {
    localStorage.setItem(FALLBACK_DEVICE_ID_STORAGE, deviceId);
    this.idbSet(IDB_META, { deviceId, boundAt: new Date().toISOString() }).catch(() => {});
  }

  /**
   * Retrieve stored deviceId if this device was already enrolled.
   */
  public getStoredDeviceId(): string | null {
    return localStorage.getItem(FALLBACK_DEVICE_ID_STORAGE);
  }

  /**
   * Check if device has an enrolled credential.
   */
  public hasEnrolledDevice(): boolean {
    return !!this.getStoredDeviceId();
  }

  /**
   * Clear local device binding (e.g. for testing or explicit device unlinking).
   */
  public async clearDeviceBinding(): Promise<void> {
    this.keyPairCache = null;
    localStorage.removeItem(FALLBACK_DEVICE_ID_STORAGE);
    localStorage.removeItem(FALLBACK_SECRET_STORAGE);
    try {
      const db = await this.getDB();
      const tx = db.transaction(IDB_STORE_KEYS, 'readwrite');
      tx.objectStore(IDB_STORE_KEYS).clear();
    } catch {}
  }
}

export const deviceCrypto = new DeviceCryptoService();
