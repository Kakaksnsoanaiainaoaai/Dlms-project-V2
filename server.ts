import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { securityDb, SessionRecord } from './server/db';
import { activationRateLimiter, adminLoginRateLimiter, deviceAuthRateLimiter } from './server/rate-limiter';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Trust proxy for secure IP rate limiting on Cloud Run
app.set('trust proxy', 1);

app.use(express.json());

// Public health checks for Cloud Run & load balancers (No Auth Required)
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', service: 'DLMS Virtual Security Service', timestamp: new Date().toISOString() });
});

// Helper to get client IP
function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || '127.0.0.1';
}

// Helper to extract Bearer token
function getBearerToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return null;
  }
  return auth.substring(7).trim();
}

// Middleware: Require valid session (user or admin)
interface AuthenticatedRequest extends Request {
  sessionRecord?: SessionRecord;
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'AUTHENTICATION_REQUIRED' });
  }

  const ip = getClientIp(req);
  const result = securityDb.validateSession(token, ip);
  if (!result.valid || !result.session) {
    return res.status(401).json({ error: result.error || 'INVALID_SESSION' });
  }

  req.sessionRecord = result.session;
  next();
}

// Middleware: Require admin role
function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (req.sessionRecord?.role !== 'admin') {
      return res.status(403).json({ error: 'ACCESS_DENIED' });
    }
    next();
  });
}

// ==========================================
// 1. PUBLIC AUTH API (User & Activation)
// ==========================================

// Activate Single-Use Key & Bind Device V2
app.post('/api/auth/activate', (req: Request, res: Response) => {
  const ip = getClientIp(req);
  const rate = activationRateLimiter.isAllowed(ip);
  if (!rate.allowed) {
    return res.status(429).json({
      error: `Too many activation attempts. Please wait ${rate.retryAfterSec} seconds.`,
    });
  }

  const { key, devicePublicKey, credentialType, deviceLabel } = req.body;
  if (!key || typeof key !== 'string') {
    return res.status(400).json({ error: 'INVALID ACTIVATION KEY' });
  }

  const userAgent = req.headers['user-agent'] || deviceLabel || 'Browser Client';
  const result = securityDb.activateKey(
    key,
    devicePublicKey || '',
    credentialType || 'ECDSA_P256',
    userAgent,
    ip
  );

  if (!result.success || !result.session || !result.device) {
    return res.status(400).json({ error: result.error || 'INVALID ACTIVATION KEY' });
  }

  // Reset rate limiter on successful activation
  activationRateLimiter.reset(ip);

  res.json({
    success: true,
    token: result.session.token,
    user: {
      userId: result.session.userId,
      role: result.session.role,
      deviceId: result.session.deviceId,
      expiresAt: result.session.expiresAt,
    },
    device: {
      id: result.device.id,
      status: result.device.status,
    },
  });
});

// Request Cryptographic Challenge for Bound Device
app.post('/api/auth/device/challenge', (req: Request, res: Response) => {
  const ip = getClientIp(req);
  const rate = deviceAuthRateLimiter.isAllowed(ip);
  if (!rate.allowed) {
    return res.status(429).json({
      error: `Too many device challenge attempts. Please wait ${rate.retryAfterSec} seconds.`,
    });
  }

  const { deviceId } = req.body;
  if (!deviceId || typeof deviceId !== 'string') {
    return res.status(400).json({ error: 'deviceId is required' });
  }

  const result = securityDb.createChallenge(deviceId);
  if (!result.success || !result.challenge) {
    return res.status(400).json({ error: result.error || 'DEVICE_NOT_FOUND' });
  }

  res.json({
    success: true,
    challenge: result.challenge,
    deviceId,
  });
});

// Authenticate Bound Device via Cryptographic Proof
app.post('/api/auth/device/authenticate', (req: Request, res: Response) => {
  const ip = getClientIp(req);
  const rate = deviceAuthRateLimiter.isAllowed(ip);
  if (!rate.allowed) {
    return res.status(429).json({
      error: `Too many authentication attempts. Please wait ${rate.retryAfterSec} seconds.`,
    });
  }

  const { deviceId, challenge, signature } = req.body;
  if (!deviceId || !challenge || !signature) {
    return res.status(400).json({ error: 'deviceId, challenge, and signature are required' });
  }

  const result = securityDb.authenticateDevice(deviceId, challenge, signature, ip);
  if (!result.success || !result.session || !result.device) {
    return res.status(401).json({ error: result.error || 'DEVICE_AUTHENTICATION_FAILED' });
  }

  // Reset rate limiter on successful authentication
  deviceAuthRateLimiter.reset(ip);

  res.json({
    success: true,
    token: result.session.token,
    user: {
      userId: result.session.userId,
      role: result.session.role,
      deviceId: result.session.deviceId,
      expiresAt: result.session.expiresAt,
    },
    device: {
      id: result.device.id,
      status: result.device.status,
    },
  });
});

// Check Current Session Status
app.get('/api/auth/session', (req: AuthenticatedRequest, res: Response) => {
  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ valid: false, error: 'NO_TOKEN' });
  }

  const ip = getClientIp(req);
  const result = securityDb.validateSession(token, ip);
  if (!result.valid || !result.session) {
    return res.status(401).json({ valid: false, error: result.error || 'INVALID_SESSION' });
  }

  res.json({
    valid: true,
    user: {
      userId: result.session.userId,
      role: result.session.role,
      deviceId: result.session.deviceId,
      createdAt: result.session.createdAt,
      expiresAt: result.session.expiresAt,
    },
  });
});

// Session Heartbeat / Refresh
app.post('/api/auth/refresh', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  res.json({
    success: true,
    user: {
      userId: req.sessionRecord!.userId,
      role: req.sessionRecord!.role,
      expiresAt: req.sessionRecord!.expiresAt,
    },
  });
});

// User or Admin Logout
app.post('/api/auth/logout', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const token = getBearerToken(req);
  if (token && req.sessionRecord) {
    securityDb.revokeSession(req.sessionRecord.id, req.sessionRecord.userId, getClientIp(req));
  }
  res.json({ success: true, message: 'Logged out successfully' });
});

// ==========================================
// 2. ADMIN AUTHENTICATION API
// ==========================================

// Admin Login
app.post('/api/admin/login', (req: Request, res: Response) => {
  const ip = getClientIp(req);
  const rate = adminLoginRateLimiter.isAllowed(ip);
  if (!rate.allowed) {
    return res.status(429).json({
      error: `Too many login attempts. Please wait ${rate.retryAfterSec} seconds.`,
    });
  }

  const { username, password, deviceId } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'ADMIN LOGIN FAILED' });
  }

  const isValid = securityDb.verifyAdminCredentials(username, password);
  if (!isValid) {
    securityDb.logAudit('ADMIN_LOGIN_FAILED', username, 'FAILED', 'Invalid username or password', ip);
    return res.status(401).json({ error: 'ADMIN LOGIN FAILED' });
  }

  adminLoginRateLimiter.reset(ip);
  const session = securityDb.createAdminSession(username, deviceId || 'admin_client', ip);

  res.json({
    success: true,
    token: session.token,
    user: {
      userId: session.userId,
      role: 'admin',
      expiresAt: session.expiresAt,
    },
  });
});

// Change Admin Password
app.post('/api/admin/password/change', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { currentPassword, newPassword } = req.body;
  const ip = getClientIp(req);

  const result = securityDb.changeAdminPassword(currentPassword, newPassword, ip);
  if (!result.success) {
    return res.status(400).json({ error: result.error || 'Failed to change password' });
  }

  res.json({ success: true, message: 'Password changed successfully' });
});

// ==========================================
// 3. ADMIN KEY & SESSION MANAGEMENT API
// ==========================================

// Generate New Activation Keys
app.post('/api/admin/keys/generate', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { count } = req.body;
  const ip = getClientIp(req);
  const adminUser = req.sessionRecord?.userId || 'admin';

  const keys = securityDb.generateKeys(count || 1, adminUser, ip);
  res.json({ success: true, count: keys.length, keys });
});

// Get Activation Keys List
app.get('/api/admin/keys', requireAdmin, (_req: AuthenticatedRequest, res: Response) => {
  const keys = securityDb.getKeys(200);
  res.json({ success: true, keys });
});

// Revoke an Activation Key
app.post('/api/admin/keys/revoke', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { keyId } = req.body;
  if (!keyId) {
    return res.status(400).json({ error: 'keyId is required' });
  }

  const ip = getClientIp(req);
  const adminUser = req.sessionRecord?.userId || 'admin';
  const success = securityDb.revokeKey(keyId, adminUser, ip);

  if (!success) {
    return res.status(404).json({ error: 'Key not found' });
  }

  res.json({ success: true, message: 'Key revoked successfully' });
});

// Get All Sessions
app.get('/api/admin/sessions', requireAdmin, (_req: AuthenticatedRequest, res: Response) => {
  const sessions = securityDb.getSessions(100);
  res.json({ success: true, sessions });
});

// Revoke a Session
app.post('/api/admin/sessions/revoke', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { sessionId } = req.body;
  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required' });
  }

  const ip = getClientIp(req);
  const adminUser = req.sessionRecord?.userId || 'admin';
  const success = securityDb.revokeSession(sessionId, adminUser, ip);

  if (!success) {
    return res.status(404).json({ error: 'Session not found' });
  }

  res.json({ success: true, message: 'Session revoked successfully' });
});

// Get All Bound Devices
app.get('/api/admin/devices', requireAdmin, (_req: AuthenticatedRequest, res: Response) => {
  const devices = securityDb.getDevices(100);
  res.json({ success: true, devices });
});

// Revoke a Device
app.post('/api/admin/devices/:id/revoke', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const deviceId = req.params.id;
  if (!deviceId) {
    return res.status(400).json({ error: 'Device ID is required' });
  }

  const ip = getClientIp(req);
  const adminUser = req.sessionRecord?.userId || 'admin';
  const success = securityDb.revokeDevice(deviceId, adminUser, ip);

  if (!success) {
    return res.status(404).json({ error: 'Device not found' });
  }

  res.json({ success: true, message: 'Device revoked successfully' });
});

// Reset Device Binding (Device Recovery Flow)
app.post('/api/admin/devices/:id/reset-binding', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const deviceId = req.params.id;
  if (!deviceId) {
    return res.status(400).json({ error: 'Device ID is required' });
  }

  const ip = getClientIp(req);
  const adminUser = req.sessionRecord?.userId || 'admin';
  const result = securityDb.resetDeviceBinding(deviceId, adminUser, ip);

  if (!result.success) {
    return res.status(404).json({ error: result.error || 'Failed to reset device binding' });
  }

  res.json({ success: true, message: result.message });
});

// Get Audit Logs
app.get('/api/admin/audit-logs', requireAdmin, (_req: AuthenticatedRequest, res: Response) => {
  const logs = securityDb.getAuditLogs(150);
  res.json({ success: true, logs });
});

// Get Dashboard Stats
app.get('/api/admin/stats', requireAdmin, (_req: AuthenticatedRequest, res: Response) => {
  const stats = securityDb.getStats();
  res.json({ success: true, stats });
});

// ==========================================
// 4. VITE & STATIC FILE SERVING
// ==========================================

async function startServer() {
  try {
    if (process.env.NODE_ENV !== 'production') {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.resolve(process.cwd(), 'dist');
      app.use(express.static(distPath));
      app.get('*', (_req: Request, res: Response) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }

    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`[DLMS Server] Running securely on port ${PORT} (0.0.0.0) [NODE_ENV=${process.env.NODE_ENV || 'development'}]`);
    });

    server.on('error', (err: any) => {
      console.error('[DLMS Server] Fatal startup/network error:', err);
    });
  } catch (err) {
    console.error('[DLMS Server] Failed to initialize server:', err);
    process.exit(1);
  }
}

startServer();
