const { verifyAccessToken } = require('../utils/jwt');
const { query }             = require('../config/db');

/**
 * Protect routes — requires a valid Bearer JWT.
 */
async function protect(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No token provided. Please log in.' });
    }

    const token   = authHeader.split(' ')[1];
    const decoded = verifyAccessToken(token);

    // Verify user still exists and is active
    const result = await query(
      'SELECT id, email, role, status, first_name, last_name, department FROM users WHERE id = $1',
      [decoded.id]
    );

    if (!result.rows.length) {
      return res.status(401).json({ success: false, message: 'User no longer exists.' });
    }

    const user = result.rows[0];
    if (user.status !== 'active') {
      return res.status(403).json({ success: false, message: 'Account is suspended or inactive.' });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired. Please log in again.' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, message: 'Invalid token.' });
    }
    next(error);
  }
}

/**
 * Restrict access to specific roles.
 * @param {...string} roles - allowed roles
 */
function restrictTo(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Not authenticated.' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${roles.join(' or ')}.`,
      });
    }
    next();
  };
}

/**
 * Optional auth — attaches user if token present, but does not block.
 */
async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token   = authHeader.split(' ')[1];
      const decoded = verifyAccessToken(token);
      const result  = await query(
        'SELECT id, email, role, status, first_name, last_name FROM users WHERE id = $1 AND status = $2',
        [decoded.id, 'active']
      );
      if (result.rows.length) req.user = result.rows[0];
    }
  } catch {
    // ignore errors — user just won't be attached
  }
  next();
}

module.exports = { protect, restrictTo, optionalAuth };
