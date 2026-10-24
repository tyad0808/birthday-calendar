// localStorage 저장 / 백업 / 복원
import { DEFAULT_ALERTS, STAGES } from './alerts.js';

const KEYS = {
  people: 'fbc.people',
  settings: 'fbc.settings',
  acks: 'fbc.acks',
  snooze: 'fbc.snooze',
};

const DEFAULT_SETTINGS = { defaultAlerts: DEFAULT_ALERTS, exportYears: 20 };
const STAGE_KEYS = STAGES.map((s) => s.key);

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 저장 공간이 없거나 막혀 있어도 앱은 계속 동작
  }
}

export function newId() {
  return crypto.randomUUID ? crypto.randomUUID() : `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizePerson(p) {
  const month = Number(p.month);
  const day = Number(p.day);
  const birthYear = p.birthYear ? Number(p.birthYear) : null;
  if (!p.name || !(month >= 1 && month <= 12) || !(day >= 1 && day <= 31)) return null;
  const calendar = p.calendar === 'lunar' ? 'lunar' : 'solar';
  return {
    id: String(p.id || newId()),
    name: String(p.name).trim(),
    relation: String(p.relation || '').trim(),
    calendar,
    month,
    day,
    leap: calendar === 'lunar' && !!p.leap,
    birthYear: birthYear && birthYear > 1000 ? birthYear : null,
    honorific: p.honorific !== false,
    alerts: Array.isArray(p.alerts) ? p.alerts.filter((a) => STAGE_KEYS.includes(a)) : [...DEFAULT_ALERTS],
  };
}

export const loadPeople = () => read(KEYS.people, []).map(normalizePerson).filter(Boolean);
export const savePeople = (people) => write(KEYS.people, people);

export const loadSettings = () => ({ ...DEFAULT_SETTINGS, ...read(KEYS.settings, {}) });
export const saveSettings = (settings) => write(KEYS.settings, settings);

export const loadAcks = () => read(KEYS.acks, {});
export function saveAcks(acks, todayISO) {
  // 지난 생일의 확인 기록은 정리
  const kept = Object.fromEntries(Object.entries(acks).filter(([k]) => k.split('|')[1] >= addMonthsISO(todayISO, -2)));
  write(KEYS.acks, kept);
}

function addMonthsISO(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + n, d));
  return dt.toISOString().slice(0, 10);
}

export const loadSnooze = () => read(KEYS.snooze, null);
export const saveSnooze = (iso) => write(KEYS.snooze, iso);

export function exportBackup() {
  return JSON.stringify(
    { app: 'family-birthday-calendar', version: 1, exportedAt: new Date().toISOString(), people: loadPeople(), settings: loadSettings() },
    null,
    2,
  );
}

/** 백업 JSON을 읽어 저장. 성공 시 불러온 인원 수 반환, 형식이 틀리면 throw. */
export function importBackup(text) {
  const data = JSON.parse(text);
  if (!data || !Array.isArray(data.people)) throw new Error('백업 파일 형식이 아니에요.');
  const people = data.people.map(normalizePerson).filter(Boolean);
  savePeople(people);
  if (data.settings) saveSettings({ ...DEFAULT_SETTINGS, ...data.settings });
  return people.length;
}
