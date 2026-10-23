// money.js - strict rupee-to-paise conversion and formatting.
// RULES:
// 1. Never use floating-point arithmetic for monetary calculations (avoids 0.1 + 0.2 = 0.30000000000000004).
// 2. Reject scientific notation ("1e3"), non-numeric strings, negative amounts, zero, and more than 2 decimals.
// 3. Cap per-transaction transfer amount at Rs 50,000 (5,000,000 paise).
const { AppError } = require('./AppError');

// Maximum transfer allowed in a single transaction: Rs 50,000 in paise
const MAX_TRANSFER_PAISE = 5000000;

/**
 * Converts a rupee input (string or number) into integer paise.
 * Rejects invalid formats, negative/zero numbers, exponents, and values > Rs 50,000.
 *
 * @param {string|number} input - Amount in rupees (e.g., "10", "10.50", 500)
 * @param {number} [maxPaise=MAX_TRANSFER_PAISE] - Optional upper bound in paise
 * @returns {number} Integer paise (e.g., 1050)
 */
function rupeesToPaise(input, maxPaise = MAX_TRANSFER_PAISE) {
  if (input === null || input === undefined) {
    throw new AppError(400, 'Amount is required');
  }

  let str;
  if (typeof input === 'number') {
    // Reject NaN, Infinity, negative values
    if (!Number.isFinite(input) || input <= 0) {
      throw new AppError(400, 'Amount must be a positive number');
    }
    // Reject scientific notation representation e.g. 1e3
    str = input.toString();
    if (/e/i.test(str)) {
      throw new AppError(400, 'Scientific notation is not allowed');
    }
  } else if (typeof input === 'string') {
    str = input.trim();
  } else {
    throw new AppError(400, 'Invalid amount type');
  }

  // Reject scientific notation or non-numeric/negative patterns
  if (/e/i.test(str)) {
    throw new AppError(400, 'Scientific notation is not allowed');
  }

  // Strict regex: integer or up to 2 decimal places, no negative sign, no leading plus
  // Examples matching: "10", "10.5", "10.50", "0.50", "50000"
  // Reject: "-1", "abc", "10.555", "1e3", ".5"
  if (!/^\d+(\.\d{1,2})?$/.test(str)) {
    throw new AppError(400, 'Invalid amount format. Must be a valid positive number with at most 2 decimal places');
  }

  // Split into whole rupees and fractional paise parts
  const [rupeesPart, decimalPart = ''] = str.split('.');

  // Normalise decimal part to exactly 2 digits: "5" -> "50", "" -> "00"
  const normalizedDecimal = decimalPart.padEnd(2, '0');

  // Convert to BigInt to prevent any 32-bit or float precision artifacts
  const wholePaise = BigInt(rupeesPart) * 100n + BigInt(normalizedDecimal);

  if (wholePaise <= 0n) {
    throw new AppError(400, 'Amount must be greater than zero');
  }

  if (wholePaise > BigInt(maxPaise)) {
    throw new AppError(400, `Amount exceeds limit of Rs ${maxPaise / 100}`);
  }

  // Safe to cast to standard JS number since max is well within Number.MAX_SAFE_INTEGER
  return Number(wholePaise);
}

/**
 * Converts integer paise to rupees for API responses.
 *
 * @param {number|string|bigint} paise - Integer paise
 * @returns {number} Rupees (e.g., 1050 paise -> 10.5)
 */
function paiseToRupees(paise) {
  const p = Number(paise);
  if (!Number.isFinite(p)) return 0;
  // Round to 2 decimal places to avoid standard JS float display quirks
  return Math.round(p) / 100;
}

module.exports = {
  MAX_TRANSFER_PAISE,
  rupeesToPaise,
  paiseToRupees,
};
