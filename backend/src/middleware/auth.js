// auth.js - JWT authentication & authorization middleware.
// RULES:
// 1. HS256 algorithm strictly pinned on verify (prevents algorithm confusion attacks like 'none' or asymmetric key injection).
// 2. Token purposes:
//    - "session": 7 days, granted after successful login or registration.
//    - "register": 30 minutes, issued to unverified emails after successful OTP verification.
// 3. otpFresh claim: boolean set to true when session token is issued from OTP verification. Valid for 10 minutes from iat.
const jwt = require('jsonwebtoken');
const { AppError } = require('../utils/AppError');

/**
 * Creates the authentication middleware using the validated environment secret.
 *
 * @param {object} env - Validated env object
 * @returns {Function} Express middleware verifying Bearer session tokens
 */
function createAuthMiddleware(env) {
  return (req, _res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(new AppError(401, 'Unauthorized: Missing or invalid authorization header'));
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      return next(new AppError(401, 'Unauthorized: Token missing'));
    }

    try {
      // Pin algorithm to HS256
      const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });

      // Reject tokens not issued specifically for session access
      if (payload.purpose !== 'session' || !payload.sub) {
        return next(new AppError(401, 'Unauthorized: Invalid token purpose'));
      }

      req.user = {
        id: payload.sub,
        email: payload.email,
        otpFresh: Boolean(payload.otpFresh),
        iat: payload.iat,
      };
      next();
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return next(new AppError(401, 'Unauthorized: Token has expired'));
      }
      return next(new AppError(401, 'Unauthorized: Invalid token'));
    }
  };
}

/**
 * Middleware ensuring the current session has a fresh OTP verification within 10 minutes.
 * Required for sensitive operations like PIN reset.
 *
 * @param {number} [maxAgeSeconds=600] - 10 minutes in seconds
 */
function requireFreshOtp(maxAgeSeconds = 600) {
  return (req, _res, next) => {
    if (!req.user) {
      return next(new AppError(401, 'Unauthorized'));
    }

    if (!req.user.otpFresh) {
      return next(new AppError(401, 'Unauthorized: Fresh OTP verification required'));
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    const tokenAge = nowSeconds - req.user.iat;

    if (tokenAge > maxAgeSeconds || tokenAge < 0) {
      return next(new AppError(401, 'Unauthorized: OTP freshness expired. Please verify OTP again'));
    }

    next();
  };
}

/**
 * Signs a session JWT (valid for 7 days).
 */
function signSessionToken({ userId, email, otpFresh = false, env }) {
  return jwt.sign(
    {
      sub: userId,
      email,
      purpose: 'session',
      otpFresh,
    },
    env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '7d' }
  );
}

/**
 * Signs a registration token (valid for 30 minutes, bound to email).
 */
function signRegistrationToken({ email, env }) {
  return jwt.sign(
    {
      email,
      purpose: 'register',
    },
    env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '30m' }
  );
}

/**
 * Verifies a registration token and extracts the verified email.
 */
function verifyRegistrationToken(token, env) {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    if (payload.purpose !== 'register' || !payload.email) {
      throw new AppError(400, 'Invalid registration token purpose');
    }
    return payload;
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (err.name === 'TokenExpiredError') {
      throw new AppError(400, 'Registration token has expired. Please verify OTP again');
    }
    throw new AppError(400, 'Invalid registration token');
  }
}

module.exports = {
  createAuthMiddleware,
  requireFreshOtp,
  signSessionToken,
  signRegistrationToken,
  verifyRegistrationToken,
};
