import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmt(n: number | null | undefined, dp = 0) {
  if (n == null || !Number.isFinite(n)) return '–';
  return n.toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
/** One decimal only when needed (80 → "80", 82.5 → "82.5"). */
export const fmtKg = (n: number | null | undefined) => (n == null ? '–' : fmt(n, n % 1 ? 1 : 0));
export function signed(n: number, dp = 1) {
  return `${n > 0 ? '+' : n < 0 ? '−' : '±'}${fmt(Math.abs(n), dp)}`;
}

export function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
