import * as THREE from 'three';
import './style.css';
import { createCamera } from './components/Camera.js';
import { createRenderer } from './components/Renderer.js';
import { FROG_SCALE, Player } from './components/Player.js';
import { ELITE_MODS, Enemy, loadEnemyModel, setEnemyGraphics } from './components/Enemy.js';
import { Projectile, PROJECTILE_HEIGHT } from './components/Projectile.js';
import { Input } from './components/Input.js';
import { Hud } from './components/Hud.js';
import { createMap, isInsideMap, MAP_HALF_SIZE, MAP_TILES, setMapTiles, SOLO_TILES, TILE_SIZE } from './components/Map.js';
import { loadHouse } from './components/House.js';
import { createEnvironment, HOME, PATH, TEA_TABLE } from './components/Environment.js';
import { circlesOverlap, circleIntersectsRect } from './components/collision.js';
import { BLENDS, CURSES, LIFESTEAL_COOLDOWN, brewById, describe, rollBrews } from './components/PowerUps.js';
import { buildSpawnQueue, FINAL_WAVE, HELL_WAVE, MODIFIERS, rollModifiers, waveConfig } from './components/Waves.js';
import { Particles } from './components/Particles.js';
import { babble, hush, muffleMusic, play, setSound, soundSettings, unlockAudio } from './components/Sound.js';
import { music } from './components/Music.js';
import { PostFX } from './components/PostFX.js';
import { Effects } from './components/Effects.js';
import { additive, disposeTree, startUltimate, ULTIMATES } from './components/Ultimates.js';
import { Ascension, STAGE_COLORS, TIERS } from './components/Ascension.js';
import { rollWeather, timeOfDay, Weather } from './components/Weather.js';
import { boss as bossMemory, buy, leavesForRun, meta, pantryLevel, rememberRun, runLine, saveMeta, setPersist } from './components/Meta.js';
import { SKILLS, SkillBook } from './components/Skills.js';
import { Divinity } from './components/Divinity.js';
import { unlock } from './components/Achievements.js';
import { fetchScores, playerName, savePlayerName, submitScore } from './components/Leaderboard.js';
import { isDaily, seeded, startDaily, stopDaily, todayKey } from './components/Random.js';
import { Net } from './components/Net.js';
import { RemoteTode } from './components/RemoteTode.js';
import { TouchControls } from './components/TouchControls.js';
import { isFullscreen, needsHomeScreen, onFullscreenChange, toggleFullscreen } from './components/Fullscreen.js';
import { drawShareCard, shareText } from './components/ShareCard.js';
import { cloud, initCloud, loadCode, reportBuy, reportRun } from './components/CloudSave.js';
import { Bullets } from './components/Bullets.js';
import { Leaves, leavesForLevel } from './components/Leaves.js';
import { ARENAS, arenaForWave } from './components/Arenas.js';
import { applyRenderer } from './components/Graphics.js';
import { cycleVow, clearVows, runVows, steepBonus, steepLevel } from './components/Steeping.js';
import { viewHeight, viewWidth } from './components/Viewport.js';
import { chooseKeepsake, currentKeepsake, keepsakeFor } from './components/Keepsakes.js';
import { chooseClass, chosenClass, classById, classOfTheDay } from './components/Classes.js';
import { buildFrog } from './components/FrogModels.js';
import { chance, charmById, CharmDrops, CHARM_RARITIES, rollCharm } from './components/Charms.js';
import { CHANCE_TRIES, createShrine, disposeShrine, SHRINE_HOLD, SHRINE_RADIUS, SHRINES, updateShrine } from './components/Shrines.js';
import { BOSS_VOICES, bossTaunt } from './components/Spirits.js';

// Teammates load the same models; let the loaders reuse the downloaded files.
THREE.Cache.enabled = true;

// Enemies
const MAX_ALIVE_ENEMIES = 30;
const ENEMY_CONTACT_REACH = 4; // extra reach beyond touching, so stopped enemies can still bite
const ENEMY_CONTACT_KNOCKBACK = 300;
const STINGER = { radius: 4, color: 0xb05cff, emissive: 0x5a1a8a, stretch: 1.8, range: 520, damage: 1 };
const WIND_PUSH = 0.6; // how much of the gale's wind pushes bees around

// Queen Buzzbelle and the Empress
const QUEEN = {
  attackDelay: 3.2, // seconds between attacks (shorter when enraged)
  enragedDelayScale: 0.65,
  chargeWindup: 0.8,
  chargeSpeed: 480,
  chargeDuration: 0.75,
  chargeRecover: 0.7,
  chargeDamage: 2,
  novaCount: 14,
  enragedNovaCount: 20,
  novaSpeed: 200,
  summonCount: 3,
  maxMinions: 8,
};

// Combat feel
const SPIT_KNOCKBACK = 90;
const DASH_KNOCKBACK = 260;
const AIM_ASSIST_ANGLE = THREE.MathUtils.degToRad(14); // spit snaps to an enemy this close to the cursor direction
const LANDING_SPLASH_RADIUS = 70;
const SPLASH_EFFECT_DURATION = 0.45; // seconds
const SPLASH_COLOR = 0xd9a441; // hot tea
const TEA_DROPS = ['#c98a2b', '#e7b45a', '#f3d29a'];
const SPIT_DROPS = ['#9be33a', '#c8f77a'];
const BEE_FLUFF = ['#ffd23f', '#2b2b2b', '#ffe98a'];
const DUST = ['#d9c9a0', '#c4b48a'];
const FIRE = ['#ff6a00', '#ffb020', '#ffe066'];
const ICE = ['#c8f0ff', '#8fdcff', '#ffffff'];
const PETALS = ['#ff9ec7', '#ffd1e3', '#ffffff'];
const HIT_SHAKE = 9;
const SPLASH_SHAKE = 5;
const BOSS_DEATH_SHAKE = 18;
const SHAKE_DECAY = 12;
const RESTART_DELAY = 0.8; // seconds before Game Over accepts a restart

// Finishers and combos
const COMBO_WINDOW = 2.2; // seconds between kills to keep a combo going
const COMBO_BONUS = 0.02; // extra score per combo step (capped at 50)
const STREAKS = new Map([
  [5, 'Steeped!'],
  [10, 'Brewtal!'],
  [15, 'Tea-rrific!'],
  [25, 'Unbrewlievable!'],
  [40, 'Tea-pocalypse!'],
  [60, 'Divine Brew!'],
  [100, 'Godlike!'],
]);
const HIT_STOP_DAMAGE = 12; // hits this strong freeze the action for a moment

// Bosses
const BOSS_INTRO_TIME = 2.6;
const BOSS_ROARS_AT = 0.3; // seconds into its entrance
const BOSS_SPEAKS_AT = 0.9; // after the roar, so the roar doesn't drown its taunt
const BOSS_EPITHETS = {
  queen: 'Matriarch of the Hive',
  shogun: 'Blade of the Mountain Hive',
  seraph: 'Light Above the Clouds',
  empress: 'Sovereign of a Thousand Stings',
  beezebub: 'Lord of the Hive Below',
};
// Health fractions where a boss roars and gets new attacks. The Queen is the first wall, so she has one.
const BOSS_PHASES = { queen: [0.5], shogun: [0.5], seraph: [0.6, 0.3], empress: [0.66, 0.33], beezebub: [0.66, 0.33] };
// Bee-zebub's Brimstone Ring: a wall of fire that spreads from him; hop-dash through it.
const BRIMSTONE = { speed: 190, band: 11, height: 34, windup: 1 };

// Elite bees
const ELITE_FROM_WAVE = 6;

// Co-op: per extra frog, waves get COOP_BEES more bees that are COOP_HP tougher, and bosses COOP_BOSS_HP more health.
// Every player collects their own copy of the leaves and charms, so those are shared out over the bigger swarm:
// each frog levels at about the solo pace. The first waves are thin for a team, so they get COOP_EARLY more bees per
// extra frog on top (all of it at wave 1, fading out by wave COOP_EARLY_UNTIL).
const COOP_BEES = 0.6;
const COOP_EARLY = 1;
const COOP_EARLY_UNTIL = 7;
const COOP_HP = 0.3;
const COOP_BOSS_HP = 0.8;
const coopEarly = () => COOP_EARLY * THREE.MathUtils.clamp((COOP_EARLY_UNTIL - wave) / (COOP_EARLY_UNTIL - 1), 0, 1);
const coopShare = () => (coop ? 1 + (COOP_BEES + coopEarly()) * (coop.size - 1) : 1);

// Divinity makes Tode's spit stronger and more radiant: [color, glow] per ascension tier.
const TIER_DAMAGE_BONUS = 0.06; // +6% damage per tier
const SPIT_LOOKS = [
  [0x9be33a, 0x3f7a0c],
  [0xb8e34a, 0x6a8a10],
  [0xffd23f, 0xb07a00],
  [0xfff0a0, 0xffb000],
  [0xffffff, 0xff9ee8],
  [0xffffff, 0x9fb8ff],
];
const SPIT_TRAILS = [null, null, ['#ffe680', '#ffc93c'], ['#fff3c4', '#ffd36b', '#9fd8ff'], ['#ffffff', '#ffd6f5', '#c8b0ff'], ['#ffffff', '#c8d8ff', '#9ff4ff']];

// Brew mechanics
const SPLIT_ANGLE = 0.7; // radians between the pieces of a Geyser Spit
const ORBIT_RADIUS = 40;
const ORBIT_DAMAGE = 2;
const ORBIT_HIT_INTERVAL = 0.5; // per bee
const STORM_CLOUD_INTERVAL = 1; // seconds between storm-cloud strikes
const FREEZE_SHATTER_DELAY = 1; // seconds a dash-frozen bee stays frozen before it shatters
const STEAM_SPACING = 18; // distance between steam puffs of the Steam Engine

// Ultimate
const GAUGE_PER_DAMAGE = 0.28; // % per point of damage dealt
const GAUGE_PER_HIT = 6; // % for getting hit
const ULTIMATE_WAVE = 5; // the ultimate is chosen after beating the first boss

// Score
const SCORE_PER_SECOND = 0.1;
const WAVE_CLEAR_BONUS = 25; // × wave number

// Pacing
const WAVE_INTRO_TIME = 1.8; // seconds
const WAVE_CLEARED_TIME = 1.4;
const ASCEND_DURATION = 3.6;
const PLAYING = new Set(['intro', 'fighting', 'cleared', 'waiting']);

const CAMERA_OFFSET = new THREE.Vector3(300, -300, 300);
// WASD is camera-relative: "up" walks away from the camera.
const SCREEN_RIGHT = new THREE.Vector3(1, 1, 0).normalize();
const SCREEN_UP = new THREE.Vector3(-1, 1, 0).normalize();
const Z_AXIS = new THREE.Vector3(0, 0, 1);

/** Where bees come in: the four corners, plus the middle of each side in a co-op garden. */
function spawnPoints() {
  const edge = MAP_HALF_SIZE - TILE_SIZE * 1.5;
  const points = [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ];
  if (MAP_TILES > SOLO_TILES) points.push([0, 1], [0, -1], [1, 0], [-1, 0]);
  return points.map(([x, y]) => new THREE.Vector3(x * edge, y * edge, 0));
}

// --- Scene ---
const scene = new THREE.Scene();
scene.fog = new THREE.Fog('#a8dcf5', 900, 2000);

const ambient = new THREE.AmbientLight(0xffffff, 0.6);
const hemisphere = new THREE.HemisphereLight('#d8efff', '#4f7a32', 1.4);
const sun = new THREE.DirectionalLight('#fff3dc', 2.2);
sun.position.set(-100, -100, 200);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.6;
scene.add(ambient, hemisphere, sun);

// The world (lawn, garden, divine transformations) is rebuilt when the garden is resized for co-op.
let map = null;
let environment = null;
let divinity = null;

let worldTiles = SOLO_TILES; // the garden's size (bigger in co-op); later arenas grow from it

/** The sun's shadows cover the current field. */
function fitShadows() {
  const reach = MAP_HALF_SIZE + 75;
  Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 1, far: 1600 });
  sun.shadow.camera.updateProjectionMatrix();
}

function buildWorld(tiles) {
  disposeArenas();
  if (map) {
    for (const root of [map, environment.group, divinity.root]) {
      root.removeFromParent();
      root.traverse((child) => {
        if (child === houses[0]?.house || houses[0]?.house?.getObjectById(child.id)) return;
        child.geometry?.dispose();
      });
    }
  }
  worldTiles = tiles;
  setMapTiles(tiles);
  fitShadows();

  map = createMap({ path: PATH });
  scene.add(map);
  environment = createEnvironment();
  scene.add(environment.group);
  divinity = new Divinity({ scene, map, environment });
  if (houses[0]) map.add(houses[0].house);
}
let houses = []; // footprints of loaded houses: { rect }

// --- Arenas: a new playing field every 5 waves (see Arenas.js) ---
let arena = ARENAS[0];
const builtArenas = new Map(); // arena id → { group, obstacles, update }
const propCache = new Map(); // arena id → meshes tagged as props (they fade near Tode)

function disposeArenas() {
  for (const built of builtArenas.values()) {
    built.group.removeFromParent();
    built.group.traverse((child) => {
      child.geometry?.dispose();
      for (const material of [child.material].flat()) {
        if (!material) continue;
        for (const value of Object.values(material)) if (value?.isTexture && value !== scene.environment) value.dispose();
        material.dispose();
      }
    });
  }
  builtArenas.clear();
  propCache.clear();
}

/** What Tode and the bees bump into in the current arena. */
const arenaObstacles = () => (arena.id === 'garden' ? environment.obstacles : builtArenas.get(arena.id)?.obstacles ?? []);
const arenaWalls = () => (arena.id === 'garden' ? houses : []);

buildWorld(SOLO_TILES);

const player = new Player();
scene.add(player.group);

const camera = createCamera();
player.group.add(camera);

const renderer = createRenderer();
const postfx = new PostFX(renderer, scene, camera);
const input = new Input(renderer.domElement);
const touch = new TouchControls(input);
const hud = new Hud(camera);
const particles = new Particles();
scene.add(particles.mesh);

// --- Game state ---
const clock = new THREE.Clock();
const enemies = [];
const projectiles = [];
const bullets = new Bullets(scene); // enemy bullets (see Bullets.js)
const leaves = new Leaves(scene); // experience (see Leaves.js)
const splashEffects = [];
const telegraphs = [];
const brewLevels = new Map(); // brew id → level
const brewTexts = new Map(); // brew id → description of the latest pick
// loading → title → intro → fighting → cleared → choosing/ultimate → (ascending) → intro …
// plus paused, victory and gameover.
let phase = 'loading';
let phaseTimer = 0;
let pausedFrom = null;
let pausedPhaseTimer = 0;
let gameOverTime = 0;
let wave = 0;
let config = null;
let spawnQueue = [];
let spawnTimer = 0;
let offers = [];
let rerolls = 0;
let luck = 0;
let endless = false;
let autoPause = true;
const settings = { calmFx: false, ...JSON.parse(safeStorage('get', 'tode-settings') ?? '{}') };

let vows = {}; // this run's Steeping vows: { id: rank } (see Steeping.js)
let steep = 0; // their Steep level: more score and Golden Leaves
const vow = (id) => vows[id] ?? 0;
let keepsake = null; // what Tode carries this run (see Keepsakes.js)
let runClass = chosenClass(); // the frog playing this run (see Classes.js)
let leafBonus = 1; // Golden Leaves multiplier (the Golden Leaf keepsake)
let fullGaugeStart = false; // the Tiny Crown: the ultimate starts charged
let bonusPicks = 0; // extra Epic brew picks promised by a Bitter Shrine
let firstOffer = true; // at the run's first offer the spirits talk about earlier runs

let timeAlive = 0;
let kills = 0;
let bossKills = 0;
let points = 0; // from kills and wave bonuses
let score = 0;
let bestScore = Number(safeStorage('get', 'tode-best-score')) || 0;
let persistBest = true; // dev: game.persist = false
let killsSinceHoney = 0;
let lastLifesteal = -99; // play time of the last heart from Stolen Honey or Herbal Remedy
let spitShots = 0;
let spitHits = 0;
let regenTimer = 0;
let stormCloudTimer = 0;
let steamDistance = 0;
let spitCooldownLeft = 0;
let splashCooldownLeft = 0;
let ultimateEffect = null;
let shake = 0;
let cameraZoom = 1;
let zoomPunch = 0; // brief camera push-in for finishers
const cameraPan = new THREE.Vector3(); // camera offset toward a boss during its entrance
let slowMotionLeft = 0;
let slowMotionScale = 1;
let hitStopLeft = 0;
let lastHitStop = 0;
let combo = 0;
let comboTimer = 0;
let introBoss = null;
let hitThisWave = false;
// Achievement bookkeeping for this run.
const feats = { cleanWaves: 0, tileWave: 0, legendaries: 0, shrines: 0, bitterWave: 0, bossHurt: false };

// First-run tips: each one is shown once, ever.
const TIPS = {
  move: () =>
    touch.enabled
      ? 'Left stick moves, right stick aims. Tode spits all by himself!'
      : 'Move with WASD and hold the left mouse button to spit where you aim.',
  brew: () => 'Brews from two different Blends unlock Duo brews. Two from one Blend unlock a Legendary.',
  ultimate: () => (touch.enabled ? 'Your ultimate is charged: tap ✨!' : 'Your ultimate is charged: press E!'),
  skill: () => 'Skills and tea bombs cast themselves at the right moment.',
  tiles: () =>
    touch.enabled
      ? 'Red cursed tiles burn a heart, hex you and call an ambush. Walk around them, or tap 💨 to hop over.'
      : 'Red cursed tiles burn a heart, hex you and call an ambush. Walk around them, or hop-dash over them (Space).',
  dash: () =>
    touch.enabled
      ? 'Tap 💨 to hop-dash right through bees: it hurts them, not you.'
      : 'Space or right-click to hop-dash right through bees: it hurts them, not you.',
};

function tip(id) {
  meta.tips ??= [];
  if (meta.tips.includes(id) || coop) return;
  meta.tips.push(id);
  saveMeta();
  hud.showTip(TIPS[id]());
}

/** Unlocks an achievement and celebrates it the first time. */
function achieve(id) {
  const achievement = unlock(id);
  if (!achievement) return;
  hud.showAchievement(achievement, keepsakeFor(id));
  play('legendary');
}

// --- Co-op state ---
// The host simulates the bees and the waves; every player simulates their own Tode.
const net = new Net();
let coop = null; // { host: boolean, remotes: Map<id, RemoteTode>, ready: Set<id>, size }
let nextNetId = 1; // host: id for every bee, so guests can mirror them
const mirrors = new Map(); // guest: netId → mirrored Enemy
const isGuest = () => Boolean(coop && !coop.host);
/** Shares a message with every other player (no-op when playing alone). */
const share = (message) => coop && net.queue('all', message);
let ascendingTo = 0;

function safeStorage(op, key, value) {
  try {
    return op === 'get' ? localStorage.getItem(key) : localStorage.setItem(key, value);
  } catch {
    return null;
  }
}

function updateScore() {
  // In co-op the host keeps the team's score.
  score = isGuest() ? coopScore : (timeAlive * SCORE_PER_SECOND + points) * steepBonus(steep);
  hud.setScore(Math.floor(score), Math.max(bestScore, Math.floor(score)), timeAlive);
}

const aliveEnemies = () => enemies.filter((enemy) => !enemy.dying);

// Hooks for the effect, ultimate and weather modules.
const ctx = {
  scene,
  particles,
  player,
  postfx,
  play,
  aimGround: new THREE.Vector3(),
  shake: (amount) => (shake = Math.max(shake, amount)),
  aliveEnemies: () => targetable(), // skills, ultimates and effects never waste themselves on a shielded boss
  damageEnemy: (...args) => damageEnemy(...args),
  hurtPlayer: (amount) => hurtPlayer(amount),
  lightningHit,
  fireSpit: (origin, direction, damage) => fireSpit(origin, direction, damage),
  onSkillCast: (id, level, target) => share({ k: 'skill', id, lv: level, t: [target.x, target.y] }),
  isFree: (position, radius) => !isBlockedForPlayer(position, radius),
};
const effects = new Effects(ctx);
const weather = new Weather({
  scene,
  sun,
  hemisphere,
  ambient,
  onStrike: stormStrike,
  onThunder: () => play('thunder'),
});
const ascension = new Ascension(player, particles, effects);
const skills = new SkillBook(ctx);
Object.assign(ctx, { effects, weather });

// --- Collisions & movement ---
const next = new THREE.Vector3();

function distanceSqXY(a, b) {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

/**
 * Only walls (Tode's house) block anything. Trees, rocks, statues and ponds never do: bees fly over them, shots
 * fly over them and Tode walks through them (they fade so they never hide him). Nothing can get stuck.
 */
function hitsObstacle(position, radius) {
  return arenaWalls().some(({ rect }) => circleIntersectsRect(position, radius, rect));
}

/** Overlapping is only blocked when it gets worse, so stuck characters can always separate. */
function closingIn(from, to, radius, other, otherRadius) {
  return circlesOverlap(to, radius, other, otherRadius) && distanceSqXY(to, other) < distanceSqXY(from, other);
}

/** Moves one axis at a time, so characters slide along walls instead of sticking. */
function slide(position, dx, dy, isBlocked) {
  if (dx) {
    next.set(position.x + dx, position.y, 0);
    if (!isBlocked(next)) position.x = next.x;
  }
  if (dy) {
    next.set(position.x, position.y + dy, 0);
    if (!isBlocked(next)) position.y = next.y;
  }
}

function isBlockedForPlayer(position, radius = player.radius) {
  return !isInsideMap(position, radius) || hitsObstacle(position, radius);
}

const PLAYER_STEP = 6; // max distance per collision sub-step, so a fast dash can't skip through a wall

/** Pushes a circle out of walls and back inside the map (moving first and resolving after never sticks). */
function pushOut(position, radius) {
  for (const { rect } of arenaWalls()) {
    const closestX = THREE.MathUtils.clamp(position.x, rect.minX, rect.maxX);
    const closestY = THREE.MathUtils.clamp(position.y, rect.minY, rect.maxY);
    const dx = position.x - closestX;
    const dy = position.y - closestY;
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq >= radius * radius) continue;
    if (distanceSq > 1e-6) {
      const distance = Math.sqrt(distanceSq);
      position.x = closestX + (dx / distance) * radius;
      position.y = closestY + (dy / distance) * radius;
    } else {
      // The centre is inside the house: leave through the nearest wall.
      const exits = [
        [position.x - rect.minX, -1, 0],
        [rect.maxX - position.x, 1, 0],
        [position.y - rect.minY, 0, -1],
        [rect.maxY - position.y, 0, 1],
      ];
      const [depth, ex, ey] = exits.reduce((best, exit) => (exit[0] < best[0] ? exit : best));
      position.x += ex * (depth + radius);
      position.y += ey * (depth + radius);
    }
  }
  const limit = MAP_HALF_SIZE - radius;
  position.x = THREE.MathUtils.clamp(position.x, -limit, limit);
  position.y = THREE.MathUtils.clamp(position.y, -limit, limit);
}

function movePlayer(dx, dy) {
  const { position } = player;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / PLAYER_STEP));
  for (let i = 0; i < steps; i++) {
    position.x += dx / steps;
    position.y += dy / steps;
    pushOut(position, player.radius);
  }
}

// --- Zones: water to swim through, a rift that speeds Tode up, lava that burns -----------
const ZONE_SPEED = { water: 0.72, rift: 1.35, lava: 0.85 };
let zoneTimer = 0;
let lavaTimer = 0;

/** The zone Tode stands in (the centrepiece of each arena), or null. */
function zoneAt(position) {
  return arenaObstacles().find((o) => o.zone && distanceSqXY(position, o) < o.radius ** 2)?.zone ?? null;
}

function updateZone(delta) {
  const zone = player.isDashing ? null : zoneAt(player.position);
  player.speedFactor = (ZONE_SPEED[zone] ?? 1) * (hexLeft > 0 ? CURSED.hexSlow : 1);
  if (!zone) {
    lavaTimer = 0;
    return;
  }
  const moving = player.velocity.lengthSq() > 400;
  zoneTimer -= delta;
  if (zoneTimer <= 0) {
    zoneTimer = moving ? 0.22 : 0.6;
    const colors = { water: ['#d9f2ff', '#8fd3ff'], rift: ['#9ff4ff', '#ffffff', '#c8a8ff'], lava: FIRE }[zone];
    effects.ring(player.position, { radius: 26, color: colors[0], duration: 0.5 });
    particles.burst(player.position, { count: 5, colors, speed: 50, up: 60, size: 1.6, height: 1, glow: zone !== 'water' });
  }
  if (zone === 'lava') {
    lavaTimer += delta;
    if (lavaTimer >= 0.9) {
      lavaTimer = 0;
      if (hurtPlayer(1)) hud.showCallout('Hot! Hot! Hot!');
    }
  }
}

// --- Props fade when Tode is near or behind them, so they never hide him ------------------
const PROP_FADE = 0.28;
const TOWARD_CAMERA = new THREE.Vector3(1, -1, 0).normalize();

function arenaProps() {
  if (!propCache.has(arena.id)) {
    const root = arena.id === 'garden' ? environment.group : builtArenas.get(arena.id)?.group;
    const props = [];
    root?.traverse((child) => {
      if (!child.isMesh || child.isInstancedMesh || !child.userData.prop) return;
      child.geometry.computeBoundingSphere();
      child.userData.reach = child.geometry.boundingSphere.radius * child.scale.x;
      props.push(child);
    });
    propCache.set(arena.id, props);
  }
  return propCache.get(arena.id);
}

const toProp = new THREE.Vector3();
function updatePropFade(delta) {
  const ease = 1 - Math.exp(-10 * delta);
  for (const prop of arenaProps()) {
    if (!prop.visible) continue;
    toProp.subVectors(prop.position, player.position).setZ(0);
    const reach = prop.userData.reach;
    const along = toProp.dot(TOWARD_CAMERA);
    const across = Math.abs(toProp.x * TOWARD_CAMERA.y - toProp.y * TOWARD_CAMERA.x);
    const hiding = toProp.length() < reach * 0.7 + 20 || (along > 0 && along < reach * 2 && across < reach * 0.8 + 10);
    const target = hiding && PLAYING.has(phase) ? PROP_FADE : 1;
    const current = prop.userData.opacity ?? 1;
    if (target === 1 && current === 1) continue;
    const opacity = Math.abs(target - current) < 0.02 ? target : current + (target - current) * ease;
    prop.userData.opacity = opacity;
    if (opacity < 1 && !prop.userData.solidMaterial) {
      prop.userData.solidMaterial = prop.material;
      prop.material = prop.material.clone();
      prop.material.transparent = true;
      prop.material.depthWrite = false;
    }
    if (opacity >= 1 && prop.userData.solidMaterial) {
      prop.material.dispose();
      prop.material = prop.userData.solidMaterial;
      prop.userData.solidMaterial = null;
    } else if (prop.userData.solidMaterial) {
      prop.material.opacity = opacity;
    }
  }
}

/** Every Tode still standing: the local one and, in co-op, the teammates. */
function standingTodes() {
  const todes = player.downed || !player.group.visible ? [] : [player];
  if (coop) for (const remote of coop.remotes.values()) if (remote.alive && remote.seen) todes.push(remote);
  return todes;
}

/** Bees chase the nearest Tode. */
function targetFor(position, lured = true) {
  return targetTodeFor(position, lured).position;
}

/** The Tode nearest to `position` (the local one if nobody is standing), or a Ninja's decoy close by. */
function targetTodeFor(position, lured = true) {
  if (lured) for (const decoy of decoys) if (distanceSqXY(decoy.position, position) < DECOY.lure ** 2) return decoy;
  let best = player;
  let bestDistance = Infinity;
  for (const tode of standingTodes()) {
    const distance = distanceSqXY(tode.position, position);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = tode;
    }
  }
  return best;
}

function enemyBlocker(enemy) {
  const todes = standingTodes();
  return (position) =>
    !isInsideMap(position, enemy.radius) ||
    todes.some((tode) => closingIn(enemy.position, position, enemy.radius, tode.position, player.radius)) ||
    enemies.some(
      (other) =>
        other !== enemy && !other.dying && closingIn(enemy.position, position, enemy.radius, other.position, other.radius)
    );
}

// When the way ahead is blocked, bees try turning by these angles (radians) to get around it.
const STEER_ANGLES = [0, 0.5, -0.5, 1, -1, 1.5, -1.5];
const push = new THREE.Vector3();

/**
 * Moves an enemy with velocity (vx, vy), steering around obstacles and other bees.
 * Knockback and wind are applied separately, so they never get steered.
 */
function moveEnemy(enemy, vx, vy, delta) {
  const isBlocked = enemyBlocker(enemy);
  const { position } = enemy;
  push.copy(enemy.knockback).addScaledVector(weather.wind, WIND_PUSH);
  if (push.lengthSq() > 1) slide(position, push.x * delta, push.y * delta, isBlocked);

  const factor = enemy.speedFactor;
  if ((!vx && !vy) || factor <= 0.01) return;
  vx *= factor;
  vy *= factor;

  // Straight ahead first, then the side that worked last time, so bees don't jitter between sides.
  const side = enemy.steerSide ?? 1;
  for (const angle of STEER_ANGLES) {
    const turn = angle * side;
    const cos = Math.cos(turn);
    const sin = Math.sin(turn);
    next.set(position.x + (vx * cos - vy * sin) * delta, position.y + (vx * sin + vy * cos) * delta, 0);
    if (!isBlocked(next)) {
      position.copy(next);
      if (turn) enemy.steerSide = Math.sign(turn);
      return;
    }
  }
}

/** Unit direction from `from` to `to` in `out`; returns the distance. */
function directionTo(from, to, out) {
  out.subVectors(to, from).setZ(0);
  const distance = out.length();
  if (distance > 0.001) out.divideScalar(distance);
  return distance;
}

// --- Enemies ---
function freeCorner(radius) {
  const corners = spawnPoints().sort(() => Math.random() - 0.5);
  return corners.find(
    (corner) =>
      !enemies.some((other) => circlesOverlap(corner, radius, other.position, other.radius)) &&
      !circlesOverlap(corner, radius, player.position, player.radius + 60)
  );
}

function farthestCorner() {
  return spawnPoints().sort((a, b) => distanceSqXY(b, player.position) - distanceSqXY(a, player.position))[0];
}

function rollElite(kind) {
  if (ENEMY_TYPES_BOSS.has(kind) || kind === 'nest' || wave < (vow('elite') ? 3 : ELITE_FROM_WAVE)) return null;
  if (Math.random() > (0.04 + wave * 0.009) * (waveMods.has('elites') ? 3 : 1) * (vow('elite') ? 2 : 1)) return null;
  return randomEliteMod();
}

function randomEliteMod() {
  const mods = Object.keys(ELITE_MODS);
  return mods[Math.floor(Math.random() * mods.length)];
}
const ENEMY_TYPES_BOSS = new Set(['queen', 'shogun', 'seraph', 'empress', 'beezebub']);

function spawnEnemy(kind, at, { elite = rollElite(kind) } = {}) {
  const enemy = new Enemy(kind, { hpScale: config.hpScale, speedScale: config.speedScale, elite });
  enemy.netId = nextNetId++;
  // More frogs, mightier bosses.
  if (enemy.type.boss && coop) enemy.hp = enemy.maxHp = Math.round(enemy.maxHp * (1 + COOP_BOSS_HP * (coop.size - 1)));
  if (enemy.type.boss && vow('royal')) enemy.hp = enemy.maxHp = Math.round(enemy.maxHp * (1 + 0.3 * vow('royal')));
  // Bosses are fought through their health, not a lock on it (see BOSS_SCRIPTS).
  if (enemy.type.boss) enemy.hp = enemy.maxHp = Math.round(enemy.maxHp * (BOSS_SCRIPTS[kind]?.hp ?? 1));
  if (enemy.damage > 0) enemy.damage += config.contactBonus ?? 0;
  let spot = at ?? freeCorner(enemy.radius);
  // A requested spot can be blocked (a huge boss at a corner, a summon inside a tree): step toward the middle.
  if (at) {
    const isBlocked = enemyBlocker(enemy);
    spot = [1, 0.92, 0.84, 0.76, 0.68, 0.6].map((f) => at.clone().multiplyScalar(f)).find((p) => !isBlocked(p));
  }
  if (!spot) {
    enemy.dispose();
    return null;
  }
  enemy.position.copy(spot);
  enemy.faceTowards(player.position);
  assignFlank(enemy);
  enemies.push(enemy);
  scene.add(enemy.group);
  if (!enemy.type.boss) hud.attachHealthBar(enemy);
  return enemy;
}

function removeEnemy(enemy) {
  enemies.splice(enemies.indexOf(enemy), 1);
  if (mirrors.get(enemy.netId) === enemy) mirrors.delete(enemy.netId);
  hud.removeHealthBar(enemy);
  if (enemy.ai.telegraph) removeTelegraph(enemy.ai.telegraph);
  enemy.dispose();
}

const DAMAGE_STYLES = { burn: 'burn', lightning: 'zap', ultimate: 'big', frost: 'frost' };

/** Every source of damage goes through here, so brews, the ultimate gauge and kills stay in sync. */
function damageEnemy(enemy, amount, direction = null, force = 0, source = 'spit') {
  if (enemy.dying) return;
  // A shielded boss shrugs everything off (now and then a 🛡 shows where the hits land).
  if (enemy.shielded) {
    if (source !== 'burn' && source !== 'net' && clock.elapsedTime - (enemy.lastShieldPing ?? 0) > 0.3) {
      enemy.lastShieldPing = clock.elapsedTime;
      hud.damageNumber(enemy.position, '🛡', enemy.height + 4, 'frost');
      play('shield');
    }
    return;
  }
  // Co-op: an attuned ward or guardian only takes its owner's hits.
  if (enemy.owner && source !== 'net' && enemy.owner !== net.id && !ownerAway(enemy.owner)) {
    if (clock.elapsedTime - (enemy.lastShieldPing ?? 0) > 0.4) {
      enemy.lastShieldPing = clock.elapsedTime;
      hud.damageNumber(enemy.position, '🔒', enemy.height + 4, 'frost');
    }
    return;
  }
  // A teammate's hit forwarded to the host is already final; local hits get Tode's multipliers.
  const fromTeammate = source === 'net';
  let damage = fromTeammate ? amount : amount * player.stats.damageMultiplier * (1 + TIER_DAMAGE_BONUS * ascension.tier);
  if (!fromTeammate && enemy.ai.staggerLeft > 0) damage *= WARD.staggerBonus;
  if (!fromTeammate && player.stats.lightningFreeze && enemy.isFrozen) damage *= 2;
  const crit = !fromTeammate && source !== 'burn' && source !== 'ultimate' && Math.random() < player.stats.critChance;
  if (crit) damage *= player.stats.critMultiplier;
  damage = Math.max(1, Math.round(damage));
  const procs = !fromTeammate && charmCounts.size > 0 && PROC_SOURCES.has(source) && procScale > 0.15;

  if (isGuest()) {
    net.queue('host', { k: 'hit', id: enemy.netId, dm: damage, kx: direction ? direction.x * force : 0, ky: direction ? direction.y * force : 0 });
  }
  const landed = Math.min(damage, Math.max(0, enemy.hp)); // overkill doesn't charge the ultimate
  const killed = enemy.takeDamage(damage, direction, force);
  if (source !== 'burn' && !fromTeammate) play('hit');
  if (damage >= HIT_STOP_DAMAGE && !fromTeammate) hitStop(0.045);
  hud.damageNumber(enemy.position, crit ? `${damage}!` : damage, enemy.height + 4, crit ? 'crit' : DAMAGE_STYLES[source] ?? '');
  // The gauge fills per bee's worth of health, not per raw damage: late-game hits are huge, bees too.
  if (source !== 'ultimate' && !fromTeammate) addGauge((landed * GAUGE_PER_DAMAGE) / (config?.hpScale ?? 1));
  if (procs) charmHit(enemy, amount, crit);
  if (killed) {
    onEnemyKilled(enemy);
    if (procs) charmKill(enemy);
  }
}

function onEnemyKilled(enemy) {
  dropLeaves(enemy);
  dropCharms(enemy);
  if (enemy.kind === 'nest') objectiveDone();
  if (enemy.type.ward || enemy.kind === 'guardian') wardSmashed(enemy);
  // Vengeful Swarm: dying bees burst into stingers (the host fires them for everyone).
  if (waveMods.has('vengeful') && !enemy.type.boss && !enemy.type.structure && !isGuest()) fireRing(enemy, 6, 150, Math.random() * Math.PI);
  kills++;
  combo++;
  comboTimer = COMBO_WINDOW;
  if (!isGuest()) points += Math.round(enemy.score * (1 + Math.min(combo, 50) * COMBO_BONUS));
  if (combo >= 50) achieve('combo50');
  if (combo >= 150) achieve('combo150');
  if (kills >= 1000) achieve('kills1000');
  if (enemy.elite && ++meta.eliteKills >= 50) achieve('elites');
  const streak = STREAKS.get(combo);
  if (streak) {
    hud.showCallout(streak);
    play('streak');
  }
  play('pop');
  if (enemy.elite && !isGuest()) eliteDeath(enemy);
  particles.burst(enemy.position, {
    count: enemy.type.boss ? 70 : 14,
    colors: BEE_FLUFF,
    size: enemy.type.boss ? 3.5 : 2,
    speed: enemy.type.boss ? 200 : 90,
    up: 90,
    height: enemy.height * 0.6,
  });
  hud.removeHealthBar(enemy);
  if (enemy.ai.telegraph) removeTelegraph(enemy.ai.telegraph);

  const { honeyEvery } = player.stats;
  if (honeyEvery && ++killsSinceHoney >= honeyEvery && timeAlive - lastLifesteal >= LIFESTEAL_COOLDOWN) {
    killsSinceHoney = 0;
    lastLifesteal = timeAlive;
    healPlayer(1);
  }

  if (isGuest()) return; // the host announces finishers and boss kills to everyone

  const lastOfWave = phase === 'fighting' && !spawnQueue.length && !aliveEnemies().some((e) => !e.type.structure) && gateOpen();
  if (enemy.type.boss || lastOfWave) {
    finisher(enemy.type.boss);
    share({ k: 'fin', big: enemy.type.boss });
  }
  if (enemy.type.boss) {
    bossDefeated(enemy.type.name, enemy.type.score, enemy.kind);
    share({ k: 'bossDown', n: enemy.type.name, s: enemy.type.score, kd: enemy.kind });
  }
}

let beezebubTime = 0; // play time when Bee-zebub fell (the speed leaderboard)

function bossDefeated(name, score, kind) {
  clearBossMechanics();
  if (name.includes('zebub') && !beezebubTime) beezebubTime = Math.max(1, Math.floor(timeAlive));
  if (kind) bossMemory(kind).beaten++;
  if (kind) achieve(kind); // queen, shogun, seraph, empress, beezebub
  if (!feats.bossHurt) achieve('flawless');
  if (steep >= 5 && kind === 'shogun') achieve('steep5');
  if (steep >= 12 && kind === 'empress') achieve('steep12');
  if (coop) achieve('coop');
  bossKills++;
  hud.setBoss(null);
  shake = BOSS_DEATH_SHAKE;
  postfx.flash('#fff2c0', 0.6);
  healPlayer(2);
  hud.showBanner(`${name} is down!`, `+${score} points`, 2.6);
  play('victory');
}

const chase = new THREE.Vector3();
const away = new THREE.Vector3();

/** Slow motion and a camera push-in on the last bee of a wave (bigger for bosses). */
function finisher(big) {
  slowMotion(big ? 1.8 : 0.9, big ? 0.15 : 0.3);
  zoomPunch = big ? 0.35 : 0.2;
  postfx.pulse({ bloom: big ? 1.2 : 0.6, aberration: big ? 1 : 0.5 });
  play('boom');
}

function slowMotion(seconds, scale) {
  slowMotionLeft = Math.max(slowMotionLeft, seconds);
  slowMotionScale = Math.min(slowMotionLeft > seconds ? slowMotionScale : 1, scale);
}

function hitStop(seconds) {
  if (clock.elapsedTime - lastHitStop < 0.25) return;
  lastHitStop = clock.elapsedTime;
  hitStopLeft = Math.max(hitStopLeft, seconds);
}

/** How fast game time runs this frame: hit-stops freeze, slow motion eases back to normal. */
function timeScale(delta) {
  if (hitStopLeft > 0) {
    hitStopLeft -= delta;
    return 0.05;
  }
  if (slowMotionLeft > 0) {
    slowMotionLeft -= delta;
    const easeOut = Math.min(1, slowMotionLeft / 0.4);
    return THREE.MathUtils.lerp(1, slowMotionScale, easeOut);
  }
  return 1;
}

/** What everyone sees and feels when an explosive bee goes off (damage to bees is the host's job). */
function explosionEffects(position) {
  play('boom');
  shake = Math.max(shake, 8);
  particles.burst(position, { count: 30, colors: FIRE, speed: 220, up: 140, size: 2.2, glow: true });
  effects.ring(position, { radius: 75, color: '#ff6a3d', duration: 0.35 });
  if (player.position.distanceTo(position) < 75 + player.radius * 0.5) hurtPlayer(1);
}

function eliteDeath(enemy) {
  const position = enemy.position.clone();
  if (enemy.elite === ELITE_MODS.explosive) {
    effects.warning(position, {
      radius: 75,
      delay: 0.7,
      color: '#ff6a3d',
      onDone: () => {
        explosionEffects(position);
        effects.blast(position, { radius: 75, damage: 6, knockback: 300, color: '#ff6a3d', source: 'burn' });
      },
    });
    share({ k: 'boom', p: [position.x, position.y] });
  } else if (enemy.elite === ELITE_MODS.splitting) {
    for (const angle of [0, Math.PI]) {
      const offset = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0).multiplyScalar(enemy.radius + 12);
      spawnEnemy('zipper', position.clone().add(offset), { elite: null });
    }
  }
}
function updateHealth() {
  hud.setHealth(player.hp, player.stats.maxHp, player.shield);
}

function healPlayer(amount) {
  const healed = player.heal(amount);
  if (!healed) return;
  play('heal');
  hud.damageNumber(player.position, `+${'♥'.repeat(healed)}`, 30, 'heal');
  updateHealth();
  // Sun Brew: healing releases a blazing nova.
  if (player.stats.healNova) {
    effects.blast(player.position, {
      radius: 130,
      damage: player.stats.healNova,
      color: '#ffb020',
      particleColors: FIRE,
      source: 'burn',
    });
  }
}

function addGauge(amount) {
  if (!player.ultimate || player.gauge >= 100) return;
  player.gauge = Math.min(100, player.gauge + amount * player.stats.gaugeRate);
  if (player.gauge >= 100) {
    tip('ultimate');
    play('ultimateReady');
    hud.damageNumber(player.position, touch.enabled ? 'ULTIMATE READY · ✨' : 'ULTIMATE READY · E', 40, 'ready');
  }
}

/** Returns true if the hit landed (Tode wasn't invulnerable). */
function hurtPlayer(amount, enemy = null) {
  const result = player.takeDamage(amount);
  if (!result) return false;
  if (enemy) {
    directionTo(player.position, enemy.position, away);
    enemy.knockback.addScaledVector(away, ENEMY_CONTACT_KNOCKBACK);
  }

  if (result === 'shield') {
    play('shield');
    particles.burst(player.position, { count: 16, colors: PETALS, speed: 120, up: 80, size: 1.6 });
    effects.ring(player.position, { radius: 60, color: '#ff9ec7', duration: 0.4 });
  } else {
    hitThisWave = true;
    feats.bossHurt = true;
    shake = Math.max(shake, HIT_SHAKE);
    hitStop(0.08);
    play('hurt');
    hud.flashHurt();
    addGauge(GAUGE_PER_HIT);
  }

  // Calm Before the Storm: getting hit calls lightning down on nearby bees.
  if (player.stats.hitStorm) {
    aliveEnemies()
      .sort((a, b) => distanceSqXY(a.position, player.position) - distanceSqXY(b.position, player.position))
      .slice(0, player.stats.hitStorm)
      .forEach((target) => sharedStrike(target.position, { damage: 6, radius: 35 }));
  }

  updateHealth();
  if (player.isDead) {
    if (player.stats.revives > 0) revive();
    else if (coop) playerDown();
    else gameOver();
  }
  return true;
}

/** Last Sip / Lily Pad Blessing: rise again in a burst of light. */
function revive() {
  player.stats.revives--;
  player.revive(player.stats.reviveHp);
  play('revive');
  postfx.flash('#fff4d6', 0.8);
  postfx.pulse({ bloom: 1.5 });
  shake = 14;
  effects.blast(player.position, { radius: 170, damage: 10, knockback: 700, color: '#fff4d6', particleColors: PETALS, source: 'ultimate' });
  hud.showBanner('Last Sip!', 'Tode refuses to fall.', 1.8);
  updateHealth();
}

function lightningHit(enemy) {
  if (player.stats.lightningFreeze) enemy.applySlow(1, 1.2);
}

function checkContact(enemy) {
  if (enemy.type.structure) return; // hives don't bite (Tode can walk right up and smash them)
  const touching = circlesOverlap(enemy.position, enemy.radius + ENEMY_CONTACT_REACH, player.position, player.radius);
  if (!touching) return;

  if (player.isDashing) {
    if (player.dash.hits.has(enemy)) return;
    player.dash.hits.add(enemy);
    const { dashDamage, freezeDash } = player.stats;
    // Blizzard Dash: freeze solid, shatter a moment later.
    if (freezeDash) {
      enemy.applySlow(1, FREEZE_SHATTER_DELAY + 0.2);
      enemy.shatterLeft = FREEZE_SHATTER_DELAY;
      particles.burst(enemy.position, { count: 8, colors: ICE, speed: 60, up: 50, size: 1.4, glow: true });
    }
    if (dashDamage > 0) damageEnemy(enemy, dashDamage, player.dash.direction, DASH_KNOCKBACK * player.stats.dashKnockback, 'dash');
    return;
  }
  if (!enemy.damage) return; // nurses
  const charging = enemy.type.boss && enemy.ai.mode === 'charge';
  hurtPlayer(charging ? QUEEN.chargeDamage : enemy.damage, enemy);
}

function updateChaser(enemy, delta) {
  // Phalanx bees march straight across the arena before they start chasing.
  if (enemy.marchLeft > 0) {
    enemy.marchLeft -= delta;
    enemy.faceDirection(enemy.march.x, enemy.march.y);
    moveEnemy(enemy, enemy.march.x * enemy.speed * 1.4, enemy.march.y * enemy.speed * 1.4, delta);
    // Bombers drop stingers to both sides, slow enough to step between.
    if (enemy.bomber && !enemy.isFrozen && (enemy.bomber.timer -= delta) <= 0) {
      enemy.bomber.timer = 0.32;
      for (const sign of [1, -1]) fireStinger(enemy, fanDirection.copy(enemy.bomber.side).multiplyScalar(sign), 120, true);
    }
    if (enemy.marchLeft <= 0) enemy.bomber = null;
    return;
  }
  if (enemy.ai.mode) {
    updatePounce(enemy, delta);
    return;
  }
  const target = targetFor(enemy.position);
  let distance = directionTo(enemy.position, target, chase);
  // Flankers aim beside Tode and spiral in, so the swarm closes in from every side instead of in a line.
  if (enemy.flank && distance > 140) {
    const angle = Math.atan2(-chase.y, -chase.x) + enemy.flank;
    flankPoint.set(target.x + Math.cos(angle) * 120, target.y + Math.sin(angle) * 120, 0);
    distance = directionTo(enemy.position, flankPoint, chase);
    enemy.faceDirection(chase.x, chase.y);
    moveEnemy(enemy, chase.x * enemy.speed, chase.y * enemy.speed, delta);
    return;
  }
  enemy.faceTowards(target);
  const reached = distance < enemy.radius + player.radius + ENEMY_CONTACT_REACH;
  const speed = reached ? 0 : enemy.speed;
  moveEnemy(enemy, chase.x * speed, chase.y * speed, delta);
}

/** Stingers keep their distance, circle around Tode and shoot. */
function updateStinger(enemy, delta) {
  const { ranged } = enemy.type;
  if (enemy.postLeft > 0 && updatePost(enemy, delta)) return;
  const target = targetFor(enemy.position);
  const distance = directionTo(enemy.position, target, chase);
  enemy.faceTowards(target);

  let vx = 0;
  let vy = 0;
  if (distance > ranged.distance + 30) [vx, vy] = [chase.x, chase.y];
  else if (distance < ranged.distance - 40) [vx, vy] = [-chase.x, -chase.y];
  else [vx, vy] = [-chase.y * enemy.strafeSign * 0.6, chase.x * enemy.strafeSign * 0.6];
  moveEnemy(enemy, vx * enemy.speed, vy * enemy.speed, delta);

  if (enemy.isFrozen) return;
  // Synchronized volleys: every stinger winds up and fires on the hive's beat.
  if (tactics.sync) enemy.attackTimer = tactics.volleyIn;
  else enemy.attackTimer -= delta;
  if (enemy.attackTimer <= ranged.windup) {
    enemy.glowColor.set(0xd18cff);
    enemy.glow = THREE.MathUtils.clamp(1 - enemy.attackTimer / ranged.windup, 0, 1);
  }
  if (enemy.attackTimer <= 0) {
    enemy.glow = 0;
    enemy.attackTimer = ranged.cooldown * (0.8 + Math.random() * 0.4);
    if (distance < ranged.distance + 150) stingerVolley(enemy, ranged.speed);
    if (Math.random() < 0.3) enemy.strafeSign *= -1;
  }
}

/** Crossfire: hurry to the post around Tode, wind up with the others, and all fire at once. False when done. */
function updatePost(enemy, delta) {
  const tode = enemy.postTode;
  if (!tode || tode.downed || enemy.isFrozen) {
    enemy.postLeft = 0;
    return false;
  }
  enemy.postLeft -= delta;
  flankPoint.set(tode.position.x + Math.cos(enemy.post) * CROSSFIRE.distance, tode.position.y + Math.sin(enemy.post) * CROSSFIRE.distance, 0);
  const distance = directionTo(enemy.position, flankPoint, chase);
  const speed = Math.min(enemy.speed * 1.8, distance * 5);
  moveEnemy(enemy, chase.x * speed, chase.y * speed, delta);
  enemy.faceTowards(tode.position);
  enemy.glowColor.set(0xff4a8a);
  enemy.glow = THREE.MathUtils.clamp(1 - enemy.postLeft / CROSSFIRE.time, 0, 1);
  if (enemy.postLeft > 0) return true;
  // Fire: a fan straight at Tode from every post, plus a second, slower one to cut off the dodge.
  enemy.glow = 0;
  directionTo(enemy.position, tode.position, chase);
  const angle = Math.atan2(chase.y, chase.x);
  fireFan(enemy, angle, 5, 0.5, enemy.type.ranged.speed * 1.1);
  later(0.35, () => !enemy.dying && fireFan(enemy, angle, 4, 0.75, enemy.type.ranged.speed * 0.75));
  enemy.attackTimer = enemy.type.ranged.cooldown;
  return true;
}

// Ranged bees shoot harder patterns in every arena: [bullets per volley, spread in radians, speed factor].
const STINGER_PATTERNS = { garden: [1, 0, 1], mountain: [3, 0.35, 1], sky: [5, 0.75, 0.8], cosmos: [3, 0.22, 1.1], hell: [5, 0.55, 1.1] };

function stingerVolley(enemy, speed) {
  const [count, spread, pace] = STINGER_PATTERNS[arena.id] ?? STINGER_PATTERNS.garden;
  let angle = Math.atan2(chase.y, chase.x);
  // Later on, elites and every other stinger lead their shots: they aim where Tode is running to.
  if (tacticsWave() >= TACTICS.leadFrom && (enemy.elite || enemy.netId % 2 === 0)) {
    const tode = targetTodeFor(enemy.position);
    const velocity = todeMotion.get(tode)?.velocity;
    if (velocity) {
      const flight = Math.sqrt(distanceSqXY(enemy.position, tode.position)) / (speed * pace);
      angle = Math.atan2(tode.position.y + velocity.y * flight * 0.85 - enemy.position.y, tode.position.x + velocity.x * flight * 0.85 - enemy.position.x);
    }
  }
  fireFan(enemy, angle, count + (enemy.elite ? 2 : 0), spread * (enemy.elite ? 1.3 : 1), speed * pace);
  // In the Tournament every third volley is a ring as well.
  enemy.volleys = (enemy.volleys ?? 0) + 1;
  if (arena.id === 'cosmos' && enemy.volleys % 3 === 0) fireRing(enemy, 10, speed * 0.55, angle);
}

function fireStinger(enemy, direction, speed, quiet = false) {
  const origin = enemy.position.clone().addScaledVector(direction, enemy.radius * 0.8);
  launchStinger(origin, direction, speed, quiet);
  share({ k: 'sting', o: [origin.x, origin.y], d: [direction.x, direction.y], s: speed, q: quiet });
}

/** Every player simulates the bullets themselves and only checks hits on their own Tode. */
function launchStinger(origin, direction, speed, quiet = false, range = STINGER.range * 1.6) {
  speed *= 1 + 0.15 * vow('stingers');
  bullets.spawn(origin, direction, { speed, radius: STINGER.radius, damage: STINGER.damage, range, color: arena.bullet ?? '#c070ff' });
  if (!quiet) play('sting');
}

/** A stinger that isn't fired by a bee (curtains, curses, arena events), launched for everyone. */
function sharedStinger(origin, direction, speed, quiet = false, range = STINGER.range * 1.6) {
  launchStinger(origin, direction, speed, quiet, range);
  share({ k: 'sting', o: [origin.x, origin.y], d: [direction.x, direction.y], s: speed, q: quiet, r: range });
}

const fanDirection = new THREE.Vector3();
/** Bullet-hell patterns: `count` bullets spread over `spread` radians around `angle`. */
function fireFan(enemy, angle, count, spread, speed) {
  for (let i = 0; i < count; i++) {
    const a = angle + (count > 1 ? (i / (count - 1) - 0.5) * spread : 0);
    fireStinger(enemy, fanDirection.set(Math.cos(a), Math.sin(a), 0), speed, i > 0);
  }
}

function fireRing(enemy, count, speed, offset = 0) {
  for (let i = 0; i < count; i++) {
    const a = offset + (i / count) * Math.PI * 2;
    fireStinger(enemy, fanDirection.set(Math.cos(a), Math.sin(a), 0), speed, i > 0);
  }
}

/** A lightning strike everyone sees; only the one who calls it deals damage to bees. */
function sharedStrike(position, options) {
  effects.strike(position, options);
  share({
    k: 'strike',
    p: [position.x, position.y],
    r: options.radius,
    dl: options.delay ?? 0,
    h: Boolean(options.hurtsPlayer),
    c: options.color,
    dm: options.damage,
    f: options.from && [options.from.x, options.from.y, options.from.z],
  });
}

/** At set health thresholds the boss roars, shoves Tode back, calls guards and learns stinger rain. */
function bossRoar(boss) {
  boss.ai.phase = (boss.ai.phase ?? 0) + 1;
  boss.ai.rain = true;
  roarEffects(boss);
  share({ k: 'roar', id: boss.netId });
  const hellish = boss.type.hellfire;
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    const spot = boss.position.clone().add(new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0).multiplyScalar(boss.radius + 30));
    spawnEnemy(hellish ? 'stinger' : 'zipper', spot, { elite: hellish ? 'swift' : null });
  }
  // The gods' bosses answer with a beam: a clash of wills (solo only; it pauses the world).
  if (!coop && (boss.kind === 'empress' || hellish) && !player.downed) startClash(boss);
}

// --- Beam clash: Tode's beam against the boss's, mash to push it back ----------------
const CLASH = { time: 4.5, push: 0.05, bossPush: 0.17, winDamage: 0.1 };
const clash = { boss: null, progress: 0.5, time: 0, beams: null };
const Y_AXIS = new THREE.Vector3(0, 1, 0);

function clashBeam(color, radius) {
  const beam = new THREE.Group();
  const core = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.45, radius * 0.45, 1, 20, 1, true), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
  const glow = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 1, 20, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }));
  beam.add(core, glow);
  scene.add(beam);
  return beam;
}

/** Stretches a beam between two points (at chest height). */
function placeBeam(beam, from, to, wobble) {
  const a = from.clone().setZ(22);
  const b = to.clone().setZ(22);
  const direction = b.clone().sub(a);
  const length = Math.max(1, direction.length());
  beam.position.copy(a).add(b).multiplyScalar(0.5);
  beam.quaternion.setFromUnitVectors(Y_AXIS, direction.normalize());
  beam.scale.set(wobble, length, wobble);
}

function startClash(boss) {
  Object.assign(clash, { boss, progress: 0.5, time: 0 });
  clash.beams = {
    tode: clashBeam('#ffd36b', 16),
    boss: clashBeam(boss.type.hellfire ? '#ff2a00' : '#c070ff', 20),
    orb: new THREE.Mesh(new THREE.SphereGeometry(22, 24, 16), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending })),
  };
  scene.add(clash.beams.orb);
  setPhase('clash');
  play('beam');
  play('roar');
  shake = 18;
  postfx.shatter(0.6, 0.6);
  postfx.flash('#ffffff', 0.5);
  hud.showCallout('BEAM CLASH!');
}

function updateClash(delta) {
  const { boss, beams } = clash;
  clash.time += delta;
  const mashes = ['Space', 'MouseLeft', 'MouseRight', 'KeyE', 'ShiftLeft', 'ShiftRight'].filter((code) => input.wasPressed(code)).length;
  clash.progress += mashes * CLASH.push - delta * (CLASH.bossPush + 0.05 * (boss.ai.phase ?? 0));
  clash.progress = THREE.MathUtils.clamp(clash.progress, 0, 1);
  if (mashes) {
    play('zap');
    shake = Math.max(shake, 6);
    postfx.pulse({ aberration: 0.4, warp: 0.3 });
  }

  const tode = player.position;
  player.aimAt(boss.position);
  boss.faceTowards(tode);
  boss.glow = 1;
  boss.update(delta);
  const point = tode.clone().lerp(boss.position, 0.15 + clash.progress * 0.7);
  const wobble = 1 + 0.15 * Math.sin(clash.time * 40);
  placeBeam(beams.tode, tode, point, wobble);
  placeBeam(beams.boss, boss.position, point, 1 + 0.15 * Math.sin(clash.time * 37 + 1));
  beams.orb.position.copy(point).setZ(22);
  beams.orb.scale.setScalar(1 + 0.3 * Math.sin(clash.time * 30) + mashes * 0.3);
  particles.burst(point.clone().setZ(22), { count: 4, colors: ['#ffffff', '#ffd36b', boss.type.hellfire ? '#ff4a10' : '#c070ff'], speed: 260, up: 120, size: 2.2, glow: true, height: 0 });
  cameraPan.lerp(boss.position.clone().sub(tode).setZ(0).multiplyScalar(0.45), 1 - Math.exp(-4 * delta));
  cameraZoom += (0.85 - cameraZoom) * (1 - Math.exp(-3 * delta));
  shake = Math.max(shake, 2.5);
  postfx.pulse({ warp: 0.35, aberration: 0.35 });
  hud.showClash(clash.progress, touch.enabled ? 'TAP! TAP! TAP!' : 'MASH SPACE!');

  if (clash.progress >= 1) endClash(true);
  else if (clash.progress <= 0) endClash(false);
  else if (clash.time >= CLASH.time) endClash(clash.progress >= 0.5);
}

function endClash(won) {
  const { boss, beams } = clash;
  for (const mesh of [beams.tode, beams.boss, beams.orb]) {
    mesh.removeFromParent();
    mesh.traverse((child) => {
      child.geometry?.dispose();
      child.material?.dispose();
    });
  }
  clash.beams = null;
  hud.hideClash();
  cameraPan.set(0, 0, 0);
  cameraZoom = 1;
  boss.glow = 0;
  setPhase('fighting');
  if (won) {
    // Tode's beam drives straight through: reality cracks.
    damageEnemy(boss, Math.round(boss.maxHp * CLASH.winDamage), null, 0, 'ultimate');
    postfx.shatter(1, 1);
    postfx.flash('#fff1d0', 0.8);
    postfx.pulse({ bloom: 1.5, warp: 1.2, aberration: 1.2 });
    effects.ring(boss.position, { radius: 360, color: '#ffd36b', duration: 0.9, thickness: 0.2 });
    particles.burst(boss.position, { count: 90, colors: ['#ffffff', '#ffd36b', '#ffb02e'], speed: 380, up: 240, size: 3, glow: true, height: boss.height * 0.5 });
    slowMotion(1.2, 0.2);
    shake = 30;
    play('boom');
    hud.showCallout('OVERPOWERED!');
  } else {
    player.invulnerableLeft = 0;
    hurtPlayer(1);
    directionTo(boss.position, player.position, away);
    player.velocity.addScaledVector(away, 900);
    postfx.flash(boss.type.hellfire ? '#ff3b1f' : '#c070ff', 0.6);
    shake = 22;
    play('boom');
    hud.showCallout('Overwhelmed…');
  }
}

/** The roar as everyone experiences it: a red shockwave that shoves their own Tode away. */
function roarEffects(boss) {
  play('roar');
  shake = Math.max(shake, 14);
  postfx.flash('#ff3b1f', 0.35);
  if (boss.type.hellfire) {
    // Bee-zebub grows into his true form, and the Underworld answers.
    boss.group.scale.multiplyScalar(1.12);
    postfx.pulse({ warp: 1.2, aberration: 1.2, bloom: 1 });
    particles.burst(boss.position, { count: 80, colors: FIRE, speed: 300, up: 200, size: 3, glow: true, height: boss.height * 0.5 });
    effects.ring(boss.position, { radius: 420, color: '#ff6a00', duration: 0.9, thickness: 0.15 });
  }
  effects.ring(boss.position, { radius: 320, color: '#ff3b1f', duration: 0.7, thickness: 0.2 });
  directionTo(boss.position, player.position, away);
  if (player.position.distanceTo(boss.position) < 400) player.velocity.addScaledVector(away, 700);
  hud.showCallout(`${boss.type.name.split(' ').pop()} is furious!`);
}

/** Stingers rain down around Tode; red circles show where. */
function stingerRain(boss) {
  play('nova');
  const hellish = boss.type.hellfire;
  const count = hellish ? 14 : boss.kind === 'empress' ? 12 : 6;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = i === 0 ? 0 : 40 + Math.random() * 200;
    const spot = targetFor(boss.position, false).clone().add(new THREE.Vector3(Math.cos(angle) * distance, Math.sin(angle) * distance, 0));
    sharedStrike(spot, { damage: 0, radius: 38, delay: 1.1 + i * 0.05, hurtsPlayer: true, hitsBees: false, color: hellish ? '#ff4a10' : '#c070ff' });
  }
}

// --- Raid bosses: fights in stages, shields, mechanics and an enrage timer ------------------------------
// At each health fraction a boss enters its next stage: it roars, attacks a little faster and starts a mechanic.
// Shield tasks ('wards', 'lights', 'guardians') make it immune until they are done; 'interrupt' is a damage race
// against its channel; 'nurses', 'soak', 'mark' and 'blades' become attacks it keeps repeating; 'firering' closes
// the arena for the rest of the fight. `enrage`: seconds of fighting before it enrages. Apart from its shield, a
// boss always takes damage: the fight lasts through its health (`hp` multiplies ENEMY_TYPES), never through a lock
// that swallows hits. A big burst can cross several thresholds; their stages then follow one after another.
// [fraction, mechanic, count]
const BOSS_SCRIPTS = {
  queen: { enrage: 200, hp: 1.5, stages: [[0.75, 'wards', 3], [0.5, 'nurses'], [0.25, 'interrupt']] },
  shogun: { enrage: 220, hp: 2, stages: [[0.85, 'interrupt'], [0.62, 'wards', 4], [0.4, 'blades'], [0.18, 'guardians', 2]] },
  seraph: { enrage: 250, hp: 4, stages: [[0.82, 'lights', 3], [0.64, 'mark'], [0.46, 'guardians', 2], [0.28, 'soak'], [0.12, 'blades']] },
  empress: { enrage: 270, hp: 9, stages: [[0.85, 'wards', 4], [0.68, 'soak'], [0.5, 'guardians', 3], [0.32, 'mark'], [0.15, 'lights', 3]] },
  beezebub: { enrage: 300, hp: 12, stages: [[0.85, 'wards', 4], [0.7, 'interrupt'], [0.55, 'guardians', 3], [0.4, 'blades'], [0.25, 'firering'], [0.1, 'lights', 3]] },
};
// Titles for the stage banners; `every`: seconds between casts of a repeating mechanic.
const MECHANICS = {
  wards: { title: 'Shield of Wards' },
  lights: { title: 'Veil of Light' },
  guardians: { title: 'The Royal Guard' },
  interrupt: { title: 'Dark Ritual' },
  nurses: { title: 'Royal Nurses', every: 20 },
  soak: { title: 'Falling Stars', every: 17 },
  mark: { title: 'Judgement', every: 19 },
  blades: { title: 'Blade Storm', every: 15 },
  firering: { title: 'Ring of Fire' },
};
const RITUALS = { queen: 'Royal Jelly Feast', shogun: 'Thousand Cuts', beezebub: 'Infernal Feast' };
// Enraged: attacks come much faster, the boss moves faster and hits harder, and stingers rain down.
const ENRAGE = { attackScale: 0.55, speedScale: 1.3, rainEvery: 3.5 };
// Interrupt: deal `share` of the boss's health within `time` seconds, or the ritual heals and empowers it.
const INTERRUPT = { time: 8, share: 0.18, heal: 0.15, stagger: 4 };
// `time`: seconds before the shield overloads (everyone takes a hit, the boss heals); the lights take longer, as
// they mean running between them. `stagger`: seconds the boss is dazed after its shield breaks, taking
// `staggerBonus` × damage. `lightTime`: seconds to hold a circle of light.
const WARD = { time: { wards: 30, lights: 40, guardians: 40 }, overloadHeal: 0.1, stagger: 4, staggerBonus: 1.5, guardEvery: 6, lightTime: 3.5 };
// The cataclysm: the boss channels, then everything outside the circles of light is hit for `damage` hearts.
const CATACLYSM = { channel: 3.4, damage: 2, cooldown: 20 };
const SHIELD_COLOR = '#7fd8ff';
let raid = null; // { boss, task, count, zones, timer, guardTimer, tethers: Map(ward → mesh) }
let cataclysm = null; // { boss, zones, time, danger }

/** What players aim at: everything alive except shielded bosses. */
const targetable = () => aliveEnemies().filter((enemy) => !enemy.shielded);

/** Host: the shield goes up, the task appears for everyone. */
function startWard(boss, [, task, count]) {
  const turn = Math.random() * Math.PI * 2;
  const spots = Array.from({ length: count }, (_, i) => {
    const angle = turn + (i / count) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0).multiplyScalar(MAP_HALF_SIZE * (task === 'lights' ? 0.42 : 0.55));
  });
  // Wards spawn first: a spot can be blocked, and the task counts only the ones that made it.
  const placed = task === 'wards' ? spawnLinked('ward', spots) : spots;
  beginRaid(boss, task, placed);
  share({ k: 'ward', id: boss.netId, t: task, p: placed.map((p) => [Math.round(p.x), Math.round(p.y)]), o: task === 'wards' ? linkedOwners : [] });
}

/**
 * Spawns a ward or guardian at each spot (kept inside the arena); returns where they actually stand. In co-op each
 * one is attuned to a player in turn (`owner`): only that player's hits break it, so everyone has to take part.
 */
function spawnLinked(kind, spots) {
  const limit = MAP_HALF_SIZE - 40;
  const players = coop ? [net.id, ...coop.remotes.keys()] : [];
  const placed = spots
    .map((spot) => spawnEnemy(kind, spot.set(THREE.MathUtils.clamp(spot.x, -limit, limit), THREE.MathUtils.clamp(spot.y, -limit, limit), 0), { elite: null }))
    .filter(Boolean);
  placed.forEach((enemy, i) => players.length && attune(enemy, players[i % players.length]));
  linkedOwners = placed.map((enemy) => enemy.owner ?? null);
  return placed.map((enemy) => enemy.position.clone());
}
let linkedOwners = []; // the owners of the last wards or guardians spawned, sent along with the 'ward' message
let pendingOwners = []; // guests: owners for wards and guardians that haven't arrived yet: { p, o }

/** Co-op: only `owner`'s hits break this ward or guardian; its label says whose it is. */
function attune(enemy, owner) {
  enemy.owner = owner;
  const mine = owner === net.id;
  const info = mine ? null : coop?.remotes.get(owner);
  const color = mine ? net.players.find((p) => p.id === net.id)?.color ?? '#7fd8ff' : info?.color ?? '#7fd8ff';
  hud.setEnemyLabel(enemy, mine ? '🛡 YOURS' : `🛡 ${info?.name ?? 'Teammate'}'s`, color);
}

/** A ward's owner who is down or gone can't break it, so then anyone may. */
function ownerAway(owner) {
  if (owner === net.id) return Boolean(player.downed);
  const remote = coop?.remotes.get(owner);
  return !remote || !remote.alive;
}

/** Guests: a ward or guardian mirror takes the owner sent for the spot it stands on. */
function claimOwner(enemy) {
  const index = pendingOwners.findIndex(({ p }) => distanceSqXY(p, enemy.position) < 70 ** 2);
  if (index < 0) return;
  attune(enemy, pendingOwners[index].o);
  pendingOwners.splice(index, 1);
}

/** Everyone: the shield and its task (on guests the wards themselves arrive like any other bee). */
function beginRaid(boss, task, spots) {
  clearRaid();
  boss.setShield(true);
  const zones = task === 'lights' ? spots.map((position) => createZone(position, '#fff1b8')) : [];
  raid = { boss, task, count: spots.length, zones, timer: WARD.time[task], guardTimer: 3, tethers: new Map() };
  play('shield');
  play('roar');
  postfx.flash(SHIELD_COLOR, 0.4);
  shake = Math.max(shake, 12);
  effects.ring(boss.position, { radius: 280, color: SHIELD_COLOR, duration: 0.8, thickness: 0.2 });
  const job = { wards: `Smash the ${spots.length} shield wards!`, lights: `Hold the ${spots.length} circles of light!`, guardians: `Defeat the ${spots.length} Hive Guardians!` }[task];
  hud.showBanner(`🛡 ${boss.type.name} is shielded!`, job, 2.6);
}

const TETHER_GEOMETRY = new THREE.CylinderGeometry(1.6, 1.6, 1, 8, 1, true);

function updateRaid(delta) {
  if (!raid) return;
  const { boss } = raid;
  if (!enemies.includes(boss) || boss.dying) {
    clearRaid();
    return;
  }
  // Tethers of light from every ward (or guardian) to the boss.
  const wards = enemies.filter((enemy) => (raid.task === 'guardians' ? enemy.kind === 'guardian' : enemy.type.ward) && !enemy.dying);
  for (const [ward, tether] of raid.tethers) {
    if (wards.includes(ward)) continue;
    tether.removeFromParent();
    tether.material.dispose();
    raid.tethers.delete(ward);
  }
  for (const ward of wards) {
    if (!raid.tethers.has(ward)) {
      const tether = new THREE.Mesh(TETHER_GEOMETRY, additive(SHIELD_COLOR, 0.5));
      scene.add(tether);
      raid.tethers.set(ward, tether);
    }
    const tether = raid.tethers.get(ward);
    placeBeam(tether, ward.position.clone().setZ(10), boss.position, 1);
    tether.position.z = 10 + boss.height * 0.25;
    tether.material.opacity = 0.35 + 0.2 * Math.sin(clock.elapsedTime * 8);
  }
  // Circles of light fill while a Tode stands in them.
  for (const zone of raid.zones) {
    zone.emblem.rotation.z += delta * (zone.done ? 0.5 : 2);
    if (zone.done) continue;
    const holders = circleHolders(zone);
    zone.progress = THREE.MathUtils.clamp(zone.progress + (holders ? (delta / WARD.lightTime) * (1 + 0.3 * (holders - 1)) : -delta / 10), 0, 1);
    zone.fill.geometry.dispose();
    zone.fill.geometry = new THREE.CircleGeometry(ZONE_RADIUS - 5, 64, Math.PI / 2, Math.max(0.0001, zone.progress * Math.PI * 2));
    if (zone.progress >= 1) {
      zone.done = true;
      retireZone(zone);
      effects.ring(zone.position, { radius: 160, color: '#fff1b8', duration: 0.6, thickness: 0.2 });
      play('legendary');
    }
  }
  const done = raid.task === 'lights' ? raid.zones.filter((zone) => zone.done).length : raid.count - wards.length;
  raid.timer -= delta;
  const what = { wards: 'wards smashed', lights: 'lights held', guardians: 'guardians down' }[raid.task];
  hud.setRaid(`🛡 Break the shield: ${Math.max(0, done)}/${raid.count} ${what} · ${Math.max(0, Math.ceil(raid.timer))}s`, raid.timer < 8);
  if (isGuest()) return; // the host decides when the shield breaks or overloads
  if (done >= raid.count) {
    share({ k: 'wardOff' });
    breakShield();
    return;
  }
  // The hive sends guards to whoever is busy with the task (guardians fight for themselves).
  if (raid.task !== 'guardians' && (raid.guardTimer -= delta) <= 0) {
    raid.guardTimer = WARD.guardEvery * (wave < 10 ? 1.5 : 1);
    const posts = [...wards.map((ward) => ward.position), ...raid.zones.filter((zone) => !zone.done).map((zone) => zone.position)];
    const post = posts[Math.floor(Math.random() * posts.length)];
    for (let i = 0; post && i < 2; i++) {
      const angle = Math.random() * Math.PI * 2;
      spawnEnemy(i ? (wave >= 10 ? 'stinger' : 'drone') : 'zipper', post.clone().add(new THREE.Vector3(Math.cos(angle) * 90, Math.sin(angle) * 90, 0)));
    }
  }
  if (raid.timer <= 0) {
    boss.hp = Math.min(boss.maxHp, boss.hp + boss.maxHp * WARD.overloadHeal);
    share({ k: 'overload' });
    overload();
  }
}

function raidTargets() {
  if (cataclysm) return cataclysm.zones.map((zone) => zone.position);
  if (marked?.mine) return [marked.zone.position];
  const urgent = [
    ...soaks.flatMap((soak) => soak.zones.map((zone) => zone.position)),
    ...enemies.filter((enemy) => enemy.kind === 'nurse' && !enemy.dying).map((enemy) => enemy.position),
  ];
  if (!raid) return urgent;
  const task = raid.task === 'lights'
    ? raid.zones.filter((zone) => !zone.done).map((zone) => zone.position)
    : enemies.filter((enemy) => (raid.task === 'guardians' ? enemy.kind === 'guardian' : enemy.type.ward) && !enemy.dying).map((enemy) => enemy.position);
  return [...urgent, ...task];
}

/** A ward or a guardian down: one step closer to breaking the shield. */
function wardSmashed(ward) {
  particles.burst(ward.position, { count: 40, colors: ['#ffffff', SHIELD_COLOR, '#bff0ff'], speed: 220, up: 200, size: 2.2, glow: true, height: 20 });
  effects.ring(ward.position, { radius: 120, color: SHIELD_COLOR, duration: 0.5, thickness: 0.2 });
  play('zap');
  const left = enemies.filter((enemy) => enemy.kind === ward.kind && !enemy.dying).length;
  if (left > 0) hud.showCallout(ward.kind === 'guardian' ? `🛡 Guardian down! ${left} to go` : `🛡 Ward smashed! ${left} to go`);
}

/** Too slow: the shield overloads. Everyone takes a hit and the countdown starts over. */
function overload() {
  if (!raid) return;
  raid.timer = WARD.time[raid.task];
  for (const position of raidTargets()) effects.ring(position, { radius: 320, color: SHIELD_COLOR, duration: 0.8, thickness: 0.25 });
  effects.ring(raid.boss.position, { radius: 500, color: SHIELD_COLOR, duration: 0.9, thickness: 0.15 });
  postfx.flash(SHIELD_COLOR, 0.7);
  shake = Math.max(shake, 18);
  play('boom');
  hud.showBanner('⚡ The shield overloads!', `${raid.boss.type.name} draws power from it. Faster!`, 2.2);
  if (!player.downed) hurtPlayer(1);
}

/** The task is done: the shield shatters and the boss is staggered for a while. */
function breakShield() {
  if (!raid) return;
  const { boss } = raid;
  clearRaid();
  boss.ai.staggerLeft = WARD.stagger;
  boss.glow = 0;
  postfx.shatter(0.7, 0.5);
  postfx.flash('#ffffff', 0.6);
  postfx.pulse({ bloom: 1.2, aberration: 0.8 });
  shake = Math.max(shake, 20);
  slowMotion(0.6, 0.3);
  play('boom');
  play('victory');
  particles.burst(boss.position, { count: 90, colors: ['#ffffff', SHIELD_COLOR, '#bff0ff'], speed: 320, up: 220, size: 2.6, glow: true, height: boss.height * 0.5 });
  hud.showBanner('Shield broken!', `${boss.type.name} is staggered: strike now!`, 2.2);
}

function clearRaid() {
  if (!raid) return;
  raid.boss.setShield(false);
  for (const zone of raid.zones) disposeTree(zone.group);
  for (const tether of raid.tethers.values()) {
    tether.removeFromParent();
    tether.material.dispose();
  }
  raid = null;
  hud.setRaid(null);
}

/** Safe circles for a cataclysm: one a short run from every Tode, plus one more somewhere. */
function cataclysmSpots() {
  const limit = MAP_HALF_SIZE - ZONE_RADIUS - 20;
  const clamp = (v) => v.set(THREE.MathUtils.clamp(v.x, -limit, limit), THREE.MathUtils.clamp(v.y, -limit, limit), 0);
  const spots = standingTodes().map((tode) => {
    const angle = Math.random() * Math.PI * 2;
    const distance = 170 + Math.random() * 120;
    return clamp(tode.position.clone().add(new THREE.Vector3(Math.cos(angle) * distance, Math.sin(angle) * distance, 0)));
  });
  spots.push(clamp(new THREE.Vector3((Math.random() * 2 - 1) * limit, (Math.random() * 2 - 1) * limit, 0)));
  return spots;
}

const DANGER_MATERIAL = new THREE.MeshBasicMaterial({ color: '#ff2a10', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });

/** Everyone: the arena glows red, circles of light appear; whoever is outside them when it goes off gets hit. */
function startCataclysm(boss, spots) {
  clearCataclysm();
  const danger = new THREE.Mesh(new THREE.CircleGeometry(MAP_HALF_SIZE * 1.6, 48), DANGER_MATERIAL);
  danger.position.z = 0.6;
  scene.add(danger);
  cataclysm = { boss, time: 0, danger, zones: spots.map((position) => createZone(position, '#ffffff')) };
  play('beamCharge');
  play('roar');
  hud.showBanner('☀ Cataclysm!', 'Get into a circle of light!', 2);
}

function updateCataclysm(delta) {
  if (!cataclysm) return;
  cataclysm.time += delta;
  const k = Math.min(1, cataclysm.time / CATACLYSM.channel);
  DANGER_MATERIAL.opacity = 0.08 + 0.22 * k + 0.06 * Math.sin(cataclysm.time * 14);
  for (const zone of cataclysm.zones) {
    zone.emblem.rotation.z += delta * 4;
    zone.fill.geometry.dispose();
    zone.fill.geometry = new THREE.CircleGeometry(ZONE_RADIUS - 5, 64, Math.PI / 2, Math.max(0.0001, k * Math.PI * 2));
  }
  shake = Math.max(shake, 1 + k * 4);
  const safe = player.downed || cataclysm.zones.some((zone) => distanceSqXY(player.position, zone.position) < ZONE_RADIUS ** 2);
  hud.setRaid(`☀ ${safe ? 'Safe in the light' : 'Get into the light!'} · ${Math.max(0, CATACLYSM.channel - cataclysm.time).toFixed(1)}s`, !safe);
  if (k < 1) return;
  // It goes off. A hop-dash doesn't help here: only the light does.
  const { boss } = cataclysm;
  const color = boss?.type.hellfire ? '#ff4a10' : '#fff1b8';
  postfx.flash(color, 0.9);
  postfx.pulse({ bloom: 1.5, warp: 1, aberration: 1 });
  shake = Math.max(shake, 26);
  play('boom');
  effects.ring(boss?.position ?? player.position, { radius: MAP_HALF_SIZE * 2, color, duration: 1, thickness: 0.1 });
  for (const zone of cataclysm.zones) particles.burst(zone.position, { count: 30, colors: ['#ffffff', '#fff1b8'], speed: 120, up: 220, size: 2, glow: true });
  if (!safe && PLAYING.has(phase)) {
    player.dash = null;
    player.invulnerableLeft = 0;
    if (hurtPlayer(CATACLYSM.damage)) hud.showCallout('Caught in the cataclysm!');
  } else if (!player.downed) {
    hud.showCallout('Safe!');
  }
  clearCataclysm();
}

function clearCataclysm() {
  if (!cataclysm) return;
  for (const zone of cataclysm.zones) disposeTree(zone.group);
  cataclysm.danger.removeFromParent();
  cataclysm.danger.geometry.dispose();
  cataclysm = null;
  hud.setRaid(raid ? '' : null);
}

// --- Boss stages: entering a stage and the mechanics that come with it ------------------------------
let soaks = []; // falling stars: { boss, zones, stars, time }
let marked = null; // Judgement: { who, mine, name, zone, time }
let bladeStorm = null; // { origin, angle, speed, time, meshes }
let closing = null; // the Ring of Fire: { radius, time, wall, floor, burn }
let ritual = null; // a channel to interrupt (guests show its bar): { boss, from, need, time, title }
const SOAK = { delay: 4.2, failDamage: 2, failHeal: 0.05 };
const MARK = { time: 6.5, damage: 2 };
const BLADES = { windup: 1, spin: 3.4, length: 900, width: 16, speed: 0.55 };
const CLOSING = { time: 22, to: 0.42 };

/** Host: the boss crosses into its next stage. */
function startStage(boss, [, mechanic, count]) {
  const { ai } = boss;
  ai.stage = (ai.stage ?? 0) + 1;
  ai.stageSpeed = (ai.stageSpeed ?? 1) * 0.92; // every stage attacks a little faster
  const title = mechanic === 'interrupt' ? RITUALS[boss.kind] ?? MECHANICS.interrupt.title : MECHANICS[mechanic].title;
  stageEffects(boss, ai.stage, title);
  share({ k: 'stage', id: boss.netId, n: ai.stage, t: title });
  if (mechanic === 'wards' || mechanic === 'lights') startWard(boss, [0, mechanic, count]);
  else if (mechanic === 'guardians') startGuardians(boss, count);
  else if (mechanic === 'interrupt') startInterrupt(boss, title);
  else if (mechanic === 'firering') {
    share({ k: 'closing' });
    beginClosingRing();
  } else {
    (ai.unlocked ??= new Set()).add(mechanic);
    castMechanic(boss, mechanic);
  }
}

/** Everyone: the stage callout and a roar. */
function stageEffects(boss, stage, title) {
  play('roar');
  shake = Math.max(shake, 14);
  postfx.flash('#ff3b1f', 0.3);
  if (boss) effects.ring(boss.position, { radius: 340, color: '#ffb000', duration: 0.7, thickness: 0.2 });
  hud.showCallout(`Stage ${stage + 1}: ${title}`);
}

/** Host: a repeating mechanic, now or when its cooldown is over. */
function castMechanic(boss, mechanic) {
  (boss.ai.cast ??= {})[mechanic] = timeAlive;
  if (mechanic === 'nurses') summonNurses(boss);
  else if (mechanic === 'soak') startSoak(boss);
  else if (mechanic === 'mark') startMark();
  else if (mechanic === 'blades') startBlades(boss);
}

/** The repeating mechanic that is due, if any (never while a shield, a cataclysm or a soak is going on). */
function dueMechanic(boss) {
  if (raid || cataclysm || soaks.length || marked || bladeStorm) return null;
  const speedUp = boss.enraged ? 1.5 : 1;
  return [...(boss.ai.unlocked ?? [])].find((m) => timeAlive - (boss.ai.cast?.[m] ?? -99) > MECHANICS[m].every / speedUp) ?? null;
}

/** Everyone: a big banner for a mechanic (the host shares it). */
function announce(title, sub) {
  hud.showBanner(title, sub, 2.2);
  share({ k: 'say', t: title, s: sub });
}

// Enrage: the boss runs out of patience.
function enrageBoss(boss) {
  boss.enraged = true;
  boss.speed *= ENRAGE.speedScale;
  boss.damage += 1;
  boss.ai.rainTimer = 1;
  share({ k: 'enrage', id: boss.netId });
  enrageEffects(boss);
}

function enrageEffects(boss) {
  boss.enraged = true;
  play('roar');
  play('boss');
  shake = Math.max(shake, 22);
  postfx.flash('#ff2a10', 0.6);
  postfx.pulse({ warp: 1, aberration: 1 });
  effects.ring(boss.position, { radius: 500, color: '#ff2a10', duration: 1, thickness: 0.2 });
  hud.showBanner(`😡 ${boss.type.name} is ENRAGED!`, 'Finish it, fast!', 2.6);
}

/** Enraged bosses burn with a red aura. */
function enrageAura(boss) {
  if (Math.random() > 0.6) return;
  particles.burst(boss.position, { count: 2, colors: ['#ff2a10', '#ff8a3a', '#ffd36b'], ring: boss.radius * 0.8, speed: 15, up: 80, gravity: -40, size: 2.4, glow: true, height: boss.height * 0.2, life: 0.6 });
}

// --- Royal Nurses: they fly to the boss and heal it, unless they are stopped -------------------------
function summonNurses(boss) {
  const count = 3 + Math.floor(wave / 7) + (coop ? coop.size - 1 : 0);
  const turn = Math.random() * Math.PI * 2;
  for (let i = 0; i < count; i++) {
    const angle = turn + (i / count) * Math.PI * 2;
    const nurse = spawnEnemy('nurse', new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0).multiplyScalar(MAP_HALF_SIZE * 0.85), { elite: null });
    if (nurse) nurse.healTarget = boss;
  }
  announce('💚 Royal Nurses!', `Stop them before they heal ${boss.type.name}!`);
}

function updateNurse(nurse, delta) {
  const boss = nurse.healTarget;
  if (!boss || boss.dying || !enemies.includes(boss)) {
    nurse.die();
    return;
  }
  const distance = directionTo(nurse.position, boss.position, chase);
  nurse.faceDirection(chase.x, chase.y);
  moveEnemy(nurse, chase.x * nurse.speed, chase.y * nurse.speed, delta);
  if (Math.random() < 0.3) particles.burst(nurse.position, { count: 1, colors: ['#6dffa8', '#c8ffd8'], speed: 10, up: 20, gravity: -20, size: 1.4, glow: true, height: nurse.height * 0.5, life: 0.5 });
  if (distance > boss.radius + nurse.radius + 12) return;
  // It made it: the boss heals.
  const heal = Math.round(boss.maxHp * (boss.enraged ? 0.06 : 0.04));
  boss.hp = Math.min(boss.maxHp, boss.hp + heal);
  hud.damageNumber(boss.position, `+${heal}`, boss.height + 6, 'heal');
  effects.ring(boss.position, { radius: boss.radius * 2, color: '#6dffa8', duration: 0.5 });
  play('heal');
  removeEnemy(nurse);
}

// --- The Royal Guard: guardians keep the boss shielded until they fall --------------------------------
function startGuardians(boss, count) {
  const turn = Math.random() * Math.PI * 2;
  const spots = Array.from({ length: count }, (_, i) => {
    const angle = turn + (i / count) * Math.PI * 2;
    return boss.position.clone().add(new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0).multiplyScalar(boss.radius + 90));
  });
  const placed = spawnLinked('guardian', spots);
  if (!placed.length) return;
  beginRaid(boss, 'guardians', placed);
  share({ k: 'ward', id: boss.netId, t: 'guardians', p: placed.map((p) => [Math.round(p.x), Math.round(p.y)]), o: linkedOwners });
}

// --- Interrupt: a ritual that only enough damage can break -----------------------------------------
function startInterrupt(boss, title) {
  const { ai } = boss;
  ai.mode = 'interrupt';
  ai.timer = INTERRUPT.time;
  // A share of the boss's health before its `hp` boost, so breaking the ritual takes the same burst as ever.
  const need = Math.round((boss.maxHp * INTERRUPT.share * (coop ? 1 + 0.5 * (coop.size - 1) : 1)) / (BOSS_SCRIPTS[boss.kind]?.hp ?? 1));
  boss.glowColor.set(0x9a3cff);
  beginRitual(boss, need, title);
  share({ k: 'brk', id: boss.netId, need, n: title });
}

function beginRitual(boss, need, title) {
  ritual = { boss, from: boss.hp, need, title, time: 0 };
  play('beamCharge');
  hud.showBanner(`⚠ ${title}`, `Interrupt it: hit ${boss.type.name} hard, now!`, 2.2);
}

/** Everyone: the break bar. The host also runs the boss's side in updateQueen. */
function updateRitual(delta) {
  if (!ritual) return;
  ritual.time += delta;
  const { boss } = ritual;
  if (!enemies.includes(boss) || boss.dying || ritual.time > INTERRUPT.time + 2) {
    endRitual(null);
    return;
  }
  hud.setBreakBar((ritual.from - boss.hp) / ritual.need, `${ritual.title} · ${Math.max(0, INTERRUPT.time - ritual.time).toFixed(1)}s`);
  particles.burst(boss.position, { count: 2, colors: ['#9a3cff', '#d8b0ff'], ring: 200, speed: -300, up: 20, size: 2, glow: true, height: 14, life: 0.6 });
}

/** Host: has the channel been broken (true), has it finished (false), or is it still going (null)? */
function ritualResult(boss) {
  if (!ritual || ritual.boss !== boss) return false;
  if (ritual.from - boss.hp >= ritual.need) return true;
  return ritual.time >= INTERRUPT.time ? false : null;
}

/** Everyone: how it ended. `broken`: interrupted (stagger), false: completed (heal), null: just tidy up. */
function endRitual(broken) {
  const boss = ritual?.boss;
  ritual = null;
  hud.setBreakBar(null);
  if (broken === null || !boss) return;
  if (broken) {
    achieve('breaker');
    postfx.shatter(0.6, 0.5);
    postfx.flash('#ffffff', 0.5);
    shake = Math.max(shake, 18);
    play('boom');
    hud.showBanner('Interrupted!', `${boss.type.name} is staggered: strike now!`, 2);
  } else {
    postfx.flash('#9a3cff', 0.6);
    shake = Math.max(shake, 16);
    play('roar');
    effects.ring(boss.position, { radius: 400, color: '#9a3cff', duration: 0.9, thickness: 0.2 });
    hud.showBanner('The ritual is complete!', `${boss.type.name} heals and grows stronger`, 2.4);
  }
}

// --- Falling Stars: stand in the circles to catch them, or they hit everyone ------------------------
const starGeometry = new THREE.IcosahedronGeometry(16, 1);

function startSoak(boss) {
  const todes = standingTodes();
  const count = Math.max(1, Math.min(3, todes.length)) + (boss.enraged ? 1 : 0);
  const limit = MAP_HALF_SIZE - ZONE_RADIUS - 20;
  const spots = Array.from({ length: count }, (_, i) => {
    const tode = todes[i % Math.max(1, todes.length)] ?? player;
    const angle = Math.random() * Math.PI * 2;
    const distance = 140 + Math.random() * 120;
    const spot = tode.position.clone().add(new THREE.Vector3(Math.cos(angle) * distance, Math.sin(angle) * distance, 0));
    return spot.set(THREE.MathUtils.clamp(spot.x, -limit, limit), THREE.MathUtils.clamp(spot.y, -limit, limit), 0);
  });
  beginSoak(boss, spots);
  share({ k: 'soak', id: boss.netId, s: spots.map((p) => [Math.round(p.x), Math.round(p.y)]) });
  announce('☄ Falling Stars!', count > 1 ? 'Catch them: stand in every circle!' : 'Catch it: stand in the circle!');
}

function beginSoak(boss, spots) {
  const zones = spots.map((position) => createZone(position, '#ffd36b'));
  const stars = spots.map((position) => {
    const star = new THREE.Mesh(starGeometry, additive('#ffd36b', 0.9));
    star.position.copy(position).setZ(700);
    scene.add(star);
    return star;
  });
  soaks.push({ boss, zones, stars, time: 0 });
  play('whistle');
}

function updateSoaks(delta) {
  for (const soak of [...soaks]) {
    soak.time += delta;
    const k = Math.min(1, soak.time / SOAK.delay);
    soak.zones.forEach((zone, i) => {
      zone.emblem.rotation.z += delta * 3;
      zone.fill.geometry.dispose();
      zone.fill.geometry = new THREE.CircleGeometry(ZONE_RADIUS - 5, 64, Math.PI / 2, Math.max(0.0001, k * Math.PI * 2));
      soak.stars[i].position.z = 700 * (1 - k * k) + 10;
      soak.stars[i].rotation.x += delta * 4;
    });
    const inMine = soak.zones.some((zone) => distanceSqXY(player.position, zone.position) < ZONE_RADIUS ** 2);
    hud.setRaid(`☄ ${inMine ? 'Hold on: catch the star!' : 'Stand in the circle!'} · ${Math.max(0, SOAK.delay - soak.time).toFixed(1)}s`, !inMine);
    if (k < 1) continue;
    // Impact: every circle somebody stands in is caught; a missed one hits everyone (the host decides).
    for (const zone of soak.zones) {
      particles.burst(zone.position, { count: 40, colors: ['#ffffff', '#ffd36b', '#ffb02e'], speed: 220, up: 220, size: 2.4, glow: true });
      effects.ring(zone.position, { radius: ZONE_RADIUS * 1.6, color: '#ffd36b', duration: 0.5, thickness: 0.2 });
    }
    play('boom');
    shake = Math.max(shake, 12);
    if (!isGuest()) {
      const missed = soak.zones.filter((zone) => !standingTodes().some((tode) => distanceSqXY(tode.position, zone.position) < ZONE_RADIUS ** 2)).length;
      if (missed) {
        if (soak.boss && enemies.includes(soak.boss)) soak.boss.hp = Math.min(soak.boss.maxHp, soak.boss.hp + soak.boss.maxHp * SOAK.failHeal);
        share({ k: 'soakFail' });
        soakFailed();
      } else {
        hud.showCallout('Caught!');
      }
    }
    clearSoak(soak);
  }
}

/** Everyone: a star hit the ground: a shockwave across the whole arena. */
function soakFailed() {
  postfx.flash('#ffb02e', 0.7);
  shake = Math.max(shake, 22);
  hud.showCallout('A star fell! Everyone is hit');
  if (!player.downed) {
    player.invulnerableLeft = 0;
    player.dash = null;
    hurtPlayer(SOAK.failDamage);
  }
}

function clearSoak(soak) {
  soaks.splice(soaks.indexOf(soak), 1);
  for (const zone of soak.zones) disposeTree(zone.group);
  for (const star of soak.stars) {
    star.removeFromParent();
    star.material.dispose(); // the geometry is shared
  }
  if (!soaks.length) hud.setRaid(null);
}

// --- Judgement: one Tode is marked and must reach the cleansing circle before it goes off ------------
function startMark() {
  const todes = standingTodes();
  const tode = todes[Math.floor(Math.random() * todes.length)];
  if (!tode) return;
  const who = tode === player ? (coop ? net.id : 'solo') : tode.id;
  const angle = Math.random() * Math.PI * 2;
  const limit = MAP_HALF_SIZE - ZONE_RADIUS - 20;
  const spot = tode.position.clone().add(new THREE.Vector3(Math.cos(angle) * 300, Math.sin(angle) * 300, 0));
  spot.set(THREE.MathUtils.clamp(spot.x, -limit, limit), THREE.MathUtils.clamp(spot.y, -limit, limit), 0);
  beginMark(who, spot);
  share({ k: 'mark', who, p: [Math.round(spot.x), Math.round(spot.y)] });
}

function beginMark(who, spot) {
  clearMark();
  const mine = who === 'solo' || (coop && who === net.id);
  const name = mine ? 'You' : coop?.remotes.get(who)?.name ?? 'A frog';
  marked = { who, mine, name, zone: createZone(spot, '#c070ff'), time: 0, pulse: 0 };
  play('charge');
  if (mine) hud.showBanner('💀 Judgement!', 'You are marked: run to the purple circle!', 2.2);
  else hud.showCallout(`💀 ${name} is marked!`);
}

function updateMark(delta) {
  if (!marked) return;
  marked.time += delta;
  marked.zone.emblem.rotation.z += delta * 4;
  const left = MARK.time - marked.time;
  const tode = marked.mine ? player : coop?.remotes.get(marked.who);
  if (tode && (marked.pulse -= delta) <= 0) {
    marked.pulse = Math.max(0.15, left / 10);
    effects.ring(tode.position, { radius: 45, color: '#c070ff', duration: 0.4 });
  }
  hud.setRaid(marked.mine ? `💀 Marked! Reach the purple circle · ${Math.max(0, left).toFixed(1)}s` : `💀 ${marked.name} is marked · ${Math.max(0, left).toFixed(1)}s`, marked.mine);
  if (!marked.mine) {
    if (left < -1) clearMark(); // the marked frog's own screen reports the result
    return;
  }
  if (distanceSqXY(player.position, marked.zone.position) < ZONE_RADIUS ** 2) {
    effects.ring(player.position, { radius: 120, color: '#ffffff', duration: 0.5 });
    play('heal');
    hud.showCallout('Cleansed!');
    share({ k: 'markOff' });
    clearMark();
  } else if (left <= 0) {
    postfx.flash('#c070ff', 0.7);
    shake = Math.max(shake, 20);
    play('boom');
    effects.ring(player.position, { radius: 200, color: '#c070ff', duration: 0.6, thickness: 0.25 });
    player.invulnerableLeft = 0;
    player.dash = null;
    hurtPlayer(MARK.damage);
    hud.showCallout('Judged!');
    share({ k: 'markOff' });
    clearMark();
  }
}

function clearMark() {
  if (!marked) return;
  disposeTree(marked.zone.group);
  marked = null;
  hud.setRaid(null);
}

// --- Blade Storm: lines of light sweep around the boss; stay clear of them ---------------------------
function startBlades(boss) {
  const count = (boss.enraged ? 6 : 4) + (boss.type.hellfire ? 1 : 0);
  const angle = Math.random() * Math.PI * 2;
  const speed = BLADES.speed * (boss.enraged ? 1.4 : 1) * (Math.random() < 0.5 ? -1 : 1);
  boss.ai.mode = 'blades';
  boss.ai.timer = BLADES.windup + BLADES.spin;
  beginBlades(boss.position, count, angle, speed);
  share({ k: 'blades', o: [boss.position.x, boss.position.y], n: count, a: angle, s: speed });
  announce('⚔ Blade Storm!', 'Stay out of the sweeping blades!');
}

function beginBlades(origin, count, angle, speed) {
  clearBlades();
  const meshes = Array.from({ length: count }, () => {
    const geometry = new THREE.PlaneGeometry(BLADES.length, BLADES.width).translate(BLADES.length / 2, 0, 0);
    const mesh = new THREE.Mesh(geometry, additive('#ff6a3d', 0.25));
    mesh.position.set(origin.x, origin.y, 1.2);
    scene.add(mesh);
    return mesh;
  });
  bladeStorm = { origin: origin.clone().setZ(0), count, angle, speed, time: 0, meshes };
}

const bladeDirection = new THREE.Vector3();

function updateBlades(delta) {
  if (!bladeStorm) return;
  const storm = bladeStorm;
  storm.time += delta;
  const live = storm.time > BLADES.windup;
  if (live) storm.angle += storm.speed * delta;
  storm.meshes.forEach((mesh, i) => {
    const angle = storm.angle + (i / storm.count) * Math.PI * 2;
    mesh.rotation.z = angle;
    mesh.material.opacity = live ? 0.8 + 0.2 * Math.sin(storm.time * 30) : 0.15 + 0.15 * Math.sin(storm.time * 20);
    mesh.material.color.set(live ? '#ff7a1a' : '#ff3b1f');
    if (!live || player.downed) return;
    // Hit when Tode is close to the blade's line (and on its side of the boss).
    bladeDirection.set(Math.cos(angle), Math.sin(angle), 0);
    const dx = player.position.x - storm.origin.x;
    const dy = player.position.y - storm.origin.y;
    const along = dx * bladeDirection.x + dy * bladeDirection.y;
    const across = Math.abs(dx * bladeDirection.y - dy * bladeDirection.x);
    if (along > 0 && along < BLADES.length && across < BLADES.width / 2 + player.radius * 0.5) hurtPlayer(1);
  });
  if (live && Math.random() < 0.5) play('sting');
  if (storm.time > BLADES.windup + BLADES.spin) clearBlades();
}

function clearBlades() {
  if (!bladeStorm) return;
  for (const mesh of bladeStorm.meshes) disposeTree(mesh);
  bladeStorm = null;
}

// --- Ring of Fire: the arena closes in for the rest of the fight ---------------------------------------
const FIRE_FLOOR_MATERIAL = new THREE.MeshBasicMaterial({ color: '#ff3b10', transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending });

function beginClosingRing() {
  clearClosingRing();
  const wall = new THREE.Mesh(FIRE_WALL_GEOMETRY, FIRE_WALL_MATERIAL);
  wall.frustumCulled = false;
  const floor = new THREE.Mesh(new THREE.RingGeometry(1, 4, 96), FIRE_FLOOR_MATERIAL);
  floor.position.z = 0.7;
  scene.add(wall, floor);
  closing = { radius: MAP_HALF_SIZE * 1.45, time: 0, wall, floor, burn: 0 };
  play('roar');
  hud.showBanner('🔥 Ring of Fire!', 'The arena closes in: stay inside the flames', 2.4);
}

function updateClosingRing(delta) {
  if (!closing) return;
  closing.time += delta;
  const k = Math.min(1, closing.time / CLOSING.time);
  closing.radius = THREE.MathUtils.lerp(MAP_HALF_SIZE * 1.45, MAP_HALF_SIZE * CLOSING.to, k * (2 - k));
  closing.wall.scale.set(closing.radius, closing.radius, BRIMSTONE.height * 1.6);
  closing.floor.scale.setScalar(closing.radius);
  for (let i = 0; i < 3; i++) {
    const angle = Math.random() * Math.PI * 2;
    particles.burst(new THREE.Vector3(Math.cos(angle) * closing.radius, Math.sin(angle) * closing.radius, 0), { count: 1, colors: FIRE, speed: 10, up: 80, gravity: -30, size: 2.6, glow: true, height: 4 });
  }
  // Outside the ring, the flames burn.
  const outside = !player.downed && Math.hypot(player.position.x, player.position.y) > closing.radius - player.radius;
  if (!outside) {
    closing.burn = 0.4;
    return;
  }
  if ((closing.burn -= delta) <= 0) {
    closing.burn = 1;
    if (hurtPlayer(1)) hud.showCallout('The flames! Get inside!');
  }
}

function clearClosingRing() {
  if (!closing) return;
  closing.wall.removeFromParent();
  closing.floor.removeFromParent();
  closing.floor.geometry.dispose();
  closing = null;
}

/** Everything a boss fight leaves behind (the boss fell, or the world is cleared). */
function clearBossMechanics() {
  clearRaid();
  clearCataclysm();
  for (const soak of [...soaks]) clearSoak(soak);
  clearMark();
  clearBlades();
  clearClosingRing();
  endRitual(null);
  hud.setBossTimer(null);
  hud.setRaid(null);
}

function updateBossMechanics(delta) {
  updateRaid(delta);
  updateCataclysm(delta);
  updateSoaks(delta);
  updateMark(delta);
  updateBlades(delta);
  updateClosingRing(delta);
  updateRitual(delta);
}

// --- Hive tactics: bees work together, more and more as the run goes on --------------------------
// From these waves: flankers spiral in from the sides, packs lunge together along telegraphed lines, stingers fire
// in synchronized volleys, and some stingers lead their shots. On top of that the hive plans manoeuvres
// (`MANOEUVRES`): a pack circles Tode and collapses on him, stingers take posts around him for a crossfire, or a
// pack lunges one after another. The Hive Mind vow brings them all in from wave 2.
const TACTICS = { flankFrom: 4, pounceFrom: 7, syncFrom: 11, leadFrom: 15, manoeuvreFrom: 4 };
const POUNCE = { windup: 0.85, speed: 520, recover: 0.6 };
const SURROUND = { radius: 175, time: 2.4, spin: 0.7, windup: 0.6 };
const CROSSFIRE = { time: 2.2, distance: 230 };
const MANOEUVRES = [
  { id: 'surround', from: 4 },
  { id: 'crossfire', from: 6 },
  { id: 'rolling', from: 9 },
];
const tactics = { pounceTimer: 8, volleyIn: 2.5, sync: false, manoeuvreTimer: 10 };
const flankPoint = new THREE.Vector3();
const todeMotion = new WeakMap(); // tode → { last, velocity }: where Todes are heading, for leading shots
const motionStep = new THREE.Vector3();

const tacticsWave = () => (vow('hivemind') && wave >= 2 ? wave + 13 : wave);
const syncCooldown = () => Math.max(1.8, 2.8 - (tacticsWave() - TACTICS.syncFrom) * 0.06);

/** Host: some chasers become flankers (more of them deeper into the run). */
function assignFlank(enemy) {
  const tw = tacticsWave();
  if (isGuest() || enemy.type.boss || enemy.type.structure || enemy.type.ranged || tw < TACTICS.flankFrom) return;
  if (Math.random() > Math.min(0.85, 0.25 + (tw - TACTICS.flankFrom) * 0.08)) return;
  enemy.flank = (Math.random() < 0.5 ? -1 : 1) * (0.7 + Math.random());
}

function updateTactics(delta) {
  for (const tode of standingTodes()) {
    let motion = todeMotion.get(tode);
    if (!motion) todeMotion.set(tode, (motion = { last: tode.position.clone(), velocity: new THREE.Vector3() }));
    motionStep.subVectors(tode.position, motion.last).setZ(0).divideScalar(Math.max(delta, 1e-3));
    if (motionStep.lengthSq() > 1500 ** 2) motionStep.set(0, 0, 0); // a teleport, not a run
    motion.velocity.lerp(motionStep, 1 - Math.exp(-8 * delta));
    motion.last.copy(tode.position);
  }
  if (phase !== 'fighting') return;
  const tw = tacticsWave();
  tactics.sync = tw >= TACTICS.syncFrom;
  if (tactics.sync) tactics.volleyIn -= delta;
  if (tw >= TACTICS.pounceFrom && (tactics.pounceTimer -= delta) <= 0) {
    tactics.pounceTimer = Math.max(5, 12 - (tw - TACTICS.pounceFrom) * 0.5) * (0.8 + Math.random() * 0.4);
    startPounce(tw);
  }
  if (tw >= TACTICS.manoeuvreFrom && (tactics.manoeuvreTimer -= delta) <= 0) {
    tactics.manoeuvreTimer = Math.max(6, 14 - (tw - TACTICS.manoeuvreFrom) * 0.45) * (0.8 + Math.random() * 0.4);
    const pool = MANOEUVRES.filter((m) => tw >= m.from);
    const manoeuvre = pool[Math.floor(Math.random() * pool.length)];
    if (manoeuvre) ({ surround: startSurround, crossfire: startCrossfire, rolling: () => startPounce(tw, true) })[manoeuvre.id](tw);
  }
}

/** Chasers that are free to join a manoeuvre around `tode`, nearest first. */
function freeChasers(tode, range) {
  return aliveEnemies()
    .filter(
      (enemy) =>
        !enemy.type.boss && !enemy.type.structure && !enemy.type.ranged && enemy.kind !== 'nurse' && !enemy.ai.mode && !(enemy.marchLeft > 0) && !enemy.isFrozen &&
        distanceSqXY(enemy.position, tode.position) < range ** 2
    )
    .sort((a, b) => distanceSqXY(a.position, tode.position) - distanceSqXY(b.position, tode.position));
}

/** A pack spreads out in a ring around Tode, circles him, then collapses on him from every side at once. */
function startSurround(tw) {
  const todes = standingTodes();
  const tode = todes[Math.floor(Math.random() * todes.length)];
  if (!tode) return;
  const pack = freeChasers(tode, 520).slice(0, Math.min(12, 5 + Math.floor((tw - TACTICS.manoeuvreFrom) / 2)));
  if (pack.length < 4) return;
  const turn = Math.random() * Math.PI * 2;
  const spin = (Math.random() < 0.5 ? -1 : 1) * SURROUND.spin;
  pack.forEach((bee, i) => Object.assign(bee.ai, { mode: 'surround', timer: SURROUND.time, slot: turn + (i / pack.length) * Math.PI * 2, spin, tode }));
  play('roar');
  hud.showCallout('Circled!');
}

/** Stingers take posts around Tode, wind up together and fire at once: a crossfire. */
function startCrossfire(tw) {
  const todes = standingTodes();
  const tode = todes[Math.floor(Math.random() * todes.length)];
  if (!tode) return;
  const squad = aliveEnemies()
    .filter((enemy) => enemy.type.ranged && !enemy.type.boss && !enemy.isFrozen && !(enemy.postLeft > 0) && distanceSqXY(enemy.position, tode.position) < 650 ** 2)
    .slice(0, Math.min(6, 3 + Math.floor((tw - 6) / 4)));
  if (squad.length < 2) return;
  const turn = Math.random() * Math.PI * 2;
  squad.forEach((bee, i) => {
    bee.post = turn + (i / squad.length) * Math.PI * 2;
    bee.postLeft = CROSSFIRE.time;
    bee.postTode = tode;
  });
  play('charge');
  hud.showCallout('Stingers take aim!');
}

/** A pack near a Tode stops, marks its lines on the ground, then lunges all at once (`rolling`: one after another). */
function startPounce(tw, rolling = false) {
  const todes = standingTodes();
  const tode = todes[Math.floor(Math.random() * todes.length)];
  if (!tode) return;
  const pack = aliveEnemies()
    .filter(
      (enemy) =>
        !enemy.type.boss && !enemy.type.structure && !enemy.type.ranged && enemy.kind !== 'nurse' && !enemy.ai.mode && !(enemy.marchLeft > 0) && !enemy.isFrozen &&
        distanceSqXY(enemy.position, tode.position) < 380 ** 2 && distanceSqXY(enemy.position, tode.position) > 60 ** 2
    )
    .sort((a, b) => distanceSqXY(a.position, tode.position) - distanceSqXY(b.position, tode.position))
    .slice(0, Math.min(8, 3 + Math.floor((tw - TACTICS.pounceFrom) / 3)));
  if (pack.length < 2) return;
  // They aim a little ahead of where Tode is going.
  const velocity = todeMotion.get(tode)?.velocity;
  const aim = tode.position.clone();
  if (velocity) aim.addScaledVector(velocity, 0.5);
  pack.forEach((bee, i) => {
    const direction = new THREE.Vector3();
    const distance = directionTo(bee.position, aim, direction);
    const length = Math.min(distance + 80, 380);
    Object.assign(bee.ai, { mode: 'pounceWindup', timer: POUNCE.windup + (rolling ? i * 0.28 : 0), direction, length });
    bee.ai.telegraph = addTelegraph(bee.position, direction, length, bee.radius * 1.6);
    share({ k: 'tele', id: bee.netId, o: [bee.position.x, bee.position.y], d: [direction.x, direction.y], l: length, w: bee.radius * 1.6 });
  });
  play('charge');
  hud.showCallout(rolling ? 'Rolling strike!' : pack.length >= 5 ? 'The swarm strikes as one!' : 'Coordinated strike!');
}

/** Lines a bee up for a telegraphed lunge at `aim`. */
function windUpLunge(bee, aim, windup = POUNCE.windup) {
  const direction = new THREE.Vector3();
  const distance = directionTo(bee.position, aim, direction);
  const length = Math.min(distance + 90, 400);
  Object.assign(bee.ai, { mode: 'pounceWindup', timer: windup, direction, length });
  bee.ai.telegraph = addTelegraph(bee.position, direction, length, bee.radius * 1.6);
  share({ k: 'tele', id: bee.netId, o: [bee.position.x, bee.position.y], d: [direction.x, direction.y], l: length, w: bee.radius * 1.6 });
}

function updatePounce(enemy, delta) {
  const { ai } = enemy;
  ai.timer -= delta;
  if (ai.mode === 'surround') {
    // Fly to a slot on the ring and circle with it; when the time is up, everyone lunges at once.
    const tode = ai.tode;
    if (!tode || tode.downed) {
      ai.mode = null;
      return;
    }
    ai.slot += ai.spin * delta;
    flankPoint.set(tode.position.x + Math.cos(ai.slot) * SURROUND.radius, tode.position.y + Math.sin(ai.slot) * SURROUND.radius, 0);
    const distance = directionTo(enemy.position, flankPoint, chase);
    const speed = Math.min(enemy.speed * 1.6, distance * 6);
    enemy.faceTowards(tode.position);
    enemy.glowColor.set(0xff7a1f);
    enemy.glow = 0.25 + 0.25 * Math.sin(ai.timer * 12);
    moveEnemy(enemy, chase.x * speed, chase.y * speed, delta);
    if (ai.timer <= 0) {
      enemy.glow = 0;
      windUpLunge(enemy, tode.position, SURROUND.windup);
    }
    return;
  }
  if (ai.mode === 'pounceWindup') {
    enemy.faceDirection(ai.direction.x, ai.direction.y);
    enemy.glowColor.set(0xff3b1f);
    enemy.glow = 0.5 + 0.5 * Math.sin(ai.timer * 30);
    if (ai.telegraph) ai.telegraph.material.opacity = 0.35 + 0.2 * Math.sin(ai.timer * 30);
    moveEnemy(enemy, 0, 0, delta);
    if (ai.timer <= 0) {
      ai.mode = 'pounce';
      ai.timer = ai.length / POUNCE.speed;
      enemy.glow = 0;
      if (ai.telegraph) removeTelegraph(ai.telegraph);
      ai.telegraph = null;
      share({ k: 'teleOff', id: enemy.netId });
    }
  } else if (ai.mode === 'pounce') {
    moveEnemy(enemy, ai.direction.x * POUNCE.speed, ai.direction.y * POUNCE.speed, delta);
    if (Math.random() < 0.5) particles.burst(enemy.position, { count: 1, colors: DUST, speed: 20, up: 10, size: 1.6, height: 2 });
    if (ai.timer <= 0) {
      ai.mode = 'recover';
      ai.timer = POUNCE.recover;
    }
  } else {
    moveEnemy(enemy, 0, 0, delta);
    if (ai.timer <= 0) ai.mode = null;
  }
}

// --- Bee-zebub's hellfire ---------------------------------------------------------
const fireRings = [];
const FIRE_WALL_MATERIAL = new THREE.ShaderMaterial({
  uniforms: { time: { value: 0 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform float time;
    varying vec2 vUv;
    void main() {
      float flicker = 0.6 + 0.4 * sin(vUv.x * 160.0 + time * 9.0) * sin(vUv.x * 57.0 - time * 13.0);
      float height = 1.0 - vUv.y;
      float alpha = pow(height, 1.6) * (0.55 + 0.45 * flicker);
      vec3 color = mix(vec3(1.0, 0.25, 0.02), vec3(1.0, 0.85, 0.35), height * height);
      gl_FragColor = vec4(color, alpha * 0.9);
    }`,
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
});
const FIRE_WALL_GEOMETRY = new THREE.CylinderGeometry(1, 1, 1, 96, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5);

/** A ring of fire spreading from `origin`; everyone simulates it and only checks their own Tode. */
function launchFireRing(origin, speed = BRIMSTONE.speed) {
  const wall = new THREE.Mesh(FIRE_WALL_GEOMETRY, FIRE_WALL_MATERIAL);
  wall.position.set(origin.x, origin.y, 0);
  wall.scale.set(1, 1, BRIMSTONE.height);
  wall.frustumCulled = false;
  scene.add(wall);
  fireRings.push({ wall, origin: origin.clone().setZ(0), radius: 10, speed, hit: false });
  play('nova');
  shake = Math.max(shake, 6);
}

function updateFireRings(delta) {
  FIRE_WALL_MATERIAL.uniforms.time.value += delta;
  for (const ring of [...fireRings]) {
    ring.radius += ring.speed * delta;
    ring.wall.scale.set(ring.radius, ring.radius, BRIMSTONE.height);
    // Embers along the wall.
    for (let i = 0; i < 4; i++) {
      const angle = Math.random() * Math.PI * 2;
      particles.burst(ring.origin.clone().add(new THREE.Vector3(Math.cos(angle) * ring.radius, Math.sin(angle) * ring.radius, 0)), { count: 1, colors: FIRE, speed: 10, up: 70, gravity: -30, size: 2.4, glow: true, height: 4 });
    }
    // Only a hop-dash (or any other invulnerability) gets Tode through unharmed.
    const distance = Math.sqrt(distanceSqXY(player.position, ring.origin));
    if (!ring.hit && Math.abs(distance - ring.radius) < BRIMSTONE.band + player.radius * 0.5 && !player.downed && PLAYING.has(phase)) {
      if (hurtPlayer(1)) ring.hit = true;
      else if (player.isDashing) {
        ring.hit = true;
        hud.showCallout('Through the fire!');
      }
    }
    if (ring.radius > MAP_HALF_SIZE * 2.4) removeFireRing(ring);
  }
}

function removeFireRing(ring) {
  fireRings.splice(fireRings.indexOf(ring), 1);
  ring.wall.removeFromParent();
}

/** Flames lick up around Bee-zebub. */
function hellfireAura(boss) {
  if (Math.random() > 0.7) return;
  particles.burst(boss.position, { count: 2, colors: FIRE, ring: boss.radius * 0.7, speed: 12, up: 70, gravity: -50, size: 2.8, glow: true, height: boss.height * 0.25, life: 0.7 });
}

function updateQueen(boss, delta) {
  const { ai } = boss;
  // The enrage timer runs through everything (shields and staggers too): a race against the clock.
  const script = BOSS_SCRIPTS[boss.kind];
  ai.fightTime = (ai.fightTime ?? 0) + delta;
  if (script && !boss.enraged && ai.fightTime > script.enrage) enrageBoss(boss);
  hud.setBossTimer(script && !boss.enraged ? script.enrage - ai.fightTime : null);
  if (boss.enraged) {
    enrageAura(boss);
    if ((ai.rainTimer -= delta) <= 0) {
      ai.rainTimer = ENRAGE.rainEvery;
      stingerRain(boss);
    }
  }
  // The next stage starts as soon as its health fraction is crossed (see BOSS_SCRIPTS), or a strong build would burst
  // through the stages before they began: a shield goes up even mid-attack or mid-stagger. A mechanic that takes
  // over the boss's moves (a ritual, a blade storm) cuts its attack or stagger short (breaking a ritual staggers it
  // again), but waits for a ritual or blade storm that is already going. During a cataclysm only the stages without
  // circles of their own can start, so nobody has to tell two sets of circles apart.
  const stage = script?.stages[ai.stage ?? 0];
  const takesOver = stage && (stage[1] === 'interrupt' || stage[1] === 'blades');
  const occupied = ai.mode === 'interrupt' || ai.mode === 'blades';
  const waitsForCataclysm = cataclysm && stage && (takesOver || ['lights', 'soak', 'mark'].includes(stage[1]));
  if (stage && !raid && !waitsForCataclysm && !(takesOver && occupied) && boss.hp <= stage[0] * boss.maxHp) {
    if (takesOver) {
      ai.staggerLeft = 0;
      boss.glow = 0;
      if (ai.telegraph) {
        removeTelegraph(ai.telegraph); // a charge it was winding up
        ai.telegraph = null;
        share({ k: 'teleOff', id: boss.netId });
      }
    }
    startStage(boss, stage);
  }
  // Staggered after its shield broke: dazed, open to everything.
  if (ai.staggerLeft > 0) {
    ai.staggerLeft -= delta;
    moveEnemy(boss, 0, 0, delta);
    boss.glowColor.set(0xbff0ff);
    boss.glow = ai.staggerLeft > 0 ? 0.3 + 0.3 * Math.sin(ai.staggerLeft * 20) : 0;
    if (Math.random() < delta * 8) {
      particles.burst(boss.position, { count: 2, colors: ['#ffffff', '#ffe680'], ring: boss.radius * 0.5, speed: 20, up: 30, gravity: 0, size: 2, glow: true, height: boss.height, life: 0.6 });
    }
    hud.setBoss(boss);
    return;
  }
  const enraged = boss.hp < boss.maxHp / 2;
  const nextPhase = BOSS_PHASES[boss.kind]?.[ai.phase ?? 0];
  if (nextPhase && !boss.shielded && boss.hp / boss.maxHp < nextPhase) bossRoar(boss);
  // Shielded bosses attack a little less often: the wards are the job.
  const shieldCalm = boss.shielded ? 1.25 : 1;
  const delayScale =
    (boss.type.attackDelayScale ?? 1) * (enraged ? QUEEN.enragedDelayScale : 1) * shieldCalm * (ai.stageSpeed ?? 1) * (boss.enraged ? ENRAGE.attackScale : 1);
  const target = targetFor(boss.position, false);
  directionTo(boss.position, target, chase);

  switch (ai.mode) {
    case 'windup':
      ai.timer -= delta;
      boss.glow = 0.5 + 0.5 * Math.sin(ai.timer * 30);
      ai.telegraph.material.opacity = 0.5 + 0.2 * Math.sin(ai.timer * 30);
      moveEnemy(boss, 0, 0, delta);
      if (ai.timer <= 0) {
        ai.mode = 'charge';
        ai.timer = QUEEN.chargeDuration;
        boss.glow = 0;
        removeTelegraph(ai.telegraph);
        share({ k: 'teleOff', id: boss.netId });
      }
      break;
    case 'charge': {
      ai.timer -= delta;
      const before = boss.position.clone();
      moveEnemy(boss, ai.direction.x * QUEEN.chargeSpeed, ai.direction.y * QUEEN.chargeSpeed, delta);
      const stuck = before.distanceTo(boss.position) < QUEEN.chargeSpeed * delta * 0.3;
      if (ai.timer <= 0 || stuck) {
        ai.mode = 'recover';
        ai.timer = QUEEN.chargeRecover;
        if (stuck) shake = Math.max(shake, 7);
      }
      break;
    }
    case 'spiral':
      // Royal Spiral (two arms) and the Cross (four arms, turning the other way): bullets sweeping round.
      ai.timer -= delta;
      ai.spiralTick -= delta;
      boss.glow = 0.4 + 0.3 * Math.sin(ai.timer * 20);
      moveEnemy(boss, 0, 0, delta);
      while (ai.spiralTick <= 0) {
        const arms = ai.arms ?? 2;
        ai.spiralTick += arms > 2 ? 0.13 : 0.1;
        ai.spiralAngle += arms > 2 ? -0.24 : 0.38;
        for (let arm = 0; arm < arms; arm++) {
          const angle = ai.spiralAngle + (arm / arms) * Math.PI * 2;
          fireStinger(boss, fanDirection.set(Math.cos(angle), Math.sin(angle), 0), 160, arm > 0);
        }
      }
      if (ai.timer <= 0) {
        boss.glow = 0;
        ai.mode = 'chase';
        ai.timer = QUEEN.attackDelay * delayScale;
      }
      break;
    case 'volley':
      // A stream of aimed fans.
      ai.timer -= delta;
      boss.glow = 0.5;
      moveEnemy(boss, chase.x * boss.speed * 0.4, chase.y * boss.speed * 0.4, delta);
      if (ai.timer <= 0) {
        ai.timer = 0.16;
        fireFan(boss, Math.atan2(chase.y, chase.x) + (Math.random() - 0.5) * 0.15, 3 + (ai.phase ?? 0), 0.3, 300);
        if (--ai.shotsLeft <= 0) {
          boss.glow = 0;
          ai.mode = 'chase';
          ai.timer = QUEEN.attackDelay * delayScale;
        }
      }
      break;
    case 'halo':
      // Slow, dense rings of bullets to weave through, each one twisted a little.
      ai.timer -= delta;
      boss.glow = 0.6;
      moveEnemy(boss, 0, 0, delta);
      if (ai.timer <= 0) {
        ai.timer = 0.45;
        ai.haloTwist = (ai.haloTwist ?? 0) + 0.11;
        fireRing(boss, 18 + 4 * (ai.phase ?? 0), 105, ai.haloTwist);
        play('nova');
        if (--ai.ringsLeft <= 0) {
          boss.glow = 0;
          ai.mode = 'chase';
          ai.timer = QUEEN.attackDelay * delayScale;
        }
      }
      break;
    case 'brimstone':
      // Gathers hellfire, then lets the rings go one after another.
      ai.timer -= delta;
      moveEnemy(boss, 0, 0, delta);
      boss.glow = 0.5 + 0.5 * Math.sin(ai.timer * 24);
      if (ai.timer > 0) {
        particles.burst(boss.position, { count: 3, colors: FIRE, ring: 140, speed: -260, up: 20, size: 2.2, glow: true, height: 10 });
      } else if (ai.ringsLeft > 0) {
        ai.ringsLeft--;
        ai.timer = 0.75;
        launchFireRing(boss.position);
        share({ k: 'fring', o: [boss.position.x, boss.position.y] });
      } else {
        boss.glow = 0;
        ai.mode = 'recover';
        ai.timer = QUEEN.chargeRecover;
      }
      break;
    case 'pillars':
      // Hellfire pillars chase Tode.
      ai.timer -= delta;
      boss.glow = 0.4;
      moveEnemy(boss, 0, 0, delta);
      if (ai.timer <= 0) {
        ai.timer = 0.32;
        ai.pillarsLeft--;
        const spot = targetFor(boss.position, false).clone().add(new THREE.Vector3((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, 0));
        sharedStrike(spot, { damage: 0, radius: 44, delay: 0.75, hurtsPlayer: true, hitsBees: false, color: '#ff4a10', from: spot.clone().setZ(500) });
        if (ai.pillarsLeft <= 0) {
          boss.glow = 0;
          ai.mode = 'chase';
          ai.timer = QUEEN.attackDelay * delayScale;
        }
      }
      break;
    case 'recover':
      ai.timer -= delta;
      moveEnemy(boss, 0, 0, delta);
      if (ai.timer <= 0) {
        ai.mode = 'chase';
        ai.timer = QUEEN.attackDelay * delayScale;
      }
      break;
    case 'interrupt': {
      // Channelling a ritual: only enough damage in time breaks it (the bar is updateRitual).
      ai.timer -= delta;
      moveEnemy(boss, 0, 0, delta);
      boss.glow = 0.5 + 0.5 * Math.sin(ai.timer * 12);
      const result = ritualResult(boss);
      if (result === null) break;
      share({ k: 'brkOff', ok: result });
      endRitual(result);
      if (result) {
        ai.staggerLeft = INTERRUPT.stagger;
      } else {
        boss.hp = Math.min(boss.maxHp, boss.hp + boss.maxHp * INTERRUPT.heal);
        ai.stageSpeed = (ai.stageSpeed ?? 1) * 0.85; // empowered for the rest of the fight
        fireRing(boss, 28, 170, Math.random());
      }
      boss.glow = 0;
      ai.mode = 'recover';
      ai.timer = 0.8;
      break;
    }
    case 'blades':
      // Standing still at the heart of the Blade Storm (updateBlades runs the blades).
      ai.timer -= delta;
      moveEnemy(boss, 0, 0, delta);
      boss.glowColor.set(0xffb000);
      boss.glow = 0.4 + 0.3 * Math.sin(ai.timer * 15);
      if (ai.timer <= 0) {
        boss.glow = 0;
        ai.mode = 'recover';
        ai.timer = 0.6;
      }
      break;
    case 'channel':
      // Gathering the cataclysm: power pours in from the whole arena (the blast itself is updateCataclysm).
      ai.timer -= delta;
      moveEnemy(boss, 0, 0, delta);
      boss.glow = Math.min(1, 1 - ai.timer / CATACLYSM.channel + 0.2);
      particles.burst(boss.position, { count: 3, colors: boss.type.hellfire ? FIRE : ['#ffffff', '#fff1b8', '#ffd36b'], ring: 260, speed: -420, up: 30, size: 2.4, glow: true, height: 12, life: 0.6 });
      if (ai.timer <= 0) {
        boss.glow = 0;
        ai.mode = 'recover';
        ai.timer = 1.2;
      }
      break;
    default:
      ai.mode = 'chase';
      ai.timer ??= QUEEN.attackDelay;
      boss.faceTowards(target);
      moveEnemy(boss, chase.x * boss.speed, chase.y * boss.speed, delta);
      if (!boss.isFrozen) ai.timer -= delta;
      if (ai.timer <= 0) {
        // A stage's repeating mechanic comes before the usual attacks.
        const mechanic = dueMechanic(boss);
        if (mechanic) {
          castMechanic(boss, mechanic);
          if (ai.mode === 'chase') ai.timer = QUEEN.attackDelay * delayScale;
        } else {
          startQueenAttack(boss, enraged, delayScale);
        }
      }
  }
  hud.setBoss(boss);
}

function startQueenAttack(boss, enraged, delayScale) {
  const { ai } = boss;
  const empress = boss.kind === 'empress';
  const hellish = boss.type.hellfire;
  const minions = aliveEnemies().length - 1;
  const phaseNo = ai.phase ?? 0;
  const summon = minions < QUEEN.maxMinions ? 'summon' : 'nova';
  const rain = ai.rain ? ['rain'] : [];
  const ATTACKS = {
    queen: ['charge', 'nova', 'fan', summon, ...rain],
    shogun: ['charge', 'charge', 'fan', 'volley', summon, ...(phaseNo >= 1 ? ['cross'] : [])],
    seraph: ['halo', 'nova', 'volley', 'spiral', summon, ...rain],
    empress: ['charge', 'nova', 'spiral', 'halo', 'cross', summon, ...rain],
    beezebub: ['charge', 'nova', summon, 'brimstone', 'brimstone', 'pillars', 'volley', 'halo', ...rain, ...(phaseNo >= 2 ? ['spiral', 'cross'] : [])],
  };
  // The cataclysm needs the arena to itself: not during a shield, and not too often.
  const cataReady = !raid && !cataclysm && timeAlive - (ai.lastCata ?? -99) > CATACLYSM.cooldown;
  const CATACLYSMS = { seraph: phaseNo >= 1, empress: true, beezebub: true };
  if (CATACLYSMS[boss.kind] && cataReady) ATTACKS[boss.kind].push('cataclysm');
  const attacks = (ATTACKS[boss.kind] ?? ATTACKS.queen).filter((a) => a !== ai.last);
  const attack = attacks[Math.floor(Math.random() * attacks.length)];
  ai.last = attack;
  ai.timer = QUEEN.attackDelay * delayScale;

  if (attack === 'cataclysm') {
    ai.mode = 'channel';
    ai.timer = CATACLYSM.channel;
    ai.lastCata = timeAlive;
    boss.glowColor.set(boss.type.hellfire ? 0xff3b1f : 0xfff1b8);
    const spots = cataclysmSpots();
    startCataclysm(boss, spots);
    share({ k: 'cata', id: boss.netId, s: spots.map((p) => [Math.round(p.x), Math.round(p.y)]) });
  } else if (attack === 'charge') {
    ai.mode = 'windup';
    ai.timer = QUEEN.chargeWindup;
    ai.direction = chase.clone();
    boss.faceDirection(chase.x, chase.y);
    boss.glowColor.set(0xff3b1f);
    const length = QUEEN.chargeSpeed * QUEEN.chargeDuration;
    ai.telegraph = addTelegraph(boss.position, ai.direction, length, boss.radius * 1.6);
    share({ k: 'tele', id: boss.netId, o: [boss.position.x, boss.position.y], d: [ai.direction.x, ai.direction.y], l: length, w: boss.radius * 1.6 });
    play('charge');
  } else if (attack === 'rain') {
    stingerRain(boss);
  } else if (attack === 'brimstone') {
    ai.mode = 'brimstone';
    ai.timer = BRIMSTONE.windup;
    ai.ringsLeft = 1 + (ai.phase ?? 0);
    boss.glowColor.set(0xff4a10);
    play('charge');
    hud.showCallout('Brimstone Ring! Hop through it!');
  } else if (attack === 'pillars') {
    ai.mode = 'pillars';
    ai.timer = 0.2;
    ai.pillarsLeft = 5 + 2 * (ai.phase ?? 0);
    boss.glowColor.set(0xff4a10);
    play('roar');
  } else if (attack === 'fan') {
    fireFan(boss, Math.atan2(chase.y, chase.x), 9 + 2 * phaseNo, 1.2, 270);
    shake = Math.max(shake, 4);
    play('nova');
  } else if (attack === 'volley') {
    ai.mode = 'volley';
    ai.timer = 0.3;
    ai.shotsLeft = 6 + 2 * phaseNo;
    boss.glowColor.set(0xffd36b);
    play('charge');
  } else if (attack === 'halo') {
    ai.mode = 'halo';
    ai.timer = 0.3;
    ai.ringsLeft = 3 + phaseNo;
    boss.glowColor.set(0xfff1b8);
    play('charge');
  } else if (attack === 'cross') {
    ai.mode = 'spiral';
    ai.arms = 4;
    ai.timer = 2.6;
    ai.spiralTick = 0;
    ai.spiralAngle = Math.random() * Math.PI;
    boss.glowColor.set(0xffd36b);
    play('roar');
    hud.showCallout('Bullet Cross!');
  } else if (attack === 'spiral') {
    ai.mode = 'spiral';
    ai.arms = 2;
    ai.timer = 2.6;
    ai.spiralTick = 0;
    ai.spiralAngle = Math.random() * Math.PI;
    boss.glowColor.set(0xc070ff);
    play('roar');
    hud.showCallout(hellish ? 'Infernal Spiral!' : 'Royal Spiral!');
  } else if (attack === 'nova') {
    const count = (enraged ? QUEEN.enragedNovaCount : QUEEN.novaCount) + (empress ? 8 : 0) + (hellish ? 12 : 0);
    const offset = Math.random() * Math.PI;
    for (let i = 0; i < count; i++) {
      const angle = offset + (i / count) * Math.PI * 2;
      fireStinger(boss, new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0), QUEEN.novaSpeed);
    }
    shake = Math.max(shake, 4);
    play('nova');
  } else {
    play('boss');
    for (let i = 0; i < QUEEN.summonCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spot = boss.position.clone().add(new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0).multiplyScalar(boss.radius + 25));
      const kind = hellish ? (i === 0 ? 'brute' : 'stinger') : boss.kind === 'shogun' ? (i === 0 ? 'brute' : 'drone') : boss.kind === 'seraph' ? 'stinger' : empress && i === 0 ? 'brute' : 'zipper';
      spawnEnemy(kind, spot);
    }
  }
}

function addTelegraph(origin, direction, length, width) {
  const geometry = new THREE.PlaneGeometry(length, width);
  geometry.translate(length / 2, 0, 0);
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ color: 0xff1a1a, transparent: true, opacity: 0.5, depthWrite: false })
  );
  mesh.position.set(origin.x, origin.y, 0.5);
  mesh.rotation.z = Math.atan2(direction.y, direction.x);
  scene.add(mesh);
  telegraphs.push(mesh);
  return mesh;
}

function removeTelegraph(mesh) {
  const index = telegraphs.indexOf(mesh);
  if (index < 0) return;
  telegraphs.splice(index, 1);
  mesh.removeFromParent();
  mesh.geometry.dispose();
  mesh.material.dispose();
}

/** Guests: bees follow the host's snapshots; only contact with our own Tode is checked here. */
function updateMirrors(delta) {
  const follow = 1 - Math.exp(-12 * delta);
  for (const enemy of [...enemies]) {
    enemy.update(delta);
    if (enemy.enraged && !enemy.dying) enrageAura(enemy);
    if (enemy.netTarget) enemy.position.lerp(enemy.netTarget, follow);
    if (enemy.dying) {
      if (enemy.isGone) removeEnemy(enemy);
      continue;
    }
    updateShatter(enemy, delta);
    if (!player.downed) checkContact(enemy);
    if (phase === 'gameover') return;
  }
}

function updateShatter(enemy, delta) {
  if (!(enemy.shatterLeft > 0) || enemy.dying) return;
  enemy.shatterLeft -= delta;
  if (enemy.shatterLeft <= 0) {
    particles.burst(enemy.position, { count: 14, colors: ICE, speed: 120, up: 90, size: 1.6, glow: true });
    play('pop');
    damageEnemy(enemy, player.stats.freezeDash, null, 0, 'frost');
  }
}

function updateStatuses(enemy, delta) {
  if (enemy.burnLeft > 0) {
    enemy.burnTick -= delta;
    if (enemy.burnTick <= 0) {
      enemy.burnTick = 1 / enemy.burnDps;
      particles.burst(enemy.position, { count: 3, colors: FIRE, speed: 20, up: 60, gravity: -30, size: 1.3, height: enemy.height * 0.5, glow: true });
      damageEnemy(enemy, 1, null, 0, 'burn');
    }
  }
  updateShatter(enemy, delta);
}

function updateEnemies(delta) {
  for (const enemy of enemies) if (enemy.type.hellfire && !enemy.dying) hellfireAura(enemy);
  updateFireRings(delta);
  if (isGuest()) {
    updateMirrors(delta);
    return;
  }
  updateTactics(delta);
  for (const enemy of [...enemies]) {
    enemy.update(delta);
    if (enemy.dying) {
      if (enemy.isGone) removeEnemy(enemy);
      continue;
    }
    updateStatuses(enemy, delta);
    if (enemy.dying) continue;

    if (enemy.type.structure) {
      if (!enemy.type.ward) updateNest(enemy, delta);
      continue; // hives and wards don't move or bite
    }
    if (enemy.kind === 'nurse') {
      updateNurse(enemy, delta);
      continue; // nurses never bite: they only heal
    }
    if (enemy.type.boss) updateQueen(enemy, delta);
    else if (enemy.type.ranged) updateStinger(enemy, delta);
    else updateChaser(enemy, delta);

    checkContact(enemy);
    if (phase === 'gameover') return;
  }
  // Every stinger has fired its synchronized volley this frame: wind up the next one.
  if (tactics.sync && tactics.volleyIn <= 0) tactics.volleyIn += syncCooldown();
}

function updateEnemyProjectiles(delta) {
  const limit = MAP_HALF_SIZE + 80;
  const reach = player.radius * 0.7; // a forgiving hitbox: bullet-hell games hit on the core only
  bullets.update(delta, (bullet) => {
    // Out of the arena and flying away from it (arena events start some bullets outside and fly them in).
    if ((Math.abs(bullet.x) > limit && bullet.x * bullet.dx > 0) || (Math.abs(bullet.y) > limit && bullet.y * bullet.dy > 0)) {
      bullet.dead = true;
      return;
    }
    if (player.isInvulnerable || player.downed || phase === 'gameover') return;
    if ((bullet.x - player.position.x) ** 2 + (bullet.y - player.position.y) ** 2 < (bullet.radius * 0.8 + reach) ** 2) {
      bullet.dead = true;
      hurtPlayer(bullet.damage);
    }
  });
}

// --- Abilities ---
function spit() {
  const { stats } = player;
  player.rig?.flick();
  spitCooldownLeft = stats.spitCooldown;
  spitShots++;
  play('spit');
  const center = aimAssist(player.facing, stats.spitRange);

  // Matcha Thunder: every few spits, a bolt of chain lightning.
  if (stats.boltEvery && spitShots % stats.boltEvery === 0) {
    effects.chain(player.position, 4, Math.max(3, stats.spitDamage * 2), { range: 280 });
  }

  spitVolley(center);
  // Echo Bell: sometimes a second volley right behind the first.
  if (charms('bell') && Math.random() < Math.min(1, 0.2 * charms('bell'))) echoDelay = 0.08;
}

let echoDelay = 0; // seconds until an Echo Bell volley (0: none)

function spitVolley(center) {
  const { stats } = player;
  for (let i = 0; i < stats.spitCount; i++) {
    const angle = (i - (stats.spitCount - 1) / 2) * stats.spitSpread;
    const direction = center.clone().applyAxisAngle(Z_AXIS, angle);
    fireSpit(player.position.clone().addScaledVector(direction, player.radius), direction, stats.spitDamage);
  }
}

function fireSpit(origin, direction, damage, { child = false, hits } = {}) {
  const { stats } = player;
  const range = stats.spitRange * (weather.info.spitRange ?? 1);
  const [color, emissive] = SPIT_LOOKS[ascension.tier];
  const projectile = new Projectile(origin, direction, {
    speed: stats.spitSpeed,
    range: child ? range * 0.45 : range,
    damage,
    pierce: child ? 0 : stats.spitPierce,
    radius: (child ? 2.5 : 3.5) * (1 + 0.08 * ascension.tier),
    color,
    emissive,
    shape: stats.spitStyle,
  });
  projectile.homing = stats.spitHoming;
  projectile.trail = settings.calmFx ? null : stats.spitStyle === 'bolt' ? BOLT_TRAIL : SPIT_TRAILS[ascension.tier];
  projectile.child = child;
  if (hits) hits.forEach((enemy) => projectile.hits.add(enemy));
  projectiles.push(projectile);
  scene.add(projectile.mesh);
  share({ k: 'spit', o: [origin.x, origin.y], d: [direction.x, direction.y], s: projectile.speed, r: projectile.range, rad: projectile.radius, st: stats.spitStyle });
}
const BOLT_TRAIL = ['#e0d0ff', '#b48cff', '#ffffff'];

/** A teammate's spit: it flies and splatters, but the damage is done on their side. */
function visualSpit(origin, direction, speed, range, radius, shape = null) {
  const projectile = new Projectile(origin, direction, { speed, range, damage: 0, radius, shape });
  projectile.visual = true;
  projectiles.push(projectile);
  scene.add(projectile.mesh);
}

/** Nudges the shot toward the enemy closest to the aim direction, if one is near it. */
function aimAssist(direction, range) {
  let best = null;
  let bestAngle = AIM_ASSIST_ANGLE;
  for (const enemy of enemies) {
    if (enemy.dying || enemy.shielded) continue;
    away.subVectors(enemy.position, player.position).setZ(0);
    const distance = away.length();
    if (distance > range || distance < 1) continue;
    const angle = away.angleTo(direction);
    if (angle < bestAngle) {
      bestAngle = angle;
      best = enemy;
    }
  }
  if (!best) return direction.clone();
  return best.position.clone().sub(player.position).setZ(0).normalize();
}

function removeFrom(list, projectile) {
  list.splice(list.indexOf(projectile), 1);
  projectile.dispose();
}

/** Everything a spit hit can trigger, depending on the brews. */
function onSpitHit(target, projectile) {
  const { stats } = player;
  particles.burst(projectile.position, { count: 5, colors: SPIT_DROPS, speed: 60, up: 50, size: 1.3, height: 0 });
  if (stats.spitSlow) target.applySlow(stats.spitSlow, 2);
  if (stats.spitBurn) target.applyBurn(stats.spitBurn, 3);
  if (stats.spitChain) {
    effects.chain(target.position, stats.spitChain, Math.max(1, Math.round(stats.spitDamage * 0.6)), {
      hit: new Set([target]),
    });
  }
  if (stats.spitBurst && !projectile.child) {
    effects.blast(projectile.position.clone().setZ(0), {
      radius: stats.burstRadius,
      damage: stats.spitBurst,
      knockback: 60,
      color: '#c8f77a',
      particleColors: SPIT_DROPS,
      source: 'burst',
    });
  }
  // Geyser Spit: split into three smaller spits.
  if (stats.spitSplit && !projectile.child) {
    for (const angle of [-SPLIT_ANGLE, 0, SPLIT_ANGLE]) {
      const direction = projectile.direction.clone().applyAxisAngle(Z_AXIS, angle);
      fireSpit(projectile.position.clone(), direction, Math.max(1, Math.round(projectile.damage * 0.5)), {
        child: true,
        hits: projectile.hits,
      });
    }
  }
  if (stats.spitHealEvery && ++spitHits >= stats.spitHealEvery && timeAlive - lastLifesteal >= LIFESTEAL_COOLDOWN) {
    spitHits = 0;
    lastLifesteal = timeAlive;
    healPlayer(1);
  }
}

const steerTo = new THREE.Vector3();
/** The Mage's bolts curve toward the nearest bee they haven't hit, if it's roughly ahead. */
function steer(projectile, delta) {
  let best = null;
  let bestDistance = 260 ** 2;
  for (const enemy of targetable()) {
    if (projectile.hits.has(enemy)) continue;
    const distance = distanceSqXY(enemy.position, projectile.position);
    if (distance > bestDistance) continue;
    steerTo.subVectors(enemy.position, projectile.position).setZ(0);
    if (steerTo.dot(projectile.direction) < 0) continue; // not behind it
    best = enemy;
    bestDistance = distance;
  }
  if (!best) return;
  steerTo.subVectors(best.position, projectile.position).setZ(0).normalize();
  projectile.direction.lerp(steerTo, 1 - Math.exp(-7 * projectile.homing * delta)).normalize();
}

function updateProjectiles(delta) {
  for (const projectile of [...projectiles]) {
    if (projectile.homing) steer(projectile, delta);
    projectile.update(delta);
    if (projectile.trail && Math.random() < 0.6) {
      particles.burst(projectile.position.clone().setZ(0), {
        count: 1,
        colors: projectile.trail,
        speed: 8,
        up: 0,
        gravity: 0,
        height: projectile.position.z,
        size: 1.4,
        life: 0.3,
        glow: true,
      });
    }
    const target = enemies.find(
      (enemy) =>
        !enemy.dying &&
        !projectile.hits.has(enemy) &&
        distanceSqXY(enemy.position, projectile.position) < (enemy.radius + projectile.radius) ** 2
    );
    if (target && projectile.visual) {
      particles.burst(projectile.position, { count: 4, colors: SPIT_DROPS, speed: 50, up: 40, size: 1.2, height: 0 });
      removeFrom(projectiles, projectile);
      continue;
    }
    if (target) {
      projectile.hits.add(target);
      damageEnemy(target, projectile.damage, projectile.direction, SPIT_KNOCKBACK, 'spit');
      onSpitHit(target, projectile);
    }

    const used = target && projectile.hits.size > projectile.pierce;
    const blocked = !isInsideMap(projectile.position, -40);
    if (blocked) particles.burst(projectile.position, { count: 4, colors: SPIT_DROPS, speed: 40, up: 30, size: 1.2, height: 0 });
    if (used || blocked || projectile.isSpent) removeFrom(projectiles, projectile);
  }
}

function splash(center, { radius, damage, knockback, color = SPLASH_COLOR, shakeAmount = SPLASH_SHAKE, burn = 0, slow = 0 }) {
  shake = Math.max(shake, shakeAmount);
  splashVisual(center, radius, color);
  share({ k: 'splash', p: [center.x, center.y], r: radius, c: color });

  // The wave of tea washes incoming stingers away.
  for (const bullet of bullets.cancel(center, radius)) {
    particles.burst(next.set(bullet.x, bullet.y, 0), { count: 2, colors: TEA_DROPS, speed: 40, up: 30, size: 1.2 });
  }

  for (const enemy of [...enemies]) {
    if (enemy.dying) continue;
    const distance = directionTo(center, enemy.position, away);
    if (distance > radius + enemy.radius * 0.5) continue;
    if (burn) enemy.applyBurn(burn, 3);
    if (slow) enemy.applySlow(slow, 2.5);
    damageEnemy(enemy, damage, away, knockback, 'splash');
  }
}

/** The look and sound of a splash: tea bombs, kettle landings, and teammates' splashes. */
function splashVisual(center, radius, color = SPLASH_COLOR) {
  play('splash');
  particles.burst(center, { count: Math.round(radius / 3), colors: TEA_DROPS, speed: radius * 2.2, up: 110, size: 1.8, height: 3, ring: radius * 0.25 });
  const ring = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 48),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, depthWrite: false })
  );
  ring.position.set(center.x, center.y, 0.25);
  scene.add(ring);
  splashEffects.push({ ring, age: 0 });
}

// --- Tea Bomb: a boiling kettle bomb that throws itself at the thickest crowd, exploding into a splash ---
const BOMB_RANGE = 430;
const BOMB_ARC = 110; // peak height of the throw
const bombs = []; // { mesh, from, to, age, flight, own }
let bombCharges = 0;
const bombGeometry = new THREE.SphereGeometry(7, 16, 12);
const bombMaterial = new THREE.MeshStandardMaterial({ color: '#c98a2b', emissive: '#ff9a2a', emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.3 });

/** Where to throw: the thickest crowd in range (at least 3 bees, a boss counts for 3), or nowhere yet. */
function bombTarget() {
  const radius = player.stats.splashRadius * (weather.info.splashRadius ?? 1);
  let best = null;
  let bestScore = 0;
  const bees = targetable();
  for (const bee of bees) {
    if (distanceSqXY(bee.position, player.position) > BOMB_RANGE ** 2) continue;
    const score = bees.filter((other) => distanceSqXY(other.position, bee.position) < radius ** 2).length + (bee.type.boss ? 3 : 0);
    if (score > bestScore) [best, bestScore] = [bee, score];
  }
  return bestScore >= 3 ? best.position.clone().setZ(0) : null;
}

function throwBomb(target) {
  bombCharges--;
  if (splashCooldownLeft === 0) splashCooldownLeft = player.stats.splashCooldown;
  launchBomb(player.position, target, true);
  share({ k: 'bomb', o: [player.position.x, player.position.y], t: [target.x, target.y] });
  play('whistle');
}

/** A bomb in flight; only our own (`own`) explodes for real, teammates' are visuals (their splash arrives too). */
function launchBomb(from, to, own) {
  const mesh = new THREE.Mesh(bombGeometry, bombMaterial);
  mesh.castShadow = true;
  scene.add(mesh);
  const distance = Math.sqrt(distanceSqXY(from, to));
  bombs.push({ mesh, from: from.clone().setZ(0), to: to.clone().setZ(0), age: 0, flight: 0.28 + distance / 1100, own });
}

function updateBombs(delta) {
  for (const bomb of [...bombs]) {
    bomb.age += delta;
    const t = Math.min(1, bomb.age / bomb.flight);
    bomb.mesh.position.lerpVectors(bomb.from, bomb.to, t);
    bomb.mesh.position.z = 12 + Math.sin(t * Math.PI) * BOMB_ARC * Math.min(1, bomb.flight * 2);
    bomb.mesh.rotation.x += delta * 12;
    bomb.mesh.rotation.y += delta * 9;
    particles.burst(bomb.mesh.position, { count: 1, colors: ['#ffffff', '#f3d29a'], speed: 10, up: 20, size: 1.6, height: 0, life: 0.4, gravity: -30 });
    if (t >= 1) {
      bombs.splice(bombs.indexOf(bomb), 1);
      bomb.mesh.removeFromParent();
      if (bomb.own) teaBlast(bomb.to);
    }
  }
}

/** The explosion: a splash where the bomb lands, with all its brews. */
function teaBlast(center) {
  const { stats } = player;
  const radius = stats.splashRadius * (weather.info.splashRadius ?? 1);
  // The Alchemist's brews bubble over: fire, frost or lightning, at random.
  const element = stats.bombElements ? ['fire', 'frost', 'storm'][Math.floor(Math.random() * 3)] : null;
  splash(center, {
    radius,
    damage: stats.splashDamage,
    knockback: stats.splashKnockback,
    burn: stats.splashBurn + (element === 'fire' ? 2 : 0),
    slow: Math.max(stats.splashSlow, element === 'frost' ? 0.6 : 0),
    color: { fire: '#ff6a3d', frost: '#8fdcff', storm: '#c8b0ff' }[element],
  });
  if (element === 'storm') {
    aliveEnemies()
      .filter((enemy) => distanceSqXY(enemy.position, center) < (radius * 1.6) ** 2)
      .slice(0, 3)
      .forEach((enemy, i) => sharedStrike(enemy.position, { damage: Math.max(4, Math.round(stats.splashDamage * 0.75)), radius: 30, delay: 0.05 * i }));
  }
  if (element) particles.burst(center, { count: 20, colors: { fire: FIRE, frost: ICE, storm: ['#ffffff', '#c8b0ff', '#9fb8ff'] }[element], speed: 160, up: 140, size: 2, glow: true });
  effects.ring(center, { radius: radius * 1.15, color: '#fff1d0', duration: 0.45, thickness: 0.15 });
  particles.burst(center, { count: 24, colors: ['#ffffff', '#f3eadf', '#e8dcc8'], speed: 60, up: 180, size: 3, height: 4, gravity: -60, life: 0.9 });
  postfx.pulse({ bloom: 0.4, aberration: 0.25 });
  play('boom');

  // Thunder Splash: lightning on the nearest bees.
  if (stats.splashBolts) {
    aliveEnemies()
      .filter((enemy) => enemy.position.distanceTo(center) < radius * 2)
      .sort((a, b) => distanceSqXY(a.position, center) - distanceSqXY(b.position, center))
      .slice(0, stats.splashBolts)
      .forEach((enemy, i) =>
        sharedStrike(enemy.position, { damage: Math.max(4, stats.splashDamage), radius: 30, delay: 0.05 * i })
      );
  }
  // Volcano Pot: a lingering pool of lava.
  if (stats.lavaPool) {
    effects.pool(center, { radius: radius * 0.8, dps: stats.lavaPool, duration: 3, color: '#ff4a10', opacity: 0.5, particleColors: FIRE });
  }
}

function kettleLanding() {
  const level = player.stats.landingSplash;
  splash(player.position, {
    radius: LANDING_SPLASH_RADIUS + level * 15,
    damage: Math.round(2 * level),
    knockback: 200,
    color: 0xf0c060,
    shakeAmount: 3,
  });
}

function tryDash(direction) {
  if (hexLeft > CURSED.hex - CURSED.hexNoDash) return; // a fresh hex holds Tode's legs for a moment
  const from = player.position.clone();
  if (!player.startDash(direction)) return;
  play('dash');
  particles.burst(player.position, { count: 8, colors: DUST, speed: 50, up: 25, size: 2, height: 1 });
  // The Ninja vanishes in smoke and leaves a decoy where he stood.
  if (player.stats.dashDecoy) {
    placeDecoy(from);
    share({ k: 'decoy', p: [Math.round(from.x), Math.round(from.y)] });
  }
  const { dashHealEvery } = player.stats;
  if (dashHealEvery && player.dashes % dashHealEvery === 0) healPlayer(1);
}

function tryUltimate() {
  if (!player.ultimate || player.gauge < 100 || ultimateEffect) return;
  player.gauge = 0;
  ultimateEffect = startUltimate(player.ultimate, ctx);
  share({ k: 'ult', id: player.ultimate, a: [ctx.aimGround.x, ctx.aimGround.y] });
}

function updateSplashEffects(delta) {
  for (const effect of [...splashEffects]) {
    effect.age += delta;
    const t = effect.age / SPLASH_EFFECT_DURATION;
    if (t >= 1) {
      removeSplashEffect(effect);
      continue;
    }
    effect.ring.scale.setScalar(0.3 + 0.7 * Math.sqrt(t));
    effect.ring.material.opacity = 0.75 * (1 - t);
  }
}

function removeSplashEffect(effect) {
  splashEffects.splice(splashEffects.indexOf(effect), 1);
  effect.ring.removeFromParent();
  effect.ring.geometry.dispose();
  effect.ring.material.dispose();
}

// --- Brews that keep working on their own -------------------------------------
const orbitLeaves = new THREE.Group();
scene.add(orbitLeaves);
const orbitCooldowns = new WeakMap();
let orbitAngle = 0;

const stormCloud = new THREE.Group();
for (const [x, y, z, r] of [
  [0, 0, 0, 22],
  [20, 6, -3, 16],
  [-19, -4, -2, 17],
  [6, -16, 2, 14],
  [-6, 15, 3, 13],
]) {
  const puff = new THREE.Mesh(
    new THREE.IcosahedronGeometry(r, 1),
    new THREE.MeshStandardMaterial({ color: '#5a5f78', emissive: '#4a5cff', emissiveIntensity: 0, flatShading: true, transparent: true, opacity: 0.7, depthWrite: false })
  );
  puff.position.set(x, y, z);
  stormCloud.add(puff);
}
stormCloud.scale.setScalar(0.6);
stormCloud.visible = false;
scene.add(stormCloud);
const cloudTarget = new THREE.Vector3();

function updatePowers(delta) {
  const { stats } = player;

  // Sparkling Leaves orbit Tode and zap what they touch.
  while (orbitLeaves.children.length < stats.orbitLeaves) {
    const leaf = new THREE.Mesh(new THREE.OctahedronGeometry(4, 0), new THREE.MeshBasicMaterial({ color: '#d8e0ff', fog: false }));
    leaf.scale.set(1, 0.5, 0.3);
    orbitLeaves.add(leaf);
  }
  orbitAngle += delta * 3.2;
  const now = clock.elapsedTime;
  orbitLeaves.children.forEach((leaf, i) => {
    const angle = orbitAngle + (i / orbitLeaves.children.length) * Math.PI * 2;
    leaf.position.set(player.position.x + Math.cos(angle) * ORBIT_RADIUS, player.position.y + Math.sin(angle) * ORBIT_RADIUS, 12);
    leaf.rotation.set(now * 4, 0, angle);
    for (const enemy of aliveEnemies()) {
      if (distanceSqXY(enemy.position, leaf.position) > (enemy.radius + 7) ** 2) continue;
      if ((orbitCooldowns.get(enemy) ?? 0) > now) continue;
      orbitCooldowns.set(enemy, now + ORBIT_HIT_INTERVAL);
      effects.bolt(leaf.position.clone(), enemy.position.clone().setZ(10), { width: 1.5, life: 0.12 });
      lightningHit(enemy);
      damageEnemy(enemy, ORBIT_DAMAGE, null, 0, 'lightning');
    }
  });

  // Eye of the Storm: a cloud that follows Tode and strikes bees.
  stormCloud.visible = stats.stormCloud > 0 && player.group.visible;
  if (stormCloud.visible) {
    cloudTarget.set(player.position.x + 10, player.position.y - 10, 95);
    stormCloud.position.lerp(cloudTarget, 1 - Math.exp(-3 * delta));
    stormCloud.rotation.z += delta * 0.3;
    stormCloudTimer -= delta;
    const flicker = stormCloudTimer < 0.15 ? 1.5 : 0.1 * Math.random();
    stormCloud.children.forEach((puff) => (puff.material.emissiveIntensity = flicker));
    if (stormCloudTimer <= 0) {
      stormCloudTimer = STORM_CLOUD_INTERVAL;
      const target = aliveEnemies()
        .filter((enemy) => enemy.position.distanceTo(player.position) < 340)
        .sort((a, b) => distanceSqXY(a.position, player.position) - distanceSqXY(b.position, player.position))[0];
      if (target) sharedStrike(target.position, { damage: stats.stormCloud, radius: 32, from: stormCloud.position.clone() });
    }
  }

  // Eternal Brew: regrow hearts.
  if (stats.regenEvery) {
    regenTimer += delta;
    if (regenTimer >= stats.regenEvery) {
      regenTimer = 0;
      healPlayer(1);
    }
  }

  // Steam Engine: puffs of scalding steam along the dash.
  if (stats.steamTrail && player.isDashing) {
    steamDistance += stats.dashSpeed * delta;
    if (steamDistance >= STEAM_SPACING) {
      steamDistance = 0;
      effects.pool(player.position, { radius: 22, dps: 2, duration: 1.6, color: '#eaf4ff', opacity: 0.3, particleColors: ['#ffffff', '#dfefff'] });
    }
  }
}

// --- Charms: stacking trinkets that trigger on hits, crits and kills (see Charms.js) -------------------
const charmCounts = new Map(); // charm id → copies
const charmDrops = new CharmDrops(scene);
const charms = (id) => charmCounts.get(id) ?? 0;
let charmLuck = 1; // drop chance multiplier (the Four-Leaf Clover keepsake)
// Hits that can trigger charms. A charm's own hits pass on a weaker chance (`procScale`), so chains die out.
const PROC_SOURCES = new Set(['spit', 'splash', 'dash', 'skill', 'lightning', 'burst', 'frost', 'blast', 'charm']);
const PROC_BUDGET = 14; // charm triggers per frame at most, so huge stacks can't stall the game
let procScale = 1;
let procBudget = PROC_BUDGET;

/** Runs `fn` with a weaker proc chance for everything it hits. */
function withProc(scale, fn) {
  const previous = procScale;
  procScale = previous * scale;
  try {
    fn();
  } finally {
    procScale = previous;
  }
}

/** A chance roll for a charm; Loaded Dice give extra rolls. */
function procs(probability) {
  if (procBudget <= 0) return false;
  for (let i = 0; i <= charms('dice'); i++) {
    if (Math.random() < probability * procScale) {
      procBudget--;
      return true;
    }
  }
  return false;
}

/** On hit: `amount` is the hit's damage before Tode's multipliers (charm damage scales from it). */
function charmHit(enemy, amount, crit) {
  const at = enemy.position.clone().setZ(0);
  if (charms('chili') && procs(chance(0.1, charms('chili')))) {
    enemy.applyBurn(2, 3);
    particles.burst(at, { count: 6, colors: FIRE, speed: 40, up: 70, gravity: -30, size: 1.4, height: enemy.height * 0.5, glow: true });
  }
  if (charms('cube') && !enemy.dying && procs(chance(0.07, charms('cube')))) {
    enemy.applySlow(1, 1.1);
    particles.burst(at, { count: 6, colors: ICE, speed: 50, up: 40, size: 1.4, glow: true });
  }
  if (charms('spoon') && procs(chance(0.09, charms('spoon')))) {
    withProc(0.5, () => effects.chain(at, 3, Math.max(1, Math.round(amount * 0.8)), { hit: new Set([enemy]) }));
  }
  if (charms('biscuit') && procs(chance(0.08, charms('biscuit')))) {
    effects.addEffect(new Biscuit(player.position, enemy, Math.max(2, Math.round(amount * 2.5)), procScale * 0.5));
  }
  if (crit && charms('cup') && procs(1)) {
    withProc(0.5, () =>
      effects.blast(at, { radius: 55, damage: 3 + 2 * charms('cup'), knockback: 90, color: '#ffd36b', particleColors: TEA_DROPS, source: 'charm' })
    );
  }
}

function charmKill(enemy) {
  if (charms('battery')) addGauge(0.3 * charms('battery'));
  if (charms('firecracker') && procs(0.25)) {
    const at = enemy.position.clone().setZ(0);
    const n = charms('firecracker');
    play('boom');
    withProc(0.5, () =>
      effects.blast(at, { radius: 60 + 6 * n, damage: 3 + 3 * n, knockback: 160, color: '#ff6a3d', particleColors: FIRE, source: 'charm' })
    );
  }
}

/** Elites, hives and bosses drop charms (bosses three, at least Uncommon); plain bees very rarely. */
function dropCharms(enemy) {
  const odds = enemy.type.boss || enemy.kind === 'nest' ? 1 : enemy.type.ward ? 0.4 : (enemy.elite ? 0.35 : 0.004) / coopShare();
  const count = enemy.type.boss ? 3 : 1;
  for (let i = 0; i < count; i++) {
    if (Math.random() < odds * charmLuck) charmDrops.drop(enemy.position, rollCharm(enemy.type.boss ? 'uncommon' : 'common'));
  }
}

function gainCharm(charm) {
  const count = charms(charm.id) + 1;
  charmCounts.set(charm.id, count);
  charm.apply?.(player.stats);
  if (charm.heal) player.heal(charm.heal);
  updateHealth();
  play(charm.rarity === 'common' ? 'pick' : 'legendary');
  effects.ring(player.position, { radius: 50, color: CHARM_RARITIES[charm.rarity].color, duration: 0.4 });
  hud.showCharm(charm, count, charm.text(count), player.position);
  refreshCharms();
  if ([...charmCounts.values()].reduce((sum, n) => sum + n, 0) >= 12) achieve('charms');
}

function charmList() {
  return [...charmCounts].map(([id, count]) => {
    const charm = charmById(id);
    return { icon: charm.icon, name: charm.name, count, level: count, rarity: charm.rarity, text: charm.text(count), color: CHARM_RARITIES[charm.rarity].color };
  });
}

function refreshCharms() {
  hud.setCharms(charmList());
}

const biscuitGeometry = new THREE.SphereGeometry(4, 10, 8);
const biscuitMaterial = new THREE.MeshStandardMaterial({ color: '#c88a4a', emissive: '#6a3a10', emissiveIntensity: 0.6, roughness: 0.8 });

/** The Homing Biscuit: flies after its bee (or the next one) and hits hard. */
class Biscuit {
  constructor(from, target, damage, scale) {
    this.mesh = new THREE.Mesh(biscuitGeometry, biscuitMaterial);
    this.mesh.position.copy(from).setZ(24);
    scene.add(this.mesh);
    this.target = target;
    this.damage = damage;
    this.scale = scale;
    this.velocity = new THREE.Vector3((Math.random() - 0.5) * 300, (Math.random() - 0.5) * 300, 160);
    this.age = 0;
  }

  update(delta) {
    this.age += delta;
    if (this.target.dying) {
      const position = this.mesh.position;
      this.target = aliveEnemies().sort((a, b) => distanceSqXY(a.position, position) - distanceSqXY(b.position, position))[0];
      if (!this.target) return false;
    }
    const goal = this.target.position.clone().setZ(this.target.height * 0.5);
    const toGoal = goal.sub(this.mesh.position);
    const distance = toGoal.length();
    if (distance < this.target.radius + 6) {
      const direction = toGoal.setZ(0).normalize();
      withProc(this.scale, () => damageEnemy(this.target, this.damage, direction, 80, 'charm'));
      particles.burst(this.mesh.position, { count: 8, colors: ['#c88a4a', '#f3d29a', '#8a5a2a'], speed: 70, up: 50, size: 1.5, height: 0 });
      return false;
    }
    // Steer harder the longer it flies, so it never orbits forever.
    this.velocity.lerp(toGoal.normalize().multiplyScalar(460), 1 - Math.exp(-(4 + this.age * 8) * delta));
    this.mesh.position.addScaledVector(this.velocity, delta);
    this.mesh.rotation.x += delta * 14;
    if (Math.random() < 0.5) particles.burst(this.mesh.position.clone().setZ(0), { count: 1, colors: ['#f3d29a'], speed: 5, up: 0, gravity: 0, height: this.mesh.position.z, size: 1, life: 0.25 });
    return this.age < 3;
  }

  dispose() {
    this.mesh.removeFromParent();
  }
}

// --- Class mechanics: the Ninja's decoys and the Summoner's pond toads (see Classes.js) ---------------
const DECOY = { life: 2.2, lure: 320 };
const decoys = []; // { position, left, mesh }: logs the bees chase for a moment
const logGeometry = new THREE.BoxGeometry(9, 9, 16);
const logMaterial = new THREE.MeshStandardMaterial({ color: '#8a5a33', flatShading: true, roughness: 0.9 });
const SMOKE = ['#ffffff', '#e8e4dc', '#cfc8bc'];

/** A decoy log where a Ninja vanished (every screen shows it; the host's bees chase it). */
function placeDecoy(position) {
  const mesh = new THREE.Mesh(logGeometry, logMaterial);
  mesh.position.set(position.x, position.y, 5);
  mesh.rotation.set(0.3, 0, Math.random() * Math.PI);
  mesh.castShadow = true;
  scene.add(mesh);
  decoys.push({ position: mesh.position, left: DECOY.life, mesh, decoy: true });
  particles.burst(position, { count: 26, colors: SMOKE, speed: 90, up: 70, size: 4, height: 8, gravity: -20, life: 0.8 });
  play('dash');
}

function updateDecoys(delta) {
  for (const decoy of [...decoys]) {
    decoy.left -= delta;
    if (decoy.left > 0) continue;
    particles.burst(decoy.position, { count: 18, colors: SMOKE, speed: 70, up: 60, size: 3.5, height: 6, gravity: -20, life: 0.7 });
    removeDecoy(decoy);
  }
}

function removeDecoy(decoy) {
  decoys.splice(decoys.indexOf(decoy), 1);
  decoy.mesh.removeFromParent();
}

// The Summoner's pond toads hop at his side and spit at bees: two, one more at levels 8 and 16.
const COMPANION = { radius: 46, speed: 230, fireEvery: 0.75, range: 320, damage: 0.6, scale: 0.7 };
const companions = []; // { group, rig, slot, hop, fireTimer, velocity }

function wantedCompanions() {
  const base = player.stats.companions;
  return base ? base + (playerLevel >= 8 ? 1 : 0) + (playerLevel >= 16 ? 1 : 0) : 0;
}

function addCompanion() {
  const rig = buildFrog('pondling');
  rig.inPlace = true;
  rig.root.rotation.x = Math.PI / 2;
  rig.root.scale.setScalar(FROG_SCALE * COMPANION.scale);
  rig.root.traverse((child) => child.isMesh && (child.castShadow = true));
  const group = new THREE.Group();
  group.add(rig.root);
  group.position.copy(player.position);
  scene.add(group);
  companions.push({ group, rig, hop: Math.random() * Math.PI, fireTimer: Math.random(), facing: 0 });
  particles.burst(group.position, { count: 16, colors: SMOKE, speed: 60, up: 60, size: 3, height: 6, gravity: -20, life: 0.6 });
  effects.ring(group.position, { radius: 26, color: '#ff9a3a', duration: 0.5 });
}

function clearCompanions() {
  for (const { group } of companions.splice(0)) group.removeFromParent();
}

const companionTarget = new THREE.Vector3();
function updateCompanions(delta) {
  while (companions.length < wantedCompanions()) addCompanion();
  const visible = !player.downed && player.group.visible;
  companions.forEach((buddy, i) => {
    const { group, rig } = buddy;
    group.visible = visible;
    // A spot on a ring around the Summoner, turning slowly.
    const angle = clock.elapsedTime * 0.4 + (i / companions.length) * Math.PI * 2;
    companionTarget.set(player.position.x + Math.cos(angle) * COMPANION.radius, player.position.y + Math.sin(angle) * COMPANION.radius, 0);
    const distance = Math.sqrt(distanceSqXY(group.position, companionTarget));
    const step = Math.min(distance, COMPANION.speed * delta);
    const moving = distance > 3;
    if (moving) {
      group.position.x += ((companionTarget.x - group.position.x) / distance) * step;
      group.position.y += ((companionTarget.y - group.position.y) / distance) * step;
      buddy.facing = Math.atan2(companionTarget.x - group.position.x, -(companionTarget.y - group.position.y));
    }
    // Little hops while it moves.
    buddy.hop = moving ? buddy.hop + delta * 12 : 0;
    const height = Math.abs(Math.sin(buddy.hop)) * 3;
    rig.root.position.z = height;
    rig.setLocomotion(moving ? height / 3 : 0);
    // Spit at the nearest bee in range.
    buddy.fireTimer -= delta;
    let target = null;
    let best = COMPANION.range ** 2;
    for (const enemy of targetable()) {
      const d = distanceSqXY(enemy.position, group.position);
      if (d < best) [best, target] = [d, enemy];
    }
    if (target) buddy.facing = Math.atan2(target.position.x - group.position.x, -(target.position.y - group.position.y));
    rig.root.rotation.y = buddy.facing;
    if (target && buddy.fireTimer <= 0 && visible && PLAYING.has(phase)) {
      buddy.fireTimer = COMPANION.fireEvery * (0.85 + Math.random() * 0.3);
      const direction = target.position.clone().sub(group.position).setZ(0).normalize();
      fireSpit(group.position.clone().addScaledVector(direction, 8), direction, Math.max(1, Math.round(player.stats.spitDamage * COMPANION.damage)));
      rig.flick();
    }
    rig.update(delta);
  });
}

// --- Shrines: optional risks during a wave (see Shrines.js) -----------------------------------
let shrine = null; // { type, position, group, progress, …, label, curse }

function shrineLabel(current) {
  const def = SHRINES[current.type];
  const hint = current.type === 'cursed' ? `${current.curse.icon} ${current.curse.name}: ${current.curse.text}` : def.hint;
  const tries = current.type === 'chance' && current.tries ? ` (${CHANCE_TRIES - current.tries} left)` : '';
  return `<b>${def.icon} ${def.name}</b><small>${hint}${tries}</small>`;
}

/** From wave 2, about a third of the waves that aren't boss waves get one shrine somewhere. `forced`: a type. */
function setupShrine(number, forced = null) {
  clearShrine();
  if (!forced && (number < 2 || config.isBoss)) return;
  const plan = seeded(() => {
    if (!forced && Math.random() > 0.35) return null;
    const types = coop ? ['chance', 'cursed'] : ['chance', 'chance', 'cursed', 'bitter'];
    const curses = CURSES.filter((curse) => !brewLevels.has(curse.id));
    let type = forced ?? types[Math.floor(Math.random() * types.length)];
    if (type === 'cursed' && !curses.length) type = 'chance';
    const angle = Math.random() * Math.PI * 2;
    const distance = MAP_HALF_SIZE * (0.25 + Math.random() * 0.3);
    return { type, curse: curses[Math.floor(Math.random() * curses.length)], at: new THREE.Vector3(Math.cos(angle) * distance, Math.sin(angle) * distance, 0) };
  });
  if (!plan) return;
  shrine = createShrine(scene, plan.type, plan.at);
  shrine.curse = plan.type === 'cursed' ? plan.curse : null;
  shrine.label = hud.attachWorldLabel(shrineLabel(shrine), SHRINES[plan.type].color);
  if (number <= 6) hud.showCallout(`${SHRINES[plan.type].icon} A ${SHRINES[plan.type].name} appeared!`);
}

function clearShrine() {
  if (!shrine) return;
  shrine.label.remove();
  disposeShrine(shrine);
  shrine = null;
}

function updateShrines(delta) {
  if (!shrine) return;
  updateShrine(shrine, delta, clock.elapsedTime);
  hud.updateWorldLabel(shrine.label, shrine.position, 82, PLAYING.has(phase) && !shrine.used);
  if (shrine.used || player.downed) return;
  shrine.cooldown = Math.max(0, shrine.cooldown - delta);
  const inside = distanceSqXY(player.position, shrine.position) < SHRINE_RADIUS ** 2;
  const tooWeak = shrine.type === 'chance' && player.hp <= 1;
  if (inside && tooWeak && !shrine.warned) {
    shrine.warned = true;
    hud.showCallout('Too weak to make an offering!');
  }
  if (!inside) shrine.warned = false;
  const holding = inside && !tooWeak && shrine.cooldown === 0 && phase === 'fighting';
  shrine.progress = holding ? Math.min(1, shrine.progress + delta / SHRINE_HOLD) : Math.max(0, shrine.progress - delta * 2);
  if (shrine.progress >= 1) {
    shrine.progress = 0;
    useShrine();
  }
}

function useShrine() {
  const { position, type } = shrine;
  if (!shrine.counted) {
    shrine.counted = true;
    if (++feats.shrines >= 4) achieve('shrines');
  }
  const color = SHRINES[type].color;
  effects.ring(position, { radius: 120, color, duration: 0.6, thickness: 0.2 });
  particles.burst(position, { count: 30, colors: ['#ffffff', color], speed: 160, up: 160, size: 2, glow: true });
  if (type === 'chance') {
    // An offering of one heart: a charm, two charms, or nothing at all.
    player.hp -= 1;
    play('hurt');
    hud.flashHurt();
    updateHealth();
    shrine.tries++;
    shrine.cooldown = 1;
    const roll = Math.random();
    if (roll < 0.15) {
      charmDrops.drop(position, rollCharm('uncommon'));
      charmDrops.drop(position, rollCharm('uncommon'));
      hud.showCallout('🎲 Jackpot!');
      play('legendary');
    } else if (roll < 0.65) {
      charmDrops.drop(position, rollCharm());
      hud.showCallout('🎲 The leaves smile on you');
      play('pick');
    } else {
      hud.showCallout('🎲 The leaves say no…');
    }
    if (shrine.tries >= CHANCE_TRIES) {
      shrine.used = true; // it crumbles (the callout above says how the offering went)
    } else {
      hud.setWorldLabel(shrine.label, shrineLabel(shrine));
    }
  } else if (type === 'bitter') {
    // The hive answers: elites, frenzy, half again as many bees and a squad right away. An Epic brew afterwards.
    shrine.used = true;
    for (const id of ['elites', 'frenzy']) waveMods.add(id);
    config.speedScale *= 1.25;
    spawnQueue.push(...buildSpawnQueue({ ...config, count: Math.round(config.count * 0.5) }));
    spawnSquad();
    bonusPicks++;
    feats.bitterWave = wave;
    hud.setModifiers([...waveMods].map((id) => MODIFIERS[id]));
    hud.showBanner('The hive is enraged!', 'Survive the wave for an Epic brew', 2.4);
    postfx.flash('#ff3b1f', 0.4);
    shake = Math.max(shake, 12);
    play('roar');
  } else {
    // Cursed Leaves: a powerful brew with a drawback.
    shrine.used = true;
    const { curse } = shrine;
    brewLevels.set(curse.id, 1);
    brewTexts.set(curse.id, curse.text);
    curse.apply(player);
    updateHealth();
    refreshOwned();
    hud.showBanner(`${curse.icon} ${curse.name}`, curse.text, 2.8);
    postfx.flash(color, 0.45);
    postfx.pulse({ warp: 0.6, aberration: 0.6 });
    play('legendary');
  }
  if (shrine.used) clearShrine();
}

// --- Aiming ---
const raycaster = new THREE.Raycaster();
// Aim at bee height rather than the ground, so pointing at a bee aims at the bee.
const aimPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -PROJECTILE_HEIGHT);
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const aimPoint = new THREE.Vector3();

const reticle = new THREE.Mesh(
  new THREE.RingGeometry(7, 9.5, 32),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false })
);
reticle.renderOrder = 1;
// Hidden until the mouse aims in a fight. Always above the lawn: at z = 0 it z-fought with the ground under Tode.
reticle.position.z = 0.4;
reticle.visible = false;
scene.add(reticle);

let autoFire = false;

const aimDirection = new THREE.Vector3();

/**
 * Touch mode: Tode spits by himself. With the right stick pushed he aims where it points (spit's aim assist
 * still nudges shots onto bees); without it he aims at the nearest bee in range, or looks where he walks.
 */
function updateTouchAim() {
  if (input.aiming) {
    aimDirection.copy(SCREEN_RIGHT).multiplyScalar(input.aimAxis.x).addScaledVector(SCREEN_UP, input.aimAxis.y).normalize();
    player.aimAt(player.position.clone().addScaledVector(aimDirection, 10));
    ctx.aimGround.copy(player.position).addScaledVector(aimDirection, 160).setZ(0);
    reticle.position.set(ctx.aimGround.x, ctx.aimGround.y, 0.4);
    reticle.visible = true;
    autoFire = true;
    return;
  }
  let target = null;
  let best = player.stats.spitRange * 1.05;
  for (const enemy of targetable()) {
    const distance = enemy.position.distanceTo(player.position);
    if (distance < best) {
      best = distance;
      target = enemy;
    }
  }
  autoFire = Boolean(target);
  if (target) player.aimAt(target.position);
  else if (moveDirection.lengthSq() > 0) player.aimAt(player.position.clone().addScaledVector(moveDirection, 10));
  ctx.aimGround.copy(target ? target.position : player.position.clone().addScaledVector(player.facing, 160)).setZ(0);
  reticle.visible = false;
}

function updateAim() {
  if (touch.enabled) {
    updateTouchAim();
    return;
  }
  player.group.updateMatrixWorld(true);
  raycaster.setFromCamera(input.pointer, camera);
  if (raycaster.ray.intersectPlane(aimPlane, aimPoint)) player.aimAt(aimPoint);
  if (raycaster.ray.intersectPlane(groundPlane, ctx.aimGround)) reticle.position.set(ctx.aimGround.x, ctx.aimGround.y, 0.4);
  reticle.visible = true;
}

const BASE_CAMERA_ROTATION = camera.quaternion.clone();
const TITLE_TIER = 0; // the title shows plain Tode: his transformations are a surprise for later
let titleOrbit = -Math.PI / 4;
let orbiting = false;

function updateCamera(delta) {
  shake *= Math.exp(-SHAKE_DECAY * delta);
  if (shake < 0.05) shake = 0;
  zoomPunch *= Math.exp(-2.5 * delta);

  if (phase === 'story' || phase === 'ending' || phase === 'travel') return; // the cut-scenes drive the camera
  // Title screen: a slow cinematic orbit around Tode.
  if (phase === 'title' || phase === 'loading') {
    orbiting = true;
    titleOrbit += delta * 0.1;
    camera.position.set(Math.cos(titleOrbit) * 210, Math.sin(titleOrbit) * 210, 85);
    camera.lookAt(player.position.x, player.position.y, player.position.z + 42); // Tode stands in the lower half
    return;
  }
  if (orbiting) {
    orbiting = false;
    camera.quaternion.copy(BASE_CAMERA_ROTATION);
  }
  // Tall, narrow screens (phones) see more of the garden.
  const portrait = camera.aspect < 1 ? 1.45 : 1;
  const zoom = cameraZoom * (1 - zoomPunch) * portrait;
  const jolt = shake * (postfx.calm ? 0.35 : 1);
  camera.position.set(
    CAMERA_OFFSET.x * zoom + cameraPan.x + (Math.random() - 0.5) * jolt,
    CAMERA_OFFSET.y * zoom + cameraPan.y + (Math.random() - 0.5) * jolt,
    CAMERA_OFFSET.z * zoom + (Math.random() - 0.5) * jolt
  );
}

// --- Weather ---
function stormStrike() {
  if (!PLAYING.has(phase) || isGuest()) return; // the host calls the weather's strikes
  const bees = aliveEnemies();
  const nearTode = Math.random() < 0.35 || !bees.length;
  const todes = standingTodes();
  const tode = todes[Math.floor(Math.random() * todes.length)] ?? player;
  const base = nearTode ? tode.position : bees[Math.floor(Math.random() * bees.length)].position;
  const angle = Math.random() * Math.PI * 2;
  const offset = nearTode ? 30 + Math.random() * 70 : Math.random() * 30;
  const spot = base.clone().add(new THREE.Vector3(Math.cos(angle) * offset, Math.sin(angle) * offset, 0));
  sharedStrike(spot, { damage: 8, radius: 45, delay: 0.9, hurtsPlayer: true });
}

// --- Music ---
function updateMusic() {
  if (!PLAYING.has(phase) && !['ascending', 'bossIntro', 'travel', 'clash'].includes(phase)) {
    music.play('garden', 0);
    return;
  }
  const tier = ascension.tier;
  if (config?.isBoss) {
    music.play('boss', tier >= 4 || wave >= 15 ? 4 : 3);
    return;
  }
  if (tier >= 4) {
    music.play('divine', 4);
    return;
  }
  const level = wave >= 15 ? 4 : wave >= 7 || tier >= 2 ? 3 : wave >= 3 ? 2 : 1;
  music.play('battle', level);
}

// --- Experience: tea leaves fill the level bar; every level is a new skill or a skill upgrade ---------
let leafXp = 0;
let playerLevel = 0;
let pendingLevels = 0;
// At most one skill pick between waves; levels beyond that wait for the next wave and come up a few seconds into
// the fight (solo) or at its end (co-op), so picks never pile up three in a row.
let skillPickedThisBreak = false;
let fightTime = 0; // seconds of fighting in this wave
const LEVEL_UP_DELAY = 4; // solo: seconds into a wave before a level carried over from the break is offered
let levelReturn = null; // solo: the fight to go back to after a mid-wave level-up

function dropLeaves(enemy) {
  const value = ((enemy.type.boss ? 40 : Math.max(1, enemy.score / 10)) * (enemy.elite ? 2 : 1) * (waveMods.has('armored') ? 2 : 1)) / coopShare();
  leaves.drop(enemy.position, value, enemy.type.boss ? 30 : Math.min(5, Math.ceil(value)));
}

function updateLeaves(delta) {
  const collected = leaves.update(delta, player.position, player.downed ? 0 : player.stats.magnet);
  if (collected > 0) {
    leafXp += collected * player.stats.leafValue;
    play('pop');
  }
  while (leafXp >= leavesForLevel(playerLevel)) {
    leafXp -= leavesForLevel(playerLevel);
    playerLevel++;
    pendingLevels++;
    levelUpEffects();
    if (playerLevel >= 25) achieve('level25');
  }
  hud.setXp(leafXp / leavesForLevel(playerLevel), playerLevel, pendingLevels);
  // Solo: the game pauses for the pick right away. Co-op: the picks wait until the wave is cleared.
  if (pendingLevels > 0 && !coop && phase === 'fighting' && fightTime > LEVEL_UP_DELAY && !player.downed) openLevelUp({ phase, timer: phaseTimer });
}

function levelUpEffects() {
  play('legendary');
  effects.ring(player.position, { radius: 120, color: '#c8f77a', duration: 0.6, thickness: 0.2 });
  particles.burst(player.position, { count: 40, colors: ['#7ed957', '#c8f77a', '#ffd36b'], speed: 160, up: 160, size: 2, glow: true });
  postfx.pulse({ bloom: 0.5 });
  hud.showCallout('LEVEL UP!');
}

/** Shows the skill pick for a pending level. Returns false when every skill is maxed out. */
function openLevelUp(resume = null) {
  offers = skills.offers();
  if (!offers.length) {
    // Nothing left to learn: a heart instead.
    pendingLevels = 0;
    healPlayer(1);
    return false;
  }
  levelReturn = resume;
  setPhase('skill');
  hud.showSkills(offers, playerLevel - pendingLevels + 1);
  return true;
}

function resetExperience() {
  leafXp = playerLevel = pendingLevels = 0;
  levelReturn = null;
  leaves.clear();
  hud.setXp(0, 0, 0);
}

// --- Arenas and the journey between them ---
/** Shows an arena right away: its world, obstacles, lighting and graphics level (call it under a flash). */
function setArena(next) {
  arena = next;
  const garden = next.id === 'garden';
  prepareArena(next);
  setMapTiles(arenaTiles(next));
  fitShadows();
  map.visible = environment.group.visible = divinity.root.visible = garden;
  for (const [id, built] of builtArenas) built.group.visible = id === next.id;
  weather.setArena(garden ? null : next);
  applyRenderer(next.gfx, { renderer, exposure: next.exposure });
  setEnemyGraphics(next.gfx);
  player.setGraphics(next.gfx);
  if (coop) for (const remote of coop.remotes.values()) remote.puppet.setGraphics(next.gfx);
}

/** Every arena is 4 tiles wider than the one before (an odd count keeps a tile in the middle). */
const arenaTiles = (def) => worldTiles + 4 * ARENAS.indexOf(def);

let realityGlitch = 8;
/** Builds an arena ahead of time and compiles its shaders, so the journey there doesn't stutter. */
function prepareArena(next) {
  if (next.id === 'garden' || builtArenas.has(next.id)) return;
  // Built at its own size, whatever arena Tode is in right now.
  const current = MAP_TILES;
  setMapTiles(arenaTiles(next));
  const built = next.build();
  setMapTiles(current);
  builtArenas.set(next.id, built);
  scene.add(built.group);
  // compileAsync only looks at visible objects; it gathers them right away.
  renderer.compileAsync?.(built.group, camera, scene).catch(() => {});
  built.group.visible = next === arena;
}

const TRAVEL_TIME = 4.2;
const FALL_TIME = 5.4;
const travel = { to: null, wave: 0, weather: null, time: 0, swapped: false, landed: false };

/** Leaves for the next arena; the wave starts when Tode has landed there. */
function startTravel(destination, number, weatherKind, mods = []) {
  clearWorld();
  Object.assign(travel, { to: destination, wave: number, weather: weatherKind, mods, time: 0, swapped: false, landed: false });
  travel.fall = destination.id === 'hell';
  travel.duration = travel.fall ? FALL_TIME : TRAVEL_TIME;
  setPhase('travel', travel.duration);
  orbiting = true;
  hud.setWave(number, 0);
  if (travel.fall) {
    play('roar');
    hud.showBanner('The ground gives way!', 'Something stirs far below…', 1.6);
  } else {
    play('ascend');
  }
}

function updateTravel(delta) {
  travel.time += delta;
  const t = travel.time;
  const tode = player.position;
  const lift = (z) => {
    player.model.position.z = player.groundOffset + z;
    player.adornments.position.z = z;
  };

  if (travel.fall) {
    // An earthquake, the garden cracks open, Tode plunges into the dark… and crashes into the Underworld.
    if (t < 1.4) {
      shake = Math.max(shake, 3 + t * 10);
      camera.position.set(170 - t * 30, -170 + t * 30, 210 - t * 40);
      camera.lookAt(tode.x, tode.y, tode.z);
      if (Math.random() < delta * 8) {
        const angle = Math.random() * Math.PI * 2;
        const at = tode.clone().add(new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0).multiplyScalar(30 + Math.random() * 120));
        effects.ring(at, { radius: 40 + Math.random() * 50, color: '#ff3b1f', duration: 0.5, thickness: 0.3 });
        particles.burst(at, { count: 10, colors: ['#3a2a20', '#ff6a00', '#5a4030'], speed: 60, up: 120, size: 2.2 });
      }
      postfx.pulse({ aberration: 0.3, warp: 0.4 });
    } else if (t < 2.6) {
      // Falling: everything goes dark and red.
      const k = (t - 1.4) / 1.2;
      lift(-260 * k * k);
      camera.position.set(40, -40, 160 - k * 120);
      camera.lookAt(tode.x, tode.y, tode.z - 260 * k * k);
      postfx.flash('#120000', Math.min(1, k * 1.4));
      if (!travel.swapped && k > 0.75) swapArena();
    } else {
      // Plunging out of the burning sky, then a crash landing.
      const k = Math.min(1, (t - 2.6) / 1.3);
      const z = 420 * (1 - k) * (1 - k);
      lift(z);
      const angle = -0.9 + (t - 2.6) * 0.35;
      const distance = 260 - k * 60;
      camera.position.set(Math.cos(angle) * distance, Math.sin(angle) * distance, 50 + (1 - k) * 160);
      camera.lookAt(tode.x, tode.y, tode.z + z * 0.6 + 10);
      if (z > 5) particles.burst(tode.clone().setZ(z + 10), { count: 3, colors: FIRE, speed: 20, up: 80, size: 2.5, glow: true });
      if (!travel.landed && k >= 1) land('#ff4a10', FIRE, 24);
    }
  } else {
    // Power up, leap through a flash of light, then swoop over the new arena and land.
    if (t < 1.2) {
      cameraZoom = 1;
      const k = t / 1.2;
      camera.position.set(130 - k * 40, -130 + k * 40, 70 - k * 15);
      camera.lookAt(tode.x, tode.y, tode.z + 14);
      shake = Math.max(shake, k * 4);
      lift(Math.sin(k * Math.PI * 0.5) * 8);
      particles.burst(tode, { count: 4, colors: ['#ffffff', '#ffe680', '#9ff4ff'], ring: 90, speed: -150, up: 40, size: 1.8, glow: true, height: 6 });
    } else if (t < 1.6) {
      const k = (t - 1.2) / 0.4;
      lift(8 + k * k * 600);
      camera.lookAt(tode.x, tode.y, tode.z + 60 + k * 300);
      postfx.flash('#ffffff', Math.min(1, k * 1.5));
      postfx.pulse({ warp: 1, aberration: 1, bloom: 1 });
      if (!travel.swapped && k > 0.6) swapArena();
    } else {
      // A wide, rising orbit over the new arena (the only time its sky is in view), then the landing.
      const k = Math.min(1, (t - 1.6) / 1.6);
      const z = 600 * (1 - k) ** 2;
      lift(z);
      const angle = -2.2 + (t - 1.6) * 0.5;
      const distance = 380 - k * 120;
      camera.position.set(Math.cos(angle) * distance, Math.sin(angle) * distance, 40 + k * 60);
      camera.lookAt(tode.x - 60 * (1 - k), tode.y + 60 * (1 - k), 30 + z * 0.4);
      if (!travel.landed && k >= 1) land('#ffffff', ['#ffffff', '#ffe680', '#9ff4ff'], 14);
    }
  }

  if (t >= travel.duration) {
    lift(0);
    hud.hideBossIntro();
    beginWave(travel.wave, travel.weather, travel.mods);
  }
}

function swapArena() {
  travel.swapped = true;
  player.position.set(0, 0, 0);
  setArena(travel.to);
  const stage = ARENAS.indexOf(travel.to) + 1;
  hud.showBossIntro(travel.to.name, `Stage ${stage} · ${travel.to.subtitle}`);
  music.play(travel.fall ? 'boss' : 'battle', 3);
}

function land(color, colors, impact) {
  travel.landed = true;
  play('boom');
  shake = impact;
  postfx.flash(color, 0.5);
  postfx.pulse({ bloom: 1.2, aberration: 0.8 });
  effects.ring(player.position, { radius: 220, color, duration: 0.8, thickness: 0.25 });
  particles.burst(player.position, { count: 80, colors, speed: 260, up: 180, size: 2.4, glow: true, height: 4 });
}

// --- Waves ---
function setPhase(next, duration = 0) {
  phase = next;
  phaseTimer = duration;
  updateMusic();
}

/**
 * `weatherKind` comes from the host in co-op; otherwise it is rolled here.
 * A wave in a new arena starts with the journey there (see startTravel).
 */
function startWave(number, weatherKind, mods) {
  const destination = arenaForWave(number);
  weatherKind ??= seeded(() => rollWeather(number, waveConfig(number).isBoss));
  mods ??= seeded(() => rollModifiers(number, waveConfig(number).isBoss));
  // Bitter Leaves (a Steeping vow): every wave from wave 2 gets a modifier.
  if (vow('bitter') && number >= 2 && !mods.length && !waveConfig(number).isBoss) {
    const pool = Object.keys(MODIFIERS);
    mods = [seeded(() => pool[Math.floor(Math.random() * pool.length)])];
  }
  if (destination.weathers && !destination.weathers.includes(weatherKind)) weatherKind = 'clear';
  if (coop?.host) share({ k: 'wave', n: number, wx: weatherKind, m: mods });
  if (destination !== arena) startTravel(destination, number, weatherKind, mods);
  else beginWave(number, weatherKind, mods);
}

let waveMods = new Set(); // this wave's modifiers (see Waves.js)

function beginWave(number, weatherKind, mods = []) {
  wave = number;
  config = waveConfig(number);
  waveMods = new Set(mods);
  if (waveMods.has('horde')) config.count = Math.round(config.count * 1.5);
  if (waveMods.has('frenzy')) config.speedScale *= 1.25;
  if (waveMods.has('armored')) config.hpScale *= 1.5;
  // Steeping vows and the Swarm Horn curse.
  config.count = Math.round(config.count * (1 + 0.2 * vow('swarm')) * (config.isBoss ? 1 : player.stats.swarmScale));
  config.hpScale *= 1 + 0.15 * vow('hardy');
  config.speedScale *= 1 + 0.1 * vow('wings');
  hud.setModifiers(mods.map((id) => MODIFIERS[id]));
  startHazards(number);
  if (number === 1 || arenaForWave(number - 1) !== arena) setupObjective();
  setupShrine(number);
  setupCursedTiles(number);
  if (coop) {
    // More frogs, more bees: bigger swarms, tougher bees, spawning as much faster as the swarm is bigger.
    const extra = coop.size - 1;
    config.count = Math.round(config.count * coopShare());
    config.hpScale *= 1 + COOP_HP * extra;
    config.spawnInterval /= coopShare();
    reviveIfDown();
    hud.setWaiting(null);
  }
  spawnQueue = isGuest() ? [] : seeded(() => buildSpawnQueue(config));
  hitThisWave = false;
  feats.bossHurt = false;
  skillPickedThisBreak = false;
  fightTime = 0;
  tactics.pounceTimer = 6 + Math.random() * 4;
  tactics.volleyIn = 2.5;
  if (isDaily() && number >= 10) achieve('daily');
  if (endless && number >= 30) achieve('wave30');
  spawnTimer = 0;

  weather.set(timeOfDay(number), weatherKind);
  weather.setCosmic(ascension.tier >= 4);
  hud.setWeather(weather.info);

  setPhase('intro', WAVE_INTRO_TIME);
  hud.setWave(wave, 0);
  play(config.isBoss ? 'boss' : 'waveStart');
  const bossName = { empress: 'The Empress', beezebub: 'Bee-zebub', shogun: 'The Hornet Shogun', seraph: 'The Seraph Queen' }[config.boss] ?? 'Queen Buzzbelle';
  if (number === HELL_WAVE) hud.showBanner('The Final Battle', 'Bee-zebub awakens!', WAVE_INTRO_TIME + 0.6);
  else if (number === FINAL_WAVE) hud.showBanner(`Wave ${wave}`, 'The Empress of the hive descends!', WAVE_INTRO_TIME + 0.6);
  else if (config.isBoss) hud.showBanner(`Wave ${wave}`, `${bossName} approaches!`, WAVE_INTRO_TIME + 0.4);
  else if (config.endless) hud.showBanner(`Endless ${config.endless}`, `Bees ×${config.hpScale.toFixed(0)} tougher · ${mods.map((id) => MODIFIERS[id].icon).join(' ')}`, WAVE_INTRO_TIME + 0.4);
  else if (mods.length) hud.showBanner(`Wave ${wave}`, mods.map((id) => `${MODIFIERS[id].icon} ${MODIFIERS[id].name}`).join(' + '), WAVE_INTRO_TIME + 0.4);
  else hud.showBanner(`Wave ${wave}`, `${config.count} bees incoming`, WAVE_INTRO_TIME);
}

// --- Side objectives: the way to the next arena opens once they are done ------------------
// Hives to smash (they keep letting out bees) or shrines to hold (stand in the circle while bees swarm in).
const OBJECTIVES = {
  garden: { type: 'nests', icon: '🐝', label: 'Smash the wild hives', turn: 0.3 },
  mountain: { type: 'zones', icon: '🔔', label: 'Ring the temple bells', color: '#ffd27a', turn: 1.1 },
  sky: { type: 'nests', icon: '🍯', label: 'Smash the golden hives', turn: 0.7 },
  cosmos: { type: 'zones', icon: '🌀', label: 'Seal the reality rifts', color: '#c070ff', turn: 0.2 },
};
const OBJECTIVE_COUNT = 3;
const ZONE_RADIUS = 70;
const ZONE_TIME = 5; // seconds to hold a shrine
let objective = null; // { def, done, zones: [{ position, progress, done, group, fill, beam }], announced }

/** Three spots around the middle of the arena, the same on every screen. */
function objectiveSpots(def) {
  return Array.from({ length: OBJECTIVE_COUNT }, (_, i) => {
    const angle = def.turn + (i / OBJECTIVE_COUNT) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0).multiplyScalar(MAP_HALF_SIZE * 0.62);
  });
}

function clearObjective() {
  for (const zone of objective?.zones ?? []) disposeTree(zone.group);
  objective = null;
  hud.setObjective(null);
  hud.setObjectiveArrows([]);
}

function setupObjective() {
  clearObjective();
  const def = OBJECTIVES[arena.id];
  if (!def) return;
  objective = { def, done: 0, zones: [] };
  const spots = objectiveSpots(def);
  if (def.type === 'nests') {
    if (!isGuest()) for (const spot of spots) spawnEnemy('nest', spot, { elite: null });
  } else {
    objective.zones = spots.map((position) => createZone(position, def.color));
  }
  hud.showCallout(`${def.icon} ${def.label}!`);
}

/**
 * How many Todes hold a circle: in co-op it only counts when every standing frog is in it together (the whole team
 * has to take part); with some of them in it, a callout asks for the rest.
 */
function circleHolders(zone) {
  const todes = standingTodes();
  const inside = todes.filter((tode) => distanceSqXY(tode.position, zone.position) < ZONE_RADIUS ** 2).length;
  if (inside && inside < todes.length && clock.elapsedTime - (zone.hintAt ?? -9) > 4) {
    zone.hintAt = clock.elapsedTime;
    hud.showCallout(`👥 Everyone into the circle! ${inside}/${todes.length}`);
  }
  return inside && inside === todes.length ? inside : 0;
}

/** A finished circle swells and fades out, then it's gone. */
function retireZone(zone) {
  const { group } = zone;
  let t = 0;
  effects.addEffect({
    update(delta) {
      t = Math.min(1, t + delta / 0.7);
      group.scale.setScalar(1 + t * 0.3);
      group.traverse((child) => {
        if (!child.material) return;
        child.material.userData.opacity ??= child.material.opacity;
        child.material.opacity = child.material.userData.opacity * (1 - t);
      });
      return t < 1;
    },
    dispose: () => disposeTree(group),
  });
}

/** A shrine circle with a pillar of light; the circle fills while a Tode stands in it. */
function createZone(position, color) {
  const group = new THREE.Group();
  group.position.copy(position);
  const edge = new THREE.Mesh(new THREE.RingGeometry(ZONE_RADIUS - 5, ZONE_RADIUS, 64), additive(color, 0.8));
  const fill = new THREE.Mesh(new THREE.CircleGeometry(ZONE_RADIUS - 5, 64, Math.PI / 2, 0.0001), additive(color, 0.35));
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(10, 16, 420, 20, 1, true).rotateX(Math.PI / 2).translate(0, 0, 210), additive(color, 0.25));
  const emblem = new THREE.Mesh(new THREE.OctahedronGeometry(9, 0), additive(color, 0.9));
  emblem.position.z = 40;
  edge.position.z = fill.position.z = 0.9;
  group.add(edge, fill, beam, emblem);
  scene.add(group);
  return { position, progress: 0, done: false, group, edge, fill, beam, emblem, color, spawnTimer: 1 };
}

let objectiveArrows = []; // positions of the objective's unfinished parts (the HUD points at them)

function updateObjective(delta) {
  objectiveArrows = [];
  if (!objective) return;
  const { def } = objective;
  for (const zone of objective.zones) {
    zone.emblem.rotation.z += delta * (zone.done ? 0.5 : 2);
    zone.emblem.position.z = 40 + Math.sin(clock.elapsedTime * 2) * 5;
    if (zone.done) continue;
    const holders = circleHolders(zone);
    zone.progress = THREE.MathUtils.clamp(zone.progress + (holders ? (delta / ZONE_TIME) * (1 + 0.3 * (holders - 1)) : -delta / 15), 0, 1);
    zone.fill.geometry.dispose();
    zone.fill.geometry = new THREE.CircleGeometry(ZONE_RADIUS - 5, 64, Math.PI / 2, Math.max(0.0001, zone.progress * Math.PI * 2));
    // Holding a shrine draws the swarm in.
    if (holders && !isGuest() && (zone.spawnTimer -= delta) <= 0) {
      zone.spawnTimer = 1.4;
      const angle = Math.random() * Math.PI * 2;
      const spot = zone.position.clone().add(new THREE.Vector3(Math.cos(angle) * 230, Math.sin(angle) * 230, 0));
      const limit = MAP_HALF_SIZE - 30;
      spot.set(THREE.MathUtils.clamp(spot.x, -limit, limit), THREE.MathUtils.clamp(spot.y, -limit, limit), 0);
      spawnEnemy(Math.random() < 0.7 ? 'drone' : 'zipper', spot, { elite: null });
    }
    if (zone.progress >= 1) {
      zone.done = true;
      retireZone(zone); // a finished circle fades away, so only the open ones are left to read
      effects.ring(zone.position, { radius: 220, color: zone.color, duration: 0.8, thickness: 0.2 });
      particles.burst(zone.position, { count: 50, colors: ['#ffffff', zone.color], speed: 240, up: 220, size: 2.4, glow: true });
      charmDrops.drop(zone.position, rollCharm());
      objectiveDone();
    }
  }
  const remaining = def.type === 'nests'
    ? enemies.filter((enemy) => enemy.kind === 'nest' && !enemy.dying).map((enemy) => enemy.position)
    : objective.zones.filter((zone) => !zone.done).map((zone) => zone.position);
  objectiveArrows = objective.done >= OBJECTIVE_COUNT ? [] : remaining;
  const gate = isGateWave() && objective.done < OBJECTIVE_COUNT;
  hud.setObjective(objective.done >= OBJECTIVE_COUNT ? null : `${def.icon} ${def.label} ${objective.done}/${OBJECTIVE_COUNT}${gate ? ' · the way on is sealed!' : ''}`, gate);
}

/** One hive smashed or one shrine held. */
function objectiveDone() {
  if (!objective) return;
  objective.done++;
  play('legendary');
  healPlayer(1);
  points += 100 * wave;
  if (objective.done >= OBJECTIVE_COUNT) {
    hud.showBanner('The way opens!', 'The next arena awaits beyond this one', 2.4);
    postfx.flash('#fff1d0', 0.4);
  } else {
    hud.showCallout(`${objective.done}/${OBJECTIVE_COUNT}!`);
  }
}

/** The arena's last wave: the next arena only opens once the objective is done. */
function isGateWave() {
  return Boolean(objective) && wave < HELL_WAVE && arenaForWave(wave + 1) !== arena;
}

const gateOpen = () => !isGateWave() || objective.done >= OBJECTIVE_COUNT;

/** Hives let out a bee every few seconds (only the host spawns). */
function updateNest(nest, delta) {
  if (isGuest() || phase !== 'fighting') return;
  nest.spawnTimer = (nest.spawnTimer ?? 2 + Math.random() * 3) - delta;
  if (nest.spawnTimer > 0) return;
  nest.spawnTimer = Math.max(3, 7 - wave * 0.2);
  nest.pulse = 1;
  const angle = Math.random() * Math.PI * 2;
  const spot = nest.position.clone().add(new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0).multiplyScalar(nest.radius + 25));
  spawnEnemy(Math.random() < 0.75 ? 'drone' : 'zipper', spot, { elite: null });
}

// --- Forbidden tiles: cursed ground that punishes Tode for walking onto it -----------------------------
// From wave 3 every wave (but a boss's) lays out new cursed tiles, more the deeper the run. Stepping on one burns
// a heart (two from wave 16), hexes Tode (slow, no dash for a moment), closes a ring of stingers in on the tile and
// calls an ambush of bees; a hop-dash over it is safe. A tile re-arms after a while.
const CURSED = { from: 3, size: TILE_SIZE * 2, rearm: 7, hex: 2.6, hexSlow: 0.5, hexNoDash: 0.8, ring: 230, ringSpeed: 130 };
let hexLeft = 0; // seconds Tode stays hexed by a cursed tile
let cursedTiles = []; // { x, y, mesh, cooldown }
let cursedWave = 0; // the wave the tiles were laid out for (guests may get them before their own wave starts)
let cursedTexture = null;

function cursedTileTexture() {
  cursedTexture ??= (() => {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(70, 0, 25, 0.7)';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = '#ff2a5a';
    ctx.lineWidth = 8;
    ctx.strokeRect(6, 6, size - 12, size - 12);
    // A warding glyph: a circle with a cross through it.
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(255, 90, 120, 0.9)';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, 30, 0, Math.PI * 2);
    ctx.moveTo(size / 2 - 22, size / 2 - 22);
    ctx.lineTo(size / 2 + 22, size / 2 + 22);
    ctx.moveTo(size / 2 + 22, size / 2 - 22);
    ctx.lineTo(size / 2 - 22, size / 2 + 22);
    ctx.stroke();
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  })();
  return cursedTexture;
}

/** `spots` come from the host in co-op; otherwise they are rolled here (seeded for the Daily Brew). */
function setupCursedTiles(number, spots = null) {
  if (!spots && isGuest() && cursedWave === number) return; // the host's layout already arrived
  clearCursedTiles();
  cursedWave = number;
  if (number < CURSED.from || waveConfig(number).isBoss) return;
  if (!spots) {
    if (isGuest()) return;
    spots = seeded(() => rollCursedSpots(number));
    share({ k: 'tiles', n: number, t: spots });
  }
  cursedTiles = spots.map(([x, y]) => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(CURSED.size, CURSED.size),
      new THREE.MeshBasicMaterial({ map: cursedTileTexture(), transparent: true, opacity: 0.85, depthWrite: false })
    );
    mesh.position.set(x, y, 1.1);
    scene.add(mesh);
    return { x, y, mesh, cooldown: 0 };
  });
  if (cursedTiles.length) tip('tiles');
}

/** Tiles on the floor grid, clear of Tode, the objectives, the shrine and each other. */
function rollCursedSpots(number) {
  const count = Math.min(16, 2 + Math.floor(number * 0.6)) + (coop ? coop.size - 1 : 0);
  const cells = Math.floor((MAP_HALF_SIZE - CURSED.size) / TILE_SIZE);
  const avoid = [
    ...standingTodes().map((tode) => [tode.position, 130]),
    ...(objective?.zones ?? []).map((zone) => [zone.position, ZONE_RADIUS + 50]),
    ...enemies.filter((enemy) => enemy.kind === 'nest').map((enemy) => [enemy.position, 70]),
    ...(shrine ? [[shrine.position, SHRINE_RADIUS + 50]] : []),
  ];
  const spots = [];
  for (let tries = 0; spots.length < count && tries < count * 30; tries++) {
    const x = (Math.floor(Math.random() * cells * 2) - cells) * TILE_SIZE + TILE_SIZE / 2;
    const y = (Math.floor(Math.random() * cells * 2) - cells) * TILE_SIZE + TILE_SIZE / 2;
    const near = (p, r) => (p.x - x) ** 2 + (p.y - y) ** 2 < r * r;
    if (avoid.some(([p, r]) => near(p, r)) || spots.some(([sx, sy]) => (sx - x) ** 2 + (sy - y) ** 2 < (CURSED.size * 1.6) ** 2)) continue;
    spots.push([x, y]);
  }
  return spots;
}

function updateCursedTiles(delta) {
  const time = clock.elapsedTime;
  cursedTiles.forEach((tile, i) => {
    tile.cooldown = Math.max(0, tile.cooldown - delta);
    tile.mesh.material.opacity = tile.cooldown > 0 ? 0.25 : 0.7 + 0.2 * Math.sin(time * 4 + i);
    if (tile.cooldown > 0 || phase !== 'fighting' || player.downed || player.isDashing) return;
    const half = CURSED.size / 2;
    if (Math.abs(player.position.x - tile.x) > half || Math.abs(player.position.y - tile.y) > half) return;
    feats.tileWave = wave;
    if (isGuest()) net.queue('host', { k: 'ambush', i });
    else ambush(i);
    tileTriggered(i);
    share({ k: 'tileHit', i });
    curseTode(tile);
  });
  if (hexLeft > 0) {
    hexLeft = Math.max(0, hexLeft - delta);
    if (Math.random() < delta * 20) particles.burst(player.position, { count: 1, colors: ['#ff2a5a', '#3a0010', '#ff8aa0'], speed: 30, up: 70, size: 1.8, glow: true });
  }
}

/** The curse lands on our own Tode: a heart, a hex, and a ring of stingers closing in on the tile. */
function curseTode(tile) {
  hurtPlayer(wave >= 16 ? 2 : 1);
  hexLeft = CURSED.hex;
  postfx.flash('#ff2a5a', 0.35);
  shake = Math.max(shake, 12);
  const count = Math.min(26, 14 + Math.floor(wave / 2));
  const turn = Math.random() * Math.PI * 2;
  for (let n = 0; n < count; n++) {
    const angle = turn + (n / count) * Math.PI * 2;
    const origin = new THREE.Vector3(tile.x + Math.cos(angle) * CURSED.ring, tile.y + Math.sin(angle) * CURSED.ring, 0);
    sharedStinger(origin, new THREE.Vector3(-Math.cos(angle), -Math.sin(angle), 0), CURSED.ringSpeed, n > 0, CURSED.ring * 2.2);
  }
  hud.showCallout('Hexed! Get out!');
}

/** Everyone: the tile flares up and goes dormant for a while. */
function tileTriggered(i) {
  const tile = cursedTiles[i];
  if (!tile || tile.cooldown > 0) return;
  tile.cooldown = CURSED.rearm;
  const at = new THREE.Vector3(tile.x, tile.y, 0);
  effects.ring(at, { radius: 90, color: '#ff2a5a', duration: 0.5, thickness: 0.25 });
  particles.burst(at, { count: 24, colors: ['#ff2a5a', '#ff8aa0', '#3a0010'], speed: 120, up: 120, size: 2, glow: true });
  play('roar');
}

/** Host: a ring of bees around the tile. */
/** `fromGuest`: a teammate stepped on it (its flare may have arrived first, so the cooldown doesn't count). */
function ambush(i, fromGuest = false) {
  const tile = cursedTiles[i];
  if (!tile || (tile.cooldown > 0 && !fromGuest)) return;
  const count = 5 + Math.floor(wave / 2) + (coop ? coop.size - 1 : 0);
  const kinds = wave >= 12 ? ['zipper', 'brute', 'stinger', 'drone'] : wave >= 6 ? ['zipper', 'drone', 'stinger', 'brute'] : ['zipper', 'drone'];
  const limit = MAP_HALF_SIZE - 30;
  const turn = Math.random() * Math.PI * 2;
  for (let n = 0; n < count; n++) {
    const angle = turn + (n / count) * Math.PI * 2;
    const spot = new THREE.Vector3(tile.x + Math.cos(angle) * 170, tile.y + Math.sin(angle) * 170, 0);
    spot.set(THREE.MathUtils.clamp(spot.x, -limit, limit), THREE.MathUtils.clamp(spot.y, -limit, limit), 0);
    effects.ring(spot, { radius: 36, color: '#ff2a5a', duration: 0.6 });
    // From wave 6 the curse calls an elite to lead the ambush.
    const bee = spawnEnemy(kinds[n % kinds.length], spot, n === 0 && wave >= 6 ? { elite: randomEliteMod() } : undefined);
    if (bee) bee.speed *= 1.2; // they come in angry
  }
}

function clearCursedTiles() {
  cursedWave = 0;
  hexLeft = 0;
  for (const tile of cursedTiles) {
    tile.mesh.removeFromParent();
    tile.mesh.geometry.dispose();
    tile.mesh.material.dispose(); // the texture is shared and stays
  }
  cursedTiles = [];
}

// --- Chaos: hazards falling from the sky and coordinated squads of bees ---------------
// Each arena past the garden has its own hazard from its second wave on, more often deeper into the run.
const HAZARDS = {
  garden: { kind: 'meteor', from: 99 },
  mountain: { kind: 'boulder', from: 7, every: 7, radius: 55, damage: 14 },
  sky: { kind: 'lightning', from: 12, every: 5 },
  cosmos: { kind: 'meteor', from: 16, every: 4.5, radius: 62, damage: 18 },
  hell: { kind: 'brimstone', from: 21, every: 3, radius: 66, damage: 22 },
};
const hazard = { timer: 0, every: 0, squadTimer: 0, squadsLeft: 0, eventTimer: 0, eventEvery: 0 };

function startHazards(number) {
  clearArenaEvents();
  const plan = HAZARDS[arena.id] ?? HAZARDS.garden;
  const active = number >= plan.from || waveMods.has('meteors');
  // A meteor shower is much faster than an arena's own hazard.
  hazard.every = waveMods.has('meteors') ? 1.4 : active ? plan.every / (1 + (number - plan.from) * 0.15) : 0;
  hazard.timer = 3 + Math.random() * 2;
  hazard.squadsLeft = number >= 16 ? 4 + Math.floor((number - 16) / 3) : number >= 11 ? 3 : number >= 8 ? 2 : number >= 4 ? 1 : 0;
  // Arena events: bullet curtains and other patterns sweeping the field, more often deeper in (rarer in boss fights).
  hazard.eventEvery = number >= ARENA_EVENT_FROM ? Math.max(5, 15 - (number - ARENA_EVENT_FROM) * 0.6) * (waveConfig(number).isBoss ? 1.6 : 1) : 0;
  hazard.eventTimer = hazard.eventEvery * 0.5;
  hazard.squadTimer = 7 + Math.random() * 5;
}

function updateHazards(delta) {
  if (isGuest() || phase !== 'fighting') return;
  if (hazard.every > 0 && (hazard.timer -= delta) <= 0) {
    hazard.timer = hazard.every * (0.7 + Math.random() * 0.6);
    // More and more at once: late on the arena is full of them.
    const count = Math.min(8, 1 + Math.floor(Math.max(0, wave - 10) / 3));
    for (let i = 0; i < count; i++) dropHazard(i * 0.2);
  }
  if (hazard.eventEvery > 0 && !arenaEvents.length && (hazard.eventTimer -= delta) <= 0) {
    hazard.eventTimer = hazard.eventEvery * (0.8 + Math.random() * 0.4);
    startArenaEvent();
  }
  if (hazard.squadsLeft > 0 && (hazard.squadTimer -= delta) <= 0) {
    hazard.squadsLeft--;
    hazard.squadTimer = 10 + Math.random() * 6;
    spawnSquad();
  }
}

/** One falling hazard: half aimed near a Tode, half anywhere in the arena. */
function dropHazard(extraDelay) {
  const plan = HAZARDS[arena.id] ?? HAZARDS.garden;
  const todes = standingTodes();
  const tode = todes[Math.floor(Math.random() * todes.length)] ?? player;
  const limit = MAP_HALF_SIZE - 40;
  const spot = Math.random() < 0.5
    ? tode.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 180, (Math.random() - 0.5) * 180, 0))
    : new THREE.Vector3((Math.random() * 2 - 1) * limit, (Math.random() * 2 - 1) * limit, 0);
  spot.x = THREE.MathUtils.clamp(spot.x, -limit, limit);
  spot.y = THREE.MathUtils.clamp(spot.y, -limit, limit);
  if (plan.kind === 'lightning' && !waveMods.has('meteors')) {
    sharedStrike(spot, { damage: 10, radius: 48, delay: 0.9 + extraDelay, hurtsPlayer: true, color: '#fff3c4' });
    return;
  }
  const kind = plan.kind === 'lightning' ? 'meteor' : plan.kind;
  const options = { kind, radius: plan.radius ?? 60, damage: plan.damage ?? 16, delay: 1.25 + extraDelay };
  effects.meteor(spot, options);
  share({ k: 'meteor', p: [spot.x, spot.y], o: options });
}

// --- Arena events: patterns of stingers that sweep the whole field, to dodge or hop-dash through ---------------
// Host only (the bullets are shared). Each event is telegraphed by a callout, and some run for a few seconds.
const ARENA_EVENT_FROM = 7;
const CURTAIN = { spacing: 24, gap: 3, speed: 135 };
const ARENA_EVENTS = [
  { id: 'curtain', from: 7, weight: 3, title: 'Bullet curtain!' },
  { id: 'lighthouse', from: 8, weight: 2, title: 'Lighthouse!' },
  { id: 'noose', from: 9, weight: 2, title: 'The noose!' },
  { id: 'crossfire', from: 11, weight: 2, title: 'Crossfire!' },
  { id: 'double', from: 12, weight: 2, title: 'Double curtain!' },
  { id: 'pincer', from: 14, weight: 2, title: 'Closing walls!' },
  { id: 'rain', from: 16, weight: 2, title: 'Stinger rain!' },
  { id: 'starburst', from: 18, weight: 1, title: 'Starburst!' },
];
const SIDES = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0)];
let arenaEvents = []; // running events: { time, step(event, delta) → true when done }

const randomTode = () => {
  const todes = standingTodes();
  return todes[Math.floor(Math.random() * todes.length)] ?? player;
};
const eventSpeed = () => 1 + Math.max(0, wave - ARENA_EVENT_FROM) * 0.02;

function startArenaEvent(id = null) {
  const tw = vow('hivemind') ? wave + 6 : wave;
  const pool = ARENA_EVENTS.filter((event) => tw >= event.from || event.id === id);
  const event = id ? pool.find((e) => e.id === id) : weightedPick(pool);
  if (!event) return;
  hud.showCallout(event.title);
  play('roar');
  ({
    curtain: () => curtainLine(SIDES[Math.floor(Math.random() * 4)]),
    double: () => {
      const side = SIDES[Math.floor(Math.random() * 4)];
      curtainLine(side, { gapShift: -5 });
      later(1.3, () => curtainLine(side, { gapShift: 5 }));
    },
    crossfire: () => {
      const first = Math.floor(Math.random() * 4);
      curtainLine(SIDES[first]);
      curtainLine(SIDES[first < 2 ? 2 + Math.floor(Math.random() * 2) : Math.floor(Math.random() * 2)]);
    },
    pincer: () => {
      const axis = Math.random() < 0.5 ? 0 : 2;
      curtainLine(SIDES[axis], { gapShift: -3, speedScale: 0.85 });
      curtainLine(SIDES[axis + 1], { gapShift: 3, speedScale: 0.85 });
    },
    rain: () => {
      // Diagonal lines, one after another, each with its gap somewhere else.
      const angle = Math.PI / 4 + Math.floor(Math.random() * 4) * (Math.PI / 2);
      const direction = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0);
      for (let n = 0; n < 3; n++) later(n * 1.1, () => curtainLine(direction, { gapShift: (n - 1) * 6, speedScale: 1.1 }));
    },
    lighthouse: () => lighthouse(),
    noose: () => {
      const tode = randomTode();
      const center = tode.position.clone();
      noose(center, 0);
      later(0.7, () => noose(center, 0.5));
    },
    starburst: () => {
      // Three bursts from points around Tode: rings of stingers that cross each other.
      const tode = randomTode();
      const turn = Math.random() * Math.PI * 2;
      for (let n = 0; n < 3; n++) {
        const angle = turn + (n / 3) * Math.PI * 2;
        const spot = clampToArena(tode.position.clone().add(new THREE.Vector3(Math.cos(angle) * 280, Math.sin(angle) * 280, 0)));
        effects.ring(spot, { radius: 60, color: '#ff4a8a', duration: 0.9 });
        later(0.9 + n * 0.45, () => burstRing(spot, 18, 170 * eventSpeed(), n * 0.17));
      }
    },
  })[event.id]();
}

function weightedPick(pool) {
  let roll = Math.random() * pool.reduce((sum, e) => sum + e.weight, 0);
  return pool.find((e) => (roll -= e.weight) < 0) ?? pool[0];
}

/** Runs `fn` after `delay` seconds of fighting (dropped when the wave or run ends). */
function later(delay, fn) {
  arenaEvents.push({ time: 0, step: (event) => event.time >= delay && (fn(), true) });
}

function updateArenaEvents(delta) {
  if (phase !== 'fighting') return;
  arenaEvents = arenaEvents.filter((event) => {
    event.time += delta;
    return !event.step(event, delta);
  });
}

function clearArenaEvents() {
  arenaEvents = [];
}

function clampToArena(spot, margin = 40) {
  const limit = MAP_HALF_SIZE - margin;
  return spot.set(THREE.MathUtils.clamp(spot.x, -limit, limit), THREE.MathUtils.clamp(spot.y, -limit, limit), 0);
}

/** A wall of stingers sweeping across the arena along `direction`, with one gap near a Tode. */
function curtainLine(direction, { gapShift = 0, speedScale = 1, gap = CURTAIN.gap } = {}) {
  direction = direction.clone().normalize();
  const diagonal = Math.abs(direction.x) > 0.01 && Math.abs(direction.y) > 0.01;
  const edge = (MAP_HALF_SIZE + 20) * (diagonal ? Math.SQRT2 : 1);
  const along = new THREE.Vector3(-direction.y, direction.x, 0);
  const count = Math.ceil((edge * 2) / CURTAIN.spacing);
  // The gap lands near a Tode, so there is always a way through.
  const tode = randomTode();
  const gapAt = THREE.MathUtils.clamp(Math.round((tode.position.dot(along) + edge) / CURTAIN.spacing + gapShift + (Math.random() - 0.5) * 6), 1, count - gap - 1);
  const speed = CURTAIN.speed * eventSpeed() * speedScale;
  for (let i = 0; i < count; i++) {
    if (i >= gapAt && i < gapAt + gap) continue;
    const origin = direction.clone().multiplyScalar(-edge).addScaledVector(along, -edge + i * CURTAIN.spacing);
    // Diagonal lines are longer than the arena is wide: skip the bullets that would never cross it.
    if (diagonal && Math.abs(origin.dot(along)) > MAP_HALF_SIZE * Math.SQRT2) continue;
    sharedStinger(origin, direction, speed, i > 0, edge * 2.4);
  }
}

/** A lighthouse near Tode: two arms of stingers turning around it for a few seconds. */
function lighthouse() {
  const tode = randomTode();
  const angle = Math.random() * Math.PI * 2;
  const origin = clampToArena(tode.position.clone().add(new THREE.Vector3(Math.cos(angle) * 240, Math.sin(angle) * 240, 0)), 60);
  const turn = (Math.random() < 0.5 ? -1 : 1) * (0.9 + Math.random() * 0.3);
  const arms = wave >= 15 ? 3 : 2;
  let heading = Math.atan2(tode.position.y - origin.y, tode.position.x - origin.x) + Math.PI / 2;
  let fireTimer = 0;
  effects.ring(origin, { radius: 70, color: '#ffd36b', duration: 1 });
  particles.burst(origin, { count: 24, colors: ['#ffd36b', '#ffffff'], speed: 120, up: 140, size: 2, glow: true });
  arenaEvents.push({
    time: 0,
    step: (event, delta) => {
      if (event.time < 1) return false; // the warning
      heading += turn * delta;
      if ((fireTimer -= delta) <= 0) {
        fireTimer = 0.085;
        for (let a = 0; a < arms; a++) {
          const theta = heading + (a / arms) * Math.PI * 2;
          const direction = new THREE.Vector3(Math.cos(theta), Math.sin(theta), 0);
          sharedStinger(origin.clone().addScaledVector(direction, 20), direction, 230 * eventSpeed(), true, MAP_HALF_SIZE * 2.4);
        }
      }
      return event.time >= 5.2;
    },
  });
}

/** A ring of stingers around `center`, closing in on it. */
function noose(center, offset) {
  const count = Math.min(40, 26 + Math.floor(wave / 2));
  const radius = 340;
  for (let n = 0; n < count; n++) {
    const angle = ((n + offset) / count) * Math.PI * 2;
    const origin = new THREE.Vector3(center.x + Math.cos(angle) * radius, center.y + Math.sin(angle) * radius, 0);
    sharedStinger(origin, new THREE.Vector3(-Math.cos(angle), -Math.sin(angle), 0), 125 * eventSpeed(), n > 0, radius * 2.2);
  }
}

/** A ring of stingers flying out from `center`. */
function burstRing(center, count, speed, offset = 0) {
  for (let n = 0; n < count; n++) {
    const angle = ((n + offset) / count) * Math.PI * 2;
    const direction = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0);
    sharedStinger(center.clone().addScaledVector(direction, 10), direction, speed, n > 0);
  }
  play('boom');
}

/** Bees working together: an encirclement, a marching phalanx, a firing squad, bombers or a pincer. */
function spawnSquad() {
  const types = ['ring', 'phalanx', 'volley', ...(wave >= 8 ? ['bombers'] : []), ...(wave >= 11 ? ['pincer'] : [])];
  const type = types[Math.floor(Math.random() * types.length)];
  const tode = player.downed ? standingTodes()[0] ?? player : player;
  const center = tode.position;
  const limit = MAP_HALF_SIZE - 30;
  const clamp = (v) => v.set(THREE.MathUtils.clamp(v.x, -limit, limit), THREE.MathUtils.clamp(v.y, -limit, limit), 0);
  const kinds = wave >= 11 ? ['drone', 'zipper', 'brute'] : ['drone', 'zipper'];
  play('roar');
  if (type === 'ring') {
    const count = 8 + Math.floor(wave / 3);
    hud.showCallout('Surrounded!');
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const spot = clamp(center.clone().add(new THREE.Vector3(Math.cos(angle) * 290, Math.sin(angle) * 290, 0)));
      effects.ring(spot, { radius: 40, color: '#ff4040', duration: 0.6 });
      spawnEnemy(kinds[i % kinds.length], spot, { elite: null });
    }
  } else if (type === 'phalanx') {
    // A wall of bees sweeps across the arena from one side.
    const side = Math.floor(Math.random() * 4);
    const along = side % 2 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const march = side === 0 ? new THREE.Vector3(1, 0, 0) : side === 1 ? new THREE.Vector3(0, -1, 0) : side === 2 ? new THREE.Vector3(-1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const start = march.clone().multiplyScalar(-limit);
    const count = 9 + Math.floor(wave / 4);
    hud.showCallout('Phalanx!');
    for (let i = 0; i < count; i++) {
      const spot = clamp(start.clone().addScaledVector(along, ((i + 0.5) / count - 0.5) * limit * 1.8));
      const bee = spawnEnemy(wave >= 11 && i % 3 === 0 ? 'brute' : 'drone', spot, { elite: null });
      if (bee) {
        bee.march = march.clone();
        bee.marchLeft = (limit * 2) / (bee.speed * 1.4);
      }
    }
  } else if (type === 'bombers') {
    // A line of fast bees flies straight over Tode, dropping stingers to both sides as it passes.
    const angle = Math.atan2(center.y, center.x) + Math.PI + (Math.random() - 0.5) * 1.2;
    const march = new THREE.Vector3(-Math.cos(angle), -Math.sin(angle), 0);
    const side = new THREE.Vector3(-march.y, march.x, 0);
    const count = 4 + Math.floor(wave / 5);
    hud.showCallout('Bombing run!');
    for (let i = 0; i < count; i++) {
      const spot = clamp(center.clone().addScaledVector(march, -460 - i * 50).addScaledVector(side, (i % 2 ? 1 : -1) * 18));
      const bee = spawnEnemy('zipper', spot, { elite: null });
      if (bee) {
        bee.march = march.clone();
        bee.marchLeft = 1200 / (bee.speed * 1.4);
        bee.bomber = { timer: 0.5 + i * 0.12, side: side.clone() };
        effects.ring(spot, { radius: 30, color: '#ff8a2a', duration: 0.6 });
      }
    }
  } else if (type === 'pincer') {
    // Two phalanxes from opposite sides at once.
    const axis = Math.random() < 0.5 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const along = new THREE.Vector3(-axis.y, axis.x, 0);
    const count = 6 + Math.floor(wave / 5);
    hud.showCallout('Pincer squad!');
    for (const sign of [1, -1]) {
      const march = axis.clone().multiplyScalar(sign);
      for (let i = 0; i < count; i++) {
        const spot = clamp(march.clone().multiplyScalar(-limit).addScaledVector(along, ((i + 0.5) / count - 0.5) * limit * 1.8));
        const bee = spawnEnemy(i % 3 === 0 ? 'brute' : 'drone', spot, { elite: null });
        if (bee) {
          bee.march = march.clone();
          bee.marchLeft = limit / (bee.speed * 1.4);
        }
      }
    }
  } else {
    // Stingers in an arc that fire together.
    const count = 5 + Math.floor(wave / 6);
    hud.showCallout('Firing squad!');
    const facing = Math.random() * Math.PI * 2;
    for (let i = 0; i < count; i++) {
      const angle = facing + ((i / (count - 1)) - 0.5) * 1.6;
      const spot = clamp(center.clone().add(new THREE.Vector3(Math.cos(angle) * 260, Math.sin(angle) * 260, 0)));
      const bee = spawnEnemy('stinger', spot, { elite: null });
      if (bee) bee.attackTimer = 1.4;
    }
  }
}

function updateWave(delta) {
  phaseTimer -= delta;

  if (phase === 'intro' && phaseTimer <= 0) {
    setPhase('fighting');
    if (wave === 1) tip('move');
    if (wave === 2) tip('dash');
    if (config.isBoss && !isGuest()) {
      const boss = spawnEnemy(config.boss, farthestCorner(), { elite: null });
      if (boss) startBossIntro(boss);
    }
  } else if (phase === 'fighting' && !isGuest()) {
    spawnTimer -= delta;
    // Bigger swarms in every arena: a bullet hell needs a horde.
    const maxAlive = Math.min(130, MAX_ALIVE_ENEMIES + 6 * ARENAS.indexOf(arena) + 2 * Math.max(0, wave - 12) + (coop ? 12 * (coop.size - 1) : 0));
    if (spawnQueue.length && spawnTimer <= 0 && aliveEnemies().length < maxAlive) {
      if (spawnEnemy(spawnQueue[0])) spawnQueue.shift();
      spawnTimer = config.spawnInterval;
    }
    const beesLeft = spawnQueue.length + aliveEnemies().filter((enemy) => !enemy.type.structure).length;
    hud.setWave(wave, beesLeft);
    if (beesLeft === 0 && gateOpen()) waveCleared();
    else if (beesLeft === 0 && !objective.announced) {
      objective.announced = true;
      hud.showBanner('The way on is sealed!', `${objective.def.icon} ${objective.def.label} to open it`, 2.6);
      play('roar');
    }
  } else if (phase === 'cleared' && phaseTimer <= 0) {
    offerRewards();
  }
}

function waveCleared() {
  leaves.vacuum();
  charmDrops.vacuum();
  clearShrine();
  feats.cleanWaves = wave >= 5 && !hitThisWave ? feats.cleanWaves + 1 : 0;
  if (feats.cleanWaves >= 3) achieve('untouchable');
  if (player.hp === 1 && !player.downed) achieve('whisker');
  if (feats.bitterWave === wave) achieve('bitter');
  // A whole arena past the garden (its waves with tiles, then its boss) without setting off a cursed tile.
  if (wave >= 10 && wave % 5 === 0 && feats.tileWave <= wave - 5) achieve('lightfeet');
  if (coop?.host) share({ k: 'cleared' });
  const bonus = WAVE_CLEAR_BONUS * wave;
  points += bonus;
  const heal = player.stats.waveHeal;
  player.heal(heal);
  updateHealth();
  hud.setWave(wave, 0);
  setPhase('cleared', WAVE_CLEARED_TIME);
  if (!config.isBoss) {
    play('waveClear');
    hud.showBanner('Wave cleared!', `+${bonus} points · +${heal} heart${heal > 1 ? 's' : ''}`, WAVE_CLEARED_TIME);
  }
}

function offerRewards() {
  // While the menus are open, get the next arena ready.
  const upcoming = arenaForWave(wave + 1);
  if (upcoming !== arena) setTimeout(() => prepareArena(upcoming), 150);
  if (wave === HELL_WAVE && coop) {
    if (coop.host) {
      share({ k: 'over', v: true });
      endRun({ victory: true });
    }
    return;
  }
  if (wave === HELL_WAVE && !endless) {
    meta.victories++;
    saveMeta();
    startEnding();
    return;
  }
  if (wave >= ULTIMATE_WAVE && !player.ultimate) {
    setPhase('ultimate');
    hud.showUltimates();
    return;
  }
  offerNextReward();
}

/** Between waves: skill picks for the levels gained (co-op saves them up), then a brew. */
function offerNextReward() {
  if (pendingLevels > 0 && !skillPickedThisBreak && openLevelUp()) return;
  offerBrews();
}

let offeringBonus = false; // the offer on screen is a Bitter Shrine's Epic pick (no rerolls)

/** `bonus`: the Bitter Shrine's extra pick, always Epic. */
function offerBrews(bonus = false) {
  offers = seeded(() => rollBrews(brewLevels, { wave, luck, hasUltimate: !!player.ultimate, minRarity: bonus ? 2 : 0 }));
  if (!offers.length) {
    afterReward();
    return;
  }
  setPhase('choosing');
  offeringBonus = bonus;
  hud.showBrews(wave, offers, rerolls, { first: firstOffer, steep }, bonus);
  firstOffer = false;
}

function chooseBrew(index) {
  const offer = offers[index];
  if (!offer || phase !== 'choosing') return;
  const { brew, value, level } = offer;
  brewLevels.set(brew.id, level);
  brewTexts.set(brew.id, describe(offer));
  brew.apply(player, value);
  play(brew.kind === 'brew' ? 'pick' : 'legendary');
  if (brew.kind === 'duo' || brew.kind === 'legendary') achieve(brew.kind);
  if (brew.kind === 'legendary' && ++feats.legendaries >= 2) achieve('legendary2');
  meta.blendPicks ??= {};
  for (const blend of brew.blends ?? [brew.blend]) meta.blendPicks[blend] = (meta.blendPicks[blend] ?? 0) + 1;
  tip('brew');
  if (brew.kind !== 'brew') {
    postfx.flash(brew.kind === 'legendary' ? '#ffd36b' : '#ffffff', 0.35);
    effects.ring(player.position, { radius: 90, color: brew.kind === 'legendary' ? '#ffb000' : '#ffffff', duration: 0.6 });
  }
  updateHealth();
  refreshOwned();
  hud.hideMenu();
  if (bonusPicks > 0) {
    bonusPicks--;
    offerBrews(true);
    return;
  }
  afterReward();
}

function chooseUltimate(index) {
  if (phase !== 'ultimate') return;
  const ultimate = Object.values(ULTIMATES)[index];
  if (!ultimate) return;
  player.ultimate = ultimate.id;
  player.gauge = fullGaugeStart ? 100 : 30; // a taste of power right away (the Tiny Crown: all of it)
  play('legendary');
  postfx.flash('#fff2c0', 0.5);
  hud.hideMenu();
  afterReward();
}

function chooseSkill(index) {
  const offer = offers[index];
  if (!offer || phase !== 'skill') return;
  skills.learn(offer.skill.id);
  pendingLevels = Math.max(0, pendingLevels - 1);
  if (skills.slots.length >= 3) achieve('skills3');
  if (skills.slots.length >= 6) achieve('skills6');
  if (skills.slots.some((slot) => slot.level >= 5)) achieve('mastery');
  tip('skill');
  play('legendary');
  effects.ring(player.position, { radius: 90, color: '#3fd0c0', duration: 0.6 });
  hud.hideMenu();
  hud.setXp(leafXp / leavesForLevel(playerLevel), playerLevel, pendingLevels);
  const resume = levelReturn;
  levelReturn = null;
  if (!resume) {
    skillPickedThisBreak = true;
    offerNextReward();
    return;
  }
  // Mid-wave: maybe a transformation, then back to the fight. More levels come one at a time, a few seconds apart.
  fightTime = 0;
  const tier = ascension.tierFor(power());
  if (tier > ascension.tier) startAscension(tier, resume);
  else setPhase(resume.phase, resume.timer);
}

function saveSettings() {
  safeStorage('set', 'tode-settings', JSON.stringify(settings));
}

function reroll() {
  if (phase !== 'choosing' || rerolls <= 0 || offeringBonus) return;
  rerolls--;
  play('click');
  offers = seeded(() => rollBrews(brewLevels, { wave, luck, hasUltimate: !!player.ultimate }));
  hud.showBrews(wave, offers, rerolls, { steep });
}

const brewColor = (brew) => brew.color ?? BLENDS[brew.blend ?? brew.blends[0]].color;

function refreshOwned() {
  hud.setOwned(
    [...brewLevels].map(([id, level]) => {
      const brew = brewById(id);
      return { icon: brew.icon, name: brew.name, level, color: brewColor(brew) };
    })
  );
}

/** Brews (duo and legendary count double) and the ultimate make Tode ascend. */
function power() {
  let total = player.ultimate ? 2 : 0;
  for (const slot of skills.slots) total += 1 + slot.level;
  for (const [id, level] of brewLevels) total += { brew: level, curse: 1 }[brewById(id).kind] ?? 2;
  return total;
}

function afterReward() {
  const tier = ascension.tierFor(power());
  if (tier > ascension.tier) startAscension(tier);
  else nextWave();
}

/** Solo: on to the next wave. Co-op: tell the host we're ready; it starts once everyone is. */
function nextWave() {
  if (!coop) {
    startWave(wave + 1);
    return;
  }
  setPhase('waiting');
  if (coop.host) markReady(net.id);
  else net.queue('host', { k: 'ready' });
}

// --- Story cut-scene (first run only) ---
const STORY_TIME = 9.5;
const STORY_LINES = [
  [0.3, 'A quiet morning in the garden.'],
  [2.6, 'The kettle sings. The tea is nearly perfect…'],
  [4.9, '…and then, the buzzing begins.'],
  [7.4, 'Not. On. My. Watch.'],
];
let storyTime = 0;
let storyLine = 0;
let storyBees = [];

function startStory() {
  stopDaily();
  setPhase('story');
  storyTime = 0;
  storyLine = 0;
  orbiting = true;
  hud.hideMenu();
  hud.showStory();
  ascension.setTier(0);
  // A few bees burst out of the far hive (visual only, not part of the wave).
  const hive = spawnPoints()[3]; // across the pond: a clear view of the swarm
  storyBees = [0, 1, 2, 3].map((i) => {
    const bee = new Enemy('drone');
    bee.position.copy(hive).add(new THREE.Vector3(i * 14 - 20, -i * 10, 0));
    scene.add(bee.group);
    return bee;
  });
}

function updateStory(delta) {
  storyTime += delta;
  const t = storyTime;
  while (storyLine < STORY_LINES.length && t >= STORY_LINES[storyLine][0]) hud.setStoryLine(STORY_LINES[storyLine++][1]);

  const hive = spawnPoints()[3]; // across the pond: a clear view of the swarm
  const tode = player.position;
  if (t < 4.7) {
    // Close-up: a slow push in on Tode.
    const angle = -0.9 + t * 0.08;
    const distance = 150 - t * 12;
    camera.position.set(Math.cos(angle) * distance, Math.sin(angle) * distance, 45);
    camera.lookAt(tode.x, tode.y, tode.z + 12);
  } else if (t < 7.2) {
    // The swarm: look toward the hive as the bees pour out.
    const toHive = hive.clone().sub(tode).setZ(0);
    const k = Math.min(1, (t - 4.7) / 0.8);
    const from = new THREE.Vector3(60, -60, 50);
    const to = toHive.clone().multiplyScalar(0.35).add(new THREE.Vector3(60, -60, 70));
    camera.position.lerpVectors(from, to, k * k * (3 - 2 * k));
    camera.lookAt(tode.x + toHive.x * 0.75, tode.y + toHive.y * 0.75, 20);
    for (const bee of storyBees) {
      bee.update(delta);
      const step = tode.clone().sub(bee.position).setZ(0).normalize().multiplyScalar(110 * delta);
      bee.position.add(step);
      bee.faceTowards(tode);
    }
  } else {
    // Back to Tode, who powers up.
    const k = Math.min(1, (t - 7.2) / 0.6);
    camera.position.set(80 - k * 20, -80 + k * 20, 40 - k * 8);
    camera.lookAt(tode.x, tode.y, tode.z + 14);
    if (!storyBees.flared && t > 7.5) {
      player.rig.play('victory', { once: true, length: 2 });
      storyBees.flared = true;
      play('ascend');
      shake = 10;
      postfx.flash('#ffe9a0', 0.6);
      postfx.pulse({ bloom: 1.2, aberration: 0.8 });
      effects.ring(tode, { radius: 160, color: '#ffe680', duration: 0.7, thickness: 0.25 });
      particles.burst(tode, { count: 60, colors: ['#ffffff', '#ffe680', '#ffc93c'], speed: 240, up: 160, size: 2.2, glow: true });
    }
  }
  if (t >= STORY_TIME) endStory();
}

function endStory() {
  for (const bee of storyBees) bee.dispose();
  storyBees = [];
  hud.hideBossIntro();
  meta.seenStory = true;
  saveMeta();
  startRun();
}

// --- Ending cut-scene (after the Empress) ---
const ENDING_TIME = 12;
const ENDING_LINES = [
  [0.3, 'Bee-zebub is banished. The hive is silent at last.'],
  [3.2, 'Tode climbs out of the Underworld and hops home…'],
  [6.0, '…and pours himself a fresh cup.'],
  [8.6, 'It is, at last, perfectly steeped. ☕'],
];
const tableSpot = new THREE.Vector3();

function startEnding() {
  setPhase('ending');
  storyTime = 0;
  storyLine = 0;
  orbiting = true;
  clearWorld();
  setArena(ARENAS[0]); // home again
  ascension.setTier(0); // and just Tode again: a frog with a cup of tea
  hud.setForm('', 0);
  hud.showStory();
  hud.menu.hidden = true;
  tableSpot.set(TEA_TABLE.x, TEA_TABLE.y, 0);
  player.position.set(TEA_TABLE.x + 26, TEA_TABLE.y - 24, 0);
  player.aimAt(tableSpot);
  music.play('garden', 0);
}

function updateEnding(delta) {
  storyTime += delta;
  const t = storyTime;
  while (storyLine < ENDING_LINES.length && t >= ENDING_LINES[storyLine][0]) hud.setStoryLine(ENDING_LINES[storyLine++][1]);

  // Orbit the tea table, then pull far back to show the world Tode made.
  const pull = Math.max(0, (t - 8.4) / 3.6);
  const angle = -1.2 + t * 0.12;
  const distance = 110 + pull * pull * 380;
  const height = 55 + pull * pull * 300;
  const local = new THREE.Vector3(Math.cos(angle) * distance, Math.sin(angle) * distance, height);
  camera.position.copy(local.add(tableSpot).sub(player.position));
  camera.lookAt(tableSpot.x, tableSpot.y, 12);

  // …and pours himself a fresh cup (every class sips: it's tea time).
  if (t > 5.8 && !updateEnding.sipped) {
    updateEnding.sipped = true;
    player.rig.play('sip', { once: true, length: 4 });
  }
  if (t > 6 && Math.random() < 0.4) {
    particles.burst(tableSpot.clone().add(new THREE.Vector3(-3, 0, 0)), { count: 1, colors: ['#ffffff', '#f3eadf'], speed: 6, up: 30, gravity: -10, height: 26, size: 2, life: 1.4 });
  }
  if (t > 8.6 && !updateEnding.sparkled) {
    updateEnding.sparkled = true;
    play('legendary');
    postfx.flash('#fff2c0', 0.4);
    particles.burst(player.position, { count: 70, colors: ['#ffffff', '#ffe680', '#ffd6f5'], speed: 200, up: 220, size: 2.2, glow: true });
  }
  if (t >= ENDING_TIME) {
    updateEnding.sparkled = false;
    updateEnding.sipped = false;
    hud.hideBossIntro();
    setPhase('victory');
    play('victory');
    hud.showVictory();
  }
}

// --- Boss entrance ---
function startBossIntro(boss) {
  if (coop?.host) share({ k: 'bossIntro', id: boss.netId });
  introBoss = boss;
  setPhase('bossIntro', BOSS_INTRO_TIME);
  music.play('boss', 4);
  // Bosses remember Tode: who won last time, and how often.
  const memory = bossMemory(boss.kind);
  const taunt = bossTaunt(boss.kind, memory);
  memory.met++;
  saveMeta();
  hud.showBossIntro(boss.type.name, BOSS_EPITHETS[boss.kind] ?? '', taunt);
  // It speaks once its roar has died down, as the line appears on its card (see .boss-card-taunt).
  babble(BOSS_VOICES[boss.kind], taunt, BOSS_SPEAKS_AT, 32);
  hud.setBoss(boss);
}

function updateBossIntro(delta) {
  const elapsed = BOSS_INTRO_TIME - phaseTimer;
  phaseTimer -= delta;
  introBoss.update(delta);
  introBoss.faceTowards(player.position);

  // Pan over to the boss, hold, then swing back.
  const toBoss = introBoss.position.clone().sub(player.position).setZ(0);
  const pan = elapsed < 0.8 ? elapsed / 0.8 : phaseTimer < 0.6 ? Math.max(0, phaseTimer / 0.6) : 1;
  cameraPan.copy(toBoss).multiplyScalar(0.5 - 0.5 * Math.cos(pan * Math.PI));
  cameraZoom = 1 - 0.25 * Math.sin(Math.min(1, elapsed / BOSS_INTRO_TIME) * Math.PI);

  if (elapsed >= BOSS_ROARS_AT && !introBoss.ai.roared) {
    introBoss.ai.roared = true;
    play('roar');
    shake = 12;
    effects.ring(introBoss.position, { radius: 220, color: '#ffb000', duration: 0.6, thickness: 0.2 });
  }
  if (phaseTimer <= 0) {
    cameraPan.set(0, 0, 0);
    cameraZoom = 1;
    hud.hideBossIntro();
    introBoss = null;
    setPhase('fighting');
  }
}

// --- Ascension cut-scene ---
const TRANSFORM_AT = 2.1; // seconds into the cut-scene: the moment of transformation

let ascendResume = null;

/** `resume` (a mid-wave transformation): the fight to go back to; otherwise the next wave follows. */
let titleMoveIn = 3;

function startAscension(tier, resume = null) {
  player.rig.play('victory', { once: true, length: ASCEND_DURATION });
  ascendResume = resume;
  ascendingTo = tier;
  setPhase('ascending', ASCEND_DURATION);
  music.play(config?.isBoss ? 'boss' : tier >= 4 ? 'divine' : 'battle', Math.min(4, tier + 1));
  play('ascend');
}

let ascendPillar = null; // the pillar of light at the moment of transformation

function updateAscending(delta) {
  const elapsed = ASCEND_DURATION - phaseTimer;
  phaseTimer -= delta;
  const color = STAGE_COLORS[ascendingTo];
  const charge = Math.min(1, elapsed / TRANSFORM_AT);

  // Zoom in, rise, gather power… then burst.
  const zoom =
    elapsed < TRANSFORM_AT
      ? 1 - 0.45 * Math.min(1, elapsed / 0.9)
      : 0.55 + 0.45 * Math.max(0, Math.min(1, (elapsed - TRANSFORM_AT - 0.8) / 0.7));
  cameraZoom = THREE.MathUtils.clamp(zoom, 0.55, 1);
  const lift = Math.sin(Math.min(1, elapsed / ASCEND_DURATION) * Math.PI) * 26;
  player.model.position.z = player.groundOffset + lift;
  player.adornments.position.z = lift;

  if (elapsed < TRANSFORM_AT) {
    // The quake builds, the ground cracks, rocks float up, lightning strikes around him.
    shake = Math.max(shake, 1 + charge * charge * 9);
    particles.burst(player.position, { count: 6, colors: ['#ffffff', color], ring: 90, speed: -190, up: 0, gravity: -20, height: 10 + lift, life: 0.5, glow: true });
    // Stars and sparks pour into him from all around, faster and faster.
    ascension.charge(delta, ascendingTo, charge);
    if (Math.random() < delta * 14) {
      particles.burst(player.position, { count: 2, colors: ['#8a7a6a', '#6a5a4a', '#a89880'], ring: 40 + Math.random() * 80, speed: 5, up: 40, gravity: -25, size: 2.6, height: 1, life: 1.6 });
    }
    if (ascendingTo >= 2 && Math.random() < delta * (4 + charge * 10)) {
      const angle = Math.random() * Math.PI * 2;
      const ground = player.position.clone().add(new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0).multiplyScalar(30 + Math.random() * 90));
      effects.bolt(ground.clone().add(new THREE.Vector3(0, 0, 400)), ground.setZ(1), { color, width: 3, life: 0.15, jitter: 18 });
      play('zap');
    }
    if (Math.random() < delta * 3) effects.ring(player.position, { radius: 60 + charge * 140, color, duration: 0.4 });
    if (charge > 0.55 && !updateAscending.roared) {
      updateAscending.roared = true;
      play('roar');
    }
    postfx.pulse({ bloom: charge * 1.2, aberration: charge * 0.6, warp: charge * 0.4 });
  } else if (ascension.tier !== ascendingTo) {
    updateAscending.roared = false;
    ascension.setTier(ascendingTo);
    achieve(['', 'awakened', 'golden', 'radiant', 'god', 'infinite'][ascendingTo]);
    divinity.setTier(ascendingTo);
    const { banner, sub, name } = TIERS[ascendingTo];
    hud.setForm(name, ascendingTo);
    hud.showBanner(banner, sub, 2.4, 'ascend');
    postfx.flash(color, 0.8);
    postfx.pulse({ bloom: 1.4, warp: 1.2, aberration: 1.2 });
    postfx.shatter(0.45 + ascendingTo * 0.1, 0.6);
    shake = 26;
    play('boom');
    for (const [radius, duration] of [[320, 1], [220, 0.7], [140, 0.45]]) {
      effects.ring(player.position, { radius, color: radius > 200 ? color : '#ffffff', duration, thickness: 0.22 });
    }
    particles.burst(player.position, { count: 110, colors: ['#ffffff', color, '#ffe680'], speed: 360, up: 240, size: 2.6, life: 1, glow: true });
    // A pillar of light shoots into the sky.
    ascendPillar = new THREE.Mesh(new THREE.CylinderGeometry(26, 40, 900, 32, 1, true).rotateX(Math.PI / 2).translate(0, 0, 450), additive(color, 0.6));
    ascendPillar.position.copy(player.position);
    scene.add(ascendPillar);
    if (ascendingTo >= 4) weather.setCosmic(true);
    meta.maxTier = Math.max(meta.maxTier, ascendingTo);
  }
  if (ascendPillar) {
    const t = (elapsed - TRANSFORM_AT) / (ASCEND_DURATION - TRANSFORM_AT);
    ascendPillar.scale.set(1 - t * 0.7, 1 - t * 0.7, 1);
    ascendPillar.material.opacity = 0.6 * (1 - t);
    if (t >= 1 || phaseTimer <= 0) {
      disposeTree(ascendPillar);
      ascendPillar = null;
    }
  }

  if (phaseTimer <= 0) {
    cameraZoom = 1;
    if (ascendResume) {
      setPhase(ascendResume.phase, ascendResume.timer);
      ascendResume = null;
    } else {
      nextWave();
    }
  }
}

// --- Co-op ---------------------------------------------------------------------------
const KINDS = ['drone', 'zipper', 'brute', 'stinger', 'queen', 'empress', 'beezebub', 'shogun', 'seraph', 'nest', 'ward', 'nurse', 'guardian'];
const MODS = Object.keys(ELITE_MODS);
const COOP_TILES = [SOLO_TILES, 31, 35, 41]; // garden size by number of players
const SNAPSHOT_RATE = 15; // host bee snapshots per second
const STATE_RATE = 20; // own-Tode updates per second
const READY_TIMEOUT = 40; // seconds the host waits for slow pickers
let snapshotTimer = 0;
let stateTimer = 0;
let readySince = 0;
let coopScore = 0;
let pendingIntro = null;
let coopMenuOpen = false;
let lobbyError = null;

const vec = ([x, y], z = 0) => new THREE.Vector3(x, y, z);

/** Hooks for replaying a teammate's skills and ultimates: same visuals, no damage on our side. */
function remoteCtx(remote, aim) {
  const quietFx = {
    flash: (color, amount) => postfx.flash(color, amount * 0.3),
    pulse: ({ bloom = 0, warp = 0, aberration = 0 }) => postfx.pulse({ bloom: bloom * 0.4, warp: warp * 0.4, aberration: aberration * 0.4 }),
  };
  const visualEffects = {
    addEffect: (effect) => effects.addEffect(effect),
    bolt: (...args) => effects.bolt(...args),
    ring: (...args) => effects.ring(...args),
    warning: (...args) => effects.warning(...args),
    strike: (position, options) => effects.strike(position, { ...options, hitsBees: false }),
    pool: (position, options) => effects.pool(position, { ...options, dps: 0 }),
    blast: (position, { radius, color, particleColors }) => {
      effects.ring(position, { radius, color, duration: 0.35 });
      if (particleColors) particles.burst(position, { count: 10, colors: particleColors, speed: radius * 2.5, up: 80, size: 1.5, height: 8 });
    },
    chain: () => {},
  };
  return {
    ...ctx,
    player: remote.puppet,
    postfx: quietFx,
    effects: visualEffects,
    shake: (amount) => ctx.shake(amount * 0.3),
    aliveEnemies: () => [],
    damageEnemy: () => {},
    hurtPlayer: () => {},
    lightningHit: () => {},
    fireSpit: () => {}, // their spits arrive as their own 'spit' messages
    aimGround: aim,
    onSkillCast: null,
  };
}

function snapshot() {
  const flags = (enemy) =>
    (enemy.dying ? 1 : 0) |
    (enemy.burnLeft > 0 ? 2 : 0) |
    (enemy.slowLeft > 0 ? 4 : 0) |
    (enemy.isFrozen ? 8 : 0) |
    (enemy.glow > 0.3 ? 16 : 0) |
    (enemy.ai.mode === 'charge' ? 32 : 0) |
    (enemy.shielded ? 64 : 0) |
    (enemy.ai.staggerLeft > 0 ? 128 : 0) |
    (enemy.enraged ? 256 : 0);
  return {
    k: 'snap',
    sc: Math.floor(score),
    w: wave,
    left: spawnQueue.length + aliveEnemies().length,
    e: enemies.map((enemy) => [
      enemy.netId,
      KINDS.indexOf(enemy.kind),
      enemy.eliteId ? MODS.indexOf(enemy.eliteId) : -1,
      Math.round(enemy.position.x),
      Math.round(enemy.position.y),
      Math.round(enemy.model.rotation.y * 100) / 100,
      Math.ceil(enemy.hp),
      enemy.maxHp,
      flags(enemy),
    ]),
  };
}

function createMirror(id, kind, elite, x, y) {
  const enemy = new Enemy(kind, { elite });
  enemy.netId = id;
  enemy.netTarget = new THREE.Vector3(x, y, 0);
  enemy.position.set(x, y, 0);
  enemy.glowColor.set(kind === 'stinger' ? 0xd18cff : 0xff3b1f);
  // Burns and chills we cause are the host's business too.
  enemy.onStatus = (type, a, b) => net.queue('host', { k: 'st', id, t: type, a, b });
  enemies.push(enemy);
  mirrors.set(id, enemy);
  scene.add(enemy.group);
  if (!enemy.type.boss) hud.attachHealthBar(enemy);
  if (enemy.type.ward || kind === 'guardian') claimOwner(enemy);
  if (pendingIntro === id) {
    pendingIntro = null;
    startBossIntro(enemy);
  }
  return enemy;
}

function applySnapshot(snap) {
  coopScore = snap.sc;
  if (phase === 'fighting') hud.setWave(snap.w, snap.left);
  const seen = new Set();
  for (const [id, kind, mod, x, y, rotation, hp, maxHp, flags] of snap.e) {
    seen.add(id);
    let enemy = mirrors.get(id);
    if (!enemy) {
      if (flags & 1) continue;
      enemy = createMirror(id, KINDS[kind], MODS[mod] ?? null, x, y);
    }
    enemy.netTarget.set(x, y, 0);
    enemy.model.rotation.y = rotation;
    enemy.maxHp = maxHp;
    if (enemy.dying) continue;
    enemy.hp = hp;
    enemy.burnLeft = flags & 2 ? 0.3 : 0;
    enemy.slowLeft = flags & 12 ? 0.3 : 0;
    enemy.slow = flags & 8 ? 1 : 0.4;
    enemy.glow = flags & 16 ? 1 : 0;
    enemy.ai.mode = flags & 32 ? 'charge' : 'chase';
    if (Boolean(flags & 64) !== Boolean(enemy.shielded)) enemy.setShield(flags & 64);
    enemy.ai.staggerLeft = flags & 128 ? 1 : 0;
    enemy.enraged = Boolean(flags & 256);
    if (flags & 1) {
      enemy.die();
      dropLeaves(enemy);
      dropCharms(enemy);
      if (enemy.kind === 'nest') objectiveDone();
      if (enemy.type.ward || enemy.kind === 'guardian') wardSmashed(enemy);
      hud.removeHealthBar(enemy);
    }
    if (enemy.type.boss && !enemy.dying) {
      hud.setBoss(enemy);
      const enrage = BOSS_SCRIPTS[enemy.kind]?.enrage;
      hud.setBossTimer(enrage && !enemy.enraged ? enrage - enemy.age + BOSS_INTRO_TIME : null);
    }
  }
  for (const [id, enemy] of mirrors) {
    if (seen.has(id) || enemy.dying) continue;
    enemy.die();
    hud.removeHealthBar(enemy);
    if (enemy.ai.telegraph) removeTelegraph(enemy.ai.telegraph);
  }
}

function hostApplyHit({ id, dm, kx, ky }, from) {
  const enemy = enemies.find((e) => e.netId === id && !e.dying);
  if (!enemy || (enemy.owner && enemy.owner !== from && !ownerAway(enemy.owner))) return; // attuned to someone else
  const force = Math.hypot(kx, ky);
  damageEnemy(enemy, dm, force > 0 ? new THREE.Vector3(kx / force, ky / force, 0) : null, force, 'net');
}

/** Everything that arrives from teammates. */
function handleNet(from, message) {
  const remote = coop?.remotes.get(from);
  const mirror = () => mirrors.get(message.id);
  switch (message.k) {
    case 'me':
      remote?.applyState(message);
      if (coop?.host && message.down) checkAllDown();
      break;
    case 'snap':
      if (isGuest()) applySnapshot(message);
      break;
    case 'hit':
      if (coop?.host) hostApplyHit(message, from);
      break;
    case 'st': {
      const enemy = coop?.host && enemies.find((e) => e.netId === message.id);
      if (enemy && message.t === 'burn') enemy.applyBurn(message.a, message.b);
      if (enemy && message.t === 'slow') enemy.applySlow(message.a, message.b);
      break;
    }
    case 'sting':
      launchStinger(vec(message.o), vec(message.d), message.s, message.q, message.r);
      break;
    case 'fring':
      launchFireRing(vec(message.o));
      break;
    case 'meteor':
      effects.meteor(vec(message.p), { ...message.o, hitsBees: false, hurtsPlayer: !player.downed });
      break;
    case 'bomb':
      launchBomb(vec(message.o), vec(message.t), false);
      break;
    case 'decoy':
      placeDecoy(vec(message.p));
      break;
    case 'strike':
      effects.strike(vec(message.p), {
        damage: message.dm,
        radius: message.r,
        delay: message.dl,
        hurtsPlayer: message.h && !player.downed,
        hitsBees: false,
        color: message.c,
        from: message.f && new THREE.Vector3(...message.f),
      });
      break;
    case 'tele': {
      const boss = mirror();
      if (boss) boss.ai.telegraph = addTelegraph(vec(message.o), vec(message.d), message.l, message.w);
      break;
    }
    case 'teleOff':
      if (mirror()?.ai.telegraph) removeTelegraph(mirror().ai.telegraph);
      break;
    case 'roar':
      if (mirror()) roarEffects(mirror());
      break;
    case 'boom': {
      const position = vec(message.p);
      effects.warning(position, { radius: 75, delay: 0.7, color: '#ff6a3d', onDone: () => explosionEffects(position) });
      break;
    }
    case 'spit':
      visualSpit(vec(message.o), vec(message.d), message.s, message.r, message.rad, message.st);
      remote?.puppet.rig?.flick();
      break;
    case 'splash':
      splashVisual(vec(message.p), message.r, message.c);
      break;
    case 'ult':
      if (remote) {
        remote.puppet.facing.copy(new THREE.Vector3(message.a[0], message.a[1], 0).sub(remote.position).setZ(0).normalize());
        startUltimate(message.id, remoteCtx(remote, vec(message.a)));
      }
      break;
    case 'skill':
      if (remote) SKILLS[message.id]?.cast(remoteCtx(remote, vec(message.t)), vec(message.t), message.lv);
      break;
    case 'start':
      startCoopRun(message.players);
      break;
    case 'wave':
      if (isGuest()) {
        if (['choosing', 'ultimate', 'skill'].includes(phase)) hud.hideMenu(); // the host moved on without us
        startWave(message.n, message.wx, message.m ?? []);
      }
      break;
    case 'cleared':
      if (isGuest() && (phase === 'fighting' || phase === 'intro')) waveCleared();
      break;
    case 'ready':
      if (coop?.host) markReady(from);
      break;
    case 'readyCount':
      if (phase === 'waiting') hud.setWaiting(message.r, message.t);
      break;
    case 'bossIntro':
      if (mirror()) startBossIntro(mirror());
      else pendingIntro = message.id;
      break;
    case 'fin':
      finisher(message.big);
      break;
    case 'tiles':
      setupCursedTiles(message.n, message.t);
      break;
    case 'tileHit':
      tileTriggered(message.i);
      break;
    case 'ambush':
      if (coop?.host) {
        ambush(message.i, true);
        tileTriggered(message.i);
      }
      break;
    case 'ward':
      if (mirror()) beginRaid(mirror(), message.t, message.p.map((p) => vec(p)));
      // Who each ward or guardian belongs to (some may already be here, the rest arrive with the next snapshots).
      pendingOwners = (message.o ?? []).map((o, i) => o && { p: vec(message.p[i]), o }).filter(Boolean);
      for (const enemy of enemies) if ((enemy.type.ward || enemy.kind === 'guardian') && !enemy.owner) claimOwner(enemy);
      break;
    case 'wardOff':
      breakShield();
      break;
    case 'overload':
      overload();
      break;
    case 'cata':
      startCataclysm(mirror() ?? null, message.s.map((p) => vec(p)));
      break;
    case 'stage':
      stageEffects(mirror(), message.n, message.t);
      break;
    case 'say':
      hud.showBanner(message.t, message.s, 2.2);
      break;
    case 'enrage':
      if (mirror()) enrageEffects(mirror());
      break;
    case 'brk':
      if (mirror()) beginRitual(mirror(), message.need, message.n);
      break;
    case 'brkOff':
      endRitual(message.ok);
      break;
    case 'soak':
      beginSoak(mirror(), message.s.map((p) => vec(p)));
      break;
    case 'soakFail':
      soakFailed();
      break;
    case 'mark':
      beginMark(message.who, vec(message.p));
      break;
    case 'markOff':
      clearMark();
      break;
    case 'blades':
      beginBlades(vec(message.o), message.n, message.a, message.s);
      break;
    case 'closing':
      beginClosingRing();
      break;
    case 'bossDown':
      bossDefeated(message.n, message.s, message.kd);
      break;
    case 'over':
      if (phase !== 'gameover') endRun({ victory: message.v });
      break;
  }
}

net.on((message) => {
  if (message.t === 'relay') {
    for (const item of message.d) handleNet(message.from, item);
  } else if (message.t === 'joined' || message.t === 'players') {
    if (!coop && hud.menu.classList.contains('lobby')) showRoom();
    if (coop && message.t === 'players') dropMissingTeammates();
  } else if (message.t === 'error') {
    lobbyError = message.message;
    if (!coop) showLobby();
  } else if (message.t === 'closed' || message.t === 'disconnected') {
    const reason = message.reason ?? 'Lost the connection to the co-op server.';
    if (coop) {
      leaveCoop();
      goToTitle();
      hud.showBanner('Co-op ended', reason, 3);
    } else if (hud.menu.classList.contains('lobby')) {
      lobbyError = reason;
      showLobby();
    }
  }
});

function showLobby() {
  hud.showLobby({ view: 'start', name: playerName(), error: lobbyError });
  lobbyError = null;
}

function showRoom() {
  const players = net.players.map((p) => ({ ...p, isHost: p.id === net.hostId }));
  hud.showLobby({ view: 'room', code: net.code, players, isHost: net.isHost, invite: inviteLink() });
}

/** A link that opens the game with the co-op lobby ready to join this room (`?room=CODE`). */
function inviteLink() {
  return `${location.origin}/?room=${net.code}`;
}

function copyInvite() {
  const button = hud.menu.querySelector('[data-action="coop-invite"]');
  copyText(
    inviteLink(),
    () => button && (button.textContent = '✅ Link copied!'),
    () => button && (button.textContent = 'Copy the link above')
  );
}

/** Opened from an invite link: show the co-op lobby with the room code filled in. */
function openInvite() {
  const params = new URLSearchParams(location.search);
  const code = (params.get('room') ?? '').trim().toUpperCase();
  if (!params.has('room')) return;
  history.replaceState(null, '', location.pathname); // a reload shouldn't join again
  if (/^[A-Z]{4}$/.test(code)) hud.showLobby({ view: 'start', name: playerName(), code });
}

async function lobbyConnect(action) {
  const name = (hud.menu.querySelector('#coop-name')?.value ?? playerName()).trim() || 'Frog';
  const code = (hud.menu.querySelector('#coop-code')?.value ?? '').trim().toUpperCase();
  if (action === 'join' && code.length !== 4) {
    lobbyError = 'Room codes have 4 letters.';
    showLobby();
    return;
  }
  savePlayerName(name);
  hud.showLobby({ view: 'connecting' });
  try {
    if (action === 'create') await net.create(name);
    else await net.join(code, name);
  } catch (error) {
    lobbyError = error.message;
    showLobby();
  }
}

/** Host: everybody in the room starts a run in a garden sized for the group. */
function hostStartCoop() {
  if (!net.isHost) return;
  net.start();
  const players = net.players.map(({ id, name, color }) => ({ id, name, color }));
  net.relay('all', [{ k: 'start', players }]);
  startCoopRun(players);
}

function startCoopRun(players) {
  leaveCoop({ keepConnection: true });
  coop = { host: net.isHost, remotes: new Map(), ready: new Set(), size: players.length };
  for (const info of players) {
    if (info.id === net.id) continue;
    const remote = new RemoteTode(info, { scene, particles, effects, hud });
    coop.remotes.set(info.id, remote);
    remote.load();
  }
  buildWorld(COOP_TILES[Math.min(players.length, 4) - 1]);
  startRun({ coop: true });
}

function dropMissingTeammates() {
  const present = new Set(net.players.map((p) => p.id));
  for (const [id, remote] of coop.remotes) {
    if (present.has(id)) continue;
    remote.dispose();
    coop.remotes.delete(id);
    hud.showCallout(`${remote.name} left`);
  }
  if (coop.host && phase === 'waiting') markReady(null);
  if (coop.host) checkAllDown();
}

/** Ends co-op locally: teammates vanish and the garden goes back to solo size on the next run. */
function leaveCoop({ keepConnection = false } = {}) {
  if (coop) {
    for (const remote of coop.remotes.values()) remote.dispose();
    coop = null;
  }
  mirrors.clear();
  pendingIntro = null;
  coopMenuOpen = false;
  hud.setWaiting(null);
  if (!keepConnection && net.inRoom) net.leave();
}

/** Host: count who is ready for the next wave; start it when everyone is (or after a while). */
function markReady(id) {
  if (id !== null) coop.ready.add(id);
  if (coop.ready.size === 1 && id !== null) readySince = clock.elapsedTime;
  const everyone = [net.id, ...coop.remotes.keys()];
  const ready = everyone.filter((pid) => coop.ready.has(pid)).length;
  share({ k: 'readyCount', r: ready, t: everyone.length });
  if (phase === 'waiting') hud.setWaiting(ready, everyone.length);
  if (ready === everyone.length && coop.ready.has(net.id)) {
    coop.ready.clear();
    startWave(wave + 1);
  }
}

/** In co-op a fallen Tode is only down: they watch a teammate and get back up next wave. */
function playerDown() {
  player.downed = true;
  player.group.visible = false;
  play('gameOver');
  particles.burst(player.position, { count: 24, colors: ['#3fae4a', '#2b8a3a', '#c8f77a'], speed: 120, up: 120, size: 2.2 });
  hud.showBanner("You're down!", 'Your friends fight on. You rise again next wave.', 3);
  sendState();
  if (coop.host) checkAllDown();
}

function reviveIfDown() {
  if (!player.downed) return;
  player.downed = false;
  player.group.visible = true;
  player.hp = Math.ceil(player.stats.maxHp / 2);
  player.invulnerableLeft = 2;
  updateHealth();
  effects.ring(player.position, { radius: 120, color: '#ffffff', duration: 0.6 });
  particles.burst(player.position, { count: 30, colors: PETALS, speed: 160, up: 140, size: 1.8, glow: true });
  play('revive');
}

/** Host: when every Tode is down, the run is over for everyone. */
function checkAllDown() {
  if (!coop?.host || phase === 'gameover') return;
  const anyoneStanding = !player.downed || [...coop.remotes.values()].some((remote) => remote.alive || !remote.seen);
  if (anyoneStanding) return;
  share({ k: 'over', v: false });
  endRun();
}

/** While down, the camera follows a teammate who is still fighting. */
function spectate(delta) {
  const buddy = [...coop.remotes.values()].find((remote) => remote.alive && remote.seen);
  if (buddy) player.position.lerp(buddy.position, 1 - Math.exp(-5 * delta));
}

function sendState() {
  if (!coop) return;
  share({
    k: 'me',
    x: Math.round(player.position.x),
    y: Math.round(player.position.y),
    f: Math.round(Math.atan2(player.facing.y, player.facing.x) * 100) / 100,
    z: Math.round((player.model.position.z - player.groundOffset) * 10) / 10,
    hp: player.hp,
    mh: player.stats.maxHp,
    tier: ascension.tier,
    down: Boolean(player.downed),
    sh: player.shield ? 1 : 0,
    c: player.frogClass,
  });
}

/** Once per frame: teammates' puppets, our own state, the host's bee snapshots, then send. */
function updateCoop(realDelta, delta) {
  if (!coop) return;
  for (const remote of coop.remotes.values()) remote.update(delta);
  if (player.downed && PLAYING.has(phase)) spectate(realDelta);

  stateTimer -= realDelta;
  if (stateTimer <= 0) {
    stateTimer = 1 / STATE_RATE;
    sendState();
  }
  if (coop.host) {
    snapshotTimer -= realDelta;
    if (snapshotTimer <= 0 && PLAYING.has(phase)) {
      snapshotTimer = 1 / SNAPSHOT_RATE;
      share(snapshot());
    }
    if (phase === 'waiting' && coop.ready.size && clock.elapsedTime - readySince > READY_TIMEOUT) {
      coop.ready = new Set([net.id, ...coop.remotes.keys()]);
      markReady(null);
    }
  }
  net.flush();
}

// --- Game flow ---
function clearWorld() {
  for (const decoy of [...decoys]) removeDecoy(decoy);
  for (const enemy of [...enemies]) removeEnemy(enemy);
  for (const projectile of [...projectiles]) removeFrom(projectiles, projectile);
  bullets.clear();
  leaves.clear();
  charmDrops.clear();
  clearShrine();
  clearCursedTiles();
  clearArenaEvents();
  clearBossMechanics();
  clearObjective();
  for (const effect of [...splashEffects]) removeSplashEffect(effect);
  for (const telegraph of [...telegraphs]) removeTelegraph(telegraph);
  for (const ring of [...fireRings]) removeFireRing(ring);
  for (const bomb of bombs.splice(0)) bomb.mesh.removeFromParent();
  if (clash.beams) {
    for (const mesh of Object.values(clash.beams)) mesh.removeFromParent();
    clash.beams = null;
    hud.hideClash();
  }
  for (const leaf of [...orbitLeaves.children]) {
    leaf.removeFromParent();
    leaf.geometry.dispose();
    leaf.material.dispose();
  }
  effects.clear();
  ultimateEffect = null;
  player.rooted = false;
  particles.clear();
  hud.clearWorldLabels();
}

function startRun({ daily = false, coop: coopRun = false } = {}) {
  if (!coopRun && coop) leaveCoop();
  if (!coopRun && worldTiles !== SOLO_TILES) buildWorld(SOLO_TILES);
  // The Daily Brew rolls waves, weather and offers from today's seed, the same for everyone.
  if (daily) startDaily();
  else stopDaily();
  submitted = false;
  clearWorld();
  resetExperience();
  setArena(ARENAS[0]);
  player.reset();
  player.downed = false;
  runClass = daily ? classOfTheDay(todayKey()) : chosenClass();
  player.setClass(runClass.id);
  clearCompanions();
  coopScore = 0;
  ascension.setTier(0);
  divinity.setTier(0);
  skills.reset();
  brewLevels.clear();
  brewTexts.clear();
  hud.setOwned([]);
  hud.setBoss(null);
  hud.setForm('', 0);
  hud.hideMenu();
  muffleMusic(false);

  // Steeping: the vows taken for this run (never in the Daily Brew or co-op).
  vows = runVows({ daily, coop: coopRun });
  steep = steepLevel(vows);
  hud.setSteep(steep);

  // The class first (see Classes.js): the Pantry and the keepsake build on it.
  const { stats } = player;
  runClass.apply({
    stats,
    player,
    grant: {
      skill: (id) => skills.learn(id),
      ultimate: (id, gauge) => {
        player.ultimate = id;
        player.gauge = gauge;
      },
    },
  });

  // Tode's Pantry: permanent upgrades (unless a vow locked it).
  const pantry = (id) => (vow('pantry') ? 0 : pantryLevel(id));
  stats.maxHp += pantry('heart') - vow('shell');
  stats.damageMultiplier = 1 + 0.08 * pantry('damage');
  stats.gaugeRate *= 1 + 0.12 * pantry('gauge');
  stats.magnet *= 1 + 0.25 * pantry('magnet');
  stats.dashCooldown *= 1 - 0.1 * pantry('spring');
  stats.revives += pantry('revive');
  rerolls = pantry('reroll');
  luck = pantry('luck');

  // Charms and the keepsake.
  charmCounts.clear();
  charmLuck = 1;
  refreshCharms();
  bonusPicks = 0;
  firstOffer = true;
  leafBonus = 1;
  fullGaugeStart = false;
  let awaken = false;
  keepsake = currentKeepsake();
  keepsake.apply({
    stats,
    player,
    grant: {
      level: () => pendingLevels++,
      charm: () => gainCharm(rollCharm()),
      charmLuck: (factor) => (charmLuck = factor),
      leaves: (factor) => (leafBonus = factor),
      fullGauge: () => (fullGaugeStart = true),
      awaken: () => (awaken = true),
    },
  });
  stats.maxHp = Math.max(1, stats.maxHp);
  player.hp = stats.maxHp;
  if (fullGaugeStart && player.ultimate) player.gauge = 100; // the Tiny Crown on a Summoner
  hud.setXp(0, 0, pendingLevels);
  if (awaken) {
    ascension.setTier(1);
    divinity.setTier(1);
    hud.setForm(TIERS[1].name, 1);
  }

  endless = false;
  Object.assign(feats, { cleanWaves: 0, tileWave: 0, legendaries: 0, shrines: 0, bitterWave: 0, bossHurt: false });
  timeAlive = 0;
  beezebubTime = 0;
  kills = 0;
  bossKills = 0;
  points = 0;
  killsSinceHoney = spitShots = spitHits = 0;
  lastLifesteal = -99;
  regenTimer = stormCloudTimer = steamDistance = 0;
  spitCooldownLeft = 0;
  splashCooldownLeft = 0;
  bombCharges = player.stats.bombCharges;
  shake = 0;
  cameraZoom = 1;
  zoomPunch = 0;
  cameraPan.set(0, 0, 0);
  slowMotionLeft = hitStopLeft = 0;
  combo = comboTimer = 0;
  hud.setCombo(0);
  updateScore();
  updateHealth();
  // In co-op the host starts the waves; guests wait for its first 'wave' message.
  if (isGuest()) {
    setPhase('waiting');
    hud.setWave(1, 0);
  } else {
    startWave(1);
  }
}

function endRun({ victory = false } = {}) {
  setPhase('gameover');
  clearCompanions();
  hud.setWaiting(null);
  coopMenuOpen = false;
  combo = 0;
  hud.setCombo(0);
  gameOverTime = clock.elapsedTime;
  player.group.visible = false;
  stormCloud.visible = false;

  const finalScore = Math.floor(score);
  const isRecord = finalScore > bestScore;
  if (isRecord) {
    bestScore = finalScore;
    if (persistBest) safeStorage('set', 'tode-best-score', String(bestScore));
  }

  const firstBossKill = meta.bossKills === 0 && bossKills > 0;
  // The score already carries the Steep bonus; the leaves get it once, on everything.
  const bonus = steepBonus(steep);
  const leaves = Math.round(leavesForRun({ score: finalScore / bonus, wave, bossKills, victory }) * bonus * leafBonus);
  // What ended the run: the boss of a boss wave if it still stands, otherwise the swarm.
  const bossAlive = config?.isBoss && enemies.some((enemy) => enemy.type.boss && !enemy.dying);
  const killer = victory ? null : bossAlive ? config.boss : 'swarm';
  rememberRun({ wave, killer, tier: ascension.tier, victory, steep });
  meta.leaves += leaves;
  meta.runs++;
  meta.bossKills += bossKills;
  meta.bestWave = Math.max(meta.bestWave, wave);
  saveMeta();
  // The server has the final word on the leaves (cloud saves); this screen shows the local count meanwhile.
  reportRun({
    wave, bossKills, victory, score: finalScore, kills, time: Math.floor(timeAlive), steep,
    maxTier: ascension.tier, goldLeaf: leafBonus > 1, daily: isDaily(), coop: Boolean(coop),
  });

  const line = runLine({ wave, victory, firstBossKill, reachedGod: ascension.tier >= 4, killer });
  lastRun = {
    score: finalScore,
    wave,
    level: playerLevel,
    tier: ascension.tier,
    kills,
    time: Math.floor(timeAlive),
    clear: beezebubTime,
    victory,
    daily: isDaily(),
    steep,
    cls: runClass.id,
  };
  lastBuild = runBuild();
  hud.showGameOver({ ...lastRun, isRecord, time: timeAlive, leaves, line, name: playerName(), build: lastBuild });
}

function gameOver() {
  if (phase === 'gameover') return;
  play('gameOver');
  particles.burst(player.position, { count: 24, colors: ['#3fae4a', '#2b8a3a', '#c8f77a'], speed: 120, up: 120, size: 2.2 });
  endRun();
}

let lastRun = null;
let lastBuild = null;
let submitted = false;

/** Everything Tode gathered this run, for the game-over screen and the share card. */
function runBuild() {
  const ultimate = player.ultimate && ULTIMATES[player.ultimate];
  return {
    form: TIERS[ascension.tier].name,
    frogClass: runClass.name,
    keepsake: keepsake ? { icon: keepsake.icon, name: keepsake.name, color: '#c9a2ff' } : null,
    charms: charmList(),
    ultimate: ultimate ? { icon: ultimate.icon, name: ultimate.name } : null,
    skills: skills.slots.map(({ id, level }) => ({ icon: SKILLS[id].icon, name: SKILLS[id].name, level, color: '#3fd0c0' })),
    brews: [...brewLevels].map(([id, level]) => {
      const brew = brewById(id);
      return { icon: brew.icon, name: brew.name, level, color: brewColor(brew) };
    }),
  };
}

// --- Sharing a run ---
let shared = null; // { blob, file, text, image } for the open share popup

async function openShare() {
  if (!lastRun || !lastBuild) return;
  play('click');
  const url = `${location.origin}/`;
  const card = drawShareCard(lastRun, lastBuild, captureFrame(), url);
  const blob = await new Promise((resolve) => card.toBlob(resolve, 'image/png'));
  if (!blob) return;
  if (shared) URL.revokeObjectURL(shared.image);
  shared = {
    blob,
    file: new File([blob], `todeity-run-${lastRun.score}.png`, { type: 'image/png' }),
    text: shareText(lastRun, lastBuild, url),
    image: URL.createObjectURL(blob),
  };
  hud.showShare(shared.image, Boolean(navigator.share), Boolean(navigator.clipboard?.write && window.ClipboardItem));
}

// The share sheet needs the click itself, so the image is made beforehand, when the popup opens.
function shareNative() {
  if (!shared) return;
  const withImage = { files: [shared.file], text: shared.text, title: 'Todeity: Rise of the Tea God' };
  const data = navigator.canShare?.(withImage) ? withImage : { text: shared.text, title: withImage.title };
  navigator.share(data).catch((error) => {
    if (error.name !== 'AbortError') hud.setShareStatus("Couldn't open sharing here: copy the text or save the image instead.");
  });
}

/** Copies text to the clipboard, then calls `done` or `fail`. */
function copyText(text, done, fail) {
  const fallback = () => {
    // Older browsers and plain-http hosts: a hidden text field and the copy command.
    const field = document.createElement('textarea');
    field.value = text;
    document.body.append(field);
    field.select();
    const copied = document.execCommand?.('copy');
    field.remove();
    if (copied) done();
    else fail();
  };
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, fallback);
  else fallback();
}

function shareCopy() {
  if (!shared) return;
  copyText(
    shared.text,
    () => hud.setShareStatus('Copied! Paste it in a message to your friends.'),
    () => hud.setShareStatus("Couldn't copy here, sorry: save the image instead.")
  );
}

// Chat apps like Discord take a pasted image, so desktop players can share the card without saving a file.
function shareCopyImage() {
  if (!shared) return;
  navigator.clipboard.write([new ClipboardItem({ 'image/png': shared.blob })]).then(
    () => hud.setShareStatus('Image copied! Paste it into Discord or any chat.'),
    () => hud.setShareStatus("Couldn't copy the image here: save it instead.")
  );
}

function shareSave() {
  if (!shared) return;
  const link = document.createElement('a');
  link.href = shared.image;
  link.download = shared.file.name;
  link.click();
  hud.setShareStatus('Saved!');
}

async function submitRun(name) {
  if (!lastRun || submitted) return;
  const cleanName = name.trim().slice(0, 16);
  if (!cleanName) {
    hud.menu.querySelector('#player-name')?.focus();
    return;
  }
  submitted = true;
  savePlayerName(cleanName);
  play('click');
  const result = await submitScore({ ...lastRun, name: cleanName });
  if (result.error) {
    submitted = false;
    hud.showSubmitted(result.error, null);
    return;
  }
  // Show the board this run shines on: the speed board for a Bee-zebub kill, else score (or the Daily Brew).
  const board = lastRun.daily ? 'daily' : lastRun.clear ? 'speed' : 'all';
  const rank = { daily: result.dailyRank, speed: result.speedRank, all: result.rank }[board];
  const scores = await fetchScores(board, 10);
  const where = { daily: "today's Daily Brew", speed: 'the fastest Bee-zebub board', all: 'the leaderboard' }[board];
  hud.showSubmitted(rank ? `You're #${rank} on ${where}! 🎉` : `Score submitted to ${where}.`, scores, rank, board);
  if (rank && rank <= 3) play('victory');
}

async function showLeaderboard(board) {
  hud.showLeaderboard(board, undefined);
  const scores = await fetchScores(board, 10);
  if (phase === 'title' || phase === 'gameover') hud.showLeaderboard(board, scores);
}

function canRestart() {
  return phase === 'gameover' && clock.elapsedTime - gameOverTime >= RESTART_DELAY;
}

function goToTitle() {
  stopDaily();
  clearWorld();
  clearCompanions();
  setArena(ARENAS[0]);
  player.reset();
  ascension.setTier(0);
  divinity.setTier(0);
  weather.set('morning', 'clear');
  weather.setCosmic(false);
  hud.setWeather(weather.info);
  hud.setBoss(null);
  hud.setForm('', 0);
  hud.setOwned([]);
  hud.wave.textContent = '';
  reticle.visible = false;
  muffleMusic(false);
  setPhase('title');
  player.setClass(chosenClass().id);
  ascension.setTier(TITLE_TIER);
  hud.showTitle(bestScore);
}

function pause() {
  if (!PLAYING.has(phase)) return;
  if (coop) {
    coopMenuOpen = true;
    showPauseMenu();
    return;
  }
  pausedFrom = phase;
  pausedPhaseTimer = phaseTimer;
  setPhase('paused');
  muffleMusic(true);
  showPauseMenu();
}

function showPauseMenu() {
  const build = [...brewLevels].map(([id, level]) => {
    const brew = brewById(id);
    return { icon: brew.icon, name: brew.name, level, color: brewColor(brew), text: brewTexts.get(id) };
  });
  for (const slot of skills.slots) {
    const skill = SKILLS[slot.id];
    build.push({ icon: skill.icon, name: skill.name, level: slot.level, color: '#3fd0c0', text: skill.text(slot.level) });
  }
  for (const charm of charmList()) build.push(charm);
  if (keepsake) build.unshift({ icon: keepsake.icon, name: keepsake.name, level: 1, color: '#c9a2ff', text: keepsake.text });
  hud.showPause({
    keepsake,
    steep,
    calmFx: settings.calmFx,
    build,
    ultimate: player.ultimate,
    form: TIERS[ascension.tier].name,
    sound: soundSettings(),
    coop: Boolean(coop),
    frogClass: runClass,
  });
}

function resume() {
  if (coopMenuOpen) {
    coopMenuOpen = false;
    hud.hideMenu();
    return;
  }
  if (phase !== 'paused') return;
  hud.hideMenu();
  muffleMusic(false);
  setPhase(pausedFrom, pausedPhaseTimer);
}

/** A copy of the current frame without the HUD (the WebGL canvas is only readable right after rendering). */
function captureFrame() {
  postfx.render(0);
  const source = renderer.domElement;
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  canvas.getContext('2d').drawImage(source, 0, 0);
  return canvas;
}

/** Saves a clean screenshot (no HUD) with a small watermark, for sharing the most epic moments. */
function takePhoto() {
  achieve('photo');
  const canvas = captureFrame();
  const context = canvas.getContext('2d');
  const unit = canvas.width / 1280;
  context.textAlign = 'right';
  context.shadowColor = 'rgba(0, 0, 0, 0.6)';
  context.shadowBlur = 8 * unit;
  context.fillStyle = 'rgba(255, 243, 196, 0.92)';
  context.font = `900 ${Math.round(40 * unit)}px system-ui, sans-serif`;
  context.fillText('TODEITY', canvas.width - 24 * unit, canvas.height - 46 * unit);
  context.font = `700 ${Math.round(17 * unit)}px system-ui, sans-serif`;
  context.fillText('Rise of the Tea God', canvas.width - 24 * unit, canvas.height - 22 * unit);
  canvas.toBlob((blob) => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `todeity-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  });
  postfx.flash('#ffffff', 0.5);
  play('click');
}

function toggleMute() {
  const { sfx, music: musicOn } = soundSettings();
  const on = !(sfx || musicOn);
  setSound('sfx', on);
  setSound('music', on);
  hud.setMuted(!on);
}

const MENU_ACTIONS = {
  start: () => {
    if (phase !== 'title' && phase !== 'gameover') return;
    if (coop && net.inRoom) {
      if (net.isHost) hostStartCoop(); // everyone plays again
      return;
    }
    if (!meta.seenStory) startStory();
    else startRun();
  },
  coop: () => (net.inRoom ? showRoom() : showLobby()),
  'coop-create': () => lobbyConnect('create'),
  'coop-join': () => lobbyConnect('join'),
  'coop-start': () => hostStartCoop(),
  'coop-invite': copyInvite,
  'coop-leave': () => {
    net.leave();
    showLobby();
  },
  daily: () => (phase === 'title' || phase === 'gameover') && startRun({ daily: true }),
  leaderboard: ({ board }) => showLeaderboard(board ?? 'all'),
  submit: ({ name }) => submitRun(name ?? ''),
  pantry: () => hud.showPantry(),
  keepsakes: () => hud.showKeepsakes(),
  classes: () => hud.showClasses(),
  class: ({ id }) => {
    if (chooseClass(id) && player.frogClass !== id) {
      play('pick');
      player.setClass(id);
      ascension.setTier(TITLE_TIER);
      player.rig.play('signature', { once: true }); // say hello
      titleMoveIn = 8;
    }
    hud.showClasses();
  },
  keepsake: ({ id }) => {
    if (chooseKeepsake(id)) play('pick');
    hud.showKeepsakes();
  },
  steeping: () => hud.showSteeping(),
  vow: ({ id }) => {
    cycleVow(id);
    play(steepLevel() ? 'charge' : 'click');
    hud.showSteeping();
  },
  'vows-clear': () => {
    clearVows();
    play('click');
    hud.showSteeping();
  },
  'toggle-calm': () => {
    settings.calmFx = !settings.calmFx;
    saveSettings();
    showPauseMenu();
  },
  buy: ({ id }) => {
    if (buy(id)) {
      play('pick');
      reportBuy(id);
    }
    hud.showPantry();
  },
  save: () => hud.showSave(),
  'load-save': async () => {
    const code = hud.modal.querySelector('#save-code')?.value ?? '';
    if (!code.trim()) return;
    const error = await loadCode(code);
    if (error) hud.showSave({ error });
    else {
      play('pick');
      hud.showSave({ message: 'Welcome back! Your progress is loaded.' });
    }
  },
  'copy-save': () =>
    copyText(
      cloud.code,
      () => hud.setSaveStatus('Copied! Keep it somewhere safe.'),
      () => hud.setSaveStatus('Write it down: you need it to load your progress elsewhere.')
    ),
  title: () => {
    if (coop || net.inRoom) leaveCoop();
    if (phase === 'title') hud.showTitle(bestScore);
    else goToTitle();
  },
  brew: ({ index }) => chooseBrew(Number(index)),
  ultimate: ({ index }) => chooseUltimate(Number(index)),
  skill: ({ index }) => chooseSkill(Number(index)),
  reroll,
  pause,
  resume,
  restart: () => startRun(),
  mute: toggleMute,
  photo: takePhoto,
  'toggle-music': () => {
    setSound('music', !soundSettings().music);
    showPauseMenu();
  },
  'toggle-sfx': () => {
    setSound('sfx', !soundSettings().sfx);
    showPauseMenu();
  },
  'toggle-fullscreen': toggleFullscreen,
  'fullscreen-help': () => {
    play('click');
    hud.showFullscreenHelp();
  },
  changelog: () => {
    play('click');
    hud.showChangelog();
  },
  'close-modal': () => hud.hideModal(),
  share: openShare,
  'share-native': shareNative,
  'share-copy': shareCopy,
  'share-copy-image': shareCopyImage,
  'share-save': shareSave,
  endless: () => {
    endless = true;
    hud.hideMenu();
    hud.showBanner('Endless Brew', 'How far can a god of tea go?', 2.2);
    setPhase('cleared', 0);
  },
  retire: () => endRun({ victory: true }),
};

hud.onSpeak = (voice, text, delay) => babble(voice, text, delay);
hud.onHush = hush;
hud.onAction = (action, data = {}) => {
  unlockAudio();
  MENU_ACTIONS[action]?.(data);
};
hud.setMuted(!soundSettings().sfx && !soundSettings().music);

/** Redraws the open title or pause menu, e.g. when a setting shown on a button changed outside it. */
function refreshMenu() {
  if (hud.menuName === 'title-screen') hud.showTitle(bestScore);
  else if (hud.menuName === 'pause') showPauseMenu();
}
// Progress arrived from the server: redraw the menus that show it.
cloud.onChange = () => {
  if (hud.menuName === 'title-screen') hud.showTitle(bestScore);
  else if (hud.menuName === 'pantry') hud.showPantry();
  if (hud.modal.classList.contains('save') && !hud.modal.hidden && !hud.modal.querySelector('.save-ok, .lobby-error')) hud.showSave();
};
onFullscreenChange(() => {
  // In fullscreen the browser takes Esc to leave fullscreen and the game never sees the key: pause instead.
  if (!isFullscreen() && PLAYING.has(phase)) pause();
  refreshMenu();
});
// A touchscreen laptop switches to touch controls on its first touch: show the touch controls help.
touch.onEnable = refreshMenu;

// Browsers only start audio after a user gesture.
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);
music.start();

// Pause automatically when the player switches away.
window.addEventListener('blur', () => autoPause && !coop && pause());

window.addEventListener('resize', () => {
  camera.aspect = viewWidth() / viewHeight();
  camera.updateProjectionMatrix();
  renderer.setSize(viewWidth(), viewHeight(), false);
  postfx.setSize(viewWidth(), viewHeight());
});

// --- Animation loop ---
const moveAxis = new THREE.Vector2();
const moveDirection = new THREE.Vector3();

function updateGame(delta) {
  timeAlive += delta;
  if (phase === 'fighting') fightTime += delta;
  procBudget = PROC_BUDGET;
  updateWave(delta);
  updateHazards(delta);
  updateArenaEvents(delta);
  updateObjective(delta);
  updateShrines(delta);
  updateCursedTiles(delta);
  updateBossMechanics(delta);
  // Raid targets first (they matter most), then the arena's objective.
  hud.setObjectiveArrows([...raidTargets(), ...objectiveArrows]);
  for (const charm of charmDrops.update(delta, player.position, !player.downed)) gainCharm(charm);
  if (player.downed) {
    updateEnemies(delta);
    updateEnemyProjectiles(delta);
    updateScore();
    return;
  }

  input.moveAxis(moveAxis);
  moveDirection.copy(SCREEN_RIGHT).multiplyScalar(moveAxis.x).addScaledVector(SCREEN_UP, moveAxis.y);
  updateAim();

  if (input.wasPressed('Space', 'ShiftLeft', 'ShiftRight', 'MouseRight')) tryDash(moveDirection);
  if (input.wasPressed('KeyE', 'MouseMiddle')) tryUltimate();

  spitCooldownLeft = Math.max(0, spitCooldownLeft - delta);
  if ((input.primaryDown || autoFire) && spitCooldownLeft === 0 && !player.rooted) spit();
  if (echoDelay > 0 && (echoDelay -= delta) <= 0) {
    echoDelay = 0;
    spitVolley(player.facing.clone());
  }

  // Tea bombs recharge one at a time.
  const { bombCharges: maxBombs } = player.stats;
  if (bombCharges < maxBombs) {
    splashCooldownLeft = Math.max(0, splashCooldownLeft - delta);
    if (splashCooldownLeft === 0) {
      bombCharges++;
      if (bombCharges < maxBombs) splashCooldownLeft = player.stats.splashCooldown;
    }
  } else {
    bombCharges = maxBombs;
  }
  // The tea bomb throws itself at the thickest crowd in range.
  if (bombCharges > 0) {
    const target = bombTarget();
    if (target) throwBomb(target);
  }

  updateZone(delta);
  player.update(delta, moveDirection, movePlayer);
  if (player.justLanded) {
    particles.burst(player.position, { count: 6, colors: DUST, speed: 45, up: 20, size: 1.8, height: 1 });
    if (player.stats.landingSplash > 0) kettleLanding();
  }

  comboTimer -= delta;
  if (comboTimer <= 0) combo = 0;
  hud.setCombo(combo);

  updatePowers(delta);
  updateDecoys(delta);
  updateCompanions(delta);
  skills.update(delta);
  updateProjectiles(delta);
  updateBombs(delta);
  updateLeaves(delta);
  updateEnemies(delta);
  if (phase !== 'gameover') updateEnemyProjectiles(delta);
  if (ultimateEffect && !effects.list.includes(ultimateEffect)) ultimateEffect = null;
  updateScore();

  const { stats } = player;
  hud.setCooldown('spit', spitCooldownLeft, stats.spitCooldown);
  hud.setCooldown('dash', player.dashCharges > 0 ? 0 : player.dashCooldownLeft, stats.dashCooldown);
  hud.setDashCharges(player.dashCharges, stats.dashCharges);
  hud.setCooldown('splash', bombCharges > 0 ? 0 : splashCooldownLeft, stats.splashCooldown);
  hud.setCharges('splash', bombCharges, stats.bombCharges);
  hud.setUltimate(player.ultimate, player.gauge);
  hud.setSkills(skills.slots);
  updateHealth();
}

function frame(realDelta, render = true) {
  // Game time can run slower than real time (slow motion, hit-stop); menus and the camera use real time.
  const delta = phase === 'paused' ? realDelta : realDelta * timeScale(realDelta);
  // A popup (changelog, share card) takes the keyboard: Esc closes it, nothing else reaches the game.
  if (hud.modalOpen) {
    if (input.wasPressed('Escape')) hud.hideModal();
    input.pressed.clear();
  }
  if (PLAYING.has(phase)) {
    updateGame(delta);
    if (input.wasPressed('Escape', 'KeyP')) (coopMenuOpen ? resume() : pause());
  } else if (phase === 'paused') {
    if (input.wasPressed('Escape', 'KeyP')) resume();
  } else if (phase === 'bossIntro') {
    updateBossIntro(realDelta);
  } else if (phase === 'ascending') {
    updateAscending(realDelta);
  } else if (phase === 'travel') {
    updateTravel(realDelta);
  } else if (phase === 'clash') {
    updateClash(realDelta);
  } else if (phase === 'choosing') {
    ['Digit1', 'Digit2', 'Digit3'].forEach((key, i) => input.wasPressed(key) && chooseBrew(i));
    if (input.wasPressed('KeyR')) reroll();
  } else if (phase === 'ultimate') {
    ['Digit1', 'Digit2', 'Digit3'].forEach((key, i) => input.wasPressed(key) && chooseUltimate(i));
  } else if (phase === 'skill') {
    ['Digit1', 'Digit2', 'Digit3'].forEach((key, i) => input.wasPressed(key) && chooseSkill(i));
  } else if (phase === 'ending') {
    updateEnding(realDelta);
  } else if (phase === 'story') {
    updateStory(realDelta);
    if (storyTime > 0.5 && (input.pressed.size > 0 || input.primaryDown)) endStory();
  } else if (input.wasPressed('Space') && (phase === 'title' || canRestart())) {
    if (phase === 'title' && !meta.seenStory) startStory();
    else startRun();
  }
  if (input.wasPressed('KeyM')) toggleMute();
  if (input.wasPressed('KeyC')) takePhoto();

  // The world keeps living while menus are open (except when paused).
  if (phase !== 'paused') {
    effects.update(delta);
    updateSplashEffects(delta);
    particles.update(delta);
    weather.update(delta, player.position, clock.elapsedTime);
    updatePropFade(realDelta);
    if (arena.id === 'garden') environment.update(clock.elapsedTime);
    else builtArenas.get(arena.id)?.update(clock.elapsedTime, delta);
    // At the Tournament of the Gods reality itself glitches now and then.
    if (arena.id === 'cosmos' && PLAYING.has(phase) && (realityGlitch -= delta) <= 0) {
      realityGlitch = 6 + Math.random() * 5;
      postfx.pulse({ warp: 0.9, aberration: 0.8 });
      postfx.shatter(0.18, 0.15);
    }
    divinity.update(delta);
    ascension.update(delta);
    player.rig.inPlace = PLAYING.has(phase) || phase === 'clash';
    player.animate(delta);
    // On the title screen the frog shows off now and then.
    if (phase === 'title' && (titleMoveIn -= delta) <= 0) {
      titleMoveIn = 7 + Math.random() * 4;
      player.rig.play(Math.random() < 0.7 ? 'signature' : 'victory', { once: true });
    }
  }
  updateCoop(realDelta, delta);
  touch.update(PLAYING.has(phase) && !player.downed, player.gauge >= 100, Boolean(player.ultimate));
  hud.root.classList.toggle('quiet', ['title', 'loading', 'story', 'ending'].includes(phase));
  const look = ascension.postfxTargets();
  const boost = arena.postfx ?? {};
  postfx.setTargets({
    bloom: look.bloom + (boost.bloom ?? 0),
    warp: look.warp + (boost.warp ?? 0),
    aberration: look.aberration + (boost.aberration ?? 0),
  });
  // Calm effects soften flashes, shakes and particles during play (cut-scenes keep the full show).
  postfx.calm = settings.calmFx && PLAYING.has(phase);
  particles.density = postfx.calm ? 0.5 : 1;
  updateCamera(phase === 'paused' ? 0 : realDelta);
  postfx.update(realDelta);
  if (render) postfx.render(realDelta);
  hud.update(delta, enemies);
  input.endFrame();
}

// --- Adaptive quality: lower the resolution on slow devices, raise it again when there's room ---
const MAX_PIXEL_RATIO = Math.min(window.devicePixelRatio || 1, 1.5);
// `ceiling` drops below a resolution that proved too slow, so quality settles instead of see-sawing
// (every change reallocates the render targets, which shows as a hitch).
const quality = { ratio: MAX_PIXEL_RATIO, ceiling: MAX_PIXEL_RATIO, time: 0, frames: 0, goodWindows: 0 };

function setPixelRatio(ratio) {
  quality.ratio = THREE.MathUtils.clamp(ratio, 0.6, MAX_PIXEL_RATIO);
  renderer.setPixelRatio(quality.ratio);
  postfx.setPixelRatio(quality.ratio);
}

function adaptQuality(delta) {
  quality.time += delta;
  quality.frames++;
  if (quality.time < 2) return;
  const fps = quality.frames / quality.time;
  quality.time = quality.frames = 0;
  if (document.hidden) return;
  if (fps < 45 && quality.ratio > 0.6) {
    quality.ceiling = Math.max(0.6, quality.ratio - 0.1);
    setPixelRatio(quality.ratio - 0.2);
    quality.goodWindows = 0;
  } else if (fps < 30 && sun.castShadow) {
    sun.castShadow = false; // last resort: no shadows
  } else if (fps > 57 && quality.ratio < quality.ceiling - 0.01 && ++quality.goodWindows >= 3) {
    setPixelRatio(Math.min(quality.ceiling, quality.ratio + 0.1));
    quality.goodWindows = 0;
  } else if (fps <= 57) {
    quality.goodWindows = 0;
  }
}

renderer.setAnimationLoop(() => {
  const delta = Math.min(clock.getDelta(), 0.1);
  adaptQuality(delta);
  frame(delta);
});

// --- Load assets, then show the title screen ---
Promise.all([player.load(chosenClass().id), loadEnemyModel(), loadHouse(HOME)])
  .then(([, , home]) => {
    houses = [home];
    map.add(home.house);
    updateHealth();
    updateScore();
    setPhase('title');
    ascension.setTier(TITLE_TIER);
    hud.showTitle(bestScore);
    openInvite();
    initCloud();
    // iPhone: once, how to play fullscreen (Add to Home Screen).
    meta.tips ??= [];
    if (needsHomeScreen() && !meta.tips.includes('homescreen') && !hud.modalOpen) {
      meta.tips.push('homescreen');
      saveMeta();
      hud.showFullscreenHelp();
    }
  })
  .catch((error) => {
    console.error(error);
    hud.score.textContent = 'Failed to load the game assets';
  });

// Debug handle for the browser console during development.
if (import.meta.env.DEV) {
  window.game = {
    player,
    enemies,
    projectiles,
    bullets,
    scene,
    camera,
    renderer,
    postfx,
    cameraOffset: CAMERA_OFFSET,
    ascension,
    weather,
    effects,
    brewLevels,
    get phase() {
      return phase;
    },
    get wave() {
      return wave;
    },
    get arena() {
      return arena.id;
    },
    get level() {
      return playerLevel;
    },
    get mapHalfSize() {
      return MAP_HALF_SIZE;
    },
    /** Unfinished shrine positions, nearest first (for the bot). */
    get objectiveZones() {
      return [...(marked?.mine ? [marked.zone] : []), ...(cataclysm?.zones ?? []), ...soaks.flatMap((soak) => soak.zones), ...(raid?.zones ?? []), ...(objective?.zones ?? [])]
        .filter((zone) => !zone.done)
        .map((zone) => zone.position)
        .sort((a, b) => distanceSqXY(a, player.position) - distanceSqXY(b, player.position));
    },
    /** Shows an arena right away, e.g. game.setArena('hell') (game.startWave(21) travels there instead). */
    setArena: (id) => setArena(ARENAS.find((a) => a.id === id)),
    set autoPause(value) {
      autoPause = value;
    },
    /** game.persist = false: nothing this session does is saved (progress, best score), for bot runs. */
    set persist(value) {
      setPersist(value);
      persistBest = value;
    },
    startWave: (n) => {
      clearWorld();
      startWave(n);
    },
    chooseBrew,
    chooseUltimate,
    skills,
    learn: (id) => skills.learn(id),
    hurt: (amount) => hurtPlayer(amount),
    get coop() {
      return coop;
    },
    settings,
    killAll: () => {
      clearRaid();
      aliveEnemies().forEach((enemy) => damageEnemy(enemy, 9999));
    },
    get raid() {
      return raid;
    },
    get cataclysm() {
      return cataclysm;
    },
    skipSpawns: () => spawnQueue.splice(0),
    spawn: (kind, x, y) => spawnEnemy(kind, new THREE.Vector3(x, y, 0)),
    /** Grants charms: game.charm('spoon', 5), or a random one with game.charm(). */
    charm: (id, count = 1) => {
      for (let i = 0; i < count; i++) gainCharm(id ? charmById(id) : rollCharm());
    },
    charmCounts,
    /** Starts an arena event now: 'curtain', 'lighthouse', 'noose', 'crossfire', 'double', 'pincer', 'rain', 'starburst'. */
    event: (id) => startArenaEvent(id),
    /** Starts a hive manoeuvre now: 'surround', 'crossfire' or 'rolling'. */
    tactic: (id) => ({ surround: startSurround, crossfire: startCrossfire, rolling: (tw) => startPounce(tw, true) })[id](Math.max(wave, 12)),
    squad: () => spawnSquad(),
    get hex() {
      return hexLeft;
    },
    decoys,
    companions,
    /** Plays as a class from the next run on: game.setClass('ninja'). */
    setClass: (id) => chooseClass(id) && (player.setClass(id), ascension.setTier(ascension.tier)),
    /** Puts a shrine in the arena right away: 'chance', 'bitter' or 'cursed'. */
    shrine: (type = 'chance') => setupShrine(wave, type),
    get shrineState() {
      return shrine;
    },
    /** Grants a brew by id (Duo and Legendary too), e.g. game.give('eye'). */
    give: (id, rarity = 2) => {
      const brew = brewById(id);
      const level = (brewLevels.get(id) ?? 0) + 1;
      brewLevels.set(id, level);
      brewTexts.set(id, describe({ brew, value: brew.values?.[rarity] }));
      brew.apply(player, brew.values?.[rarity]);
      refreshOwned();
    },
    setTier: (tier) => {
      ascension.setTier(tier);
      divinity.setTier(tier);
      hud.setForm(TIERS[tier].name, tier);
      weather.setCosmic(tier >= 4);
    },
    setWeather: (time, kind) => {
      weather.set(time, kind);
      hud.setWeather(weather.info);
    },
    ultimate: (id) => {
      player.ultimate = id;
      player.gauge = 100;
    },
    // Advances the game without relying on requestAnimationFrame (paused in hidden tabs).
    step: (seconds, dt = 1 / 60) => {
      for (let t = 0; t < seconds; t += dt) frame(dt, t + dt >= seconds);
    },
  };
  import('./dev/bot.js').then(({ makeBot }) => (window.game.makeBot = () => makeBot(window.game)));
}
