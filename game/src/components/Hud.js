import * as THREE from 'three';
import { BLENDS, RARITIES, describe } from './PowerUps.js';
import { ULTIMATES } from './Ultimates.js';
import { MAX_SKILLS, SKILLS } from './Skills.js';
import { brewDialogue, kettleDialogue } from './Spirits.js';
import { TIERS } from './Ascension.js';
import { ACHIEVEMENTS, isUnlocked } from './Achievements.js';
import { PANTRY, meta, nextCost, pantryLevel } from './Meta.js';
import { cloud } from './CloudSave.js';
import { CHANGELOG, VERSION } from './Changelog.js';
import { canFullscreen, isFullscreen, needsHomeScreen } from './Fullscreen.js';
import { KEEPSAKES, currentKeepsake, isKeepsakeUnlocked, unlockHint } from './Keepsakes.js';
import { GENTLE_TEXT, STEEP_MAX, VOWS, steepBonus, steepLevel, vowRank } from './Steeping.js';
import { CHARM_RARITIES } from './Charms.js';
import { CLASSES, chosenClass, classById, classOfTheDay } from './Classes.js';
import { classPortrait } from './ClassPortraits.js';
import { todayKey } from './Random.js';
import { GRAPHICS, GRAPHICS_LABELS } from './Quality.js';
import { NAME_MAX, TAG_COLORS } from './PlayerTag.js';
import { BOONS, TRIALS, dailyTwists } from './DailyTwists.js';
import { KETTLE_HOURS, SETS, STREAK_GIFTS, TRINKETS, accountLevel, gardenBeauty, gardenSets, giftStatus, kettleStatus, ownedTrinkets, trinketById } from './Rewards.js';
import { WEARABLES, unlockedWearables } from './Wearables.js';
import { trinketPicture } from './TrinketPortraits.js';
import { viewHeight, viewWidth } from './Viewport.js';

const ABILITIES = [
  { id: 'spit', key: 'LMB', name: 'Spit', icon: '💧' },
  { id: 'dash', key: 'Space', name: 'Hop dash', icon: '💨' },
  { id: 'splash', key: 'auto', name: 'Tea bomb', icon: '💥' },
  // Skills always cast themselves.
  ...Array.from({ length: MAX_SKILLS }, (_, i) => ({ id: `skill${i}`, key: 'auto', name: 'Skill', icon: '✨', skill: true })),
  { id: 'ultimate', key: 'E', name: 'Ultimate', icon: '✨' },
];
const DAMAGE_NUMBER_DURATION = 0.8; // seconds
const DAMAGE_NUMBER_RISE = 25; // world units
const TOAST_MAX = 2; // toasts on screen at once
const TOAST_QUEUE = 6; // toasts waiting at most
const CARD_TAP_DELAY = 450; // ms after a menu opens before its cards take clicks (they fade in over ~0.5 s)

function element(className, parent, tag = 'div') {
  const node = document.createElement(tag);
  node.className = className;
  parent?.append(node);
  return node;
}

// The HUD updates every frame; writing an unchanged value still makes the browser redo style and layout.
function setText(node, text) {
  text = String(text);
  if (node.textContent !== text) node.textContent = text;
}

// Remembers what was written: the browser normalises style values ("100.0%" reads back as "100%").
const writtenStyles = new WeakMap();

function setStyle(node, property, value) {
  let written = writtenStyles.get(node);
  if (!written) writtenStyles.set(node, (written = {}));
  if (written[property] === value) return;
  written[property] = value;
  node.style[property] = value;
}

function setProp(node, property, value) {
  if (node[property] !== value) node[property] = value;
}

const blendLabel = (id) => `${BLENDS[id].icon} ${BLENDS[id].name}`;

/** All 2D UI: score, health, waves, abilities, labels over bees, and the menus. */
export class Hud {
  constructor(camera) {
    this.camera = camera;
    this.projected = new THREE.Vector3();
    this.onAction = () => {};
    this.onSpeak = () => {}; // (voice, text, delay): a character's line starts being typed out
    this.onHush = () => {}; // a menu with dialogue closed

    this.root = element('hud', document.body);
    this.worldLayer = element('world-layer', this.root);
    this.hurtFlash = element('hurt-flash', this.root);
    this.score = element('score', this.root);
    this.status = element('status', this.root);
    this.hearts = element('hearts', this.status);
    this.form = element('form', this.status);
    // Touch screens: a one-line count of brews and charms instead of the icon rows (the pause menu lists them).
    this.summary = element('inventory-summary', this.status);
    this.counts = { brews: 0, charms: 0 };

    this.top = element('top-center', this.root);
    this.wave = element('wave', this.top);
    this.weather = element('weather', this.top);
    this.modifiers = element('weather modifiers', this.top);
    this.modifiers.hidden = true;
    this.objective = element('weather objective', this.top);
    this.objective.hidden = true;
    // Raid mechanics: "🛡 Break the shield: 1/3 wards · 0:21", or "☀ Get into the light!".
    this.raid = element('weather objective raid', this.top);
    this.raid.hidden = true;
    // Arrows at the screen edge pointing at objectives out of view.
    this.arrows = [0, 1, 2, 3, 4].map(() => {
      const arrow = element('objective-arrow', this.root);
      arrow.textContent = '➤';
      arrow.hidden = true;
      return arrow;
    });
    this.waiting = element('waiting', this.top);
    // Co-op: shown only while the connection to the server is weak, bad or lost (setConnection).
    this.connection = element('connection', this.top);
    this.connection.hidden = true;
    this.boss = element('boss-bar', this.top);
    this.bossName = element('boss-name', this.boss);
    this.bossFill = element('boss-fill', element('boss-track', this.boss));
    // Raid bosses: the enrage countdown and, while it channels, the bar to break.
    this.bossTimer = element('boss-timer', this.boss);
    this.breakBar = element('break-bar', this.boss);
    this.breakFill = element('break-fill', this.breakBar);
    this.breakBar.hidden = true;
    this.boss.hidden = true;

    this.banner = element('banner', this.root);
    this.callout = element('callout', this.root);
    // Beam clash: a prompt and a tug-of-war meter (Tode's gold against the boss's red).
    this.clash = element('clash', this.root);
    this.clash.hidden = true;
    this.clashLabel = element('clash-label', this.clash);
    const meter = element('clash-meter', this.clash);
    this.clashFill = element('clash-fill', meter);
    this.toasts = element('toasts', document.body);
    this.toastQueue = []; // toasts waiting for room (see toast)
    this.toastsHeld = false; // main.js: a cut-scene is playing
    this.bannerUntil = 0; // performance.now() when the banner is gone
    this.tip = element('tip', this.root);
    this.combo = element('combo', this.root);
    this.bossIntro = element('boss-intro', document.body);
    this.bossIntro.hidden = true;

    // Experience: tea leaves fill the bar; every level is a new skill or a skill upgrade.
    this.xpBar = element('xp-bar', this.root);
    this.xpFill = element('xp-fill', this.xpBar);
    this.xpLevel = element('xp-level', this.xpBar);

    this.bar = element('ability-bar', this.root);
    this.slots = {};
    for (const ability of ABILITIES) {
      const slot = element(`ability ability-${ability.id}${ability.skill ? ' skill' : ''}`, this.bar);
      slot.title = ability.name;
      const icon = element('ability-icon', slot);
      icon.textContent = ability.icon;
      const key = element('ability-key', slot);
      key.textContent = ability.key;
      const cover = element('ability-cover', slot);
      const timer = element('ability-timer', slot);
      const badge = element('ability-badge', slot);
      this.slots[ability.id] = { slot, icon, key, cover, timer, badge };
    }
    this.slots.ultimate.slot.hidden = true;
    for (let i = 0; i < MAX_SKILLS; i++) this.slots[`skill${i}`].slot.hidden = true;

    // Bottom left: charms (they stack without limit, shown with a count) above the brews.
    this.inventory = element('inventory', this.root);
    this.charms = element('owned charms', this.inventory);
    this.owned = element('owned', this.inventory);
    this.steep = element('steep-badge', this.root);
    this.steep.hidden = true;

    this.buttons = element('corner-buttons', document.body);
    this.pauseButton = element('round-button', this.buttons, 'button');
    this.pauseButton.textContent = '⏸';
    this.pauseButton.title = 'Pause (Esc)';
    this.pauseButton.addEventListener('click', (event) => {
      event.stopPropagation();
      this.onAction('pause');
    });
    this.muteButton = element('round-button', this.buttons, 'button');
    this.muteButton.title = 'Sound on/off (M)';
    this.muteButton.addEventListener('click', (event) => {
      event.stopPropagation();
      this.onAction('mute');
    });

    this.menu = element('menu', document.body);
    this.menu.hidden = true;
    this.menu.addEventListener('click', (event) => {
      const target = event.target.closest('[data-action]');
      // A card pick waits until the cards have faded in: a quick double tap picked a brew, and the second tap then
      // took a card of the menu that replaced it (the Bitter Shrine's Epic pick, the next skill) unseen.
      if (target?.classList.contains('card') && performance.now() - this.menuShownAt < CARD_TAP_DELAY) return;
      if (target) this.onAction(target.dataset.action, target.dataset);
      else if (this.menuClickAction) this.onAction(this.menuClickAction);
    });
    this.menu.addEventListener('submit', (event) => {
      event.preventDefault();
      if (event.target.dataset.form === 'coop') return;
      this.onAction('submit', { name: this.menu.querySelector('#player-name')?.value ?? '' });
    });

    // Popups over the menus (changelog, share card): the menu underneath stays as it was.
    this.modal = element('modal', document.body);
    this.modal.hidden = true;
    this.modal.addEventListener('click', (event) => {
      const target = event.target.closest('[data-action]');
      if (target) this.onAction(target.dataset.action, target.dataset);
      else if (event.target === this.modal) this.hideModal();
    });
    this.modal.addEventListener('submit', (event) => {
      event.preventDefault();
      if (event.target.dataset.form === 'save') this.onAction('load-save');
      if (event.target.dataset.form === 'garden') this.onAction('visit-go');
      if (event.target.dataset.form === 'profile') this.onAction('save-profile');
    });

    // The player tag popup shows the name as it's typed.
    this.modal.addEventListener('input', (event) => {
      if (event.target.id !== 'profile-name') return;
      const preview = this.modal.querySelector('.tag-name');
      if (preview) preview.textContent = event.target.value.trim() || '…';
    });

    this.damageNumbers = [];
    this.shownHealth = null;
  }

  setMuted(muted) {
    this.muteButton.textContent = muted ? '🔇' : '🔊';
  }

  /** The ⏸ corner button only means something during a run (not on the title screen or in a garden). */
  setPauseShown(shown) {
    if (this.pauseButton.hidden === shown) this.pauseButton.hidden = !shown;
  }

  /** `time`: the run's play time in seconds (menus and pauses don't count). */
  setScore(score, best, time = 0) {
    setText(this.score, `Score: ${score}   Best: ${best}   ⏱ ${formatTime(time)}`);
  }

  setHealth(hp, maxHp, shield = false) {
    const key = `${hp}/${maxHp}/${shield}`;
    if (this.shownHealth === key) return;
    this.shownHealth = key;
    const hearts = Array.from({ length: maxHp }, (_, i) => {
      const heart = element(i < hp ? 'heart' : 'heart empty', null, 'span');
      heart.textContent = '♥';
      return heart;
    });
    if (shield) {
      const petal = element('heart shield', null, 'span');
      petal.textContent = '🌸';
      hearts.push(petal);
    }
    this.hearts.replaceChildren(...hearts);
  }

  setForm(name, tier) {
    this.form.textContent = tier > 0 ? name : '';
    this.form.dataset.tier = tier;
  }

  setWave(wave, beesLeft) {
    setText(this.wave, beesLeft > 0 ? `Wave ${wave} · ${beesLeft} bees left` : `Wave ${wave}`);
  }

  setWeather(info) {
    this.weather.hidden = !info.text;
    // Phones: just the name; the explanation would cover the arena.
    this.weather.textContent = isTouch() ? `${info.icon} ${info.name}` : `${info.icon} ${info.name} · ${info.text}`;
  }

  /** The arena's side objective, e.g. "🐝 Smash the wild hives 1/3" (null hides it). */
  setObjective(text, urgent = false) {
    setProp(this.objective, 'hidden', !text);
    if (text) setText(this.objective, text);
    this.objective.classList.toggle('urgent', urgent);
  }

  /** Points the edge arrows at objective positions that are off screen. */
  setObjectiveArrows(points) {
    this.arrows.forEach((arrow, i) => {
      const point = points[i];
      let show = false;
      if (point) {
        const p = this.projected.set(point.x, point.y, 20).project(this.camera);
        if (p.z > 1) p.multiplyScalar(-1);
        if (Math.abs(p.x) > 0.92 || Math.abs(p.y) > 0.88) {
          show = true;
          const scale = Math.max(Math.abs(p.x) / 0.9, Math.abs(p.y) / 0.82);
          const x = ((p.x / scale + 1) / 2) * viewWidth();
          const y = ((1 - p.y / scale) / 2) * viewHeight();
          setStyle(arrow, 'transform', `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px) translate(-50%, -50%) rotate(${Math.atan2(-p.y, p.x).toFixed(2)}rad)`);
        }
      }
      setProp(arrow, 'hidden', !show);
    });
  }

  /** Wave modifiers: [{ icon, name, text }]. */
  setModifiers(list) {
    this.modifiers.hidden = !list.length;
    setText(this.modifiers, list.map((mod) => (isTouch() ? `${mod.icon} ${mod.name}` : `${mod.icon} ${mod.name} · ${mod.text}`)).join('   '));
  }

  /** A raid mechanic's status line (null hides it); `urgent` makes it pulse. */
  setRaid(text, urgent = false) {
    setProp(this.raid, 'hidden', !text);
    if (text) setText(this.raid, text);
    if (this.raid.classList.contains('urgent') !== urgent) this.raid.classList.toggle('urgent', urgent);
  }

  setBoss(enemy) {
    setProp(this.boss, 'hidden', !enemy);
    if (!enemy) return;
    const state = enemy.shielded ? 'shielded' : enemy.ai?.staggerLeft > 0 ? 'staggered' : enemy.enraged ? 'enraged' : '';
    if (this.boss.dataset.state !== state) this.boss.dataset.state = state;
    const names = { shielded: `🛡 ${enemy.type.name} · SHIELDED`, staggered: `💫 ${enemy.type.name} · STAGGERED`, enraged: `😡 ${enemy.type.name} · ENRAGED` };
    setText(this.bossName, names[state] ?? enemy.type.name);
    setStyle(this.bossFill, 'width', `${((Math.max(0, enemy.hp) / enemy.maxHp) * 100).toFixed(1)}%`);
  }

  /** Seconds until the boss enrages (null hides the timer). */
  setBossTimer(seconds) {
    setText(this.bossTimer, seconds === null ? '' : seconds > 0 ? `⏱ Enrage in ${formatTime(seconds)}` : '');
    if (this.bossTimer.classList.contains('urgent') !== (seconds !== null && seconds < 20)) this.bossTimer.classList.toggle('urgent');
  }

  /** The boss's channel to interrupt: `fraction` 0–1 of the damage needed (null hides it). */
  setBreakBar(fraction, label = '') {
    setProp(this.breakBar, 'hidden', fraction === null);
    if (fraction === null) return;
    setStyle(this.breakFill, 'width', `${(Math.min(1, fraction) * 100).toFixed(1)}%`);
    this.breakBar.dataset.label = label;
  }

  setCooldown(id, left, total) {
    const { slot, cover, timer } = this.slots[id];
    const fraction = total > 0 ? THREE.MathUtils.clamp(left / total, 0, 1) : 0;
    setStyle(cover, 'transform', `scaleY(${fraction.toFixed(3)})`);
    setText(timer, left > 0.3 ? Math.ceil(left) : '');
    if (slot.classList.contains('ready') !== left <= 0) slot.classList.toggle('ready', left <= 0);
  }

  setDashCharges(charges, max) {
    this.setCharges('dash', charges, max);
  }

  setCharges(id, charges, max) {
    setText(this.slots[id].badge, max > 1 ? charges : '');
  }

  /** `gauge` is 0–100. Hidden until an ultimate is chosen. */
  setUltimate(id, gauge) {
    const { slot, icon, cover, timer } = this.slots.ultimate;
    setProp(slot, 'hidden', !id);
    if (!id) return;
    setText(icon, ULTIMATES[id].icon);
    setProp(slot, 'title', ULTIMATES[id].name);
    setStyle(cover, 'transform', `scaleY(${(1 - gauge / 100).toFixed(3)})`);
    setText(timer, gauge < 100 ? `${Math.floor(gauge)}%` : '');
    if (slot.classList.contains('ready') !== gauge >= 100) {
      slot.classList.toggle('ready', gauge >= 100);
      slot.classList.toggle('charging', gauge < 100);
    }
  }

  /** Learned skills: [{ id, level, cooldownLeft }] (they cast themselves). */
  setSkills(slots) {
    for (let i = 0; i < MAX_SKILLS; i++) {
      const slot = slots[i];
      const ui = this.slots[`skill${i}`];
      setProp(ui.slot, 'hidden', !slot);
      if (!slot) continue;
      const skill = SKILLS[slot.id];
      setText(ui.icon, skill.icon);
      setProp(ui.slot, 'title', `${skill.name} (level ${slot.level})`);
      setText(ui.badge, slot.level > 1 ? slot.level : '');
      this.setCooldown(`skill${i}`, slot.cooldownLeft, skill.cooldown(slot.level));
    }
  }

  /** The brews picked this run: [{ icon, name, level, blend }]. */
  setOwned(list) {
    this.counts.brews = list.length;
    this.updateSummary();
    this.owned.replaceChildren(
      ...list.map(({ icon, name, level, color }) => {
        const item = element('owned-item');
        item.title = name;
        item.textContent = icon;
        item.style.setProperty('--blend', color);
        if (level > 1) element('owned-level', item, 'span').textContent = level;
        return item;
      })
    );
  }

  /** Charms gathered this run: [{ icon, name, count, rarity, text }]. */
  setCharms(list) {
    this.counts.charms = list.reduce((sum, charm) => sum + charm.count, 0);
    this.updateSummary();
    this.charms.replaceChildren(
      ...list.map(({ icon, name, count, rarity, text }) => {
        const item = element('owned-item charm', null);
        item.title = `${name}: ${text}`;
        item.textContent = icon;
        item.style.setProperty('--blend', CHARM_RARITIES[rarity].color);
        if (count > 1) element('owned-level', item, 'span').textContent = count;
        return item;
      })
    );
  }

  updateSummary() {
    const { brews, charms } = this.counts;
    setText(this.summary, [brews && `🍵 ${brews}`, charms && `💎 ${charms}`].filter(Boolean).join(' · '));
  }

  /** The run's Steep level next to the score (hidden at 0). */
  setSteep(steep, gentle = false) {
    this.steep.hidden = !steep && !gentle;
    this.steep.textContent = gentle ? '🌿 Gentle Brew' : `🔥 Steep ${steep}`;
  }

  showBanner(title, subtitle = '', duration = 1.6, className = '') {
    this.banner.className = `banner ${className}`;
    this.banner.innerHTML = `<div class="banner-title">${title}</div><div class="banner-sub">${subtitle}</div>`;
    void this.banner.offsetWidth; // restart the CSS animation
    this.banner.style.animationDuration = `${duration}s`;
    this.banner.classList.add('show');
    this.bannerUntil = performance.now() + duration * 1000;
  }

  /** "Waiting for teammates" between co-op waves; `null` hides it. */
  setWaiting(ready, total) {
    this.waiting.textContent = ready === null ? '' : `⏳ Waiting for teammates… ${ready}/${total} ready`;
  }

  /** Co-op: our connection to the server, `level` 'good' (hidden), 'weak', 'bad' or 'lost'; `rtt` in ms. */
  setConnection(level, rtt = 0) {
    this.connection.hidden = level === 'good';
    if (level === 'good') return;
    // In steps of 50 ms, so the text doesn't change every frame.
    const ms = `${Math.round(rtt / 50) * 50} ms`;
    const text = { weak: `📶 Weak connection · ${ms}`, bad: `📶 Bad connection · ${ms} · hits may not land`, lost: '📡 Reconnecting…' }[level];
    setText(this.connection, text);
    setProp(this.connection, 'className', `connection ${level}`);
  }

  // --- Co-op name tags ---------------------------------------------------------------

  attachNameTag(name, color) {
    const tag = element('name-tag', this.worldLayer);
    const label = element('name-tag-name', tag);
    label.textContent = name;
    label.style.color = color;
    // We haven't heard from this teammate for a moment (their connection, or ours).
    const lag = element('name-tag-lag', label, 'span');
    lag.textContent = ' 📶';
    lag.title = 'Bad connection';
    lag.hidden = true;
    const bar = element('name-tag-bar', tag);
    return { tag, fill: element('name-tag-fill', bar), lag };
  }

  updateNameTag({ tag, fill, lag }, position, visible, hp, maxHp, lagging = false) {
    const shown = visible && this.place(tag, position, 42);
    tag.style.display = shown ? '' : 'none';
    if (shown) fill.style.width = `${(Math.max(0, hp) / Math.max(1, maxHp)) * 100}%`;
    if (lag.hidden === lagging) lag.hidden = !lagging;
  }

  removeNameTag({ tag }) {
    tag.remove();
  }

  /** A label floating over a spot in the world (shrines). */
  attachWorldLabel(html, color) {
    const label = element('world-label', this.worldLayer);
    label.innerHTML = html;
    label.style.setProperty('--label', color);
    return label;
  }

  updateWorldLabel(label, position, height, visible = true) {
    const shown = visible && this.place(label, position, height);
    setStyle(label, 'display', shown ? '' : 'none');
  }

  setWorldLabel(label, html) {
    if (label.innerHTML !== html) label.innerHTML = html;
  }

  /**
   * The co-op lobby. `view` is 'start' (create or join), 'room' (in a room) or 'connecting'.
   */
  showLobby({ view, code, players = [], isHost, error, name, invite, isPublic = false, rooms = null, steep = 0, gardens = null }) {
    const errorLine = error ? `<p class="lobby-error">${escapeHtml(error)}</p>` : '';
    let body;
    if (view === 'connecting') {
      body = '<p class="sub">Connecting…</p>';
    } else if (view === 'room') {
      const list = players
        .map((p) => `<li style="--player:${p.color}"><span class="dot"></span>${escapeHtml(p.name)}${p.isHost ? ' <small>host</small>' : ''}</li>`)
        .join('');
      const start = isHost
        ? `<button class="menu-button primary" data-action="coop-start">▶ Start co-op run</button>`
        : '<p class="sub">Waiting for the host to start…</p>';
      const visibility = isPublic
        ? '<p class="room-visibility public">🌍 Public room: anyone can join it from the list</p>'
        : '<p class="room-visibility">🔒 Private room: only with the code or the link</p>';
      const toggle = isHost
        ? `<button class="menu-button" data-action="coop-visibility">${isPublic ? '🔒 Make private' : '🌍 Make public'}</button>`
        : '';
      const steepLine = isHost
        ? `<p class="sub">🔥 Steep <b>${steep}</b>${steep ? ` · score and leaves ×${steepBonus(steep).toFixed(2)}` : ''} <button type="button" class="tag-chip" data-action="coop-steeping">Change vows</button></p>`
        : steep ? `<p class="sub">🔥 The host steeped this run: Steep <b>${steep}</b> (×${steepBonus(steep).toFixed(2)})</p>` : '';
      body = `
        ${visibility}
        ${steepLine}
        <p class="sub">Share this room code with your friends:</p>
        <div class="room-code">${code}</div>
        <p class="sub invite-link">or send them the link <b>${escapeHtml(invite ?? '')}</b></p>
        <ul class="lobby-players">${list}</ul>
        <p class="sub">The garden grows and more bees come with every extra frog (up to 4).</p>
        <div class="menu-buttons">${start}${toggle}<button class="menu-button" data-action="coop-invite">🔗 Copy invite link</button><button class="menu-button" data-action="coop-leave">Leave</button></div>`;
    } else {
      // `code`: a room code from an invite link, ready to join.
      const invited = code ? `<p class="sub">You're invited to room <b>${escapeHtml(code)}</b>: enter your name and join.</p>` : '';
      body = `
        ${invited}
        <p class="sub">Up to 4 frogs in one garden: bigger swarms, bigger rewards.</p>
        <div class="lobby-who">${this.tagChip()}</div>
        <div class="menu-buttons"><button class="menu-button ${code ? '' : 'primary'}" type="button" data-action="coop-quick">⚡ Quick play</button></div>
        <h3>🌍 Open rooms</h3>
        <div class="room-list">${this.roomList(rooms)}</div>
        <h3>🏡 Public gardens <small>hop around together, then set off as a party</small></h3>
        <div class="room-list garden-list">${this.gardenRows(gardens)}</div>
        <div class="menu-buttons lobby-create">
          <button class="menu-button" type="button" data-action="coop-create">🌍 Create public room</button>
          <button class="menu-button" type="button" data-action="coop-create-private">🔒 Create private room</button>
        </div>
        <h3>🔑 Join with a code</h3>
        <form class="lobby-form" data-form="coop">
          <input id="coop-code" maxlength="4" placeholder="CODE" autocomplete="off" value="${escapeHtml(code ?? '')}" />
          <button class="menu-button ${code ? 'primary' : ''}" type="button" data-action="coop-join">🚪 Join room</button>
        </form>
        <div class="menu-buttons"><button class="menu-button" data-action="title">Back</button></div>`;
    }
    this.showMenu('lobby', `<div class="panel"><h2>👥 Co-op</h2>${errorLine}${body}</div>`);
  }

  /** The public rooms in the lobby: `rooms` from /api/rooms (null while loading or without a server). */
  roomList(rooms) {
    if (!rooms) return '<p class="sub room-empty">Looking for rooms…</p>';
    if (!rooms.rooms.length) {
      return `<p class="sub room-empty">No open rooms right now${rooms.playing ? ` (${rooms.playing} frog${rooms.playing > 1 ? 's' : ''} in a co-op run)` : ''}. Quick play makes one that others can join.</p>`;
    }
    return rooms.rooms
      .map(
        (room) => `<div class="room-row">
          <span class="room-host">🐸 ${escapeHtml(room.host)}'s garden</span>
          <span class="room-seats">${'●'.repeat(room.players)}${'○'.repeat(Math.max(0, room.max - room.players))} <small>${room.players}/${room.max}</small></span>
          <button class="menu-button" type="button" data-action="coop-join-room" data-code="${escapeHtml(room.code)}">Join</button>
        </div>`
      )
      .join('');
  }

  /** Refreshes only the room list, so a name being typed isn't lost. */
  setLobbyRooms(rooms) {
    const list = this.menuName === 'lobby' && this.menu.querySelector('.room-list');
    if (list) list.innerHTML = this.roomList(rooms);
  }

  /** The Co-op button on the title screen: how many public rooms are open. */
  setCoopRooms(rooms) {
    this.coopRooms = rooms;
    const label = this.menuName === 'title-screen' && this.menu.querySelector('[data-coop-count]');
    if (label) label.outerHTML = coopBadge(rooms);
  }

  /** The Visit garden button on the title screen: how many public gardens have frogs in them right now. */
  setLiveGardens(gardens) {
    this.liveGardens = gardens;
    const label = this.menuName === 'title-screen' && this.menu.querySelector('[data-garden-count]');
    if (label) label.outerHTML = gardenLabel(gardens);
  }

  /** A gentle hint above the ability bar for new players. */
  showTip(text) {
    this.tip.innerHTML = `💡 ${text}`;
    this.tip.classList.remove('show');
    void this.tip.offsetWidth;
    this.tip.classList.add('show');
  }

  /** `keepsake`: the keepsake this achievement unlocks, if any. */
  showAchievement({ icon, name, text, reward }, keepsake = null, wearable = null) {
    const unlocked =
      (keepsake ? `<em class="toast-keepsake">🎒 New keepsake: ${keepsake.icon} ${keepsake.name}</em>` : '') +
      (wearable ? `<em class="toast-keepsake">👕 New to wear: ${wearable.icon} ${wearable.name}</em>` : '');
    this.toast(`<span class="toast-icon">${icon}</span><span><small>Achievement unlocked · +${reward} 🍃</small><b>${name}</b><em>${text}</em>${unlocked}</span>`);
  }

  /** A charm picked up: its icon, name and what the whole stack does now. */
  showCharm({ icon, name, rarity }, count, text, position) {
    const color = CHARM_RARITIES[rarity].color;
    // Phones: just the icon floating up from Tode; the counter and the pause menu say the rest.
    if (isTouch() && position) {
      this.damageNumber(position, `+${icon}${count > 1 ? `×${count}` : ''}`, 36, 'charm');
      return;
    }
    this.toast(
      `<span class="toast-icon">${icon}</span><span><small style="color:${color}">${CHARM_RARITIES[rarity].name} charm${count > 1 ? ` · ×${count}` : ''}</small><b>${name}</b><em>${text}</em></span>`,
      'charm-toast',
      isTouch() ? 1.8 : 2.6
    );
  }

  /**
   * A toast in the column at the side (v0.29.4: they used to stack in the middle, over Tode and the boss bar). At most
   * `TOAST_MAX` show at once; the rest wait their turn, and nothing new comes in while the game holds them
   * (`toastsHeld`: boss intros and other cut-scenes, set by main.js) or a banner is up.
   */
  toast(html, className = '', seconds = 4.2) {
    if (isTouch()) seconds = Math.min(seconds, 3);
    this.toastQueue.push({ html, className, seconds });
    // A burst of charms shouldn't keep the column busy for half a minute: the oldest waiting charm goes first.
    while (this.toastQueue.length > TOAST_QUEUE) {
      const charm = this.toastQueue.findIndex((t) => t.className.includes('charm-toast'));
      this.toastQueue.splice(charm >= 0 ? charm : 0, 1);
    }
    this.pumpToasts();
  }

  /** Shows waiting toasts while there's room (every frame from `update`, and when one is added). */
  pumpToasts() {
    if (!this.toastQueue.length || this.toastsHeld || performance.now() < this.bannerUntil) return;
    while (this.toastQueue.length && this.toasts.querySelectorAll('.toast:not(.leaving)').length < TOAST_MAX) {
      const { html, className, seconds } = this.toastQueue.shift();
      const toast = element(`toast ${className}`, this.toasts);
      toast.innerHTML = html;
      setTimeout(() => toast.classList.add('leaving'), seconds * 1000);
      setTimeout(() => toast.remove(), seconds * 1000 + 600);
    }
  }

  /** The server refused a run report: its Golden Leaves won't be paid. */
  runRefused(error) {
    this.toast(`<span class="toast-icon">☁️</span><span><b>No Golden Leaves for that run</b><em>${escapeHtml(error)}</em></span>`, '', 8);
  }

  /** `pending`: levels whose skill pick is still to come (co-op saves them for the end of the wave). */
  setXp(fraction, level, pending = 0) {
    setStyle(this.xpFill, 'width', `${(Math.min(1, fraction) * 100).toFixed(1)}%`);
    setText(this.xpLevel, pending > 0 ? `Lv ${level} (+${pending})` : `Lv ${level}`);
  }

  /** `progress` 0–1: how far Tode has pushed the clash toward the boss. */
  showClash(progress, label) {
    this.clash.hidden = false;
    setText(this.clashLabel, label);
    setStyle(this.clashFill, 'width', `${(progress * 100).toFixed(1)}%`);
  }

  hideClash() {
    this.clash.hidden = true;
  }

  setCombo(count) {
    if (this.shownCombo === count) return;
    this.shownCombo = count;
    setText(this.combo, count >= 3 ? `${count} combo` : '');
    this.combo.classList.toggle('hot', count >= 15);
    this.combo.classList.toggle('divine', count >= 40);
  }

  /** A big kill-streak shout ("Brewtal!"). */
  showCallout(text) {
    this.callout.textContent = text;
    this.callout.classList.remove('show');
    void this.callout.offsetWidth;
    this.callout.classList.add('show');
  }

  /** Letterboxed name card for a boss entrance; `taunt`: what the boss says to Tode. */
  showBossIntro(name, epithet, taunt = '') {
    const line = taunt ? `<div class="boss-card-taunt">“${escapeHtml(taunt)}”</div>` : '';
    this.bossIntro.innerHTML = `<div class="letterbox top"></div><div class="letterbox bottom"></div>
      <div class="boss-card"><div class="boss-card-name">${name}</div><div class="boss-card-epithet">${epithet}</div>${line}</div>`;
    this.bossIntro.hidden = false;
    this.bossIntro.classList.remove('leaving');
  }

  /** Letterboxed story cut-scene with subtitles. */
  showStory() {
    this.bossIntro.innerHTML = `<div class="letterbox top"></div><div class="letterbox bottom"></div>
      <div class="story-line"></div><div class="story-skip">Click or press any key to skip</div>`;
    this.bossIntro.hidden = false;
    this.bossIntro.classList.remove('leaving');
  }

  setStoryLine(text) {
    const line = this.bossIntro.querySelector('.story-line');
    if (!line) return;
    line.textContent = text;
    line.classList.remove('show');
    void line.offsetWidth;
    line.classList.add('show');
  }

  hideBossIntro() {
    this.bossIntro.classList.add('leaving');
    setTimeout(() => (this.bossIntro.hidden = true), 500);
  }

  flashHurt() {
    this.hurtFlash.classList.remove('active');
    void this.hurtFlash.offsetWidth;
    this.hurtFlash.classList.add('active');
  }

  damageNumber(position, amount, height = 20, className = '') {
    if (this.damageNumbers.length > (isTouch() ? 40 : 80)) return; // each one is a DOM node moved every frame
    const node = element(`damage-number ${className}`, this.worldLayer);
    node.textContent = amount;
    this.damageNumbers.push({ node, position: position.clone().setZ(height), age: 0 });
  }

  attachHealthBar(enemy) {
    const tagged = enemy.elite || enemy.type.label;
    const bar = element(tagged ? 'health-bar elite' : 'health-bar', this.worldLayer);
    if (tagged) {
      const label = element('elite-label', bar);
      label.textContent = enemy.type.label ?? `${enemy.elite.icon} ${enemy.elite.name}`;
      label.style.color = enemy.type.label ? enemy.type.tint : enemy.elite.color;
    }
    enemy.healthBar = { bar, fill: element('health-fill', bar) };
  }

  /** A label over a bee's health bar (co-op attuned wards and guardians); the bar then always shows. */
  setEnemyLabel(enemy, text, color) {
    enemy.labelText = text;
    if (!enemy.healthBar) return;
    const { bar } = enemy.healthBar;
    bar.classList.add('elite');
    const label = bar.querySelector('.elite-label') ?? element('elite-label', bar);
    if (!label.parentNode || label !== bar.firstChild) bar.prepend(label);
    label.textContent = text;
    label.style.color = color;
  }

  removeHealthBar(enemy) {
    enemy.healthBar?.bar.remove();
    enemy.healthBar = null;
  }

  // --- Menus ---------------------------------------------------------------

  /** `clickAction` fires when the player clicks anywhere that isn't a button. */
  showMenu(className, html, clickAction = null) {
    clearInterval(this.typing);
    this.onHush();
    // The same screen drawn again (a click changed something): its lists keep where they were scrolled to.
    const scrolls = !this.menu.hidden && this.menu.className === `menu ${className}` ? scrollState(this.menu) : null;
    this.menuName = className.split(' ')[0];
    this.menu.className = `menu ${className}`;
    this.menu.innerHTML = html;
    this.menu.hidden = false;
    if (scrolls) restoreScroll(this.menu, scrolls);
    this.menuShownAt = performance.now();
    this.menuClickAction = clickAction;
    // The game-over screen stands alone: the run's HUD (wave line, boss bar, ability bar, tips) hides behind it.
    document.body.classList.toggle('run-ended', this.menuName === 'game-over');
    // The title has no corner buttons (sound is in its ⚙️ Settings, screenshots are C): they would sit on its dock.
    document.body.classList.toggle('title-open', this.menuName === 'title-screen');
    document.body.classList.remove('run-paused', 'coop-menu');
    return scrolls; // (a screen that fills itself in afterwards, like the garden editor, restores them again)
  }

  hideMenu() {
    clearInterval(this.typing);
    this.onHush();
    this.menuName = null;
    this.menu.hidden = true;
    this.menu.innerHTML = '';
    this.menuClickAction = null;
    document.body.classList.remove('run-ended', 'title-open', 'run-paused', 'coop-menu');
  }

  get menuOpen() {
    return !this.menu.hidden;
  }

  showModal(className, html) {
    const scrolls = !this.modal.hidden && this.modal.className === `modal ${className}` ? scrollState(this.modal) : null;
    this.modal.className = `modal ${className}`;
    this.modal.innerHTML = `<div class="panel">${html}</div>`;
    this.modal.hidden = false;
    if (scrolls) restoreScroll(this.modal, scrolls);
  }

  hideModal() {
    this.modal.hidden = true;
    this.modal.innerHTML = '';
  }

  /** Whether the popup `name` (its class, e.g. 'settings') is open. */
  modalIs(name) {
    return !this.modal.hidden && this.modal.classList.contains(name);
  }

  get modalOpen() {
    return !this.modal.hidden;
  }

  /** iPhone: how to play fullscreen (Safari there can't do it for a web page; the Home Screen can). */
  showFullscreenHelp() {
    this.showModal(
      'fullscreen-help',
      `<h2>⛶ Play fullscreen on iPhone</h2>
      <p class="sub">Safari on iPhone can't show a web game fullscreen, but Todeity can live on your Home Screen like an app,
      without any browser bars:</p>
      <ol class="steps">
        <li>Tap <b>Share</b> <span class="step-icon">⬆︎</span> in Safari's toolbar (at the bottom, or behind <b>⋯</b>).</li>
        <li>Scroll down and tap <b>Add to Home Screen</b> <span class="step-icon">⊞</span>.</li>
        <li>Tap <b>Add</b>, then open <b>Todeity</b> from your Home Screen.</li>
      </ol>
      <p class="sub">Your progress comes along: it's kept by your save code (☁️ on the title screen).</p>
      <div class="menu-buttons"><button class="menu-button primary" data-action="close-modal">Got it</button></div>`
    );
  }

  /**
   * Phones held upright: before a run, ask to turn the phone sideways (the run starts by itself once it's turned).
   * `canTurn`: the browser can go fullscreen in landscape itself (Android).
   */
  showRotate({ canTurn }) {
    this.showModal(
      'rotate-phone',
      `<div class="rotate-art"><span class="turn-phone big">📱</span></div>
      <h2>Turn your phone sideways</h2>
      <p class="sub">Todeity plays best in landscape: you see much more of the arena around Tode, and both thumbs have
      room for the sticks. The run starts as soon as you turn.</p>
      <div class="menu-buttons">
        ${canTurn ? '<button class="menu-button primary" data-action="turn-landscape">↻ Fullscreen, sideways</button>' : ''}
        <button class="menu-button${canTurn ? '' : ' primary'}" data-action="portrait-anyway">Play upright anyway</button>
      </div>
      <p class="sub small">Doesn't turn? Switch off the screen rotation lock (Control Center on iPhone, quick settings on Android).</p>`
    );
  }

  /** A run playing upright on a phone: a short reminder at the top that sideways is better. */
  showRotateHint() {
    this.rotateHint ??= element('rotate-hint', document.body);
    this.rotateHint.innerHTML = '<span class="turn-phone">📱</span> Turn sideways to see more of the arena';
    this.rotateHint.classList.remove('show');
    void this.rotateHint.offsetWidth; // restart the animation
    this.rotateHint.classList.add('show');
  }

  showChangelog() {
    const entries = CHANGELOG.map(
      ({ version, date, title, changes }) => `
        <section class="release">
          <h3>v${version} · ${title} <small>${date}</small></h3>
          <ul>${changes.map((change) => `<li>${change}</li>`).join('')}</ul>
        </section>`
    ).join('');
    this.showModal(
      'changelog',
      `<h2>📜 What's new</h2>
      <div class="releases">${entries}</div>
      <div class="menu-buttons"><button class="menu-button primary" data-action="close-modal">Close</button></div>`
    );
  }

  /** The share card preview; `native`: the device has a share sheet. */
  showShare(image, native, copyImage) {
    this.showModal(
      'share',
      `<h2>📤 Share your run</h2>
      <img class="share-card" src="${image}" alt="Your run: score, time, wave and abilities" />
      <div class="menu-buttons">
        ${native ? '<button class="menu-button primary" data-action="share-native">📤 Share</button>' : ''}
        ${copyImage ? `<button class="menu-button ${native ? '' : 'primary'}" data-action="share-copy-image">🖼 Copy image</button>` : ''}
        <button class="menu-button ${native || copyImage ? '' : 'primary'}" data-action="share-copy">📋 Copy text</button>
        <button class="menu-button" data-action="share-save">💾 Save image</button>
        <button class="menu-button" data-action="close-modal">Close</button>
      </div>
      <p class="sub share-status"></p>`
    );
  }

  setShareStatus(text) {
    const status = this.modal.querySelector('.share-status');
    if (status) status.textContent = text;
  }

  /** A menu button that switches fullscreen; nothing where the browser can't do it. */
  /** Whether Tode spits by himself on a computer (the title's controls and the spit slot's key say so). */
  get autoSpit() {
    return this.autoSpitOn;
  }

  set autoSpit(on) {
    this.autoSpitOn = on;
    this.slots.spit.key.textContent = on ? 'auto' : 'LMB';
  }

  /**
   * The title screen (v0.29.9, layout "3c"): the level card and the small extras along the top, the name, the frog
   * that plays and Start run in the middle, everything else in the dock at the bottom.
   */
  showTitle(best) {
    const fresh = !meta.runs;
    // A new player gets the controls (the story line that used to come first pushed the dock off phone screens).
    const intro = fresh
      ? `${
          document.body.classList.contains('touch')
            ? `<div class="controls">
          <span><b>Left stick</b> move</span>
          <span><b>Right stick</b> aim</span>
          <span>Tode <b>spits</b> by himself</span>
          <span><b>💨</b> hop dash</span>
          <span><b>✨</b> ultimate</span>
          <span>Skills and bombs cast <b>themselves</b></span>
        </div>`
            : `<div class="controls">
          <span><b>WASD</b> move</span>
          <span><b>Mouse</b> aim</span>
          ${this.autoSpit ? '<span>Tode <b>spits</b> by himself</span>' : '<span><b>Hold LMB</b> spit</span>'}
          <span><b>Space / RMB</b> hop dash</span>
          <span><b>E</b> ultimate</span>
          <span>Skills and bombs cast <b>themselves</b></span>
          <span><b>Esc</b> pause</span>
        </div>`
        }`
      : '';
    this.showMenu(
      'title-screen',
      `
      <div class="title-top">
        ${fresh ? '<span></span>' : this.levelCard()}
        <div class="title-corner">
          ${this.newVersion ? `<button type="button" class="title-pill update-pill" data-action="reload" title="The game was updated while you played">✨ v${escapeHtml(this.newVersion)} is out · reload</button>` : ''}
          <button type="button" class="title-pill" data-action="changelog">📜 v${VERSION}<span class="long"> · What's new</span></button>
          <button type="button" class="title-round" data-action="settings" title="Settings" aria-label="Settings">⚙️</button>
        </div>
      </div>
      <div class="title-main">
        <h1 class="wordmark">Todeity</h1>
        <p class="subtitle">Rise of the Tea God</p>
        ${intro}
        ${best && fresh ? `<p class="best">Best score: ${best}</p>` : ''}
        <p class="portrait-hint"><span class="turn-phone">📱</span> Turn your phone sideways: Todeity plays best in landscape</p>
        <button class="class-chip" data-action="classes">${this.classFace(chosenClass())}<span><small>Playing as</small><b>${chosenClass().name}</b></span><em>Change ▸</em></button>
        <button class="start-button" data-action="start">Start run</button>
        ${meta.gentle ? `<button type="button" class="gentle-note" data-action="settings" title="${GENTLE_TEXT}">🌿 Gentle Brew is on</button>` : ''}
      </div>
      <nav class="title-dock" aria-label="Ways to play">${this.titleDock()}</nav>`
    );
  }

  showPantry() {
    const rows = PANTRY.map((upgrade) => {
      const level = pantryLevel(upgrade.id);
      const cost = nextCost(upgrade);
      const pips = upgrade.costs.map((_, i) => `<i class="${i < level ? 'on' : ''}"></i>`).join('');
      const button =
        cost === undefined
          ? '<span class="maxed">Maxed</span>'
          : `<button class="menu-button buy" data-action="buy" data-id="${upgrade.id}" ${meta.leaves < cost ? 'disabled' : ''}>🍃 ${cost}</button>`;
      return `
        <div class="upgrade">
          <span class="upgrade-icon">${upgrade.icon}</span>
          <span class="upgrade-text"><b>${upgrade.name}</b><small>${upgrade.text}</small><span class="pips">${pips}</span></span>
          ${button}
        </div>`;
    }).join('');
    this.showMenu(
      'pantry',
      `
      <div class="panel">
        <h2>Tode's Pantry</h2>
        <p class="sub">Golden Leaves earned in every run buy upgrades that last forever.</p>
        <p class="leaves">🍃 ${meta.leaves} Golden Leaves</p>
        <div class="upgrades">${rows}</div>
        <h3>🏆 Achievements <small>${ACHIEVEMENTS.filter((a) => isUnlocked(a.id)).length}/${ACHIEVEMENTS.length} · ${ACHIEVEMENTS.filter((a) => isUnlocked(a.id)).reduce((sum, a) => sum + a.reward, 0)}/${ACHIEVEMENTS.reduce((sum, a) => sum + a.reward, 0)} 🍃</small></h3>
        <div class="achievements">${ACHIEVEMENTS.map(
          (a) => `<span class="achievement ${isUnlocked(a.id) ? 'unlocked' : ''}" title="${a.name}: ${a.text} (+${a.reward} 🍃)">${a.icon}</span>`
        ).join('')}</div>
        <div class="menu-buttons">${this.saveChip()}<button class="menu-button" data-action="title">Back</button></div>
      </div>`
    );
  }

  /** Top left of the title (after the first run): level, name and rank, the bar to the next level. Opens the profile. */
  levelCard() {
    const { level, rank, progress } = accountLevel(meta);
    const name = meta.profile?.name;
    return `<button type="button" class="level-card" data-action="player" title="Your profile">
      <span class="profile-level"><b>${level}</b><small>LV</small></span>
      <span class="profile-info"><b>${name ? `${escapeHtml(name)} · ` : ''}${rank}</b><span class="profile-bar"><i style="width:${Math.round(progress * 100)}%"></i></span></span>
      <em aria-hidden="true">▸</em>
    </button>`;
  }

  /**
   * The title's dock: the ways to play, then (after the first run) preparing a run and the garden, then the daily
   * gift and the kettle. A new player sees only the ways to play and Visit; after the first run the rest appears,
   * marked New until the next run starts (`meta.seenUnlocks`).
   */
  titleDock() {
    const tile = (action, icon, label, { badge = '', title = '', extra = '', attrs = '' } = {}) =>
      `<button type="button" class="dock-tile${extra}" data-action="${action}"${title ? ` title="${escapeHtml(title)}"` : ''}${attrs}><span class="dock-icon">${icon}</span><span class="dock-label">${label}</span>${badge}</button>`;
    const daily = classOfTheDay(todayKey());
    const play = [
      tile('daily', '📅', 'Daily Brew', { title: `Today: ${daily.name} · ${dailyTwists(todayKey()).title}`, badge: `<em class="dock-badge plain">${daily.icon}</em>` }),
      tile('coop', '👥', 'Co-op', { badge: coopBadge(this.coopRooms) }),
      tile('leaderboard', '🏆', 'Leaderboard', { attrs: ' data-board="all"' }),
    ];
    const visit = tile('garden-visit', '👀', 'Visit', { title: 'Visit a garden', badge: gardenLabel(this.liveGardens) });
    const sep = '<span class="dock-sep"></span>';
    if (!meta.runs) return [...play, sep, visit].join('');
    const extra = meta.seenUnlocks ? '' : ' fresh';
    const isNew = meta.seenUnlocks ? '' : '<em class="dock-badge">New</em>';
    const unseenWear = unlockedWearables(meta).filter((id) => !(meta.wearablesSeen ?? []).includes(id)).length;
    const steep = meta.gentle ? '🌿' : steepLevel() || '';
    const prepare = [
      tile('pantry', '🍃', 'Pantry', { extra, badge: isNew, title: `${meta.leaves} Golden Leaves` }),
      tile('keepsakes', currentKeepsake().icon, 'Keepsake', { extra, badge: isNew }),
      tile('steeping', '🔥', 'Steeping', { extra, badge: isNew || (steep ? `<em class="dock-badge plain">${steep}</em>` : ''), title: meta.gentle ? 'Off: Gentle Brew is on' : steepLevel() ? `Steep ${steepLevel()}` : 'Off' }),
      tile('wardrobe', '👕', 'Wardrobe', { extra: extra || (unseenWear ? ' fresh' : ''), badge: unseenWear ? `<em class="dock-badge">${unseenWear}</em>` : isNew, title: `${unlockedWearables(meta).length}/${WEARABLES.length} unlocked` }),
      tile('garden', '🏡', 'My garden', { extra, badge: isNew, title: `${ownedTrinkets(meta).length}/${TRINKETS.length} trinkets` }),
      visit,
    ];
    const now = Date.now();
    const rewards = [this.rewardTile('gift', giftStatus(meta, now)), this.rewardTile('kettle', kettleStatus(meta, now))];
    return [...play, sep, ...prepare, sep, ...rewards].join('');
  }

  /** The daily gift or the kettle in the dock: a ring fills while it counts down, and it glows when it's ready. */
  rewardTile(kind, state) {
    const gift = kind === 'gift';
    const label = state.ready ? (gift ? `Day ${state.day} gift` : 'Tea ready') : `<time>${clock(state.nextIn)}</time>`;
    const title = state.ready ? (gift ? 'Claim your daily gift' : 'The kettle is ready') : gift ? 'Next daily gift' : 'The kettle is brewing';
    return `<button type="button" class="dock-tile reward-tile${state.ready ? ' ready' : ''}" data-action="claim-${kind}" data-reward="${kind}" title="${title}" style="--p:${rewardProgress(kind, state)}"><span class="dock-icon">${gift ? '🎁' : '🫖'}</span><span class="dock-label">${label}</span></button>`;
  }

  /** Keeps the reward countdowns on the title screen ticking; redraws a chip when it becomes ready. */
  updateRewardTimers() {
    if (this.menuName !== 'title-screen') return false;
    const now = Date.now();
    const states = { gift: giftStatus(meta, now), kettle: kettleStatus(meta, now) };
    for (const chip of this.menu.querySelectorAll('[data-reward]')) {
      const state = states[chip.dataset.reward];
      if (state.ready !== chip.classList.contains('ready')) return true; // the caller redraws the title
      const time = chip.querySelector('time');
      if (time) setText(time, clock(state.nextIn));
      chip.style.setProperty('--p', rewardProgress(chip.dataset.reward, state));
    }
    return false;
  }

  /** What the gift or the kettle gave. */
  showReward(kind, { reward, error }) {
    if (error) {
      this.showModal('reward', `<h2>${kind === 'gift' ? '🎁' : '🫖'} Not yet</h2><p class="sub">${escapeHtml(error)}</p><div class="menu-buttons"><button class="menu-button primary" data-action="close-modal">OK</button></div>`);
      return;
    }
    const trinket = reward.trinket && trinketById(reward.trinket);
    const calendar =
      kind === 'gift'
        ? `<div class="streak">${STREAK_GIFTS.map(
            (gift, i) => `<span class="streak-day ${i + 1 < reward.day ? 'past' : i + 1 === reward.day ? 'today' : ''}"><small>Day ${i + 1}</small>${gift.trinket ? '🎀' : '🍃'}<b>${gift.leaves}</b></span>`
          ).join('')}</div><p class="sub">🔥 ${reward.streak}-day streak. Come back tomorrow to keep it going!</p>`
        : '<p class="sub">The kettle brews again in a few hours.</p>';
    this.showModal(
      'reward',
      `<h2>${kind === 'gift' ? `🎁 Day ${reward.day} gift!` : '🫖 The kettle whistles!'}</h2>
      <div class="reward-prize"><span class="reward-leaves">+${reward.leaves} 🍃</span>${
        trinket ? `<span class="reward-trinket"><em>${trinket.icon}</em><b>New trinket: ${trinket.name}</b><small>It's waiting in your garden</small></span>` : ''
      }</div>
      ${calendar}
      <div class="menu-buttons"><button class="menu-button primary" data-action="close-modal">Lovely!</button>${trinket ? '<button class="menu-button" data-action="garden">🏡 See it</button>' : ''}</div>`
    );
  }

  /**
   * Editing your garden (v0.29.9, like the garden bar): the tools in a slim bar along the top with Done, a hint line
   * while a trinket is held or picked, and at the bottom a low tray with the sets and your trinkets to drag onto the
   * lawn (the ones still to find only on request, `state.locked`; a tapped set chip, `gardenSetInfo`, filters it to
   * that set). `state`: { held, selected, snap, night, canUndo,
   * collapsed, locked } from the garden. Later changes go through `refreshGarden`, which keeps the trinket buttons
   * (one may be under a finger mid-drag).
   */
  showGarden(state = {}) {
    const owned = new Set(ownedTrinkets(meta));
    const button = (t) => {
      const has = owned.has(t.id);
      const picture = has ? trinketPicture(t.id) : '';
      const face = picture ? `<img src="${picture}" alt="" draggable="false">` : `<span>${has ? t.icon : '❔'}</span>`;
      return `<button type="button" class="trinket ${has ? '' : 'locked'}" ${has ? `data-trinket="${t.id}"` : ''} title="${t.name}${has ? '' : `: ${t.how}`}">
        ${face}<small>${has ? t.name : t.how}</small></button>`;
    };
    const mine = TRINKETS.filter((t) => owned.has(t.id));
    const missing = TRINKETS.filter((t) => !owned.has(t.id));
    const toggle = missing.length
      ? `<button type="button" class="trinket-toggle" data-action="garden-locked">${state.locked ? 'Hide the ones to find' : `❔ ${missing.length} to find`}</button>`
      : '';
    // A tapped set chip filters the tray to that set's trinkets, the ones still to find included (with how).
    const filter = SETS.find((set) => set.id === this.gardenSetInfo);
    const list = filter
      ? `<button type="button" class="trinket-toggle" data-action="garden-set" data-set="${filter.id}">✖ All trinkets</button>${filter.parts.map((id) => button(trinketById(id))).join('')}`
      : `${mine.map(button).join('')}${toggle}${state.locked ? missing.map(button).join('') : ''}`;
    const scrolls = this.showMenu(
      'garden-mode',
      `<div class="garden-bar">
        <div class="garden-top">
          <span class="garden-where"></span>
          <div class="garden-acts garden-tools"></div>
          <div class="garden-exit"><button type="button" class="garden-pill solo" data-action="garden-done">Done</button></div>
        </div>
        <p class="garden-status"></p>
      </div>
      <div class="garden-flash" hidden></div>
      <div class="garden-tray ${state.collapsed ? 'collapsed' : ''}">
        <div class="garden-sets"></div>
        <div class="trinkets">${list}</div>
      </div>`
    );
    this.refreshGarden(state);
    if (scrolls) restoreScroll(this.menu, scrolls); // the sets are only there now
  }

  refreshGarden({ held = null, selected = null, snap = false, night = false, canUndo = false, collapsed = false } = {}) {
    const tray = this.menuName === 'garden-mode' && this.menu.querySelector('.garden-tray');
    if (!tray) return;
    const owned = new Set(ownedTrinkets(meta));
    const placed = new Set((meta.decor ?? []).map((item) => item.id));
    for (const button of tray.querySelectorAll('[data-trinket]')) {
      const id = button.dataset.trinket;
      button.classList.toggle('placed', placed.has(id));
      button.classList.toggle('held', id === held || id === selected);
    }
    tray.classList.toggle('collapsed', collapsed);
    const decor = meta.decor ?? [];
    const sets = gardenSets(decor);
    const active = selected ?? held;
    this.menu.querySelector('.garden-where').innerHTML = `✏️ <b>Edit garden</b> <small>${owned.size}/${TRINKETS.length} · 🌷 ${gardenBeauty(decor)}</small>`;
    // The hint line: what to do with the trinket in hand, else the set whose chip was tapped, else how it works.
    const info = !active && SETS.find((set) => set.id === this.gardenSetInfo);
    const status = this.menu.querySelector('.garden-status');
    status.classList.toggle('idle', !active && !info);
    status.innerHTML = held
      ? `Drop the ${trinketById(held).name} on the lawn. Scroll or <b>R</b> turns it.`
      : active
        ? `${trinketById(active).name}: drag it to move it, <b>R</b> turns it, <b>Delete</b> puts it away.`
        : info
          ? `${info.icon} <b>${info.name}</b>: place ${info.parts
              .map((id) => `${trinketById(id).name}${placed.has(id) ? ' ✓' : owned.has(id) ? '' : ' ❔'}`)
              .join(', ')} close together for +${info.beauty} beauty.${sets.some((found) => found.set.id === info.id) ? ' Complete!' : ''}`
          : 'Drag a trinket onto the lawn. Drag the lawn to look around, scroll or pinch to zoom, right-drag or WASD to move.';
    const act = (action, icon, label, opts) => this.gardenAct(action, icon, label, opts);
    this.menu.querySelector('.garden-tools').innerHTML = [
      active ? act('turn-trinket', '↻', 'Turn (R)') : '',
      active ? act('putaway-trinket', '📦', 'Put away') : '',
      act('garden-undo', '↶', 'Undo', { disabled: !canUndo }),
      act('garden-snap', '▦', 'Grid', { on: snap }),
      act('garden-night', night ? '🌙' : '☀️', night ? 'Night' : 'Day', { on: night }),
      act('garden-reset', '🧭', 'View'),
      act('garden-plan', '🗺', 'Top'),
      act('garden-collapse', '🧺', collapsed ? 'Show tray' : 'Hide tray', { on: !collapsed }),
    ].join('');
    tray.querySelector('.garden-sets').innerHTML = SETS.map((set) => {
      const done = sets.some((found) => found.set.id === set.id);
      const parts = set.parts.map((id) => `<span class="${placed.has(id) ? 'have' : owned.has(id) ? '' : 'missing'}">${trinketById(id).icon}</span>`).join('');
      return `<button type="button" class="garden-set${done ? ' done' : ''}${set.id === this.gardenSetInfo ? ' on' : ''}" data-action="garden-set" data-set="${set.id}" style="--set:${set.color}" title="${set.name}: place ${set.parts.map((id) => trinketById(id).name).join(', ')} close together (+${set.beauty} beauty)">${set.icon} <b>${set.name}</b> ${parts}${done ? ' ✓' : ''}</button>`;
    }).join('');
  }

  /** A button in the garden bars (walking and editing): an icon with a small label (icons only on phones). */
  gardenAct(action, icon, label, { on = false, extra = '', badge = '', disabled = false } = {}) {
    return `<button type="button" class="garden-act${on ? ' on' : ''}${extra}" data-action="${action}" title="${label}" aria-label="${label}"${disabled ? ' disabled' : ''}><span class="ga-icon">${icon}</span><small>${label}</small>${badge}</button>`;
  }

  /** Leaf Rush's scores and clock (GardenGames.js) under the garden toolbar; '' hides it. Called every frame. */
  setRushBoard(html) {
    const board = this.menuName === 'garden-walk' && this.menu.querySelector('.rush-board');
    if (!board || board.dataset.html === html) return;
    board.dataset.html = html;
    board.innerHTML = html;
    board.hidden = !html;
  }

  /** A short line over the garden tray ("Tea Party complete!"). */
  gardenFlash(text) {
    const flash = ['garden-mode', 'garden-walk'].includes(this.menuName) && this.menu.querySelector('.garden-flash');
    if (!flash) return;
    flash.textContent = text;
    flash.hidden = false;
    flash.classList.remove('show');
    void flash.offsetWidth;
    flash.classList.add('show');
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => (flash.hidden = true), 2600);
  }

  /** Your public garden code. It is not the save code: it only lets people look. */
  showGardenShare(code, link) {
    this.showModal(
      'garden-share',
      code
        ? `<h2>🔗 Share your garden</h2>
          <p class="sub">Friends can visit your garden with this code. They can only look: it can't load or change your progress, and your save code stays private.</p>
          <div class="save-code">${escapeHtml(code)}</div>
          <p class="sub invite-link">or the link <b>${escapeHtml(link)}</b></p>
          <div class="menu-buttons"><button class="menu-button primary" data-action="copy-garden" data-link="${escapeHtml(link)}">📋 Copy link</button><button class="menu-button" data-action="close-modal">Close</button></div>`
        : `<h2>🔗 Share your garden</h2><p class="sub">Sharing needs the online save, and the server can't be reached right now.</p>
          <div class="menu-buttons"><button class="menu-button" data-action="close-modal">Close</button></div>`
    );
  }

  /**
   * Hopping around a garden (GardenHub.js), v0.29.9: one slim bar along the top, so the garden stays in view. The
   * garden and who's here on the left; emotes, the wardrobe, boop (phones have 🥊 instead), Leaf Rush, the party
   * buttons and ⋯ More in the middle; Solo run and Leave on the right. One sheet at a time opens under it: the
   * emotes, the wardrobe or More (editing, sharing, visiting, day or night, the song, the controls). `info`: { own,
   * owner, frogs, online, offline, inviting, partyCount, readyCount, countdown, leaderName, ready, night, song,
   * touch, rush, public, emotes, lockedEmotes, more, wardrobe, newWear }.
   */
  showGardenWalk(info) {
    const act = (action, icon, label, opts) => this.gardenAct(action, icon, label, opts);
    const party = info.leaderName
      ? act('garden-ready', '✋', info.ready ? 'Ready ✓' : 'Ready', { on: info.ready, extra: ' ready' })
      : act('garden-invite', info.inviting ? '✖' : '🚩', info.inviting ? 'Stop inviting' : 'Invite', { on: info.inviting, extra: info.inviting ? '' : ' invite' });
    const actions = [
      act('garden-emotes', '😀', 'Emotes', { on: Boolean(info.emotes) }),
      act('garden-wardrobe', '👕', 'Wardrobe', { on: Boolean(info.wardrobe), badge: info.newWear ? `<em class="ga-badge">${info.newWear}</em>` : '' }),
      info.touch ? '' : act('garden-boop', '👉', 'Boop'),
      act('garden-rush', '🍃', info.rush ? 'Rush on!' : 'Leaf Rush', { on: info.rush }),
      party,
      info.inviting && info.readyCount ? act('garden-go', '▶', `Go now (${info.readyCount + 1})`, { extra: ' ready' }) : '',
      act('garden-more', '⋯', 'More', { on: info.more }),
    ].join('');
    const status = info.inviting
      ? `🚩 Your circle is open: frogs who hop in join your party (${info.partyCount + 1}/4). When they're all ✋ ready, off you go!`
      : info.leaderName
        ? info.ready
          ? `✋ Ready! Waiting for ${escapeHtml(info.leaderName)}'s party to set off…`
          : `You're in ${escapeHtml(info.leaderName)}'s party. Press ✋ Ready to play together.`
        : '';
    const where = info.own ? 'Your garden' : `${escapeHtml(info.owner ?? 'A frog')}'s garden`;
    const who = info.online ? `🐸 ${info.frogs}` : info.offline ? 'offline' : 'connecting…';
    const sheet = info.emotes ? this.emoteSheet(info) : info.wardrobe ? this.wardrobePanel(info.wardrobe) : info.more ? this.gardenMore(info) : '';
    this.showMenu(
      'garden-walk',
      `<div class="garden-bar">
        <div class="garden-top">
          <span class="garden-where" title="${where}">🏡 <b>${where}</b> <small>${who}</small></span>
          <div class="garden-acts">${actions}</div>
          <div class="garden-exit">
            <button type="button" class="garden-pill solo" data-action="start" title="Leave the garden and start a solo run">Solo run</button>
            <button type="button" class="garden-pill" data-action="garden-leave">Leave</button>
          </div>
        </div>
        ${status ? `<p class="garden-status">${status}</p>` : ''}
        ${sheet ? `<div class="garden-sheet">${sheet}</div>` : ''}
      </div>
      <div class="garden-flash" hidden></div>
      <div class="rush-board" hidden></div>
      ${info.countdown ? `<div class="garden-countdown">${info.countdown}</div>` : ''}`
    );
  }

  /** The emote sheet: big buttons for the unlocked emotes (with their 1–9 key), the locked ones only on request. */
  emoteSheet({ emotes, lockedEmotes, touch }) {
    const open = emotes.filter((emote) => !emote.locked);
    const locked = emotes.filter((emote) => emote.locked);
    const key = (emote) => (!touch && emote.key > 0 && emote.key <= 9 ? emote.key : 0);
    const buttons = open
      .map(
        (emote) =>
          `<button type="button" class="emote" data-action="emote" data-id="${emote.id}" title="${emote.name}${key(emote) ? ` (${key(emote)})` : ''}"><span>${emote.icon}</span><small>${emote.name}</small>${key(emote) ? `<kbd>${key(emote)}</kbd>` : ''}</button>`
      )
      .join('');
    const lockedGrid = lockedEmotes
      ? `<div class="emote-grid locked-grid">${locked
          .map(
            (emote) =>
              `<button type="button" class="emote locked" disabled title="${emote.name} · unlock: ${escapeHtml(emote.hint ?? '')}"><span>🔒</span><small>${emote.name}</small><small class="wear-hint">${escapeHtml(emote.hint ?? '')}</small></button>`
          )
          .join('')}</div>`
      : '';
    return `<div class="emote-grid emote-sheet">${buttons}</div>
      ${locked.length ? `<button type="button" class="link-button" data-action="emotes-locked">${lockedEmotes ? 'Hide the locked emotes' : `🔒 ${locked.length} more to unlock`}</button>` : ''}
      ${lockedGrid}`;
  }

  /** ⋯ More in the garden bar: the garden's own settings and places to go, and the controls. */
  gardenMore(info) {
    const tool = (action, label, extra = '') => `<button type="button" class="garden-tool ${extra}" data-action="${action}">${label}</button>`;
    const help = info.touch
      ? 'Left stick to hop, 🦘 to jump (you can land on other frogs!), 🥊 to boop a frog or a trinket (or skip a stone at the pond), drag the right side to look around.'
      : 'WASD to hop, Space to jump (onto frogs, the roof, the trampoline…), right-click or B to boop frogs and trinkets (or skip a stone at the pond), 1–9 to emote, L for a Leaf Rush, F to invite, N for day or night.';
    return `<div class="garden-tools more-tools">${[
      info.own ? tool('garden-edit', '✏️ Edit garden') : '',
      info.own && info.online ? tool('garden-public', info.public ? '🌍 Public garden' : '🔒 Private garden', info.public ? 'on' : '') : '',
      info.own ? tool('garden-share', '🔗 Share') : tool('garden', '🏡 My garden'),
      tool('garden-visit', '👀 Visit a garden'),
      tool('garden-night', info.night ? '🌙 Night' : '☀️ Day'),
      tool('garden-music', `${info.song?.icon ?? '🎵'} ${info.song?.name ?? 'Song'}`),
    ].join('')}</div>
      <p class="sub garden-help">${help}</p>`;
  }

  /**
   * The wardrobe in the garden bar (Wearables.js): a tab per slot (with what's worn there), then that slot's items.
   * Locked ones say how they unlock. `wardrobe`: { slot, slots, items, unlocked, total } from main.js.
   */
  wardrobePanel({ slot, slots, items, unlocked, total }) {
    const tabs = slots
      .map((s) => `<button type="button" class="wardrobe-tab${s.id === slot ? ' on' : ''}" data-action="wardrobe-slot" data-slot="${s.id}">${s.icon} ${s.name}${s.worn ? ` <span class="worn-icon">${s.worn}</span>` : ''}</button>`)
      .join('');
    const grid = items
      .map((item) => {
        const title = item.locked ? `${item.name} · ${item.hint}` : item.worn ? `${item.name} (worn: click to take it off)` : item.name;
        return `<button type="button" class="emote wear${item.worn ? ' worn' : ''}${item.locked ? ' locked' : ''}" ${item.locked ? 'disabled' : `data-action="wear" data-id="${item.id}"`} title="${escapeHtml(title)}">
          <span>${item.locked ? '🔒' : item.icon}</span><small>${escapeHtml(item.name)}</small>${item.locked ? `<small class="wear-hint">${escapeHtml(item.hint)}</small>` : ''}</button>`;
      })
      .join('');
    return `<div class="wardrobe">
      <div class="wardrobe-tabs">${tabs}</div>
      <div class="emote-grid wardrobe-grid">${grid}</div>
      <p class="sub wardrobe-note">${unlocked}/${total} unlocked. Everyone in the garden sees what you wear. Click a worn item to take it off.</p>
    </div>`;
  }

  /** Public gardens as rows to join: [{ garden, name, frogs, max, beauty }]. */
  gardenRows(gardens) {
    if (!gardens) return '<p class="sub room-empty">Looking for gardens…</p>';
    if (!gardens.length) return '<p class="sub room-empty">No public gardens yet. Make yours public in 🏡 My garden!</p>';
    return gardens
      .map(
        (g) => `<div class="room-row"><span class="room-host">🏡 ${escapeHtml(g.name)}'s garden</span><span class="room-seats"><small>${g.frogs ? `🐸 ${g.frogs}` : 'empty'}${g.beauty ? ` · 🌷 ${g.beauty}` : ''}</small></span><button class="menu-button" type="button" data-action="visit-garden" data-code="${escapeHtml(g.garden)}">Join</button></div>`
      )
      .join('');
  }

  /** Refreshes only the public gardens list in the co-op lobby. */
  setLobbyGardens(gardens) {
    const list = this.menuName === 'lobby' && this.menu.querySelector('.garden-list');
    if (list) list.innerHTML = this.gardenRows(gardens);
  }

  /** Refreshes only the public gardens list in the visit popup (a typed code survives). */
  setVisitGardens(gardens) {
    const list = this.modalOpen && this.modal.classList.contains('garden-visit') && this.modal.querySelector('.lively-gardens');
    if (list) list.innerHTML = gardens ? this.gardenRows(gardens) : `<p class="sub room-empty">Public gardens can't be reached right now.</p>`;
  }

  /** Asks for a garden code to visit; `gardens`: the public gardens, liveliest first. */
  /** The garden songs (Rewards.js GARDEN_SONGS): pick yours, or (`owner`) see what plays in someone's garden. */
  showGardenSongs({ owner, songs }) {
    const rows = songs
      .map((song) => {
        // (a visitor sees what's playing, not their own locks)
        const state = song.playing ? '<b class="song-state">▶ Playing</b>' : song.locked && !owner ? `<small class="song-state">🔒 ${escapeHtml(song.hint)}</small>` : '';
        const disabled = owner || song.locked || song.playing ? 'disabled' : '';
        return `<button type="button" class="song-row${song.playing ? ' playing' : ''}${song.locked && !owner ? ' locked' : ''}" data-action="garden-song" data-song="${song.id}" ${disabled}>
          <span class="song-icon">${song.icon}</span><span class="song-name">${escapeHtml(song.name)}</span>${state}</button>`;
      })
      .join('');
    this.showModal(
      'garden-songs',
      `<h2>🎵 Garden music</h2>
      <p class="sub">${owner ? `${escapeHtml(owner)} chose the song in this garden.` : 'Everyone in your garden hears the song you pick. More unlock as you level up.'}</p>
      <div class="song-list">${rows}</div>
      <div class="menu-buttons"><button class="menu-button primary" data-action="close-modal">Close</button></div>`
    );
  }

  showGardenVisitForm(error = null, gardens = null) {
    const lively = `<h3>🌍 Public gardens</h3><div class="lively-gardens">${this.gardenRows(gardens)}</div>`;
    this.showModal(
      'garden-visit',
      `<h2>👀 Visit a garden</h2>
      ${lively}
      <p class="sub">Or enter the garden code a friend shared (6 letters and numbers).</p>
      ${error ? `<p class="lobby-error">${escapeHtml(error)}</p>` : ''}
      <form class="lobby-form" data-form="garden">
        <input id="garden-code" maxlength="8" placeholder="TJ4K9P" autocomplete="off" />
        <button class="menu-button primary" type="button" data-action="visit-go">Visit</button>
      </form>
      <div class="menu-buttons"><button class="menu-button" data-action="close-modal">Close</button></div>`
    );
    this.modal.querySelector('#garden-code')?.focus();
  }

  /**
   * The player tag: the name others see (gardens, co-op, leaderboard), its #tag and colour. `first`: asked before
   * the first multiplayer step.
   */
  showProfile({ name = '', tag = null, color = null, error = null, first = false }) {
    this.tagColor = color ?? TAG_COLORS[0];
    const swatches = TAG_COLORS.map(
      (c) => `<button type="button" class="tag-swatch ${c === this.tagColor ? 'on' : ''}" style="--swatch:${c}" data-action="tag-color" data-color="${c}" aria-label="Colour ${c}"></button>`
    ).join('');
    this.showModal(
      'profile',
      `<h2>🏷 ${first ? 'Pick your name first' : 'Your player tag'}</h2>
      <p class="sub">${first ? 'Other frogs will see it above your frog, in co-op and on the leaderboard.' : 'How other frogs see you: in gardens, in co-op and on the leaderboard.'}</p>
      <div class="tag-preview" style="--tag:${this.tagColor}"><span class="tag-frog">🐸</span><span class="tag-name">${escapeHtml(name || '…')}</span>${tag ? `<small>#${escapeHtml(tag)}</small>` : ''}</div>
      <form class="lobby-form" data-form="profile">
        <input id="profile-name" maxlength="${NAME_MAX}" placeholder="Your name" value="${escapeHtml(name)}" autocomplete="nickname" />
        <button class="menu-button" type="button" data-action="random-name" title="A random name">🎲</button>
      </form>
      <div class="tag-colors">${swatches}</div>
      <p class="lobby-error profile-error" ${error ? '' : 'hidden'}>${escapeHtml(error ?? '')}</p>
      <p class="sub small">${tag ? `Your #${escapeHtml(tag)} tells you apart from frogs with the same name. ` : ''}Be kind: rude names aren't allowed.</p>
      <div class="menu-buttons"><button class="menu-button primary" data-action="save-profile">${first ? 'Continue' : 'Save'}</button><button class="menu-button" data-action="close-modal">Cancel</button></div>`
    );
    this.modal.querySelector('#profile-name')?.focus();
  }

  setTagColor(color) {
    this.tagColor = color;
    for (const swatch of this.modal.querySelectorAll('.tag-swatch')) swatch.classList.toggle('on', swatch.dataset.color === color);
    this.modal.querySelector('.tag-preview')?.style.setProperty('--tag', color);
  }

  setProfileName(name) {
    const input = this.modal.querySelector('#profile-name');
    if (input) input.value = name;
    const preview = this.modal.querySelector('.tag-name');
    if (preview) preview.textContent = name;
  }

  setProfileError(error) {
    const line = this.modal.querySelector('.profile-error');
    if (!line) return;
    line.textContent = error ?? '';
    line.hidden = !error;
  }

  /** "Playing as Alice#4821 ✏️": a button that opens the player tag popup. */
  tagChip() {
    const profile = meta.profile ?? {};
    return profile.name
      ? `<button type="button" class="tag-chip" data-action="edit-name" style="--tag:${profile.color ?? '#c8f77a'}"><small>Playing as</small> <b>${escapeHtml(profile.name)}</b>${profile.tag ? `<small>#${escapeHtml(profile.tag)}</small>` : ''} ✏️</button>`
      : '<button type="button" class="tag-chip" data-action="edit-name">🏷 Pick a name</button>';
  }

  /** Today's Daily Brew: the frog of the day and the day's twists, with a button to start. */
  showDaily(day) {
    const frog = classOfTheDay(todayKey());
    const row = (twist, kind) =>
      `<div class="twist twist-${kind}"><span class="twist-icon">${twist.icon}</span><span><b>${twist.name}</b><small>${twist.text}</small></span>${
        kind === 'trial' ? `<em>×${twist.reward}</em>` : twist.leaves ? `<em>🍃×${twist.leaves}</em>` : ''
      }</div>`;
    const leaves = Math.round(day.leaves * 100) / 100;
    this.showModal(
      'daily',
      `<h2>📅 Daily Brew · ${day.title}</h2>
      <p class="sub">The same waves, weather and offers for everyone today. Played by ${frog.icon} <b>${frog.name}</b>.</p>
      <h3>⚔️ Today's trial${day.trials.length > 1 ? 's' : ''}</h3>
      ${day.trials.map((id) => row(TRIALS[id], 'trial')).join('')}
      <h3>🎁 Today's boon${day.boons.length > 1 ? 's' : ''}</h3>
      ${day.boons.map((id) => row(BOONS[id], 'boon')).join('')}
      <p class="daily-reward">Score ×${Math.round(day.score * 100) / 100} · Golden Leaves ×${leaves}</p>
      <p class="sub">New twists every day at midnight (UTC). Saturdays are Feast Days, Sundays Trial Days.</p>
      <div class="menu-buttons">
        <button class="menu-button primary" data-action="daily-go">▶ Brew it</button>
        <button class="menu-button" data-action="close-modal">Not today</button>
      </div>`
    );
  }

  /** The small save code button on the title screen and in the Pantry; it opens the save popup. */
  saveChip() {
    const label = { online: escapeHtml(cloud.code ?? ''), connecting: 'Connecting…', offline: 'Offline' }[cloud.status];
    return `<button type="button" class="save-chip" data-action="save" title="Your save code: load your progress on another device">☁️ ${label}</button>`;
  }

  /**
   * Settings (⚙️ on the title and in the pause menu). `autoSpit` is null on touch screens, where Tode always spits
   * by himself; `inRun` (the pause menu) leaves out Gentle Brew, which only applies from the next run.
   */
  showSettings({ sound, graphics, calmFx, showFps, autoSpit, inRun = false }) {
    const text = (label, note) => `<span class="setting-text"><b>${label}</b>${note ? `<small>${note}</small>` : ''}</span>`;
    const toggle = (action, on, label, note = '') =>
      `<div class="setting">${text(label, note)}<button type="button" class="switch${on ? ' on' : ''}" role="switch" aria-checked="${on}" aria-label="${label}" data-action="${action}"><i></i></button></div>`;
    // A choice of a few: the chosen one has no action, the others switch to themselves.
    const choice = (label, note, options) =>
      `<div class="setting">${text(label, note)}<span class="segmented">${options
        .map(([title, on, action]) => `<button type="button"${on ? ' class="on" aria-pressed="true"' : ` aria-pressed="false" ${action}`}>${title}</button>`)
        .join('')}</span></div>`;
    const fullscreen = canFullscreen()
      ? toggle('toggle-fullscreen', isFullscreen(), '⛶ Fullscreen')
      : needsHomeScreen()
        ? `<div class="setting">${text('⛶ Fullscreen', 'Add Todeity to your Home Screen')}<button type="button" class="menu-button" data-action="fullscreen-help">How?</button></div>`
        : '';
    this.showModal(
      'settings',
      `<h2>⚙️ Settings</h2>
      ${inRun && autoSpit === null ? '' : '<h3>Playing</h3>'}
      ${inRun ? '' : toggle('toggle-gentle', meta.gentle, '🌿 Gentle Brew', `${GENTLE_TEXT} Solo runs only.`)}
      ${autoSpit === null ? '' : choice('💧 Spit', 'By himself, or while you hold the left mouse button', [['Auto', autoSpit, 'data-action="toggle-autospit"'], ['Hold', !autoSpit, 'data-action="toggle-autospit"']])}
      <h3>Sound</h3>
      ${toggle('toggle-music', sound.music, '🎵 Music')}
      ${toggle('toggle-sfx', sound.sfx, '🔊 Sound effects')}
      <h3>Screen</h3>
      ${choice('🖥 Graphics', 'Low runs smoothly on older phones', GRAPHICS.map((id) => [GRAPHICS_LABELS[id], graphics === id, `data-action="set-graphics" data-graphics="${id}"`]))}
      ${fullscreen}
      ${choice('✨ Effects', 'Calm: softer screen effects, no spit trails', [['Full', !calmFx, 'data-action="toggle-calm"'], ['Calm', calmFx, 'data-action="toggle-calm"']])}
      ${toggle('toggle-fps', showFps, '📈 FPS counter')}
      <div class="menu-buttons split-end"><button type="button" class="link-button" data-action="changelog">📜 What's new in v${VERSION}</button><button class="menu-button primary" data-action="close-modal">Done</button></div>`
    );
  }

  /** The player profile (the title's level card): name and tag, level, records, and the progress code. */
  showPlayer(best) {
    const { level, rank, progress } = accountLevel(meta);
    const profile = meta.profile ?? {};
    const achieved = ACHIEVEMENTS.filter((a) => isUnlocked(a.id)).length;
    const stats = [
      [meta.runs, `run${meta.runs === 1 ? '' : 's'}`],
      [`Wave ${meta.bestWave}`, 'deepest run'],
      best ? [best.toLocaleString(), 'best score'] : null,
      [`${achieved}/${ACHIEVEMENTS.length}`, 'achievements'],
      meta.victories ? [meta.victories, `victor${meta.victories > 1 ? 'ies' : 'y'}`] : null,
      meta.decor?.length ? [gardenBeauty(meta.decor), 'garden beauty'] : null,
    ].filter(Boolean);
    const streak = meta.streak?.count > 1 ? ` · 🔥 ${meta.streak.count}-day streak` : '';
    const name = profile.name
      ? `<b class="player-name" style="color:${profile.color ?? '#c8f77a'}">${escapeHtml(profile.name)}</b>${profile.tag ? `<small>#${escapeHtml(profile.tag)}</small>` : ''}`
      : '<b class="player-name">No name yet</b>';
    const code =
      cloud.status === 'online'
        ? `<div class="player-code"><span class="save-code">${escapeHtml(cloud.code)}</span><button class="menu-button" data-action="copy-save">📋 Copy</button></div>
          <p class="sub save-status"></p>`
        : `<p class="sub">${cloud.status === 'connecting' ? 'Connecting to your cloud save…' : "Can't reach the server: progress is saved in this browser only for now."}</p>`;
    this.showModal(
      'player',
      `<div class="player-head">
        <span class="profile-level"><b>${level}</b><small>LV</small></span>
        <div class="player-info">
          <div class="player-title">${name}<button type="button" class="menu-button" data-action="edit-name">${profile.name ? '✏️ Edit name' : '🏷 Pick a name'}</button></div>
          <span class="player-rank">${rank}${streak}</span>
          <span class="profile-bar"><i style="width:${Math.round(progress * 100)}%"></i></span>
          <small>${Math.round(progress * 100)}% of the way to level ${level + 1}</small>
        </div>
      </div>
      <div class="player-stats">${stats.map(([value, label]) => `<div><b>${value}</b><small>${label}</small></div>`).join('')}</div>
      <h3>☁️ Your progress code</h3>
      <p class="sub">Golden Leaves, Pantry, achievements and your garden are saved online under this code. Enter it on another device to play there.</p>
      ${code}
      <div class="menu-buttons split-end"><button type="button" class="link-button" data-action="save">Use a code from another device</button><button class="menu-button primary" data-action="close-modal">Close</button></div>`
    );
  }

  /** Cloud save popup: this browser's code, and a field to continue another save. `message` / `error`: a result. */
  showSave({ message, error } = {}) {
    const note = error
      ? `<p class="lobby-error">${escapeHtml(error)}</p>`
      : message
        ? `<p class="sub save-ok">${escapeHtml(message)}</p>`
        : '';
    const current =
      cloud.status === 'online'
        ? `<p class="sub">Your progress (Golden Leaves, Pantry, achievements) is saved online under this code:</p>
          <div class="save-code">${escapeHtml(cloud.code)}</div>
          <div class="menu-buttons"><button class="menu-button" data-action="copy-save">📋 Copy code</button></div>
          <p class="sub save-status"></p>`
        : `<p class="sub">${cloud.status === 'connecting' ? 'Connecting to your cloud save…' : "Can't reach the server: progress is saved in this browser only for now."}</p>`;
    this.showModal(
      'save',
      `<h2>☁️ Your progress</h2>
      ${current}
      <h3>Played before?</h3>
      <p class="sub">Enter your save code to continue where you left off.</p>
      ${note}
      <form class="lobby-form" data-form="save">
        <input id="save-code" maxlength="24" placeholder="MINT-FROG-42" autocomplete="off" />
        <button class="menu-button primary" type="submit">Load progress</button>
      </form>
      <div class="menu-buttons"><button class="menu-button" data-action="close-modal">Close</button></div>`
    );
  }

  setSaveStatus(text) {
    const status = this.modal.querySelector('.save-status');
    if (status) status.textContent = text;
  }

  /** A class's portrait (its frog, rendered once), or its icon where no portrait could be made. */
  classFace(frogClass) {
    const portrait = classPortrait(frogClass.id);
    return portrait ? `<img class="class-face" src="${portrait}" alt="">` : `<span class="class-face">${frogClass.icon}</span>`;
  }

  /** Pick the frog that plays: every class is open. */
  showClasses() {
    const current = chosenClass();
    const daily = classOfTheDay(todayKey());
    const cards = CLASSES.map(
      (frogClass) => `
        <button class="class-card ${frogClass === current ? 'chosen' : ''}" data-action="class" data-id="${frogClass.id}" title="${escapeHtml(frogClass.text)}">
          ${this.classFace(frogClass)}
          <span class="class-text">
            <b>${frogClass.icon} ${frogClass.name}</b>
            <small class="class-title">${frogClass.title} · ${'♥'.repeat(frogClass.hearts)}</small>
            <small>${frogClass.short}</small>
          </span>
          ${frogClass === current ? '<span class="keepsake-tag">Playing</span>' : ''}
        </button>`
    ).join('');
    this.showMenu(
      'classes',
      `
      <div class="panel">
        <h2>🐸 Choose your frog</h2>
        <p class="sub">Every frog plays differently. Today's Daily Brew: ${daily.icon} <b>${daily.name}</b>.</p>
        <div class="class-list">${cards}</div>
        <div class="menu-buttons"><button class="menu-button primary" data-action="title">Done</button></div>
      </div>`
    );
  }

  /** Pick the keepsake Tode carries into his runs; locked ones say how to unlock them. */
  showKeepsakes() {
    const current = currentKeepsake();
    const items = KEEPSAKES.map((keepsake) => {
      const open = isKeepsakeUnlocked(keepsake);
      const chosen = keepsake === current;
      return `
        <button class="keepsake ${open ? '' : 'locked'} ${chosen ? 'chosen' : ''}" ${open ? `data-action="keepsake" data-id="${keepsake.id}"` : 'disabled'}>
          <span class="keepsake-icon">${open ? keepsake.icon : '🔒'}</span>
          <span class="keepsake-text"><b>${open ? keepsake.name : '???'}</b><small>${open ? keepsake.text : `Unlock: ${unlockHint(keepsake)}`}</small></span>
          ${chosen ? '<span class="keepsake-tag">Carried</span>' : ''}
        </button>`;
    }).join('');
    const count = KEEPSAKES.filter(isKeepsakeUnlocked).length;
    this.showMenu(
      'keepsakes',
      `
      <div class="panel">
        <h2>🎒 Keepsakes</h2>
        <p class="sub">Tode carries one keepsake into every run. Achievements unlock new ones (${count}/${KEEPSAKES.length}).</p>
        <div class="keepsake-list">${items}</div>
        <div class="menu-buttons"><button class="menu-button" data-action="title">Back</button></div>
      </div>`
    );
  }

  /** Steeping: vows that make runs harder for more score and Golden Leaves. */
  /** `back`: 'title', or 'room' when the co-op host steeps the run about to start. */
  showSteeping(back = this.steepingBack ?? 'title') {
    this.steepingBack = back;
    const steep = steepLevel();
    const rows = VOWS.map((vow) => {
      const rank = vowRank(vow.id);
      const pips = Array.from({ length: vow.ranks }, (_, i) => `<i class="${i < rank ? 'on' : ''}"></i>`).join('');
      return `
        <button class="vow ${rank ? 'active' : ''}" data-action="vow" data-id="${vow.id}">
          <span class="vow-icon">${vow.icon}</span>
          <span class="vow-text"><b>${vow.name}</b><small>${vow.text(Math.max(1, rank))}</small><span class="pips">${pips}</span></span>
          <span class="vow-heat">🔥${vow.heat}</span>
        </button>`;
    }).join('');
    this.showMenu(
      'steeping',
      `
      <div class="panel">
        <h2>🔥 Steeping</h2>
        <p class="sub">Take vows to steep your runs stronger. Every 🔥 adds 12% to your score and Golden Leaves.
        ${back === 'room' ? 'These vows count for everyone in your co-op room.' : 'In co-op the host\'s vows count for everyone; the Daily Brew is never steeped.'}</p>
        <p class="steep-total">Steep <b>${steep}</b> / ${STEEP_MAX} · score and leaves ×${steepBonus(steep).toFixed(2)}</p>
        <div class="vows">${rows}</div>
        <div class="menu-buttons">
          <button class="menu-button" data-action="vows-clear">Clear vows</button>
          <button class="menu-button primary" data-action="${back === 'room' ? 'coop-room' : 'title'}">Done</button>
        </div>
      </div>`
    );
  }

  card({ action, index, brew, rarity, level, text, kind: kindOverride, hint }) {
    const blends = brew.blends ?? (brew.blend ? [brew.blend] : []);
    const colors = blends.map((id) => BLENDS[id].color);
    const first = colors[0] ?? '#ffc93c';
    const second = colors[1] ?? first;
    const kind = kindOverride ?? brew.kind ?? 'ultimate';
    const tag =
      { duo: 'Duo', legendary: 'Legendary', ultimate: 'Ultimate', skill: 'Skill', fusion: 'Fusion' }[kind] ?? RARITIES[rarity].name;
    const rarityClass = kind === 'brew' ? `rarity-${RARITIES[rarity].id}` : `kind-${kind}`;
    const label = brew.blends
      ? blends.map(blendLabel).join(' × ')
      : brew.blend
        ? blendLabel(brew.blend)
        : kind === 'skill'
          ? '🌀 Skill'
          : kind === 'fusion'
            ? '🔗 Skill Fusion'
            : '✨ Ultimate';
    return `
      <button class="card ${rarityClass}" data-action="${action}" data-index="${index}" style="--blend:${first};--blend2:${second}">
        <span class="card-key">${index + 1}</span>
        <span class="card-blend">${label}</span>
        <span class="card-icon">${brew.icon}</span>
        <span class="card-name">${brew.name}</span>
        <span class="card-tags"><span class="tag tag-rarity">${tag}</span>${
          level && kind !== 'fusion' ? `<span class="tag">${level === 1 ? 'New' : `Level ${level}`}</span>` : ''
        }</span>
        <span class="card-description">${text}</span>${hint ? `<span class="card-hint">${hint}</span>` : ''}
      </button>`;
  }

  /** Spirit portraits with their lines, typed out like a conversation. */
  dialogue(lines) {
    this.voices = Object.fromEntries(lines.map(({ spirit }) => [spirit.name, spirit.voice]));
    return `<div class="dialogue">${lines
      .map(
        ({ spirit, line }, i) => `
        <div class="speech" style="--spirit:${spirit.color};animation-delay:${i * 0.9}s">
          <span class="portrait">${spirit.portrait}</span>
          <span class="speech-text"><b>${spirit.name}</b> <small>${spirit.title}</small><span class="line" data-line="${line.replace(/"/g, '&quot;')}" data-delay="${i * 0.9}" data-voice="${spirit.name}"></span></span>
        </div>`
      )
      .join('')}</div>`;
  }

  typeDialogue() {
    clearInterval(this.typing);
    const lines = [...this.menu.querySelectorAll('.line')];
    for (const node of lines) this.onSpeak(this.voices?.[node.dataset.voice], node.dataset.line, Number(node.dataset.delay));
    const started = performance.now();
    this.typing = setInterval(() => {
      let done = true;
      for (const node of lines) {
        const elapsed = (performance.now() - started) / 1000 - Number(node.dataset.delay);
        const text = node.dataset.line;
        const shown = Math.max(0, Math.min(text.length, Math.floor(elapsed * 45)));
        node.textContent = text.slice(0, shown);
        if (shown < text.length) done = false;
      }
      if (done) clearInterval(this.typing);
    }, 30);
  }

  /** `memory`: what the spirits remember (see Spirits.js); `bonus`: the Bitter Shrine's extra Epic pick. */
  showBrews(wave, offers, rerolls, memory = {}, bonus = false) {
    const cards = offers
      .map((offer, index) => this.card({ action: 'brew', index, ...offer, text: describe(offer) }))
      .join('');
    const reroll = rerolls > 0 && !bonus ? `<button class="menu-button" data-action="reroll">🔄 Reroll (${rerolls})</button>` : '';
    const title = bonus ? '⛰️ The Bitter Shrine rewards you' : `Wave ${wave} cleared!`;
    const note = bonus ? '<p class="sub">You survived the enraged hive: a bonus Epic pick</p>' : '';
    this.showMenu(
      'powerups',
      `<h2>${title}</h2>${note}${this.dialogue(brewDialogue(offers, memory))}<div class="cards">${cards}</div><div class="menu-buttons">${reroll}</div>`
    );
    this.typeDialogue();
  }

  showUltimates() {
    const cards = Object.values(ULTIMATES)
      .map((ultimate, index) => this.card({ action: 'ultimate', index, brew: ultimate, text: ultimate.text }))
      .join('');
    this.showMenu(
      'powerups ultimates',
      `<h2>Awaken your ultimate</h2>${this.dialogue(kettleDialogue('ultimate'))}<p class="sub">Charged by battle · unleash it with <b>E</b></p><div class="cards">${cards}</div>`
    );
    this.typeDialogue();
  }

  /** `level`: shown as a level-up (the skill pick that every level brings). */
  /**
   * The boss chest: a reel spins through icons and lands on how many rewards are inside, then they pop out one by
   * one. `sound(name)` plays the ticks and fanfares; `onReady` runs when Collect can be pressed.
   */
  showChest({ count, rewards, reel, sound, onReady }) {
    this.showMenu(
      'chest',
      `<h1>🎁 Royal Tea Chest</h1>
      <p class="sub">The boss left something behind…</p>
      <div class="chest-reel"><span class="chest-icon">🎁</span></div>
      <p class="chest-count" hidden></p>
      <div class="chest-rewards"></div>
      <div class="menu-buttons"><button class="menu-button primary" data-action="chest-collect" disabled>✨ Collect</button></div>
      <p class="prompt">Space</p>`
    );
    const token = (this.chestToken = {});
    const alive = () => this.chestToken === token && this.menuName === 'chest';
    const icon = this.menu.querySelector('.chest-icon');
    const later = (ms, fn) => setTimeout(() => alive() && fn(), ms);
    // The reel slows down: 18 ticks from 45 ms to about 250 ms apart.
    let at = 250;
    for (let i = 0; i < 18; i++) {
      at += 45 + i * i * 0.65;
      later(at, () => {
        icon.textContent = reel[Math.floor(Math.random() * reel.length)];
        icon.classList.remove('tick');
        void icon.offsetWidth;
        icon.classList.add('tick');
        sound('tick');
      });
    }
    later(at + 320, () => {
      icon.textContent = count >= 5 ? '🌟' : count >= 3 ? '✨' : '🍵';
      const label = this.menu.querySelector('.chest-count');
      label.hidden = false;
      label.className = `chest-count count-${count}`;
      label.textContent = count >= 5 ? '×5 · Jackpot!' : count >= 3 ? '×3 · Lucky!' : '×1';
      sound(count >= 3 ? 'legendary' : 'pick');
    });
    const list = this.menu.querySelector('.chest-rewards');
    rewards.forEach((reward, i) =>
      later(at + 700 + i * 280, () => {
        const card = document.createElement('div');
        card.className = 'chest-reward';
        card.style.setProperty('--blend', reward.color);
        card.innerHTML = `<span class="chest-reward-icon">${reward.icon}</span><b>${escapeHtml(reward.name)}</b><small>${escapeHtml(reward.detail)}</small>`;
        list.append(card);
        sound('pick');
      })
    );
    later(at + 700 + rewards.length * 280, () => {
      this.menu.querySelector('[data-action="chest-collect"]').disabled = false;
      onReady();
    });
  }

  showSkills(offers, level = 0) {
    const cards = offers
      .map(({ skill, level, fusion, hint }, index) =>
        this.card({ action: 'skill', index, brew: skill, level, text: skill.text(level), kind: fusion ? 'fusion' : 'skill', hint })
      )
      .join('');
    const how = offers.some((offer) => offer.fusion)
      ? '✨ Two of your skills are strong enough to fuse!'
      : 'Skills cast themselves when the moment is right';
    this.showMenu(
      'powerups skills',
      `<h2>${level ? `Level ${level}! ` : ''}Learn a skill</h2>${this.dialogue(kettleDialogue('skill'))}<p class="sub">${how}</p><div class="cards">${cards}</div>`
    );
    this.typeDialogue();
  }

  /**
   * The pause menu (v0.29.9, like the title): the run at the top left with What's new and ⚙️ Settings across from it,
   * a big Resume in the middle with Restart and Quit under it, then the build in its own scrolling box (so a big
   * build never pushes Resume out of reach). The settings live in the same popup as on the title.
   */
  showPause({ build, ultimate, form, coop, keepsake, steep, frogClass, wave }) {
    const brews = build.length
      ? build
          .map(
            ({ icon, name, level, color, text }) =>
              `<div class="build-item" style="--blend:${color}"><span>${icon}</span><span><b>${name}${level > 1 ? ` · Lv ${level}` : ''}</b><small>${text}</small></span></div>`
          )
          .join('')
      : '<p class="sub">No brews yet. Clear a wave to choose one.</p>';
    const ult = ultimate ? `<p class="sub">Ultimate: ${ULTIMATES[ultimate].icon} <b>${ULTIMATES[ultimate].name}</b></p>` : '';
    const details = [`Wave ${wave}`, keepsake ? `${keepsake.icon} ${keepsake.name}` : '', steep ? `🔥 Steep ${steep}` : ''].filter(Boolean).join(' · ');
    this.showMenu(
      `pause${coop ? ' coop' : ''}`,
      `
      <div class="title-top">
        <div class="run-card">${frogClass ? this.classFace(frogClass) : ''}<span><b>${[frogClass?.name, form].filter(Boolean).join(' · ')}</b><small>${details}</small></span></div>
        <div class="title-corner">
          <button type="button" class="title-pill" data-action="changelog">📜 v${VERSION}<span class="long"> · What's new</span></button>
          <button type="button" class="title-round" data-action="settings" title="Settings" aria-label="Settings">⚙️</button>
        </div>
      </div>
      <div class="pause-main">
        <h2>${coop ? 'Menu' : 'Paused'}</h2>
        ${coop ? '<p class="sub">The run keeps going for your teammates while this menu is open.</p>' : ''}
        <button class="start-button" data-action="resume">Resume</button>
        <div class="pause-actions">
          ${coop ? '' : '<button type="button" class="quiet-button" data-action="restart">↻ Restart run</button>'}
          <button type="button" class="quiet-button" data-action="title">${coop ? '🚪 Leave co-op' : '⌂ Quit to title'}</button>
        </div>
      </div>
      <section class="pause-build">
        <h3>Your build</h3>
        ${ult}
        <div class="build">${brews}</div>
      </section>`
    );
    // Solo the run stands still: its HUD hides behind the menu. Co-op goes on: hearts, score and wave stay in view
    // above the menu, only banners, callouts and the combo hide.
    document.body.classList.toggle('run-paused', !coop);
    document.body.classList.toggle('coop-menu', coop);
  }

  /**
   * Rows of a leaderboard; `highlight` marks the player's own new entry (1-based rank). The columns follow the
   * board: score, depth (wave and level) or speed (time to beat Bee-zebub).
   */
  scoreTable(scores, highlight = null, board = 'all') {
    if (!scores) return '<p class="sub">The leaderboard is not reachable right now.</p>';
    if (!scores.length) return `<p class="sub">${board === 'speed' ? 'Nobody has beaten Bee-zebub yet. Will you be the first?' : 'No scores yet. Be the first legend!'}</p>`;
    const columns = {
      all: [['Score', (e) => e.score.toLocaleString()], ['Wave', (e) => `W${e.wave}`], ['Form', (e) => TIERS[e.tier]?.name ?? '']],
      daily: [['Score', (e) => e.score.toLocaleString()], ['Wave', (e) => `W${e.wave}`], ['Form', (e) => TIERS[e.tier]?.name ?? '']],
      depth: [['Wave', (e) => `W${e.wave}`], ['Level', (e) => `Lv ${e.level ?? 0}`], ['Score', (e) => e.score.toLocaleString()]],
      speed: [['Time', (e) => formatTime(e.clear)], ['Level', (e) => `Lv ${e.level ?? 0}`], ['Score', (e) => e.score.toLocaleString()]],
    }[board] ?? [['Score', (e) => e.score.toLocaleString()], ['Wave', (e) => `W${e.wave}`], ['Form', (e) => TIERS[e.tier]?.name ?? '']];
    // Co-op boards: the whole team.
    const who = (entry) => (entry.team?.length ? entry.team.map((member) => escapeHtml(member)).join(' · ') : escapeHtml(entry.name));
    const rows = scores
      .map(
        (entry, i) => `
        <tr class="${i + 1 === highlight ? 'me' : ''}">
          <td>${i + 1}</td>
          <td class="name">${entry.cls ? `<span title="${classById(entry.cls).name}">${classById(entry.cls).icon}</span> ` : ''}${entry.victory ? '👑 ' : ''}${who(entry)}${entry.steep ? ` <small class="steep">🔥${entry.steep}</small>` : ''}${entry.gentle ? ' <small title="Gentle Brew">🌿</small>' : ''}</td>
          ${columns.map(([, value], c) => `<td class="${c === 2 ? 'form-cell' : ''}">${value(entry)}</td>`).join('')}
        </tr>`
      )
      .join('');
    return `<table class="scores"><tr><th>#</th><th>Name</th>${columns.map(([title]) => `<th>${title}</th>`).join('')}</tr>${rows}</table>`;
  }

  showLeaderboard(board, scores) {
    this.showMenu(
      'leaderboard',
      `
      <div class="panel">
        <h2>🏆 Leaderboard</h2>
        <div class="tabs">
          <button class="menu-button ${board === 'all' ? 'primary' : ''}" data-action="leaderboard" data-board="all">🏆 Score</button>
          <button class="menu-button ${board === 'depth' ? 'primary' : ''}" data-action="leaderboard" data-board="depth">🌊 Deepest run</button>
          <button class="menu-button ${board === 'speed' ? 'primary' : ''}" data-action="leaderboard" data-board="speed">⏱ Fastest Bee-zebub</button>
          <button class="menu-button ${board === 'daily' ? 'primary' : ''}" data-action="leaderboard" data-board="daily">📅 Daily Brew</button>
        </div>
        <div class="tabs coop-tabs"><span>👥 Co-op</span>${[2, 3, 4]
          .map((n) => `<button class="menu-button ${board === `coop${n}` ? 'primary' : ''}" data-action="leaderboard" data-board="coop${n}">${n} frogs</button>`)
          .join('')}</div>
        ${scores === undefined ? '<p class="sub">Loading…</p>' : this.scoreTable(scores, null, board)}
        <div class="menu-buttons"><button class="menu-button" data-action="title">Back</button></div>
      </div>`
    );
  }

  showGameOver({ score, isRecord, kills, wave, level, time, clear, leaves, line, victory, daily, name, build, steep, gentle, offerGentle, grazes = 0, coop = 0, host = true, team = null, autoSubmit = false }) {
    const items = [build.keepsake, build.ultimate, ...build.skills, ...build.brews, ...(build.charms ?? [])].filter(Boolean);
    const gathered = items.length
      ? `<div class="run-build">${items
          .map(
            ({ icon, name, level, color }) =>
              `<span class="owned-item" title="${escapeHtml(name)}" style="--blend:${color ?? '#ffd76a'}">${icon}${level > 1 ? `<span class="owned-level">${level}</span>` : ''}</span>`
          )
          .join('')}</div>`
      : '';
    this.showMenu(
      `game-over ${victory ? 'victory' : ''}`,
      `
      <h1>${victory ? 'Victory!' : 'Game Over'}</h1>
      <p>${isRecord ? 'New best score' : 'Score'}: ${score}${daily ? ' <small>📅 Daily Brew</small>' : ''}${steep ? ` <small>🔥 Steep ${steep}</small>` : ''}${gentle ? ' <small>🌿 Gentle</small>' : ''}</p>
      <p class="stats">Reached wave ${wave} · level ${level} · ${kills} bees defeated${grazes ? ` · ✦ ${grazes} grazes` : ''} · ${formatTime(time)}</p>
      ${clear ? `<p class="stats">⏱ Bee-zebub banished in <b>${formatTime(clear)}</b></p>` : ''}
      ${gathered}
      <p class="leaves">+${leaves} 🍃 Golden Leaves (${meta.leaves} total)</p>
      <p class="line">“${line}”</p>
      ${
        offerGentle
          ? `<div class="gentle-offer"><p>🌿 <b>Too spicy?</b> Try Gentle Brew: ${GENTLE_TEXT}</p><button class="menu-button" type="button" data-action="gentle-on">🌿 Gentle for my next run</button></div>`
          : ''
      }
      ${
        coop >= 2 && !host
          ? `<p class="sub submit-score">👥 Your host submits the team's score to the ${coop}-frog co-op board.</p>`
          : autoSubmit
            ? `<form class="submit-score"><p class="sub">🏆 Submitting ${coop >= 2 ? "the team's score" : 'your score'} as <b>${escapeHtml(name)}</b>…</p></form>`
            : `<form class="submit-score">${this.submitFields(name, coop, team)}</form>`
      }
      <div class="board-slot"></div>
      <div class="menu-buttons">
        <button class="menu-button primary" data-action="start">↻ Play again</button>
        <button class="menu-button" data-action="share">📤 Share run</button>
        <button class="menu-button" data-action="pantry">🍃 Pantry</button>
        <button class="menu-button" data-action="title">⌂ Title</button>
      </div>
      <p class="prompt">or press Space</p>`
    );
  }

  /** Gentle Brew was switched on from the game-over screen. */
  gentleTaken() {
    const offer = this.menu.querySelector('.gentle-offer');
    if (offer) offer.innerHTML = '<p>🌿 <b>Gentle Brew is on.</b> Press ↻ Play again. (Turn it off on the title screen.)</p>';
  }

  /** The game-over screen's name field and submit button (frogs without a name; or a submit that failed). */
  submitFields(name, coop = 0, team = null) {
    return `<input id="player-name" maxlength="16" placeholder="${coop >= 2 ? 'Team or your name' : 'Your name'}" value="${escapeHtml(name)}" autocomplete="nickname" />
        <button class="menu-button" type="submit">🏆 Submit ${coop >= 2 ? `team score (${(team ?? []).map((member) => escapeHtml(member)).join(' · ')})` : 'score'}</button>`;
  }

  /**
   * Shows the result of a score submission and the board on the game-over screen. `name`: who it went in as;
   * `retry`: it failed, so the name field comes back with this name in it.
   */
  showSubmitted(message, scores, rank, board = 'all', { name = null, retry = null } = {}) {
    const form = this.menu.querySelector('.submit-score');
    if (form) form.innerHTML = `<p class="sub">${message}${name ? ` <small>(as ${escapeHtml(name)})</small>` : ''}</p>${retry === null ? '' : this.submitFields(retry)}`;
    const slot = this.menu.querySelector('.board-slot');
    if (slot && retry === null) slot.innerHTML = this.scoreTable(scores, rank, board);
  }

  /** `endless`: offer to keep going (not in the Daily Brew, whose run ends with Bee-zebub). */
  showVictory({ endless = true } = {}) {
    this.showMenu(
      'game-over victory',
      `
      <h1>The End</h1>
      <p>From the garden to the Underworld and back: Tode, God of Tea, finishes his cup in peace.</p>
      <div class="credits">
        <p><b>Todeity: Rise of the Tea God</b></p>
        <p>Made with Three.js and an AI coding agent, grown from the JetBrains Academy course</p>
        <p>Bee model: Quaternius (CC0) · House model: Jarlan Perez (CC-BY 3.0)</p>
        <p>Music &amp; sound: generated in your browser</p>
        <p class="thanks">Thank you for playing! 🐸☕</p>
      </div>
      <div class="menu-buttons">
        ${endless ? '<button class="menu-button primary" data-action="endless">∞ Keep going (endless)</button>' : ''}
        <button class="menu-button${endless ? '' : ' primary'}" data-action="retire">☕ Finish the run</button>
      </div>`
    );
  }

  // --- World-anchored labels ----------------------------------------------

  /** Places a DOM node over a world position. Returns false when it is off screen. */
  /** `cull`: false (and nothing written) when the spot is off the screen. */
  place(node, position, height, cull = false) {
    const p = this.projected.set(position.x, position.y, height).project(this.camera);
    if (p.z > 1) return false;
    const x = ((p.x + 1) / 2) * viewWidth();
    const y = ((1 - p.y) / 2) * viewHeight();
    if (cull && (x < -80 || y < -40 || x > viewWidth() + 80 || y > viewHeight() + 120)) return false;
    node.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    return true;
  }

  /** Call after rendering, so the camera matrices match the frame. */
  update(delta, enemies) {
    this.pumpToasts();
    for (const enemy of enemies) {
      if (!enemy.healthBar) continue;
      const { bar, fill } = enemy.healthBar;
      const visible = !enemy.dying && (enemy.hp < enemy.maxHp || enemy.elite || enemy.type.label || enemy.labelText) && this.place(bar, enemy.position, enemy.height + 8, true); // a big swarm: most bars are off screen
      setStyle(bar, 'display', visible ? '' : 'none');
      if (visible) setStyle(fill, 'width', `${((Math.max(0, enemy.hp) / enemy.maxHp) * 100).toFixed(1)}%`);
    }

    this.damageNumbers = this.damageNumbers.filter((label) => {
      label.age += delta;
      const t = label.age / DAMAGE_NUMBER_DURATION;
      if (t >= 1) {
        label.node.remove();
        return false;
      }
      this.place(label.node, label.position, label.position.z + t * DAMAGE_NUMBER_RISE);
      label.node.style.opacity = String(1 - t * t);
      return true;
    });
  }

  clearWorldLabels() {
    for (const label of this.damageNumbers) label.node.remove();
    this.damageNumbers = [];
  }
}

const isTouch = () => document.body.classList.contains('touch');

/** Seconds as m:ss. */
export function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** A green "live" badge with the number of public gardens that have frogs in them (empty when there are none). */
function gardenLabel(gardens) {
  const live = (gardens ?? []).filter((garden) => garden.frogs > 0);
  if (!live.length) return '<small data-garden-count hidden></small>';
  const frogs = live.reduce((sum, garden) => sum + garden.frogs, 0);
  const title = `${live.length} garden${live.length > 1 ? 's' : ''} with ${frogs} frog${frogs > 1 ? 's' : ''} in ${live.length > 1 ? 'them' : 'it'} right now`;
  return `<small class="live-count" data-garden-count title="${title}">${live.length}</small>`;
}

/** The Co-op tile's badge: how many public rooms are open (nothing without a server or open rooms). */
function coopBadge(rooms) {
  const open = rooms?.rooms.length ?? 0;
  if (!open) return '<em class="dock-badge live" data-coop-count hidden></em>';
  return `<em class="dock-badge live" data-coop-count title="${open} open room${open > 1 ? 's' : ''}">${open}</em>`;
}

/** How far the gift (a day) or the kettle (KETTLE_HOURS) has come, 0…1, for the dock tile's ring. */
function rewardProgress(kind, state) {
  if (state.ready) return 1;
  const period = kind === 'gift' ? 86_400_000 : KETTLE_HOURS * 3_600_000;
  return Math.max(0, Math.min(1, 1 - state.nextIn / period)).toFixed(3);
}

/**
 * Where the scrolled boxes inside `root` (and `root` itself) are scrolled to, keyed by their class and how many
 * boxes with that class come before them, so a redraw of the same screen can put them back (`restoreScroll`).
 * Without it every click that redrew a screen sent its lists back to the start.
 */
function scrollState(root) {
  const state = new Map();
  const counts = new Map();
  const note = (el, key) => {
    if (el.scrollLeft || el.scrollTop) state.set(key, [el.scrollLeft, el.scrollTop]);
  };
  note(root, ':root');
  for (const el of root.querySelectorAll('*')) {
    const cls = el.getAttribute('class') ?? el.tagName;
    const n = counts.get(cls) ?? 0;
    counts.set(cls, n + 1);
    note(el, `${cls}#${n}`);
  }
  return state;
}

function restoreScroll(root, state) {
  if (!state.size) return;
  const counts = new Map();
  const put = (el, key) => {
    const at = state.get(key);
    if (at) [el.scrollLeft, el.scrollTop] = at;
  };
  put(root, ':root');
  for (const el of root.querySelectorAll('*')) {
    const cls = el.getAttribute('class') ?? el.tagName;
    const n = counts.get(cls) ?? 0;
    counts.set(cls, n + 1);
    put(el, `${cls}#${n}`);
  }
}

/** 3:05:09 or 12:34 for a countdown in ms. */
function clock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
