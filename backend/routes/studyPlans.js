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

// Batch assignments — must come before /:id GET/PATCH/DELETE
router.get('/:id/batch-assignments',          ctrl.listBatchAssignments);
router.post('/:id/batch-assignments',         ctrl.assignBatch);
router.delete('/:id/batch-assignments/:year', ctrl.removeBatchAssignment);

// Category requirements — must come before /:id GET/PATCH/DELETE
router.get('/:id/category-requirements',                   ctrl.listCategoryRequirements);
router.put('/:id/category-requirements/:category',         ctrl.upsertCategoryRequirement);
router.delete('/:id/category-requirements/:category',      ctrl.deleteCategoryRequirement);

// Plan-level CRUD
router.get('/:id',    ctrl.getPlan);
router.patch('/:id',  ctrl.updatePlan);
router.delete('/:id', ctrl.deletePlan);

module.exports = router;
