// masks.js - utilities for masking sensitive personally identifiable information (PII).
// Never reveal full account numbers or mobile numbers in general profile endpoints.

/**
 * Masks an Indian 10-digit mobile number, showing only the last 4 digits.
 * Example: "9876543210" -> "******3210"
 *
 * @param {string} mobile - 10-digit mobile number
 * @returns {string} Masked mobile string
 */
function maskMobile(mobile) {
  if (!mobile || typeof mobile !== 'string') return '******';
  const digits = mobile.trim();
  if (digits.length <= 4) return digits;
  return '*'.repeat(digits.length - 4) + digits.slice(-4);
}

/**
 * Masks a 12-digit bank account number, showing only the last 4 digits.
 * Example: "123456789012" -> "********9012"
 *
 * @param {string} accountNumber - 12-digit account number
 * @returns {string} Masked account number string
 */
function maskAccountNumber(accountNumber) {
  if (!accountNumber || typeof accountNumber !== 'string') return '********';
  const clean = accountNumber.trim();
  if (clean.length <= 4) return clean;
  return '*'.repeat(clean.length - 4) + clean.slice(-4);
}

module.exports = {
  maskMobile,
  maskAccountNumber,
};
