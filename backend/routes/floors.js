const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/floorController');
const { protect, restrictTo } = require('../middleware/auth');
const { uploadMap } = require('../config/multer');
const { validateFloor, validateUUID } = require('../middleware/validate');

router.get ('/',           ctrl.getAllFloors);
router.get ('/buildings',  ctrl.getBuildings);
router.get ('/:id',        validateUUID('id'), ctrl.getFloorById);
router.post('/',           protect, restrictTo('admin','super_admin'), validateFloor, ctrl.createFloor);
router.patch('/:id',       protect, restrictTo('admin','super_admin'), validateUUID('id'), ctrl.updateFloor);
router.post('/:id/map',    protect, restrictTo('admin','super_admin'), validateUUID('id'), uploadMap.single('map'), ctrl.uploadFloorMap);
router.delete('/:id',      protect, restrictTo('admin','super_admin'), validateUUID('id'), ctrl.deleteFloor);

module.exports = router;
