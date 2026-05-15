const express = require('express');
const router = express.Router();

const ctrl = require('../controllers/instructorController');

const { protect, restrictTo } = require('../middleware/auth');
const { validateUUID, validatePagination } = require('../middleware/validate');

router.get('/', validatePagination, ctrl.getAllInstructors);
router.get('/:id', validateUUID('id'), ctrl.getInstructorById);

router.post(
  '/',
  protect,
  restrictTo('admin', 'super_admin'),
  ctrl.createInstructor
);

router.patch(
  '/:id',
  protect,
  restrictTo('admin', 'super_admin'),
  validateUUID('id'),
  ctrl.updateInstructor
);

router.delete(
  '/:id',
  protect,
  restrictTo('admin', 'super_admin'),
  validateUUID('id'),
  ctrl.deleteInstructor
);

module.exports = router;