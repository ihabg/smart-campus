const { query } = require('../config/db');

function detectLang(text) {
  return (text.match(/[\u0600-\u06FF]/g) || []).length > 1 ? 'ar' : 'en';
}

function extractRoom(text) {
  const patterns = [
    /(?:room|غرفة|قاعة|مختبر|lab)\s*([a-z]?\d{2,4})/i,
    /\b([a-z]\d{2,4})\b/i,
    /\b(\d{3,4})\b/,
  ];
  for (const p of patterns) { const m = text.match(p); if (m) return m[1]; }
  return null;
}

function detectIntent(text) {
  const t = text.toLowerCase();
  if (/^(hi|hello|hey|مرحبا|هلا|السلام|أهلاً|اهلا)/.test(t)) return 'greeting';
  if (/who are you|من أنت|ما اسمك|ايش اسمك|what are you/.test(t)) return 'about';
  if (/what can|ايش تقدر|شو تعمل|help|مساعدة/.test(t)) return 'help';
  if (/schedule|class|today|جدول|اليوم|محاضرة|مادة/.test(t)) return 'schedule';
  if (/doctor|dr\.|prof|instructor|دكتور|أستاذ|مدرس/.test(t)) return 'instructor';
  if (/room|where|lab|office|غرفة|وين|فين|قاعة|مختبر|مكتب/.test(t)) return 'room';
  if (/navigate|path|route|طريق|كيف أروح/.test(t)) return 'navigate';
  if (/thank|شكرا|يسلمو|bye|مع السلامة/.test(t)) return 'bye';
  return 'unknown';
}

async function dbRoom(term) {
  const r = await query(
    `SELECT r.id, r.room_number, r.name, r.type, r.capacity, r.coord_x,
            f.floor_label, f.id AS floor_id, b.code AS building_code, b.name AS building_name
     FROM rooms r JOIN floors f ON f.id=r.floor_id JOIN buildings b ON b.id=f.building_id
     WHERE r.is_active=TRUE AND (r.room_number ILIKE $1 OR r.name ILIKE $1 OR r.type::text ILIKE $1)
     ORDER BY r.room_number LIMIT 5`,
    [`%${term}%`]
  );
  return r.rows;
}

async function dbSchedule(userId) {
  const day = new Date().getDay();
  const r = await query(
    `SELECT s.start_time, s.end_time, c.code, c.name AS course_name,
            i.title||' '||i.last_name AS instructor,
            r.room_number, r.id AS room_id, f.floor_label, f.id AS floor_id, b.code AS building
     FROM enrollments e JOIN sections s ON s.id=e.section_id JOIN courses c ON c.id=s.course_id
     LEFT JOIN instructors i ON i.id=s.instructor_id LEFT JOIN rooms r ON r.id=s.room_id
     LEFT JOIN floors f ON f.id=r.floor_id LEFT JOIN buildings b ON b.id=f.building_id
     WHERE e.student_id=$1 AND e.status='enrolled' AND s.is_active=TRUE AND $2=ANY(s.day_of_week)
     ORDER BY s.start_time`,
    [userId, day]
  );
  return r.rows;
}

async function dbInstructor(name) {
  const r = await query(
    `SELECT i.title,i.first_name,i.last_name,i.department,i.email,
            r.room_number AS office,f.floor_label,b.code AS building,r.id AS room_id,f.id AS floor_id
     FROM instructors i LEFT JOIN rooms r ON r.id=i.office_room_id
     LEFT JOIN floors f ON f.id=r.floor_id LEFT JOIN buildings b ON b.id=f.building_id
     WHERE i.is_active=TRUE AND (i.first_name ILIKE $1 OR i.last_name ILIKE $1) LIMIT 3`,
    [`%${name}%`]
  );
  return r.rows;
}

async function chat(req, res, next) {
  try {
    const { message } = req.body;
    const userId   = req.user?.id;
    const userName = req.user?.first_name || '';

    if (!message?.trim()) {
      return res.status(400).json({ success: false, message: 'Message required.' });
    }

    const lang   = detectLang(message);
    const intent = detectIntent(message);
    const isAr   = lang === 'ar';
    let response = '';
    let action   = null;
    let roomData = null;

    if (intent === 'greeting') {
      response = isAr
        ? `أهلاً ${userName || 'طالب'}! 👋\nأنا مساعد النجاح الذكي لجامعة النجاح الوطنية.\nكيف أقدر أساعدك؟`
        : `Hello ${userName || 'there'}! 👋\nI'm Najah Smart Assistant for An-Najah National University.\nHow can I help you today?`;

    } else if (intent === 'about') {
      response = isAr
        ? `أنا مساعد النجاح الذكي 🤖\nتم تطويري لجامعة النجاح الوطنية في نابلس، فلسطين.\nأساعدك في:\n• إيجاد الغرف والقاعات\n• عرض جدولك الدراسي\n• إيجاد مكاتب الأساتذة\n• التنقل في الحرم\nيمكنك الكتابة بالعربي أو الإنجليزي!`
        : `I'm Najah Smart Assistant 🤖\nBuilt for An-Najah National University in Nablus, Palestine.\nI can help with:\n• Finding rooms and labs\n• Viewing your schedule\n• Locating instructor offices\n• Campus navigation\nType in Arabic or English!`;

    } else if (intent === 'help') {
      response = isAr
        ? `إليك ما أقدر أساعدك به:\n\n🗺️ "وين غرفة 161؟"\n📅 "شو عندي اليوم؟"\n👨‍🏫 "وين مكتب دكتور عبدالله؟"\n🧭 "كيف أتنقل بين الغرف؟"\n\nاكتب أو اضغط 🎤 للتحدث!`
        : `Here's what I can do:\n\n🗺️ "Where is room 161?"\n📅 "What are my classes today?"\n👨‍🏫 "Where is Dr. Abdullah's office?"\n🧭 "How do I navigate between rooms?"\n\nType or press 🎤 to speak!`;

    } else if (intent === 'room') {
      const roomNum = extractRoom(message);
      const term    = roomNum || message.replace(/وين|فين|where|room|غرفة|find|lab|office|is|the/gi, '').trim();
      if (term.length > 1) {
        const rooms = await dbRoom(term);
        if (rooms.length === 0) {
          response = isAr
            ? `ما لقيت غرفة مطابقة لـ "${term}".\nجرب رقم الغرفة مثل "161" أو "مختبر الحاسوب".`
            : `No room found matching "${term}".\nTry a room number like "161" or "computer lab".`;
        } else if (rooms.length === 1) {
          const r = rooms[0];
          response = isAr
            ? `📍 غرفة ${r.room_number} — ${r.name}\n🏢 ${r.building_name} · ${r.floor_label}\n🏷️ ${r.type.replace(/_/g,' ')}${r.capacity ? `\n👥 ${r.capacity} مقعد` : ''}${r.coord_x ? '\n✅ يمكنني عرضها على الخريطة!' : ''}`
            : `📍 Room ${r.room_number} — ${r.name}\n🏢 ${r.building_name} · ${r.floor_label}\n🏷️ ${r.type.replace(/_/g,' ')}${r.capacity ? ` · ${r.capacity} seats` : ''}${r.coord_x ? '\n✅ I can show this on the map!' : ''}`;
          roomData = r;
          action = { type: 'show_room', room_id: r.id, floor_id: r.floor_id };
        } else {
          const list = rooms.map(r => `• ${r.room_number} — ${r.name} (${r.floor_label})`).join('\n');
          response = isAr
            ? `وجدت ${rooms.length} غرف:\n\n${list}\n\nأي واحدة تقصد؟`
            : `Found ${rooms.length} rooms:\n\n${list}\n\nWhich one?`;
          roomData = rooms;
          action = { type: 'show_list', rooms };
        }
      } else {
        response = isAr ? 'اكتب رقم الغرفة أو اسمها.' : 'Please enter a room number or name.';
      }

    } else if (intent === 'schedule') {
      if (!userId) {
        response = isAr ? 'سجّل دخولك لعرض جدولك.' : 'Please log in to view your schedule.';
      } else {
        const sections = await dbSchedule(userId);
        const DAYS_AR  = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
        const DAYS_EN  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
        const today    = new Date().getDay();
        const now      = new Date().toTimeString().slice(0, 5);
        if (sections.length === 0) {
          response = isAr
            ? `ما عندك محاضرات اليوم (${DAYS_AR[today]}) 🎉\nاستمتع بيومك!`
            : `No classes today (${DAYS_EN[today]}) 🎉\nEnjoy your free day!`;
        } else {
          const list = sections.map(s => {
            const isNow = s.start_time?.slice(0,5) <= now && s.end_time?.slice(0,5) > now;
            return `${isNow ? '🔴 ' : ''}📚 ${s.code} — ${s.course_name}\n   ⏰ ${s.start_time?.slice(0,5)}–${s.end_time?.slice(0,5)} | 📍 ${s.room_number || 'TBA'}`;
          }).join('\n\n');
          response = isAr
            ? `📅 جدولك اليوم (${DAYS_AR[today]}):\n\n${list}`
            : `📅 Today (${DAYS_EN[today]}):\n\n${list}`;
          action = { type: 'show_schedule', sections };
        }
      }

    } else if (intent === 'instructor') {
      const name = message.replace(/دكتور|أستاذ|doctor|dr\.?|prof\.?|professor|where|is|office|مكتب|وين|find|the/gi, '').trim();
      if (name.length > 1) {
        const results = await dbInstructor(name);
        if (results.length === 0) {
          response = isAr
            ? `ما لقيت أستاذ باسم "${name}".\nجرب اسم العائلة فقط.`
            : `No instructor found for "${name}".\nTry just the last name.`;
        } else {
          const i = results[0];
          response = `👨‍🏫 ${i.title} ${i.first_name} ${i.last_name}\n🏛️ ${i.department}\n📍 ${i.office ? `${isAr ? 'غرفة' : 'Room'} ${i.office}, ${i.floor_label}` : (isAr ? 'غير محدد' : 'Not assigned')}`;
          if (i.room_id) action = { type: 'show_room', room_id: i.room_id, floor_id: i.floor_id };
        }
      } else {
        response = isAr ? 'اكتب اسم الأستاذ.' : 'Please enter the instructor name.';
      }

    } else if (intent === 'navigate') {
      response = isAr
        ? `🧭 للتنقل:\n1. افتح خريطة الحرم من القائمة\n2. اضغط زر ↗ تنقل\n3. اختر غرفة البداية والنهاية\n4. اضغط إيجاد المسار`
        : `🧭 To navigate:\n1. Open Campus Map from sidebar\n2. Click ↗ Navigate button\n3. Select From and To rooms\n4. Click Find Path`;
      action = { type: 'open_map' };

    } else if (intent === 'bye') {
      response = isAr
        ? `يسلمك! 👋 يوم سعيد في جامعة النجاح 🎓`
        : `Goodbye! 👋 Have a great day at An-Najah 🎓`;

    } else {
      // Try to find a room number in the message
      const rn = extractRoom(message);
      if (rn) {
        const rooms = await dbRoom(rn);
        if (rooms.length > 0) {
          const r = rooms[0];
          response = isAr
            ? `📍 غرفة ${r.room_number} — ${r.name}\n🏢 ${r.building_name} · ${r.floor_label}${r.coord_x ? '\n✅ يمكنني عرضها على الخريطة!' : ''}`
            : `📍 Room ${r.room_number} — ${r.name}\n🏢 ${r.building_name} · ${r.floor_label}${r.coord_x ? '\n✅ I can show this on the map!' : ''}`;
          roomData = r;
          action = { type: 'show_room', room_id: r.id, floor_id: r.floor_id };
        } else {
          response = isAr
            ? `ما لقيت غرفة بالرقم "${rn}".`
            : `No room found with number "${rn}".`;
        }
      } else {
        response = isAr
          ? `ما فهمت سؤالك 🤔\n\nجرب:\n• "وين غرفة 161؟"\n• "شو عندي اليوم؟"\n• "وين مكتب الدكتور؟"\n• "من أنت؟"\n• "ايش تقدر تعمل؟"`
          : `I didn't understand that 🤔\n\nTry:\n• "Where is room 161?"\n• "What are my classes today?"\n• "Where is Dr. X office?"\n• "Who are you?"\n• "What can you do?"`;
      }
    }

    res.json({
      success: true,
      data: { message: response, lang, action, roomData, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
}

async function getHistory(req, res) {
  res.json({ success: true, data: { history: [] } });
}

module.exports = { chat, getHistory };
