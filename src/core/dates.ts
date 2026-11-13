/* Calendar days are plain 'YYYY-MM-DD' strings in local time, as in the data files.
   Dates are built at noon so DST changes never move a day. */
import { format } from 'date-fns';

export const pad = (n: number) => String(n).padStart(2, '0');
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayStr = () => ymd(new Date());
export function parseYmd(s: string) {
  const [y = 1970, m = 1, d = 1] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}
export function addDays(s: string, n: number) {
  const d = parseYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
}
export const daysBetween = (a: string, b: string) => Math.round((parseYmd(b).getTime() - parseYmd(a).getTime()) / 864e5);
export function mondayOf(s: string) {
  const d = parseYmd(s);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return ymd(d);
}
export const range = (from: string, n: number) => Array.from({ length: n }, (_, i) => addDays(from, i));
export const nowHM = () => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const fmtDay = (s: string) => format(parseYmd(s), 'EEE d MMM');
export const fmtShort = (s: string) => format(parseYmd(s), 'd MMM');
export const fmtLong = (s: string) => format(parseYmd(s), 'EEEE d MMMM');
export const fmtDow = (s: string) => format(parseYmd(s), 'EEE');
export const fmtDom = (s: string) => format(parseYmd(s), 'd');
/** Clock time of an instant, e.g. "16:22". */
export const fmtClock = (ms: number) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
/** How long ago a reading was taken: "just now", "14 min ago", "Today 07:40", "Mon 04:10", "9 Nov". */
export function fmtAgo(ms: number, now = Date.now()) {
  const min = Math.round((now - ms) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const day = ymd(new Date(ms)), today = ymd(new Date(now));
  if (day === today) return `Today ${fmtClock(ms)}`;
  const diff = daysBetween(day, today);
  if (diff === 1) return `Yesterday ${fmtClock(ms)}`;
  if (diff < 7) return `${format(new Date(ms), 'EEE')} ${fmtClock(ms)}`;
  return fmtShort(day);
}
export function fmtRelative(s: string, today = todayStr()) {
  const diff = daysBetween(s, today);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff > 1 && diff < 7) return format(parseYmd(s), 'EEEE');
  return fmtDay(s);
}
