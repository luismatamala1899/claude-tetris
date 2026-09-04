'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
  '#b0bec5', // N - nut (grey)
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // N - nut (hollow center)
];

const TYPES = PIECES.length - 1;

const LINE_SCORES = [0, 100, 300, 500, 800];

const THEME_KEY = 'tetris-theme';
const GRID_COLORS = { dark: '#22222e', light: '#d5d5e2' };

// ---- Sistema de skins ----
// IMPORTANTE: cada paleta debe tener la misma longitud y orden que COLORS
// (índice = tipo de pieza). Si se agrega una pieza nueva a PIECES/COLORS,
// añade también su color a 'neon' y 'pastel' aquí; drawBlock() cae de vuelta
// a COLORS[colorIndex] para índices faltantes, pero eso ignora el skin activo.
const SKIN_KEY = 'tetris-skin';
const SKIN_PALETTES = {
  retro: COLORS,
  neon: [
    null,
    '#00fff2', // I - cian neón
    '#faff00', // O - amarillo neón
    '#ff00ff', // T - magenta neón
    '#39ff14', // S - verde lima eléctrico
    '#ff073a', // Z - rojo neón
    '#00aaff', // J - azul neón
    '#ff9100', // L - naranja neón
    '#e0e0e0', // N - plateado
  ],
  pastel: [
    null,
    '#b2ebf2', // I - celeste pastel
    '#fff9c4', // O - amarillo pastel
    '#e1bee7', // T - lila pastel
    '#c8e6c9', // S - verde pastel
    '#ffcdd2', // Z - rosa pastel
    '#bbdefb', // J - azul pastel
    '#ffe0b2', // L - naranja pastel
    '#eceff1', // N - gris pastel
  ],
  pixel: COLORS,
};

// ---- Sistema de habilidades ----
const QUEUE_SIZE = 5;            // piezas precalculadas en la cola
const ENERGY_MAX = 100;
const ENERGY_PER_LINE = 20;      // + bonus por tetris
const ENERGY_TETRIS_BONUS = 20;
const SLOW_DURATION = 10000;     // ms
const SLOW_FACTOR = 2.5;         // multiplicador del dropInterval
const VISION_DURATION = 30000;   // ms

const ABILITIES = [
  {
    id: 'vision',
    icon: '👁',
    name: 'Visión',
    desc: `Ve las próximas ${QUEUE_SIZE} piezas durante ${VISION_DURATION / 1000}s`,
  },
  {
    id: 'swap',
    icon: '🔄',
    name: 'Intercambio',
    desc: 'Cambia la pieza actual por otra del pool',
  },
  {
    id: 'slow',
    icon: '🐌',
    name: 'Ralentizar',
    desc: `Reduce la velocidad de caída durante ${SLOW_DURATION / 1000}s`,
  },
  {
    id: 'undo',
    icon: '↩',
    name: 'Deshacer',
    desc: 'Revierte la última colocación',
  },
  {
    id: 'hold',
    icon: '📦',
    name: 'Reservar',
    desc: 'Guarda la pieza actual (o recupera la reservada)',
  },
];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const holdCanvas = document.getElementById('hold-canvas');
const holdCtx = holdCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const skinSelect = document.getElementById('skin-select');
const energyBar = document.querySelector('.energy-bar');
const energyFill = document.getElementById('energy-fill');
const energyText = document.getElementById('energy-text');
const abilityBtn = document.getElementById('ability-btn');
const abilityOverlay = document.getElementById('ability-overlay');
const abilityList = document.getElementById('ability-list');
const effectsEl = document.getElementById('effects');

let board, current, queue, hold, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let energy, choosing, slowLeft, visionLeft, snapshot, effectsHTML;
let currentSkin = 'retro';

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function spawnX(shape) {
  return Math.floor(COLS / 2) - Math.floor(shape[0].length / 2);
}

function makePiece(type) {
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: spawnX(shape), y: 0 };
}

function randomPiece() {
  return makePiece(Math.floor(Math.random() * TYPES) + 1);
}

function clonePiece(p) {
  return { type: p.type, shape: p.shape.map(row => [...row]), x: p.x, y: p.y };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    gainEnergy(cleared * ENERGY_PER_LINE + (cleared >= 4 ? ENERGY_TETRIS_BONUS : 0));
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  takeSnapshot();
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = queue.shift();
  queue.push(randomPiece());
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawPreview();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const palette = SKIN_PALETTES[currentSkin] || COLORS;
  const color = palette[colorIndex] || COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  switch (currentSkin) {
    case 'neon':
      drawBlockNeon(context, x, y, color, size);
      break;
    case 'pastel':
      drawBlockPastel(context, x, y, color, size);
      break;
    case 'pixel':
      drawBlockPixel(context, x, y, color, size);
      break;
    default:
      drawBlockRetro(context, x, y, color, size);
  }
  context.globalAlpha = 1;
}

function drawBlockRetro(context, x, y, color, size) {
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
}

function drawBlockNeon(context, x, y, color, size) {
  context.shadowBlur = Math.max(6, size * 0.4);
  context.shadowColor = color;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  context.shadowBlur = 0;
  context.shadowColor = 'transparent';
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.2)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
}

function drawBlockPastel(context, x, y, color, size) {
  const px = x * size + 1;
  const py = y * size + 1;
  const w = size - 2;
  const h = size - 2;
  const radius = Math.min(6, w / 3, h / 3);
  context.fillStyle = color;
  drawRoundedRectPath(context, px, py, w, h, radius);
  context.fill();
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.3)';
  drawRoundedRectPath(context, px, py, w, Math.max(3, h * 0.35), radius);
  context.fill();
}

function drawRoundedRectPath(context, x, y, w, h, radius) {
  // Igual que el clamp interno de CanvasRenderingContext2D.roundRect: el radio
  // nunca puede superar la mitad del lado más corto o el path se distorsiona.
  radius = Math.max(0, Math.min(radius, w / 2, h / 2));
  context.beginPath();
  if (typeof context.roundRect === 'function') {
    context.roundRect(x, y, w, h, radius);
    return;
  }
  // Fallback manual para navegadores sin roundRect.
  context.moveTo(x + radius, y);
  context.arcTo(x + w, y, x + w, y + h, radius);
  context.arcTo(x + w, y + h, x, y + h, radius);
  context.arcTo(x, y + h, x, y, radius);
  context.arcTo(x, y, x + w, y, radius);
  context.closePath();
}

function drawBlockPixel(context, x, y, color, size) {
  const px = x * size + 1;
  const py = y * size + 1;
  const w = size - 2;
  const h = size - 2;
  context.fillStyle = color;
  context.fillRect(px, py, w, h);
  // textura pixel-art: grilla 2x2 alternando tonos claros/oscuros
  const halfW = w / 2;
  const halfH = h / 2;
  context.fillStyle = 'rgba(0,0,0,0.15)';
  context.fillRect(px, py, halfW, halfH);
  context.fillRect(px + halfW, py + halfH, w - halfW, h - halfH);
  context.fillStyle = 'rgba(255,255,255,0.18)';
  context.fillRect(px + halfW, py, w - halfW, halfH);
  context.fillRect(px, py + halfH, halfW, h - halfH);
}

function drawGrid() {
  const theme = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  ctx.strokeStyle = GRID_COLORS[theme];
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  if (gameOver) return;

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

// Dibuja una pieza centrada dentro de una caja de boxW × boxH px que empieza en originY.
function drawPieceBoxed(context, shape, cell, boxW, boxH, originY, alpha) {
  context.save();
  context.translate(
    Math.round((boxW - shape[0].length * cell) / 2),
    Math.round(originY + (boxH - shape.length * cell) / 2)
  );
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(context, c, r, shape[r][c], cell, alpha);
  context.restore();
}

function drawPreview() {
  const visionOn = visionLeft > 0;
  const cell = visionOn ? 16 : 30;
  const rowH = visionOn ? 70 : 120;
  const count = visionOn ? QUEUE_SIZE : 1;

  // Cambiar height limpia el canvas y reinicia el estado del contexto.
  nextCanvas.height = rowH * count;
  for (let i = 0; i < count; i++) {
    drawPieceBoxed(nextCtx, queue[i].shape, cell, nextCanvas.width, rowH, i * rowH, i === 0 ? 1 : 0.55);
  }
}

function drawHold() {
  holdCtx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
  if (hold) drawPieceBoxed(holdCtx, hold.shape, 30, holdCanvas.width, holdCanvas.height, 0);
}

// ---- Energía ----

function gainEnergy(amount) {
  energy = Math.min(ENERGY_MAX, energy + amount);
  updateEnergyUI();
}

function abilityReady() {
  return energy >= ENERGY_MAX && !gameOver && !paused && !choosing;
}

function updateEnergyUI() {
  const pct = Math.round((energy / ENERGY_MAX) * 100);
  energyFill.style.width = `${pct}%`;
  energyText.textContent = `${pct}%`;
  energyBar.classList.toggle('full', energy >= ENERGY_MAX);
  abilityBtn.disabled = !abilityReady();
}

function updateEffectsUI() {
  const badges = [];
  if (slowLeft > 0) badges.push(`🐌 ${Math.ceil(slowLeft / 1000)}s`);
  if (visionLeft > 0) badges.push(`👁 ${Math.ceil(visionLeft / 1000)}s`);
  const html = badges.map(b => `<span class="effect-badge">${b}</span>`).join('');
  if (html !== effectsHTML) {
    effectsEl.innerHTML = html;
    effectsHTML = html;
  }
}

function tickEffects(dt) {
  if (slowLeft > 0) slowLeft = Math.max(0, slowLeft - dt);
  if (visionLeft > 0) {
    const before = visionLeft;
    visionLeft = Math.max(0, visionLeft - dt);
    if (before > 0 && visionLeft === 0) drawPreview();
  }
  updateEffectsUI();
}

// ---- Habilidades ----

function isAvailable(id) {
  if (id === 'undo') return snapshot !== null;
  return true;
}

function renderAbilityList() {
  abilityList.innerHTML = '';
  ABILITIES.forEach((ability, i) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'ability-card';
    card.disabled = !isAvailable(ability.id);
    card.innerHTML =
      `<span class="ability-key">${i + 1}</span>` +
      `<span class="ability-icon">${ability.icon}</span>` +
      `<span class="ability-info">` +
        `<span class="ability-name">${ability.name}</span>` +
        `<span class="ability-desc">${ability.desc}</span>` +
      `</span>`;
    card.addEventListener('click', () => chooseAbility(ability.id));
    abilityList.appendChild(card);
  });
}

function openAbilityMenu() {
  if (!abilityReady()) return;
  choosing = true;
  cancelAnimationFrame(animId);
  renderAbilityList();
  abilityOverlay.classList.remove('hidden');
  updateEnergyUI();
}

function closeAbilityMenu() {
  choosing = false;
  abilityOverlay.classList.add('hidden');
  updateEnergyUI();
  if (!paused && !gameOver) {
    lastTime = performance.now();
    animId = requestAnimationFrame(loop);
  }
}

function chooseAbility(id) {
  if (!choosing || !isAvailable(id)) return;
  if (applyAbility(id)) {
    energy = 0;
    snapshot = id === 'undo' ? null : snapshot;
  }
  closeAbilityMenu();
  updateHUD();
}

// Devuelve true si la habilidad se aplicó (y por tanto consume energía).
function applyAbility(id) {
  switch (id) {
    case 'vision':
      visionLeft = VISION_DURATION;
      drawPreview();
      updateEffectsUI();
      return true;
    case 'slow':
      slowLeft = SLOW_DURATION;
      updateEffectsUI();
      return true;
    case 'swap':
      return swapCurrent();
    case 'undo':
      return applyUndo();
    case 'hold':
      return useHold();
  }
  return false;
}

function swapCurrent() {
  const options = [];
  for (let t = 1; t <= TYPES; t++) if (t !== current.type) options.push(t);
  // Barajado Fisher-Yates para no favorecer siempre al mismo tipo.
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  for (const type of options) {
    const piece = makePiece(type);
    for (const y of [current.y, current.y - 1, current.y - 2, 0]) {
      if (y >= 0 && !collide(piece.shape, piece.x, y)) {
        current = { ...piece, y };
        return true;
      }
    }
  }
  return false;
}

function takeSnapshot() {
  snapshot = {
    board: board.map(row => [...row]),
    piece: clonePiece(current),
    queue: queue.map(clonePiece),
    hold: hold ? clonePiece(hold) : null,
    score, lines, level, dropInterval,
  };
}

function applyUndo() {
  if (!snapshot) return false;
  board = snapshot.board.map(row => [...row]);
  current = clonePiece(snapshot.piece);
  queue = snapshot.queue.map(clonePiece);
  hold = snapshot.hold ? clonePiece(snapshot.hold) : null;
  score = snapshot.score;
  lines = snapshot.lines;
  level = snapshot.level;
  dropInterval = snapshot.dropInterval;
  dropAccum = 0;
  drawPreview();
  drawHold();
  updateHUD();
  return true;
}

function useHold() {
  const stored = hold;
  // Se guarda sin rotación, como una pieza recién generada.
  hold = makePiece(current.type);
  if (stored) {
    const piece = makePiece(stored.type);
    current = piece;
    if (collide(current.shape, current.x, current.y)) endGame();
  } else {
    spawn();
  }
  drawHold();
  drawPreview();
  return true;
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
  updateEnergyUI();
}

function togglePause() {
  if (gameOver || choosing) return;
  paused = !paused;
  if (!paused) {
    overlay.classList.add('hidden');
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
  updateEnergyUI();
}

function loop(ts) {
  const dt = Math.min(ts - lastTime, 250);
  lastTime = ts;
  tickEffects(dt);
  dropAccum += dt;
  const interval = slowLeft > 0 ? dropInterval * SLOW_FACTOR : dropInterval;
  if (dropAccum >= interval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  energy = 0;
  choosing = false;
  slowLeft = 0;
  visionLeft = 0;
  snapshot = null;
  hold = null;
  effectsHTML = null;
  queue = Array.from({ length: QUEUE_SIZE }, randomPiece);
  spawn();
  updateHUD();
  updateEnergyUI();
  updateEffectsUI();
  drawHold();
  overlay.classList.add('hidden');
  abilityOverlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (choosing) {
    if (e.code === 'Escape') { closeAbilityMenu(); return; }
    const slot = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].indexOf(e.code);
    if (slot >= 0 && slot < ABILITIES.length) chooseAbility(ABILITIES[slot].id);
    return;
  }
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  if (e.code === 'KeyE') { openAbilityMenu(); return; }
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);
abilityBtn.addEventListener('click', openAbilityMenu);
abilityOverlay.addEventListener('click', e => {
  if (e.target === abilityOverlay) closeAbilityMenu();
});

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeToggle.checked = theme === 'light';
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  applyTheme(saved === 'light' ? 'light' : 'dark');
}

themeToggle.addEventListener('change', () => {
  const theme = themeToggle.checked ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
});

function applySkin(skin) {
  currentSkin = SKIN_PALETTES[skin] ? skin : 'retro';
  localStorage.setItem(SKIN_KEY, currentSkin);
  document.documentElement.setAttribute('data-skin', currentSkin);
  skinSelect.value = currentSkin;
  draw();
  drawPreview();
  drawHold();
}

function initSkin() {
  const saved = localStorage.getItem(SKIN_KEY);
  currentSkin = SKIN_PALETTES[saved] ? saved : 'retro';
  document.documentElement.setAttribute('data-skin', currentSkin);
  skinSelect.value = currentSkin;
}

skinSelect.addEventListener('change', () => {
  applySkin(skinSelect.value);
});

initTheme();
initSkin();
init();
