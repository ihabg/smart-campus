import { format, formatDistanceToNow, isToday, isYesterday } from 'date-fns';

export function cleanTime(value) {
  return value ? String(value).slice(0, 5) : '—';
}

export function formatTime(value) {
  return cleanTime(value);
}

export function formatDate(value, pattern = 'dd MMM yyyy') {
  if (!value) return '—';
  try {
    return format(new Date(value), pattern);
  } catch {
    return String(value);
  }
}

export function timeAgo(value) {
  if (!value) return '';
  try {
    const date = new Date(value);
    if (isToday(date)) return `Today ${format(date, 'HH:mm')}`;
    if (isYesterday(date)) return `Yesterday ${format(date, 'HH:mm')}`;
    return formatDistanceToNow(date, { addSuffix: true });
  } catch {
    return '';
  }
}

export function getErrorMessage(error, fallback = 'Something went wrong') {
  return error?.response?.data?.message || error?.message || fallback;
}

export function unwrapApi(responseOrData) {
  const root = responseOrData?.data ?? responseOrData;
  return root?.data ?? root ?? {};
}

export function normalizeRoomNumber(roomNumber) {
  const raw = String(roomNumber || '').trim();
  if (!raw || raw === '—') return '';
  if (/^\d{6}$/.test(raw)) return raw.slice(2);
  return raw;
}

export function dayName(day) {
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return names[Number(day)] || '—';
}

export function arabicDayName(day) {
  const names = ['احد', 'اثنين', 'ثلاث', 'اربعاء', 'خميس', 'جمعة', 'سبت'];
  return names[Number(day)] || '—';
}

export function roomTypeLabel(type) {
  const map = {
    classroom: 'Classroom',
    lecture_hall: 'Lecture Hall',
    lab: 'Lab',
    office: 'Office',
    corridor: 'Corridor',
    restroom: 'Restroom',
    bathroom: 'Accessible Restroom',
    elevator: 'Elevator',
    stairs: 'Stairs',
    emergency_exit: 'Emergency Exit',
    emergency_stairs: 'Emergency Stairs',
    storage: 'Storage',
    atrium: 'Atrium',
    meeting_room: 'Meeting Room',
    library: 'Library',
    cafeteria: 'Cafeteria',
    bookstore: 'Bookstore',
    amphitheater: 'Amphitheater',
    professor_lounge: 'Professor Lounge',
    engineering_drawing_room: 'Drawing Room',
    engineering_drawing_studio: 'Drawing Studio',
    other: 'Other',
  };
  return map[type] || String(type || 'Room').replace(/_/g, ' ');
}
