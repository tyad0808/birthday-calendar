// 날짜는 모두 { y, m, d } 형태의 "달력 날짜"로 다룬다 (시간대 없음).
// 오늘 날짜만 KST(Asia/Seoul) 기준으로 구한다.

export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function todayKST(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return { y: get('year'), m: get('month'), d: get('day') };
}

export function toDayNumber({ y, m, d }) {
  return Date.UTC(y, m - 1, d) / 86400000;
}

export function fromDayNumber(n) {
  const dt = new Date(n * 86400000);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

export function addDays(date, days) {
  return fromDayNumber(toDayNumber(date) + days);
}

export function diffDays(from, to) {
  return toDayNumber(to) - toDayNumber(from);
}

export function weekday(date) {
  return new Date(Date.UTC(date.y, date.m - 1, date.d)).getUTCDay();
}

export function isLeapYear(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInSolarMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function sameDate(a, b) {
  return a.y === b.y && a.m === b.m && a.d === b.d;
}

const pad = (n) => String(n).padStart(2, '0');

export function toISO({ y, m, d }) {
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function toICSDate({ y, m, d }) {
  return `${y}${pad(m)}${pad(d)}`;
}

// 4월 12일 토요일
export function formatLong(date) {
  return `${date.m}월 ${date.d}일 ${WEEKDAYS[weekday(date)]}요일`;
}

// 4월 12일 (토)
export function formatShort(date) {
  return `${date.m}월 ${date.d}일 (${WEEKDAYS[weekday(date)]})`;
}
