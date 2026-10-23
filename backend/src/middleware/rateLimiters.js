// rateLimiters.js - fine-grained rate limiters for high-risk endpoints.
// Protects against brute-force attacks on OTPs, PIN guessing, and API spamming.
const rateLimit = require('express-rate-limit');

// Helper to construct uniform rate limiter instances
function createLimiter({ windowMs, limit, message, keyGenerator }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: message },
    keyGenerator: keyGenerator || ((req) => req.ip),
  });
}

// POST /api/auth/send-otp: 5 per 15 min per IP
const sendOtpLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  message: 'Too many OTP requests from this IP. Please try again after 15 minutes',
});

// POST /api/auth/verify-otp: 10 per 15 min per IP
const verifyOtpLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: 'Too many OTP verification attempts. Please try again after 15 minutes',
});

// PIN-checking routes (/api/auth/unlock, /api/payments/transfer, /api/vault/deposit, etc.): 10 per 15 min per user+IP
const pinCheckLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: 'Too many PIN attempts. Please try again after 15 minutes',
  keyGenerator: (req) => (req.user ? `${req.ip}_${req.user.id}` : req.ip),
});

// POST /api/payments/transfer: 20 per minute
const paymentsLimiter = createLimiter({
  windowMs: 60 * 1000,
  limit: 20,
  message: 'Payment rate limit exceeded. Please wait a minute',
  keyGenerator: (req) => (req.user ? `${req.user.id}` : req.ip),
});

// GET /api/users/lookup: 15 per minute per user (prevents phonebook scraping)
const lookupLimiter = createLimiter({
  windowMs: 60 * 1000,
  limit: 15,
  message: 'Lookup rate limit exceeded. Please wait a minute',
  keyGenerator: (req) => (req.user ? `${req.user.id}` : req.ip),
});

// POST /api/ai/advice: 10 per minute per user
const aiLimiter = createLimiter({
  windowMs: 60 * 1000,
  limit: 10,
  message: 'AI advice rate limit reached. Please wait a minute before requesting again',
  keyGenerator: (req) => (req.user ? `${req.user.id}` : req.ip),
});

// POST /api/league/championships/join-by-code: 15 per 15 min per user+IP (stops brute-force guessing of private room IDs)
const roomCodeLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  message: 'Too many Room ID attempts. Please wait 15 minutes before trying again',
  keyGenerator: (req) => (req.user ? `${req.ip}_${req.user.id}` : req.ip),
});

module.exports = {
  sendOtpLimiter,
  verifyOtpLimiter,
  pinCheckLimiter,
  paymentsLimiter,
  lookupLimiter,
  aiLimiter,
  roomCodeLimiter,
};

