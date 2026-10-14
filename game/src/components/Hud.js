import * as THREE from 'three';
import { BLENDS, RARITIES, describe } from './PowerUps.js';
import { ULTIMATES } from './Ultimates.js';
import { MAX_SKILLS, SKILLS, SKILL_KEY_LABELS } from './Skills.js';
import { brewDialogue, kettleDialogue } from './Spirits.js';
import { TIERS } from './Ascension.js';
import { ACHIEVEMENTS, ACHIEVEMENT_REWARD, isUnlocked } from './Achievements.js';
import { PANTRY, meta, nextCost, pantryLevel } from './Meta.js';
import { CHANGELOG, VERSION } from './Changelog.js';
import { canFullscreen, isFullscreen } from './Fullscreen.js';
import { KEEPSAKES, currentKeepsake, isKeepsakeUnlocked, unlockHint } from './Keepsakes.js';
import { STEEP_MAX, VOWS, steepBonus, steepLevel, vowRank } from './Steeping.js';
import { CHARM_RARITIES } from './Charms.js';

const ABILITIES = [
  { id: 'spit', key: 'LMB', name: 'Spit', icon: '💧' },
  { id: 'dash', key: 'Shift', name: 'Hop dash', icon: '💨' },
  { id: 'splash', key: 'Space', name: 'Tea bomb', icon: '💥' },
  // Skill slots: the first three have Q/E/F, the rest always cast themselves.
  ...Array.from({ length: MAX_SKILLS }, (_, i) => ({ id: `skill${i}`, key: SKILL_KEY_LABELS[i] ?? 'auto', name: 'Skill', icon: '✨', skill: true })),
  { id: 'ultimate', key: 'R', name: 'Ultimate', icon: '✨' },
];
const DAMAGE_NUMBER_DURATION = 0.8; // seconds
const DAMAGE_NUMBER_RISE = 25; // world units

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
    this.boss = element('boss-bar', this.top);
    this.bossName = element('boss-name', this.boss);
    this.bossFill = element('boss-fill', element('boss-track', this.boss));
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
      element('ability-key', slot).textContent = ability.key;
      const cover = element('ability-cover', slot);
      const timer = element('ability-timer', slot);
      const badge = element('ability-badge', slot);
      this.slots[ability.id] = { slot, icon, cover, timer, badge };
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
    this.photoButton = element('round-button', this.buttons, 'button');
    this.photoButton.textContent = '📸';
    this.photoButton.title = 'Save a screenshot (C)';
    this.photoButton.addEventListener('click', (event) => {
      event.stopPropagation();
      this.onAction('photo');
    });
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

    this.damageNumbers = [];
    this.shownHealth = null;
  }

  setMuted(muted) {
    this.muteButton.textContent = muted ? '🔇' : '🔊';
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
          const x = ((p.x / scale + 1) / 2) * window.innerWidth;
          const y = ((1 - p.y / scale) / 2) * window.innerHeight;
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
    const state = enemy.shielded ? 'shielded' : enemy.ai?.staggerLeft > 0 ? 'staggered' : '';
    if (this.boss.dataset.state !== state) this.boss.dataset.state = state;
    setText(this.bossName, enemy.shielded ? `🛡 ${enemy.type.name} · SHIELDED` : state ? `💫 ${enemy.type.name} · STAGGERED` : enemy.type.name);
    setStyle(this.bossFill, 'width', `${((Math.max(0, enemy.hp) / enemy.maxHp) * 100).toFixed(1)}%`);
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

  /** Learned skills: [{ id, level, cooldownLeft }]; `auto` shows they cast themselves. */
  setSkills(slots, auto) {
    for (let i = 0; i < MAX_SKILLS; i++) {
      const key = SKILL_KEY_LABELS[i];
      const slot = slots[i];
      const ui = this.slots[`skill${i}`];
      setProp(ui.slot, 'hidden', !slot);
      if (!slot) continue;
      const skill = SKILLS[slot.id];
      setText(ui.icon, skill.icon);
      setProp(ui.slot, 'title', `${skill.name} (level ${slot.level})`);
      setText(ui.badge, slot.level > 1 ? slot.level : '');
      ui.keyLabel ??= ui.slot.querySelector('.ability-key');
      setText(ui.keyLabel, auto || !key ? 'auto' : key);
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
  setSteep(steep) {
    this.steep.hidden = !steep;
    this.steep.textContent = `🔥 Steep ${steep}`;
  }

  showBanner(title, subtitle = '', duration = 1.6, className = '') {
    this.banner.className = `banner ${className}`;
    this.banner.innerHTML = `<div class="banner-title">${title}</div><div class="banner-sub">${subtitle}</div>`;
    void this.banner.offsetWidth; // restart the CSS animation
    this.banner.style.animationDuration = `${duration}s`;
    this.banner.classList.add('show');
  }

  /** "Waiting for teammates" between co-op waves; `null` hides it. */
  setWaiting(ready, total) {
    this.waiting.textContent = ready === null ? '' : `⏳ Waiting for teammates… ${ready}/${total} ready`;
  }

  // --- Co-op name tags ---------------------------------------------------------------

  attachNameTag(name, color) {
    const tag = element('name-tag', this.worldLayer);
    const label = element('name-tag-name', tag);
    label.textContent = name;
    label.style.color = color;
    const bar = element('name-tag-bar', tag);
    return { tag, fill: element('name-tag-fill', bar) };
  }

  updateNameTag({ tag, fill }, position, visible, hp, maxHp) {
    const shown = visible && this.place(tag, position, 42);
    tag.style.display = shown ? '' : 'none';
    if (shown) fill.style.width = `${(Math.max(0, hp) / Math.max(1, maxHp)) * 100}%`;
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
  showLobby({ view, code, players = [], isHost, error, name }) {
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
      body = `
        <p class="sub">Share this room code with your friends:</p>
        <div class="room-code">${code}</div>
        <ul class="lobby-players">${list}</ul>
        <p class="sub">The garden grows and more bees come with every extra frog (up to 4).</p>
        <div class="menu-buttons">${start}<button class="menu-button" data-action="coop-leave">Leave</button></div>`;
    } else {
      body = `
        <form class="lobby-form" data-form="coop">
          <input id="coop-name" maxlength="16" placeholder="Your name" value="${escapeHtml(name)}" autocomplete="nickname" />
          <button class="menu-button primary" type="button" data-action="coop-create">✨ Create room</button>
        </form>
        <form class="lobby-form" data-form="coop">
          <input id="coop-code" maxlength="4" placeholder="CODE" autocomplete="off" />
          <button class="menu-button" type="button" data-action="coop-join">🚪 Join room</button>
        </form>
        <div class="menu-buttons"><button class="menu-button" data-action="title">Back</button></div>`;
    }
    this.showMenu('lobby', `<div class="panel"><h2>👥 Co-op</h2>${errorLine}${body}</div>`);
  }

  /** A gentle hint above the ability bar for new players. */
  showTip(text) {
    this.tip.innerHTML = `💡 ${text}`;
    this.tip.classList.remove('show');
    void this.tip.offsetWidth;
    this.tip.classList.add('show');
  }

  /** `keepsake`: the keepsake this achievement unlocks, if any. */
  showAchievement({ icon, name, text }, keepsake = null) {
    const unlocked = keepsake ? `<em class="toast-keepsake">🎒 New keepsake: ${keepsake.icon} ${keepsake.name}</em>` : '';
    this.toast(`<span class="toast-icon">${icon}</span><span><small>Achievement unlocked · +${ACHIEVEMENT_REWARD} 🍃</small><b>${name}</b><em>${text}</em>${unlocked}</span>`);
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

  toast(html, className = '', seconds = 4.2) {
    // Keep the stack short: a burst of charms shouldn't bury the screen (on phones even shorter).
    while (this.toasts.children.length >= (isTouch() ? 2 : 4)) this.toasts.firstChild.remove();
    if (isTouch()) seconds = Math.min(seconds, 3);
    const toast = element(`toast ${className}`, this.toasts);
    toast.innerHTML = html;
    setTimeout(() => toast.classList.add('leaving'), seconds * 1000);
    setTimeout(() => toast.remove(), seconds * 1000 + 600);
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
    if (this.damageNumbers.length > 80) return;
    const node = element(`damage-number ${className}`, this.worldLayer);
    node.textContent = amount;
    this.damageNumbers.push({ node, position: position.clone().setZ(height), age: 0 });
  }

  attachHealthBar(enemy) {
    const bar = element(enemy.elite ? 'health-bar elite' : 'health-bar', this.worldLayer);
    if (enemy.elite) {
      const label = element('elite-label', bar);
      label.textContent = `${enemy.elite.icon} ${enemy.elite.name}`;
      label.style.color = enemy.elite.color;
    }
    enemy.healthBar = { bar, fill: element('health-fill', bar) };
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
    this.menuName = className.split(' ')[0];
    this.menu.className = `menu ${className}`;
    this.menu.innerHTML = html;
    this.menu.hidden = false;
    this.menuClickAction = clickAction;
  }

  hideMenu() {
    clearInterval(this.typing);
    this.onHush();
    this.menuName = null;
    this.menu.hidden = true;
    this.menu.innerHTML = '';
    this.menuClickAction = null;
  }

  get menuOpen() {
    return !this.menu.hidden;
  }

  showModal(className, html) {
    this.modal.className = `modal ${className}`;
    this.modal.innerHTML = `<div class="panel">${html}</div>`;
    this.modal.hidden = false;
  }

  hideModal() {
    this.modal.hidden = true;
    this.modal.innerHTML = '';
  }

  get modalOpen() {
    return !this.modal.hidden;
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
  showShare(image, native) {
    this.showModal(
      'share',
      `<h2>📤 Share your run</h2>
      <img class="share-card" src="${image}" alt="Your run: score, time, wave and abilities" />
      <div class="menu-buttons">
        ${native ? '<button class="menu-button primary" data-action="share-native">📤 Share</button>' : ''}
        <button class="menu-button ${native ? '' : 'primary'}" data-action="share-copy">📋 Copy text</button>
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
  fullscreenButton() {
    if (!canFullscreen()) return '';
    return `<button class="menu-button" data-action="toggle-fullscreen">⛶ Fullscreen: ${isFullscreen() ? 'on' : 'off'}</button>`;
  }

  showTitle(best) {
    this.showMenu(
      'title-screen',
      `
      <div class="panel">
        <h1>Todeity</h1>
        <p class="subtitle">Rise of the Tea God</p>
        <p class="story">Tode was brewing his morning tea when the bees came buzzing over the fence.
        Brew mighty powers, rise from frog to god, and chase the hive all the way down to Bee-zebub.</p>
${
          document.body.classList.contains('touch')
            ? `<div class="controls">
          <span><b>Left stick</b> move</span>
          <span><b>Right stick</b> aim</span>
          <span>Tode <b>spits</b> by himself</span>
          <span><b>💨</b> hop dash</span>
          <span><b>💥</b> tea bomb</span>
          <span><b>✨</b> ultimate</span>
        </div>`
            : `<div class="controls">
          <span><b>WASD</b> move</span>
          <span><b>Mouse</b> aim</span>
          <span><b>Hold LMB</b> spit</span>
          <span><b>Shift / RMB</b> hop dash</span>
          <span><b>Space</b> tea bomb</span>
          <span><b>R</b> ultimate</span>
          <span><b>Q/E/F</b> skills (or auto)</span>
          <span><b>Esc</b> pause</span>
        </div>`
        }
        ${best ? `<p class="best">Best score: ${best}${meta.victories ? ` · 👑 ${meta.victories} victor${meta.victories > 1 ? 'ies' : 'y'}` : ''}</p>` : ''}
        <div class="menu-buttons">
          <button class="menu-button primary" data-action="start">▶ Start run</button>
          <button class="menu-button" data-action="daily">📅 Daily Brew</button>
          <button class="menu-button" data-action="coop">👥 Co-op</button>
          <button class="menu-button" data-action="leaderboard" data-board="all">🏆 Leaderboard</button>
          <button class="menu-button" data-action="pantry">🍃 Tode's Pantry <small>${meta.leaves} leaves</small></button>
          <button class="menu-button" data-action="keepsakes">🎒 Keepsake <small>${currentKeepsake().icon} ${currentKeepsake().name}</small></button>
          ${meta.runs > 0 ? `<button class="menu-button" data-action="steeping">🔥 Steeping <small>${steepLevel() ? `Steep ${steepLevel()} · ×${steepBonus(steepLevel()).toFixed(2)}` : 'off'}</small></button>` : ''}
          ${this.fullscreenButton()}
          <button class="menu-button" data-action="changelog">📜 What's new</button>
        </div>
        <p class="prompt">or press Space</p>
        <p class="version">v${VERSION}</p>
      </div>`
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
        <h3>🏆 Achievements <small>${ACHIEVEMENTS.filter((a) => isUnlocked(a.id)).length}/${ACHIEVEMENTS.length} · +${ACHIEVEMENT_REWARD} 🍃 each</small></h3>
        <div class="achievements">${ACHIEVEMENTS.map(
          (a) => `<span class="achievement ${isUnlocked(a.id) ? 'unlocked' : ''}" title="${a.name}: ${a.text}">${a.icon}</span>`
        ).join('')}</div>
        <div class="menu-buttons"><button class="menu-button" data-action="title">Back</button></div>
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
  showSteeping() {
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
        Solo runs only: the Daily Brew and co-op are never steeped.</p>
        <p class="steep-total">Steep <b>${steep}</b> / ${STEEP_MAX} · score and leaves ×${steepBonus(steep).toFixed(2)}</p>
        <div class="vows">${rows}</div>
        <div class="menu-buttons">
          <button class="menu-button" data-action="vows-clear">Clear vows</button>
          <button class="menu-button primary" data-action="title">Done</button>
        </div>
      </div>`
    );
  }

  card({ action, index, brew, rarity, level, text, kind: kindOverride }) {
    const blends = brew.blends ?? (brew.blend ? [brew.blend] : []);
    const colors = blends.map((id) => BLENDS[id].color);
    const first = colors[0] ?? '#ffc93c';
    const second = colors[1] ?? first;
    const kind = kindOverride ?? brew.kind ?? 'ultimate';
    const tag =
      { duo: 'Duo', legendary: 'Legendary', ultimate: 'Ultimate', skill: 'Skill' }[kind] ?? RARITIES[rarity].name;
    const rarityClass = kind === 'brew' ? `rarity-${RARITIES[rarity].id}` : `kind-${kind}`;
    const label = brew.blends
      ? blends.map(blendLabel).join(' × ')
      : brew.blend
        ? blendLabel(brew.blend)
        : kind === 'skill'
          ? '🌀 Skill'
          : '✨ Ultimate';
    return `
      <button class="card ${rarityClass}" data-action="${action}" data-index="${index}" style="--blend:${first};--blend2:${second}">
        <span class="card-key">${index + 1}</span>
        <span class="card-blend">${label}</span>
        <span class="card-icon">${brew.icon}</span>
        <span class="card-name">${brew.name}</span>
        <span class="card-tags"><span class="tag tag-rarity">${tag}</span>${
          level ? `<span class="tag">${level === 1 ? 'New' : `Level ${level}`}</span>` : ''
        }</span>
        <span class="card-description">${text}</span>
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
    this.showMenu(
      'powerups',
      `<h2>${title}</h2>${this.dialogue(brewDialogue(offers, memory))}<div class="cards">${cards}</div><div class="menu-buttons">${reroll}</div>`
    );
    this.typeDialogue();
  }

  showUltimates() {
    const cards = Object.values(ULTIMATES)
      .map((ultimate, index) => this.card({ action: 'ultimate', index, brew: ultimate, text: ultimate.text }))
      .join('');
    this.showMenu(
      'powerups ultimates',
      `<h2>Awaken your ultimate</h2>${this.dialogue(kettleDialogue('ultimate'))}<p class="sub">Charged by battle · unleash it with <b>R</b></p><div class="cards">${cards}</div>`
    );
    this.typeDialogue();
  }

  /** `level`: shown as a level-up (the skill pick that every level brings). */
  showSkills(offers, auto, level = 0) {
    const cards = offers
      .map(({ skill, level }, index) =>
        this.card({ action: 'skill', index, brew: skill, level, text: skill.text(level), kind: 'skill' })
      )
      .join('');
    const how = auto ? 'Skills cast themselves when the moment is right' : 'Cast skills with <b>Q</b>, <b>E</b> and <b>F</b>';
    this.showMenu(
      'powerups skills',
      `<h2>${level ? `Level ${level}! ` : ''}Learn a skill</h2>${this.dialogue(kettleDialogue('skill'))}<p class="sub">${how}</p><div class="cards">${cards}</div>`
    );
    this.typeDialogue();
  }

  showPause({ build, ultimate, form, sound, autoCast, coop, keepsake, steep, calmFx }) {
    const brews = build.length
      ? build
          .map(
            ({ icon, name, level, color, text }) =>
              `<div class="build-item" style="--blend:${color}"><span>${icon}</span><span><b>${name}${level > 1 ? ` · Lv ${level}` : ''}</b><small>${text}</small></span></div>`
          )
          .join('')
      : '<p class="sub">No brews yet. Clear a wave to choose one.</p>';
    const ult = ultimate ? `<p class="sub">Ultimate: ${ULTIMATES[ultimate].icon} <b>${ULTIMATES[ultimate].name}</b></p>` : '';
    this.showMenu(
      'pause',
      `
      <div class="panel">
        <h2>${coop ? 'Menu' : 'Paused'}</h2>
        ${coop ? '<p class="sub">The run keeps going for your teammates while this menu is open.</p>' : ''}
        <p class="sub">${form}${keepsake ? ` · ${keepsake.icon} ${keepsake.name}` : ''}${steep ? ` · 🔥 Steep ${steep}` : ''}</p>
        ${ult}
        <div class="build">${brews}</div>
        <div class="menu-buttons">
          <button class="menu-button primary" data-action="resume">▶ Resume</button>
          <button class="menu-button" data-action="toggle-music">🎵 Music: ${sound.music ? 'on' : 'off'}</button>
          <button class="menu-button" data-action="toggle-sfx">🔊 Effects: ${sound.sfx ? 'on' : 'off'}</button>
          <button class="menu-button" data-action="toggle-calm">✨ Effects: ${calmFx ? 'calm' : 'full'}</button>
          ${document.body.classList.contains('touch') ? '' : `<button class="menu-button" data-action="toggle-autocast">🤖 Skills: ${autoCast ? 'auto-cast' : 'manual (Q/E/F)'}</button>`}
          ${this.fullscreenButton()}
          <button class="menu-button" data-action="changelog">📜 What's new <small>v${VERSION}</small></button>
          ${coop ? '' : '<button class="menu-button" data-action="restart">↻ Restart run</button>'}
          <button class="menu-button" data-action="title">${coop ? '🚪 Leave co-op' : '⌂ Quit to title'}</button>
        </div>
      </div>`
    );
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
    }[board] ?? [];
    const rows = scores
      .map(
        (entry, i) => `
        <tr class="${i + 1 === highlight ? 'me' : ''}">
          <td>${i + 1}</td>
          <td class="name">${entry.victory ? '👑 ' : ''}${escapeHtml(entry.name)}${entry.steep ? ` <small class="steep">🔥${entry.steep}</small>` : ''}</td>
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
        ${scores === undefined ? '<p class="sub">Loading…</p>' : this.scoreTable(scores, null, board)}
        <div class="menu-buttons"><button class="menu-button" data-action="title">Back</button></div>
      </div>`
    );
  }

  showGameOver({ score, isRecord, kills, wave, level, time, clear, leaves, line, victory, daily, name, build, steep }) {
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
      <p>${isRecord ? 'New best score' : 'Score'}: ${score}${daily ? ' <small>📅 Daily Brew</small>' : ''}${steep ? ` <small>🔥 Steep ${steep}</small>` : ''}</p>
      <p class="stats">Reached wave ${wave} · level ${level} · ${kills} bees defeated · ${formatTime(time)}</p>
      ${clear ? `<p class="stats">⏱ Bee-zebub banished in <b>${formatTime(clear)}</b></p>` : ''}
      ${gathered}
      <p class="leaves">+${leaves} 🍃 Golden Leaves (${meta.leaves} total)</p>
      <p class="line">“${line}”</p>
      <form class="submit-score">
        <input id="player-name" maxlength="16" placeholder="Your name" value="${escapeHtml(name)}" autocomplete="nickname" />
        <button class="menu-button" type="submit">🏆 Submit score</button>
      </form>
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

  /** Shows the result of a score submission and the board on the game-over screen. */
  showSubmitted(message, scores, rank, board = 'all') {
    const form = this.menu.querySelector('.submit-score');
    if (form) form.innerHTML = `<p class="sub">${message}</p>`;
    const slot = this.menu.querySelector('.board-slot');
    if (slot) slot.innerHTML = this.scoreTable(scores, rank, board);
  }

  showVictory() {
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
        <button class="menu-button primary" data-action="endless">∞ Keep going (endless)</button>
        <button class="menu-button" data-action="retire">☕ Finish the run</button>
      </div>`
    );
  }

  // --- World-anchored labels ----------------------------------------------

  /** Places a DOM node over a world position. Returns false when it is off screen. */
  place(node, position, height) {
    const p = this.projected.set(position.x, position.y, height).project(this.camera);
    if (p.z > 1) return false;
    const x = ((p.x + 1) / 2) * window.innerWidth;
    const y = ((1 - p.y) / 2) * window.innerHeight;
    node.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    return true;
  }

  /** Call after rendering, so the camera matrices match the frame. */
  update(delta, enemies) {
    for (const enemy of enemies) {
      if (!enemy.healthBar) continue;
      const { bar, fill } = enemy.healthBar;
      const visible = !enemy.dying && (enemy.hp < enemy.maxHp || enemy.elite) && this.place(bar, enemy.position, enemy.height + 8);
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

function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
