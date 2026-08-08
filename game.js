// ==========================================================
// Galaxy Runner - 2D Space Shooter (frontend game engine)
// ==========================================================

const API_BASE = 'http://localhost:4000/api';
const USERNAME = localStorage.getItem('gr_username') || (() => {
  const n = 'guest' + Math.floor(Math.random() * 100000);
  localStorage.setItem('gr_username', n);
  return n;
})();

const FALLBACK_LEVELS = [
  { id: 1, level_number: 1, name: 'Asteroid Belt', distance: 3000, alien_count: 5, obstacle_density: 0.20, reward_coins: 150 },
  { id: 2, level_number: 2, name: 'Alien Outpost', distance: 4000, alien_count: 8, obstacle_density: 0.30, reward_coins: 220 },
  { id: 3, level_number: 3, name: 'Meteor Storm', distance: 5000, alien_count: 10, obstacle_density: 0.40, reward_coins: 300 },
  { id: 4, level_number: 4, name: 'Deep Space Rift', distance: 6000, alien_count: 14, obstacle_density: 0.50, reward_coins: 400 },
  { id: 5, level_number: 5, name: 'Mothership Gate', distance: 8000, alien_count: 20, obstacle_density: 0.60, reward_coins: 600 },
];

// ---------- Local persistent profile (Rupees wallet + level progress) ----------
function loadLocalProfile() {
  const raw = localStorage.getItem('gr_profile');
  if (raw) return JSON.parse(raw);
  const fresh = { username: USERNAME, coins: 0, currentLevel: 1, bestScore: 0 };
  localStorage.setItem('gr_profile', JSON.stringify(fresh));
  return fresh;
}
function saveLocalProfile(p) { localStorage.setItem('gr_profile', JSON.stringify(p)); }

// ---------- API wrapper (falls back to localStorage if server is offline) ----------
const Api = {
  async getPlayer() {
    try {
      const r = await fetch(`${API_BASE}/player/${USERNAME}`);
      if (!r.ok) throw new Error('bad status');
      return await r.json();
    } catch (e) { return loadLocalProfile(); }
  },
  async getLevels() {
    try {
      const r = await fetch(`${API_BASE}/levels`);
      if (!r.ok) throw new Error();
      return await r.json();
    } catch (e) { return FALLBACK_LEVELS; }
  },
  async reportLevelResult(levelId, won, coinsCollected) {
    try {
      const r = await fetch(`${API_BASE}/player/${USERNAME}/level-result`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ levelId, won, coinsCollected })
      });
      return await r.json();
    } catch (e) {
      const p = loadLocalProfile();
      const level = FALLBACK_LEVELS.find(l => l.id === levelId);
      const total = coinsCollected + (won ? (level ? level.reward_coins : 0) : 0);
      p.coins += total;
      if (won && level && level.level_number >= p.currentLevel) p.currentLevel = level.level_number + 1;
      saveLocalProfile(p);
      return p;
    }
  },
  async reportScore(score, coinsCollected) {
    try {
      const r = await fetch(`${API_BASE}/player/${USERNAME}/score`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score })
      });
      return await r.json();
    } catch (e) {
      const p = loadLocalProfile();
      p.bestScore = Math.max(p.bestScore || 0, score);
      p.coins += coinsCollected || 0;
      saveLocalProfile(p);
      return p;
    }
  },
};

// ==========================================================
// CHARACTERS: Blue & Purple ships, each with its own Attack/Health/Speed
// upgrade track (0-10 per ability, paid for with Rupees). Maxing all three
// at once lets the ship "break through" to the next ship level (max 5).
// ==========================================================
const CHAR_IDS = ['blue', 'purple'];
const CHAR_META = {
  blue: { name: 'Blue Fighter', img: 'assets/ships/blue.png', glow: '#00c8ff' },
  purple: { name: 'Purple Fighter', img: 'assets/ships/purple.png', glow: '#a259ff' },
};
const ABILITIES = ['attack', 'health', 'speed'];

function loadCharacters() {
  const raw = localStorage.getItem('gr_characters');
  if (raw) return JSON.parse(raw);
  const fresh = {
    blue: { level: 1, attackLv: 0, healthLv: 0, speedLv: 0 },
    purple: { level: 1, attackLv: 0, healthLv: 0, speedLv: 0 },
  };
  localStorage.setItem('gr_characters', JSON.stringify(fresh));
  return fresh;
}
function saveCharacters() { localStorage.setItem('gr_characters', JSON.stringify(CHARACTERS)); }
let CHARACTERS = loadCharacters();
let equippedChar = localStorage.getItem('gr_equipped') || 'blue';
function setEquipped(id) { equippedChar = id; localStorage.setItem('gr_equipped', id); }

function upgradeCost(charId, ability) {
  const c = CHARACTERS[charId];
  const lv = c[ability + 'Lv'];
  return Math.round(40 * (lv + 1) * (1 + (c.level - 1) * 0.5));
}
function canBreakthrough(charId) {
  const c = CHARACTERS[charId];
  return c.attackLv >= 10 && c.healthLv >= 10 && c.speedLv >= 10 && c.level < 5;
}
function upgradeAbility(charId, ability) {
  const c = CHARACTERS[charId];
  if (c[ability + 'Lv'] >= 10) return false;
  const cost = upgradeCost(charId, ability);
  if (state.profile.coins < cost) return false;
  state.profile.coins -= cost;
  c[ability + 'Lv'] += 1;
  saveCharacters();
  persistRupees();
  return true;
}
function doBreakthrough(charId) {
  if (!canBreakthrough(charId)) return false;
  const c = CHARACTERS[charId];
  c.level = Math.min(5, c.level + 1);
  c.attackLv = 0; c.healthLv = 0; c.speedLv = 0;
  saveCharacters();
  return true;
}
function persistRupees() {
  const p = loadLocalProfile();
  p.coins = state.profile.coins;
  saveLocalProfile(p);
}
function shipStats(charId) {
  const c = CHARACTERS[charId];
  return {
    speed: 4 + c.speedLv * 0.35 + (c.level - 1) * 0.7,
    fireRate: Math.max(90, 380 - c.attackLv * 18 - (c.level - 1) * 25),
    maxHearts: Math.min(8, 3 + Math.floor(c.healthLv / 3) + (c.level - 1)),
    armor: c.level - 1,
    color: CHAR_META[charId].glow,
  };
}

// ==========================================================
// SOUND ENGINE (synthesized with Web Audio API - no audio files needed)
// ==========================================================
const Sound = {
  ctx: null,
  musicOn: localStorage.getItem('gr_music') !== '0',
  soundOn: localStorage.getItem('gr_sound') !== '0',
  volume: parseInt(localStorage.getItem('gr_volume') || '70', 10) / 100,
  musicTimer: null,

  ensureCtx() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') this.ctx.resume();
  },
  tone(freqStart, freqEnd, duration, type = 'square', vol = 0.15) {
    if (!this.soundOn) return;
    this.ensureCtx();
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + duration);
    gain.gain.setValueAtTime(vol * this.volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t0); osc.stop(t0 + duration);
  },
  shoot() { this.tone(880, 220, 0.1, 'square', 0.06); },
  explosion() {
    if (!this.soundOn) return;
    this.ensureCtx();
    const t0 = this.ctx.currentTime;
    const bufferSize = this.ctx.sampleRate * 0.3;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.25 * this.volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.3);
    noise.connect(gain).connect(this.ctx.destination);
    noise.start(t0);
  },
  coin() { this.tone(660, 1320, 0.12, 'sine', 0.12); },
  power(type) {
    const table = { doubleGun: [440, 880], speed: [300, 1200], magnet: [200, 500], shield: [220, 1760], heart: [520, 1040] };
    const [a, b] = table[type] || [220, 1760];
    this.tone(a, b, 0.35, 'sawtooth', 0.1);
  },
  hit() { this.tone(180, 60, 0.35, 'square', 0.18); },
  rockHit() { this.tone(300, 150, 0.08, 'square', 0.09); },
  click() { this.tone(440, 440, 0.05, 'square', 0.05); },
  upgrade() { this.tone(400, 1000, 0.2, 'triangle', 0.12); },
  breakthrough() { [400, 600, 900, 1300].forEach((f, i) => setTimeout(() => this.tone(f, f, 0.2, 'triangle', 0.14), i * 110)); },
  win() { if (this.soundOn) [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, f, 0.18, 'triangle', 0.12), i * 130)); },
  lose() { if (this.soundOn) [400, 320, 240, 160].forEach((f, i) => setTimeout(() => this.tone(f, f * 0.8, 0.25, 'sawtooth', 0.12), i * 150)); },

  startMusic() {
    if (this.musicTimer) return;
    this.ensureCtx();
    const notes = [220, 277, 330, 277, 220, 165, 220, 277, 330, 392, 330, 277, 220, 165, 196, 220];
    let i = 0;
    const playNext = () => {
      if (this.musicOn) {
        this.ensureCtx();
        const t0 = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(notes[i], t0);
        gain.gain.setValueAtTime(0.05 * this.volume, t0);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.24);
        osc.connect(gain).connect(this.ctx.destination);
        osc.start(t0); osc.stop(t0 + 0.25);
      }
      i = (i + 1) % notes.length;
      this.musicTimer = setTimeout(playNext, 260);
    };
    playNext();
  },
  stopMusic() { if (this.musicTimer) { clearTimeout(this.musicTimer); this.musicTimer = null; } },
  setMusicOn(v) { this.musicOn = v; localStorage.setItem('gr_music', v ? '1' : '0'); },
  setSoundOn(v) { this.soundOn = v; localStorage.setItem('gr_sound', v ? '1' : '0'); },
  setVolume(v) { this.volume = v; localStorage.setItem('gr_volume', Math.round(v * 100)); },
};

// ==========================================================
// IMAGE ASSETS (ships, aliens, asteroids, scrolling background)
// ==========================================================
const ASSET_PATHS = {
  bg: 'assets/bg-space.jpg',
  ships: { blue: CHAR_META.blue.img, purple: CHAR_META.purple.img },
  aliens: [
    'assets/aliens/saucer_small.png',
    'assets/aliens/saucer_medium.png',
    'assets/aliens/frigate.png',
    'assets/aliens/catn.png',
    'assets/aliens/cruiser.png',
  ],
  // Each obstacle type has its own base health (hits to destroy) and size multiplier.
  // The elongated "block" ruins take more hits and render larger; the crystal
  // spires/obelisks are the standard obstacle.
  rocks: [
    { src: 'assets/rocks/blue_block.png', health: 3, sizeMul: 1.35 },
    { src: 'assets/rocks/purple_block.png', health: 3, sizeMul: 1.35 },
    { src: 'assets/rocks/blue_obelisk.png', health: 2, sizeMul: 1.0 },
    { src: 'assets/rocks/purple_obelisk.png', health: 2, sizeMul: 1.0 },
    { src: 'assets/rocks/blue_mountain.png', health: 2, sizeMul: 1.0 },
    { src: 'assets/rocks/icy_mountain.png', health: 2, sizeMul: 1.0 },
  ],
};
const SHIP_ROTATION_DEG = 0; // the blue/purple ship art is already drawn pointing straight up
const ALIEN_ROTATION_DEG = 160;

const Images = { bg: null, ships: {}, aliens: [], rocks: [] };
function loadImage(src) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
async function preloadAssets() {
  Images.bg = await loadImage(ASSET_PATHS.bg);
  const shipEntries = await Promise.all(Object.entries(ASSET_PATHS.ships).map(async ([id, src]) => [id, await loadImage(src)]));
  shipEntries.forEach(([id, img]) => { Images.ships[id] = img; });
  Images.aliens = await Promise.all(ASSET_PATHS.aliens.map(loadImage));
  Images.rocks = await Promise.all(ASSET_PATHS.rocks.map(r => loadImage(r.src)));
}
function alienTierForLevel(levelNumber) {
  return Math.max(0, Math.min(ASSET_PATHS.aliens.length - 1, levelNumber - 1));
}
function alienTierForScore(score) {
  return Math.max(0, Math.min(ASSET_PATHS.aliens.length - 1, Math.floor(score / 400)));
}

// ==========================================================
// DOM REFERENCES
// ==========================================================
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
function resizeCanvas() {
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
}
window.addEventListener('resize', resizeCanvas);

const Screens = {
  home: document.getElementById('home-screen'),
  levelSelect: document.getElementById('level-select'),
  game: document.getElementById('game-ui'),
};
function showScreen(name) {
  Object.values(Screens).forEach(s => s.classList.add('hidden'));
  Screens[name].classList.remove('hidden');
}

const Overlays = {
  pause: document.getElementById('overlay-pause'),
  win: document.getElementById('overlay-win'),
  lose: document.getElementById('overlay-lose'),
  settings: document.getElementById('overlay-settings'),
  shop: document.getElementById('overlay-shop'),
  infinitySetup: document.getElementById('overlay-infinity-setup'),
};
function showOverlay(name) {
  Object.values(Overlays).forEach(o => o.classList.add('hidden'));
  if (name) Overlays[name].classList.remove('hidden');
}

const HUD = {
  hullBarP2: document.getElementById('hull-bar-p2'),
  hullFill: document.getElementById('hull-fill'),
  hullLabel: document.getElementById('hull-label'),
  hullFillP2: document.getElementById('hull-fill-p2'),
  hullLabelP2: document.getElementById('hull-label-p2'),
  shield: document.getElementById('shield-indicator'),
  coinCount: document.getElementById('coin-count'),
  pathFill: document.getElementById('path-fill'),
  pathShip: document.getElementById('path-ship-marker'),
  levelLabel: document.getElementById('level-label'),
  pathBar: document.getElementById('path-bar'),
  scoreBar: document.getElementById('score-bar'),
  scoreCurrent: document.getElementById('score-current'),
  scoreBest: document.getElementById('score-best'),
  activePowers: document.getElementById('active-powers'),
  dpadP2: document.getElementById('dpad-p2'),
};

// ==========================================================
// GAME STATE
// ==========================================================
const POWER_TYPES = {
  doubleGun: { icon: '🔫', duration: 8000 },
  speed:     { icon: '💨', duration: 7000 },
  magnet:    { icon: '🧲', duration: 9000 },
  shield:    { icon: '🛡️', duration: 6000 },
  heart:     { icon: '❤️', duration: 0 },
};
const DIFFICULTY_BASE = { easy: 0.7, normal: 1.0, hard: 1.4 };

const state = {
  profile: null, levels: [],
  mode: 'levels',            // 'levels' | 'infinity'
  difficulty: 'normal',
  playerCount: 1,
  selectedChars: ['blue'],
  currentLevel: null,
  running: false, paused: false,
  distance: 0, score: 0,
  coinsThisRun: 0,
  players: [],
  bullets: [], alienBullets: [],
  obstacles: [], aliens: [], coins: [], powerups: [],
  lastSpawn: 0, bgOffset: 0,
};

function isPowerActive(player, type) {
  return player.activePowers[type] && performance.now() < player.activePowers[type];
}

// ==========================================================
// INIT
// ==========================================================
async function init() {
  resizeCanvas();
  const [profile, levels] = await Promise.all([Api.getPlayer(), Api.getLevels()]);
  state.profile = normalizeProfile(profile);
  state.levels = levels;
  await preloadAssets();
  applySettingsToUI();
  showScreen('home');
}
function normalizeProfile(p) {
  return {
    coins: p.coins,
    currentLevel: p.currentLevel ?? p.current_level ?? 1,
    bestScore: p.bestScore ?? p.best_score ?? 0,
  };
}
function applySettingsToUI() {
  document.getElementById('toggle-music').checked = Sound.musicOn;
  document.getElementById('toggle-sound').checked = Sound.soundOn;
  document.getElementById('volume-slider').value = Math.round(Sound.volume * 100);
}

// ==========================================================
// LEVEL SELECT
// ==========================================================
function renderLevelSelect() {
  const list = document.getElementById('level-list');
  list.innerHTML = '';
  state.levels.forEach(level => {
    const locked = level.level_number > state.profile.currentLevel;
    const row = document.createElement('div');
    row.className = 'level-row' + (locked ? ' locked' : '');
    row.innerHTML = `<span>Level ${level.level_number}: ${level.name}</span>`;
    const btn = document.createElement('button');
    btn.textContent = locked ? '🔒' : '▶ PLAY';
    btn.disabled = locked;
    if (!locked) btn.onclick = () => startLevel(level.level_number);
    row.appendChild(btn);
    list.appendChild(row);
  });
}

// ==========================================================
// INFINITY SETUP WIZARD: Difficulty -> Players -> Ship -> Confirm
// ==========================================================
function startInfinityWizard() {
  state.difficulty = 'normal';
  state.playerCount = 1;
  state.selectedChars = ['blue'];
  showOverlay('infinitySetup');
  renderWizardDifficulty();
}
function wizCard(id, icon, label) {
  return `<div class="wizard-card" id="${id}"><div class="w-icon">${icon}</div><span>${label}</span></div>`;
}
function renderWizardDifficulty() {
  const el = document.getElementById('infinity-setup-content');
  el.innerHTML = `
    <div class="wizard-title">SELECT DIFFICULTY</div>
    <div class="wizard-options">
      ${wizCard('wiz-diff-easy', '😌', 'EASY')}
      ${wizCard('wiz-diff-normal', '⚔️', 'NORMAL')}
      ${wizCard('wiz-diff-hard', '💀', 'HARD')}
    </div>`;
  ['easy', 'normal', 'hard'].forEach(d => {
    document.getElementById('wiz-diff-' + d).onclick = () => { Sound.click(); state.difficulty = d; renderWizardPlayers(); };
  });
}
function renderWizardPlayers() {
  const el = document.getElementById('infinity-setup-content');
  el.innerHTML = `
    <div class="wizard-title">PLAYERS</div>
    <div class="wizard-options">
      ${wizCard('wiz-p1', '🧑\u200d🚀', '1 PLAYER')}
      ${wizCard('wiz-p2', '👥', '2 PLAYERS')}
    </div>
    <button class="wizard-back" id="wiz-back-1">◀ BACK</button>`;
  document.getElementById('wiz-p1').onclick = () => { Sound.click(); state.playerCount = 1; renderWizardShipSelect(); };
  document.getElementById('wiz-p2').onclick = () => { Sound.click(); state.playerCount = 2; state.selectedChars = ['blue', 'purple']; renderWizardConfirm(); };
  document.getElementById('wiz-back-1').onclick = () => { Sound.click(); renderWizardDifficulty(); };
}
function shipPickCard(id) {
  const c = CHARACTERS[id];
  return `<div class="wizard-card ship-card-pick" id="wiz-ship-${id}">
    <img src="${CHAR_META[id].img}" alt="${CHAR_META[id].name}" />
    <span>${CHAR_META[id].name}</span>
    <span style="opacity:.7">Lv ${c.level}</span>
  </div>`;
}
function renderWizardShipSelect() {
  const el = document.getElementById('infinity-setup-content');
  el.innerHTML = `
    <div class="wizard-title">CHOOSE YOUR SHIP</div>
    <div class="wizard-options">
      ${shipPickCard('blue')}
      ${shipPickCard('purple')}
    </div>
    <button class="wizard-back" id="wiz-back-2">◀ BACK</button>`;
  CHAR_IDS.forEach(id => {
    document.getElementById('wiz-ship-' + id).onclick = () => { Sound.click(); state.selectedChars = [id]; renderWizardConfirm(); };
  });
  document.getElementById('wiz-back-2').onclick = () => { Sound.click(); renderWizardPlayers(); };
}
function renderWizardConfirm() {
  const el = document.getElementById('infinity-setup-content');
  const names = state.selectedChars.map(id => CHAR_META[id].name).join(' & ');
  el.innerHTML = `
    <div class="wizard-title">READY?</div>
    <p class="wizard-summary">${state.difficulty.toUpperCase()} &nbsp;&middot;&nbsp; ${state.playerCount === 2 ? '2 Players' : '1 Player'} &nbsp;&middot;&nbsp; ${names}</p>
    <button id="wiz-start">▶ START</button>
    <button class="wizard-back" id="wiz-back-3">◀ BACK</button>`;
  document.getElementById('wiz-start').onclick = () => { Sound.click(); showOverlay(null); startInfinity(); };
  document.getElementById('wiz-back-3').onclick = () => {
    Sound.click();
    if (state.playerCount === 2) renderWizardPlayers(); else renderWizardShipSelect();
  };
}

// ==========================================================
// RUN LIFECYCLE (shared by Levels + Infinity)
// ==========================================================
function buildPlayers(chars) {
  const count = chars.length;
  const spacing = canvas.width / (count + 1);
  return chars.map((char, i) => {
    const stats = shipStats(char);
    return {
      char, index: i,
      x: spacing * (i + 1) - 17, y: canvas.height - 130,
      w: 48, h: 70,
      hearts: stats.maxHearts, maxHearts: stats.maxHearts, armor: stats.armor,
      alive: true, invincibleUntil: 0, lastShotAt: 0,
      activePowers: {},
      keys: { left: false, right: false, up: false, down: false },
    };
  });
}
function resetRunState() {
  state.distance = 0;
  state.score = 0;
  state.coinsThisRun = 0;
  state.obstacles = []; state.aliens = []; state.bullets = [];
  state.alienBullets = []; state.coins = []; state.powerups = [];
  state.lastSpawn = 0;
  state.paused = false;
  state.bgOffset = 0;

  resizeCanvas();
  state.players = buildPlayers(state.selectedChars);

  HUD.hullBarP2.classList.toggle('hidden', state.selectedChars.length < 2);
  HUD.dpadP2.classList.toggle('hidden', state.selectedChars.length < 2);

  renderHull(0);
  if (state.selectedChars.length > 1) renderHull(1);
  renderShieldIndicator();
  HUD.coinCount.textContent = state.profile.coins;
  renderActivePowerBadges();
}

function startLevel(levelNumber) {
  const level = state.levels.find(l => l.level_number === levelNumber) || state.levels[0];
  state.mode = 'levels';
  state.difficulty = 'normal';
  state.selectedChars = [equippedChar];
  state.currentLevel = level;
  resetRunState();

  HUD.pathBar.classList.remove('hidden');
  HUD.scoreBar.classList.add('hidden');
  HUD.levelLabel.textContent = `Level ${level.level_number}: ${level.name}`;

  showScreen('game');
  showOverlay(null);
  beginRunLoop();
}

function startInfinity() {
  state.mode = 'infinity';
  state.currentLevel = { obstacle_density: 0.2, alien_count: 4 };
  resetRunState();

  HUD.pathBar.classList.add('hidden');
  HUD.scoreBar.classList.remove('hidden');
  HUD.scoreCurrent.textContent = 'SCORE: 0';
  HUD.scoreBest.textContent = 'BEST: ' + (state.profile.bestScore || 0);

  showScreen('game');
  showOverlay(null);
  beginRunLoop();
}

function beginRunLoop() {
  state.running = true;
  state.lastFrame = performance.now();
  Sound.startMusic();
  requestAnimationFrame(loop);
}

function renderHull(idx) {
  const p = state.players[idx];
  if (!p) return;
  const pct = Math.max(0, Math.round((p.hearts / p.maxHearts) * 100));
  const fillEl = idx === 0 ? HUD.hullFill : HUD.hullFillP2;
  const labelEl = idx === 0 ? HUD.hullLabel : HUD.hullLabelP2;
  fillEl.style.width = pct + '%';
  labelEl.textContent = `P${idx + 1} ${pct}%`;
  let color = 'linear-gradient(90deg,#2ecc71,#27ae60)';
  if (pct <= 33) color = 'linear-gradient(90deg,#ff5252,#c62828)';
  else if (pct <= 66) color = 'linear-gradient(90deg,#ffca28,#ff9100)';
  fillEl.style.background = color;
}
function renderShieldIndicator() {
  const armors = state.players.filter(p => p.alive && p.armor > 0).map(p => `P${p.index + 1} 🛡️x${p.armor}`);
  HUD.shield.textContent = armors.join('  ');
}
function renderActivePowerBadges() {
  const now = performance.now();
  HUD.activePowers.innerHTML = '';
  state.players.forEach(p => {
    Object.entries(p.activePowers).forEach(([type, until]) => {
      const remaining = Math.max(0, Math.ceil((until - now) / 1000));
      if (remaining <= 0) return;
      const def = POWER_TYPES[type];
      const badge = document.createElement('div');
      badge.className = 'power-badge';
      const prefix = state.players.length > 1 ? `P${p.index + 1} ` : '';
      badge.innerHTML = `<span class="p-icon">${def.icon}</span><span class="p-time">${prefix}${remaining}s</span>`;
      HUD.activePowers.appendChild(badge);
    });
  });
}

// ==========================================================
// DIFFICULTY (Infinity mode scales with score + chosen difficulty)
// ==========================================================
function difficultyMultiplier() {
  if (state.mode !== 'infinity') return 1;
  const base = DIFFICULTY_BASE[state.difficulty] || 1;
  return base * (1 + Math.min(2.5, Math.floor(state.score / 250) * 0.18));
}

// ==========================================================
// SPAWNING
// ==========================================================
function maybeSpawn(dt, now) {
  const mult = difficultyMultiplier();
  const baseDensity = state.currentLevel.obstacle_density * mult;
  const spawnInterval = Math.max(160, (900 - baseDensity * 900) / mult);
  if (now - state.lastSpawn < spawnInterval) return;
  state.lastSpawn = now;

  const roll = Math.random();
  if (roll < 0.42) {
    const imgIndex = Math.floor(Math.random() * ASSET_PATHS.rocks.length);
    const rockType = ASSET_PATHS.rocks[imgIndex];
    const img = Images.rocks[imgIndex];
    const baseSize = (40 + Math.random() * 42) * rockType.sizeMul;
    const aspect = img ? img.height / img.width : 1;
    const w = baseSize, h = baseSize * aspect;
    state.obstacles.push({
      x: Math.random() * (canvas.width - w), y: -h,
      w, h,
      vy: (1.1 + Math.random() * 1.1 + baseDensity * 1.1) * mult, // slower fall than before
      imgIndex, hp: rockType.health, maxHp: rockType.health
    });
  } else if (roll < 0.68 && state.aliens.length < (state.currentLevel.alien_count || 6) * mult) {
    const baseTier = state.mode === 'levels'
      ? alienTierForLevel(state.currentLevel.level_number || 1)
      : alienTierForScore(state.score);
    const tier = Math.min(ASSET_PATHS.aliens.length - 1, baseTier + (Math.random() < 0.3 ? 1 : 0));
    state.aliens.push({
      x: Math.random() * (canvas.width - 36), y: -36,
      w: 38, h: 38, vy: (1.4 + Math.random() * 1.2) * mult,
      lastShot: now, shotInterval: Math.max(500, 1400 - baseDensity * 500), tier
    });
  } else if (roll < 0.85) {
    state.coins.push({ x: Math.random() * (canvas.width - 20), y: -20, w: 20, h: 20, vy: 2.5 * mult });
  } else {
    const types = Object.keys(POWER_TYPES);
    const type = types[Math.floor(Math.random() * types.length)];
    const size = 26;
    state.powerups.push({ x: Math.random() * (canvas.width - size), y: -size, w: size, h: size, vy: 2.3 * mult, type });
  }
}

// ==========================================================
// UPDATE
// ==========================================================
function update(dt, now) {
  const anyAlive = state.players.some(p => p.alive);
  if (!anyAlive) return loseRun();

  state.players.forEach(p => {
    if (!p.alive) return;
    const stats = shipStats(p.char);
    const speedBoost = isPowerActive(p, 'speed') ? 1.6 : 1;
    const speed = stats.speed * speedBoost * (dt / 16.67);

    if (p.keys.left) p.x -= speed;
    if (p.keys.right) p.x += speed;
    if (p.keys.up) p.y -= speed;
    if (p.keys.down) p.y += speed;
    p.x = Math.max(4, Math.min(canvas.width - p.w - 4, p.x));
    p.y = Math.max(4, Math.min(canvas.height - p.h - 4, p.y));

    if (now - p.lastShotAt > stats.fireRate) {
      p.lastShotAt = now;
      if (isPowerActive(p, 'doubleGun')) {
        state.bullets.push({ x: p.x + 4, y: p.y, w: 6, h: 14, vy: -9 });
        state.bullets.push({ x: p.x + p.w - 10, y: p.y, w: 6, h: 14, vy: -9 });
      } else {
        state.bullets.push({ x: p.x + p.w / 2 - 3, y: p.y, w: 6, h: 14, vy: -9 });
      }
      Sound.shoot();
    }
  });

  const leadShip = shipStats(state.players[0].char);
  if (state.mode === 'levels') {
    state.distance += (2.6 + leadShip.speed * 0.15) * (dt / 16.67);
  } else {
    state.score += (0.6 + leadShip.speed * 0.05) * (dt / 16.67) * difficultyMultiplier();
  }
  // Background scroll speed: a gentle, steady base pace that only very slightly
  // quickens as you progress (score in Infinity, distance in Levels) - intentionally
  // decoupled from the difficulty multiplier so it never ramps up sharply.
  const progressRef = state.mode === 'infinity' ? state.score : state.distance;
  const bgSpeedFactor = 1 + Math.min(0.5, progressRef / 6000);
  state.bgOffset += 1.3 * bgSpeedFactor * (dt / 16.67);

  maybeSpawn(dt, now);
  moveEntities(state.obstacles, dt);
  moveEntities(state.coins, dt);
  moveEntities(state.powerups, dt);
  moveEntities(state.bullets, dt, true);
  moveEntities(state.alienBullets, dt);

  state.players.forEach(p => {
    if (!p.alive || !isPowerActive(p, 'magnet')) return;
    const px = p.x + p.w / 2, py = p.y + p.h / 2;
    state.coins.forEach(c => {
      const dx = px - (c.x + c.w / 2), dy = py - (c.y + c.h / 2);
      const dist = Math.max(1, Math.hypot(dx, dy));
      if (dist < 260) { c.x += (dx / dist) * 6 * (dt / 16.67); c.y += (dy / dist) * 6 * (dt / 16.67); }
    });
  });

  state.aliens.forEach(a => {
    a.y += a.vy * (dt / 16.67);
    if (now - a.lastShot > a.shotInterval) {
      a.lastShot = now;
      state.alienBullets.push({ x: a.x + a.w / 2 - 2, y: a.y + a.h, w: 4, h: 12, vy: 5 });
    }
  });
  state.aliens = state.aliens.filter(a => a.y < canvas.height + 50);

  state.bullets.forEach(b => {
    state.aliens.forEach(a => { if (!b.dead && !a.dead && rectsOverlap(b, a)) { b.dead = true; a.dead = true; addScoreOrCoins(5); Sound.explosion(); } });
    state.obstacles.forEach(o => {
      if (!b.dead && !o.dead && rectsOverlap(b, o)) {
        b.dead = true;
        o.hp -= 1;
        if (o.hp <= 0) { o.dead = true; addScoreOrCoins(3); Sound.explosion(); }
        else Sound.rockHit();
      }
    });
  });
  state.bullets = state.bullets.filter(b => !b.dead);
  state.aliens = state.aliens.filter(a => !a.dead);
  state.obstacles = state.obstacles.filter(o => !o.dead);

  state.coins.forEach(c => {
    if (c.dead) return;
    const hitBy = state.players.find(p => p.alive && rectsOverlap(p, c));
    if (hitBy) { c.dead = true; state.coinsThisRun += 10; Sound.coin(); }
  });
  state.coins = state.coins.filter(c => !c.dead);

  state.powerups.forEach(pw => {
    if (pw.dead) return;
    const hitBy = state.players.find(p => p.alive && rectsOverlap(p, pw));
    if (hitBy) { pw.dead = true; catchPower(hitBy, pw.type, now); }
  });
  state.powerups = state.powerups.filter(pw => !pw.dead);

  state.players.forEach(p => {
    if (!p.alive) return;
    const invincible = isPowerActive(p, 'shield') || now < p.invincibleUntil;
    if (!invincible) {
      const hit = [...state.obstacles, ...state.aliens, ...state.alienBullets].some(e => rectsOverlap(p, e));
      if (hit) onPlayerHit(p, now);
    }
  });
  state.alienBullets = state.alienBullets.filter(b => b.y < canvas.height + 30);

  if (state.mode === 'levels') {
    const pct = Math.min(100, (state.distance / state.currentLevel.distance) * 100);
    HUD.pathFill.style.width = pct + '%';
    HUD.pathShip.style.left = pct + '%';
    HUD.coinCount.textContent = state.profile.coins + state.coinsThisRun;
    if (pct >= 100) return winLevel();
  } else {
    HUD.scoreCurrent.textContent = 'SCORE: ' + Math.floor(state.score);
    HUD.coinCount.textContent = state.profile.coins + state.coinsThisRun;
  }
  renderActivePowerBadges();
  renderShieldIndicator();

  if (state.players.every(p => !p.alive)) return loseRun();
}

function addScoreOrCoins(coinValue) {
  state.coinsThisRun += coinValue;
  if (state.mode === 'infinity') state.score += coinValue * 2;
}
function moveEntities(list, dt, isBullet) {
  list.forEach(e => { e.y += (e.vy || 0) * (dt / 16.67); });
  const filtered = list.filter(e => isBullet ? e.y > -30 : e.y < canvas.height + 40);
  list.length = 0; list.push(...filtered);
}
function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
function catchPower(player, type, now) {
  if (type === 'heart') {
    player.hearts = Math.min(player.maxHearts, player.hearts + 1);
    renderHull(player.index);
  } else {
    player.activePowers[type] = now + POWER_TYPES[type].duration;
  }
  Sound.power(type);
  renderActivePowerBadges();
}
function onPlayerHit(player, now) {
  if (player.armor > 0) { player.armor -= 1; renderShieldIndicator(); }
  else {
    player.hearts -= 1;
    renderHull(player.index);
    if (player.hearts <= 0) player.alive = false;
  }
  player.invincibleUntil = now + 1100;
  canvas.classList.add('shake');
  setTimeout(() => canvas.classList.remove('shake'), 200);
  Sound.hit();
}

// ==========================================================
// DRAW  (high-angle look via constant vertical squash + depth scale.
// IMPORTANT: screen X always equals world X - no position-dependent
// horizontal shifting. An earlier version compressed X toward center
// based on each object's current height on screen, which meant anything
// falling straight down (rocks, beams) visually drifted sideways every
// frame purely because its Y changed - that was a bug, not an effect.
// Now only two things vary with depth: overall SCALE (smaller = farther)
// and nothing else horizontal ever moves an object that isn't actually
// moving. The vertical SQUASH is a constant, position-independent factor
// applied to every sprite's height, which is what actually reads as
// "viewed from a high angle" without any risk of drift.
// ==========================================================
const SPRITE_SQUASH = 0.8; // constant flatten factor (not dependent on position - no drift)
function horizonT(y) { return Math.max(0, Math.min(1, y / canvas.height)); }
function perspScale(t) { return 0.55 + 0.45 * t; } // far (top) smaller -> near (player row) = 1.0
function project(obj) {
  const cx = obj.x + obj.w / 2, cy = obj.y + obj.h / 2;
  const t = horizonT(cy);
  const scale = perspScale(t);
  const w = obj.w * scale, h = obj.h * scale;
  return { cx, cy, w, h, scale };
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawScrollingBackground();
  drawHorizonFog();

  state.coins.forEach(c => {
    const pr = project(c);
    ctx.font = `${Math.round(18 * pr.scale)}px sans-serif`;
    ctx.fillText('🪙', pr.cx - 9 * pr.scale, pr.cy + 7 * pr.scale);
  });

  state.powerups.forEach(p => {
    const pr = project(p);
    ctx.font = `${Math.round(24 * pr.scale)}px sans-serif`;
    ctx.fillText(POWER_TYPES[p.type].icon, pr.cx - 12 * pr.scale, pr.cy + 9 * pr.scale);
  });

  state.obstacles.forEach(o => drawRock(o));
  state.aliens.forEach(a => drawAlien(a));

  state.bullets.forEach(b => drawProjectedRect(b, '#00e5ff'));
  state.alienBullets.forEach(b => drawProjectedRect(b, '#ff1744'));

  state.players.forEach(p => { if (p.alive) drawShip(p); });
}

function drawProjectedRect(obj, color) {
  // Bullets travel in a perfectly straight line (no squash/no x-shift) so beams never look tilted.
  const pr = project(obj);
  ctx.fillStyle = color;
  ctx.fillRect(pr.cx - pr.w / 2, pr.cy - pr.h / 2, pr.w, pr.h);
}

function drawHorizonFog() {
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height * 0.35);
  grad.addColorStop(0, 'rgba(5,8,25,0.55)');
  grad.addColorStop(1, 'rgba(5,8,25,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height * 0.35);
}

function drawScrollingBackground() {
  if (!Images.bg) return;
  const scale = canvas.width / Images.bg.width;
  const tileH = Images.bg.height * scale;
  let y = state.bgOffset % tileH;
  for (let drawY = y - tileH; drawY < canvas.height; drawY += tileH) {
    ctx.drawImage(Images.bg, 0, drawY, canvas.width, tileH);
  }
}
function drawRock(o) {
  const img = Images.rocks[o.imgIndex];
  if (!img) return;
  const pr = project(o);
  const h = pr.w * (img.height / img.width) * SPRITE_SQUASH;
  const damaged = o.hp < o.maxHp;
  if (damaged) { ctx.save(); ctx.globalAlpha = 0.55 + 0.45 * (o.hp / o.maxHp); }
  ctx.drawImage(img, pr.cx - pr.w / 2, pr.cy - h / 2, pr.w, h);
  if (damaged) ctx.restore();
}
function drawAlien(a) {
  const img = Images.aliens[a.tier];
  if (!img) return;
  const pr = project(a);
  const h = pr.h * SPRITE_SQUASH;
  ctx.save();
  ctx.translate(pr.cx, pr.cy);
  ctx.rotate((ALIEN_ROTATION_DEG * Math.PI) / 180);
  ctx.drawImage(img, -pr.w / 2, -h / 2, pr.w, h);
  ctx.restore();
}
function drawShip(p) {
  const now = performance.now();
  const invincible = isPowerActive(p, 'shield') || now < p.invincibleUntil;
  const img = Images.ships[p.char];
  const pr = project(p);

  ctx.save();
  ctx.translate(pr.cx, pr.cy);
  if (invincible) { ctx.shadowColor = isPowerActive(p, 'shield') ? '#ffd600' : CHAR_META[p.char].glow; ctx.shadowBlur = 22; }
  if (img) {
    if (SHIP_ROTATION_DEG) ctx.rotate((SHIP_ROTATION_DEG * Math.PI) / 180);
    const dispW = p.w * pr.scale, dispH = dispW * (img.height / img.width) * SPRITE_SQUASH;
    ctx.drawImage(img, -dispW / 2, -dispH / 2, dispW, dispH);
  }
  ctx.restore();
}



// ==========================================================
// MAIN LOOP + PAUSE
// ==========================================================
function loop(now) {
  if (!state.running) return;
  if (state.paused) { state.lastFrame = now; requestAnimationFrame(loop); return; }
  const dt = Math.min(48, now - state.lastFrame);
  state.lastFrame = now;
  update(dt, now);
  if (!state.running) return;
  draw();
  requestAnimationFrame(loop);
}
function togglePause() {
  if (!state.running) return;
  state.paused = !state.paused;
  if (state.paused) { Sound.stopMusic(); showOverlay('pause'); }
  else { Sound.startMusic(); showOverlay(null); state.lastFrame = performance.now(); }
}

// ==========================================================
// WIN / LOSE
// ==========================================================
async function winLevel() {
  state.running = false;
  Sound.stopMusic(); Sound.win();
  const totalCoins = state.coinsThisRun + state.currentLevel.reward_coins;
  document.getElementById('win-summary').textContent =
    `Level ${state.currentLevel.level_number} cleared! +${totalCoins} Rupees earned.`;
  const updated = await Api.reportLevelResult(state.currentLevel.id, true, state.coinsThisRun);
  state.profile = normalizeProfile(updated);
  HUD.coinCount.textContent = state.profile.coins;
  showOverlay('win');
}
async function loseRun() {
  if (!state.running) return;
  state.running = false;
  Sound.stopMusic(); Sound.lose();
  const loseTitle = document.getElementById('lose-title');
  const loseSummary = document.getElementById('lose-summary');

  if (state.mode === 'infinity') {
    loseTitle.textContent = '💥 GAME OVER';
    const updated = await Api.reportScore(Math.floor(state.score), state.coinsThisRun);
    state.profile = normalizeProfile(updated);
    const best = Math.max(state.profile.bestScore, Math.floor(state.score));
    state.profile.bestScore = best;
    loseSummary.textContent = `Score: ${Math.floor(state.score)}   Best: ${best}   Rupees: ${state.coinsThisRun}`;
  } else {
    loseTitle.textContent = '💥 SHIP DESTROYED';
    const updated = await Api.reportLevelResult(state.currentLevel.id, false, state.coinsThisRun);
    state.profile = normalizeProfile(updated);
    loseSummary.textContent = `Your ship was destroyed on Level ${state.currentLevel.level_number}. Rupees collected: ${state.coinsThisRun}.`;
  }
  HUD.coinCount.textContent = state.profile.coins;
  showOverlay('lose');
}

// ==========================================================
// SHIPYARD (Blue/Purple upgrade cards, paid for with Rupees)
// ==========================================================
function abilityRow(charId, ability, label) {
  const c = CHARACTERS[charId];
  const lv = c[ability + 'Lv'];
  const cost = upgradeCost(charId, ability);
  const maxed = lv >= 10;
  return `
    <div class="ability-row">
      <span class="a-label">${label}</span>
      <div class="ability-bar"><div class="ability-bar-fill" style="width:${lv * 10}%"></div></div>
      <span>${lv}/10</span>
      <button data-char="${charId}" data-ability="${ability}" class="upgrade-btn" ${maxed ? 'disabled' : (state.profile.coins < cost ? 'disabled' : '')}>
        ${maxed ? 'MAX' : `💎${cost}`}
      </button>
    </div>`;
}
function renderShop() {
  document.getElementById('shipyard-rupees').textContent = state.profile.coins;
  const list = document.getElementById('shop-list');
  list.innerHTML = '';
  CHAR_IDS.forEach(charId => {
    const c = CHARACTERS[charId];
    const isEquipped = equippedChar === charId;
    const card = document.createElement('div');
    card.className = 'upgrade-card' + (isEquipped ? ' equipped' : '');
    card.innerHTML = `
      <img src="${CHAR_META[charId].img}" alt="${CHAR_META[charId].name}" />
      <div class="u-name" style="color:${CHAR_META[charId].glow}">${CHAR_META[charId].name}</div>
      <div class="u-level">Ship Level ${c.level} / 5</div>
      ${abilityRow(charId, 'attack', 'Attack')}
      ${abilityRow(charId, 'health', 'Health')}
      ${abilityRow(charId, 'speed', 'Speed')}
      ${canBreakthrough(charId) ? `<button class="breakthrough-btn" data-breakthrough="${charId}">⚡ BREAKTHROUGH to Lv ${c.level + 1}</button>` : ''}
      <button class="equip-btn" data-equip="${charId}" ${isEquipped ? 'disabled' : ''}>${isEquipped ? 'EQUIPPED' : 'EQUIP'}</button>
    `;
    list.appendChild(card);
  });

  list.querySelectorAll('.upgrade-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const ok = upgradeAbility(btn.dataset.char, btn.dataset.ability);
      if (ok) { Sound.upgrade(); renderShop(); }
    });
  });
  list.querySelectorAll('[data-breakthrough]').forEach(btn => {
    btn.addEventListener('click', () => {
      const ok = doBreakthrough(btn.dataset.breakthrough);
      if (ok) { Sound.breakthrough(); renderShop(); }
    });
  });
  list.querySelectorAll('[data-equip]').forEach(btn => {
    btn.addEventListener('click', () => { setEquipped(btn.dataset.equip); renderShop(); });
  });
}

// ==========================================================
// CONTROLS
// ==========================================================
function bindHold(el, onDown, onUp) {
  const down = e => { e.preventDefault(); onDown(); };
  const up = e => { e.preventDefault(); onUp(); };
  el.addEventListener('mousedown', down);
  el.addEventListener('touchstart', down, { passive: false });
  ['mouseup', 'mouseleave', 'touchend', 'touchcancel'].forEach(ev => el.addEventListener(ev, up));
}
function p1() { return state.players[0]; }
function p2() { return state.players[1]; }

bindHold(document.getElementById('btn-left'), () => p1() && (p1().keys.left = true), () => p1() && (p1().keys.left = false));
bindHold(document.getElementById('btn-right'), () => p1() && (p1().keys.right = true), () => p1() && (p1().keys.right = false));
bindHold(document.getElementById('btn-up'), () => p1() && (p1().keys.up = true), () => p1() && (p1().keys.up = false));
bindHold(document.getElementById('btn-down'), () => p1() && (p1().keys.down = true), () => p1() && (p1().keys.down = false));

bindHold(document.getElementById('btn-left-p2'), () => p2() && (p2().keys.left = true), () => p2() && (p2().keys.left = false));
bindHold(document.getElementById('btn-right-p2'), () => p2() && (p2().keys.right = true), () => p2() && (p2().keys.right = false));
bindHold(document.getElementById('btn-up-p2'), () => p2() && (p2().keys.up = true), () => p2() && (p2().keys.up = false));
bindHold(document.getElementById('btn-down-p2'), () => p2() && (p2().keys.down = true), () => p2() && (p2().keys.down = false));

// Player 1 = Arrow keys, Player 2 = WASD. Space always pauses/resumes.
window.addEventListener('keydown', e => {
  if (e.code === 'Space') { e.preventDefault(); togglePause(); return; }
  if (p1()) {
    if (e.key === 'ArrowLeft') p1().keys.left = true;
    if (e.key === 'ArrowRight') p1().keys.right = true;
    if (e.key === 'ArrowUp') p1().keys.up = true;
    if (e.key === 'ArrowDown') p1().keys.down = true;
  }
  if (p2()) {
    if (e.key === 'a' || e.key === 'A') p2().keys.left = true;
    if (e.key === 'd' || e.key === 'D') p2().keys.right = true;
    if (e.key === 'w' || e.key === 'W') p2().keys.up = true;
    if (e.key === 's' || e.key === 'S') p2().keys.down = true;
  }
});
window.addEventListener('keyup', e => {
  if (p1()) {
    if (e.key === 'ArrowLeft') p1().keys.left = false;
    if (e.key === 'ArrowRight') p1().keys.right = false;
    if (e.key === 'ArrowUp') p1().keys.up = false;
    if (e.key === 'ArrowDown') p1().keys.down = false;
  }
  if (p2()) {
    if (e.key === 'a' || e.key === 'A') p2().keys.left = false;
    if (e.key === 'd' || e.key === 'D') p2().keys.right = false;
    if (e.key === 'w' || e.key === 'W') p2().keys.up = false;
    if (e.key === 's' || e.key === 'S') p2().keys.down = false;
  }
});

window.addEventListener('pointerdown', () => Sound.ensureCtx(), { once: true });
document.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => Sound.click()));

// ---------- Home screen ----------
document.getElementById('mode-levels').addEventListener('click', () => { renderLevelSelect(); showScreen('levelSelect'); });
document.getElementById('mode-infinity').addEventListener('click', () => startInfinityWizard());
document.getElementById('btn-level-select-back').addEventListener('click', () => showScreen('home'));
document.getElementById('btn-settings-home').addEventListener('click', () => showOverlay('settings'));
document.getElementById('btn-shop-home').addEventListener('click', () => { renderShop(); showOverlay('shop'); });

// ---------- In-game ----------
document.getElementById('btn-pause-ingame').addEventListener('click', togglePause);

// ---------- Pause overlay ----------
document.getElementById('btn-pause-resume').addEventListener('click', togglePause);
document.getElementById('btn-pause-home').addEventListener('click', () => { state.running = false; Sound.stopMusic(); showOverlay(null); showScreen('home'); });
document.getElementById('btn-pause-restart').addEventListener('click', () => {
  showOverlay(null);
  if (state.mode === 'levels') startLevel(state.currentLevel.level_number); else startInfinity();
});

// ---------- Win / lose ----------
document.getElementById('btn-next-level').addEventListener('click', () => startLevel((state.currentLevel.level_number || 0) + 1));
document.getElementById('btn-win-shop').addEventListener('click', () => { renderShop(); showOverlay('shop'); });
document.getElementById('btn-win-home').addEventListener('click', () => { showOverlay(null); showScreen('home'); });
document.getElementById('btn-retry').addEventListener('click', () => { if (state.mode === 'levels') startLevel(state.currentLevel.level_number); else startInfinity(); });
document.getElementById('btn-lose-home').addEventListener('click', () => { showOverlay(null); showScreen('home'); });

// ---------- Settings ----------
document.getElementById('toggle-music').addEventListener('change', e => Sound.setMusicOn(e.target.checked));
document.getElementById('toggle-sound').addEventListener('change', e => Sound.setSoundOn(e.target.checked));
document.getElementById('volume-slider').addEventListener('input', e => Sound.setVolume(e.target.value / 100));
document.getElementById('btn-close-settings').addEventListener('click', () => showOverlay(null));

// ---------- Shipyard ----------
document.getElementById('btn-close-shop').addEventListener('click', () => showOverlay(null));

// ---------- Boot ----------
init();
