// search.js
const express  = require('express');
const sRouter  = express.Router();
const sCtrl    = require('../controllers/searchController');
sRouter.get('/',       sCtrl.globalSearch);
sRouter.get('/rooms',  sCtrl.quickSearchRooms);
sRouter.get('/graph',  sCtrl.getGraph);
module.exports = sRouter;
