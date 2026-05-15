const express = require('express');
const router = express.Router();

const ctrl = require('../controllers/scheduleController');

const { protect, restrictTo } = require('../middleware/auth');
const {
  validateSection,
  validateUUID,
  validatePagination
} = require('../middleware/validate');

// Student routes
router.get('/my', protect, ctrl.getMySchedule);
router.get('/today', protect, ctrl.getTodaySchedule);
router.post('/enroll', protect, ctrl.enrollStudent);
router.delete('/enroll/:section_id', protect, ctrl.dropEnrollment);

// Public / shared
router.get('/', validatePagination, ctrl.getAllSections);

// Admin routes
router.post(
  '/',
  protect,
  restrictTo('admin', 'super_admin'),
  validateSection,
  ctrl.createSection
);

router.patch(
  '/:id',
  protect,
  restrictTo('admin', 'super_admin'),
  validateUUID('id'),
  ctrl.updateSection
);

router.delete(
  '/:id',
  protect,
  restrictTo('admin', 'super_admin'),
  validateUUID('id'),
  ctrl.deleteSection
);

module.exports = router;