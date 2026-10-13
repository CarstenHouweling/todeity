import * as THREE from 'three';
import { BLENDS, RARITIES, describe } from './PowerUps.js';
import { ULTIMATES } from './Ultimates.js';
import { SKILLS, SKILL_KEY_LABELS } from './Skills.js';
import { brewDialogue, kettleDialogue } from './Spirits.js';
import { TIERS } from './Ascension.js';
import { ACHIEVEMENTS, ACHIEVEMENT_REWARD, isUnlocked } from './Achievements.js';
import { PANTRY, meta, nextCost, pantryLevel } from './Meta.js';

const ABILITIES = [
  { id: 'spit', key: 'LMB', name: 'Spit', icon: '💧' },
  { id: 'dash', key: 'Shift', name: 'Hop dash', icon: '💨' },
  { id: 'splash', key: 'Space', name: 'Tea splash', icon: '🍵' },
  ...SKILL_KEY_LABELS.map((key, i) => ({ id: `skill${i}`, key, name: 'Skill', icon: '✨' })),
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

const blendLabel = (id) => `${BLENDS[id].icon} ${BLENDS[id].name}`;

/** All 2D UI: score, health, waves, abilities, labels over bees, and the menus. */
export class Hud {
  constructor(camera) {
    this.camera = camera;
    this.projected = new THREE.Vector3();
    this.onAction = () => {};

    this.root = element('hud', document.body);
    this.worldLayer = element('world-layer', this.root);
    this.hurtFlash = element('hurt-flash', this.root);
    this.score = element('score', this.root);
    this.status = element('status', this.root);
    this.hearts = element('hearts', this.status);
    this.form = element('form', this.status);

    this.top = element('top-center', this.root);
    this.wave = element('wave', this.top);
    this.weather = element('weather', this.top);
    this.waiting = element('waiting', this.top);
    this.boss = element('boss-bar', this.top);
    this.bossName = element('boss-name', this.boss);
    this.bossFill = element('boss-fill', element('boss-track', this.boss));
    this.boss.hidden = true;

    this.banner = element('banner', this.root);
    this.callout = element('callout', this.root);
    this.toasts = element('toasts', document.body);
    this.combo = element('combo', this.root);
    this.bossIntro = element('boss-intro', document.body);
    this.bossIntro.hidden = true;

    this.bar = element('ability-bar', this.root);
    this.slots = {};
    for (const ability of ABILITIES) {
      const slot = element(`ability ability-${ability.id}`, this.bar);
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
    SKILL_KEY_LABELS.forEach((_, i) => (this.slots[`skill${i}`].slot.hidden = true));

    this.owned = element('owned', this.root);

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

    this.damageNumbers = [];
    this.shownHealth = null;
  }

  setMuted(muted) {
    this.muteButton.textContent = muted ? '🔇' : '🔊';
  }

  setScore(score, best) {
    this.score.textContent = `Score: ${score}   Best: ${best}`;
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
    this.wave.textContent = beesLeft > 0 ? `Wave ${wave} · ${beesLeft} bees left` : `Wave ${wave}`;
  }

  setWeather(info) {
    this.weather.hidden = !info.text;
    this.weather.textContent = `${info.icon} ${info.name} · ${info.text}`;
  }

  setBoss(enemy) {
    this.boss.hidden = !enemy;
    if (!enemy) return;
    this.bossName.textContent = enemy.type.name;
    this.bossFill.style.width = `${(Math.max(0, enemy.hp) / enemy.maxHp) * 100}%`;
  }

  setCooldown(id, left, total) {
    const { slot, cover, timer } = this.slots[id];
    const fraction = total > 0 ? THREE.MathUtils.clamp(left / total, 0, 1) : 0;
    cover.style.transform = `scaleY(${fraction})`;
    timer.textContent = left > 0.3 ? Math.ceil(left).toString() : '';
    slot.classList.toggle('ready', left <= 0);
  }

  setDashCharges(charges, max) {
    this.slots.dash.badge.textContent = max > 1 ? charges : '';
  }

  /** `gauge` is 0–100. Hidden until an ultimate is chosen. */
  setUltimate(id, gauge) {
    const { slot, icon, cover, timer } = this.slots.ultimate;
    slot.hidden = !id;
    if (!id) return;
    icon.textContent = ULTIMATES[id].icon;
    slot.title = ULTIMATES[id].name;
    cover.style.transform = `scaleY(${1 - gauge / 100})`;
    timer.textContent = gauge < 100 ? `${Math.floor(gauge)}%` : '';
    slot.classList.toggle('ready', gauge >= 100);
    slot.classList.toggle('charging', gauge < 100);
  }

  /** Learned skills: [{ id, level, cooldownLeft }]; `auto` shows they cast themselves. */
  setSkills(slots, auto) {
    SKILL_KEY_LABELS.forEach((key, i) => {
      const slot = slots[i];
      const ui = this.slots[`skill${i}`];
      ui.slot.hidden = !slot;
      if (!slot) return;
      const skill = SKILLS[slot.id];
      ui.icon.textContent = skill.icon;
      ui.slot.title = `${skill.name} (level ${slot.level})`;
      ui.badge.textContent = slot.level > 1 ? slot.level : '';
      ui.slot.querySelector('.ability-key').textContent = auto ? 'auto' : key;
      this.setCooldown(`skill${i}`, slot.cooldownLeft, skill.cooldown(slot.level));
    });
  }

  /** The brews picked this run: [{ icon, name, level, blend }]. */
  setOwned(list) {
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

  showAchievement({ icon, name, text }) {
    const toast = element('toast', this.toasts);
    toast.innerHTML = `<span class="toast-icon">${icon}</span><span><small>Achievement unlocked · +${ACHIEVEMENT_REWARD} 🍃</small><b>${name}</b><em>${text}</em></span>`;
    setTimeout(() => toast.classList.add('leaving'), 4200);
    setTimeout(() => toast.remove(), 4800);
  }

  setCombo(count) {
    this.combo.textContent = count >= 3 ? `${count} combo` : '';
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

  /** Letterboxed name card for a boss entrance. */
  showBossIntro(name, epithet) {
    this.bossIntro.innerHTML = `<div class="letterbox top"></div><div class="letterbox bottom"></div>
      <div class="boss-card"><div class="boss-card-name">${name}</div><div class="boss-card-epithet">${epithet}</div></div>`;
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
    this.menu.className = `menu ${className}`;
    this.menu.innerHTML = html;
    this.menu.hidden = false;
    this.menuClickAction = clickAction;
  }

  hideMenu() {
    this.menu.hidden = true;
    this.menu.innerHTML = '';
    this.menuClickAction = null;
  }

  get menuOpen() {
    return !this.menu.hidden;
  }

  showTitle(best) {
    this.showMenu(
      'title-screen',
      `
      <div class="panel">
        <h1>Todeity</h1>
        <p class="subtitle">Rise of the Tea God</p>
        <p class="story">Tode was brewing his morning tea when the bees came buzzing over the fence.
        Brew mighty powers, rise from frog to god, and topple the Empress of the hive.</p>
${
          document.body.classList.contains('touch')
            ? `<div class="controls">
          <span><b>Drag left side</b> move</span>
          <span>Tode <b>aims &amp; spits</b> by himself</span>
          <span><b>💨</b> hop dash</span>
          <span><b>🍵</b> tea splash</span>
          <span><b>✨</b> ultimate</span>
        </div>`
            : `<div class="controls">
          <span><b>WASD</b> move</span>
          <span><b>Mouse</b> aim</span>
          <span><b>Hold LMB</b> spit</span>
          <span><b>Shift / RMB</b> hop dash</span>
          <span><b>Space</b> tea splash</span>
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
        </div>
        <p class="prompt">or press Space</p>
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
    return `<div class="dialogue">${lines
      .map(
        ({ spirit, line }, i) => `
        <div class="speech" style="--spirit:${spirit.color};animation-delay:${i * 0.9}s">
          <span class="portrait">${spirit.portrait}</span>
          <span class="speech-text"><b>${spirit.name}</b> <small>${spirit.title}</small><span class="line" data-line="${line.replace(/"/g, '&quot;')}" data-delay="${i * 0.9}"></span></span>
        </div>`
      )
      .join('')}</div>`;
  }

  typeDialogue() {
    clearInterval(this.typing);
    const lines = [...this.menu.querySelectorAll('.line')];
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

  showBrews(wave, offers, rerolls) {
    const cards = offers
      .map((offer, index) => this.card({ action: 'brew', index, ...offer, text: describe(offer) }))
      .join('');
    const reroll = rerolls > 0 ? `<button class="menu-button" data-action="reroll">🔄 Reroll (${rerolls})</button>` : '';
    this.showMenu(
      'powerups',
      `<h2>Wave ${wave} cleared!</h2>${this.dialogue(brewDialogue(offers))}<div class="cards">${cards}</div><div class="menu-buttons">${reroll}</div>`
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

  showSkills(offers, auto) {
    const cards = offers
      .map(({ skill, level }, index) =>
        this.card({ action: 'skill', index, brew: skill, level, text: skill.text(level), kind: 'skill' })
      )
      .join('');
    const how = auto ? 'Skills cast themselves when the moment is right' : 'Cast skills with <b>Q</b>, <b>E</b> and <b>F</b>';
    this.showMenu(
      'powerups skills',
      `<h2>Learn a skill</h2>${this.dialogue(kettleDialogue('skill'))}<p class="sub">${how}</p><div class="cards">${cards}</div>`
    );
    this.typeDialogue();
  }

  showPause({ build, ultimate, form, sound, autoCast, coop }) {
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
        <p class="sub">${form}</p>
        ${ult}
        <div class="build">${brews}</div>
        <div class="menu-buttons">
          <button class="menu-button primary" data-action="resume">▶ Resume</button>
          <button class="menu-button" data-action="toggle-music">🎵 Music: ${sound.music ? 'on' : 'off'}</button>
          <button class="menu-button" data-action="toggle-sfx">🔊 Effects: ${sound.sfx ? 'on' : 'off'}</button>
          <button class="menu-button" data-action="toggle-autocast">🤖 Skills: ${autoCast ? 'auto-cast' : 'manual (Q/E/F)'}</button>
          ${coop ? '' : '<button class="menu-button" data-action="restart">↻ Restart run</button>'}
          <button class="menu-button" data-action="title">${coop ? '🚪 Leave co-op' : '⌂ Quit to title'}</button>
        </div>
      </div>`
    );
  }

  /** Rows of a leaderboard; `highlight` marks the player's own new entry (1-based rank). */
  scoreTable(scores, highlight = null) {
    if (!scores) return '<p class="sub">The leaderboard is not reachable right now.</p>';
    if (!scores.length) return '<p class="sub">No scores yet. Be the first legend!</p>';
    const rows = scores
      .map(
        (entry, i) => `
        <tr class="${i + 1 === highlight ? 'me' : ''}">
          <td>${i + 1}</td>
          <td class="name">${entry.victory ? '👑 ' : ''}${escapeHtml(entry.name)}</td>
          <td>${entry.score.toLocaleString()}</td>
          <td>W${entry.wave}</td>
          <td class="form-cell">${TIERS[entry.tier]?.name ?? ''}</td>
        </tr>`
      )
      .join('');
    return `<table class="scores"><tr><th>#</th><th>Name</th><th>Score</th><th>Wave</th><th>Form</th></tr>${rows}</table>`;
  }

  showLeaderboard(board, scores) {
    this.showMenu(
      'leaderboard',
      `
      <div class="panel">
        <h2>🏆 Leaderboard</h2>
        <div class="tabs">
          <button class="menu-button ${board === 'all' ? 'primary' : ''}" data-action="leaderboard" data-board="all">All time</button>
          <button class="menu-button ${board === 'daily' ? 'primary' : ''}" data-action="leaderboard" data-board="daily">📅 Today's Daily Brew</button>
        </div>
        ${scores === undefined ? '<p class="sub">Loading…</p>' : this.scoreTable(scores)}
        <div class="menu-buttons"><button class="menu-button" data-action="title">Back</button></div>
      </div>`
    );
  }

  showGameOver({ score, isRecord, kills, wave, time, leaves, line, victory, daily, name }) {
    this.showMenu(
      `game-over ${victory ? 'victory' : ''}`,
      `
      <h1>${victory ? 'Victory!' : 'Game Over'}</h1>
      <p>${isRecord ? 'New best score' : 'Score'}: ${score}${daily ? ' <small>📅 Daily Brew</small>' : ''}</p>
      <p class="stats">Reached wave ${wave} · ${kills} bees defeated · ${Math.floor(time)}s</p>
      <p class="leaves">+${leaves} 🍃 Golden Leaves (${meta.leaves} total)</p>
      <p class="line">“${line}”</p>
      <form class="submit-score">
        <input id="player-name" maxlength="16" placeholder="Your name" value="${escapeHtml(name)}" autocomplete="nickname" />
        <button class="menu-button" type="submit">🏆 Submit score</button>
      </form>
      <div class="board-slot"></div>
      <div class="menu-buttons">
        <button class="menu-button primary" data-action="start">↻ Play again</button>
        <button class="menu-button" data-action="pantry">🍃 Pantry</button>
        <button class="menu-button" data-action="title">⌂ Title</button>
      </div>
      <p class="prompt">or press Space</p>`
    );
  }

  /** Shows the result of a score submission and the board on the game-over screen. */
  showSubmitted(message, scores, rank) {
    const form = this.menu.querySelector('.submit-score');
    if (form) form.innerHTML = `<p class="sub">${message}</p>`;
    const slot = this.menu.querySelector('.board-slot');
    if (slot) slot.innerHTML = this.scoreTable(scores, rank);
  }

  showVictory() {
    this.showMenu(
      'game-over victory',
      `
      <h1>The End</h1>
      <p>Tode, God of Tea, finishes his cup in peace.</p>
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
      bar.style.display = visible ? '' : 'none';
      if (visible) fill.style.width = `${(Math.max(0, enemy.hp) / enemy.maxHp) * 100}%`;
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

function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
