// routes/courses.js
const express = require('express');
const cRouter = express.Router();
const cCtrl   = require('../controllers/courseController');
const { protect, restrictTo } = require('../middleware/auth');
const { validateUUID, validatePagination } = require('../middleware/validate');

cRouter.get ('/',              validatePagination, cCtrl.getAllCourses);
cRouter.get ('/departments',   cCtrl.getDepartments);
cRouter.get ('/:id',           validateUUID('id'), cCtrl.getCourseById);
cRouter.post('/',              protect, restrictTo('admin','super_admin'), cCtrl.createCourse);
cRouter.patch('/:id',          protect, restrictTo('admin','super_admin'), validateUUID('id'), cCtrl.updateCourse);
cRouter.delete('/:id',         protect, restrictTo('admin','super_admin'), validateUUID('id'), cCtrl.deleteCourse);

module.exports = cRouter;
