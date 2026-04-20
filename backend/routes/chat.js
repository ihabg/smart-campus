const express = require('express');
const router  = express.Router();
const { chat, getHistory } = require('../controllers/chatController');
const { protect, optionalAuth } = require('../middleware/auth');

// Chat endpoint — works for logged-in users (gets schedule) and guests (room search only)
router.post('/',        optionalAuth, chat);
router.get ('/history', protect,      getHistory);

module.exports = router;
