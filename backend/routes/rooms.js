const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/roomController');
const { protect, restrictTo } = require('../middleware/auth');
const { validateRoom, validateUUID } = require('../middleware/validate');

router.get('/', ctrl.getRoomsByFloor);
router.get('/number/:roomNumber', ctrl.getRoomByNumber);
router.get('/available-now', protect, ctrl.getRoomsAvailableNow);
router.get('/:roomId/live-status', protect, ctrl.getRoomLiveStatus);
router.get('/:id/instructors', validateUUID('id'), ctrl.getAssignedInstructors);
router.get('/:id', validateUUID('id'), ctrl.getRoomById);
router.post('/',                    protect, restrictTo('admin','super_admin'), validateRoom, ctrl.createRoom);
router.patch('/bulk-coordinates',   protect, restrictTo('admin','super_admin'), ctrl.bulkUpdateCoordinates);
router.patch('/adjacency',          protect, restrictTo('admin','super_admin'), ctrl.setAdjacency);
router.patch('/:id',                protect, restrictTo('admin','super_admin'), validateUUID('id'), ctrl.updateRoom);
router.delete('/:id',               protect, restrictTo('admin','super_admin'), validateUUID('id'), ctrl.deleteRoom);

module.exports = router;
