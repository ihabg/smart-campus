/**
 * Global Express error handler.
 * Must be registered LAST with app.use().
 */
function errorHandler(err, req, res, next) {  // eslint-disable-line no-unused-vars
  let statusCode = err.statusCode || err.status || 500;
  let message    = err.message    || 'Internal server error';

  // PostgreSQL errors
  if (err.code === '23505') {
    statusCode = 409;
    const field = err.detail?.match(/\(([^)]+)\)/)?.[1] || 'field';
    message = `${field} already exists.`;
  } else if (err.code === '23503') {
    statusCode = 400;
    message = 'Referenced record does not exist.';
  } else if (err.code === '22P02') {
    statusCode = 400;
    message = 'Invalid UUID format.';
  }

  // Multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    statusCode = 413;
    message = `File too large. Maximum allowed size is ${process.env.MAX_FILE_SIZE_MB || 10}MB.`;
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    statusCode = 400;
    message = 'Unexpected file field.';
  }

  // CORS errors
  if (err.message?.includes('CORS')) {
    statusCode = 403;
  }

  // Log 500s
  if (statusCode >= 500) {
    console.error(`[${new Date().toISOString()}] 500 Error:`, err);
  }

  const response = {
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && {
      stack: err.stack,
      code:  err.code,
    }),
  };

  res.status(statusCode).json(response);
}

/**
 * Create a structured API error.
 */
class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = errorHandler;
module.exports.AppError = AppError;
