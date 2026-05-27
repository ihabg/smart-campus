const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/eventController');
const { protect, restrictTo } = require('../middleware/auth');

router.use(protect);
router.use(restrictTo('admin', 'super_admin'));

router.get ('/',                ctrl.listEvents);
router.post('/',                ctrl.createEvent);
router.get ('/conflicts',       ctrl.getConflicts);
router.get ('/available-rooms', ctrl.getAvailableRooms);

module.exports = router;
