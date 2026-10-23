// validate.js - request validation middleware using Zod schemas.
// Ensures incoming payloads strictly conform to expectations before any business logic executes.
const { AppError } = require('../utils/AppError');

/**
 * Validates req.body against a Zod schema.
 * If validation fails, responds with 400 and the first validation error message.
 *
 * @param {import('zod').ZodSchema} schema - Zod schema to validate against
 */
function validateBody(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const issue = result.error.issues[0];
      const message = issue ? `${issue.path.join('.') || 'field'}: ${issue.message}` : 'Invalid request payload';
      return next(new AppError(400, message));
    }
    // Assign validated/coerced data back to req.body
    req.body = result.data;
    next();
  };
}

/**
 * Validates req.query against a Zod schema.
 *
 * @param {import('zod').ZodSchema} schema - Zod schema to validate against
 */
function validateQuery(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const issue = result.error.issues[0];
      const message = issue ? `${issue.path.join('.') || 'query'}: ${issue.message}` : 'Invalid query parameters';
      return next(new AppError(400, message));
    }
    req.query = result.data;
    next();
  };
}

/**
 * Validates req.params against a Zod schema.
 *
 * @param {import('zod').ZodSchema} schema - Zod schema to validate against
 */
function validateParams(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      const issue = result.error.issues[0];
      const message = issue ? `${issue.path.join('.') || 'param'}: ${issue.message}` : 'Invalid route parameters';
      return next(new AppError(400, message));
    }
    req.params = result.data;
    next();
  };
}

module.exports = {
  validateBody,
  validateQuery,
  validateParams,
};
