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

module.exports = router;