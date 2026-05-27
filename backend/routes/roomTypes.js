const express  = require('express');
const router   = express.Router();
const ctrl     = require('../controllers/roomTypeController');
const { protect, restrictTo } = require('../middleware/auth');

const adminOnly = [protect, restrictTo('admin', 'super_admin')];

// Public — no auth required (student map and Add Room dropdowns both need this).
router.get('/', ctrl.getRoomTypes);

// Admin-only — all types including inactive, plus CRUD
router.get('/admin',        ...adminOnly, ctrl.adminList);
router.post('/',            ...adminOnly, ctrl.adminCreate);
router.patch('/:id/toggle', ...adminOnly, ctrl.adminToggleActive);
router.patch('/:id',        ...adminOnly, ctrl.adminUpdate);

module.exports = router;
