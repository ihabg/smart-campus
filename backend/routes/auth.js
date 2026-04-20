// routes/auth.js
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { validateRegister, validateLogin, validateChangePassword } = require('../middleware/validate');

router.post('/register',        validateRegister,        ctrl.register);
router.post('/login',           validateLogin,           ctrl.login);
router.post('/refresh',                                  ctrl.refreshToken);
router.post('/logout',          protect,                 ctrl.logout);
router.get ('/me',              protect,                 ctrl.getMe);
router.patch('/me/password',    protect, validateChangePassword, ctrl.changePassword);
router.patch('/me/fcm-token',   protect,                 ctrl.updateFcmToken);

module.exports = router;
