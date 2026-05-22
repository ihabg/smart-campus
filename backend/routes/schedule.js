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

// ── Admin-only routes (named, must be before /:id) ────────────
// Stats for Semester Management dashboard cards
router.get(
  '/stats',
  protect,
  restrictTo('admin', 'super_admin'),
  ctrl.getSemesterStats
);

// All meetings for the Timetable tab
router.get(
  '/meetings',
  protect,
  restrictTo('admin', 'super_admin'),
  ctrl.getSemesterMeetings
);

// Room availability for map-based section assignment
router.get(
  '/room-availability',
  protect,
  restrictTo('admin', 'super_admin'),
  ctrl.getRoomAvailability
);

// Admin CRUD routes
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