// errorHandler.js - the ONE place where errors become HTTP responses.
// Rule: never leak stack traces, SQL errors or file paths to the client.
const { AppError } = require('../utils/AppError');

// Unknown route -> 404 (JSON, not an HTML page)
function notFound(_req, res) {
  res.status(404).json({ error: 'Not found' });
}

// Express recognises a 4-argument function as the error handler
// eslint-disable-next-line no-unused-vars
function errorHandler(err, _req, res, _next) {
  // Safe, intentional errors (AppError)
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message });
  }
  // Body parser problems: bad JSON or body bigger than the 10kb limit
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  // Anything else is a bug: log the message for us, send a generic reply to the user
  console.error('[error]', err.message);
  return res.status(500).json({ error: 'Something went wrong' });
}

module.exports = { notFound, errorHandler };
