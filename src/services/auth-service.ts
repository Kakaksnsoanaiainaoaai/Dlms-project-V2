import { deviceCrypto } from './device-crypto';

export interface AuthUser {
  userId: string;
  role: 'user' | 'admin';
  deviceId?: string;
  expiresAt?: string;
}

export interface ActivationKeyData {
  id: string;
  keyCode: string;
  status: 'UNUSED' | 'USED' | 'REVOKED';
  createdAt: string;
  activatedAt: string | null;
  userId: string | null;
  deviceId: string | null;
  boundDeviceId?: string | null;
  revokedAt: string | null;
}

export interface DeviceData {
  id: string;
  keyId: string;
  keyCodeMasked: string;
  credentialType: 'ECDSA_P256' | 'FALLBACK_TOKEN';
  status: 'ACTIVE' | 'REVOKED';
  createdAt: string;
  activatedAt: string;
  lastSeen: string;
  revokedAt: string | null;
  userAgentSnippet?: string;
  activeSessionId?: string | null;
  hasActiveSession?: boolean;
}

export interface SessionData {
  id: string;
  userId: string;
  role: 'user' | 'admin';
  deviceId: string;
  createdAt: string;
  expiresAt: string;
  lastSeen: string;
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
}

export interface AuditLogData {
  id: string;
  timestamp: string;
  action: string;
  actor: string;
  result: 'SUCCESS' | 'FAILED';
  details: string;
  ip: string;
}

export interface AdminStats {
  totalKeys: number;
  unused: number;
  used: number;
  revoked: number;
  totalDevices?: number;
  activeDevices?: number;
  revokedDevices?: number;
  activeSessions: number;
}

class AuthService {
  private static TOKEN_KEY = 'dlms_auth_token';
  private static USER_KEY = 'dlms_auth_user';

  public getDeviceId(): string {
    const enrolled = deviceCrypto.getStoredDeviceId();
    if (enrolled) return enrolled;
    return 'dev_pending';
  }

  public getToken(): string | null {
    return localStorage.getItem(AuthService.TOKEN_KEY);
  }

  public getStoredUser(): AuthUser | null {
    const raw = localStorage.getItem(AuthService.USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  public setSession(token: string, user: AuthUser): void {
    localStorage.setItem(AuthService.TOKEN_KEY, token);
    localStorage.setItem(AuthService.USER_KEY, JSON.stringify(user));
  }

  /**
   * Safely clears only auth tokens without wiping presets or audio settings.
   */
  public clearSession(): void {
    localStorage.removeItem(AuthService.TOKEN_KEY);
    localStorage.removeItem(AuthService.USER_KEY);
  }

  /**
   * Verify existing session with the server, with seamless cryptographic auto-login
   * if session is expired but device is bound and active.
   */
  public async checkSession(): Promise<{ valid: boolean; user?: AuthUser; error?: string }> {
    const token = this.getToken();

    if (token) {
      try {
        const res = await fetch('/api/auth/session', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (res.ok) {
          const data = await res.json();
          if (data.valid && data.user) {
            this.setSession(token, data.user);
            return { valid: true, user: data.user };
          }
        } else if (res.status === 401) {
          this.clearSession();
        }
      } catch {
        // Network failure, check if offline token exists
      }
    }

    // If token expired/missing, check if this hardware is already an enrolled bound device
    if (deviceCrypto.hasEnrolledDevice()) {
      const autoAuth = await this.reauthenticateDevice();
      if (autoAuth.success && autoAuth.user) {
        return { valid: true, user: autoAuth.user };
      }
    }

    return { valid: false, error: 'NO_VALID_SESSION' };
  }

  /**
   * Re-authenticate bound device using challenge-response cryptographic proof.
   */
  public async reauthenticateDevice(): Promise<{ success: boolean; user?: AuthUser; error?: string }> {
    const deviceId = deviceCrypto.getStoredDeviceId();
    if (!deviceId) {
      return { success: false, error: 'NO_BOUND_DEVICE' };
    }

    try {
      // 1. Request Challenge
      const challengeRes = await fetch('/api/auth/device/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId }),
      });

      const challengeData = await challengeRes.json().catch(() => ({}));
      if (!challengeRes.ok || !challengeData.challenge) {
        if (challengeData.error === 'DEVICE_REVOKED') {
          await deviceCrypto.clearDeviceBinding();
          this.clearSession();
          return { success: false, error: 'Perangkat ini telah dinonaktifkan oleh administrator.' };
        }
        return { success: false, error: challengeData.error || 'CHALLENGE_FAILED' };
      }

      // 2. Sign Challenge with Private Key
      const signature = await deviceCrypto.signChallenge(challengeData.challenge);

      // 3. Verify Signature with Server
      const authRes = await fetch('/api/auth/device/authenticate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId,
          challenge: challengeData.challenge,
          signature,
        }),
      });

      const authData = await authRes.json().catch(() => ({}));
      if (!authRes.ok || !authData.success) {
        if (authData.error === 'DEVICE_REVOKED' || authData.error === 'KEY_REVOKED') {
          await deviceCrypto.clearDeviceBinding();
          this.clearSession();
          return { success: false, error: 'Perangkat atau lisensi ini telah dinonaktifkan.' };
        }
        return { success: false, error: authData.error || 'AUTHENTICATION_FAILED' };
      }

      this.setSession(authData.token, authData.user);
      return { success: true, user: authData.user };
    } catch {
      return { success: false, error: 'AUTHENTICATION_SERVER_UNAVAILABLE' };
    }
  }

  /**
   * User Key Activation & Device Binding V2.
   * Generates ECDSA P-256 key pair, extracts SPKI public key, and binds it permanently to the key.
   */
  public async activateKey(key: string): Promise<{ success: boolean; user?: AuthUser; error?: string }> {
    try {
      // 1. Get or create browser hardware-associated cryptographic credential
      const cred = await deviceCrypto.getOrCreateDeviceCredential();

      // 2. Submit activation with public key
      const res = await fetch('/api/auth/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: key.trim().toUpperCase(),
          devicePublicKey: cred.publicKeySpki,
          credentialType: cred.credentialType,
          deviceLabel: typeof navigator !== 'undefined' ? navigator.userAgent : 'Web Browser',
        }),
      });

      const data = await res.json().catch(() => ({ error: 'Invalid server response' }));
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'INVALID ACTIVATION KEY' };
      }

      // 3. Store server-assigned deviceId securely
      if (data.device && data.device.id) {
        deviceCrypto.setStoredDeviceId(data.device.id);
      }

      this.setSession(data.token, data.user);
      return { success: true, user: data.user };
    } catch {
      return { success: false, error: 'AUTHENTICATION SERVER UNAVAILABLE' };
    }
  }

  /**
   * Admin Login.
   */
  public async adminLogin(username: string, password: string): Promise<{ success: boolean; user?: AuthUser; error?: string }> {
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password,
          deviceId: 'admin_dashboard',
        }),
      });

      const data = await res.json().catch(() => ({ error: 'Invalid server response' }));
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'ADMIN LOGIN FAILED' };
      }

      this.setSession(data.token, data.user);
      return { success: true, user: data.user };
    } catch {
      return { success: false, error: 'AUTHENTICATION SERVER UNAVAILABLE' };
    }
  }

  /**
   * Sign out (User or Admin).
   */
  public async logout(): Promise<void> {
    const token = this.getToken();
    if (token) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      } catch {}
    }
    this.clearSession();
  }

  // --- Admin API Methods ---

  private async fetchAdmin<T>(endpoint: string, options: RequestInit = {}): Promise<{ success: boolean; data?: T; error?: string }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, error: 'ADMIN_AUTH_REQUIRED' };
    }

    try {
      const res = await fetch(endpoint, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(options.headers || {}),
        },
      });

      const data = await res.json().catch(() => ({ error: 'Server error' }));
      if (!res.ok) {
        return { success: false, error: data.error || `HTTP ${res.status}` };
      }
      return { success: true, data };
    } catch {
      return { success: false, error: 'AUTHENTICATION SERVER UNAVAILABLE' };
    }
  }

  public async getStats(): Promise<{ success: boolean; stats?: AdminStats; error?: string }> {
    const res = await this.fetchAdmin<{ stats: AdminStats }>('/api/admin/stats');
    return { success: res.success, stats: res.data?.stats, error: res.error };
  }

  public async generateKeys(count: number): Promise<{ success: boolean; keys?: ActivationKeyData[]; error?: string }> {
    const res = await this.fetchAdmin<{ keys: ActivationKeyData[] }>('/api/admin/keys/generate', {
      method: 'POST',
      body: JSON.stringify({ count }),
    });
    return { success: res.success, keys: res.data?.keys, error: res.error };
  }

  public async getKeys(): Promise<{ success: boolean; keys?: ActivationKeyData[]; error?: string }> {
    const res = await this.fetchAdmin<{ keys: ActivationKeyData[] }>('/api/admin/keys');
    return { success: res.success, keys: res.data?.keys, error: res.error };
  }

  public async revokeKey(keyId: string): Promise<{ success: boolean; error?: string }> {
    const res = await this.fetchAdmin('/api/admin/keys/revoke', {
      method: 'POST',
      body: JSON.stringify({ keyId }),
    });
    return { success: res.success, error: res.error };
  }

  public async getDevices(): Promise<{ success: boolean; devices?: DeviceData[]; error?: string }> {
    const res = await this.fetchAdmin<{ devices: DeviceData[] }>('/api/admin/devices');
    return { success: res.success, devices: res.data?.devices, error: res.error };
  }

  public async revokeDevice(deviceId: string): Promise<{ success: boolean; error?: string }> {
    const res = await this.fetchAdmin(`/api/admin/devices/${deviceId}/revoke`, {
      method: 'POST',
    });
    return { success: res.success, error: res.error };
  }

  public async resetDeviceBinding(deviceId: string): Promise<{ success: boolean; message?: string; error?: string }> {
    const res = await this.fetchAdmin<{ message: string }>(`/api/admin/devices/${deviceId}/reset-binding`, {
      method: 'POST',
    });
    return { success: res.success, message: res.data?.message, error: res.error };
  }

  public async getSessions(): Promise<{ success: boolean; sessions?: SessionData[]; error?: string }> {
    const res = await this.fetchAdmin<{ sessions: SessionData[] }>('/api/admin/sessions');
    return { success: res.success, sessions: res.data?.sessions, error: res.error };
  }

  public async revokeSession(sessionId: string): Promise<{ success: boolean; error?: string }> {
    const res = await this.fetchAdmin('/api/admin/sessions/revoke', {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    });
    return { success: res.success, error: res.error };
  }

  public async getAuditLogs(): Promise<{ success: boolean; logs?: AuditLogData[]; error?: string }> {
    const res = await this.fetchAdmin<{ logs: AuditLogData[] }>('/api/admin/audit-logs');
    return { success: res.success, logs: res.data?.logs, error: res.error };
  }

  public async changeAdminPassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
    const res = await this.fetchAdmin('/api/admin/password/change', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    return { success: res.success, error: res.error };
  }
}

export const authService = new AuthService();
