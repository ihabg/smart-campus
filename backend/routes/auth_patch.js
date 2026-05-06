const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/auth');
const {
  forgotPassword,
  resetPassword,
  requestPasswordChange,
  confirmPasswordChange,
} = require('../controllers/authController_patch');

// Public — no auth needed
router.post('/forgot-password',  forgotPassword);
router.post('/reset-password',   resetPassword);

// Protected — logged in users only
router.post('/request-password-change', protect, requestPasswordChange);
router.post('/confirm-password-change', protect, confirmPasswordChange);

module.exports = router;
