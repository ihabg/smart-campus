const { validationResult, body, param, query } = require('express-validator');

/**
 * Run after validator chains — returns 422 if any errors exist.
 */
function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      success: false,
      message: 'Validation failed',
      errors:  errors.array().map(e => ({ field: e.path, message: e.msg })),
    });
  }
  next();
}

// ─── Auth validators ────────────────────────────────────────

const validateRegister = [
  body('first_name').trim().notEmpty().withMessage('First name is required').isLength({ max: 100 }),
  body('last_name').trim().notEmpty().withMessage('Last name is required').isLength({ max: 100 }),
  body('email').trim().isEmail().withMessage('Valid email required').normalizeEmail(),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter')
    .matches(/[0-9]/).withMessage('Password must contain a number'),
  body('student_id').optional().trim().isLength({ max: 20 }),
  body('department').optional().trim().isLength({ max: 100 }),
  body('year_of_study').optional().isInt({ min: 1, max: 6 }).withMessage('Year must be 1–6'),
  handleValidation,
];

const validateLogin = [
  // Accept either `identifier` (new shape) or `email` (legacy shape) — at least one required.
  body().custom((_, { req }) => {
    const id = (req.body.identifier || req.body.email || '').trim();
    if (!id) throw new Error('Email or registration number is required');
    return true;
  }),
  body('password').notEmpty().withMessage('Password is required'),
  handleValidation,
];

const validateChangePassword = [
  body('current_password').notEmpty().withMessage('Current password required'),
  body('new_password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Must contain an uppercase letter')
    .matches(/[0-9]/).withMessage('Must contain a number'),
  handleValidation,
];

// ─── Floor validators ────────────────────────────────────────

const validateFloor = [
  body('building_id').isUUID().withMessage('Valid building ID required'),
  body('floor_number').isInt({ min: -5, max: 50 }).withMessage('Floor number must be an integer'),
  body('floor_label').trim().notEmpty().withMessage('Floor label required').isLength({ max: 20 }),
  body('name').optional().trim().isLength({ max: 200 }),
  handleValidation,
];

// ─── Room validators ─────────────────────────────────────────

const ROOM_TYPES = [
  'classroom',
  'lecture_hall',
  'lab',
  'office',
  'corridor',
  'restroom',
  'bathroom',
  'elevator',
  'stairs',
  'emergency_exit',
  'storage',
  'atrium',
  'meeting_room',
  'library',
  'cafeteria',
  'bookstore',
  'amphitheater',
  'professor_lounge',
  'engineering_drawing_room',
  'engineering_drawing_studio',
  'other',
];

const validateRoom = [
  body('floor_id')
    .isUUID()
    .withMessage('Valid floor ID required'),

  body('room_number')
    .trim()
    .notEmpty()
    .withMessage('Room number required')
    .isLength({ max: 100 })
    .withMessage('Room number must be at most 100 characters'),

  body('name')
    .trim()
    .notEmpty()
    .withMessage('Room name required')
    .isLength({ max: 255 })
    .withMessage('Room name must be at most 255 characters'),

  body('type')
    .customSanitizer(value => {
      const type = String(value || 'classroom')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_');

      if (type === 'emergency_stairs') return 'emergency_exit';

      return type;
    })
    .isIn(ROOM_TYPES)
    .withMessage(`Type must be one of: ${ROOM_TYPES.join(', ')}`),

  body('department')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ max: 255 })
    .withMessage('Department must be at most 255 characters'),

  body('capacity')
    .optional({ nullable: true, checkFalsy: true })
    .isInt({ min: 0, max: 32767 })
    .withMessage('Capacity must be a positive integer or zero'),

body('lecturer_number')
  .optional({ nullable: true, checkFalsy: true })
  .trim()
  .matches(/^\d{4}$/)
  .withMessage('Lecturer number must be exactly 4 digits'),

  body('coord_x')
    .optional({ nullable: true, checkFalsy: true })
    .isFloat({ min: 0, max: 100 })
    .withMessage('coord_x must be between 0 and 100'),

  body('coord_y')
    .optional({ nullable: true, checkFalsy: true })
    .isFloat({ min: 0, max: 100 })
    .withMessage('coord_y must be between 0 and 100'),

  body('coord_width')
    .optional({ nullable: true, checkFalsy: true })
    .isFloat({ min: 0, max: 100 })
    .withMessage('coord_width must be between 0 and 100'),

  body('coord_height')
    .optional({ nullable: true, checkFalsy: true })
    .isFloat({ min: 0, max: 100 })
    .withMessage('coord_height must be between 0 and 100'),

  body('is_accessible')
    .optional()
    .isBoolean()
    .withMessage('is_accessible must be boolean')
    .toBoolean(),

  handleValidation,
];
// ─── Schedule validators ─────────────────────────────────────

const validateSection = [
  body('course_id').isUUID().withMessage('Valid course ID required'),
  body('room_id').optional().isUUID().withMessage('Valid room ID required'),
  body('instructor_id').optional().isUUID(),
  body('semester').isIn(['fall','spring','summer']).withMessage('Invalid semester'),
  body('academic_year').matches(/^\d{4}\/\d{4}$/).withMessage('Academic year format: YYYY/YYYY'),
  body('section_number').trim().notEmpty().withMessage('Section number required'),
  body('day_of_week').isArray({ min: 1 }).withMessage('At least one day required'),
  body('day_of_week.*').isInt({ min: 0, max: 6 }).withMessage('Day must be 0 (Sun) to 6 (Sat)'),
  body('start_time').matches(/^\d{2}:\d{2}$/).withMessage('Start time format: HH:MM'),
  body('end_time').matches(/^\d{2}:\d{2}$/).withMessage('End time format: HH:MM'),
  handleValidation,
];

// ─── Notification validators ─────────────────────────────────

const validateNotification = [
  body('title').trim().notEmpty().withMessage('Title required').isLength({ max: 300 }),
  body('body').trim().notEmpty().withMessage('Body required'),
  body('type').optional().isIn(['announcement','schedule_change','room_change','exam_reminder','system','custom']),
  handleValidation,
];

// ─── UUID param validator (strict — RFC 4122 v1-v5) ──────────

const validateUUID = (paramName = 'id') => [
  param(paramName).isUUID().withMessage(`${paramName} must be a valid UUID`),
  handleValidation,
];

// ─── UUID format validator (loose — 8-4-4-4-12 hex only) ─────
// Use for tables whose PKs are UUID-typed but not RFC 4122-compliant
// (e.g. hand-crafted seed IDs like 11111111-0000-0000-0000-000000000001).

const validateUUIDFormat = (paramName = 'id') => [
  param(paramName)
    .matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    .withMessage(`${paramName} must be a valid UUID`),
  handleValidation,
];

// ─── Pagination validator ─────────────────────────────────────

const validatePagination = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be >= 1'),
  query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('Limit must be 1–1000'),
  handleValidation,
];

module.exports = {
  handleValidation,
  validateRegister,
  validateLogin,
  validateChangePassword,
  validateFloor,
  validateRoom,
  validateSection,
  validateNotification,
  validateUUID,
  validateUUIDFormat,
  validatePagination,
};
