const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

const UPLOAD_DIR  = process.env.UPLOAD_PATH || './uploads';
const MAX_SIZE_MB  = parseInt(process.env.MAX_FILE_SIZE_MB) || 10;
const ALLOWED_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/svg+xml'];

// Ensure upload directories exist
['maps', 'avatars', 'announcements'].forEach(sub => {
  const dir = path.join(UPLOAD_DIR, sub);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ─── Storage Engines ────────────────────────────────────────

const mapStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(UPLOAD_DIR, 'maps'));
  },
  filename: (req, file, cb) => {
    const ext      = path.extname(file.originalname).toLowerCase();
    const safeName = `floor_${Date.now()}_${Math.round(Math.random() * 1e6)}${ext}`;
    cb(null, safeName);
  },
});

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(UPLOAD_DIR, 'avatars'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `avatar_${req.user?.id || 'unknown'}_${Date.now()}${ext}`);
  },
});

const announcementStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(UPLOAD_DIR, 'announcements'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `announcement_${Date.now()}${ext}`);
  },
});

// ─── File Filter ────────────────────────────────────────────

const imageFilter = (req, file, cb) => {
  if (ALLOWED_MIME.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type: ${file.mimetype}. Only JPEG, PNG, WebP, SVG allowed.`), false);
  }
};

// ─── Multer Instances ───────────────────────────────────────

const uploadMap = multer({
  storage:  mapStorage,
  fileFilter: imageFilter,
  limits: { fileSize: MAX_SIZE_MB * 1024 * 1024 },
});

const uploadAvatar = multer({
  storage:  avatarStorage,
  fileFilter: imageFilter,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB for avatars
});

const uploadAnnouncement = multer({
  storage:  announcementStorage,
  fileFilter: imageFilter,
  limits: { fileSize: MAX_SIZE_MB * 1024 * 1024 },
});

/**
 * Delete a file from the uploads directory.
 * @param {string} filePath - full path to the file
 */
function deleteFile(filePath) {
  if (filePath && fs.existsSync(filePath)) {
    fs.unlink(filePath, err => {
      if (err) console.error('Error deleting file:', err.message);
    });
  }
}

module.exports = { uploadMap, uploadAvatar, uploadAnnouncement, deleteFile };
