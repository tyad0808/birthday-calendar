// .ics (iCalendar) 생성. 종일 일정 + 사람별 알림(VALARM).
import { occurrencesBetween, lunarLabel } from './convert.js';
import { STAGES, honorific } from './alerts.js';
import { addDays, toICSDate } from './dates.js';

const UID_DOMAIN = 'family-birthday-calendar';

function escapeText(s) {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

// RFC 5545: 한 줄은 75옥텟 이하로 접는다 (UTF-8 문자 중간에서 자르지 않음)
function fold(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out = [];
  let cur = '';
  let len = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74;
    if (len + n > limit) {
      out.push(cur);
      cur = '';
      len = 0;
    }
    cur += ch;
    len += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

// 알림은 모두 오전 9시. 종일 일정 시작(0시) 기준 상대 시간.
function alarmTrigger(days) {
  if (days === 0) return 'PT9H';
  if (days === 1) return '-PT15H';
  return `-P${days - 1}DT15H`;
}

function stamp(now) {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export function eventTitle(person) {
  const base = `${person.name} ${honorific(person)}`;
  return person.calendar === 'lunar' ? `${base} (${lunarLabel(person)})` : base;
}

export function buildICS(people, { fromYear, toYear, now = new Date() }) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Family Birthday Calendar//KO',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:가족 생일',
    'X-WR-TIMEZONE:Asia/Seoul',
  ];
  const dtstamp = stamp(now);

  for (const person of people) {
    const stages = STAGES.filter((s) => person.alerts?.includes(s.key));
    for (const occ of occurrencesBetween(person, fromYear, toYear)) {
      lines.push(
        'BEGIN:VEVENT',
        // 사람 + (기준)연도로 고정 → 다시 가져와도 같은 일정으로 인식
        `UID:${person.id}-${occ.baseYear}@${UID_DOMAIN}`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART;VALUE=DATE:${toICSDate(occ.date)}`,
        `DTEND;VALUE=DATE:${toICSDate(addDays(occ.date, 1))}`,
        `SUMMARY:${escapeText(eventTitle(person))}`,
        'TRANSP:TRANSPARENT',
      );
      for (const s of stages) {
        lines.push(
          'BEGIN:VALARM',
          'ACTION:DISPLAY',
          `DESCRIPTION:${escapeText(eventTitle(person))}`,
          `TRIGGER:${alarmTrigger(s.days)}`,
          'END:VALARM',
        );
      }
      lines.push('END:VEVENT');
    }
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
