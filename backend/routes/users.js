const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/userController');
const { protect, restrictTo } = require('../middleware/auth');
const { uploadAvatar }        = require('../config/multer');
const { validateUUID, validatePagination } = require('../middleware/validate');

// All routes require authentication
router.use(protect);

// Student routes
router.get   ('/me/profile',     ctrl.updateMyProfile); // GET own profile via /auth/me
router.patch ('/me/profile',     ctrl.updateMyProfile);
router.post  ('/me/avatar',      uploadAvatar.single('avatar'), ctrl.uploadAvatar);

// Admin-only routes
router.get   ('/',               restrictTo('admin','super_admin'), validatePagination, ctrl.getAllUsers);
router.get   ('/stats',          restrictTo('admin','super_admin'), ctrl.getDashboardStats);
router.get   ('/:id',            restrictTo('admin','super_admin'), validateUUID('id'), ctrl.getUserById);
router.patch ('/:id',            restrictTo('admin','super_admin'), validateUUID('id'), ctrl.adminUpdateUser);
router.delete('/:id',            restrictTo('super_admin'),         validateUUID('id'), ctrl.deleteUser);

module.exports = router;
