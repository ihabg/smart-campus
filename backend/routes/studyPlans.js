const express = require('express');
const router  = express.Router();
const { protect, restrictTo } = require('../middleware/auth');
const ctrl    = require('../controllers/studyPlanController');

router.use(protect);
router.use(restrictTo('admin', 'super_admin'));

// Static routes BEFORE /:id
router.get('/departments', ctrl.getDepartments);
router.get('/',            ctrl.listPlans);
router.post('/',           ctrl.createPlan);

// Courses within a plan — must come before /:id GET/PATCH/DELETE
router.get('/:id/available-courses',      ctrl.getAvailableCourses);
router.post('/:id/courses',               ctrl.addCourse);
router.patch('/:id/courses/:courseId',    ctrl.updateCourse);
router.delete('/:id/courses/:courseId',   ctrl.removeCourse);

// Plan-level CRUD
router.get('/:id',    ctrl.getPlan);
router.patch('/:id',  ctrl.updatePlan);
router.delete('/:id', ctrl.deletePlan);

module.exports = router;
