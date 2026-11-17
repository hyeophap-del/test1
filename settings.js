'use strict';

/* =========================================================
 *  settings.js — 조작키 / 핸들링 설정
 *  - 인게임에서 쓰는 모든 키를 바꿀 수 있음 (동작당 최대 3개)
 *  - DAS / ARR / DCD / SDF 조절
 *  - 설정은 localStorage에 저장되어 다음 실행 때도 유지
 *  game.js보다 먼저 로드해야 합니다.
 * ========================================================= */

const Settings = (() => {
  const STORAGE_KEY = 'tetrjs.settings.v1';
  const SLOTS = 3;     // 동작당 키 슬롯 수
  const SDF_INF = 41;  // SDF 슬라이더 최대값 = ∞ (즉시 바닥까지)

  // ---------- 동작 목록 ----------
  const ACTIONS = [
    { id: 'left', label: '왼쪽 이동' },
    { id: 'right', label: '오른쪽 이동' },
    { id: 'soft', label: '소프트 드롭' },
    { id: 'hard', label: '하드 드롭' },
    { id: 'cw', label: '시계 회전' },
    { id: 'ccw', label: '반시계 회전' },
    { id: 'r180', label: '180° 회전' },
    { id: 'hold', label: '홀드' },
    { id: 'pause', label: '일시정지' },
    { id: 'restart', label: '재시작' },
    { id: 'start', label: '시작 / 계속' },
  ];

  const DEFAULT_BINDS = {
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    soft: ['ArrowDown'],
    hard: ['Space'],
    cw: ['ArrowUp', 'KeyX'],
    ccw: ['KeyZ', 'ControlLeft', 'ControlRight'],
    r180: ['KeyA'],
    hold: ['KeyC', 'ShiftLeft', 'ShiftRight'],
    pause: ['Escape', 'KeyP'],
    restart: ['KeyR'],
    start: ['Enter'],
  };

  // ---------- 핸들링 항목 ----------
  const HANDLING_DEFS = [
    { id: 'DAS', desc: '연속 이동이 시작되기까지의 지연', min: 0, max: 333, unit: 'ms', def: 133 },
    { id: 'ARR', desc: '연속 이동 간격 (0 = 즉시 벽까지)', min: 0, max: 100, unit: 'ms', def: 10 },
    { id: 'DCD', desc: '회전·드롭·홀드 직후 연속 이동을 멈추는 시간', min: 0, max: 333, unit: 'ms', def: 0 },
    { id: 'SDF', desc: '소프트 드롭 배율 (최대 = ∞, 즉시 바닥까지)', min: 1, max: SDF_INF, unit: 'x', def: 20 },
  ];

  // ---------- 키 이름 ----------
  const KEY_NAMES = {
    ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
    Space: 'Space', Escape: 'Esc', Enter: 'Enter', Tab: 'Tab', Backspace: 'Backspace',
    CapsLock: 'Caps', Delete: 'Del', Insert: 'Ins', Home: 'Home', End: 'End',
    PageUp: 'PgUp', PageDown: 'PgDn',
    ShiftLeft: 'LShift', ShiftRight: 'RShift',
    ControlLeft: 'LCtrl', ControlRight: 'RCtrl',
    AltLeft: 'LAlt', AltRight: 'RAlt',
    MetaLeft: 'LMeta', MetaRight: 'RMeta',
    Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
    Backslash: '\\', IntlBackslash: '\\', Semicolon: ';', Quote: "'",
    Comma: ',', Period: '.', Slash: '/',
    NumpadAdd: 'Num +', NumpadSubtract: 'Num -', NumpadMultiply: 'Num *',
    NumpadDivide: 'Num /', NumpadDecimal: 'Num .', NumpadEnter: 'Num Enter',
    Lang1: '한/영', Lang2: '한자', ContextMenu: 'Menu',
  };
  const MOD_NAMES = { Shift: 'Shift', Control: 'Ctrl', Alt: 'Alt', Meta: 'Meta' };

  function keyName(code) {
    if (!code) return '—';
    if (KEY_NAMES[code]) return KEY_NAMES[code];
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
    return code;
  }

  // 동작에 묶인 키를 사람이 읽는 문자열로 ("Z / Ctrl"). 좌우 양쪽 수식키는 하나로 합침.
  function keysText(action) {
    const codes = (state.binds[action] || []).filter(Boolean);
    const out = [];
    for (const c of codes) {
      const m = c.match(/^(Shift|Control|Alt|Meta)(Left|Right)$/);
      if (m && codes.includes(m[1] + (m[2] === 'Left' ? 'Right' : 'Left'))) {
        const name = MOD_NAMES[m[1]];
        if (!out.includes(name)) out.push(name);
        continue;
      }
      out.push(keyName(c));
    }
    return out.join(' / ');
  }

  function actionLabel(id) {
    const a = ACTIONS.find((x) => x.id === id);
    return a ? a.label : id;
  }

  // ---------- 상태 / 저장 ----------
  const state = { handling: {}, binds: {} };
  let codeToAction = {};

  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  function load() {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch (_) {
      saved = null;
    }

    for (const d of HANDLING_DEFS) {
      const v = Number(saved && saved.handling && saved.handling[d.id]);
      state.handling[d.id] = Number.isFinite(v) ? clamp(Math.round(v), d.min, d.max) : d.def;
    }

    const used = new Set();
    for (const a of ACTIONS) {
      const src = saved && saved.binds && Array.isArray(saved.binds[a.id])
        ? saved.binds[a.id]
        : DEFAULT_BINDS[a.id];
      const slots = [];
      for (let i = 0; i < SLOTS; i++) {
        const c = src[i];
        if (typeof c === 'string' && c && !used.has(c)) {
          slots.push(c);
          used.add(c);
        } else {
          slots.push(null);
        }
      }
      state.binds[a.id] = slots;
    }
    rebuildMap();
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {
      /* 저장 불가 환경(시크릿 모드 등)에서는 이번 세션에만 적용 */
    }
  }

  function rebuildMap() {
    codeToAction = {};
    for (const a of ACTIONS) {
      for (const c of state.binds[a.id]) if (c) codeToAction[c] = a.id;
    }
  }

  function resetHandling() {
    for (const d of HANDLING_DEFS) state.handling[d.id] = d.def;
    commit();
  }

  function resetBinds() {
    for (const a of ACTIONS) {
      const def = DEFAULT_BINDS[a.id];
      state.binds[a.id] = Array.from({ length: SLOTS }, (_, i) => def[i] || null);
    }
    commit();
  }

  // 키를 동작의 슬롯에 지정. 다른 동작에 이미 있던 같은 키는 빼옴.
  function assign(action, slot, code) {
    let stolenFrom = null;
    for (const a of ACTIONS) {
      const s = state.binds[a.id];
      for (let i = 0; i < SLOTS; i++) {
        if (s[i] === code) {
          s[i] = null;
          if (a.id !== action) stolenFrom = a.id;
        }
      }
    }
    state.binds[action][slot] = code;
    commit();
    if (stolenFrom) {
      notice(`${keyName(code)} 키를 '${actionLabel(stolenFrom)}'에서 옮겼습니다`, true);
    }
  }

  function clearSlot(action, slot) {
    state.binds[action][slot] = null;
    commit();
  }

  // ---------- 이벤트 ----------
  const listeners = { open: [], close: [], change: [] };

  function on(ev, fn) {
    listeners[ev].push(fn);
  }

  function emit(ev) {
    for (const fn of listeners[ev]) fn();
  }

  function commit() {
    rebuildMap();
    save();
    renderPanel();
    renderControls();
    emit('change');
  }

  // ---------- 핸들링 값 (게임에서 읽음) ----------
  // SDF는 최대값일 때 Infinity를 돌려줌
  const handling = {};
  for (const d of HANDLING_DEFS) {
    Object.defineProperty(handling, d.id, {
      enumerable: true,
      get() {
        const v = state.handling[d.id];
        return d.id === 'SDF' && v >= SDF_INF ? Infinity : v;
      },
    });
  }

  // ---------- 설정 창 UI ----------
  let root = null;
  let dialog = null;
  let noticeEl = null;
  let isOpen = false;
  let capturing = null; // { action, slot, btn }
  let lastFocus = null;

  function handlingText(d, v) {
    if (d.id === 'SDF') return v >= SDF_INF ? '∞' : `${v}x`;
    return `${v}ms`;
  }

  function buildUI() {
    root = document.createElement('div');
    root.className = 'settings-backdrop hidden';
    root.innerHTML = `
      <div class="settings" role="dialog" aria-modal="true" aria-labelledby="settings-title" tabindex="-1">
        <header class="settings-head">
          <h2 id="settings-title">SETTINGS</h2>
          <button type="button" class="settings-close" aria-label="닫기">×</button>
        </header>

        <section class="settings-section">
          <div class="settings-section-head">
            <h3>HANDLING</h3>
            <button type="button" class="link-btn" data-reset="handling">기본값</button>
          </div>
          <div class="handling"></div>
        </section>

        <section class="settings-section">
          <div class="settings-section-head">
            <h3>CONTROLS</h3>
            <button type="button" class="link-btn" data-reset="binds">기본값</button>
          </div>
          <table class="keys"><tbody></tbody></table>
        </section>

        <p class="settings-notice" aria-live="polite"></p>
        <p class="settings-hint">칸을 클릭하고 키를 누르세요 · 다시 클릭하면 취소 · 우클릭으로 지우기 · Esc로 닫기</p>
      </div>`;
    document.body.appendChild(root);

    dialog = root.querySelector('.settings');
    noticeEl = root.querySelector('.settings-notice');

    // 핸들링 슬라이더
    const hWrap = root.querySelector('.handling');
    for (const d of HANDLING_DEFS) {
      const row = document.createElement('label');
      row.className = 'handling-row';
      row.innerHTML = `
        <span class="handling-name"><b>${d.id}</b><small>${d.desc}</small></span>
        <input type="range" min="${d.min}" max="${d.max}" step="1" data-handling="${d.id}" />
        <output class="handling-value"></output>`;
      const input = row.querySelector('input');
      input.addEventListener('input', () => {
        state.handling[d.id] = Number(input.value);
        commit();
      });
      hWrap.appendChild(row);
    }

    // 키 슬롯 표
    const tbody = root.querySelector('.keys tbody');
    for (const a of ACTIONS) {
      const tr = document.createElement('tr');
      tr.dataset.action = a.id;
      let html = `<td class="key-label">${a.label}</td>`;
      for (let i = 0; i < SLOTS; i++) {
        html += `<td><button type="button" class="key-slot" data-action="${a.id}" data-slot="${i}"></button></td>`;
      }
      tr.innerHTML = html;
      tbody.appendChild(tr);
    }

    tbody.addEventListener('click', (e) => {
      const btn = e.target.closest('.key-slot');
      if (!btn) return;
      const action = btn.dataset.action;
      const slot = Number(btn.dataset.slot);
      if (capturing && capturing.btn === btn) {
        stopCapture();
      } else {
        startCapture(action, slot, btn);
      }
    });

    tbody.addEventListener('contextmenu', (e) => {
      const btn = e.target.closest('.key-slot');
      if (!btn) return;
      e.preventDefault();
      stopCapture();
      clearSlot(btn.dataset.action, Number(btn.dataset.slot));
    });

    // 슬롯 바깥을 누르면 입력 대기 취소
    dialog.addEventListener('mousedown', (e) => {
      if (capturing && !e.target.closest('.key-slot')) stopCapture();
    });

    root.addEventListener('mousedown', (e) => {
      if (e.target === root) close();
    });
    root.querySelector('.settings-close').addEventListener('click', close);
    root.querySelector('[data-reset="handling"]').addEventListener('click', () => {
      resetHandling();
      notice('핸들링을 기본값으로 되돌렸습니다');
    });
    root.querySelector('[data-reset="binds"]').addEventListener('click', () => {
      stopCapture();
      resetBinds();
      notice('조작키를 기본값으로 되돌렸습니다');
    });

    renderPanel();
  }

  function renderPanel() {
    if (!root) return;
    for (const d of HANDLING_DEFS) {
      const input = root.querySelector(`[data-handling="${d.id}"]`);
      const v = state.handling[d.id];
      if (Number(input.value) !== v) input.value = v;
      input.closest('.handling-row').querySelector('output').textContent = handlingText(d, v);
    }
    for (const a of ACTIONS) {
      const tr = root.querySelector(`tr[data-action="${a.id}"]`);
      tr.classList.toggle('unbound', !state.binds[a.id].some(Boolean));
      tr.querySelectorAll('.key-slot').forEach((btn, i) => {
        if (capturing && capturing.btn === btn) return;
        const code = state.binds[a.id][i];
        btn.textContent = code ? keyName(code) : '—';
        btn.classList.toggle('empty', !code);
      });
    }
  }

  function startCapture(action, slot, btn) {
    stopCapture();
    capturing = { action, slot, btn };
    btn.classList.add('capturing');
    btn.textContent = '키 입력…';
  }

  function stopCapture() {
    if (!capturing) return;
    const { btn } = capturing;
    capturing = null;
    btn.classList.remove('capturing');
    btn.blur();
    renderPanel();
  }

  let noticeTimer = 0;
  function notice(text, warn = false) {
    if (!noticeEl) return;
    noticeEl.textContent = text;
    noticeEl.classList.toggle('warn', warn);
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { noticeEl.textContent = ''; }, 3000);
  }

  function open() {
    if (isOpen) return;
    if (!root) buildUI();
    isOpen = true;
    lastFocus = document.activeElement;
    renderPanel();
    root.classList.remove('hidden');
    dialog.focus();
    emit('open');
  }

  function close() {
    if (!isOpen) return;
    stopCapture();
    isOpen = false;
    root.classList.add('hidden');
    if (lastFocus && lastFocus.blur) lastFocus.blur();
    emit('close');
  }

  // 설정 창이 열려 있는 동안 키 입력은 게임으로 전달하지 않음 (캡처 단계에서 가로챔)
  window.addEventListener('keydown', (e) => {
    if (!isOpen) return;
    e.stopPropagation();
    if (capturing) {
      e.preventDefault();
      if (e.repeat) return;
      const { action, slot } = capturing;
      stopCapture();
      assign(action, slot, e.code);
      return;
    }
    if (e.code === 'Escape') {
      e.preventDefault();
      close();
    }
  }, true);

  window.addEventListener('keyup', (e) => {
    if (isOpen) e.stopPropagation();
  }, true);

  // ---------- 오른쪽 패널의 조작키 안내 ----------
  function renderControls() {
    const table = document.getElementById('controls');
    if (!table) return;
    table.innerHTML = '';
    for (const a of ACTIONS) {
      const tr = document.createElement('tr');
      const k = document.createElement('td');
      const l = document.createElement('td');
      k.textContent = keysText(a.id) || '—';
      l.textContent = a.label;
      tr.append(k, l);
      table.appendChild(tr);
    }
  }

  // ---------- 초기화 ----------
  load();

  function init() {
    renderControls();
    document.querySelectorAll('[data-open-settings]').forEach((btn) => {
      btn.addEventListener('click', () => {
        btn.blur();
        open();
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return {
    handling,
    actionFor: (code) => codeToAction[code] || null,
    keysText,
    keyName,
    isOpen: () => isOpen,
    open,
    close,
    on,
  };
})();
