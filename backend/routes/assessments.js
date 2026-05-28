const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const router = express.Router();

const { protect, restrictTo } = require('../middleware/auth');
const ctrl = require('../controllers/assessmentController');

const submissionDir = path.join(__dirname, '..', 'uploads', 'submissions');
const assessmentDir = path.join(__dirname, '..', 'uploads', 'assessments');
const questionImageDir = path.join(__dirname, '..', 'uploads', 'assessments', 'questions');
fs.mkdirSync(submissionDir, { recursive: true });
fs.mkdirSync(assessmentDir, { recursive: true });
fs.mkdirSync(questionImageDir, { recursive: true });

function safeFileName(originalname) {
  return originalname
    .replace(/[^\w.\-]+/g, '_')
    .replace(/_+/g, '_');
}

const submissionStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, submissionDir),
  filename: (_req, file, cb) => {
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}-${safeFileName(file.originalname)}`);
  }
});

const assessmentStorage = multer.diskStorage({
  destination: (_req, file, cb) => {
    if (file.fieldname === 'question_images') return cb(null, questionImageDir);
    return cb(null, assessmentDir);
  },
  filename: (_req, file, cb) => {
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}-${safeFileName(file.originalname)}`);
  }
});

const allowedAssessmentFiles = [
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
  'image/png',
  'image/jpeg',
  'image/webp'
];

const allowedQuestionImages = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

function assessmentFileFilter(_req, file, cb) {
  if (file.fieldname === 'question_images') {
    if (allowedQuestionImages.includes(file.mimetype)) return cb(null, true);
    return cb(new Error('Unsupported quiz question image. Upload PNG, JPG, WEBP, or GIF images.'));
  }

  if (allowedAssessmentFiles.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Unsupported file type. Upload PDF, Word, PowerPoint, Excel, image, text, or ZIP files.'));
}

const uploadSubmission = multer({
  storage: submissionStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: assessmentFileFilter
});

const uploadAssessment = multer({
  storage: assessmentStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: assessmentFileFilter
});

const uploadAssessmentWithQuestionImages = uploadAssessment.fields([
  { name: 'attachments', maxCount: 10 },
  { name: 'question_images', maxCount: 80 }
]);

router.use(protect);

// Professor routes
router.get('/professor/sections', restrictTo('professor', 'department_head', 'super_admin'), ctrl.listProfessorSections);
router.get('/professor', restrictTo('professor', 'department_head', 'super_admin'), ctrl.listProfessorAssessments);
router.post('/professor', restrictTo('professor', 'department_head', 'super_admin'), uploadAssessmentWithQuestionImages, ctrl.createProfessorAssessment);
router.get('/professor/:assessmentId', restrictTo('professor', 'department_head', 'super_admin'), ctrl.getProfessorAssessmentDetail);
router.patch('/professor/:assessmentId', restrictTo('professor', 'department_head', 'super_admin'), uploadAssessmentWithQuestionImages, ctrl.updateProfessorAssessment);
router.delete('/professor/:assessmentId', restrictTo('professor', 'department_head', 'super_admin'), ctrl.deleteProfessorAssessment);
router.delete('/professor/:assessmentId/attachments/:attachmentId', restrictTo('professor', 'department_head', 'super_admin'), ctrl.deleteProfessorAttachment);
router.get('/professor/:assessmentId/results', restrictTo('professor', 'department_head', 'super_admin'), ctrl.listProfessorResults);
router.patch('/professor/:assessmentId/review', restrictTo('professor', 'department_head', 'super_admin'), ctrl.setQuizReviewAccess);
router.get('/professor/:assessmentId/attempts/:attemptId/review', restrictTo('professor', 'department_head', 'super_admin'), ctrl.getProfessorQuizAttemptReview);
router.patch('/professor/:assessmentId/submissions/:submissionId/grade', restrictTo('professor', 'department_head', 'super_admin'), ctrl.gradeAssignmentSubmission);

// Student routes
router.get('/student', restrictTo('student'), ctrl.listStudentAssessments);
router.get('/student/:assessmentId', restrictTo('student'), ctrl.getStudentAssessment);
router.post('/student/:assessmentId/assignment-submit', restrictTo('student'), uploadSubmission.single('submission'), ctrl.submitAssignment);
router.post('/student/:assessmentId/quiz-start', restrictTo('student'), ctrl.startQuiz);
router.post('/student/:assessmentId/quiz-submit', restrictTo('student'), ctrl.submitQuiz);
router.get('/student/:assessmentId/quiz-review', restrictTo('student'), ctrl.getStudentQuizReview);

module.exports = router;
