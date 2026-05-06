const express = require('express');
const router  = express.Router();
const { protect, restrictTo } = require('../middleware/auth');
const ctrl = require('../controllers/secretaryController');

router.use(protect);
router.use(restrictTo('secretary','department_head','super_admin'));

router.get('/dashboard',                     ctrl.getDashboard);
router.get('/students',                      ctrl.getStudents);
router.post('/enroll',                       ctrl.enrollStudent);
router.patch('/enrollment/:enrollment_id',   ctrl.approveEnrollment);

module.exports = router;
