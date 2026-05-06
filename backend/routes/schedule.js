const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/scheduleController');
const { protect, restrictTo } = require('../middleware/auth');
const { validateSection, validateUUID, validatePagination } = require('../middleware/validate');

// Student routes
router.get ('/my',    protect, ctrl.getMySchedule);
router.get ('/today', protect, ctrl.getTodaySchedule);
router.post('/enroll',  protect, ctrl.enrollStudent);
router.delete('/enroll/:section_id', protect, ctrl.dropEnrollment);

// Public / shared
router.get ('/', validatePagination, ctrl.getAllSections);

// Admin routes
router.post  ('/',    protect, restrictTo('admin','super_admin'), validateSection, ctrl.createSection);
router.patch ('/:id', protect, restrictTo('admin','super_admin'), validateUUID('id'), ctrl.updateSection);
router.delete('/:id', protect, restrictTo('admin','super_admin'), validateUUID('id'), ctrl.deleteSection);

module.exports = router;
exports.getMySchedule = async (req, res) => {
  try {
    const studentId = req.user.id;

    const semester = req.query.semester || 'spring';
    const academicYear =
      req.query.academic_year || '2025/2026';

    const query = `
      SELECT
        s.id AS section_id,
        s.section_number,
        s.semester,
        s.academic_year,

        c.id AS course_id,
        c.code AS course_code,
        c.name AS course_name,
        c.name_ar AS course_name_ar,
        c.credit_hours,

        CONCAT(i.first_name, ' ', i.last_name)
          AS instructor_name,

        sm.id AS meeting_id,
        sm.day_of_week,
        sm.start_time,
        sm.end_time,
        sm.meeting_type,
        sm.note,

        r.id AS room_id,
        r.room_number

      FROM enrollments e

      JOIN sections s
        ON s.id = e.section_id

      JOIN courses c
        ON c.id = s.course_id

      LEFT JOIN instructors i
        ON i.id = s.instructor_id

      LEFT JOIN section_meetings sm
        ON sm.section_id = s.id

      LEFT JOIN rooms r
        ON r.id = sm.room_id

      WHERE e.student_id = $1
        AND e.status = 'enrolled'
        AND s.semester = $2
        AND s.academic_year = $3

      ORDER BY
        sm.day_of_week,
        sm.start_time,
        c.code
    `;

    const result = await db.query(query, [
      studentId,
      semester,
      academicYear
    ]);

    const rows = result.rows;

    const sectionsMap = new Map();

    rows.forEach((row) => {
      if (!sectionsMap.has(row.section_id)) {
        sectionsMap.set(row.section_id, {
          section_id: row.section_id,
          section_number: row.section_number,
          semester: row.semester,
          academic_year: row.academic_year,

          course_id: row.course_id,
          course_code: row.course_code,
          course_name: row.course_name,
          course_name_ar: row.course_name_ar,
          credit_hours: row.credit_hours,

          instructor_name: row.instructor_name,

          meetings: []
        });
      }

      if (row.meeting_id) {
        sectionsMap.get(row.section_id).meetings.push({
          meeting_id: row.meeting_id,
          day_of_week: row.day_of_week,
          start_time: row.start_time,
          end_time: row.end_time,
          meeting_type: row.meeting_type,
          note: row.note,

          room_id: row.room_id,
          room_number: row.room_number
        });
      }
    });

    const sections = Array.from(
      sectionsMap.values()
    );

    const by_day = {
      0: [],
      1: [],
      2: [],
      3: [],
      4: [],
      5: [],
      6: []
    };

    sections.forEach((section) => {
      section.meetings.forEach((meeting) => {
        by_day[meeting.day_of_week].push({
          ...section,
          ...meeting
        });
      });
    });

    return res.json({
      success: true,
      sections,
      by_day
    });

  } catch (error) {
    console.error('getMySchedule error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to load schedule'
    });
  }
};