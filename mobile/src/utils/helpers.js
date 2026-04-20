// utils/helpers.js — shared with web, React Native safe
import { format, formatDistanceToNow, isToday, isYesterday } from 'date-fns';

export function formatTime(t) { return t ? t.slice(0, 5) : ''; }
export function formatDate(d, p = 'dd MMM yyyy') {
  if (!d) return '—';
  try { return format(new Date(d), p); }
  catch { return d; }
}
export function timeAgo(d) {
  if (!d) return '';
  const date = new Date(d);
  if (isToday(date))     return `Today ${format(date,'HH:mm')}`;
  if (isYesterday(date)) return `Yesterday ${format(date,'HH:mm')}`;
  return formatDistanceToNow(date, { addSuffix: true });
}
const DAY_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
export function daysArrayToString(days) { return (days||[]).map(d=>DAY_SHORT[d]).join(', '); }
export function getErrorMessage(err) {
  return err?.response?.data?.message || err?.message || 'An error occurred';
}
