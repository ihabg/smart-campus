import { format, formatDistanceToNow, isToday, isYesterday } from 'date-fns';

// ─── Date helpers ─────────────────────────────────────────────
export function formatDate(dateStr, pattern = 'dd MMM yyyy') {
  if (!dateStr) return '—';
  try { return format(new Date(dateStr), pattern); }
  catch { return dateStr; }
}

export function formatDateTime(dateStr) {
  return formatDate(dateStr, 'dd MMM yyyy, HH:mm');
}

export function formatTime(timeStr) {
  // "08:00:00" → "08:00"
  if (!timeStr) return '';
  return timeStr.slice(0, 5);
}

export function timeAgo(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isToday(date))     return `Today, ${format(date, 'HH:mm')}`;
  if (isYesterday(date)) return `Yesterday, ${format(date, 'HH:mm')}`;
  return formatDistanceToNow(date, { addSuffix: true });
}

// ─── Day of week ──────────────────────────────────────────────
const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const DAY_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

export function dayName(day, short = false) {
  return short ? DAY_SHORT[day] : DAY_NAMES[day];
}

export function daysArrayToString(days, short = true) {
  return (days || []).map(d => dayName(d, short)).join(', ');
}

// ─── Room type helpers ────────────────────────────────────────
const ROOM_TYPE_LABELS = {
  classroom:    'Classroom',
  lecture_hall: 'Lecture Hall',
  lab:          'Lab',
  office:       'Office',
  corridor:     'Corridor',
  restroom:     'Restroom',
  elevator:     'Elevator',
  stairs:       'Stairs',
  storage:      'Storage',
  atrium:       'Atrium',
  meeting_room: 'Meeting Room',
  library:      'Library',
  cafeteria:    'Cafeteria',
  other:        'Other',
};

export function roomTypeLabel(type) {
  return ROOM_TYPE_LABELS[type] || type;
}

export function roomTypeBadgeClass(type) {
  const map = {
    lab:          'badge--lab',
    lecture_hall: 'badge--lecture',
    classroom:    'badge--classroom',
    office:       'badge--office',
  };
  return map[type] || 'badge--gray';
}

// ─── Status helpers ───────────────────────────────────────────
export function statusBadgeClass(status) {
  const map = {
    active:    'badge--green',
    enrolled:  'badge--green',
    in_session:'badge--green',
    available: 'badge--gray',
    open:      'badge--gray',
    free:      'badge--gray',
    busy:      'badge--amber',
    suspended: 'badge--red',
    inactive:  'badge--red',
    dropped:   'badge--red',
  };
  return map[status] || 'badge--gray';
}

export function statusLabel(status) {
  const map = {
    active:    'Active',
    inactive:  'Inactive',
    suspended: 'Suspended',
    enrolled:  'Enrolled',
    dropped:   'Dropped',
    completed: 'Completed',
    in_session:'In Session',
    available: 'Available',
    open:      'Open',
    busy:      'Busy',
  };
  return map[status] || status;
}

// ─── Pagination helpers ───────────────────────────────────────
export function buildPaginationPages(currentPage, totalPages, delta = 2) {
  const pages = [];
  const left  = currentPage - delta;
  const right = currentPage + delta + 1;

  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= left && i < right)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== '...') {
      pages.push('...');
    }
  }
  return pages;
}

// ─── Error message extractor ──────────────────────────────────
export function getErrorMessage(error) {
  return (
    error?.response?.data?.message ||
    error?.response?.data?.errors?.[0]?.message ||
    error?.message ||
    'An unexpected error occurred'
  );
}

// ─── Truncate text ────────────────────────────────────────────
export function truncate(str, maxLen = 80) {
  if (!str || str.length <= maxLen) return str;
  return str.slice(0, maxLen).trimEnd() + '…';
}

// ─── Capitalise first letter ──────────────────────────────────
export function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// ─── Semester label ───────────────────────────────────────────
export function semesterLabel(semester) {
  return { fall: 'Fall', spring: 'Spring', summer: 'Summer' }[semester] || semester;
}
