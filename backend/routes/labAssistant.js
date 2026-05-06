const express = require('express');
const router  = express.Router();
const { protect, restrictTo } = require('../middleware/auth');
const ctrl = require('../controllers/labAssistantController');

router.use(protect);
router.use(restrictTo('lab_assistant','super_admin'));

router.get('/dashboard',    ctrl.getDashboard);
router.patch('/lab-status', ctrl.updateLabStatus);

module.exports = router;
