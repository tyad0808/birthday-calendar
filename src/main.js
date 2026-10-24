// UI: 메인 목록 / 등록·수정 시트 / 설정 / 알림 팝업
import './style.css';
import { MAX_YEAR, nextOccurrence, occurrencesBetween, ageAt, lunarLabel } from './convert.js';
import { STAGES, dueAlerts, alertMessage } from './alerts.js';
import { buildICS, buildTestICS } from './ics.js';
import { todayKST, diffDays, formatLong, formatShort, daysInSolarMonth, toISO } from './dates.js';
import * as store from './storage.js';

const app = document.getElementById('app');

let people = store.loadPeople();
let settings = store.loadSettings();
let acks = store.loadAcks();
const notified = new Set();

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const today = () => todayKST();

function html(strings, ...values) {
  return strings.reduce((out, s, i) => out + s + (i < values.length ? values[i] : ''), '');
}

function el(markup) {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstElementChild;
}

function toast(text) {
  const t = el(`<div class="toast" role="status">${esc(text)}</div>`);
  document.body.append(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 250);
  }, 2200);
}

function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function chipsMarkup(selected) {
  return STAGES.map((s) => `<button type="button" class="chip" data-stage="${s.key}" aria-pressed="${selected.includes(s.key)}">${s.label}</button>`).join('');
}

function bindChips(container, selected, onChange) {
  container.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const key = chip.dataset.stage;
    const i = selected.indexOf(key);
    if (i >= 0) selected.splice(i, 1);
    else selected.push(key);
    chip.setAttribute('aria-pressed', String(i < 0));
    onChange?.(selected);
  });
}

/* ───────────── 메인 ───────────── */

function ddayText(n) {
  return n === 0 ? 'D-Day' : `D-${n}`;
}

function rowMarkup(item, t) {
  const { person, occ, daysLeft } = item;
  const name = html`<span>${esc(person.name)}</span>${person.relation ? html`<span class="rel"> · ${esc(person.relation)}</span>` : ''}`;
  if (!occ) {
    return html`<li><button class="row" data-id="${person.id}">
      <div class="row-main"><div class="row-name">${name}</div>
      <div class="row-date">${MAX_YEAR}년 이후는 계산하지 않아요</div></div></button></li>`;
  }
  const age = ageAt(person, occ);
  const year = occ.date.y !== t.y ? `${occ.date.y}년 ` : '';
  // 음력 생일은 음력 날짜가 기준이고, 양력 날짜가 매년 바뀐다
  const tag =
    person.calendar === 'lunar'
      ? html`<span class="tag lunar">${esc(lunarLabel(person))}</span> → 양력 `
      : `<span class="tag">양력</span> `;
  return html`<li${daysLeft === 0 ? ' class="today-item"' : ''}><button class="row${daysLeft <= 7 ? ' soon' : ''}" data-id="${person.id}">
    <div class="row-main">
      <div class="row-name">${name}</div>
      <div class="row-date">${tag}${year}${formatLong(occ.date)}${age !== null ? html` <span class="meta">· 만 ${age}세</span>` : ''}</div>
    </div>
    <div class="dday">${ddayText(daysLeft)}</div>
  </button></li>`;
}

function renderList() {
  const t = today();
  const items = people
    .map((person) => {
      const occ = nextOccurrence(person, t);
      return { person, occ, daysLeft: occ ? diffDays(t, occ.date) : Infinity };
    })
    .sort((a, b) => a.daysLeft - b.daysLeft || a.person.name.localeCompare(b.person.name, 'ko'));

  const todays = items.filter((i) => i.daysLeft === 0);
  const rest = items.filter((i) => i.daysLeft !== 0);

  app.innerHTML = html`
    <header class="top"><div class="wrap">
      <h1>가족 생일</h1>
      <button class="link" id="open-settings">설정</button>
    </div></header>
    <main class="wrap">
      ${
        items.length === 0
          ? `<div class="empty"><p>아직 등록된 생일이 없어요</p><p class="hint">아래 [+ 추가]로 가족 생일을 등록해 보세요</p></div>`
          : html`<ul class="list">
              ${todays.length ? `<li class="section-label">오늘</li>` : ''}
              ${todays.map((i) => rowMarkup(i, t)).join('')}
              ${todays.length && rest.length ? `<li class="section-label">다가오는 생일</li>` : ''}
              ${rest.map((i) => rowMarkup(i, t)).join('')}
            </ul>`
      }
    </main>
    <div class="bottom"><div class="wrap"><button class="btn" id="add">+ 추가</button></div></div>`;

  app.querySelector('#add').onclick = () => openSheet();
  app.querySelector('#open-settings').onclick = () => (location.hash = 'settings');
  app.querySelectorAll('.row').forEach((row) => {
    row.onclick = () => openSheet(people.find((p) => p.id === row.dataset.id));
  });
}

/* ───────────── 등록 / 수정 시트 ───────────── */

let closeCurrentSheet = null;

function openSheet(existing) {
  closeCurrentSheet?.();
  const draft = existing
    ? { ...existing, alerts: [...existing.alerts] }
    : { id: store.newId(), name: '', relation: '', calendar: 'solar', month: 1, day: 1, leap: false, birthYear: null, honorific: true, alerts: [...settings.defaultAlerts] };

  const monthOptions = Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${i + 1}월</option>`).join('');
  const backdrop = el(`<div class="backdrop"></div>`);
  const sheet = el(html`
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title"><div class="wrap">
      <div class="grabber"></div>
      <h2 class="sheet-title" id="sheet-title">${existing ? '생일 수정' : '생일 추가'}</h2>
      <form novalidate>
        <div class="field">
          <label for="f-name">이름</label>
          <input class="input" id="f-name" name="name" autocomplete="off" placeholder="예: 김영희" value="${esc(draft.name)}" />
        </div>
        <div class="field">
          <label for="f-rel">관계 <span class="opt">(선택)</span></label>
          <input class="input" id="f-rel" name="relation" autocomplete="off" placeholder="예: 엄마, 아버님" value="${esc(draft.relation)}" />
        </div>
        <div class="field">
          <div class="label">생일</div>
          <div class="seg" id="f-cal" role="group" aria-label="달력 기준">
            <button type="button" data-cal="solar">양력</button>
            <button type="button" data-cal="lunar">음력</button>
          </div>
          <div class="inline" style="margin-top:8px">
            <select class="select" id="f-month" aria-label="월">${monthOptions}</select>
            <select class="select" id="f-day" aria-label="일"></select>
          </div>
          <p class="hint" id="f-cal-hint"></p>
          <label class="check" id="f-leap-wrap"><input type="checkbox" id="f-leap" /> 윤달</label>
        </div>
        <div class="field">
          <label for="f-year">출생연도 <span class="opt">(선택 · 나이 표시용)</span></label>
          <input class="input" id="f-year" inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="예: 1964" value="${draft.birthYear ?? ''}" />
        </div>
        <div class="field">
          <div class="label">부르는 말</div>
          <div class="seg" id="f-hon" role="group" aria-label="부르는 말">
            <button type="button" data-hon="1">생신</button>
            <button type="button" data-hon="0">생일</button>
          </div>
        </div>
        <div class="field">
          <div class="label">알림</div>
          <div class="chips" id="f-alerts">${chipsMarkup(draft.alerts)}</div>
        </div>
        <div class="preview" id="f-preview" aria-live="polite"></div>
        <p class="error" id="f-error" hidden></p>
        <div class="stack">
          <button type="submit" class="btn">저장</button>
          <button type="button" class="btn secondary" id="f-cancel">취소</button>
          ${existing ? `<button type="button" class="btn ghost" id="f-delete">삭제</button>` : ''}
        </div>
      </form>
    </div></div>`);

  document.body.append(backdrop, sheet);
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => {
    backdrop.classList.add('show');
    sheet.classList.add('show');
  });

  const $ = (sel) => sheet.querySelector(sel);
  const monthSel = $('#f-month');
  const daySel = $('#f-day');

  function syncDate() {
    const max = draft.calendar === 'lunar' ? 30 : daysInSolarMonth(2024, draft.month); // 2024: 윤년 → 2월 29일까지
    if (draft.day > max) draft.day = max;
    daySel.innerHTML = Array.from({ length: max }, (_, i) => `<option value="${i + 1}">${i + 1}일</option>`).join('');
    monthSel.value = draft.month;
    daySel.value = draft.day;
    $('#f-cal').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cal === draft.calendar)));
    $('#f-leap-wrap').hidden = draft.calendar !== 'lunar';
    $('#f-cal-hint').textContent =
      draft.calendar === 'lunar' ? '음력 날짜는 그대로, 양력 날짜가 매년 바뀌어요' : '양력 날짜 그대로 매년 같은 날이에요';
    $('#f-leap').checked = draft.leap;
    $('#f-hon').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.hon === '1') === draft.honorific)));
    syncPreview();
  }

  function syncPreview() {
    const t = today();
    const p = { ...draft, leap: draft.calendar === 'lunar' && draft.leap };
    const occs = occurrencesBetween(p, t.y, t.y + 1);
    const lines = occs.map((o) => {
      let note = '';
      if (o.lunar && p.leap && !o.lunar.leap) note = ' · 윤달 없는 해라 평달로';
      if (o.lunar && o.lunar.d !== p.day) note += ' · 29일까지인 달이라 29일로';
      return `<div>${o.date.y}년 ${formatShort(o.date)}${note}</div>`;
    });
    if (t.y + 1 > MAX_YEAR) lines.push(`<div>${MAX_YEAR}년 이후는 계산하지 않아요</div>`);
    if (lines.length) lines.unshift(`<div class="preview-title">양력 날짜</div>`);
    $('#f-preview').innerHTML = lines.join('');
  }

  $('#f-cal').onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    draft.calendar = b.dataset.cal;
    if (draft.calendar === 'solar') draft.leap = false;
    syncDate();
  };
  $('#f-hon').onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    draft.honorific = b.dataset.hon === '1';
    syncDate();
  };
  monthSel.onchange = () => {
    draft.month = Number(monthSel.value);
    syncDate();
  };
  daySel.onchange = () => {
    draft.day = Number(daySel.value);
    syncPreview();
  };
  $('#f-leap').onchange = (e) => {
    draft.leap = e.target.checked;
    syncPreview();
  };
  $('#f-year').oninput = (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
  };
  bindChips($('#f-alerts'), draft.alerts);

  function close() {
    closeCurrentSheet = null;
    backdrop.classList.remove('show');
    sheet.classList.remove('show');
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onKey);
    setTimeout(() => {
      backdrop.remove();
      sheet.remove();
    }, 260);
  }
  closeCurrentSheet = close;
  const onKey = (e) => e.key === 'Escape' && close();
  document.addEventListener('keydown', onKey);
  backdrop.onclick = close;
  $('#f-cancel').onclick = close;

  if (existing) {
    $('#f-delete').onclick = () => {
      if (!confirm(`${existing.name}님의 생일을 삭제할까요?`)) return;
      people = people.filter((p) => p.id !== existing.id);
      store.savePeople(people);
      close();
      render();
    };
  }

  $('form').onsubmit = (e) => {
    e.preventDefault();
    draft.name = $('#f-name').value.trim();
    draft.relation = $('#f-rel').value.trim();
    const yearText = $('#f-year').value.trim();
    const err = $('#f-error');
    const t = today();
    let msg = '';
    if (!draft.name) msg = '이름을 입력해 주세요.';
    else if (yearText && (Number(yearText) < 1900 || Number(yearText) > t.y)) msg = `출생연도는 1900~${t.y} 사이로 입력해 주세요.`;
    if (msg) {
      err.textContent = msg;
      err.hidden = false;
      if (!draft.name) $('#f-name').focus();
      return;
    }
    draft.birthYear = yearText ? Number(yearText) : null;
    const person = store.normalizePerson(draft);
    const i = people.findIndex((p) => p.id === person.id);
    if (i >= 0) people[i] = person;
    else people.push(person);
    store.savePeople(people);
    close();
    render();
    toast(existing ? '수정했어요' : '추가했어요');
  };

  syncDate();
  if (!existing) setTimeout(() => $('#f-name').focus({ preventScroll: true }), 280);
}

/* ───────────── 설정 ───────────── */

function renderSettings() {
  const t = today();
  const maxYears = Math.max(1, MAX_YEAR - t.y + 1);
  const years = Math.min(settings.exportYears || 20, maxYears);
  const permission = 'Notification' in window ? Notification.permission : 'unsupported';
  const permText = { granted: '허용됨', denied: '차단됨 · 브라우저 설정에서 바꿀 수 있어요', default: '', unsupported: '이 브라우저는 알림을 지원하지 않아요' }[permission];

  app.innerHTML = html`
    <header class="top"><div class="wrap">
      <button class="link back" id="back" aria-label="뒤로">‹ 목록</button>
      <h2>설정</h2>
      <span style="width:44px"></span>
    </div></header>
    <main class="wrap settings">
      <section>
        <h3>기본 알림</h3>
        <p class="desc">새로 등록하는 사람에게 기본으로 적용돼요.</p>
        <div class="chips" id="s-alerts">${chipsMarkup(settings.defaultAlerts)}</div>
      </section>

      <section>
        <h3>캘린더에 추가</h3>
        <p class="desc">생일 일정을 .ics 파일로 받아 휴대폰 캘린더에 넣어요. 사람별 알림도 함께 들어가요.</p>
        <div class="inline">
          <select class="select" id="s-target" aria-label="대상">
            <option value="">전체 가족</option>
            ${people.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}
          </select>
          <select class="select" id="s-years" aria-label="기간">
            ${Array.from({ length: maxYears }, (_, i) => i + 1)
              .filter((n) => n <= 5 || n % 5 === 0 || n === maxYears)
              .map((n) => `<option value="${n}"${n === years ? ' selected' : ''}>${n}년치</option>`)
              .join('')}
          </select>
        </div>
        <p class="desc" id="s-range" style="margin:8px 0 12px"></p>
        <button class="btn" id="s-export"${people.length ? '' : ' disabled'}>캘린더 파일 받기</button>
        <ul class="note">
          <li><b>갤럭시</b> · 파일을 받은 뒤 화면 아래 [열기] 또는 <b>내 파일 → 다운로드</b>에서 파일을 눌러 <b>캘린더(삼성 캘린더)</b>로 열고 저장하세요.</li>
          <li><b>아이폰</b> · 받은 파일을 열면 바로 캘린더에 추가되고 알림도 함께 들어가요.</li>
          <li><b>구글 캘린더 앱</b>은 휴대폰에서 파일을 가져오지 못해요. <b>구글 캘린더</b> · PC 웹에서 설정 → 가져오기로 넣어요. 구글은 파일 속 알림을 무시하므로, 알림은 캘린더 기본 알림으로 설정해 주세요.</li>
          <li>같은 파일을 다시 가져와도 일정이 중복되지 않아요. 사람을 추가하거나 알림을 바꾸면 다시 받아서 넣어 주세요.</li>
          <li>음력 날짜는 한국천문연구원 기준이며 ${MAX_YEAR}년까지 만들 수 있어요.</li>
        </ul>
        <button class="btn secondary" id="s-test" style="margin-top:16px">알림 테스트 파일 받기</button>
        <p class="desc" style="margin:8px 0 0">받은 뒤 <b>10분 뒤</b>와 <b>15분 뒤</b>에 알림이 와요. 알림이 잘 오는지 먼저 확인해 보세요.</p>
      </section>

      <section>
        <h3>브라우저 알림</h3>
        <p class="desc">앱을 열었을 때 다가오는 생일을 시스템 알림으로도 보여줘요.</p>
        ${
          permission === 'default'
            ? `<button class="btn secondary" id="s-notify">알림 허용하기</button>`
            : `<p class="desc" style="margin:0;color:var(--text)">${permText}</p>`
        }
        <ul class="note"><li>앱이 닫혀 있을 때는 알림을 보낼 수 없어요. 그때는 캘린더에 추가한 일정의 알림이 알려줘요.</li></ul>
      </section>

      <section>
        <h3>백업 / 복원</h3>
        <p class="desc">데이터는 이 기기에만 저장돼요. 기기를 바꾸거나 브라우저 데이터를 지우기 전에 백업해 두세요.</p>
        <div class="inline">
          <button class="btn secondary" id="s-backup">백업하기</button>
          <button class="btn secondary" id="s-restore">복원하기</button>
        </div>
        <input type="file" id="s-file" accept="application/json,.json" hidden />
      </section>
    </main>`;

  const $ = (sel) => app.querySelector(sel);
  $('#back').onclick = () => history.length > 1 ? history.back() : (location.hash = '');

  bindChips($('#s-alerts'), settings.defaultAlerts, () => store.saveSettings(settings));

  const syncRange = () => {
    const n = Number($('#s-years').value);
    $('#s-range').textContent = `${t.y}년 ~ ${t.y + n - 1}년`;
  };
  $('#s-years').onchange = () => {
    settings.exportYears = Number($('#s-years').value);
    store.saveSettings(settings);
    syncRange();
  };
  syncRange();

  $('#s-export').onclick = () => {
    const id = $('#s-target').value;
    const targets = id ? people.filter((p) => p.id === id) : people;
    const n = Number($('#s-years').value);
    const toYear = Math.min(t.y + n - 1, MAX_YEAR);
    const ics = buildICS(targets, { fromYear: t.y, toYear });
    // 파일 이름은 영문으로 (일부 브라우저가 한글 파일명을 무시함)
    download(`${id ? 'birthday' : 'family-birthdays'}-${t.y}-${toYear}.ics`, ics, 'text/calendar;charset=utf-8');
  };

  $('#s-test').onclick = () => download('birthday-alarm-test.ics', buildTestICS(), 'text/calendar;charset=utf-8');

  $('#s-notify')?.addEventListener('click', async () => {
    await Notification.requestPermission();
    renderSettings();
    checkAlerts();
  });

  $('#s-backup').onclick = () => download(`family-birthdays-backup-${toISO(t)}.json`, store.exportBackup(), 'application/json');
  $('#s-restore').onclick = () => $('#s-file').click();
  $('#s-file').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      if (people.length && !confirm('지금 저장된 내용을 백업 파일로 바꿀까요?')) return;
      const n = store.importBackup(text);
      people = store.loadPeople();
      settings = store.loadSettings();
      renderSettings();
      toast(`${n}명을 불러왔어요`);
    } catch {
      toast('백업 파일을 읽을 수 없어요');
    } finally {
      e.target.value = '';
    }
  };
}

/* ───────────── 알림 팝업 ───────────── */

let alertOpen = false;

function systemNotify(due) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const fresh = due.filter((a) => !notified.has(a.key));
  if (!fresh.length) return;
  fresh.forEach((a) => notified.add(a.key));
  const body = fresh.map(alertMessage).join('\n');
  const opts = { body, tag: 'family-birthday', icon: './icons/icon-192.png' };
  const direct = () => {
    try {
      new Notification('가족 생일', opts);
    } catch {
      // 안드로이드 크롬은 서비스 워커로만 알림 가능
    }
  };
  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.ready.then((reg) => reg.showNotification('가족 생일', opts)).catch(direct);
  } else {
    direct();
  }
}

function checkAlerts() {
  if (alertOpen) return;
  const t = today();
  const iso = toISO(t);
  if (store.loadSnooze() === iso) return;
  const due = dueAlerts(people, t, acks);
  if (!due.length) return;

  alertOpen = true;
  systemNotify(due);

  const backdrop = el(`<div class="backdrop modal-backdrop"></div>`);
  const modal = el(html`
    <div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="m-title">
      <h3 id="m-title">다가오는 생일</h3>
      <ul>${due
        .map((a) => {
          const [text, when] = alertMessage(a).split(' · ');
          return `<li>${esc(text)}<div class="when">${esc(when)}</div></li>`;
        })
        .join('')}</ul>
      <div class="actions">
        <button class="btn secondary" id="m-snooze">오늘 다시 보지 않기</button>
        <button class="btn" id="m-ok">확인</button>
      </div>
    </div>`);
  document.body.append(backdrop, modal);
  requestAnimationFrame(() => {
    backdrop.classList.add('show');
    modal.classList.add('show');
  });

  const close = () => {
    alertOpen = false;
    backdrop.classList.remove('show');
    modal.classList.remove('show');
    setTimeout(() => {
      backdrop.remove();
      modal.remove();
    }, 200);
  };
  modal.querySelector('#m-ok').onclick = () => {
    due.forEach((a) => (acks[a.key] = iso));
    store.saveAcks(acks, iso);
    close();
  };
  modal.querySelector('#m-snooze').onclick = () => {
    store.saveSnooze(iso);
    close();
  };
  modal.querySelector('#m-ok').focus();
}

/* ───────────── 시작 ───────────── */

function render() {
  if (location.hash === '#settings') {
    closeCurrentSheet?.();
    renderSettings();
  } else {
    renderList();
  }
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', render);

// 휴대폰에서 앱을 다시 열 때(백그라운드 복귀) 날짜와 알림을 갱신
let lastDay = toISO(today());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const now = toISO(today());
  if (now !== lastDay) {
    lastDay = now;
    if (location.hash !== '#settings') renderList();
  }
  checkAlerts();
});

render();
checkAlerts();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
