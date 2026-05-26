const express = require('express');
const router  = express.Router();
const { protect, restrictTo } = require('../middleware/auth');
const ctrl    = require('../controllers/studentController');
const advisor = require('../controllers/studyPlanAdvisorController');

// All routes require a valid student token
router.use(protect);
router.use(restrictTo('student'));

router.get('/study-plan', ctrl.getStudyPlan);

// Study Plan Advisor / Chatbot endpoints
router.get('/study-plan/advisor/context', advisor.getContext);
router.post('/study-plan/advisor/recommend', advisor.recommend);
router.post('/study-plan/advisor/evaluate', advisor.evaluate);
router.post('/study-plan/advisor/chat', advisor.chat);

module.exports = router;
