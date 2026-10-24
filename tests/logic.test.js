import { describe, it, expect } from 'vitest';
import { solarFromLunar, occurrenceForYear, nextOccurrence, occurrencesBetween, ageAt } from '../src/convert.js';
import { dueAlerts, alertMessage } from '../src/alerts.js';
import { buildICS, buildTestICS } from '../src/ics.js';
import { todayKST } from '../src/dates.js';

const lunarP = (month, day, leap = false, extra = {}) => ({ id: 'p1', name: '엄마', calendar: 'lunar', month, day, leap, alerts: ['week', 'day', 'dday'], ...extra });
const solarP = (month, day, extra = {}) => ({ id: 'p2', name: '아빠', calendar: 'solar', month, day, leap: false, alerts: ['week', 'day', 'dday'], ...extra });

describe('음력 → 양력 (KASI 기준 알려진 날짜)', () => {
  it.each([
    [2024, 1, 1, '2024-2-10'], // 설날
    [2025, 1, 1, '2025-1-29'],
    [2026, 1, 1, '2026-2-17'],
    [2024, 8, 15, '2024-9-17'], // 추석
    [2025, 8, 15, '2025-10-6'],
    [2026, 8, 15, '2026-9-25'],
    [2027, 8, 15, '2027-9-15'],
    [2024, 4, 8, '2024-5-15'], // 부처님오신날
    [2025, 4, 8, '2025-5-5'],
    [2026, 4, 8, '2026-5-24'],
  ])('음력 %i.%i.%i → %s', (y, m, d, expected) => {
    const { date } = solarFromLunar(y, m, d);
    expect(`${date.y}-${date.m}-${date.d}`).toBe(expected);
  });
});

describe('예외 케이스', () => {
  it('윤달 생일: 윤달이 있는 해에는 윤달 날짜', () => {
    // 2025년 윤6월
    const r = solarFromLunar(2025, 6, 1, true);
    expect(r.lunar.leap).toBe(true);
    expect(r.date).toEqual({ y: 2025, m: 7, d: 25 });
  });

  it('윤달 생일: 윤달이 없는 해에는 평달 같은 날짜', () => {
    const r = solarFromLunar(2026, 6, 1, true);
    expect(r.lunar.leap).toBe(false);
    expect(r.date).toEqual(solarFromLunar(2026, 6, 1, false).date);
  });

  it('음력 30일 생일: 그 달이 29일까지면 29일', () => {
    // 2026년 음력 2월은 29일까지
    const r = solarFromLunar(2026, 2, 30);
    expect(r.lunar.d).toBe(29);
    expect(r.date).toEqual(solarFromLunar(2026, 2, 29).date);
    // 30일이 있는 달은 그대로
    expect(solarFromLunar(2026, 1, 30).lunar.d).toBe(30);
  });

  it('윤달 + 30일: 윤달이 29일까지면 윤달 29일', () => {
    // 2025년 윤6월은 29일까지
    const r = solarFromLunar(2025, 6, 30, true);
    expect(r.lunar).toEqual({ m: 6, d: 29, leap: true });
  });

  it('양력 2월 29일 생일: 평년에는 2월 28일', () => {
    expect(occurrenceForYear(solarP(2, 29), 2027).date).toEqual({ y: 2027, m: 2, d: 28 });
    expect(occurrenceForYear(solarP(2, 29), 2028).date).toEqual({ y: 2028, m: 2, d: 29 });
  });

  it('2050년을 넘으면 계산하지 않는다', () => {
    expect(occurrenceForYear(solarP(5, 1), 2051)).toBeNull();
    expect(occurrenceForYear(lunarP(1, 1), 2051)).toBeNull();
    expect(nextOccurrence(solarP(1, 1), { y: 2050, m: 12, d: 31 })).toBeNull();
  });

  it('음력 12월 생일은 다음 해 양력 1~2월로 넘어간다', () => {
    // 음력 2025.12.15 → 2026.2.2
    const occ = nextOccurrence(lunarP(12, 15), { y: 2026, m: 1, d: 10 });
    expect(occ.baseYear).toBe(2025);
    expect(occ.date).toEqual({ y: 2026, m: 2, d: 2 });
  });
});

describe('다가오는 생일 / 나이', () => {
  it('지난 생일은 다음 해로', () => {
    const occ = nextOccurrence(solarP(3, 1), { y: 2026, m: 10, d: 24 });
    expect(occ.date).toEqual({ y: 2027, m: 3, d: 1 });
  });
  it('오늘이 생일이면 오늘', () => {
    expect(nextOccurrence(solarP(10, 24), { y: 2026, m: 10, d: 24 }).date).toEqual({ y: 2026, m: 10, d: 24 });
  });
  it('만 나이', () => {
    const p = solarP(3, 1, { birthYear: 1964 });
    expect(ageAt(p, occurrenceForYear(p, 2026))).toBe(62);
  });
  it('기간 내 모든 생일', () => {
    expect(occurrencesBetween(solarP(5, 5), 2026, 2045)).toHaveLength(20);
    expect(occurrencesBetween(solarP(5, 5), 2040, 2060)).toHaveLength(11); // 2050년까지
  });
});

describe('알림 팝업', () => {
  const p = solarP(11, 1, { alerts: ['month', 'half', 'week', 'day', 'dday'] });
  const at = (m, d) => dueAlerts([p], { y: 2026, m, d });

  it.each([
    [10, 1, 'month'], // 31일 전: 없음 → 아래에서 따로
    [10, 2, 'month'], // 30일 전
    [10, 17, 'half'], // 15일 전
    [10, 20, 'half'], // 12일 전: 아직 보름 단계
    [10, 25, 'week'], // 7일 전
    [10, 31, 'day'],
    [11, 1, 'dday'],
  ].slice(1))('%i/%i → %s 단계', (m, d, stage) => {
    expect(at(m, d)[0].stage.key).toBe(stage);
  });

  it('범위 밖이면 없음', () => {
    expect(at(10, 1)).toHaveLength(0);
  });

  it('선택하지 않은 단계는 띄우지 않음', () => {
    const q = { ...p, alerts: ['dday'] };
    expect(dueAlerts([q], { y: 2026, m: 10, d: 25 })).toHaveLength(0);
    expect(dueAlerts([q], { y: 2026, m: 11, d: 1 })).toHaveLength(1);
  });

  it('확인한 단계는 다시 띄우지 않고, 다음 단계는 띄운다', () => {
    const [a] = at(10, 25);
    const acks = { [a.key]: true };
    expect(dueAlerts([p], { y: 2026, m: 10, d: 26 }, acks)).toHaveLength(0);
    expect(dueAlerts([p], { y: 2026, m: 10, d: 31 }, acks)).toHaveLength(1);
  });

  it('문구', () => {
    const msg = alertMessage(at(10, 25)[0]);
    expect(msg).toBe('아빠 생신이 일주일 남았어요 · 11월 1일 (일)');
    expect(alertMessage(at(11, 1)[0])).toBe('오늘은 아빠 생신이에요 · 11월 1일 (일)');
  });
});

describe('ICS', () => {
  const people = [lunarP(3, 15, false, { alerts: ['month', 'week', 'day', 'dday'] }), solarP(5, 5)];
  const ics = buildICS(people, { fromYear: 2026, toYear: 2045, now: new Date('2026-10-24T00:00:00Z') });

  it('형식', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(40);
    expect(ics).toContain('SUMMARY:엄마 생신 (음력 3.15)');
    expect(ics).toContain('SUMMARY:아빠 생신');
    expect(ics).toContain('DTSTART;VALUE=DATE:20260501'); // 음력 2026.3.15 (음력 3.1 = 4.17)
    expect(ics).toContain('DTEND;VALUE=DATE:20260502');
  });

  it('알림: 오전 9시 기준', () => {
    const firstEvent = ics.split('BEGIN:VEVENT')[1];
    expect(firstEvent).toContain('TRIGGER:-P29DT15H'); // 30일 전 9시
    expect(firstEvent).toContain('TRIGGER:-P6DT15H'); // 7일 전 9시
    expect(firstEvent).toContain('TRIGGER:-PT15H'); // 하루 전 9시
    expect(firstEvent).toContain('TRIGGER:PT9H'); // 당일 9시
  });

  it('UID는 사람+연도로 고정, 다시 만들어도 같다', () => {
    const uids = ics.match(/^UID:.*$/gm);
    expect(new Set(uids).size).toBe(uids.length);
    const again = buildICS(people, { fromYear: 2026, toYear: 2045 });
    expect(again.match(/^UID:.*$/gm)).toEqual(uids);
  });

  it('줄 길이 75옥텟 이하', () => {
    const long = buildICS([solarP(1, 1, { name: '아주아주아주아주아주아주아주아주아주아주아주긴이름' })], { fromYear: 2026, toYear: 2026 });
    for (const line of long.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });
});

describe('알림 테스트 ICS', () => {
  it('5분 뒤 일정, 3분 전 알림', () => {
    const ics = buildTestICS(new Date('2026-10-24T00:00:00Z'));
    expect(ics).toContain('DTSTART:20261024T000500Z');
    expect(ics).toContain('TRIGGER:-PT3M');
  });
});

describe('KST 오늘', () => {
  it('UTC 15시 이후는 한국 다음 날', () => {
    expect(todayKST(new Date('2026-10-24T14:59:00Z'))).toEqual({ y: 2026, m: 10, d: 24 });
    expect(todayKST(new Date('2026-10-24T15:00:00Z'))).toEqual({ y: 2026, m: 10, d: 25 });
  });
});
