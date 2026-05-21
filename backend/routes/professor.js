const express = require('express');
const router  = express.Router();
const { protect, restrictTo } = require('../middleware/auth');
const ctrl = require('../controllers/professorController');

router.use(protect);
router.use(restrictTo('professor','department_head','super_admin'));

router.get('/dashboard',                              ctrl.getDashboard);
router.get('/schedule',                               ctrl.getSchedule);
router.get('/rooms',                                  ctrl.getRoomsForChange);
router.post('/sections/:sectionId/meeting-change',    ctrl.changeMeeting);
router.get('/sections/:sectionId/students',           ctrl.getSectionStudents);
router.get('/sections/:sectionId/attendance',         ctrl.getAttendance);
router.get('/sections/:sectionId/attendance/summary', ctrl.getAttendanceSummary);
router.post('/attendance',                            ctrl.markAttendance);
router.post('/grades/bulk',                           ctrl.saveGradesBulk);
router.post('/warning',                               ctrl.sendAttendanceWarning);

module.exports = router;
