import * as THREE from 'three';
import './style.css';
import { createCamera } from './components/Camera.js';
import { createRenderer } from './components/Renderer.js';
import { Player } from './components/Player.js';
import { Enemy, loadEnemyModel } from './components/Enemy.js';
import { Projectile, PROJECTILE_HEIGHT } from './components/Projectile.js';
import { Input } from './components/Input.js';
import { Hud } from './components/Hud.js';
import { createMap, isInsideMap, MAP_HALF_SIZE, TILE_SIZE } from './components/Map.js';
import { loadHouse } from './components/House.js';
import { createEnvironment, HOME, PATH } from './components/Environment.js';
import { circlesOverlap, circleIntersectsRect } from './components/collision.js';
import { BLENDS, brewById, describe, rollBrews } from './components/PowerUps.js';
import { buildSpawnQueue, FINAL_WAVE, waveConfig } from './components/Waves.js';
import { Particles } from './components/Particles.js';
import { muffleMusic, play, setSound, soundSettings, unlockAudio } from './components/Sound.js';
import { music } from './components/Music.js';
import { PostFX } from './components/PostFX.js';
import { Effects } from './components/Effects.js';
import { startUltimate, ULTIMATES } from './components/Ultimates.js';
import { Ascension, TIERS } from './components/Ascension.js';
import { rollWeather, timeOfDay, Weather } from './components/Weather.js';
import { buy, leavesForRun, meta, pantryLevel, runLine, saveMeta } from './components/Meta.js';
import { SKILL_KEYS, SKILLS, SkillBook } from './components/Skills.js';
import { Divinity } from './components/Divinity.js';

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
const DASH_KNOCKBACK = 150;
const AIM_ASSIST_ANGLE = THREE.MathUtils.degToRad(14); // spit snaps to an enemy this close to the cursor direction
const LANDING_SPLASH_RADIUS = 50;
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

// Brew mechanics
const SPLIT_ANGLE = 0.7; // radians between the pieces of a Geyser Spit
const ORBIT_RADIUS = 40;
const ORBIT_DAMAGE = 2;
const ORBIT_HIT_INTERVAL = 0.5; // per bee
const STORM_CLOUD_INTERVAL = 1; // seconds between storm-cloud strikes
const FREEZE_SHATTER_DELAY = 1; // seconds a dash-frozen bee stays frozen before it shatters
const STEAM_SPACING = 18; // distance between steam puffs of the Steam Engine

// Ultimate
const GAUGE_PER_DAMAGE = 0.8; // % per point of damage dealt
const GAUGE_PER_HIT = 12; // % for getting hit
const ULTIMATE_WAVE = 2; // the ultimate is chosen after clearing this wave
const SKILL_WAVES = [3, 7, 11, 15]; // a skill (or skill upgrade) is chosen after these waves
const AUTO_SPLASH_CROWD = 3; // auto-cast: tea splash when this many bees are in reach

// Score
const SCORE_PER_SECOND = 0.1;
const WAVE_CLEAR_BONUS = 25; // × wave number

// Pacing
const WAVE_INTRO_TIME = 1.8; // seconds
const WAVE_CLEARED_TIME = 1.4;
const ASCEND_DURATION = 2.6;
const PLAYING = new Set(['intro', 'fighting', 'cleared']);

const CAMERA_OFFSET = new THREE.Vector3(300, -300, 300);
// WASD is camera-relative: "up" walks away from the camera.
const SCREEN_RIGHT = new THREE.Vector3(1, 1, 0).normalize();
const SCREEN_UP = new THREE.Vector3(-1, 1, 0).normalize();
const Z_AXIS = new THREE.Vector3(0, 0, 1);

const SPAWN_CORNERS = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
].map(([x, y]) => new THREE.Vector3(x, y, 0).multiplyScalar(MAP_HALF_SIZE - TILE_SIZE * 1.5));

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
Object.assign(sun.shadow.camera, { left: -450, right: 450, top: 450, bottom: -450, near: 1, far: 1000 });
scene.add(ambient, hemisphere, sun);

const map = createMap({ path: PATH });
scene.add(map);

const environment = createEnvironment();
scene.add(environment.group);
const divinity = new Divinity({ scene, map, environment });

const player = new Player();
scene.add(player.group);

const camera = createCamera();
player.group.add(camera);

const renderer = createRenderer();
const postfx = new PostFX(renderer, scene, camera);
const input = new Input(renderer.domElement);
const hud = new Hud(camera);
const particles = new Particles();
scene.add(particles.mesh);

// --- Game state ---
const clock = new THREE.Clock();
const enemies = [];
const projectiles = [];
const enemyProjectiles = [];
const splashEffects = [];
const telegraphs = [];
const brewLevels = new Map(); // brew id → level
const brewTexts = new Map(); // brew id → description of the latest pick
let houses = []; // footprints of loaded houses: { rect }

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
const settings = { autoCast: true, ...JSON.parse(safeStorage('get', 'tode-settings') ?? '{}') };

let timeAlive = 0;
let kills = 0;
let bossKills = 0;
let points = 0; // from kills and wave bonuses
let score = 0;
let bestScore = Number(safeStorage('get', 'tode-best-score')) || 0;
let killsSinceHoney = 0;
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
let ascendingTo = 0;

function safeStorage(op, key, value) {
  try {
    return op === 'get' ? localStorage.getItem(key) : localStorage.setItem(key, value);
  } catch {
    return null;
  }
}

function updateScore() {
  score = timeAlive * SCORE_PER_SECOND + points;
  hud.setScore(Math.floor(score), Math.max(bestScore, Math.floor(score)));
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
  aliveEnemies,
  damageEnemy: (...args) => damageEnemy(...args),
  hurtPlayer: (amount) => hurtPlayer(amount),
  lightningHit,
  fireSpit: (origin, direction, damage) => fireSpit(origin, direction, damage),
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

/** Houses, trees, rocks, the pond, the tea table… */
function hitsObstacle(position, radius) {
  return (
    houses.some(({ rect }) => circleIntersectsRect(position, radius, rect)) ||
    environment.obstacles.some((o) => distanceSqXY(position, o) < (o.radius + radius) ** 2)
  );
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

function movePlayer(dx, dy) {
  slide(player.position, dx, dy, (position) => isBlockedForPlayer(position));
}

function enemyBlocker(enemy) {
  return (position) =>
    !isInsideMap(position, enemy.radius) ||
    hitsObstacle(position, enemy.radius) ||
    closingIn(enemy.position, position, enemy.radius, player.position, player.radius) ||
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
  const corners = [...SPAWN_CORNERS].sort(() => Math.random() - 0.5);
  return corners.find(
    (corner) =>
      !enemies.some((other) => circlesOverlap(corner, radius, other.position, other.radius)) &&
      !circlesOverlap(corner, radius, player.position, player.radius + 60)
  );
}

function farthestCorner() {
  return [...SPAWN_CORNERS].sort((a, b) => distanceSqXY(b, player.position) - distanceSqXY(a, player.position))[0];
}

function spawnEnemy(kind, at) {
  const enemy = new Enemy(kind, { hpScale: config.hpScale, speedScale: config.speedScale });
  const spot = at ?? freeCorner(enemy.radius);
  if (!spot || (at && enemyBlocker(enemy)(spot))) {
    enemy.dispose();
    return null;
  }
  enemy.position.copy(spot);
  enemy.faceTowards(player.position);
  enemies.push(enemy);
  scene.add(enemy.group);
  if (!enemy.type.boss) hud.attachHealthBar(enemy);
  return enemy;
}

function removeEnemy(enemy) {
  enemies.splice(enemies.indexOf(enemy), 1);
  hud.removeHealthBar(enemy);
  if (enemy.ai.telegraph) removeTelegraph(enemy.ai.telegraph);
  enemy.dispose();
}

const DAMAGE_STYLES = { burn: 'burn', lightning: 'zap', ultimate: 'big', frost: 'frost' };

/** Every source of damage goes through here, so brews, the ultimate gauge and kills stay in sync. */
function damageEnemy(enemy, amount, direction = null, force = 0, source = 'spit') {
  if (enemy.dying) return;
  let damage = amount * player.stats.damageMultiplier;
  if (player.stats.lightningFreeze && enemy.isFrozen) damage *= 2;
  damage = Math.max(1, Math.round(damage));

  const killed = enemy.takeDamage(damage, direction, force);
  if (source !== 'burn') play('hit');
  hud.damageNumber(enemy.position, damage, enemy.height + 4, DAMAGE_STYLES[source] ?? '');
  if (source !== 'ultimate') addGauge(damage * GAUGE_PER_DAMAGE);
  if (killed) onEnemyKilled(enemy);
}

function onEnemyKilled(enemy) {
  kills++;
  points += enemy.type.score;
  play('pop');
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
  if (honeyEvery && ++killsSinceHoney >= honeyEvery) {
    killsSinceHoney = 0;
    healPlayer(1);
  }

  if (enemy.type.boss) {
    bossKills++;
    hud.setBoss(null);
    shake = BOSS_DEATH_SHAKE;
    postfx.flash('#fff2c0', 0.6);
    healPlayer(2);
    hud.showBanner(`${enemy.type.name} is down!`, `+${enemy.type.score} points`, 2.6);
    play('victory');
  }
}

const chase = new THREE.Vector3();
const away = new THREE.Vector3();

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
    play('ultimateReady');
    hud.damageNumber(player.position, 'ULTIMATE READY · R', 40, 'ready');
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
    shake = Math.max(shake, HIT_SHAKE);
    play('hurt');
    hud.flashHurt();
    addGauge(GAUGE_PER_HIT);
  }

  // Calm Before the Storm: getting hit calls lightning down on nearby bees.
  if (player.stats.hitStorm) {
    aliveEnemies()
      .sort((a, b) => distanceSqXY(a.position, player.position) - distanceSqXY(b.position, player.position))
      .slice(0, player.stats.hitStorm)
      .forEach((target) => effects.strike(target.position, { damage: 6, radius: 35 }));
  }

  updateHealth();
  if (player.isDead) {
    if (player.stats.revives > 0) revive();
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
    if (dashDamage > 0) damageEnemy(enemy, dashDamage, player.dash.direction, DASH_KNOCKBACK, 'burn');
    return;
  }
  const charging = enemy.type.boss && enemy.ai.mode === 'charge';
  hurtPlayer(charging ? QUEEN.chargeDamage : enemy.damage, enemy);
}

function updateChaser(enemy, delta) {
  const distance = directionTo(enemy.position, player.position, chase);
  enemy.faceTowards(player.position);
  const reached = distance < enemy.radius + player.radius + ENEMY_CONTACT_REACH;
  const speed = reached ? 0 : enemy.speed;
  moveEnemy(enemy, chase.x * speed, chase.y * speed, delta);
}

/** Stingers keep their distance, circle around Tode and shoot. */
function updateStinger(enemy, delta) {
  const { ranged } = enemy.type;
  const distance = directionTo(enemy.position, player.position, chase);
  enemy.faceTowards(player.position);

  let vx = 0;
  let vy = 0;
  if (distance > ranged.distance + 30) [vx, vy] = [chase.x, chase.y];
  else if (distance < ranged.distance - 40) [vx, vy] = [-chase.x, -chase.y];
  else [vx, vy] = [-chase.y * enemy.strafeSign * 0.6, chase.x * enemy.strafeSign * 0.6];
  moveEnemy(enemy, vx * enemy.speed, vy * enemy.speed, delta);

  if (enemy.isFrozen) return;
  enemy.attackTimer -= delta;
  if (enemy.attackTimer <= ranged.windup) {
    enemy.glowColor.set(0xd18cff);
    enemy.glow = THREE.MathUtils.clamp(1 - enemy.attackTimer / ranged.windup, 0, 1);
  }
  if (enemy.attackTimer <= 0) {
    enemy.glow = 0;
    enemy.attackTimer = ranged.cooldown * (0.8 + Math.random() * 0.4);
    if (distance < ranged.distance + 150) fireStinger(enemy, chase, ranged.speed);
    if (Math.random() < 0.3) enemy.strafeSign *= -1;
  }
}

function fireStinger(enemy, direction, speed) {
  const origin = enemy.position.clone().addScaledVector(direction, enemy.radius * 0.8);
  const stinger = new Projectile(origin, direction, { ...STINGER, speed });
  enemyProjectiles.push(stinger);
  scene.add(stinger.mesh);
  play('sting');
}

function updateQueen(boss, delta) {
  const { ai } = boss;
  const enraged = boss.hp < boss.maxHp / 2;
  const delayScale = (boss.type.attackDelayScale ?? 1) * (enraged ? QUEEN.enragedDelayScale : 1);
  directionTo(boss.position, player.position, chase);

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
    case 'recover':
      ai.timer -= delta;
      moveEnemy(boss, 0, 0, delta);
      if (ai.timer <= 0) {
        ai.mode = 'chase';
        ai.timer = QUEEN.attackDelay * delayScale;
      }
      break;
    default:
      ai.mode = 'chase';
      ai.timer ??= QUEEN.attackDelay;
      boss.faceTowards(player.position);
      moveEnemy(boss, chase.x * boss.speed, chase.y * boss.speed, delta);
      if (!boss.isFrozen) ai.timer -= delta;
      if (ai.timer <= 0) startQueenAttack(boss, enraged, delayScale);
  }
  hud.setBoss(boss);
}

function startQueenAttack(boss, enraged, delayScale) {
  const { ai } = boss;
  const empress = boss.kind === 'empress';
  const minions = aliveEnemies().length - 1;
  const attacks = ['charge', 'nova', minions < QUEEN.maxMinions ? 'summon' : 'charge'].filter((a) => a !== ai.last);
  const attack = attacks[Math.floor(Math.random() * attacks.length)];
  ai.last = attack;
  ai.timer = QUEEN.attackDelay * delayScale;

  if (attack === 'charge') {
    ai.mode = 'windup';
    ai.timer = QUEEN.chargeWindup;
    ai.direction = chase.clone();
    boss.faceDirection(chase.x, chase.y);
    boss.glowColor.set(0xff3b1f);
    ai.telegraph = addTelegraph(boss.position, ai.direction, QUEEN.chargeSpeed * QUEEN.chargeDuration, boss.radius * 1.6);
    play('charge');
  } else if (attack === 'nova') {
    const count = (enraged ? QUEEN.enragedNovaCount : QUEEN.novaCount) + (empress ? 8 : 0);
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
      spawnEnemy(empress && i === 0 ? 'brute' : 'zipper', spot);
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

function updateStatuses(enemy, delta) {
  if (enemy.burnLeft > 0) {
    enemy.burnTick -= delta;
    if (enemy.burnTick <= 0) {
      enemy.burnTick = 1 / enemy.burnDps;
      particles.burst(enemy.position, { count: 3, colors: FIRE, speed: 20, up: 60, gravity: -30, size: 1.3, height: enemy.height * 0.5, glow: true });
      damageEnemy(enemy, 1, null, 0, 'burn');
    }
  }
  if (enemy.shatterLeft > 0 && !enemy.dying) {
    enemy.shatterLeft -= delta;
    if (enemy.shatterLeft <= 0) {
      particles.burst(enemy.position, { count: 14, colors: ICE, speed: 120, up: 90, size: 1.6, glow: true });
      play('pop');
      damageEnemy(enemy, player.stats.freezeDash, null, 0, 'frost');
    }
  }
}

function updateEnemies(delta) {
  for (const enemy of [...enemies]) {
    enemy.update(delta);
    if (enemy.dying) {
      if (enemy.isGone) removeEnemy(enemy);
      continue;
    }
    updateStatuses(enemy, delta);
    if (enemy.dying) continue;

    if (enemy.type.boss) updateQueen(enemy, delta);
    else if (enemy.type.ranged) updateStinger(enemy, delta);
    else updateChaser(enemy, delta);

    checkContact(enemy);
    if (phase === 'gameover') return;
  }
}

function updateEnemyProjectiles(delta) {
  for (const stinger of [...enemyProjectiles]) {
    stinger.update(delta);
    const hit =
      !player.isInvulnerable &&
      distanceSqXY(stinger.position, player.position) < (stinger.radius + player.radius * 0.8) ** 2;
    if (hit) hurtPlayer(stinger.damage);

    const blocked = !isInsideMap(stinger.position, -80) || hitsObstacle(stinger.position, stinger.radius);
    if (blocked) particles.burst(stinger.position, { count: 4, colors: ['#b05cff'], speed: 40, up: 30, size: 1.2 });
    if (hit || blocked || stinger.isSpent) removeFrom(enemyProjectiles, stinger);
    if (phase === 'gameover') return;
  }
}

// --- Abilities ---
function spit() {
  const { stats } = player;
  spitCooldownLeft = stats.spitCooldown;
  spitShots++;
  play('spit');
  const center = aimAssist(player.facing, stats.spitRange);

  // Matcha Thunder: every few spits, a bolt of chain lightning.
  if (stats.boltEvery && spitShots % stats.boltEvery === 0) {
    effects.chain(player.position, 4, Math.max(3, stats.spitDamage * 2), { range: 280 });
  }

  for (let i = 0; i < stats.spitCount; i++) {
    const angle = (i - (stats.spitCount - 1) / 2) * stats.spitSpread;
    const direction = center.clone().applyAxisAngle(Z_AXIS, angle);
    fireSpit(player.position.clone().addScaledVector(direction, player.radius), direction, stats.spitDamage);
  }
}

function fireSpit(origin, direction, damage, { child = false, hits } = {}) {
  const { stats } = player;
  const range = stats.spitRange * (weather.info.spitRange ?? 1);
  const projectile = new Projectile(origin, direction, {
    speed: stats.spitSpeed,
    range: child ? range * 0.45 : range,
    damage,
    pierce: child ? 0 : stats.spitPierce,
    radius: child ? 2.5 : 3.5,
  });
  projectile.child = child;
  if (hits) hits.forEach((enemy) => projectile.hits.add(enemy));
  projectiles.push(projectile);
  scene.add(projectile.mesh);
}

/** Nudges the shot toward the enemy closest to the aim direction, if one is near it. */
function aimAssist(direction, range) {
  let best = null;
  let bestAngle = AIM_ASSIST_ANGLE;
  for (const enemy of enemies) {
    if (enemy.dying) continue;
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
  if (stats.spitHealEvery && ++spitHits % stats.spitHealEvery === 0) healPlayer(1);
}

function updateProjectiles(delta) {
  for (const projectile of [...projectiles]) {
    projectile.update(delta);
    const target = enemies.find(
      (enemy) =>
        !enemy.dying &&
        !projectile.hits.has(enemy) &&
        distanceSqXY(enemy.position, projectile.position) < (enemy.radius + projectile.radius) ** 2
    );
    if (target) {
      projectile.hits.add(target);
      damageEnemy(target, projectile.damage, projectile.direction, SPIT_KNOCKBACK, 'spit');
      onSpitHit(target, projectile);
    }

    const used = target && projectile.hits.size > projectile.pierce;
    const blocked = !isInsideMap(projectile.position) || hitsObstacle(projectile.position, projectile.radius);
    if (blocked) particles.burst(projectile.position, { count: 4, colors: SPIT_DROPS, speed: 40, up: 30, size: 1.2, height: 0 });
    if (used || blocked || projectile.isSpent) removeFrom(projectiles, projectile);
  }
}

function splash(center, { radius, damage, knockback, color = SPLASH_COLOR, shakeAmount = SPLASH_SHAKE, burn = 0, slow = 0 }) {
  shake = Math.max(shake, shakeAmount);
  play('splash');
  particles.burst(center, { count: Math.round(radius / 3), colors: TEA_DROPS, speed: radius * 2.2, up: 110, size: 1.8, height: 3, ring: radius * 0.25 });
  const ring = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 48),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, depthWrite: false })
  );
  ring.position.set(center.x, center.y, 0.25);
  scene.add(ring);
  splashEffects.push({ ring, age: 0 });

  for (const enemy of [...enemies]) {
    if (enemy.dying) continue;
    const distance = directionTo(center, enemy.position, away);
    if (distance > radius + enemy.radius * 0.5) continue;
    if (burn) enemy.applyBurn(burn, 3);
    if (slow) enemy.applySlow(slow, 2.5);
    damageEnemy(enemy, damage, away, knockback, 'splash');
  }
}

function teaSplash() {
  const { stats } = player;
  splashCooldownLeft = stats.splashCooldown;
  const radius = stats.splashRadius * (weather.info.splashRadius ?? 1);
  splash(player.position, {
    radius,
    damage: stats.splashDamage,
    knockback: stats.splashKnockback,
    burn: stats.splashBurn,
    slow: stats.splashSlow,
  });

  // Thunder Splash: lightning on the nearest bees.
  if (stats.splashBolts) {
    aliveEnemies()
      .filter((enemy) => enemy.position.distanceTo(player.position) < radius * 2)
      .sort((a, b) => distanceSqXY(a.position, player.position) - distanceSqXY(b.position, player.position))
      .slice(0, stats.splashBolts)
      .forEach((enemy, i) =>
        effects.strike(enemy.position, { damage: Math.max(4, stats.splashDamage), radius: 30, delay: 0.05 * i })
      );
  }
  // Volcano Pot: a lingering pool of lava.
  if (stats.lavaPool) {
    effects.pool(player.position, { radius: radius * 0.8, dps: stats.lavaPool, duration: 3, color: '#ff4a10', opacity: 0.5, particleColors: FIRE });
  }
}

function kettleLanding() {
  const level = player.stats.landingSplash;
  splash(player.position, {
    radius: LANDING_SPLASH_RADIUS + level * 10,
    damage: Math.round(2 * level),
    knockback: 200,
    color: 0xf0c060,
    shakeAmount: 3,
  });
}

function tryDash(direction) {
  if (!player.startDash(direction)) return;
  play('dash');
  particles.burst(player.position, { count: 8, colors: DUST, speed: 50, up: 25, size: 2, height: 1 });
  const { dashHealEvery } = player.stats;
  if (dashHealEvery && player.dashes % dashHealEvery === 0) healPlayer(1);
}

function tryUltimate() {
  if (!player.ultimate || player.gauge < 100 || ultimateEffect) return;
  player.gauge = 0;
  ultimateEffect = startUltimate(player.ultimate, ctx);
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
      if (target) effects.strike(target.position, { damage: stats.stormCloud, radius: 32, from: stormCloud.position.clone() });
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
scene.add(reticle);

function updateAim() {
  player.group.updateMatrixWorld(true);
  raycaster.setFromCamera(input.pointer, camera);
  if (raycaster.ray.intersectPlane(aimPlane, aimPoint)) player.aimAt(aimPoint);
  if (raycaster.ray.intersectPlane(groundPlane, ctx.aimGround)) reticle.position.set(ctx.aimGround.x, ctx.aimGround.y, 0.4);
}

function updateCamera(delta) {
  shake *= Math.exp(-SHAKE_DECAY * delta);
  if (shake < 0.05) shake = 0;
  camera.position.set(
    CAMERA_OFFSET.x * cameraZoom + (Math.random() - 0.5) * shake,
    CAMERA_OFFSET.y * cameraZoom + (Math.random() - 0.5) * shake,
    CAMERA_OFFSET.z * cameraZoom + (Math.random() - 0.5) * shake
  );
}

// --- Weather ---
function stormStrike() {
  if (!PLAYING.has(phase)) return;
  const bees = aliveEnemies();
  const nearTode = Math.random() < 0.35 || !bees.length;
  const base = nearTode ? player.position : bees[Math.floor(Math.random() * bees.length)].position;
  const angle = Math.random() * Math.PI * 2;
  const offset = nearTode ? 30 + Math.random() * 70 : Math.random() * 30;
  const spot = base.clone().add(new THREE.Vector3(Math.cos(angle) * offset, Math.sin(angle) * offset, 0));
  effects.strike(spot, { damage: 8, radius: 45, delay: 0.9, hurtsPlayer: true });
}

// --- Music ---
function updateMusic() {
  if (!PLAYING.has(phase) && phase !== 'ascending') {
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

// --- Waves ---
function setPhase(next, duration = 0) {
  phase = next;
  phaseTimer = duration;
  updateMusic();
}

function startWave(number) {
  wave = number;
  config = waveConfig(number);
  spawnQueue = buildSpawnQueue(config);
  spawnTimer = 0;

  weather.set(timeOfDay(number), rollWeather(number, config.isBoss));
  weather.setCosmic(ascension.tier === 4);
  hud.setWeather(weather.info);

  setPhase('intro', WAVE_INTRO_TIME);
  hud.setWave(wave, 0);
  play(config.isBoss ? 'boss' : 'waveStart');
  const bossName = config.boss === 'empress' ? 'The Empress' : 'Queen Buzzbelle';
  if (number === FINAL_WAVE) hud.showBanner('Final Wave', 'The Empress of the hive descends!', WAVE_INTRO_TIME + 0.6);
  else if (config.isBoss) hud.showBanner(`Wave ${wave}`, `${bossName} approaches!`, WAVE_INTRO_TIME + 0.4);
  else hud.showBanner(`Wave ${wave}`, `${config.count} bees incoming`, WAVE_INTRO_TIME);
}

function updateWave(delta) {
  phaseTimer -= delta;

  if (phase === 'intro' && phaseTimer <= 0) {
    setPhase('fighting');
    if (config.isBoss) spawnEnemy(config.boss, farthestCorner());
  } else if (phase === 'fighting') {
    spawnTimer -= delta;
    if (spawnQueue.length && spawnTimer <= 0 && aliveEnemies().length < MAX_ALIVE_ENEMIES) {
      if (spawnEnemy(spawnQueue[0])) spawnQueue.shift();
      spawnTimer = config.spawnInterval;
    }
    const beesLeft = spawnQueue.length + aliveEnemies().length;
    hud.setWave(wave, beesLeft);
    if (beesLeft === 0) waveCleared();
  } else if (phase === 'cleared' && phaseTimer <= 0) {
    offerRewards();
  }
}

function waveCleared() {
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
  if (wave === FINAL_WAVE && !endless) {
    setPhase('victory');
    meta.victories++;
    saveMeta();
    play('victory');
    hud.showVictory();
    return;
  }
  if (wave >= ULTIMATE_WAVE && !player.ultimate) {
    setPhase('ultimate');
    hud.showUltimates();
    return;
  }
  if (SKILL_WAVES.includes(wave)) {
    offers = skills.offers();
    if (offers.length) {
      setPhase('skill');
      hud.showSkills(offers, settings.autoCast);
      return;
    }
  }
  offers = rollBrews(brewLevels, { wave, luck, hasUltimate: !!player.ultimate });
  if (!offers.length) {
    afterReward();
    return;
  }
  setPhase('choosing');
  hud.showBrews(wave, offers, rerolls);
}

function chooseBrew(index) {
  const offer = offers[index];
  if (!offer || phase !== 'choosing') return;
  const { brew, value, level } = offer;
  brewLevels.set(brew.id, level);
  brewTexts.set(brew.id, describe(offer));
  brew.apply(player, value);
  play(brew.kind === 'brew' ? 'pick' : 'legendary');
  if (brew.kind !== 'brew') {
    postfx.flash(brew.kind === 'legendary' ? '#ffd36b' : '#ffffff', 0.35);
    effects.ring(player.position, { radius: 90, color: brew.kind === 'legendary' ? '#ffb000' : '#ffffff', duration: 0.6 });
  }
  updateHealth();
  refreshOwned();
  hud.hideMenu();
  afterReward();
}

function chooseUltimate(index) {
  if (phase !== 'ultimate') return;
  const ultimate = Object.values(ULTIMATES)[index];
  if (!ultimate) return;
  player.ultimate = ultimate.id;
  player.gauge = 50; // a taste of power right away
  play('legendary');
  postfx.flash('#fff2c0', 0.5);
  hud.hideMenu();
  afterReward();
}

function chooseSkill(index) {
  const offer = offers[index];
  if (!offer || phase !== 'skill') return;
  skills.learn(offer.skill.id);
  play('legendary');
  effects.ring(player.position, { radius: 90, color: '#3fd0c0', duration: 0.6 });
  hud.hideMenu();
  afterReward();
}

function saveSettings() {
  safeStorage('set', 'tode-settings', JSON.stringify(settings));
}

function reroll() {
  if (phase !== 'choosing' || rerolls <= 0) return;
  rerolls--;
  play('click');
  offers = rollBrews(brewLevels, { wave, luck, hasUltimate: !!player.ultimate });
  hud.showBrews(wave, offers, rerolls);
}

const brewColor = (brew) => BLENDS[brew.blend ?? brew.blends[0]].color;

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
  for (const [id, level] of brewLevels) total += brewById(id).kind === 'brew' ? level : 2;
  return total;
}

function afterReward() {
  const tier = ascension.tierFor(power());
  if (tier > ascension.tier) startAscension(tier);
  else startWave(wave + 1);
}

// --- Ascension cut-scene ---
const TRANSFORM_AT = 1.3; // seconds into the cut-scene

function startAscension(tier) {
  ascendingTo = tier;
  setPhase('ascending', ASCEND_DURATION);
  music.play(config?.isBoss ? 'boss' : tier >= 4 ? 'divine' : 'battle', Math.min(4, tier + 1));
  play('ascend');
}

function updateAscending(delta) {
  const elapsed = ASCEND_DURATION - phaseTimer;
  phaseTimer -= delta;

  // Zoom in, rise, gather power… then burst.
  const zoom =
    elapsed < TRANSFORM_AT
      ? 1 - 0.45 * Math.min(1, elapsed / 0.8)
      : 0.55 + 0.45 * Math.max(0, Math.min(1, (elapsed - TRANSFORM_AT - 0.6) / 0.7));
  cameraZoom = THREE.MathUtils.clamp(zoom, 0.55, 1);
  const lift = Math.sin(Math.min(1, elapsed / ASCEND_DURATION) * Math.PI) * 22;
  player.model.position.z = player.groundOffset + lift;
  player.adornments.position.z = lift;

  if (elapsed < TRANSFORM_AT) {
    shake = Math.max(shake, 1 + elapsed * 3);
    particles.burst(player.position, {
      count: 6,
      colors: ['#ffffff', '#ffe680', '#ffc93c'],
      ring: 80,
      speed: -170,
      up: 0,
      gravity: -20,
      height: 10 + lift,
      life: 0.5,
      glow: true,
    });
    postfx.pulse({ bloom: elapsed, aberration: elapsed * 0.4 });
  } else if (ascension.tier !== ascendingTo) {
    ascension.setTier(ascendingTo);
    divinity.setTier(ascendingTo);
    const { banner, sub, name } = TIERS[ascendingTo];
    hud.setForm(name, ascendingTo);
    hud.showBanner(banner, sub, 2.4, 'ascend');
    postfx.flash(ascendingTo === 4 ? '#ffffff' : '#ffe9a0', 0.75);
    postfx.pulse({ bloom: 1.1, warp: 1, aberration: 1 });
    shake = 20;
    play('boom');
    effects.ring(player.position, { radius: 260, color: '#ffe680', duration: 0.8, thickness: 0.25 });
    effects.ring(player.position, { radius: 160, color: '#ffffff', duration: 0.5 });
    particles.burst(player.position, {
      count: 80,
      colors: ['#ffffff', '#ffe680', '#ffc93c', '#ffb020'],
      speed: 320,
      up: 200,
      size: 2.4,
      life: 0.9,
      glow: true,
    });
    if (ascendingTo === 4) weather.setCosmic(true);
    meta.maxTier = Math.max(meta.maxTier, ascendingTo);
  }

  if (phaseTimer <= 0) {
    cameraZoom = 1;
    startWave(wave + 1);
  }
}

// --- Game flow ---
function clearWorld() {
  for (const enemy of [...enemies]) removeEnemy(enemy);
  for (const projectile of [...projectiles]) removeFrom(projectiles, projectile);
  for (const stinger of [...enemyProjectiles]) removeFrom(enemyProjectiles, stinger);
  for (const effect of [...splashEffects]) removeSplashEffect(effect);
  for (const telegraph of [...telegraphs]) removeTelegraph(telegraph);
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

function startRun() {
  clearWorld();
  player.reset();
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

  // Tode's Pantry: permanent upgrades.
  const { stats } = player;
  stats.maxHp += pantryLevel('heart');
  player.hp = stats.maxHp;
  stats.damageMultiplier = 1 + 0.1 * pantryLevel('damage');
  stats.gaugeRate *= 1 + 0.15 * pantryLevel('gauge');
  stats.revives += pantryLevel('revive');
  rerolls = pantryLevel('reroll');
  luck = pantryLevel('luck');

  endless = false;
  timeAlive = 0;
  kills = 0;
  bossKills = 0;
  points = 0;
  killsSinceHoney = spitShots = spitHits = 0;
  regenTimer = stormCloudTimer = steamDistance = 0;
  spitCooldownLeft = 0;
  splashCooldownLeft = 0;
  shake = 0;
  cameraZoom = 1;
  updateScore();
  updateHealth();
  startWave(1);
}

function endRun({ victory = false } = {}) {
  setPhase('gameover');
  gameOverTime = clock.elapsedTime;
  player.group.visible = false;
  stormCloud.visible = false;

  const finalScore = Math.floor(score);
  const isRecord = finalScore > bestScore;
  if (isRecord) {
    bestScore = finalScore;
    safeStorage('set', 'tode-best-score', String(bestScore));
  }

  const firstBossKill = meta.bossKills === 0 && bossKills > 0;
  const leaves = leavesForRun({ score: finalScore, wave, bossKills, victory });
  meta.leaves += leaves;
  meta.runs++;
  meta.bossKills += bossKills;
  meta.bestWave = Math.max(meta.bestWave, wave);
  saveMeta();

  const line = runLine({ wave, victory, firstBossKill, reachedGod: ascension.tier === 4 });
  hud.showGameOver({ score: finalScore, isRecord, kills, wave, time: timeAlive, leaves, line, victory });
}

function gameOver() {
  if (phase === 'gameover') return;
  play('gameOver');
  particles.burst(player.position, { count: 24, colors: ['#3fae4a', '#2b8a3a', '#c8f77a'], speed: 120, up: 120, size: 2.2 });
  endRun();
}

function canRestart() {
  return phase === 'gameover' && clock.elapsedTime - gameOverTime >= RESTART_DELAY;
}

function goToTitle() {
  clearWorld();
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
  muffleMusic(false);
  setPhase('title');
  hud.showTitle(bestScore);
}

function pause() {
  if (!PLAYING.has(phase)) return;
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
  hud.showPause({
    build,
    ultimate: player.ultimate,
    form: TIERS[ascension.tier].name,
    sound: soundSettings(),
    autoCast: settings.autoCast,
  });
}

function resume() {
  if (phase !== 'paused') return;
  hud.hideMenu();
  muffleMusic(false);
  setPhase(pausedFrom, pausedPhaseTimer);
}

function toggleMute() {
  const { sfx, music: musicOn } = soundSettings();
  const on = !(sfx || musicOn);
  setSound('sfx', on);
  setSound('music', on);
  hud.setMuted(!on);
}

const MENU_ACTIONS = {
  start: () => (phase === 'title' || phase === 'gameover') && startRun(),
  pantry: () => hud.showPantry(),
  buy: ({ id }) => {
    if (buy(id)) play('pick');
    hud.showPantry();
  },
  title: () => (phase === 'title' ? hud.showTitle(bestScore) : goToTitle()),
  brew: ({ index }) => chooseBrew(Number(index)),
  ultimate: ({ index }) => chooseUltimate(Number(index)),
  skill: ({ index }) => chooseSkill(Number(index)),
  'toggle-autocast': () => {
    settings.autoCast = !settings.autoCast;
    saveSettings();
    showPauseMenu();
  },
  reroll,
  pause,
  resume,
  restart: () => startRun(),
  mute: toggleMute,
  'toggle-music': () => {
    setSound('music', !soundSettings().music);
    showPauseMenu();
  },
  'toggle-sfx': () => {
    setSound('sfx', !soundSettings().sfx);
    showPauseMenu();
  },
  endless: () => {
    endless = true;
    hud.hideMenu();
    hud.showBanner('Endless Brew', 'How far can a god of tea go?', 2.2);
    setPhase('cleared', 0);
  },
  retire: () => endRun({ victory: true }),
};

hud.onAction = (action, data = {}) => {
  unlockAudio();
  MENU_ACTIONS[action]?.(data);
};
hud.setMuted(!soundSettings().sfx && !soundSettings().music);

// Browsers only start audio after a user gesture.
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);
music.start();

// Pause automatically when the player switches away.
window.addEventListener('blur', () => autoPause && pause());

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  postfx.setSize(window.innerWidth, window.innerHeight);
});

// --- Animation loop ---
const moveAxis = new THREE.Vector2();
const moveDirection = new THREE.Vector3();

function updateGame(delta) {
  timeAlive += delta;
  updateWave(delta);

  input.moveAxis(moveAxis);
  moveDirection.copy(SCREEN_RIGHT).multiplyScalar(moveAxis.x).addScaledVector(SCREEN_UP, moveAxis.y);
  updateAim();

  if (input.wasPressed('ShiftLeft', 'ShiftRight', 'MouseRight')) tryDash(moveDirection);
  if (input.wasPressed('KeyR', 'MouseMiddle')) tryUltimate();
  SKILL_KEYS.forEach((key, i) => input.wasPressed(key) && skills.castManual(i, ctx.aimGround));

  spitCooldownLeft = Math.max(0, spitCooldownLeft - delta);
  if (input.primaryDown && spitCooldownLeft === 0 && !player.rooted) spit();

  splashCooldownLeft = Math.max(0, splashCooldownLeft - delta);
  if (splashCooldownLeft === 0 && (input.wasPressed('Space') || (settings.autoCast && splashWorthIt()))) teaSplash();

  player.update(delta, moveDirection, movePlayer);
  if (player.justLanded) {
    particles.burst(player.position, { count: 6, colors: DUST, speed: 45, up: 20, size: 1.8, height: 1 });
    if (player.stats.landingSplash > 0) kettleLanding();
  }

  updatePowers(delta);
  skills.update(delta, settings.autoCast);
  updateProjectiles(delta);
  updateEnemies(delta);
  if (phase !== 'gameover') updateEnemyProjectiles(delta);
  if (ultimateEffect && !effects.list.includes(ultimateEffect)) ultimateEffect = null;
  updateScore();

  const { stats } = player;
  hud.setCooldown('spit', spitCooldownLeft, stats.spitCooldown);
  hud.setCooldown('dash', player.dashCharges > 0 ? 0 : player.dashCooldownLeft, stats.dashCooldown);
  hud.setDashCharges(player.dashCharges, stats.dashCharges);
  hud.setCooldown('splash', splashCooldownLeft, stats.splashCooldown);
  hud.setUltimate(player.ultimate, player.gauge);
  hud.setSkills(skills.slots, settings.autoCast);
  updateHealth();
}

/** Auto-cast: splash when bees crowd in, or one is about to bite. */
function splashWorthIt() {
  const reach = player.stats.splashRadius * (weather.info.splashRadius ?? 1);
  const inReach = aliveEnemies().filter((enemy) => enemy.position.distanceTo(player.position) < reach);
  const biting = inReach.some((enemy) => enemy.position.distanceTo(player.position) < enemy.radius + player.radius + 12);
  return inReach.length >= AUTO_SPLASH_CROWD || biting;
}

function frame(delta, render = true) {
  if (PLAYING.has(phase)) {
    updateGame(delta);
    if (input.wasPressed('Escape', 'KeyP')) pause();
  } else if (phase === 'paused') {
    if (input.wasPressed('Escape', 'KeyP')) resume();
  } else if (phase === 'ascending') {
    updateAscending(delta);
  } else if (phase === 'choosing') {
    ['Digit1', 'Digit2', 'Digit3'].forEach((key, i) => input.wasPressed(key) && chooseBrew(i));
    if (input.wasPressed('KeyR')) reroll();
  } else if (phase === 'ultimate') {
    ['Digit1', 'Digit2', 'Digit3'].forEach((key, i) => input.wasPressed(key) && chooseUltimate(i));
  } else if (phase === 'skill') {
    ['Digit1', 'Digit2', 'Digit3'].forEach((key, i) => input.wasPressed(key) && chooseSkill(i));
  } else if (input.wasPressed('Space') && (phase === 'title' || canRestart())) {
    startRun();
  }
  if (input.wasPressed('KeyM')) toggleMute();

  // The world keeps living while menus are open (except when paused).
  if (phase !== 'paused') {
    effects.update(delta);
    updateSplashEffects(delta);
    particles.update(delta);
    weather.update(delta, player.position, clock.elapsedTime);
    environment.update(clock.elapsedTime);
    divinity.update(delta);
    ascension.update(delta);
  }
  postfx.setTargets(ascension.postfxTargets());
  updateCamera(phase === 'paused' ? 0 : delta);
  if (render) postfx.render(delta);
  hud.update(delta, enemies);
  input.endFrame();
}

renderer.setAnimationLoop(() => frame(Math.min(clock.getDelta(), 0.1)));

// --- Load assets, then show the title screen ---
Promise.all([player.load(), loadEnemyModel(), loadHouse(HOME)])
  .then(([, , home]) => {
    houses = [home];
    map.add(home.house);
    updateHealth();
    updateScore();
    setPhase('title');
    hud.showTitle(bestScore);
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
    enemyProjectiles,
    scene,
    camera,
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
    set autoPause(value) {
      autoPause = value;
    },
    startWave: (n) => {
      clearWorld();
      startWave(n);
    },
    chooseBrew,
    chooseUltimate,
    skills,
    learn: (id) => skills.learn(id),
    settings,
    killAll: () => aliveEnemies().forEach((enemy) => damageEnemy(enemy, 9999)),
    skipSpawns: () => spawnQueue.splice(0),
    spawn: (kind, x, y) => spawnEnemy(kind, new THREE.Vector3(x, y, 0)),
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
      weather.setCosmic(tier === 4);
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
