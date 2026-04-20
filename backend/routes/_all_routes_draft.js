// ─── floors.js ───────────────────────────────────────────────
const express  = require('express');
const fRouter  = express.Router();
const fCtrl    = require('../controllers/floorController');
const { protect, restrictTo } = require('../middleware/auth');
const { uploadMap }  = require('../config/multer');
const { validateFloor, validateUUID } = require('../middleware/validate');

fRouter.get (''/buildings',          fCtrl.getBuildings);
fRouter.get ('/',                    fCtrl.getAllFloors);
fRouter.get ('/:id',                 validateUUID('id'), fCtrl.getFloorById);
fRouter.post('/',                    protect, restrictTo('admin','super_admin'), validateFloor, fCtrl.createFloor);
fRouter.patch('/:id',                protect, restrictTo('admin','super_admin'), validateUUID('id'), fCtrl.updateFloor);
fRouter.post ('/:id/map',            protect, restrictTo('admin','super_admin'), validateUUID('id'), uploadMap.single('map'), fCtrl.uploadFloorMap);
fRouter.delete('/:id',               protect, restrictTo('admin','super_admin'), validateUUID('id'), fCtrl.deleteFloor);

module.exports = fRouter;
