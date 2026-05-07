require('dotenv').config();
const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const morgan       = require('morgan');
const path         = require('path');
const rateLimit    = require('express-rate-limit');

const { testConnection } = require('./config/db');
const errorHandler       = require('./middleware/errorHandler');

// ─── Route imports ───────────────────────────────────────────
const authRoutes         = require('./routes/auth');
const userRoutes         = require('./routes/users');
const floorRoutes        = require('./routes/floors');
const roomRoutes         = require('./routes/rooms');
const scheduleRoutes     = require('./routes/schedule');
const searchRoutes       = require('./routes/search');
const notificationRoutes = require('./routes/notifications');
const mapEditorRoutes    = require('./routes/mapEditor');
const announcementRoutes = require('./routes/announcements');
const chatRoutes         = require('./routes/chat');
const professorRoutes    = require('./routes/professor');
const deanRoutes         = require('./routes/dean');
const deptHeadRoutes     = require('./routes/deptHead');
const labAssistantRoutes = require('./routes/labAssistant');
const secretaryRoutes    = require('./routes/secretary');
const authPatchRoutes    = require('./routes/auth_patch');
const facultyRoutes      = require('./routes/faculty');
const officeHoursRoutes = require('./routes/officeHours');

const app  = express();
const PORT = process.env.PORT || 5000;

// ─── Trust proxy ─────────────────────────────────────────────
app.set('trust proxy', 1);

// ─── Security ────────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// ─── CORS ────────────────────────────────────────────────────
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ─── Rate Limiting ───────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max:      parseInt(process.env.RATE_LIMIT_MAX)        || 500,
  standardHeaders: true,
  legacyHeaders:   false,
  validate: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      100,
  validate: false,
  message: { success: false, message: 'Too many login attempts, please try again in 15 minutes.' },
});

app.use(globalLimiter);
app.use('/api/office-hours', officeHoursRoutes);
// ─── Body Parsing ────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Logging ─────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// ─── Static Files ────────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── Health Check ────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Smart Campus API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    version: '1.0.0',
  });
});

// ─── API Routes ──────────────────────────────────────────────
app.use('/api/auth',          authLimiter, authRoutes);
app.use('/api/auth',          authPatchRoutes);
app.use('/api/faculty',        facultyRoutes);
app.use('/api/users',         userRoutes);
app.use('/api/floors',        floorRoutes);
app.use('/api/rooms',         roomRoutes);
app.use('/api/schedule',      scheduleRoutes);
app.use('/api/search',        searchRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/map-editor',    mapEditorRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/chat',          chatRoutes);
app.use('/api/professor',     professorRoutes);
app.use('/api/dean',          deanRoutes);
app.use('/api/dept-head',     deptHeadRoutes);
app.use('/api/lab-assistant', labAssistantRoutes);
app.use('/api/secretary',     secretaryRoutes);

// ─── Room Status (public) ────────────────────────────────────
app.get('/api/room-status/all', async (req, res) => {
  try {
    const { query } = require('./config/db');
    const result = await query(
      `SELECT rs.*, r.room_number, r.name AS room_name
       FROM room_status rs
       JOIN rooms r ON r.id = rs.room_id`
    );
    res.json({ success: true, data: result.rows });
  } catch (e) { res.status(500).json({ success: false, data: [] }); }
});

app.get('/api/room-status/:roomId', async (req, res) => {
  try {
    const { query } = require('./config/db');
    const result = await query(
      `SELECT rs.*, r.room_number, r.name
       FROM room_status rs
       JOIN rooms r ON r.id = rs.room_id
       WHERE rs.room_id = $1`,
      [req.params.roomId]
    );
    res.json({ success: true, data: result.rows[0] || { is_occupied: false } });
  } catch (e) { res.status(500).json({ success: false }); }
});

// ─── Academic Year Calculator ────────────────────────────────
app.get('/api/academic-year/:studentId', (req, res) => {
  const { getAcademicYear } = require('./utils/academicYear');
  const result = getAcademicYear(req.params.studentId);
  if (!result) return res.status(400).json({ success:false, message:'Invalid student ID' });
  res.json({ success:true, data: result });
});

// ─── 404 Handler ─────────────────────────────────────────────
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
  });
});

// ─── Global Error Handler ────────────────────────────────────
app.use(errorHandler);

// ─── Start Server ────────────────────────────────────────────
async function startServer() {
  try {
    await testConnection();
    app.listen(PORT, () => {
      console.log(`\n🚀 Smart Campus API running on port ${PORT}`);
      console.log(`📡 Environment: ${process.env.NODE_ENV}`);
      console.log(`🌐 Health: http://localhost:${PORT}/api/health\n`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

startServer();

module.exports = app;
