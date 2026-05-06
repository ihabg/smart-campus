const express    = require('express');
const router     = express.Router();
const { getFaculty, getFacultyById, getDepartments } = require('../controllers/facultyController');

// Public — no auth required
router.get('/',            getFaculty);
router.get('/departments', getDepartments);
router.get('/:id',         getFacultyById);

module.exports = router;
