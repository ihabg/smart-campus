const express = require('express');
const router  = express.Router();
const { protect, restrictTo } = require('../middleware/auth');
const ctrl    = require('../controllers/studentController');

// All routes require a valid student token
router.use(protect);
router.use(restrictTo('student'));

router.get('/study-plan', ctrl.getStudyPlan);

module.exports = router;
