const express = require('express');
const router  = express.Router();
const { protect, restrictTo } = require('../middleware/auth');
const ctrl = require('../controllers/deptHeadController');

router.use(protect);
router.use(restrictTo('department_head','dean','super_admin'));

router.get('/dashboard',        ctrl.getDashboard);
router.get('/professors',       ctrl.getProfessors);
router.post('/assign-professor',ctrl.assignProfessor);

module.exports = router;
