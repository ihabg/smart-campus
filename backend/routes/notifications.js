const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/notificationController');
const { protect, restrictTo } = require('../middleware/auth');
const { validateNotification, validateUUID, validatePagination } = require('../middleware/validate');

router.use(protect);

router.get ('/',              validatePagination, ctrl.getMyNotifications);
router.patch('/read-all',                         ctrl.markAllAsRead);
router.patch('/:id/read',     validateUUID('id'), ctrl.markAsRead);

// Admin
router.get  ('/all',          restrictTo('admin','super_admin'), validatePagination, ctrl.getAllNotifications);
router.post ('/',             restrictTo('admin','super_admin'), validateNotification, ctrl.createNotification);
router.delete('/:id',         restrictTo('admin','super_admin'), validateUUID('id'), ctrl.deleteNotification);

module.exports = router;
