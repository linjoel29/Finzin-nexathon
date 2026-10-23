// auth.js - authentication router (OTP, registration, unlock, PIN reset).
// Covers Step 2 of Finzin banking specifications.
const express = require('express');
const { z } = require('zod');
const { validateBody } = require('../middleware/validate');
const { createAuthMiddleware, requireFreshOtp } = require('../middleware/auth');
const { sendOtpLimiter, verifyOtpLimiter, pinCheckLimiter } = require('../middleware/rateLimiters');
const { sendOtp, verifyOtp } = require('../services/otp');
const { registerUser } = require('../services/accounts');
const { verifyPin, resetPin } = require('../services/pin');

// Zod schemas for input validation
const sendOtpSchema = z.object({
  email: z.string().email('Invalid email address'),
}).strict();

const verifyOtpSchema = z.object({
  email: z.string().email('Invalid email address'),
  code: z.string().regex(/^\d{6}$/, 'OTP must be a 6-digit code'),
}).strict();

const registerSchema = z.object({
  registrationToken: z.string().min(1, 'Registration token is required'),
  fullName: z.string().min(2, 'Full name must be at least 2 characters').max(80, 'Full name must not exceed 80 characters'),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be YYYY-MM-DD'),
  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']).optional(),
  mobile: z.string().regex(/^[6-9][0-9]{9}$/, 'Must be a valid 10-digit Indian mobile number'),
  address: z.object({
    line: z.string().min(3).max(150),
    city: z.string().min(2).max(60),
    state: z.string().min(2).max(60),
    pincode: z.string().regex(/^[0-9]{6}$/, 'Pincode must be 6 digits'),
  }).strict(),
  college: z.string().min(2).max(100),
  studentId: z.string().min(2).max(30),
  nominee: z.object({
    name: z.string().min(2).max(80),
    relation: z.string().min(2).max(30),
  }).strict(),
  kycLast4: z.string().regex(/^[0-9]{4}$/, 'KYC last 4 must be 4 digits').optional(),
  pin: z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits'),
  consent: z.literal(true, {
    errorMap: () => ({ message: 'Terms and data-use consent must be accepted' }),
  }),
}).strict();

const unlockSchema = z.object({
  pin: z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits'),
}).strict();

const resetPinSchema = z.object({
  newPin: z.string().regex(/^\d{4}$/, 'New PIN must be exactly 4 digits'),
}).strict();

/**
 * Creates and configures the Auth router.
 */
function createAuthRouter({ env, pool, mailer }) {
  const router = express.Router();
  const requireAuth = createAuthMiddleware(env);

  // POST /api/auth/send-otp
  router.post(
    '/send-otp',
    sendOtpLimiter,
    validateBody(sendOtpSchema),
    async (req, res, next) => {
      try {
        const result = await sendOtp({
          email: req.body.email,
          pool,
          env,
          mailer,
        });
        res.json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  // POST /api/auth/verify-otp
  router.post(
    '/verify-otp',
    verifyOtpLimiter,
    validateBody(verifyOtpSchema),
    async (req, res, next) => {
      try {
        const result = await verifyOtp({
          email: req.body.email,
          code: req.body.code,
          pool,
          env,
        });
        res.json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  // POST /api/auth/register
  router.post(
    '/register',
    validateBody(registerSchema),
    async (req, res, next) => {
      try {
        const result = await registerUser({
          payload: req.body,
          pool,
          env,
        });
        res.status(201).json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  // POST /api/auth/unlock
  router.post(
    '/unlock',
    requireAuth,
    pinCheckLimiter,
    validateBody(unlockSchema),
    async (req, res, next) => {
      try {
        await verifyPin({
          userId: req.user.id,
          pin: req.body.pin,
          pool,
        });
        res.json({ ok: true });
      } catch (err) {
        next(err);
      }
    }
  );

  // POST /api/auth/reset-pin
  router.post(
    '/reset-pin',
    requireAuth,
    requireFreshOtp(600), // Within 10 minutes of OTP verification
    validateBody(resetPinSchema),
    async (req, res, next) => {
      try {
        const result = await resetPin({
          userId: req.user.id,
          newPin: req.body.newPin,
          pool,
        });
        res.json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}

module.exports = { createAuthRouter };
