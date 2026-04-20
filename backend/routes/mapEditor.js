const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/mapEditorController');
const { protect, restrictTo } = require('../middleware/auth');

router.use(protect, restrictTo('admin','super_admin'));

router.get  ('/:floor_id',           ctrl.getFloorForEditing);
router.post ('/:floor_id/layout',    ctrl.saveFloorLayout);
router.patch('/rooms/:room_id/position', ctrl.saveRoomPosition);

module.exports = router;
