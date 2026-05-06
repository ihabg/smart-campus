const express = require('express');
const router  = express.Router();
const { protect, restrictTo } = require('../middleware/auth');
const ctrl = require('../controllers/deanController');

router.use(protect);
router.use(restrictTo('dean','super_admin'));

router.get('/dashboard',    ctrl.getDashboard);
router.get('/departments',  ctrl.getDepartments);
router.get('/stats',        ctrl.getFacultyStats);

module.exports = router;
