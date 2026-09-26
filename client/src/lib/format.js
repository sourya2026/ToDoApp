// =============================================================================
// Formatting helpers - one definition of how a date or a name is rendered.
// =============================================================================

const pad = (n) => String(n).padStart(2, '0');

/** DD/MM/YYYY HH:mm - the format used throughout the comment history. */
export function formatDateTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear()
    + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

export function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
}

/** "2 hours ago", "3 days ago" - shown beside the absolute date, never instead of it. */
export function relativeTime(value) {
  if (!value) return '';
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + (mins === 1 ? ' min ago' : ' mins ago');
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + (hours === 1 ? ' hour ago' : ' hours ago');
  const days = Math.floor(hours / 24);
  if (days < 31) return days + (days === 1 ? ' day ago' : ' days ago');
  const months = Math.floor(days / 30);
  return months + (months === 1 ? ' month ago' : ' months ago');
}

/** For the yyyy-mm-dd value of a date input. */
export const toDateInput = (value) => (value ? new Date(value).toISOString().slice(0, 10) : '');

export const initials = (name) => String(name || '?')
  .split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

/** One line of a comment for the grid cell, without losing the fact it is longer. */
export function firstLine(text, max = 120) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max).trimEnd() + '...' : clean;
}

export const mmss = (ms) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  return Math.floor(total / 60) + ':' + pad(total % 60);
};
