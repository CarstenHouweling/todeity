import * as THREE from 'three';
import { BLENDS, RARITIES, describe } from './PowerUps.js';
import { ULTIMATES } from './Ultimates.js';
import { PANTRY, meta, nextCost, pantryLevel } from './Meta.js';

const ABILITIES = [
  { id: 'spit', key: 'LMB', name: 'Spit', icon: '💧' },
  { id: 'dash', key: 'Shift', name: 'Hop dash', icon: '💨' },
  { id: 'splash', key: 'Space', name: 'Tea splash', icon: '🍵' },
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
    this.boss = element('boss-bar', this.top);
    this.bossName = element('boss-name', this.boss);
    this.bossFill = element('boss-fill', element('boss-track', this.boss));
    this.boss.hidden = true;

    this.banner = element('banner', this.root);

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

    this.owned = element('owned', this.root);

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
      if (target) this.onAction(target.dataset.action, target.dataset);
      else if (this.menuClickAction) this.onAction(this.menuClickAction);
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
    const bar = element('health-bar', this.worldLayer);
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
        <div class="controls">
          <span><b>WASD</b> move</span>
          <span><b>Mouse</b> aim</span>
          <span><b>Hold LMB</b> spit</span>
          <span><b>Shift / RMB</b> hop dash</span>
          <span><b>Space</b> tea splash</span>
          <span><b>R</b> ultimate</span>
          <span><b>Esc</b> pause</span>
        </div>
        ${best ? `<p class="best">Best score: ${best}${meta.victories ? ` · 👑 ${meta.victories} victor${meta.victories > 1 ? 'ies' : 'y'}` : ''}</p>` : ''}
        <div class="menu-buttons">
          <button class="menu-button primary" data-action="start">▶ Start run</button>
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
        <div class="menu-buttons"><button class="menu-button" data-action="title">Back</button></div>
      </div>`
    );
  }

  card({ action, index, brew, rarity, level, text }) {
    const blends = brew.blends ?? (brew.blend ? [brew.blend] : []);
    const colors = blends.map((id) => BLENDS[id].color);
    const first = colors[0] ?? '#ffc93c';
    const second = colors[1] ?? first;
    const kind = brew.kind ?? 'ultimate';
    const tag =
      kind === 'duo' ? 'Duo' : kind === 'legendary' ? 'Legendary' : kind === 'ultimate' ? 'Ultimate' : RARITIES[rarity].name;
    const rarityClass = kind === 'brew' ? `rarity-${RARITIES[rarity].id}` : `kind-${kind}`;
    const label = brew.blends ? blends.map(blendLabel).join(' × ') : brew.blend ? blendLabel(brew.blend) : '✨ Ultimate';
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

  showBrews(wave, offers, rerolls) {
    const cards = offers
      .map((offer, index) => this.card({ action: 'brew', index, ...offer, text: describe(offer) }))
      .join('');
    const reroll = rerolls > 0 ? `<button class="menu-button" data-action="reroll">🔄 Reroll (${rerolls})</button>` : '';
    this.showMenu(
      'powerups',
      `<h2>Wave ${wave} cleared!</h2><p class="sub">Choose a brew</p><div class="cards">${cards}</div><div class="menu-buttons">${reroll}</div>`
    );
  }

  showUltimates() {
    const cards = Object.values(ULTIMATES)
      .map((ultimate, index) => this.card({ action: 'ultimate', index, brew: ultimate, text: ultimate.text }))
      .join('');
    this.showMenu(
      'powerups ultimates',
      `<h2>Awaken your ultimate</h2><p class="sub">Charged by battle · unleash it with <b>R</b></p><div class="cards">${cards}</div>`
    );
  }

  showPause({ build, ultimate, form, sound }) {
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
        <h2>Paused</h2>
        <p class="sub">${form}</p>
        ${ult}
        <div class="build">${brews}</div>
        <div class="menu-buttons">
          <button class="menu-button primary" data-action="resume">▶ Resume</button>
          <button class="menu-button" data-action="toggle-music">🎵 Music: ${sound.music ? 'on' : 'off'}</button>
          <button class="menu-button" data-action="toggle-sfx">🔊 Effects: ${sound.sfx ? 'on' : 'off'}</button>
          <button class="menu-button" data-action="restart">↻ Restart run</button>
          <button class="menu-button" data-action="title">⌂ Quit to title</button>
        </div>
      </div>`
    );
  }

  showGameOver({ score, isRecord, kills, wave, time, leaves, line, victory }) {
    this.showMenu(
      `game-over ${victory ? 'victory' : ''}`,
      `
      <h1>${victory ? 'Victory!' : 'Game Over'}</h1>
      <p>${isRecord ? 'New best score' : 'Score'}: ${score}</p>
      <p class="stats">Reached wave ${wave} · ${kills} bees defeated · ${Math.floor(time)}s</p>
      <p class="leaves">+${leaves} 🍃 Golden Leaves (${meta.leaves} total)</p>
      <p class="line">“${line}”</p>
      <div class="menu-buttons">
        <button class="menu-button primary" data-action="start">↻ Play again</button>
        <button class="menu-button" data-action="pantry">🍃 Pantry</button>
        <button class="menu-button" data-action="title">⌂ Title</button>
      </div>
      <p class="prompt">or press Space</p>`
    );
  }

  showVictory() {
    this.showMenu(
      'game-over victory',
      `
      <h1>Victory!</h1>
      <p>The Empress is defeated and the garden is quiet.</p>
      <p class="line">“Tode finally finishes his tea. It is, at last, perfectly steeped. ☕”</p>
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
      const visible = !enemy.dying && enemy.hp < enemy.maxHp && this.place(bar, enemy.position, enemy.height + 8);
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
