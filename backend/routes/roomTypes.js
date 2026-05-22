const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/roomTypeController');

// Public — no auth required. Student map and admin pages both need this.
router.get('/', ctrl.getRoomTypes);

module.exports = router;
