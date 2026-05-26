require('dotenv').config();

const { query } = require('../config/db');

let GoogleGenerativeAI = null;
try {
  GoogleGenerativeAI = require('@google/generative-ai').GoogleGenerativeAI;
} catch {
  GoogleGenerativeAI = null;
}

const useGemini = process.env.USE_GEMINI === 'true';
const genAI = useGemini && process.env.GEMINI_API_KEY && GoogleGenerativeAI
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

if (!genAI) {
  console.warn('⚠ GEMINI_API_KEY missing or @google/generative-ai not installed. Chatbot will use local smart replies.');
}

function cleanTime(value) {
  return String(value || '').slice(0, 5);
}

function toMinutes(value = '') {
  const [h, m] = cleanTime(value).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function normalizeText(value = '') {
  return String(value || '').trim().toLowerCase();
}


function wordDigit(token = '') {
  const map = {
    zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5',
    six: '6', seven: '7', eight: '8', nine: '9', oh: '0', o: '0',
    0: '0', 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9'
  };
  return map[String(token).toLowerCase()] || '';
}

function wordsToDigits(value = '') {
  const map = {
    zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5',
    six: '6', seven: '7', eight: '8', nine: '9', oh: '0', o: '0'
  };

  return String(value || '')
    .toLowerCase()
    .split(/\s+/)
    .map((part) => map[part] ?? (part.match(/^\d+$/) ? part : ''))
    .join('')
    .slice(0, 5);
}

function isSpoken180(value = '') {
  const text = String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
  return /^(180|0180|one eighty|one eight zero|one zero eight zero|zero one eighty|zero one eight zero|eighteen zero|one hundred eighty)$/.test(text);
}

function normalizeRoomCode(value = '') {
  const text = String(value || '')
    .toLowerCase()
    .replace(/\brome\b/g, 'room')
    .replace(/\bgee\b/g, 'g')
    .replace(/\bbee\b/g, 'b')
    .replace(/\boh\b|\bo\b/g, 'zero')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const direct = text.match(/\b([gb])\s*0*([0-9]{3,4})\b/i);
  if (direct) {
    const prefix = direct[1].toUpperCase();
    let digits = direct[2];
    if (digits.length === 3) digits = `0${digits}`;
    return `${prefix}${digits}`;
  }

  const prefixMatch = text.match(/\b(?:room\s+)?([gb])\s+(.+)$/i);
  if (!prefixMatch) return null;

  const prefix = prefixMatch[1].toUpperCase();
  const tail = prefixMatch[2]
    .replace(/\bnumber\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (prefix === 'G' && isSpoken180(tail)) return 'G0180';

  if (prefix === 'B') {
    const bFloor = tail.match(/^(one|two|1|2)\s+(.+)$/i);
    if (bFloor && isSpoken180(bFloor[2])) {
      return `B${wordDigit(bFloor[1])}180`;
    }
  }

  const digits = wordsToDigits(tail);
  if (!digits) return null;
  return `${prefix}${digits.length === 3 ? `0${digits}` : digits}`;
}

function extractSearchTerm(text = '') {
  const normalizedRoom = normalizeRoomCode(text);
  if (normalizedRoom) return normalizedRoom;

  const roomCode =
    text.match(/\b(B\s*\d{3,5}|G\s*\d{3,5})\b/i) ||
    text.match(/\b([A-Z]?\d{3,6}[A-Z]?)\b/i);

  if (roomCode) {
    const raw = String(roomCode[1]).replace(/\s+/g, '').toUpperCase();
    const fixed = normalizeRoomCode(raw);
    return fixed || raw;
  }

  return text
    .replace(/where|find|room|rome|classroom|lecture hall|hall|lab|office|map|show|open|go to|take me to|is|the|please/gi, '')
    .trim()
    .slice(0, 60);
}

function extractInstructorTerm(text = '') {
  return text
    .replace(/doctor|dr\.?|professor|prof\.?|instructor|teacher|where|office|find|show|open|is|the|please/gi, '')
    .trim()
    .slice(0, 60);
}

function wantsGreeting(text = '') {
  return /^(hi|hello|hey|good morning|good afternoon|good evening)\b/i.test(text.trim());
}

function wantsSchedule(text = '') {
  return /schedule|class|classes|lecture|lectures|today|tomorrow|next class|course|courses|timetable/i.test(text);
}

function wantsFullSchedule(text = '') {
  return /full schedule|all schedule|whole schedule|all classes|my timetable/i.test(text);
}

function wantsAttendance(text = '') {
  return /attendance|attend|absence|absent|missed|percentage|warning/i.test(text);
}

function wantsRoom(text = '') {
  return /room|classroom|where|map|lab|office|hall|lecture hall|building|floor|show.*map|open.*map|navigate|go to|take me/i.test(text);
}

function wantsInstructor(text = '') {
  return /doctor|dr\b|professor|prof\b|instructor|teacher|office/i.test(text);
}

function wantsNotification(text = '') {
  return /notification|notifications|alert|alerts|unread/i.test(text);
}

function wantsAnnouncement(text = '') {
  return /announcement|announcements|news/i.test(text);
}

function wantsAssessments(text = '') {
  return /quiz|quizzes|assessment|assessments|assignment|assignments|homework|exam|due|deadline|submit|submission/i.test(text);
}

function wantsStudyPlan(text = '') {
  return /study plan|plan|next semester|semester plan|graduate|graduation|credit hours|prerequisite/i.test(text);
}

async function dbTodaySchedule(userId) {
  if (!userId) return [];
  const day = new Date().getDay();

  const result = await query(
    `
    SELECT
      s.id AS section_id,
      c.code,
      c.name AS course_name,
      COALESCE(sm.day_of_week, d.day_value) AS day_of_week,
      COALESCE(sm.start_time, s.start_time) AS start_time,
      COALESCE(sm.end_time, s.end_time) AS end_time,
      CONCAT(i.first_name, ' ', i.last_name) AS instructor,
      r.id AS room_id,
      r.room_number,
      f.id AS floor_id,
      f.floor_label,
      b.code AS building_code,
      b.name AS building_name
    FROM enrollments e
    JOIN sections s ON s.id = e.section_id
    JOIN courses c ON c.id = s.course_id
    LEFT JOIN instructors i ON i.id = s.instructor_id
    LEFT JOIN section_meetings sm ON sm.section_id = s.id AND sm.day_of_week = $2
    LEFT JOIN LATERAL unnest(s.day_of_week) AS d(day_value) ON TRUE
    LEFT JOIN rooms r ON r.id = COALESCE(sm.room_id, s.room_id)
    LEFT JOIN floors f ON f.id = r.floor_id
    LEFT JOIN buildings b ON b.id = f.building_id
    WHERE e.student_id = $1
      AND e.status = 'enrolled'
      AND s.is_active = TRUE
      AND (sm.day_of_week = $2 OR d.day_value = $2)
    ORDER BY COALESCE(sm.start_time, s.start_time), c.code
    `,
    [userId, day]
  );

  const seen = new Set();
  return result.rows.filter((row) => {
    const key = `${row.section_id}-${row.day_of_week}-${cleanTime(row.start_time)}-${cleanTime(row.end_time)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function dbFullSchedule(userId) {
  if (!userId) return [];

  const result = await query(
    `
    SELECT
      s.id AS section_id,
      s.section_number,
      c.code,
      c.name AS course_name,
      c.credit_hours,
      COALESCE(sm.day_of_week, d.day_value) AS day_of_week,
      COALESCE(sm.start_time, s.start_time) AS start_time,
      COALESCE(sm.end_time, s.end_time) AS end_time,
      CONCAT(i.first_name, ' ', i.last_name) AS instructor,
      r.id AS room_id,
      r.room_number,
      f.id AS floor_id,
      f.floor_label
    FROM enrollments e
    JOIN sections s ON s.id = e.section_id
    JOIN courses c ON c.id = s.course_id
    LEFT JOIN instructors i ON i.id = s.instructor_id
    LEFT JOIN section_meetings sm ON sm.section_id = s.id
    LEFT JOIN LATERAL unnest(s.day_of_week) AS d(day_value) ON sm.id IS NULL
    LEFT JOIN rooms r ON r.id = COALESCE(sm.room_id, s.room_id)
    LEFT JOIN floors f ON f.id = r.floor_id
    WHERE e.student_id = $1
      AND e.status = 'enrolled'
      AND s.is_active = TRUE
    ORDER BY COALESCE(sm.day_of_week, d.day_value), COALESCE(sm.start_time, s.start_time), c.code
    `,
    [userId]
  );

  return result.rows;
}

async function dbAttendance(userId) {
  if (!userId) return [];

  const result = await query(
    `
    SELECT
      c.code,
      c.name AS course_name,
      COUNT(a.id) FILTER (WHERE a.status IN ('present', 'late')) AS present_count,
      COUNT(a.id) AS total_count,
      ROUND(
        COUNT(a.id) FILTER (WHERE a.status IN ('present', 'late')) * 100.0
        / NULLIF(COUNT(a.id), 0)
      ) AS percentage
    FROM enrollments e
    JOIN sections s ON s.id = e.section_id
    JOIN courses c ON c.id = s.course_id
    LEFT JOIN attendance a ON a.student_id = e.student_id AND a.section_id = e.section_id
    WHERE e.student_id = $1
      AND e.status = 'enrolled'
      AND s.is_active = TRUE
    GROUP BY c.id, c.code, c.name
    ORDER BY c.code
    `,
    [userId]
  );

  return result.rows;
}

async function dbRooms(term) {
  if (!term || String(term).trim().length < 2) return [];

  const result = await query(
    `
    SELECT
      r.id,
      r.room_number,
      r.name,
      r.type,
      r.capacity,
      r.coord_x,
      r.coord_y,
      f.id AS floor_id,
      f.floor_number,
      f.floor_label,
      b.id AS building_id,
      b.code AS building_code,
      b.name AS building_name
    FROM rooms r
    JOIN floors f ON f.id = r.floor_id
    JOIN buildings b ON b.id = f.building_id
    WHERE r.is_active = TRUE
      AND (
        r.room_number ILIKE $1
        OR r.name ILIKE $1
        OR r.type::text ILIKE $1
        OR COALESCE(r.department, '') ILIKE $1
      )
    ORDER BY
      CASE WHEN r.room_number ILIKE $2 THEN 0 ELSE 1 END,
      r.room_number
    LIMIT 8
    `,
    [`%${term}%`, `${term}%`]
  );

  return result.rows;
}

async function dbInstructor(term) {
  if (!term || String(term).trim().length < 2) return [];

  const result = await query(
    `
    SELECT
      i.id,
      i.title,
      i.first_name,
      i.last_name,
      i.department,
      i.email,
      COALESCE(r.room_number, 'N/A') AS office,
      r.id AS room_id,
      f.id AS floor_id,
      f.floor_label
    FROM instructors i
    LEFT JOIN rooms r ON r.id = i.office_room_id
    LEFT JOIN floors f ON f.id = r.floor_id
    WHERE i.is_active = TRUE
      AND (
        i.first_name ILIKE $1
        OR i.last_name ILIKE $1
        OR CONCAT(i.first_name, ' ', i.last_name) ILIKE $1
        OR COALESCE(i.email, '') ILIKE $1
      )
    ORDER BY i.last_name
    LIMIT 5
    `,
    [`%${term}%`]
  );

  return result.rows;
}

async function dbNotifications(userId, limit = 5) {
  if (!userId) return [];

  const result = await query(
    `
    SELECT
      n.id,
      n.title,
      n.body,
      n.type,
      nr.is_read,
      n.created_at
    FROM notification_receipts nr
    JOIN notifications n ON n.id = nr.notification_id
    WHERE nr.user_id = $1
      AND n.is_published = TRUE
    ORDER BY n.created_at DESC
    LIMIT $2
    `,
    [userId, limit]
  );

  return result.rows;
}

async function dbAnnouncements(limit = 4) {
  const result = await query(
    `
    SELECT
      id,
      title,
      content AS body,
      is_pinned,
      published_at,
      created_at
    FROM announcements
    WHERE is_published = TRUE
      AND (expires_at IS NULL OR expires_at > NOW())
    ORDER BY is_pinned DESC, COALESCE(published_at, created_at) DESC
    LIMIT $1
    `,
    [limit]
  );

  return result.rows;
}

async function dbAssessments(userId, limit = 8) {
  if (!userId) return [];

  const result = await query(
    `
    SELECT
      a.id,
      a.title,
      a.description,
      a.assessment_type,
      a.opens_at,
      a.closes_at,
      a.points,
      a.duration_minutes,
      a.allow_review,
      c.code AS course_code,
      c.name AS course_name,
      s.section_number,
      sub.id AS submission_id,
      sub.submitted_at,
      sub.status AS submission_status,
      sub.grade,
      att.id AS attempt_id,
      att.started_at,
      att.submitted_at AS quiz_submitted_at,
      att.status AS attempt_status,
      att.score,
      CASE
        WHEN a.assessment_type = 'assignment' AND sub.id IS NOT NULL THEN 'Submitted'
        WHEN a.assessment_type = 'quiz' AND att.status = 'submitted' THEN 'Submitted'
        WHEN NOW() < a.opens_at THEN 'Scheduled'
        WHEN NOW() > a.closes_at THEN 'Closed'
        ELSE 'Open now'
      END AS status
    FROM course_assessments a
    JOIN sections s ON s.id = a.section_id
    JOIN courses c ON c.id = a.course_id
    JOIN enrollments e ON e.section_id = s.id
    LEFT JOIN assignment_submissions sub ON sub.assessment_id = a.id AND sub.student_id = e.student_id
    LEFT JOIN quiz_attempts att ON att.assessment_id = a.id AND att.student_id = e.student_id
    WHERE e.student_id = $1
      AND e.status = 'enrolled'
      AND a.is_published = TRUE
    ORDER BY
      CASE WHEN NOW() BETWEEN a.opens_at AND a.closes_at THEN 0
           WHEN NOW() < a.opens_at THEN 1
           ELSE 2 END,
      a.closes_at ASC
    LIMIT $2
    `,
    [userId, limit]
  );

  return result.rows;
}

function buildScheduleCards(schedule) {
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  return {
    type: 'schedule',
    items: schedule.map((item) => ({
      section_id: item.section_id,
      code: item.code,
      course_name: item.course_name,
      start_time: cleanTime(item.start_time),
      end_time: cleanTime(item.end_time),
      room_number: item.room_number || 'TBA',
      room_id: item.room_id,
      floor_id: item.floor_id,
      instructor: item.instructor || 'TBA',
      is_current: nowMinutes >= toMinutes(item.start_time) && nowMinutes < toMinutes(item.end_time)
    }))
  };
}

function buildRoomCards(rooms) {
  return {
    type: 'rooms',
    items: rooms.map((room) => ({
      ...room,
      room_id: room.id
    }))
  };
}

function buildAssessmentCards(assessments) {
  return {
    type: 'assessments',
    items: assessments.map((item) => ({
      id: item.id,
      title: item.title,
      assessment_type: item.assessment_type,
      status: item.status,
      course_code: item.course_code,
      course_name: item.course_name,
      section_number: item.section_number,
      opens_at: item.opens_at,
      closes_at: item.closes_at,
      points: item.points,
      score: item.score,
      grade: item.grade
    }))
  };
}

function buildLocalReply({ message, user, todaySchedule, fullSchedule, attendance, notifications, announcements, rooms, instructors, assessments }) {
  const text = normalizeText(message);

  if (wantsGreeting(message)) {
    return {
      message: `Hello${user?.first_name ? ` ${user.first_name}` : ''}! 👋 I’m Najah Assistant, your Smart Campus guide. Ask me about your classes, quizzes, assignments, attendance, announcements, or any campus room.`,
      cards: null,
      action: null
    };
  }

  if (/who are you|what are you|your name|introduce yourself|tell me about yourself/i.test(message)) {
    return {
      message: `I’m Najah Assistant — your personal Smart Campus guide at An-Najah National University. I’m connected to your university database, so I can help you check today’s classes, find rooms on the campus map, review attendance, see quizzes and assignments, follow announcements, and understand your academic information faster. You can ask me naturally, for example: “Do I have quizzes?”, “Where is room 1180?”, or “What classes do I have today?”`,
      cards: null,
      action: null
    };
  }

  if (wantsAssessments(message)) {
    const filtered = assessments.filter((item) => {
      if (/quiz|quizzes/i.test(text)) return item.assessment_type === 'quiz';
      if (/assignment|assignments|homework|submit|submission/i.test(text)) return item.assessment_type === 'assignment';
      return true;
    });

    if (filtered.length === 0) {
      return {
        message: 'I did not find any published quizzes or assignments for your enrolled courses right now.',
        cards: null,
        action: { type: 'show_assessments' }
      };
    }

    const openCount = filtered.filter((item) => item.status === 'Open now').length;
    const scheduledCount = filtered.filter((item) => item.status === 'Scheduled').length;
    const submittedCount = filtered.filter((item) => item.status === 'Submitted').length;

    return {
      message: `I found ${filtered.length} item(s) for your enrolled courses: ${openCount} open now, ${scheduledCount} scheduled, and ${submittedCount} submitted.`,
      cards: buildAssessmentCards(filtered),
      action: { type: 'show_assessments' }
    };
  }

  if (wantsFullSchedule(message)) {
    if (fullSchedule.length === 0) {
      return { message: 'I could not find a registered schedule for you.', cards: null, action: { type: 'show_schedule' } };
    }
    const sectionCount = new Set(fullSchedule.map((item) => item.section_id)).size;
    return {
      message: `You have ${sectionCount} registered section(s). Here are the first items from your schedule.`,
      cards: buildScheduleCards(fullSchedule.slice(0, 8)),
      action: { type: 'show_schedule' }
    };
  }

  if (wantsSchedule(message)) {
    if (todaySchedule.length === 0) {
      return {
        message: 'You do not have any classes scheduled today.',
        cards: null,
        action: { type: 'show_schedule' }
      };
    }

    const lines = todaySchedule.map((item) => `• ${item.code} — ${item.course_name}: ${cleanTime(item.start_time)}-${cleanTime(item.end_time)} | Room ${item.room_number || 'TBA'}`);
    return {
      message: `You have ${todaySchedule.length} class(es) today:\n${lines.join('\n')}`,
      cards: buildScheduleCards(todaySchedule),
      action: { type: 'show_schedule' }
    };
  }

  if (wantsAttendance(message)) {
    if (attendance.length === 0) {
      return { message: 'No attendance data is available yet.', cards: null, action: null };
    }
    return {
      message: 'Here is your attendance summary from the database.',
      cards: {
        type: 'attendance',
        items: attendance.map((item) => ({
          code: item.code,
          course_name: item.course_name,
          present: Number(item.present_count || 0),
          total: Number(item.total_count || 0),
          percentage: Number(item.percentage || 0)
        }))
      },
      action: null
    };
  }

  if (wantsInstructor(message)) {
    if (instructors.length === 0) {
      return { message: 'I could not find an instructor with that name. Try the first or last name.', cards: null, action: null };
    }

    const first = instructors[0];
    return {
      message: `${first.title || 'Dr.'} ${first.first_name} ${first.last_name} is in ${first.department || 'N/A'}. Office: ${first.office || 'N/A'}.`,
      cards: first.room_id ? buildRoomCards([{ ...first, id: first.room_id, room_number: first.office, name: `${first.title || 'Dr.'} ${first.first_name} ${first.last_name} office`, type: 'office' }]) : null,
      action: first.room_id ? { type: 'show_room', room_id: first.room_id, room_number: first.office, floor_id: first.floor_id } : null
    };
  }

  if (wantsRoom(message)) {
    if (rooms.length === 0) {
      return {
        message: 'I could not find a matching room. Try a room number like 111060, 1180, or a lab name.',
        cards: null,
        action: { type: 'open_map' }
      };
    }

    const first = rooms[0];
    return {
      message: `I found ${rooms.length} matching room(s). The closest match is **${first.room_number}** on ${first.floor_label || 'the selected floor'} in ${first.building_name || 'the building'}. Tap the room card to open it directly on the campus map.`,
      cards: buildRoomCards(rooms),
      action: { type: 'show_room', room_id: first.id, room_number: first.room_number, floor_id: first.floor_id }
    };
  }

  if (wantsNotification(message)) {
    if (notifications.length === 0) {
      return { message: 'You have no recent notifications.', cards: null, action: null };
    }
    return { message: 'Here are your latest notifications.', cards: { type: 'notifications', items: notifications }, action: null };
  }

  if (wantsAnnouncement(message)) {
    if (announcements.length === 0) {
      return { message: 'There are no published announcements right now.', cards: null, action: null };
    }
    return { message: 'Here are the latest published announcements.', cards: { type: 'announcements', items: announcements }, action: null };
  }

  if (wantsStudyPlan(message)) {
    return {
      message: 'I can help you review your study plan. Open the Study Plan page, choose the courses you want for next semester, then ask me to evaluate the plan. I will check credits, prerequisites, and balance.',
      cards: null,
      action: null
    };
  }

  return {
    message: 'I can help with your schedule, rooms, attendance, assignments, quizzes, announcements, and instructors. Try: “Do I have quizzes?”, “Where is room 1180?”, or “What classes do I have today?”',
    cards: null,
    action: null
  };
}

function parseGeminiResponse(raw = '') {
  const re = /\[ACTION:(\{[^[\]]*\})\]/g;
  const actions = [];
  let match;

  while ((match = re.exec(raw)) !== null) {
    try { actions.push(JSON.parse(match[1])); } catch { /* ignore */ }
  }

  return {
    text: raw.replace(/\[ACTION:[^\]]*\]/g, '').replace(/\n{3,}/g, '\n\n').trim(),
    action: actions[0] || null
  };
}

function buildSystemPrompt({ user, todaySchedule, attendance, assessments, rooms, instructors, announcements }) {
  const now = new Date().toLocaleString('en-US');
  return `
You are Najah Assistant inside the Smart Campus system at An-Najah National University.
Reply in English only. Keep answers concise, professional, and based only on the supplied database data.
Current time: ${now}
Student: ${user ? `${user.first_name || ''} ${user.last_name || ''} (${user.student_id || user.id})` : 'Guest'}

Today schedule:
${todaySchedule.length ? todaySchedule.map((s) => `${s.code} ${s.course_name} ${cleanTime(s.start_time)}-${cleanTime(s.end_time)} room ${s.room_number || 'TBA'}`).join('\n') : 'No classes today'}

Attendance:
${attendance.length ? attendance.map((a) => `${a.code}: ${a.percentage || 0}%`).join('\n') : 'No attendance data'}

Assessments:
${assessments.length ? assessments.map((a) => `${a.assessment_type} ${a.title} ${a.course_code} status ${a.status} due ${a.closes_at}`).join('\n') : 'No assessments'}

Rooms:
${rooms.length ? rooms.map((r) => `${r.room_number} ${r.name} ${r.floor_label} ${r.building_name}`).join('\n') : 'No room search results'}

Instructors:
${instructors.length ? instructors.map((i) => `${i.title || ''} ${i.first_name} ${i.last_name} office ${i.office}`).join('\n') : 'No instructor search results'}

Announcements:
${announcements.length ? announcements.map((a) => a.title).join('\n') : 'No announcements'}
`;
}

async function askGemini(systemPrompt, message, history = []) {
  if (!genAI) return null;

  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
    systemInstruction: systemPrompt,
    generationConfig: {
      temperature: 0.25,
      topP: 0.85,
      maxOutputTokens: 420
    }
  });

  const safeHistory = history
    .filter((item) => item.role && item.text)
    .slice(-8)
    .map((item) => ({
      role: item.role === 'model' || item.role === 'bot' ? 'model' : 'user',
      parts: [{ text: String(item.text).slice(0, 900) }]
    }));

  const session = model.startChat({ history: safeHistory });
  const response = await Promise.race([
    session.sendMessage(message),
    new Promise((_, reject) => setTimeout(() => reject(new Error('GEMINI_TIMEOUT')), 9000))
  ]);

  return parseGeminiResponse(response.response.text());
}

async function chat(req, res, next) {
  try {
    const { message, history = [] } = req.body;
    const user = req.user || null;
    const userId = user?.id || null;

    if (!message || !String(message).trim()) {
      return res.status(400).json({ success: false, message: 'Message required.' });
    }

    const text = String(message).trim();
    const roomTerm = wantsRoom(text) ? extractSearchTerm(text) : '';
    const instructorTerm = wantsInstructor(text) ? extractInstructorTerm(text) : '';

    const [
      todaySchedule,
      fullSchedule,
      attendance,
      notifications,
      announcements,
      rooms,
      instructors,
      assessments
    ] = await Promise.all([
      dbTodaySchedule(userId).catch((err) => { console.error('Chat schedule error:', err.message); return []; }),
      dbFullSchedule(userId).catch((err) => { console.error('Chat full schedule error:', err.message); return []; }),
      (wantsAttendance(text) || wantsGreeting(text))
        ? dbAttendance(userId).catch((err) => { console.error('Chat attendance error:', err.message); return []; })
        : Promise.resolve([]),
      userId
        ? dbNotifications(userId).catch((err) => { console.error('Chat notification error:', err.message); return []; })
        : Promise.resolve([]),
      dbAnnouncements().catch((err) => { console.error('Chat announcement error:', err.message); return []; }),
      roomTerm
        ? dbRooms(roomTerm).catch((err) => { console.error('Chat rooms error:', err.message); return []; })
        : Promise.resolve([]),
      instructorTerm
        ? dbInstructor(instructorTerm).catch((err) => { console.error('Chat instructor error:', err.message); return []; })
        : Promise.resolve([]),
      userId
        ? dbAssessments(userId).catch((err) => { console.error('Chat assessments error:', err.message); return []; })
        : Promise.resolve([])
    ]);

    const local = buildLocalReply({
      message: text,
      user,
      todaySchedule,
      fullSchedule,
      attendance,
      notifications,
      announcements,
      rooms,
      instructors,
      assessments
    });

    let reply = local.message;
    let action = local.action;
    let cards = local.cards;

    const shouldUseAI = Boolean(
      genAI &&
      !wantsRoom(text) &&
      !wantsSchedule(text) &&
      !wantsAttendance(text) &&
      !wantsNotification(text) &&
      !wantsAnnouncement(text) &&
      !wantsAssessments(text)
    );

    if (shouldUseAI) {
      try {
        const ai = await askGemini(
          buildSystemPrompt({ user, todaySchedule, attendance, assessments, rooms, instructors, announcements }),
          text,
          history
        );

        if (ai?.text) {
          reply = ai.text;
          action = ai.action || action;
        }
      } catch (err) {
        console.error('Gemini fallback used:', err.message);
      }
    }

    if (action?.type === 'show_room' && action.room_number && !action.room_id) {
      const foundRooms = await dbRooms(action.room_number).catch(() => []);
      if (foundRooms[0]) {
        action = {
          type: 'show_room',
          room_id: foundRooms[0].id,
          room_number: foundRooms[0].room_number,
          floor_id: foundRooms[0].floor_id
        };
      }
    }

    return res.json({
      success: true,
      data: {
        message: reply,
        lang: 'en',
        action,
        cards,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    next(error);
  }
}

async function getHistory(req, res) {
  return res.json({ success: true, data: { history: [] } });
}

module.exports = {
  chat,
  getHistory
};
