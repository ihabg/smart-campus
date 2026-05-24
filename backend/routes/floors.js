const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/floorController');
const { protect, restrictTo } = require('../middleware/auth');
const { uploadMap } = require('../config/multer');
const { validateFloor, validateUUID, validateUUIDFormat } = require('../middleware/validate');

router.get   ('/',                   ctrl.getAllFloors);
router.get   ('/buildings',          ctrl.getBuildings);
router.get   ('/buildings/manage',   protect, restrictTo('admin','super_admin'), ctrl.getBuildingsAdmin);
router.post  ('/buildings',          protect, restrictTo('admin','super_admin'), ctrl.createBuilding);
router.patch ('/buildings/:id',      protect, restrictTo('admin','super_admin'), validateUUIDFormat('id'), ctrl.updateBuilding);
router.delete('/buildings/:id',      protect, restrictTo('admin','super_admin'), validateUUIDFormat('id'), ctrl.deleteBuilding);
router.get   ('/:id',                validateUUID('id'), ctrl.getFloorById);
router.post  ('/',                   protect, restrictTo('admin','super_admin'), validateFloor, ctrl.createFloor);
router.patch ('/:id',                protect, restrictTo('admin','super_admin'), validateUUID('id'), ctrl.updateFloor);
router.post  ('/:id/map',            protect, restrictTo('admin','super_admin'), validateUUID('id'), uploadMap.single('map'), ctrl.uploadFloorMap);
router.delete('/:id',                protect, restrictTo('admin','super_admin'), validateUUID('id'), ctrl.deleteFloor);

module.exports = router;
