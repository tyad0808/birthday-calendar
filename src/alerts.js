import { nextOccurrence } from './convert.js';
import { diffDays, toISO, formatShort } from './dates.js';

export const STAGES = [
  { key: 'month', days: 30, label: '한 달 전' },
  { key: 'half', days: 15, label: '보름 전' },
  { key: 'week', days: 7, label: '일주일 전' },
  { key: 'day', days: 1, label: '하루 전' },
  { key: 'dday', days: 0, label: '당일' },
];

export const DEFAULT_ALERTS = ['week', 'day', 'dday'];

export function honorific(person) {
  return person.honorific === false ? '생일' : '생신';
}

/**
 * 오늘 띄워야 할 알림 목록.
 * 남은 일수가 어떤 알림 단계 안에 들어오면(가장 가까운 단계 하나),
 * 그 단계를 아직 확인하지 않았을 때만 포함한다.
 */
export function dueAlerts(people, today, acks = {}) {
  const due = [];
  for (const person of people) {
    const occ = nextOccurrence(person, today);
    if (!occ) continue;
    const daysLeft = diffDays(today, occ.date);
    const stage = STAGES.filter((s) => person.alerts?.includes(s.key) && s.days >= daysLeft)
      .sort((a, b) => a.days - b.days)[0];
    if (!stage) continue;
    const key = `${person.id}|${toISO(occ.date)}|${stage.key}`;
    if (acks[key]) continue;
    due.push({ person, occ, daysLeft, stage, key });
  }
  return due.sort((a, b) => a.daysLeft - b.daysLeft);
}

function remainText(daysLeft) {
  if (daysLeft === 30) return '한 달';
  if (daysLeft === 15) return '보름';
  if (daysLeft === 7) return '일주일';
  return `${daysLeft}일`;
}

export function alertMessage({ person, occ, daysLeft }) {
  const what = `${person.name} ${honorific(person)}`;
  const when = formatShort(occ.date);
  if (daysLeft === 0) return `오늘은 ${what}이에요 · ${when}`;
  if (daysLeft === 1) return `내일은 ${what}이에요 · ${when}`;
  return `${what}이 ${remainText(daysLeft)} 남았어요 · ${when}`;
}
