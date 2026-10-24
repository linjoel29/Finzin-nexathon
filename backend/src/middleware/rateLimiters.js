// rateLimiters.js - Fine-grained rate limiters for authentication, OTP, and sensitive financial endpoints.
// PROTECTIONS:
// 1. Dual OTP rate limiting: Limits requests per EMAIL (stops inbox spamming) and per IP (stops network-wide floods).
// 2. Real Client IP extraction: Resolves real client IP behind Cloudflare, Render, and Vercel reverse proxies.
// 3. Clear retry messages: Calculates dynamic human-readable remaining time for students.
const rateLimit = require('express-rate-limit');

/**
 * Safely extracts the true client IP address behind reverse proxies (Cloudflare, Render, Vercel).
 * Priority:
 * 1. cf-connecting-ip (set by Cloudflare edge directly from client)
 * 2. x-real-ip (standard reverse proxy header)
 * 3. Leftmost IP in x-forwarded-for list
 * 4. req.ip (Express resolved IP with trust proxy enabled)
 * 5. req.socket.remoteAddress
 *
 * @param {import('express').Request} req
 * @returns {string} Client IP address
 */
function getClientIp(req) {
  const cfIp = req.headers['cf-connecting-ip'];
  if (cfIp && typeof cfIp === 'string' && cfIp.trim()) {
    return cfIp.trim();
  }

  const xRealIp = req.headers['x-real-ip'];
  if (xRealIp && typeof xRealIp === 'string' && xRealIp.trim()) {
    return xRealIp.trim();
  }

  const xForwardedFor = req.headers['x-forwarded-for'];
  if (xForwardedFor && typeof xForwardedFor === 'string') {
    const clientIp = xForwardedFor.split(',')[0].trim();
    if (clientIp) return clientIp;
  }

  return req.ip || req.socket?.remoteAddress || '127.0.0.1';
}

/**
 * Formats friendly remaining cooldown message based on rate limit reset time.
 *
 * @param {Date|undefined} resetTime
 * @param {number} fallbackWindowMs
 * @param {string} prefix
 * @returns {string} Human-friendly retry message
 */
function formatRetryMessage(resetTime, fallbackWindowMs, prefix) {
  let remainingText = '';
  if (resetTime instanceof Date) {
    const diffSec = Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000));
    if (diffSec < 60) {
      remainingText = `in ${diffSec} second${diffSec !== 1 ? 's' : ''}`;
    } else {
      const mins = Math.ceil(diffSec / 60);
      remainingText = `in ${mins} minute${mins !== 1 ? 's' : ''}`;
    }
  } else {
    const mins = Math.ceil(fallbackWindowMs / 60000);
    remainingText = `after ${mins} minutes`;
  }
  return `${prefix}. Please try again ${remainingText}.`;
}

/**
 * Helper to construct uniform rate limiter instances with custom JSON responses.
 */
function createLimiter({ windowMs, limit, baseMessage, keyGenerator }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: false, xForwardedForHeader: false },
    keyGenerator: keyGenerator || ((req) => getClientIp(req)),
    handler: (req, res, _next, options) => {
      const message = formatRetryMessage(req.rateLimit?.resetTime, options.windowMs, baseMessage);
      res.status(options.statusCode).json({ error: message });
    },
  });
}

// ---------------------------------------------------------------------
// 1. SEND OTP RATE LIMITERS (Dual layer: per-email + per-IP)
// ---------------------------------------------------------------------

// Per-Email limiter: max 5 OTP requests per 15 minutes per email address
const sendOtpEmailLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  baseMessage: 'Too many OTP requests for this email address',
  keyGenerator: (req) => {
    const email = req.body?.email;
    if (typeof email === 'string' && email.trim()) {
      return `otp_email_${email.trim().toLowerCase()}`;
    }
    // If body not parsed yet or missing email, fall back to IP
    return `otp_email_ip_${getClientIp(req)}`;
  },
});

// Per-IP limiter: max 30 OTP requests per 15 minutes per network IP (campus Wi-Fi / NAT friendly)
const sendOtpIpLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  baseMessage: 'Too many OTP requests from this network',
  keyGenerator: (req) => `otp_ip_${getClientIp(req)}`,
});

// Combined sendOtpLimiter: applies per-IP and per-email restrictions sequentially
const sendOtpLimiter = [sendOtpIpLimiter, sendOtpEmailLimiter];

// ---------------------------------------------------------------------
// 2. VERIFY OTP RATE LIMITER
// ---------------------------------------------------------------------
// Max 15 verification attempts per 15 minutes per IP (each individual OTP also self-destructs after 5 tries)
const verifyOtpLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  baseMessage: 'Too many OTP verification attempts from this network',
  keyGenerator: (req) => `verify_ip_${getClientIp(req)}`,
});

// ---------------------------------------------------------------------
// 3. SENSITIVE OPERATION LIMITERS
// ---------------------------------------------------------------------

// PIN-checking routes (/api/auth/unlock, /api/payments/transfer, etc.): 10 per 15 min per user+IP
const pinCheckLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  baseMessage: 'Too many PIN attempts',
  keyGenerator: (req) => (req.user ? `${getClientIp(req)}_${req.user.id}` : getClientIp(req)),
});

// POST /api/payments/transfer: 20 per minute
const paymentsLimiter = createLimiter({
  windowMs: 60 * 1000,
  limit: 20,
  baseMessage: 'Payment rate limit exceeded',
  keyGenerator: (req) => (req.user ? `pay_${req.user.id}` : getClientIp(req)),
});

// GET /api/users/lookup: 15 per minute per user (prevents phonebook scraping)
const lookupLimiter = createLimiter({
  windowMs: 60 * 1000,
  limit: 15,
  baseMessage: 'User lookup rate limit exceeded',
  keyGenerator: (req) => (req.user ? `lookup_${req.user.id}` : getClientIp(req)),
});

// POST /api/ai/advice: 10 per minute per user
const aiLimiter = createLimiter({
  windowMs: 60 * 1000,
  limit: 10,
  baseMessage: 'AI advice rate limit reached',
  keyGenerator: (req) => (req.user ? `ai_${req.user.id}` : getClientIp(req)),
});

// POST /api/league/championships/join-by-code: 15 per 15 min per user+IP (prevents brute-force guessing of private room IDs)
const roomCodeLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  baseMessage: 'Too many Room ID attempts',
  keyGenerator: (req) => (req.user ? `${getClientIp(req)}_${req.user.id}` : getClientIp(req)),
});

module.exports = {
  getClientIp,
  sendOtpEmailLimiter,
  sendOtpIpLimiter,
  sendOtpLimiter,
  verifyOtpLimiter,
  pinCheckLimiter,
  paymentsLimiter,
  lookupLimiter,
  aiLimiter,
  roomCodeLimiter,
};
