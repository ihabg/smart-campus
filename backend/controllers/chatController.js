require('dotenv').config();
const { query }              = require('../config/db');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// ── Gemini client (initialised once, reused across requests) ──
const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

if (!genAI) console.warn('⚠  GEMINI_API_KEY missing — AI chat unavailable');

// ══════════════════════════════════════════════════════════════
//  UTILITY HELPERS
// ══════════════════════════════════════════════════════════════

function detectLang(text) {
  return (text.match(/[؀-ۿ]/g) || []).length > 1 ? 'ar' : 'en';
}

/** Pull a room code or short search term from free text. */
function extractSearchTerm(text) {
  const roomCode = text.match(/\b([a-z]\d{2,4}[a-z]?)\b/i)
                || text.match(/\b(\d{3,4})\b/);
  if (roomCode) return roomCode[1];
  return text
    .replace(/وين|فين|where\s*is|find|room|غرفة|قاعة|مختبر|lab|office|مكتب|the|is/gi, '')
    .trim()
    .slice(0, 40);
}

/**
 * Extract [ACTION:{…}] markers from Gemini's text.
 * Returns the clean text (without markers) + the first valid action object.
 */
function parseGeminiResponse(raw) {
  const re = /\[ACTION:(\{[^[\]]*\})\]/g;
  const actions = [];
  let m;
  while ((m = re.exec(raw)) !== null) {
    try { actions.push(JSON.parse(m[1])); } catch { /* ignore malformed */ }
  }
  const text = raw.replace(/\[ACTION:[^\]]*\]/g, '').replace(/\n{3,}/g, '\n\n').trim();
  return { text, action: actions[0] || null };
}

// ══════════════════════════════════════════════════════════════
//  DATABASE FETCHERS
// ══════════════════════════════════════════════════════════════

async function dbRoom(term) {
  if (!term || term.trim().length < 2) return [];
  const r = await query(
    `SELECT r.id, r.room_number, r.name, r.type, r.capacity, r.coord_x,
            f.floor_label, f.id AS floor_id,
            b.code AS building_code, b.name AS building_name
     FROM rooms r
     JOIN floors f ON f.id = r.floor_id
     JOIN buildings b ON b.id = f.building_id
     WHERE r.is_active = TRUE
       AND (r.room_number ILIKE $1 OR r.name ILIKE $1 OR r.type::text ILIKE $1)
     ORDER BY r.room_number LIMIT 5`,
    [`%${term.trim()}%`]
  );
  return r.rows;
}

async function dbSchedule(userId) {
  const day = new Date().getDay();
  const r = await query(
    `SELECT s.start_time, s.end_time,
            c.code, c.name AS course_name,
            COALESCE(i.title||' '||i.last_name, 'TBA') AS instructor,
            COALESCE(r.room_number, 'TBA') AS room_number,
            r.id AS room_id, f.floor_label, f.id AS floor_id, b.code AS building
     FROM enrollments e
     JOIN sections s   ON s.id = e.section_id
     JOIN courses c    ON c.id = s.course_id
     LEFT JOIN instructors i ON i.id = s.instructor_id
     LEFT JOIN rooms r       ON r.id = s.room_id
     LEFT JOIN floors f      ON f.id = r.floor_id
     LEFT JOIN buildings b   ON b.id = f.building_id
     WHERE e.student_id = $1
       AND e.status = 'enrolled'
       AND s.is_active = TRUE
       AND $2 = ANY(s.day_of_week)
     ORDER BY s.start_time`,
    [userId, day]
  );
  return r.rows;
}

async function dbAttendance(userId) {
  const r = await query(
    `SELECT c.code, c.name AS course_name,
            COUNT(*) FILTER (WHERE at.status = 'present') AS present_count,
            COUNT(*)                                       AS total_count,
            ROUND(
              COUNT(*) FILTER (WHERE at.status = 'present') * 100.0
              / NULLIF(COUNT(*), 0)
            ) AS percentage
     FROM enrollments e
     JOIN sections s ON s.id = e.section_id
     JOIN courses c  ON c.id = s.course_id
     LEFT JOIN attendance at ON at.enrollment_id = e.id
     WHERE e.student_id = $1
       AND e.status = 'enrolled'
       AND s.is_active = TRUE
     GROUP BY c.id, c.code, c.name
     ORDER BY c.code`,
    [userId]
  );
  return r.rows;
}

async function dbNotifications(userId, limit = 5) {
  const r = await query(
    `SELECT id, title, body, type, is_read, created_at
     FROM notifications
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return r.rows;
}

async function dbAnnouncements(limit = 4) {
  const r = await query(
    `SELECT id, title, body, category, created_at
     FROM announcements
     WHERE is_active = TRUE
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  );
  return r.rows;
}

async function dbInstructor(name) {
  if (!name || name.length < 2) return [];
  const r = await query(
    `SELECT i.title, i.first_name, i.last_name, i.department,
            COALESCE(r.room_number, 'N/A') AS office,
            f.floor_label, r.id AS room_id, f.id AS floor_id
     FROM instructors i
     LEFT JOIN rooms r ON r.id = i.office_room_id
     LEFT JOIN floors f ON f.id = r.floor_id
     WHERE i.is_active = TRUE
       AND (i.first_name ILIKE $1 OR i.last_name ILIKE $1)
     LIMIT 3`,
    [`%${name.trim()}%`]
  );
  return r.rows;
}

// ══════════════════════════════════════════════════════════════
//  SYSTEM PROMPT BUILDER
// ══════════════════════════════════════════════════════════════

function buildSystemPrompt({ user, schedule, attendance, notifications, announcements, rooms, instructors }) {
  const now      = new Date();
  const DAYS_EN  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const today    = DAYS_EN[now.getDay()];
  const timeStr  = now.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' });
  const nowMins  = now.getHours() * 60 + now.getMinutes();

  // ── Schedule section ───────────────────────────────────────
  let scheduleSection = 'No schedule data (user not authenticated or no classes today).';
  if (schedule.length > 0) {
    scheduleSection = schedule.map(s => {
      const toMins = (t = '') => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
      const active = nowMins >= toMins(s.start_time) && nowMins < toMins(s.end_time);
      return `${active ? '▶ [NOW] ' : ''}${s.code} — ${s.course_name} | ${(s.start_time||'').slice(0,5)}–${(s.end_time||'').slice(0,5)} | Room: ${s.room_number} | Instructor: ${s.instructor}`;
    }).join('\n');
  } else if (user) {
    scheduleSection = 'No classes scheduled for today.';
  }

  // ── Attendance section ─────────────────────────────────────
  let attendanceSection = 'No attendance data available.';
  if (attendance.length > 0) {
    const low = attendance.filter(a => parseInt(a.percentage || 0) < 75);
    attendanceSection = attendance
      .map(a => `${a.code}: ${a.percentage || 0}% (${a.present_count || 0}/${a.total_count || 0})`)
      .join(' | ');
    if (low.length) attendanceSection += `\n⚠ BELOW 75%: ${low.map(a => a.code).join(', ')}`;
  }

  // ── Notifications section ──────────────────────────────────
  let notifsSection = 'No notifications.';
  if (notifications.length > 0) {
    const unread = notifications.filter(n => !n.is_read).length;
    notifsSection = `${unread} unread / ${notifications.length} total:\n` +
      notifications.slice(0, 4).map(n => `• ${n.is_read ? '' : '[UNREAD] '}${n.title}`).join('\n');
  }

  // ── Announcements section ──────────────────────────────────
  let announcementsSection = 'No announcements.';
  if (announcements.length > 0) {
    announcementsSection = announcements
      .map(a => `• [${a.category || 'General'}] ${a.title}`)
      .join('\n');
  }

  // ── Rooms section (only if relevant to query) ──────────────
  const roomsSection = rooms.length > 0
    ? rooms.map(r =>
        `• ${r.room_number} — ${r.name} | ${r.floor_label} | ${r.building_name} | ${r.type}${r.capacity ? ` | ${r.capacity} seats` : ''}`
      ).join('\n')
    : '';

  // ── Instructors section ────────────────────────────────────
  const instructorsSection = instructors.length > 0
    ? instructors.map(i =>
        `• ${i.title || 'Dr.'} ${i.first_name} ${i.last_name} — ${i.department} | Office: ${i.office} ${i.floor_label || ''}`
      ).join('\n')
    : '';

  const userBlock = user
    ? `Name: ${user.first_name} ${user.last_name || ''}
Role: ${user.role}
Student ID: ${user.student_id || 'N/A'}`
    : 'Guest (not authenticated — cannot access personal data)';

  return `You are **Najah Smart Assistant** (مساعد النجاح الذكي), the official intelligent AI assistant embedded inside the Smart Campus web application of **An-Najah National University** (جامعة النجاح الوطنية), Nablus, Palestine.

━━━━━━━━━━━━━━━━━━━━━━━━━
CURRENT CONTEXT
━━━━━━━━━━━━━━━━━━━━━━━━━
Date/Time: ${today}, ${now.toLocaleDateString('en-GB')} at ${timeStr}

USER
${userBlock}

TODAY'S SCHEDULE (${today})
${scheduleSection}

ATTENDANCE
${attendanceSection}

NOTIFICATIONS
${notifsSection}

ANNOUNCEMENTS
${announcementsSection}
${roomsSection ? `\nROOM SEARCH RESULTS\n${roomsSection}` : ''}${instructorsSection ? `\nINSTRUCTOR SEARCH RESULTS\n${instructorsSection}` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━
CAMPUS KNOWLEDGE
━━━━━━━━━━━━━━━━━━━━━━━━━
Building: Faculty of Engineering | Floors: B2, B1, G (Ground), 1, 2, 3, 4
Ground floor rooms: G0010, G0011, G0060 (Amphitheater/مدرج), G0070, G0110–G0150, G0180, G0190, G0220 (Hall), G0230–G0260, G0280
Interactive maps available: Ground Floor, Floor 3, Floor 4
Campus navigation: via the Map page — students can search "From Room → To Room"

━━━━━━━━━━━━━━━━━━━━━━━━━
YOUR PERSONA & RULES
━━━━━━━━━━━━━━━━━━━━━━━━━
• You are a SMART, NATURAL, CONVERSATIONAL assistant — not a scripted chatbot
• You have REAL access to the student's live data (shown above) — use it accurately
• NEVER fabricate room numbers, schedules, grades, or attendance figures
• NEVER say "I don't understand" — always interpret intent and respond helpfully
• Handle follow-up questions using full conversation context
• Be warm, supportive, and encouraging — university students rely on you daily

LANGUAGE RULE (CRITICAL):
- User writes Arabic → You respond in Arabic (فصحى أو عامية فلسطينية مفهومة)
- User writes English → You respond in English
- Mixed → prefer Arabic
- Match the user's tone: casual if they're casual, formal if they're formal

RESPONSE STYLE:
- Conversational and natural — like a knowledgeable friend who works at the university
- Concise by default (2–4 sentences); elaborate only when detail is genuinely needed
- Use **bold** for key info, bullet points for lists, never use excessive headers
- For personal data questions (schedule, attendance), reference the ACTUAL data above

━━━━━━━━━━━━━━━━━━━━━━━━━
INTERACTIVE NAVIGATION (IMPORTANT)
━━━━━━━━━━━━━━━━━━━━━━━━━
When a response naturally involves navigation, append ONE of these invisible markers at the very END of your reply. They will be parsed into clickable buttons — never display them as text to the user.

Show a specific room on the campus map:
[ACTION:{"type":"show_room","room_number":"G0130"}]

Open the student's schedule page:
[ACTION:{"type":"show_schedule"}]

Open the campus map:
[ACTION:{"type":"open_map"}]

Use them only when genuinely helpful — not on every single reply.`;
}

// ══════════════════════════════════════════════════════════════
//  MAIN CHAT HANDLER
// ══════════════════════════════════════════════════════════════

async function chat(req, res, next) {
  try {
    const { message, history = [] } = req.body;
    const user   = req.user || null;
    const userId = user?.id;

    if (!message?.trim()) {
      return res.status(400).json({ success: false, message: 'Message required.' });
    }

    // ── Guard: Gemini not configured ────────────────────────
    if (!genAI) {
      const isAr = detectLang(message) === 'ar';
      return res.json({
        success: true,
        data: {
          message: isAr
            ? 'عذراً، خدمة الذكاء الاصطناعي غير مُهيأة حالياً. تواصل مع الإدارة.'
            : 'Sorry, the AI service is not configured. Please contact administration.',
          lang: isAr ? 'ar' : 'en',
          action: null, cards: null,
          timestamp: new Date().toISOString(),
        },
      });
    }

    const msgL = message.toLowerCase();
    const lang = detectLang(message);

    // ── Lightweight topic detection (decides what to pre-fetch) ──
    const needsSchedule   = /schedule|class|today|lecture|جدول|اليوم|محاضرة|مادة|درس/.test(msgL);
    const needsAttendance = /attend|absence|حضور|غياب|نسبة|percent/.test(msgL);
    const needsNotifs     = /notif|إشعار|unread|inbox/.test(msgL);
    const needsRoom       = /room|where|lab|office|hall|غرفة|وين|فين|قاعة|مختبر|مكتب|ابحث|find/.test(msgL);
    const needsInstructor = /doctor|dr\b|prof\b|instructor|دكتور|أستاذ|مدرس/.test(msgL);

    const searchTerm = (needsRoom || needsInstructor) ? extractSearchTerm(message) : '';
    const instrTerm  = needsInstructor
      ? message.replace(/دكتور|أستاذ|doctor|dr\.?|prof\.?|professor|where|is|find|مكتب|office|the/gi, '').trim()
      : '';

    // ── Fetch relevant DB data in parallel ──────────────────
    const [schedule, attendance, notifications, announcements, rooms, instructors] = await Promise.all([
      userId               ? dbSchedule(userId).catch(() => [])            : Promise.resolve([]),
      needsAttendance && userId ? dbAttendance(userId).catch(() => [])     : Promise.resolve([]),
      userId               ? dbNotifications(userId, 4).catch(() => [])    : Promise.resolve([]),
      dbAnnouncements(4).catch(() => []),
      searchTerm.length >= 2 ? dbRoom(searchTerm).catch(() => [])          : Promise.resolve([]),
      instrTerm.length  >= 2 ? dbInstructor(instrTerm).catch(() => [])     : Promise.resolve([]),
    ]);

    // ── Build Gemini system prompt with live context ─────────
    const systemPrompt = buildSystemPrompt({
      user, schedule, attendance, notifications, announcements, rooms, instructors,
    });

    // ── Convert frontend history → Gemini format ─────────────
    const geminiHistory = history
      .filter(h => h.role && h.text)
      .slice(-10)           // keep last 10 turns (5 exchanges) for context
      .map(h => ({
        role:  h.role === 'model' ? 'model' : 'user',
        parts: [{ text: String(h.text) }],
      }));

    // ── Call Gemini 1.5 Flash ────────────────────────────────
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction: systemPrompt,
      generationConfig: {
        temperature:     0.72,
        topP:            0.9,
        maxOutputTokens: 700,
      },
    });

    const session = model.startChat({ history: geminiHistory });

    // 12-second timeout guard
    const geminiCall    = session.sendMessage(message);
    const timeoutGuard  = new Promise((_, rej) =>
      setTimeout(() => rej(new Error('GEMINI_TIMEOUT')), 12000)
    );
    const result  = await Promise.race([geminiCall, timeoutGuard]);
    const rawText = result.response.text();

    // ── Parse response text + action markers ─────────────────
    const { text: replyText, action: parsedAction } = parseGeminiResponse(rawText);

    // ── Resolve room_id/floor_id for show_room actions ────────
    let finalAction = parsedAction;
    if (parsedAction?.type === 'show_room' && parsedAction.room_number && !parsedAction.room_id) {
      const found = await dbRoom(parsedAction.room_number).catch(() => []);
      if (found[0]) {
        finalAction = {
          type:     'show_room',
          room_id:  found[0].id,
          floor_id: found[0].floor_id,
        };
      }
    }
    // Fall back to first room result when Gemini didn't emit an action but found rooms
    if (!finalAction && rooms.length === 1) {
      finalAction = { type: 'show_room', room_id: rooms[0].id, floor_id: rooms[0].floor_id };
    }

    // ── Build rich cards for the frontend ────────────────────
    const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
    const toM     = (t = '') => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };

    let cards = null;
    if (needsSchedule && schedule.length > 0) {
      cards = {
        type: 'schedule',
        items: schedule.map(s => ({
          code:        s.code,
          course_name: s.course_name,
          start_time:  (s.start_time || '').slice(0, 5),
          end_time:    (s.end_time   || '').slice(0, 5),
          room_number: s.room_number || 'TBA',
          room_id:     s.room_id,
          floor_id:    s.floor_id,
          instructor:  s.instructor || 'TBA',
          is_current:  nowMins >= toM(s.start_time) && nowMins < toM(s.end_time),
        })),
      };
    } else if (needsAttendance && attendance.length > 0) {
      cards = {
        type: 'attendance',
        items: attendance.map(a => ({
          code:        a.code,
          course_name: a.course_name,
          present:     parseInt(a.present_count) || 0,
          total:       parseInt(a.total_count)   || 0,
          percentage:  parseInt(a.percentage)    || 0,
        })),
      };
    } else if (rooms.length > 0) {
      cards = {
        type:  'rooms',
        items: rooms.map(r => ({ ...r, room_id: r.id })),
      };
    } else if (needsNotifs && notifications.length > 0) {
      cards = { type: 'notifications', items: notifications };
    } else if (announcements.length > 0 && /announc|إعلان|أخبار|news/.test(msgL)) {
      cards = { type: 'announcements', items: announcements };
    }

    res.json({
      success: true,
      data: {
        message:   replyText,
        lang,
        action:    finalAction,
        cards,
        timestamp: new Date().toISOString(),
      },
    });

  } catch (err) {
    // ── Graceful fallback (timeout or API error) ─────────────
    if (err.message === 'GEMINI_TIMEOUT' || err.status === 429 || err.status === 503) {
      const isAr = detectLang(req.body?.message || '') === 'ar';
      return res.json({
        success: true,
        data: {
          message: isAr
            ? 'أنا مشغول قليلاً الآن. حاول مرة أخرى بعد لحظات، شكراً لصبرك! 🙏'
            : "I'm a little busy right now. Please try again in a moment — thanks for your patience! 🙏",
          lang:   isAr ? 'ar' : 'en',
          action: null,
          cards:  null,
          timestamp: new Date().toISOString(),
        },
      });
    }
    next(err);
  }
}

async function getHistory(req, res) {
  res.json({ success: true, data: { history: [] } });
}

module.exports = { chat, getHistory };
