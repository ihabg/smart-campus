// routes/courses.js
const express = require('express');
const router = express.Router();

const ctrl = require('../controllers/courseController');

const { protect, restrictTo } = require('../middleware/auth');
const { validateUUID, validatePagination } = require('../middleware/validate');

router.get('/', validatePagination, ctrl.getAllCourses);
router.get('/departments', ctrl.getDepartments);
router.get('/:id', validateUUID('id'), ctrl.getCourseById);

router.post(
  '/',
  protect,
  restrictTo('admin', 'super_admin'),
  ctrl.createCourse
);

router.patch(
  '/:id',
  protect,
  restrictTo('admin', 'super_admin'),
  validateUUID('id'),
  ctrl.updateCourse
);

router.delete(
  '/:id',
  protect,
  restrictTo('admin', 'super_admin'),
  validateUUID('id'),
  ctrl.deleteCourse
);

// ─── Prerequisite management ──────────────────────────────────

router.get('/:id/prerequisites', validateUUID('id'), ctrl.getCoursePrerequisites);

router.post(
  '/:id/prerequisites',
  protect,
  restrictTo('admin', 'super_admin'),
  validateUUID('id'),
  ctrl.addCoursePrerequisite
);

router.patch(
  '/:id/prerequisites/:prerequisiteId',
  protect,
  restrictTo('admin', 'super_admin'),
  validateUUID('id'),
  validateUUID('prerequisiteId'),
  ctrl.updateCoursePrerequisite
);

router.delete(
  '/:id/prerequisites/:prerequisiteId',
  protect,
  restrictTo('admin', 'super_admin'),
  validateUUID('id'),
  validateUUID('prerequisiteId'),
  ctrl.removeCoursePrerequisite
);

module.exports = router;