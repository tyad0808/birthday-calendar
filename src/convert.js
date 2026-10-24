// 생일 → 해당 연도 양력 날짜 변환.
// 음력 변환은 korean-lunar-calendar (한국천문연구원 KASI 기준)만 사용한다.
import KoreanLunarCalendar from 'korean-lunar-calendar';
import { diffDays, isLeapYear } from './dates.js';

export const MAX_YEAR = 2050;

const lunar = new KoreanLunarCalendar();

function lunarToSolar(year, month, day, leap) {
  if (!lunar.setLunarDate(year, month, day, leap)) return null;
  const s = lunar.getSolarCalendar();
  return { y: s.year, m: s.month, d: s.day };
}

/**
 * 음력 year년 month월 day일의 양력 날짜.
 * - 윤달 생일: 그해 해당 윤달이 있으면 윤달, 없으면 평달 같은 날짜
 * - 30일 생일: 그 달이 29일까지면 29일
 * 지원 범위를 벗어나면 null.
 */
export function solarFromLunar(year, month, day, leap = false) {
  if (year > MAX_YEAR) return null;
  const tries = [];
  if (leap) {
    tries.push([day, true]);
    if (day === 30) tries.push([29, true]);
  }
  tries.push([day, false]);
  if (day === 30) tries.push([29, false]);

  for (const [d, l] of tries) {
    const solar = lunarToSolar(year, month, d, l);
    if (solar) return { date: solar, lunar: { m: month, d, leap: l } };
  }
  return null;
}

/**
 * 기준 연도(양력 생일은 양력 연도, 음력 생일은 음력 연도)의 생일.
 * 음력 12월 생일은 기준 연도 다음 해 양력 1~2월에 올 수 있다.
 * 반환: { date, baseYear, lunar? } 또는 null(지원 범위 밖)
 */
export function occurrenceForYear(person, year) {
  if (year > MAX_YEAR) return null;
  if (person.calendar === 'lunar') {
    const r = solarFromLunar(year, person.month, person.day, person.leap);
    return r ? { date: r.date, baseYear: year, lunar: r.lunar } : null;
  }
  let day = person.day;
  if (person.month === 2 && day === 29 && !isLeapYear(year)) day = 28;
  return { date: { y: year, m: person.month, d: day }, baseYear: year };
}

/** 오늘 포함, 가장 가까운 다가오는 생일. 지원 범위를 넘으면 null. */
export function nextOccurrence(person, today) {
  for (let y = today.y - 1; y <= today.y + 1; y++) {
    const occ = occurrenceForYear(person, y);
    if (occ && diffDays(today, occ.date) >= 0) return occ;
  }
  return null;
}

/** 양력 fromYear~toYear 사이에 오는 모든 생일 (날짜순). */
export function occurrencesBetween(person, fromYear, toYear) {
  const list = [];
  const last = Math.min(toYear, MAX_YEAR);
  for (let y = fromYear - 1; y <= last; y++) {
    const occ = occurrenceForYear(person, y);
    if (occ && occ.date.y >= fromYear && occ.date.y <= last) list.push(occ);
  }
  return list;
}

/** 그 생일에 맞는 만 나이. 출생연도가 없으면 null. */
export function ageAt(person, occ) {
  if (!person.birthYear) return null;
  const age = occ.baseYear - person.birthYear;
  return age >= 0 ? age : null;
}

export function lunarLabel(person) {
  return `음력 ${person.leap ? '윤' : ''}${person.month}.${person.day}`;
}
