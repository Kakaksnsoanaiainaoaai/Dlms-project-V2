/**
 * In-memory sliding window rate limiter for brute-force protection.
 */
interface RateLimitRecord {
  count: number;
  resetAt: number;
}

export class RateLimiter {
  private limits: Map<string, RateLimitRecord> = new Map();
  private maxAttempts: number;
  private windowMs: number;

  constructor(maxAttempts: number, windowMs: number) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;

    // Periodically clean up expired entries every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000).unref();
  }

  public isAllowed(key: string): { allowed: boolean; remaining: number; retryAfterSec: number } {
    const now = Date.now();
    const record = this.limits.get(key);

    if (!record || now > record.resetAt) {
      this.limits.set(key, { count: 1, resetAt: now + this.windowMs });
      return { allowed: true, remaining: this.maxAttempts - 1, retryAfterSec: 0 };
    }

    if (record.count >= this.maxAttempts) {
      const retryAfterSec = Math.ceil((record.resetAt - now) / 1000);
      return { allowed: false, remaining: 0, retryAfterSec };
    }

    record.count += 1;
    return {
      allowed: true,
      remaining: this.maxAttempts - record.count,
      retryAfterSec: 0,
    };
  }

  public reset(key: string): void {
    this.limits.delete(key);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, record] of this.limits.entries()) {
      if (now > record.resetAt) {
        this.limits.delete(key);
      }
    }
  }
}

// 5 activation attempts per IP per 3 minutes
export const activationRateLimiter = new RateLimiter(5, 3 * 60 * 1000);

// 15 device challenge/auth attempts per IP per 3 minutes
export const deviceAuthRateLimiter = new RateLimiter(15, 3 * 60 * 1000);

// 5 admin login attempts per IP per 5 minutes
export const adminLoginRateLimiter = new RateLimiter(5, 5 * 60 * 1000);
