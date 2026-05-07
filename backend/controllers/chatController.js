require('dotenv').config();

const { query } = require('../config/db');

let GoogleGenerativeAI = null;
try {
  GoogleGenerativeAI = require('@google/generative-ai').GoogleGenerativeAI;
} catch {
  GoogleGenerativeAI = null;
}

const useGemini = process.env.USE_GEMINI === 'true';

const genAI =
  useGemini && process.env.GEMINI_API_KEY && GoogleGenerativeAI
    ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    : null;

if (!genAI) {
  console.warn('⚠ GEMINI_API_KEY missing or @google/generative-ai not installed. Chatbot will use local smart replies.');
}

function detectLang(text = '') {
  return /[\u0600-\u06FF]/.test(text) ? 'ar' : 'en';
}

function cleanTime(time) {
  return String(time || '').slice(0, 5);
}

function toMinutes(time = '') {
  const [h, m] = cleanTime(time).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function extractSearchTerm(text = '') {
  const roomCode =
    text.match(/\b([A-Z]?\d{3,6}[A-Z]?)\b/i) ||
    text.match(/\b(B\d{3,5}|G\d{3,5})\b/i);

  if (roomCode) return roomCode[1];

  return text
    .replace(/وين|فين|أين|where|find|room|غرفة|قاعة|مختبر|lab|office|مكتب|is|the|show|map/gi, '')
    .trim()
    .slice(0, 50);
}

function extractInstructorTerm(text = '') {
  return text
    .replace(/دكتور|الدكتور|أستاذ|استاذ|doctor|dr\.?|professor|prof\.?|instructor|teacher|where|office|مكتب|وين|فين|أين/gi, '')
    .trim()
    .slice(0, 50);
}

function parseGeminiResponse(raw = '') {
  const re = /\[ACTION:(\{[^[\]]*\})\]/g;
  const actions = [];
  let match;

  while ((match = re.exec(raw)) !== null) {
    try {
      actions.push(JSON.parse(match[1]));
    } catch {
      // ignore invalid action
    }
  }

  return {
    text: raw.replace(/\[ACTION:[^\]]*\]/g, '').replace(/\n{3,}/g, '\n\n').trim(),
    action: actions[0] || null
  };
}

async function dbRooms(term) {
  if (!term || term.length < 2) return [];

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
      r.coord_width,
      r.coord_height,
      f.id AS floor_id,
      f.floor_number,
      f.floor_label,
      b.id AS building_id,
      b.code AS building_code,
      b.name AS building_name
    FROM rooms r
    JOIN floors f ON f.id = r.floor_id
    JOIN buildings b ON b.id = f.building_id
    WHERE r.is_active = true
      AND (
        r.room_number ILIKE $1
        OR r.name ILIKE $1
        OR r.type::text ILIKE $1
        OR COALESCE(r.department, '') ILIKE $1
      )
    ORDER BY r.room_number
    LIMIT 6
    `,
    [`%${term}%`]
  );

  return result.rows;
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
      COALESCE(c.name_ar, c.name) AS course_name_ar,
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
    LEFT JOIN section_meetings sm
      ON sm.section_id = s.id
     AND sm.day_of_week = $2
    LEFT JOIN LATERAL unnest(s.day_of_week) AS d(day_value) ON true
    LEFT JOIN rooms r ON r.id = COALESCE(sm.room_id, s.room_id)
    LEFT JOIN floors f ON f.id = r.floor_id
    LEFT JOIN buildings b ON b.id = f.building_id
    WHERE e.student_id = $1
      AND e.status = 'enrolled'
      AND s.is_active = true
      AND (
        sm.day_of_week = $2
        OR d.day_value = $2
      )
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
      COALESCE(c.name_ar, c.name) AS course_name_ar,
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
      AND s.is_active = true
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
    LEFT JOIN attendance a
      ON a.student_id = e.student_id
     AND a.section_id = e.section_id
    WHERE e.student_id = $1
      AND e.status = 'enrolled'
      AND s.is_active = true
    GROUP BY c.id, c.code, c.name
    ORDER BY c.code
    `,
    [userId]
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
      AND n.is_published = true
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
    WHERE is_published = true
      AND (expires_at IS NULL OR expires_at > NOW())
    ORDER BY is_pinned DESC, COALESCE(published_at, created_at) DESC
    LIMIT $1
    `,
    [limit]
  );

  return result.rows;
}

async function dbInstructor(term) {
  if (!term || term.length < 2) return [];

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
    WHERE i.is_active = true
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

function wantsSchedule(text) {
  return /schedule|class|today|lecture|course|next|جدول|اليوم|محاضرة|مادة|حصة|دوام/i.test(text);
}

function wantsAttendance(text) {
  return /attend|attendance|absence|absent|حضور|غياب|نسبة|حرمان/i.test(text);
}

function wantsNotification(text) {
  return /notification|notifications|notif|unread|إشعار|اشعار|تنبيه/i.test(text);
}

function wantsAnnouncement(text) {
  return /announcement|announcements|news|إعلان|اعلان|أخبار|اخبار/i.test(text);
}

function wantsRoom(text) {
  return /room|where|map|lab|office|hall|غرفة|قاعة|مختبر|مكتب|خريطة|وين|فين|أين|اعرض|show/i.test(text);
}

function wantsInstructor(text) {
  return /doctor|dr\b|professor|prof\b|instructor|teacher|دكتور|أستاذ|استاذ|مدرس|محاضر/i.test(text);
}

function buildScheduleCards(schedule) {
  const nowMins = new Date().getHours() * 60 + new Date().getMinutes();

  return {
    type: 'schedule',
    items: schedule.map((s) => ({
      code: s.code,
      course_name: s.course_name_ar || s.course_name,
      start_time: cleanTime(s.start_time),
      end_time: cleanTime(s.end_time),
      room_number: s.room_number || 'TBA',
      room_id: s.room_id,
      floor_id: s.floor_id,
      instructor: s.instructor || 'TBA',
      is_current: nowMins >= toMinutes(s.start_time) && nowMins < toMinutes(s.end_time)
    }))
  };
}

function buildLocalReply({
  message,
  lang,
  user,
  todaySchedule,
  fullSchedule,
  attendance,
  notifications,
  announcements,
  rooms,
  instructors
}) {
  const isAr = lang === 'ar';
  const lower = message.toLowerCase();

  if (/hello|hi|hey|مرحبا|اهلا|أهلا|السلام/i.test(message)) {
    return {
      message: isAr
        ? `أهلاً ${user?.first_name || ''}! أنا مساعد النجاح الذكي. أقدر أساعدك بالجدول، القاعات، الحضور، الإعلانات، والخريطة.`
        : `Hello ${user?.first_name || ''}! I can help with your schedule, rooms, attendance, announcements, and campus map.`,
      cards: null,
      action: null
    };
    
  }
  if (
  /who are you|what are you|introduce yourself|your name|مين انت|مين انتا|من انت|شو اسمك|اسمك ايش|عرف عن نفسك/i.test(message)
) {
  return {
    message: isAr
      ? 'أنا مساعد النجاح الذكي، مساعد افتراضي داخل نظام Smart Campus في جامعة النجاح الوطنية. أساعدك في معرفة جدولك، القاعات، الخريطة، الحضور، الإعلانات، ومعلومات المدرسين. يمكنك أن تسألني مثلاً: "شو محاضراتي اليوم؟" أو "وين قاعة 111060؟"'
      : 'I am Najah Smart Assistant, the virtual assistant inside the Smart Campus system at An-Najah National University. I can help you with your schedule, rooms, campus map, attendance, announcements, and instructor information. For example, ask: “What classes do I have today?” or “Where is room 111060?”',
    cards: null,
    action: null
  };
}

  if (wantsSchedule(message)) {
    if (todaySchedule.length === 0) {
      return {
        message: isAr
          ? 'لا يوجد لديك محاضرات اليوم حسب الجدول الحالي.'
          : 'You do not have any classes scheduled today.',
        cards: null,
        action: { type: 'show_schedule' }
      };
    }

    const lines = todaySchedule.map((s) => {
      const room = s.room_number ? `Room ${s.room_number}` : 'Room TBA';
      return `• ${s.code} — ${s.course_name_ar || s.course_name}: ${cleanTime(s.start_time)}-${cleanTime(s.end_time)} | ${room}`;
    });

    return {
      message: isAr
        ? `محاضراتك اليوم:\n${lines.join('\n')}`
        : `Your classes today:\n${lines.join('\n')}`,
      cards: buildScheduleCards(todaySchedule),
      action: { type: 'show_schedule' }
    };
  }

  if (/all schedule|full schedule|كل الجدول|جدولي كامل/i.test(lower)) {
    if (fullSchedule.length === 0) {
      return {
        message: isAr ? 'لا يوجد جدول مسجل لك حالياً.' : 'No registered schedule was found.',
        cards: null,
        action: { type: 'show_schedule' }
      };
    }

    return {
      message: isAr
        ? `لديك ${new Set(fullSchedule.map((s) => s.section_id)).size} مواد مسجلة. اضغط عرض الجدول لرؤية التفاصيل.`
        : `You have ${new Set(fullSchedule.map((s) => s.section_id)).size} registered sections. Open the schedule page for details.`,
      cards: buildScheduleCards(fullSchedule.slice(0, 8)),
      action: { type: 'show_schedule' }
    };
  }

  if (wantsAttendance(message)) {
    if (attendance.length === 0) {
      return {
        message: isAr
          ? 'لا توجد بيانات حضور متاحة حالياً.'
          : 'No attendance data is available yet.',
        cards: null,
        action: null
      };
    }

    return {
      message: isAr
        ? 'هذه نسب الحضور المتوفرة لديك:'
        : 'Here is your available attendance summary:',
      cards: {
        type: 'attendance',
        items: attendance.map((a) => ({
          code: a.code,
          course_name: a.course_name,
          present: Number(a.present_count || 0),
          total: Number(a.total_count || 0),
          percentage: Number(a.percentage || 0)
        }))
      },
      action: null
    };
  }

  if (wantsRoom(message)) {
    if (rooms.length === 0) {
      return {
        message: isAr
          ? 'لم أجد قاعة مطابقة. جرّب كتابة رقم القاعة مثل 111060 أو اسم المختبر.'
          : 'I could not find a matching room. Try a room number like 111060 or a lab name.',
        cards: null,
        action: { type: 'open_map' }
      };
    }

    const first = rooms[0];

    return {
      message: isAr
        ? `وجدت ${rooms.length} نتيجة. أقرب نتيجة هي **${first.room_number}** في ${first.floor_label || 'floor'} داخل ${first.building_name}.`
        : `I found ${rooms.length} result(s). The closest match is **${first.room_number}** on ${first.floor_label || 'the floor'} in ${first.building_name}.`,
      cards: {
        type: 'rooms',
        items: rooms.map((r) => ({ ...r, room_id: r.id }))
      },
      action: {
        type: 'show_room',
        room_id: first.id,
        floor_id: first.floor_id
      }
    };
  }

  if (wantsInstructor(message)) {
    if (instructors.length === 0) {
      return {
        message: isAr
          ? 'لم أجد مدرساً بهذا الاسم. جرّب كتابة الاسم الأول أو الأخير.'
          : 'I could not find an instructor with that name. Try the first or last name.',
        cards: null,
        action: null
      };
    }

    const first = instructors[0];

    return {
      message: isAr
        ? `${first.title || 'د.'} ${first.first_name} ${first.last_name} من قسم ${first.department || 'غير محدد'}. المكتب: ${first.office || 'غير متوفر'}.`
        : `${first.title || 'Dr.'} ${first.first_name} ${first.last_name} is in ${first.department || 'N/A'}. Office: ${first.office || 'N/A'}.`,
      cards: null,
      action: first.room_id
        ? { type: 'show_room', room_id: first.room_id, floor_id: first.floor_id }
        : null
    };
  }

  if (wantsNotification(message)) {
    if (notifications.length === 0) {
      return {
        message: isAr ? 'لا توجد إشعارات جديدة.' : 'You have no recent notifications.',
        cards: null,
        action: null
      };
    }

    return {
      message: isAr ? 'هذه آخر إشعاراتك:' : 'Here are your latest notifications:',
      cards: { type: 'notifications', items: notifications },
      action: null
    };
  }

  if (wantsAnnouncement(message)) {
    if (announcements.length === 0) {
      return {
        message: isAr ? 'لا توجد إعلانات منشورة حالياً.' : 'There are no published announcements right now.',
        cards: null,
        action: null
      };
    }

    return {
      message: isAr ? 'هذه آخر الإعلانات:' : 'Here are the latest announcements:',
      cards: { type: 'announcements', items: announcements },
      action: null
    };
  }

  return {
    message: isAr
      ? 'أقدر أساعدك في: جدولك، القاعات، الخريطة، الحضور، الإعلانات، أو معلومات المدرسين. جرّب مثلاً: "وين قاعة 111060؟" أو "شو محاضراتي اليوم؟"'
      : 'I can help with your schedule, rooms, map, attendance, announcements, or instructors. Try: “Where is room 111060?” or “What classes do I have today?”',
    cards: null,
    action: null
  };
}

function buildSystemPrompt({
  user,
  todaySchedule,
  fullSchedule,
  attendance,
  notifications,
  announcements,
  rooms,
  instructors
}) {
  const today = new Date().toLocaleDateString('en-GB');
  const time = new Date().toLocaleTimeString('en', {
    hour: '2-digit',
    minute: '2-digit'
  });

  return `
You are Najah Smart Assistant, the AI assistant inside the Smart Campus system at An-Najah National University.

Current date/time: ${today} ${time}

Rules:
- Reply in Arabic if the user writes Arabic.
- Reply in English if the user writes English.
- Be concise and useful.
- Never invent schedules, rooms, attendance, instructors, or announcements.
- Use only the data below.
- If navigation is useful, append an action marker at the end:
[ACTION:{"type":"show_room","room_number":"111060"}]
[ACTION:{"type":"show_schedule"}]
[ACTION:{"type":"open_map"}]

User:
${user ? `${user.first_name || ''} ${user.last_name || ''} | ${user.role} | ${user.student_id || ''}` : 'Guest'}

Today schedule:
${todaySchedule.length ? todaySchedule.map((s) => `${s.code} ${s.course_name_ar || s.course_name} ${cleanTime(s.start_time)}-${cleanTime(s.end_time)} room ${s.room_number || 'TBA'}`).join('\n') : 'No classes today'}

Full schedule count:
${fullSchedule.length}

Attendance:
${attendance.length ? attendance.map((a) => `${a.code}: ${a.percentage || 0}%`).join('\n') : 'No attendance data'}

Notifications:
${notifications.length ? notifications.map((n) => `${n.is_read ? '' : '[UNREAD] '}${n.title}`).join('\n') : 'No notifications'}

Announcements:
${announcements.length ? announcements.map((a) => a.title).join('\n') : 'No announcements'}

Room search results:
${rooms.length ? rooms.map((r) => `${r.room_number} ${r.name} ${r.floor_label} ${r.building_name}`).join('\n') : 'No room search results'}

Instructor search results:
${instructors.length ? instructors.map((i) => `${i.title || ''} ${i.first_name} ${i.last_name} office ${i.office}`).join('\n') : 'No instructor search results'}
`;
}

async function askGemini(systemPrompt, message, history = []) {
  if (!genAI) return null;

  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
    systemInstruction: systemPrompt,
    generationConfig: {
      temperature: 0.35,
      topP: 0.85,
      maxOutputTokens: 500
    }
  });

  const safeHistory = history
    .filter((h) => h.role && h.text)
    .slice(-8)
    .map((h) => ({
      role: h.role === 'model' || h.role === 'bot' ? 'model' : 'user',
      parts: [{ text: String(h.text).slice(0, 1000) }]
    }));

  const session = model.startChat({ history: safeHistory });

  const geminiCall = session.sendMessage(message);
  const timeoutGuard = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('GEMINI_TIMEOUT')), 10000);
  });

  const result = await Promise.race([geminiCall, timeoutGuard]);
  const raw = result.response.text();

  return parseGeminiResponse(raw);
}

async function chat(req, res, next) {
  try {
    const { message, history = [] } = req.body;
    const user = req.user || null;
    const userId = user?.id || null;

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Message required.'
      });
    }

    const text = message.trim();
    const lang = detectLang(text);

    const roomTerm = wantsRoom(text) ? extractSearchTerm(text) : '';
    const instructorTerm = wantsInstructor(text) ? extractInstructorTerm(text) : '';

    const [
      todaySchedule,
      fullSchedule,
      attendance,
      notifications,
      announcements,
      rooms,
      instructors
    ] = await Promise.all([
      dbTodaySchedule(userId).catch((err) => {
        console.error('Chat schedule error:', err.message);
        return [];
      }),
      dbFullSchedule(userId).catch((err) => {
        console.error('Chat full schedule error:', err.message);
        return [];
      }),
      wantsAttendance(text)
        ? dbAttendance(userId).catch((err) => {
            console.error('Chat attendance error:', err.message);
            return [];
          })
        : Promise.resolve([]),
      userId
        ? dbNotifications(userId).catch((err) => {
            console.error('Chat notifications error:', err.message);
            return [];
          })
        : Promise.resolve([]),
      dbAnnouncements().catch((err) => {
        console.error('Chat announcements error:', err.message);
        return [];
      }),
      roomTerm
        ? dbRooms(roomTerm).catch((err) => {
            console.error('Chat rooms error:', err.message);
            return [];
          })
        : Promise.resolve([]),
      instructorTerm
        ? dbInstructor(instructorTerm).catch((err) => {
            console.error('Chat instructor error:', err.message);
            return [];
          })
        : Promise.resolve([])
    ]);

    const local = buildLocalReply({
      message: text,
      lang,
      user,
      todaySchedule,
      fullSchedule,
      attendance,
      notifications,
      announcements,
      rooms,
      instructors
    });

    let reply = local.message;
    let action = local.action;
    let cards = local.cards;

    const shouldUseAI =
      genAI &&
      !wantsRoom(text) &&
      !wantsAttendance(text) &&
      !wantsSchedule(text) &&
      !wantsNotification(text) &&
      !wantsAnnouncement(text);

    if (shouldUseAI) {
      try {
        const systemPrompt = buildSystemPrompt({
          user,
          todaySchedule,
          fullSchedule,
          attendance,
          notifications,
          announcements,
          rooms,
          instructors
        });

        const ai = await askGemini(systemPrompt, text, history);

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
          floor_id: foundRooms[0].floor_id
        };
      }
    }

    return res.json({
      success: true,
      data: {
        message: reply,
        lang,
        action,
        cards,
        timestamp: new Date().toISOString()
      }
    });
  } catch (err) {
    next(err);
  }
}

async function getHistory(req, res) {
  return res.json({
    success: true,
    data: {
      history: []
    }
  });
}

module.exports = {
  chat,
  getHistory
};