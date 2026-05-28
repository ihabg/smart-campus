const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const router  = express.Router();
const { protect, restrictTo } = require('../middleware/auth');
const ctrl = require('../controllers/professorController');

const materialUploadDir = path.join(__dirname, '..', 'uploads', 'materials');
fs.mkdirSync(materialUploadDir, { recursive: true });

const materialStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, materialUploadDir),
  filename: (_req, file, cb) => {
    const safeOriginal = file.originalname
      .replace(/[^\w.\-]+/g, '_')
      .replace(/_+/g, '_');

    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}-${safeOriginal}`);
  }
});

const uploadMaterial = multer({
  storage: materialStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'application/zip',
      'application/x-zip-compressed',
      'application/x-rar-compressed',
      'image/png',
      'image/jpeg',
      'image/webp',
      'video/mp4',
      'video/quicktime'
    ];

    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported material file type.'));
    }
  }
});

const uploadGradeFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
      cb(null, true);
    } else {
      cb(new Error('Only .xlsx files are accepted for grade import.'));
    }
  }
});


router.use(protect);
router.use(restrictTo('professor','department_head','super_admin'));

router.get('/dashboard',                              ctrl.getDashboard);
router.get('/terms',                                  ctrl.getProfessorTerms);
router.get('/schedule',                               ctrl.getSchedule);
router.get('/rooms',                                  ctrl.getRoomsForChange);
router.get('/materials',                              ctrl.getMaterials);
router.post('/materials/upload',                      uploadMaterial.single('material'), ctrl.uploadMaterialFile);
router.post('/materials/:materialId/open',            ctrl.recordMaterialOpen);
router.post('/materials',                             ctrl.createMaterial);
router.patch('/materials/:materialId',                ctrl.updateMaterial);
router.delete('/materials/:materialId',               ctrl.deleteMaterial);
router.get('/office-hours',                           ctrl.getOfficeHours);
router.post('/office-hours',                          ctrl.saveOfficeHour);
router.delete('/office-hours/:officeHourId',          ctrl.deleteOfficeHour);
router.get('/office-hour-bookings',                   ctrl.getOfficeHourBookings);
router.patch('/office-hour-bookings/:bookingId',      ctrl.respondOfficeHourBooking);
router.get('/messages',                               ctrl.getCourseMessages);
router.post('/messages',                              ctrl.createCourseMessage);
router.delete('/messages/:messageId',                 ctrl.deleteCourseMessage);
router.get('/meeting-changes',                        ctrl.getChangeHistory);
router.delete('/meeting-changes/:changeId',           ctrl.cancelMeetingChange);
router.get('/analytics',                              ctrl.getAnalytics);
router.post('/sections/:sectionId/meeting-change',    ctrl.changeMeeting);
router.get('/sections/:sectionId/students',           ctrl.getSectionStudents);
router.get('/sections/:sectionId/export/grades',                           ctrl.exportGradesCsv);
router.post('/sections/:sectionId/import/grades', uploadGradeFile.single('grades_file'), ctrl.importGrades);
router.get('/sections/:sectionId/export/attendance',                        ctrl.exportAttendanceCsv);
router.get('/sections/:sectionId/attendance',         ctrl.getAttendance);
router.get('/sections/:sectionId/attendance/summary', ctrl.getAttendanceSummary);
router.post('/attendance',                            ctrl.markAttendance);
router.post('/grades/bulk',                           ctrl.saveGradesBulk);
router.post('/warning',                               ctrl.sendAttendanceWarning);

module.exports = router;
