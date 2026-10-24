// app.js - builds the Express app: security middleware + routes.
// Kept separate from server.js so tests can use the app without opening a port.
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { notFound, errorHandler } = require('./middleware/errorHandler');

// env = validated config, pool = database connection pool, mailer = optional mailer, ai = optional AI service
function createApp({ env, pool, mailer, ai }) {
  const app = express();

  // Trust reverse proxies (Render, Cloudflare, Vercel) so Express and rate limiters see the real client IP
  app.set('trust proxy', true);

  // Security headers (also hides "X-Powered-By: Express")
  app.use(helmet());

  // Strict CORS: only the frontend origin from .env may call us from a browser, allowing DELETE for goals
  app.use(cors({ origin: env.CLIENT_ORIGIN, methods: ['GET', 'POST', 'PATCH', 'DELETE'], allowedHeaders: ['Content-Type', 'Authorization'] }));

  // Tiny JSON body limit stops big-payload abuse
  app.use(express.json({ limit: '10kb' }));

  // Global rate limit: 100 requests/minute per IP. Stricter limits get added per route (OTP, PIN, payments).
  const { getClientIp } = require('./middleware/rateLimiters');
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 100,
      standardHeaders: true,
      legacyHeaders: false,
      validate: { trustProxy: false, xForwardedForHeader: false },
      keyGenerator: (req) => getClientIp(req),
      message: { error: 'Too many requests, slow down' },
    })
  );

  // Health check: confirms the server is up AND the database answers
  app.get('/api/health', async (_req, res, next) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', db: 'connected' });
    } catch (err) {
      next(err); // goes to errorHandler -> generic 500, no DB details leaked
    }
  });

  // Wire up mailer and service routers
  const { createMailer } = require('./services/mailer');
  const activeMailer = mailer || createMailer(env);

  const { createAuthRouter } = require('./routes/auth');
  const { createProfileRouter } = require('./routes/profile');
  const { createUsersRouter } = require('./routes/users');
  const { createPaymentsRouter } = require('./routes/payments');
  const { createTransactionsRouter } = require('./routes/transactions');
  const { createExpensesRouter } = require('./routes/expenses');
  const { createVaultRouter } = require('./routes/vault');
  const { createAiRouter } = require('./routes/ai');
  const { createStudentCornerRouter } = require('./routes/studentCorner');
  const { createMarketRouter } = require('./routes/market');
  const { createLeagueRouter } = require('./routes/league');

  // Mount API routers
  app.use('/api/auth', createAuthRouter({ env, pool, mailer: activeMailer }));
  app.use('/api/profile', createProfileRouter({ env, pool }));
  app.use('/api/users', createUsersRouter({ env, pool }));
  app.use('/api/payments', createPaymentsRouter({ env, pool }));
  app.use('/api/transactions', createTransactionsRouter({ env, pool }));
  app.use('/api/expenses', createExpensesRouter({ env, pool }));
  app.use('/api/vault', createVaultRouter({ env, pool }));
  app.use('/api/ai', createAiRouter({ env, pool, ai }));
  app.use('/api/student-corner', createStudentCornerRouter({ env, pool }));
  app.use('/api/market', createMarketRouter({ env, pool }));
  app.use('/api/league', createLeagueRouter({ env, pool }));

  // Root-level /api endpoints: /api/me (users), /api/portfolio, /api/goals (vault)
  app.use('/api', createUsersRouter({ env, pool }));
  app.use('/api', createVaultRouter({ env, pool }));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
