// AppError.js - an error whose message is SAFE to show to the user.
// Throw this for expected problems (wrong input, not found...).
// Any other error is treated as a bug and the user only sees a generic message.
class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;       // HTTP status code, e.g. 400, 401, 404
    this.expose = true;         // marks the message as safe to send
  }
}
module.exports = { AppError };
