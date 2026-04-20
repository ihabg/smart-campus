const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/announcementController');
const { protect, restrictTo } = require('../middleware/auth');
const { uploadAnnouncement }  = require('../config/multer');
const { validateUUID, validatePagination } = require('../middleware/validate');

router.get ('/',    validatePagination, ctrl.getAnnouncements);
router.get ('/:id', validateUUID('id'), ctrl.getAnnouncementById);

router.post  ('/',    protect, restrictTo('admin','super_admin'), uploadAnnouncement.single('image'), ctrl.createAnnouncement);
router.patch ('/:id', protect, restrictTo('admin','super_admin'), validateUUID('id'), uploadAnnouncement.single('image'), ctrl.updateAnnouncement);
router.delete('/:id', protect, restrictTo('admin','super_admin'), validateUUID('id'), ctrl.deleteAnnouncement);

module.exports = router;
