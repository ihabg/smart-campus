const express    = require('express');
const { protect, restrictTo } = require('../middleware/auth');
const ctrl       = require('../controllers/activityLogController');

const router = express.Router();

router.get('/', protect, restrictTo('admin', 'super_admin'), ctrl.getActivityLogs);

module.exports = router;
