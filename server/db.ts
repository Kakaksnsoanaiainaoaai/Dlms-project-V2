import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  generateActivationKey,
  hashActivationKey,
  hashPassword,
  verifyPassword,
  verifyDeviceSignature,
  verifyFallbackSignature,
  maskActivationKey,
} from './crypto-utils';

export type KeyStatus = 'UNUSED' | 'USED' | 'REVOKED';
export type SessionStatus = 'ACTIVE' | 'REVOKED' | 'EXPIRED';
export type UserRole = 'user' | 'admin';
export type DeviceStatus = 'ACTIVE' | 'REVOKED';

export interface DeviceRecord {
  id: string; // Server-generated random secure identifier (e.g. dev_...)
  keyId: string; // ID of the activation key
  keyCodeMasked: string; // DLMS-****-****-XXXX
  publicKeySpki: string; // SPKI Base64 or fallback secret public id
  credentialType: 'ECDSA_P256' | 'FALLBACK_TOKEN';
  status: DeviceStatus;
  createdAt: string;
  activatedAt: string;
  lastSeen: string;
  revokedAt: string | null;
  userAgentSnippet?: string;
  activeSessionId?: string | null;
}

export interface ActivationKeyRecord {
  id: string;
  keyCode: string;
  keyHash: string;
  status: KeyStatus;
  createdAt: string;
  activatedAt: string | null;
  userId: string | null;
  deviceId: string | null;
  boundDeviceId: string | null; // Explicit server-side device binding
  revokedAt: string | null;
}

export interface SessionRecord {
  id: string;
  token: string;
  userId: string;
  role: UserRole;
  deviceId: string;
  createdAt: string;
  expiresAt: string;
  lastSeen: string;
  status: SessionStatus;
  ip?: string;
  userAgent?: string;
}

export interface AdminRecord {
  username: string;
  passwordHash: string;
  salt: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogRecord {
  id: string;
  timestamp: string;
  action: string;
  actor: string;
  result: 'SUCCESS' | 'FAILED';
  details: string;
  ip: string;
}

interface DatabaseSchema {
  version: number;
  admin: AdminRecord;
  keys: ActivationKeyRecord[];
  devices: DeviceRecord[];
  sessions: SessionRecord[];
  auditLogs: AuditLogRecord[];
}

interface DeviceChallenge {
  deviceId: string;
  challenge: string;
  expiresAt: number;
}

export class SecurityDatabase {
  private dbPath: string;
  private data: DatabaseSchema;
  private challenges: Map<string, DeviceChallenge> = new Map();

  constructor() {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.dbPath = path.join(dataDir, 'security_db.json');
    this.data = this.loadOrCreate();

    // Clean up expired challenges every 2 minutes
    setInterval(() => {
      const now = Date.now();
      for (const [key, ch] of this.challenges.entries()) {
        if (now > ch.expiresAt) {
          this.challenges.delete(key);
        }
      }
    }, 2 * 60 * 1000).unref();
  }

  private loadOrCreate(): DatabaseSchema {
    if (fs.existsSync(this.dbPath)) {
      try {
        const raw = fs.readFileSync(this.dbPath, 'utf-8');
        const parsed = JSON.parse(raw);

        // Safe migration to Version 2 (Device Binding V2)
        let modified = false;
        if (!Array.isArray(parsed.devices)) {
          parsed.devices = [];
          modified = true;
        }

        if (Array.isArray(parsed.keys)) {
          parsed.keys.forEach((k: ActivationKeyRecord) => {
            if (k.boundDeviceId === undefined) {
              k.boundDeviceId = k.deviceId || null;
              modified = true;
            }
          });
        }

        if (parsed.version < 2) {
          parsed.version = 2;
          modified = true;
        }

        if (modified) {
          this.persistSync(parsed);
          console.log('[DB] Safely migrated database schema to Version 2 (Device Binding V2)');
        }

        return parsed;
      } catch (err) {
        console.error('[DB] Failed to parse existing database, creating backup and reinitializing', err);
        try {
          fs.renameSync(this.dbPath, `${this.dbPath}.bak.${Date.now()}`);
        } catch {}
      }
    }

    // Seed initial admin
    const initialAdminUser = process.env.ADMIN_USERNAME || 'admin';
    const initialAdminPass = process.env.ADMIN_INITIAL_PASSWORD || 'Admin@DLMS2026!';
    const { hash, salt } = hashPassword(initialAdminPass);

    const initialKeys: ActivationKeyRecord[] = [];
    const now = new Date().toISOString();

    // Pre-generate 3 initial activation keys for immediate testing
    for (let i = 0; i < 3; i++) {
      const keyCode = generateActivationKey();
      initialKeys.push({
        id: crypto.randomUUID(),
        keyCode,
        keyHash: hashActivationKey(keyCode),
        status: 'UNUSED',
        createdAt: now,
        activatedAt: null,
        userId: null,
        deviceId: null,
        boundDeviceId: null,
        revokedAt: null,
      });
    }

    const initialSchema: DatabaseSchema = {
      version: 2,
      admin: {
        username: initialAdminUser,
        passwordHash: hash,
        salt,
        createdAt: now,
        updatedAt: now,
      },
      keys: initialKeys,
      devices: [],
      sessions: [],
      auditLogs: [
        {
          id: crypto.randomUUID(),
          timestamp: now,
          action: 'SYSTEM_INITIALIZED',
          actor: 'system',
          result: 'SUCCESS',
          details: `Security database seeded with admin '${initialAdminUser}' and Device Binding V2 schema`,
          ip: '127.0.0.1',
        },
      ],
    };

    this.persistSync(initialSchema);
    console.log(`[DB] Initialized database with admin '${initialAdminUser}' and 3 initial keys`);
    return initialSchema;
  }

  private persistSync(dataToSave: DatabaseSchema): void {
    const tempPath = `${this.dbPath}.tmp.${Date.now()}`;
    try {
      fs.writeFileSync(tempPath, JSON.stringify(dataToSave, null, 2), 'utf-8');
      fs.renameSync(tempPath, this.dbPath);
    } catch (err) {
      console.error('[DB] Error writing database to disk:', err);
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch {}
    }
  }

  public save(): void {
    this.persistSync(this.data);
  }

  // --- Audit Log Methods ---
  public logAudit(action: string, actor: string, result: 'SUCCESS' | 'FAILED', details: string, ip: string = 'unknown'): void {
    const record: AuditLogRecord = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      action,
      actor,
      result,
      details,
      ip,
    };
    // Prepend newest first
    this.data.auditLogs.unshift(record);
    // Keep max 500 logs to maintain fast performance
    if (this.data.auditLogs.length > 500) {
      this.data.auditLogs = this.data.auditLogs.slice(0, 500);
    }
    this.save();
  }

  public getAuditLogs(limit: number = 100): AuditLogRecord[] {
    return this.data.auditLogs.slice(0, limit);
  }

  // --- Admin Authentication Methods ---
  public verifyAdminCredentials(username: string, pass: string): boolean {
    if (!this.data.admin) return false;
    if (username.trim().toLowerCase() !== this.data.admin.username.toLowerCase()) {
      return false;
    }
    return verifyPassword(pass, this.data.admin.passwordHash, this.data.admin.salt);
  }

  public getAdminInfo(): { username: string; updatedAt: string } {
    return {
      username: this.data.admin.username,
      updatedAt: this.data.admin.updatedAt,
    };
  }

  public changeAdminPassword(oldPass: string, newPass: string, ip: string = 'unknown'): { success: boolean; error?: string } {
    if (!this.verifyAdminCredentials(this.data.admin.username, oldPass)) {
      this.logAudit('ADMIN_PASSWORD_CHANGED', this.data.admin.username, 'FAILED', 'Current password verification failed', ip);
      return { success: false, error: 'Current password incorrect' };
    }

    if (!newPass || newPass.length < 8) {
      return { success: false, error: 'New password must be at least 8 characters long' };
    }

    const { hash, salt } = hashPassword(newPass);
    this.data.admin.passwordHash = hash;
    this.data.admin.salt = salt;
    this.data.admin.updatedAt = new Date().toISOString();

    // Revoke all existing admin sessions for security
    this.data.sessions.forEach((s) => {
      if (s.role === 'admin' && s.status === 'ACTIVE') {
        s.status = 'REVOKED';
      }
    });

    this.save();
    this.logAudit('ADMIN_PASSWORD_CHANGED', this.data.admin.username, 'SUCCESS', 'Admin password changed and previous admin sessions invalidated', ip);
    return { success: true };
  }

  // --- Activation Key & Device Binding Methods ---

  /**
   * Atomic Single-Use Key Activation & Device Binding V2.
   * Guarantees that two concurrent requests for the same key cannot both succeed.
   * Enforces that once a key is used, it is bound to the first device and rejected on any other device.
   */
  public activateKey(
    rawKey: string,
    devicePublicKey: string,
    credentialType: 'ECDSA_P256' | 'FALLBACK_TOKEN' = 'ECDSA_P256',
    userAgentSnippet: string = '',
    ip: string = 'unknown'
  ): { success: boolean; error?: string; session?: SessionRecord; device?: DeviceRecord } {
    const keyHash = hashActivationKey(rawKey);
    const keyRecord = this.data.keys.find((k) => k.keyHash === keyHash);

    if (!keyRecord) {
      this.logAudit('KEY_ACTIVATION_ATTEMPT', 'anonymous', 'FAILED', 'Invalid key attempt', ip);
      return { success: false, error: 'INVALID ACTIVATION KEY' };
    }

    if (keyRecord.status === 'REVOKED') {
      this.logAudit('KEY_ACTIVATION_ATTEMPT', 'anonymous', 'FAILED', `Revoked key: ${keyRecord.keyCode}`, ip);
      return { success: false, error: 'KEY REVOKED' };
    }

    if (keyRecord.status === 'USED' || keyRecord.boundDeviceId) {
      this.logAudit(
        'KEY_ACTIVATION_ATTEMPT',
        'anonymous',
        'FAILED',
        `Key ${keyRecord.keyCode} already bound to device ${keyRecord.boundDeviceId || keyRecord.deviceId}`,
        ip
      );
      // Strictly safe rejection message without leaking internal database IDs
      return { success: false, error: 'Activation key sudah terikat ke perangkat lain.' };
    }

    // Atomic Enrollment of Device & Key Binding
    const now = new Date();
    const deviceId = `dev_${crypto.randomBytes(12).toString('hex')}`;
    const userId = `user_${crypto.randomBytes(4).toString('hex')}`;

    // Create Device Binding Record
    const device: DeviceRecord = {
      id: deviceId,
      keyId: keyRecord.id,
      keyCodeMasked: maskActivationKey(keyRecord.keyCode),
      publicKeySpki: devicePublicKey || `fallback_${deviceId}`,
      credentialType,
      status: 'ACTIVE',
      createdAt: now.toISOString(),
      activatedAt: now.toISOString(),
      lastSeen: now.toISOString(),
      revokedAt: null,
      userAgentSnippet: userAgentSnippet ? userAgentSnippet.slice(0, 120) : 'Browser Client',
      activeSessionId: null,
    };

    // Bind Key to this Device
    keyRecord.status = 'USED';
    keyRecord.activatedAt = now.toISOString();
    keyRecord.userId = userId;
    keyRecord.deviceId = deviceId;
    keyRecord.boundDeviceId = deviceId;

    // Create Authenticated Session (valid for 30 days)
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const session: SessionRecord = {
      id: crypto.randomUUID(),
      token,
      userId,
      role: 'user',
      deviceId,
      createdAt: now.toISOString(),
      expiresAt,
      lastSeen: now.toISOString(),
      status: 'ACTIVE',
      ip: ip !== 'unknown' ? ip : '127.0.0.1',
      userAgent: userAgentSnippet ? userAgentSnippet.slice(0, 150) : 'Web Audio Client',
    };

    device.activeSessionId = session.id;

    this.data.devices.unshift(device);
    this.data.sessions.unshift(session);
    this.save();

    this.logAudit(
      'KEY_ACTIVATED',
      userId,
      'SUCCESS',
      `Key ${keyRecord.keyCode} activated and bound to device ${deviceId}`,
      ip
    );
    this.logAudit(
      'DEVICE_ENROLLED',
      userId,
      'SUCCESS',
      `Device ${deviceId} enrolled with credential ${credentialType}`,
      ip
    );

    return { success: true, session, device };
  }

  /**
   * Device Challenge Generation for Re-authentication.
   */
  public createChallenge(deviceId: string): { success: boolean; challenge?: string; error?: string } {
    if (!deviceId) return { success: false, error: 'DEVICE_ID_REQUIRED' };

    const device = this.data.devices.find((d) => d.id === deviceId);
    if (!device) {
      return { success: false, error: 'DEVICE_NOT_FOUND' };
    }

    if (device.status === 'REVOKED') {
      return { success: false, error: 'DEVICE_REVOKED' };
    }

    // 32-byte cryptographically secure random challenge nonce
    const challenge = crypto.randomBytes(32).toString('hex');
    // Valid for 2 minutes
    this.challenges.set(challenge, {
      deviceId,
      challenge,
      expiresAt: Date.now() + 2 * 60 * 1000,
    });

    return { success: true, challenge };
  }

  /**
   * Device Cryptographic Re-authentication.
   */
  public authenticateDevice(
    deviceId: string,
    challenge: string,
    signature: string,
    ip: string = 'unknown'
  ): { success: boolean; error?: string; session?: SessionRecord; device?: DeviceRecord } {
    if (!deviceId || !challenge || !signature) {
      return { success: false, error: 'MISSING_CREDENTIALS' };
    }

    const challengeData = this.challenges.get(challenge);
    // Single-use challenge: delete immediately to prevent replay attacks
    this.challenges.delete(challenge);

    if (!challengeData || challengeData.deviceId !== deviceId || Date.now() > challengeData.expiresAt) {
      this.logAudit('DEVICE_AUTH_FAILED', deviceId, 'FAILED', 'Invalid or expired challenge nonce', ip);
      return { success: false, error: 'CHALLENGE_EXPIRED_OR_INVALID' };
    }

    const device = this.data.devices.find((d) => d.id === deviceId);
    if (!device) {
      this.logAudit('DEVICE_AUTH_FAILED', deviceId, 'FAILED', 'Device not found', ip);
      return { success: false, error: 'DEVICE_NOT_FOUND' };
    }

    if (device.status === 'REVOKED') {
      this.logAudit('DEVICE_AUTH_FAILED', deviceId, 'FAILED', 'Attempt to authenticate revoked device', ip);
      return { success: false, error: 'DEVICE_REVOKED' };
    }

    // Check if associated key was revoked by admin
    const keyRecord = this.data.keys.find((k) => k.id === device.keyId);
    if (keyRecord && keyRecord.status === 'REVOKED') {
      this.logAudit('DEVICE_AUTH_FAILED', deviceId, 'FAILED', `Key ${keyRecord.keyCode} is revoked`, ip);
      return { success: false, error: 'KEY_REVOKED' };
    }

    // Verify Signature
    let isValidSignature = false;
    if (device.credentialType === 'ECDSA_P256') {
      isValidSignature = verifyDeviceSignature(device.publicKeySpki, challenge, signature);
    } else {
      isValidSignature = verifyFallbackSignature(device.publicKeySpki, challenge, signature);
    }

    if (!isValidSignature) {
      this.logAudit('DEVICE_AUTH_FAILED', deviceId, 'FAILED', 'Cryptographic signature verification failed', ip);
      return { success: false, error: 'SIGNATURE_INVALID' };
    }

    // Signature verified! Generate fresh authenticated session
    const now = new Date();
    const userId = keyRecord?.userId || `user_${device.id.substring(4, 12)}`;
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const session: SessionRecord = {
      id: crypto.randomUUID(),
      token,
      userId,
      role: 'user',
      deviceId: device.id,
      createdAt: now.toISOString(),
      expiresAt,
      lastSeen: now.toISOString(),
      status: 'ACTIVE',
      ip: ip !== 'unknown' ? ip : '127.0.0.1',
      userAgent: device.userAgentSnippet ? device.userAgentSnippet.slice(0, 150) : 'Enrolled Hardware Device',
    };

    // Update device state
    device.lastSeen = now.toISOString();
    device.activeSessionId = session.id;

    this.data.sessions.unshift(session);
    this.save();

    this.logAudit(
      'DEVICE_LOGIN',
      userId,
      'SUCCESS',
      `Device ${device.id} logged in via cryptographic proof`,
      ip
    );

    return { success: true, session, device };
  }

  // --- Device Management & Admin Actions ---

  public getDevices(limit: number = 100) {
    const now = new Date();
    return this.data.devices.slice(0, limit).map((d) => {
      const hasActiveSession = this.data.sessions.some(
        (s) => s.deviceId === d.id && s.status === 'ACTIVE' && new Date(s.expiresAt) > now
      );
      return {
        id: d.id,
        keyId: d.keyId,
        keyCodeMasked: d.keyCodeMasked,
        credentialType: d.credentialType,
        status: d.status,
        createdAt: d.createdAt,
        activatedAt: d.activatedAt,
        lastSeen: d.lastSeen,
        revokedAt: d.revokedAt,
        userAgentSnippet: d.userAgentSnippet,
        activeSessionId: d.activeSessionId,
        hasActiveSession,
      };
    });
  }

  public revokeDevice(deviceId: string, adminUser: string, ip: string = 'unknown'): boolean {
    const device = this.data.devices.find((d) => d.id === deviceId);
    if (!device) return false;

    device.status = 'REVOKED';
    device.revokedAt = new Date().toISOString();

    // Revoke all active sessions belonging to this device
    this.data.sessions.forEach((s) => {
      if (s.deviceId === deviceId && s.status === 'ACTIVE') {
        s.status = 'REVOKED';
      }
    });

    this.save();
    this.logAudit('DEVICE_REVOKED', adminUser, 'SUCCESS', `Admin revoked device ${deviceId} and associated sessions`, ip);
    return true;
  }

  /**
   * Device Recovery: Admin explicitly resets binding on a device and frees the activation key
   * for legitimate re-enrollment on user's new device.
   */
  public resetDeviceBinding(
    deviceId: string,
    adminUser: string,
    ip: string = 'unknown'
  ): { success: boolean; error?: string; message?: string } {
    const device = this.data.devices.find((d) => d.id === deviceId);
    if (!device) {
      return { success: false, error: 'Device not found' };
    }

    // 1. Permanently revoke the old device
    device.status = 'REVOKED';
    device.revokedAt = new Date().toISOString();

    // 2. Invalidate old device sessions
    this.data.sessions.forEach((s) => {
      if (s.deviceId === deviceId && s.status === 'ACTIVE') {
        s.status = 'REVOKED';
      }
    });

    // 3. Reset associated key so user can enroll their new hardware
    const key = this.data.keys.find((k) => k.id === device.keyId);
    if (key) {
      key.status = 'UNUSED';
      key.boundDeviceId = null;
      key.deviceId = null;
      key.userId = null;
      key.activatedAt = null;
    }

    this.save();
    this.logAudit(
      'DEVICE_BINDING_RESET',
      adminUser,
      'SUCCESS',
      `Admin reset binding for device ${deviceId}. Key ${key ? key.keyCode : 'N/A'} is now authorized for new device binding.`,
      ip
    );

    return {
      success: true,
      message: `Device ${deviceId} revoked. Activation key has been unlocked for authorized re-binding.`,
    };
  }

  public generateKeys(count: number, adminUser: string, ip: string = 'unknown'): ActivationKeyRecord[] {
    const safeCount = Math.max(1, Math.min(100, Math.floor(count || 1)));
    const now = new Date().toISOString();
    const newKeys: ActivationKeyRecord[] = [];

    for (let i = 0; i < safeCount; i++) {
      const keyCode = generateActivationKey();
      const record: ActivationKeyRecord = {
        id: crypto.randomUUID(),
        keyCode,
        keyHash: hashActivationKey(keyCode),
        status: 'UNUSED',
        createdAt: now,
        activatedAt: null,
        userId: null,
        deviceId: null,
        boundDeviceId: null,
        revokedAt: null,
      };
      this.data.keys.unshift(record);
      newKeys.push(record);
    }

    this.save();
    this.logAudit('KEY_GENERATED', adminUser, 'SUCCESS', `Generated ${safeCount} activation key(s)`, ip);
    return newKeys;
  }

  public getKeys(limit: number = 200): ActivationKeyRecord[] {
    return this.data.keys.slice(0, limit);
  }

  public revokeKey(keyId: string, adminUser: string, ip: string = 'unknown'): boolean {
    const key = this.data.keys.find((k) => k.id === keyId);
    if (!key) return false;

    key.status = 'REVOKED';
    key.revokedAt = new Date().toISOString();

    // Revoke any bound device
    if (key.boundDeviceId) {
      const boundDev = this.data.devices.find((d) => d.id === key.boundDeviceId);
      if (boundDev) {
        boundDev.status = 'REVOKED';
        boundDev.revokedAt = new Date().toISOString();
      }
    }

    // Revoke any active sessions associated with this key's user
    if (key.userId) {
      this.data.sessions.forEach((s) => {
        if (s.userId === key.userId && s.status === 'ACTIVE') {
          s.status = 'REVOKED';
        }
      });
    }

    this.save();
    this.logAudit('KEY_REVOKED', adminUser, 'SUCCESS', `Revoked key ${key.keyCode} and associated device & sessions`, ip);
    return true;
  }

  // --- Session Management Methods ---

  public createAdminSession(adminUser: string, deviceId: string, ip: string = 'unknown'): SessionRecord {
    const now = new Date();
    // Admin session valid for 24 hours
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const token = crypto.randomBytes(32).toString('hex');

    const session: SessionRecord = {
      id: crypto.randomUUID(),
      token,
      userId: adminUser,
      role: 'admin',
      deviceId: deviceId || 'admin_workstation',
      createdAt: now.toISOString(),
      expiresAt,
      lastSeen: now.toISOString(),
      status: 'ACTIVE',
      ip: ip !== 'unknown' ? ip : '127.0.0.1',
      userAgent: 'Admin Management Console (Web)',
    };

    this.data.sessions.unshift(session);
    this.save();
    this.logAudit('ADMIN_LOGIN', adminUser, 'SUCCESS', `Admin logged in on device ${deviceId}`, ip);
    return session;
  }

  public validateSession(token: string, ip?: string): { valid: boolean; session?: SessionRecord; error?: string } {
    if (!token) return { valid: false, error: 'NO_TOKEN' };

    const session = this.data.sessions.find((s) => s.token === token);
    if (!session) {
      return { valid: false, error: 'INVALID_SESSION' };
    }

    if (session.status === 'REVOKED') {
      return { valid: false, error: 'SESSION REVOKED' };
    }

    // If device is revoked, invalidate session
    if (session.deviceId && session.role !== 'admin') {
      const dev = this.data.devices.find((d) => d.id === session.deviceId);
      if (dev && dev.status === 'REVOKED') {
        session.status = 'REVOKED';
        this.save();
        return { valid: false, error: 'DEVICE_REVOKED' };
      }
    }

    const now = new Date();
    if (now > new Date(session.expiresAt)) {
      session.status = 'EXPIRED';
      this.save();
      return { valid: false, error: 'SESSION EXPIRED' };
    }

    // Refresh lastSeen and record client IP if available
    session.lastSeen = now.toISOString();
    if (ip && ip !== 'unknown') {
      session.ip = ip;
    }
    this.save();
    return { valid: true, session };
  }

  public revokeSession(sessionId: string, actor: string, ip: string = 'unknown'): boolean {
    const session = this.data.sessions.find((s) => s.id === sessionId);
    if (!session) return false;

    session.status = 'REVOKED';

    // Clear active session link on bound device
    if (session.deviceId) {
      const device = this.data.devices.find((d) => d.id === session.deviceId);
      if (device && device.activeSessionId === sessionId) {
        device.activeSessionId = null;
      }
    }

    this.save();
    this.logAudit('SESSION_TERMINATED', actor, 'SUCCESS', `Terminated session ${sessionId} for user ${session.userId} on device ${session.deviceId}`, ip);
    return true;
  }

  public terminateAllUserSessions(actor: string, ip: string = 'unknown'): { terminatedCount: number } {
    let count = 0;
    this.data.sessions.forEach((s) => {
      if (s.role === 'user' && s.status === 'ACTIVE') {
        s.status = 'REVOKED';
        count++;
        const device = this.data.devices.find((d) => d.id === s.deviceId);
        if (device && device.activeSessionId === s.id) {
          device.activeSessionId = null;
        }
      }
    });
    this.save();
    this.logAudit('MASS_SESSION_TERMINATION', actor, 'SUCCESS', `Admin terminated all (${count}) active user sessions`, ip);
    return { terminatedCount: count };
  }

  public getSessions(limit: number = 100) {
    const now = Date.now();
    return this.data.sessions.slice(0, limit).map((s) => {
      const linkedDevice = this.data.devices.find((d) => d.id === s.deviceId);
      const linkedKey = linkedDevice
        ? this.data.keys.find((k) => k.id === linkedDevice.keyId)
        : this.data.keys.find((k) => k.userId === s.userId || k.deviceId === s.deviceId);

      const lastSeenMs = new Date(s.lastSeen).getTime();
      const diffMs = now - lastSeenMs;
      // Online: seen in last 3 minutes and ACTIVE
      const isOnline = s.status === 'ACTIVE' && diffMs <= 3 * 60 * 1000;
      // Idle: seen in last 20 minutes and ACTIVE
      const isIdle = s.status === 'ACTIVE' && !isOnline && diffMs <= 20 * 60 * 1000;

      return {
        id: s.id,
        userId: s.userId,
        role: s.role,
        deviceId: s.deviceId,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        lastSeen: s.lastSeen,
        status: s.status,
        ip: s.ip || '127.0.0.1',
        userAgent: s.userAgent || linkedDevice?.userAgentSnippet || (s.role === 'admin' ? 'Admin Management Console' : 'Web Audio Client'),
        keyCodeMasked: linkedDevice?.keyCodeMasked || (linkedKey ? maskActivationKey(linkedKey.keyCode) : null),
        deviceStatus: linkedDevice?.status || (s.role === 'admin' ? 'ACTIVE' : 'UNKNOWN'),
        isOnline,
        isIdle,
      };
    });
  }

  public getStats() {
    const totalKeys = this.data.keys.length;
    const unused = this.data.keys.filter((k) => k.status === 'UNUSED').length;
    const used = this.data.keys.filter((k) => k.status === 'USED').length;
    const revoked = this.data.keys.filter((k) => k.status === 'REVOKED').length;

    const totalDevices = this.data.devices.length;
    const activeDevices = this.data.devices.filter((d) => d.status === 'ACTIVE').length;
    const revokedDevices = this.data.devices.filter((d) => d.status === 'REVOKED').length;

    const now = new Date();
    const activeSessions = this.data.sessions.filter(
      (s) => s.status === 'ACTIVE' && new Date(s.expiresAt) > now
    ).length;

    return {
      totalKeys,
      unused,
      used,
      revoked,
      totalDevices,
      activeDevices,
      revokedDevices,
      activeSessions,
    };
  }
}

export const securityDb = new SecurityDatabase();
