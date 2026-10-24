// cors.js - Configures Cross-Origin Resource Sharing (CORS) rules for Finzin.
// Enforces strict whitelist of production origins and verified Vercel preview deployments.
const cors = require('cors');

/**
 * Checks whether an incoming HTTP origin is permitted to access the Finzin API.
 *
 * ALLOWED:
 * 1. Configured origins in env.CLIENT_ORIGIN (e.g., http://localhost:5173 during local dev)
 * 2. Exact production origins:
 *    - https://finzinnexathon.vercel.app
 *    - https://finzinnexathon-git-main-linjoel29s-projects.vercel.app
 * 3. Trusted Vercel preview deployments for this project:
 *    - https://finzinnexathon-*.vercel.app
 *    - https://finzinnexathon-*-linjoel29s-projects.vercel.app
 *
 * REJECTED:
 * - Arbitrary or attacker origins (e.g., evil.com, evil-finzinnexathon.vercel.app, finzinnexathon.evil.com)
 * - Insecure HTTP origins (must be HTTPS for all cloud/production origins)
 * - Spoofed port numbers (must be standard HTTPS)
 *
 * @param {string|undefined} origin - Request Origin header
 * @param {string|undefined} envClientOrigin - CLIENT_ORIGIN from env
 * @returns {boolean} True if origin is authorized
 */
function isAllowedOrigin(origin, envClientOrigin) {
  if (!origin || typeof origin !== 'string') {
    return false;
  }

  const cleanOrigin = origin.trim().replace(/\/+$/, '');

  // 1. Check exact configured origins from env (supports comma-separated list or single URL)
  if (envClientOrigin) {
    const configuredOrigins = envClientOrigin
      .split(',')
      .map((o) => o.trim().replace(/\/+$/, ''))
      .filter(Boolean);

    if (configuredOrigins.includes(cleanOrigin)) {
      return true;
    }
  }

  // 2. Exact production origins
  const exactProductionOrigins = [
    'https://finzinnexathon.vercel.app',
    'https://finzinnexathon-git-main-linjoel29s-projects.vercel.app',
  ];
  if (exactProductionOrigins.includes(cleanOrigin)) {
    return true;
  }

  // 3. Strict hostname validation for project preview deployments on Vercel
  try {
    const parsed = new URL(cleanOrigin);

    // Protocol must strictly be HTTPS
    if (parsed.protocol !== 'https:') {
      return false;
    }

    // Port must be empty or default 443
    if (parsed.port && parsed.port !== '443') {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();

    // Must strictly match project-specific Vercel preview deployment patterns
    const isProjectPreview =
      /^finzinnexathon(-[a-z0-9-]+)?\.vercel\.app$/.test(hostname) ||
      /^finzinnexathon(-[a-z0-9-]+)?-linjoel29s-projects\.vercel\.app$/.test(hostname);

    return isProjectPreview;
  } catch {
    return false;
  }
}

/**
 * Creates the Express CORS middleware with strict origin verification.
 *
 * @param {object} env - Validated environment config
 * @returns {import('express').RequestHandler}
 */
function createCorsMiddleware(env) {
  return cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
      if (!origin) {
        return callback(null, true);
      }

      if (isAllowedOrigin(origin, env.CLIENT_ORIGIN)) {
        return callback(null, true);
      }

      // Reject untrusted origin by not setting Access-Control-Allow-Origin
      return callback(null, false);
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    optionsSuccessStatus: 204,
  });
}

module.exports = {
  isAllowedOrigin,
  createCorsMiddleware,
};
