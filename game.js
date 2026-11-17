'use strict';

/* =========================================================
 *  TETR.JS — TETR.IO 스타일 모던 테트리스
 *  7-bag, SRS(+180°) 회전, 홀드, DAS/ARR, 소프트/하드 드롭,
 *  고스트, 락 딜레이, T-Spin, B2B, 콤보, 퍼펙트 클리어
 * ========================================================= */

// ---------- 보드 크기 ----------
const COLS = 10;
const ROWS = 40;                 // 내부 보드 (위쪽 20줄은 버퍼)
const VISIBLE_ROWS = 20;
const BUFFER_SHOWN = 2;          // 보드 위로 보여줄 버퍼 줄 수
const TOP = ROWS - VISIBLE_ROWS - BUFFER_SHOWN; // 렌더링 시작 줄 (18)
const SPAWN_Y = ROWS - VISIBLE_ROWS - 2;        // 스폰 위치 (보이는 영역 바로 위)
const CELL = 30;

// ---------- 핸들링 설정 (ms) ----------
const CONFIG = {
  DAS: 133,            // 자동 반복 시작까지 지연
  ARR: 10,             // 자동 반복 간격 (0 = 즉시 벽까지)
  SDF: 20,             // 소프트 드롭 배율
  LOCK_DELAY: 500,     // 바닥에 닿은 뒤 고정까지 시간
  MAX_LOCK_RESETS: 15, // 락 딜레이 리셋 최대 횟수
  NEXT_COUNT: 5,       // NEXT 미리보기 개수
};

// ---------- 미노 정의 ----------
const TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

const COLORS = {
  I: '#3ad3c8',
  O: '#f2cf4a',
  T: '#b54fd6',
  S: '#83d046',
  Z: '#ef4d5b',
  J: '#4f6be6',
  L: '#f3913c',
  X: '#5a5f73', // 게임오버 시 회색
};

const BASE_SHAPES = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  O: [
    [1, 1],
    [1, 1],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0],
  ],
};

function rotateMatrixCW(m) {
  const n = m.length;
  const r = Array.from({ length: n }, () => Array(n).fill(0));
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      r[x][n - 1 - y] = m[y][x];
    }
  }
  return r;
}

// STATES[type][rotation] = [[x, y], ...]  (rotation: 0, R, 2, L)
const STATES = {};
for (const t of TYPES) {
  let m = BASE_SHAPES[t];
  STATES[t] = [];
  for (let r = 0; r < 4; r++) {
    const cells = [];
    m.forEach((row, y) => row.forEach((v, x) => { if (v) cells.push([x, y]); }));
    STATES[t].push(cells);
    m = rotateMatrixCW(m);
  }
}

// ---------- SRS 킥 테이블 (x 오른쪽+, y 위쪽+) ----------
const KICKS_JLSTZ = {
  '01': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '10': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '12': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '21': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '23': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '32': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '30': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '03': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};

const KICKS_I = {
  '01': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '10': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '12': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '21': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '23': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '32': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '30': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '03': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};

// TETR.IO SRS+ 180° 킥
const KICKS_180 = {
  '02': [[0, 0], [0, 1], [1, 1], [-1, 1], [1, 0], [-1, 0]],
  '20': [[0, 0], [0, -1], [-1, -1], [1, -1], [-1, 0], [1, 0]],
  '13': [[0, 0], [1, 0], [1, 2], [1, 1], [0, 2], [0, 1]],
  '31': [[0, 0], [-1, 0], [-1, 2], [-1, 1], [0, 2], [0, 1]],
};

// ---------- DOM ----------
const boardCanvas = document.getElementById('board');
const holdCanvas = document.getElementById('hold');
const nextCanvas = document.getElementById('next');
const bctx = boardCanvas.getContext('2d');
const hctx = holdCanvas.getContext('2d');
const nctx = nextCanvas.getContext('2d');

const el = {
  score: document.getElementById('score'),
  lines: document.getElementById('lines'),
  level: document.getElementById('level'),
  pieces: document.getElementById('pieces'),
  pps: document.getElementById('pps'),
  time: document.getElementById('time'),
  actions: document.getElementById('actions'),
  overlay: document.getElementById('overlay'),
  overlayMsg: document.getElementById('overlay-msg'),
  startBtn: document.getElementById('start-btn'),
  frame: document.getElementById('frame'),
};

// ---------- 게임 상태 ----------
let game = null;

function createGame() {
  return {
    board: Array.from({ length: ROWS }, () => Array(COLS).fill(null)),
    queue: [],
    piece: null,
    hold: null,
    canHold: true,

    score: 0,
    lines: 0,
    level: 1,
    piecesPlaced: 0,
    time: 0,
    combo: -1,
    b2b: -1,

    dropAcc: 0,
    lockTimer: 0,
    lockResets: 0,
    lowestY: 0,
    lastWasRotate: false,
    lastKickIndex: 0,

    state: 'ready', // ready | playing | paused | over
  };
}

// ---------- 7-bag ----------
function refillQueue() {
  while (game.queue.length < 7 + CONFIG.NEXT_COUNT) {
    const bag = TYPES.slice();
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    game.queue.push(...bag);
  }
}

// ---------- 충돌 / 이동 ----------
function collides(type, rot, x, y) {
  for (const [cx, cy] of STATES[type][rot]) {
    const bx = x + cx;
    const by = y + cy;
    if (bx < 0 || bx >= COLS || by >= ROWS) return true;
    if (by >= 0 && game.board[by][bx]) return true;
  }
  return false;
}

function spawn(type) {
  const x = type === 'O' ? 4 : 3;
  const piece = { type, rot: 0, x, y: SPAWN_Y };
  game.piece = piece;
  game.dropAcc = 0;
  game.lockTimer = 0;
  game.lockResets = 0;
  game.lowestY = piece.y;
  game.lastWasRotate = false;

  if (collides(type, 0, x, piece.y)) {
    gameOver();
    return false;
  }
  return true;
}

function spawnNext() {
  refillQueue();
  return spawn(game.queue.shift());
}

function isOnGround() {
  const p = game.piece;
  return collides(p.type, p.rot, p.x, p.y + 1);
}

// 이동/회전 성공 시 락 딜레이 리셋
function onPieceMoved() {
  const p = game.piece;
  if (p.y > game.lowestY) {
    game.lowestY = p.y;
    game.lockResets = 0;
    game.lockTimer = 0;
  } else if (game.lockResets < CONFIG.MAX_LOCK_RESETS) {
    if (game.lockTimer > 0 || isOnGround()) game.lockResets++;
    game.lockTimer = 0;
  }
}

function move(dx) {
  const p = game.piece;
  if (!p || collides(p.type, p.rot, p.x + dx, p.y)) return false;
  p.x += dx;
  game.lastWasRotate = false;
  onPieceMoved();
  return true;
}

function stepDown() {
  const p = game.piece;
  if (collides(p.type, p.rot, p.x, p.y + 1)) return false;
  p.y += 1;
  game.lastWasRotate = false;
  if (p.y > game.lowestY) {
    game.lowestY = p.y;
    game.lockResets = 0;
    game.lockTimer = 0;
  }
  return true;
}

function rotate(dir) {
  const p = game.piece;
  if (!p) return false;
  const from = p.rot;
  const to = (from + dir + 4) % 4;
  const key = `${from}${to}`;
  const table = dir === 2 ? KICKS_180 : (p.type === 'I' ? KICKS_I : KICKS_JLSTZ);
  const kicks = table[key];

  for (let i = 0; i < kicks.length; i++) {
    const [kx, ky] = kicks[i];
    const nx = p.x + kx;
    const ny = p.y - ky; // 테이블은 y 위쪽이 +
    if (!collides(p.type, to, nx, ny)) {
      p.x = nx;
      p.y = ny;
      p.rot = to;
      game.lastWasRotate = true;
      game.lastKickIndex = i;
      onPieceMoved();
      return true;
    }
  }
  return false;
}

function hardDrop() {
  let dist = 0;
  while (stepDown()) dist++;
  game.score += dist * 2;
  lockPiece();
}

function holdPiece() {
  if (!game.canHold) return;
  const cur = game.piece.type;
  game.canHold = false;
  if (game.hold) {
    const h = game.hold;
    game.hold = cur;
    spawn(h);
  } else {
    game.hold = cur;
    spawnNext();
  }
}

function ghostY() {
  const p = game.piece;
  let y = p.y;
  while (!collides(p.type, p.rot, p.x, y + 1)) y++;
  return y;
}

// ---------- T-Spin 판정 (3-corner) ----------
function detectTSpin() {
  const p = game.piece;
  if (p.type !== 'T' || !game.lastWasRotate) return null;

  const filled = (x, y) => {
    const bx = p.x + x;
    const by = p.y + y;
    if (bx < 0 || bx >= COLS || by >= ROWS) return true;
    return by >= 0 && !!game.board[by][bx];
  };

  const corners = [[0, 0], [2, 0], [2, 2], [0, 2]]; // TL, TR, BR, BL
  const occ = corners.map(([x, y]) => filled(x, y));
  const count = occ.filter(Boolean).length;
  if (count < 3) return null;

  // 회전 상태별 T가 가리키는 쪽의 두 코너
  const frontIdx = [[0, 1], [1, 2], [2, 3], [3, 0]][p.rot];
  const frontFilled = occ[frontIdx[0]] && occ[frontIdx[1]];

  if (frontFilled || game.lastKickIndex === 4) return 'full';
  return 'mini';
}

// ---------- 고정 / 라인 클리어 / 점수 ----------
function lockPiece() {
  const p = game.piece;
  const tspin = detectTSpin();

  for (const [cx, cy] of STATES[p.type][p.rot]) {
    const by = p.y + cy;
    if (by >= 0) game.board[by][p.x + cx] = p.type;
  }

  // 라인 클리어
  let cleared = 0;
  for (let y = ROWS - 1; y >= 0; y--) {
    if (game.board[y].every(Boolean)) {
      game.board.splice(y, 1);
      game.board.unshift(Array(COLS).fill(null));
      cleared++;
      y++; // 윗줄이 내려왔으므로 같은 인덱스를 다시 검사
    }
  }

  scoreClear(cleared, tspin);

  game.piecesPlaced++;
  game.canHold = true;
  game.piece = null;
  spawnNext();
}

const CLEAR_NAMES = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'QUAD'];

function scoreClear(lines, tspin) {
  const lvl = game.level;
  let base = 0;
  let difficult = false;

  if (tspin === 'full') {
    base = [400, 800, 1200, 1600][lines];
    difficult = lines > 0;
    showAction(`T-SPIN ${CLEAR_NAMES[lines]}`.trim(), 'tspin');
  } else if (tspin === 'mini') {
    base = [100, 200, 400][lines] || 400;
    difficult = lines > 0;
    showAction(`T-SPIN MINI ${CLEAR_NAMES[lines]}`.trim(), 'tspin');
  } else if (lines > 0) {
    base = [0, 100, 300, 500, 800][lines];
    difficult = lines === 4;
    showAction(CLEAR_NAMES[lines], lines === 4 ? 'quad' : 'clear');
  }

  if (lines > 0) {
    // Back-to-Back
    if (difficult) {
      game.b2b++;
      if (game.b2b >= 1) {
        base *= 1.5;
        showAction(`B2B x${game.b2b}`, 'b2b');
      }
    } else {
      game.b2b = -1;
    }

    // 콤보
    game.combo++;
    if (game.combo >= 1) {
      game.score += 50 * game.combo * lvl;
      showAction(`${game.combo} COMBO`, 'combo');
    }

    // 퍼펙트 클리어
    if (game.board.every((row) => row.every((c) => !c))) {
      game.score += [0, 800, 1200, 1800, 2000][lines] * lvl;
      showAction('ALL CLEAR', 'pc');
    }

    game.lines += lines;
    game.level = Math.min(20, 1 + Math.floor(game.lines / 10));
  } else {
    game.combo = -1;
  }

  game.score += Math.floor(base * lvl);
}

function gravityInterval(level) {
  // 가이드라인 중력 공식 (ms / 칸)
  return Math.pow(0.8 - (level - 1) * 0.007, level - 1) * 1000;
}

// ---------- 입력 ----------
const held = { left: false, right: false, soft: false };
let lastDir = null;   // 'left' | 'right'
let dasTimer = 0;
let arrTimer = 0;

const KEYMAP = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowDown: 'soft',
  Space: 'hard',
  ArrowUp: 'cw',
  KeyX: 'cw',
  KeyZ: 'ccw',
  ControlLeft: 'ccw',
  ControlRight: 'ccw',
  KeyA: 'r180',
  KeyC: 'hold',
  ShiftLeft: 'hold',
  ShiftRight: 'hold',
  Escape: 'pause',
  KeyP: 'pause',
  KeyR: 'restart',
  Enter: 'start',
};

document.addEventListener('keydown', (e) => {
  const action = KEYMAP[e.code];
  if (!action) return;
  e.preventDefault();
  if (e.repeat) return; // 브라우저 키 반복 무시 (DAS/ARR 직접 처리)

  // 방향/소프트드롭 키 상태는 게임 상태와 무관하게 추적 (DAS 유지)
  if (action === 'left' || action === 'right') {
    held[action] = true;
    lastDir = action;
    dasTimer = 0;
    arrTimer = 0;
  }
  if (action === 'soft') held.soft = true;

  if (action === 'start') {
    if (game.state === 'ready' || game.state === 'over') startGame();
    else if (game.state === 'paused') togglePause();
    return;
  }
  if (action === 'restart') {
    startGame();
    return;
  }
  if (action === 'pause') {
    togglePause();
    return;
  }

  if (game.state !== 'playing' || !game.piece) return;

  switch (action) {
    case 'left': move(-1); break;
    case 'right': move(1); break;
    case 'hard': hardDrop(); break;
    case 'cw': rotate(1); break;
    case 'ccw': rotate(-1); break;
    case 'r180': rotate(2); break;
    case 'hold': holdPiece(); break;
  }
});

document.addEventListener('keyup', (e) => {
  const action = KEYMAP[e.code];
  if (!action) return;
  if (action === 'left' || action === 'right') {
    held[action] = false;
    const other = action === 'left' ? 'right' : 'left';
    if (lastDir === action) {
      lastDir = held[other] ? other : null;
      dasTimer = 0;
      arrTimer = 0;
    }
  }
  if (action === 'soft') held.soft = false;
});

window.addEventListener('blur', () => {
  held.left = held.right = held.soft = false;
  lastDir = null;
  if (game.state === 'playing') togglePause();
});

el.startBtn.addEventListener('click', () => {
  if (game.state === 'paused') togglePause();
  else startGame();
  el.startBtn.blur();
});

// ---------- 게임 흐름 ----------
function startGame() {
  game = createGame();
  el.actions.innerHTML = '';
  refillQueue();
  game.state = 'playing';
  hideOverlay();
  spawnNext();
}

function togglePause() {
  if (game.state === 'playing') {
    game.state = 'paused';
    showOverlay('PAUSED', 'Esc / P 또는 Enter로 계속', 'RESUME');
  } else if (game.state === 'paused') {
    game.state = 'playing';
    hideOverlay();
  }
}

function gameOver() {
  game.state = 'over';
  showOverlay('GAME OVER', `SCORE ${game.score.toLocaleString()}\nLINES ${game.lines}\nR 또는 Enter로 재시작`, 'RETRY');
}

function showOverlay(title, msg, btn) {
  el.overlay.querySelector('.logo').innerHTML = title;
  el.overlayMsg.textContent = msg;
  el.startBtn.textContent = btn;
  el.overlay.classList.remove('hidden');
}

function hideOverlay() {
  el.overlay.classList.add('hidden');
}

function showAction(text, cls) {
  const div = document.createElement('div');
  div.className = `action ${cls}`;
  div.textContent = text;
  el.actions.appendChild(div);
  while (el.actions.children.length > 5) el.actions.firstChild.remove();
  setTimeout(() => div.remove(), 1600);
}

// ---------- 업데이트 ----------
function update(dt) {
  if (game.state !== 'playing' || !game.piece) return;
  game.time += dt;

  // DAS / ARR
  const dir = lastDir === 'left' ? -1 : lastDir === 'right' ? 1 : 0;
  if (dir !== 0) {
    dasTimer += dt;
    if (dasTimer >= CONFIG.DAS) {
      if (CONFIG.ARR === 0) {
        while (move(dir));
      } else {
        arrTimer += dt;
        while (arrTimer >= CONFIG.ARR) {
          arrTimer -= CONFIG.ARR;
          if (!move(dir)) { arrTimer = 0; break; }
        }
      }
    }
  }

  // 중력 + 소프트 드롭
  let g = 1 / gravityInterval(game.level); // 칸 / ms
  const soft = held.soft;
  if (soft) g *= CONFIG.SDF;
  game.dropAcc += g * dt;
  while (game.dropAcc >= 1) {
    game.dropAcc -= 1;
    if (stepDown()) {
      if (soft) game.score += 1;
    } else {
      game.dropAcc = 0;
      break;
    }
  }

  // 락 딜레이
  if (isOnGround()) {
    game.lockTimer += dt;
    if (game.lockTimer >= CONFIG.LOCK_DELAY) lockPiece();
  } else {
    game.lockTimer = 0;
  }
}

// ---------- 렌더링 ----------
function drawBlock(ctx, x, y, size, color, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fillRect(x, y, size, size * 0.16);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x, y + size * 0.84, size, size * 0.16);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(x + size * 0.84, y, size * 0.16, size);
  ctx.globalAlpha = 1;
}

function renderBoard() {
  const W = COLS * CELL;
  const visTop = BUFFER_SHOWN * CELL;
  bctx.clearRect(0, 0, boardCanvas.width, boardCanvas.height);

  // 보이는 영역 배경 + 그리드
  bctx.fillStyle = '#080a16';
  bctx.fillRect(0, visTop, W, VISIBLE_ROWS * CELL);
  bctx.strokeStyle = 'rgba(255,255,255,0.05)';
  bctx.lineWidth = 1;
  bctx.beginPath();
  for (let x = 1; x < COLS; x++) {
    bctx.moveTo(x * CELL + 0.5, visTop);
    bctx.lineTo(x * CELL + 0.5, boardCanvas.height);
  }
  for (let y = 1; y < VISIBLE_ROWS; y++) {
    bctx.moveTo(0, visTop + y * CELL + 0.5);
    bctx.lineTo(W, visTop + y * CELL + 0.5);
  }
  bctx.stroke();

  if (!game) return;
  const over = game.state === 'over';

  // 고정된 블록
  let danger = false;
  for (let y = TOP; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const c = game.board[y][x];
      if (c) {
        drawBlock(bctx, x * CELL, (y - TOP) * CELL, CELL, over ? COLORS.X : COLORS[c]);
        if (y < TOP + BUFFER_SHOWN + 4) danger = true;
      }
    }
  }
  el.frame.classList.toggle('danger', danger && !over);

  const p = game.piece;
  if (!p || over) return;

  // 고스트
  const gy = ghostY();
  const color = COLORS[p.type];
  for (const [cx, cy] of STATES[p.type][p.rot]) {
    const y = gy + cy;
    if (y < TOP) continue;
    const px = (p.x + cx) * CELL;
    const py = (y - TOP) * CELL;
    bctx.globalAlpha = 0.18;
    bctx.fillStyle = color;
    bctx.fillRect(px, py, CELL, CELL);
    bctx.globalAlpha = 0.55;
    bctx.strokeStyle = color;
    bctx.lineWidth = 2;
    bctx.strokeRect(px + 1, py + 1, CELL - 2, CELL - 2);
    bctx.globalAlpha = 1;
  }

  // 현재 미노 (락 딜레이 진행 중이면 살짝 어두워짐)
  const lockFade = isOnGround() ? 1 - 0.35 * (game.lockTimer / CONFIG.LOCK_DELAY) : 1;
  for (const [cx, cy] of STATES[p.type][p.rot]) {
    const y = p.y + cy;
    if (y < TOP) continue;
    drawBlock(bctx, (p.x + cx) * CELL, (y - TOP) * CELL, CELL, color, lockFade);
  }
}

function drawMiniPiece(ctx, type, cx, cy, size, color) {
  const cells = STATES[type][0];
  const xs = cells.map((c) => c[0]);
  const ys = cells.map((c) => c[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = (maxX - minX + 1) * size;
  const h = (maxY - minY + 1) * size;
  const ox = cx - w / 2;
  const oy = cy - h / 2;
  for (const [x, y] of cells) {
    drawBlock(ctx, ox + (x - minX) * size, oy + (y - minY) * size, size, color);
  }
}

function renderHold() {
  hctx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
  if (!game || !game.hold) return;
  const color = game.canHold ? COLORS[game.hold] : COLORS.X;
  drawMiniPiece(hctx, game.hold, holdCanvas.width / 2, holdCanvas.height / 2, 24, color);
}

function renderNext() {
  nctx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  if (!game || game.state === 'ready') return;
  const slot = nextCanvas.height / CONFIG.NEXT_COUNT;
  for (let i = 0; i < CONFIG.NEXT_COUNT; i++) {
    const t = game.queue[i];
    if (!t) break;
    drawMiniPiece(nctx, t, nextCanvas.width / 2, slot * i + slot / 2, i === 0 ? 24 : 20, COLORS[t]);
  }
}

function formatTime(ms) {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function renderStats() {
  el.score.textContent = game.score.toLocaleString();
  el.lines.textContent = game.lines;
  el.level.textContent = game.level;
  el.pieces.textContent = game.piecesPlaced;
  el.pps.textContent = game.time > 0 ? (game.piecesPlaced / (game.time / 1000)).toFixed(2) : '0.00';
  el.time.textContent = formatTime(game.time);
}

function render() {
  renderBoard();
  renderHold();
  renderNext();
  renderStats();
}

// ---------- 메인 루프 ----------
let lastTs = performance.now();

function loop(ts) {
  const dt = Math.min(ts - lastTs, 100);
  lastTs = ts;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

game = createGame();
requestAnimationFrame(loop);
