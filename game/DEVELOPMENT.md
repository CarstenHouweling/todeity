# Todeity: Rise of the Tea God — development notes

Handoff document for anyone (human or AI agent) continuing this project. Read this first.

## What this is

A 3D browser roguelite built with Three.js + Vite. It started as the game from the JetBrains Academy course
"Build a Game with an AI Coding Agent" (Tode the Frog defends his garden from bees) and is being extended for the
**JetBrains Academy Build Your Game Challenge**.

- Course checks are already completed (certificate obtained). The course specs in `../Skeleton`, `../Core_loop`
  etc. describe the original game; the current game intentionally goes far beyond them.
- Challenge timeline: submissions + community voting **Oct 19 10:00 CEST – Oct 23 11:00 CEST (2026)**, winners
  announced Oct 28. Two prizes come from community 👍 votes, five from a jury (creativity, originality, gameplay,
  player experience).
- **Content rules:** no third-party trademarks or logos, no recognizable fictional characters, no memes, no
  commercially released music or recordings. Inspiration (e.g. a Dragon Ball-like golden aura, a Hades-like boon
  system) is fine, but never use their names. All audio is synthesized in code and all scenery is procedural
  partly for this reason.

## Running

```bash
cd game
npm install    # only needed when game/node_modules is missing; the course setup may resolve from ../node_modules
npm run dev    # the game on http://localhost:5173 (or the port Vite prints)
npm run server # the leaderboard API on http://localhost:8787 (Vite proxies /api to it during development)
npm run build  # production build into game/dist
npm start      # production: serves game/dist and the API from one Node process (PORT env, default 8787)
```

The game works without the server; the leaderboard then just says it isn't reachable.

### Deploying to Azure App Service

`game/server/server.js` serves the built game, the leaderboard API and the co-op relay from one Node process (its
only dependency is `ws`). With the Azure CLI (`az login` first), from the `game/` folder:

```bash
npm install && npm run build
az webapp up --name todeity-<something-unique> --runtime "NODE:20-lts" --sku B1 --location westeurope
az webapp config set --name todeity-<something-unique> --resource-group <the group az webapp up printed> \
  --startup-file "npm start" --web-sockets-enabled true
az webapp config appsettings set --name todeity-<something-unique> --resource-group <group> \
  --settings DATA_DIR=/home/data
```

- **Web sockets must be enabled** for co-op. `DATA_DIR=/home/data` keeps scores across restarts and redeploys.
- App Service sets `PORT` itself. B1 is the cheapest tier that keeps the app awake (Free/F1 sleeps, which drops
  co-op rooms). Redeploy after changes with the same `az webapp up` command.
- The game also works from any static host (just `dist/`), without the leaderboard and co-op.

Scores are stored as JSON (`scores.json`, top 100 all-time + 14 days of daily boards). The server rate-limits
submissions per IP and rejects implausible scores; it trusts `X-Forwarded-For`, so it is not cheat-proof.

## Gameplay summary

- WASD move (camera-relative), mouse aims, hold LMB to spit, Shift/RMB hop-dash, Space tea bomb,
  R/middle mouse fires the ultimate, Q/E/F cast skills (when auto-cast is off), Esc/P pauses, M mutes.
- Waves of bees spawn at the four corners. After each wave: pick 1 of 3 **brews** (power-ups), offered by a tea
  spirit with a line of dialogue. After wave 2 you pick an **ultimate**; after waves 3, 7, 11 and 15 a **skill**
  (or a skill upgrade). Every arena has its boss (cinematic entrance, rage phases, bullet patterns): Queen
  Buzzbelle (5), the Hornet Shogun (10), the Seraph Queen (15), **Empress Buzzbelle (20)**, then the ground gives
  way and the true finale is **Bee-zebub in the Underworld (21)**, then a victory screen with an optional
  endless mode. Elite bees from wave 6.
- **Roguelite bullet hell:** ranged bees shoot harder patterns per arena (`STINGER_PATTERNS`: single shots → fans
  → wide fans → fans plus rings → fast fans), and bosses mix fans, aimed volleys, slow dense rings (`halo`), two-
  and four-armed spirals (`spiral`/`cross`), charges and summons (`ATTACKS` in `startQueenAttack`). Enemy bullets
  are an instanced field (`components/Bullets.js`), hit on a forgiving core, and tea bombs cancel them. The swarm
  cap grows by 6 per arena.
- **Experience (Megabonk / Risk of Rain style):** kills drop tea-leaf orbs (`components/Leaves.js`) that fly to
  Tode within his magnet range; each level offers a quick pick of 3 **infusions** (`components/Infusions.js`,
  stacking upgrades such as damage, fire rate, crit chance, magnet, extra bomb charges, extra spit) in a
  non-blocking panel (keys 1–3 or click; solo slows time to 30% while it's open; auto-picks after 10 s).
  **Critical hits** (5% base) deal double damage with gold numbers. Every player gathers their own leaves in co-op.
- **Arenas** (`components/Arenas.js`): a new playing field every 5 waves: Tode's Garden (1–5), Sage Mountain
  (6–10), Sky Citadel (11–15), Tournament of the Gods (16–20), The Underworld (21+). Each has its own ground,
  props/obstacles, corner spawners, sky dome, lighting palette, particles and post-processing boost, and is built
  at a higher **graphics level** (see below). Between arenas a `travel` cut-scene plays (leap through a flash, a
  swoop over the new arena that shows off its sky, a landing shockwave); into the Underworld Tode *falls*.
- **Skills auto-cast** by default (the owner mostly runs, aims and shoots); the pause menu switches to manual.
  The tea bomb also auto-casts at the thickest crowd in range.
- **Tea bomb** (Space; replaced the tea splash): lobs a boiling kettle bomb at the aim (up to 430 away); it explodes
  into a splash (radius 100, 8 damage, knockback, stingers cancelled) and keeps all the old splash brews (burn,
  chill, lightning, lava pool). 2 charges, 2.2 s each. **Hop dash**
  (~175 units, 1 s recharge) passes through bees, hurting and bumping them (2 damage base), and leaves Tode
  safe for 0.25 s after landing.
- **Ascension:** brew levels (+2 per Duo/Legendary, +2 for the ultimate, 1 + level per skill) give "power"; at
  thresholds 3/7/12/18 Tode transforms (Awakened → Golden → Radiant → God of Tea) with a cut-scene, and **the world
  transforms with him** (blossoms → lanterns and petals → crystals and floating islands → a marble heaven above the
  clouds).
- **Feel:** slow-motion finishers on the last bee of a wave and bosses, hit-stop, kill-combo callouts with a score
  bonus. The spit evolves with each ascension tier (+6% damage per tier).
- **First impressions:** the title camera orbits a Golden Tode; the first run starts with a skippable story
  cut-scene (`meta.seenStory`). 📸 / C saves a watermarked screenshot.
- **Finale:** the Empress (wave 20) has a Royal Spiral attack. Bee-zebub (wave 21, horns and a fire aura) adds
  Brimstone Rings (walls of fire spreading from him: only a hop-dash gets you through), chasing Hellfire Pillars,
  hellfire rain and an Infernal Spiral, with two rage phases where he grows. Beating him plays the ending
  cut-scene back home in the garden, and credits.
- **Beam clash** (solo): when the Empress or Bee-zebub hits a rage phase they fire a beam at Tode, he answers, and
  the player mashes Space/click/tap to push the clash point back (`CLASH` in main.js). Winning deals 10% of the
  boss's health and **shatters reality** (`postfx.shatter()`: the screen cracks into shifted shards with an
  inverted flash); losing costs a heart.
- **Ultimates:** Steeping Beam, Thunder Tea Storm, Grand Teapot Drop and **Summoning: Great Tode** (a summoning
  seal, then a giant toad that stomps, tongue-lashes the thickest crowds three times and body-slams).
- **Achievements** (`components/Achievements.js`): 16, each worth 15 Golden Leaves, shown in the Pantry.
  First-run **tips** appear once each (`meta.tips`).
- **Phones:** touch controls (floating joystick, dash/splash/ultimate buttons) with auto-aim and auto-fire; skills
  always auto-cast. Quality adapts to the frame rate (pixel ratio 0.6–1.5, shadows off as a last resort).
- **Meta progression:** each run earns Golden Leaves for permanent upgrades in Tode's Pantry (title screen),
  and Tode says a story line after each run. **Leaderboard** (all-time and a seeded **Daily Brew**) via
  `game/server`. Saved in `localStorage`: `tode-meta`, `tode-best-score`, `tode-sound`, `tode-settings`, `tode-name`.

## Graphics levels

The garden keeps the original low-poly look; every new arena raises the graphics level (`GFX_LEVELS` in
`components/Graphics.js`, applied by `setArena()` in main.js during the travel flash):

- **Props:** `setDetail(level)` in `Environment.js` makes `part()` rebuild primitives with more segments, smooth
  shading (shared vertices) and coherent wobble instead of spiky jitter, using `surface()` (a smooth material).
  Arenas call `setDetail` around their build; the garden is always built at 0.
- **Characters:** Tode (`Player.setGraphics`) and bees (`setEnemyGraphics`) get smooth normals that ignore UV
  seams (`smoothGeometry`) and `MeshPhysicalMaterial` with clearcoat, sheen and later iridescence, plus a soft
  studio reflection map (`RoomEnvironment`). Only characters get that map: as `scene.environment` it lit big floors
  past the bloom threshold and hazed the screen.
- **Renderer:** ACES filmic tone mapping from level 1. Arena palettes keep their lights low and set `exposure`
  instead, because bloom (threshold 0.93) runs *before* exposure/tone mapping: bright lit floors would bloom.
- **Safety:** PostFX first runs a sanitize pass (NaN/Inf → black, values capped at 6) so a bad pixel can't become
  a flickering black box and a pile of additive particles can't haze the screen. Arena particles (`motes`) use a
  shader that caps point size and fades points near the camera.

## Co-op multiplayer (2–4 players)

Title screen → 👥 Co-op → create a room (4-letter code) or join one; the host starts the run. Needs the server
(`npm run server` in development; the Vite dev server proxies `/ws`).

- **Authority split.** The host's browser runs the bees, waves, bosses and weather and sends snapshots (15/s).
  Every player runs their *own* Tode locally (movement, abilities, damage) and streams its state (20/s).
  Guests forward their hits (`k: 'hit'`) and statuses (`k: 'st'`) to the host, which applies them.
- **Replication by events.** Spits, splashes, skills and ultimates are sent as events and replayed on the other
  screens as visuals only (`remoteCtx()` in main.js gives a context whose damage hooks do nothing). Shared hazards
  (stingers, storm strikes, boss rain, explosions) are simulated by everyone, each checking hits on their own Tode.
- **Flow.** After a wave each player picks their own rewards; the host waits until everyone is ready (or 40 s).
  A fallen Tode is *downed*: it spectates a teammate and gets back up at the next wave. The run ends when everyone
  is down. The garden grows (25 → 31 → 35 → 41 tiles), bees get more numerous and tougher per extra player, and
  bigger maps get extra spawn points on the edges.
- **Code.** `components/Net.js` (WebSocket client, batched messages), `components/RemoteTode.js` (teammate
  puppets with their own ascension visuals and name tags), the "Co-op" section in `main.js` (snapshots, mirrors,
  message handling, lobby), and the relay in `server/server.js`.
- **Arenas** follow the wave number, so every screen travels on its own when the host's `wave` message arrives
  (the host sends it before its own travel). Brimstone Rings are events (`k: 'fring'`), simulated by everyone.
- **Limits.** Browsers pause background tabs, so the host must keep the game visible. No joining a run that has
  started. Knockback from a guest's skills (tornado pull, tongue) only shows on their own screen.

## Code map (`game/src`)

| File | Responsibility |
| --- | --- |
| `main.js` | Game loop, state machine (phases, incl. `travel` between arenas and the boss `clash`), collisions, enemy AI (chasers, stingers, bosses, Bee-zebub's hellfire), abilities, brew effects, waves, arenas (`setArena`, `prepareArena`), menus wiring, dev debug handle. The `ctx` object passes hooks to the modules below. |
| `components/Player.js` | Tode: movement with acceleration and hop animation, dash charges, shield, revive, gauge, `BASE_STATS` (every stat a brew can change lives here). |
| `components/Enemy.js` | Bee types (`ENEMY_TYPES`: drone, zipper, brute, stinger, queen, shogun, seraph, empress, beezebub), statuses (burn, chill/freeze), hit flash, death animation, glTF or procedural model. |
| `components/BeeModels.js` | Procedural bee species per arena and boss regalia, with their flight animation. |
| `components/Bullets.js` | Instanced enemy bullets (spawn, update with a hit callback, cancel in a radius). |
| `components/Leaves.js`, `components/Infusions.js` | Tea-leaf experience orbs; level-up infusions and the level curve. |
| `components/PowerUps.js` | Brews: `BLENDS`, regular brews with rarity values, `DUOS`, `LEGENDARIES`, `rollBrews()` offer logic. |
| `components/Ultimates.js` | Steeping Beam, Thunder Tea Storm, Grand Teapot Drop, Summoning: Great Tode. |
| `components/Skills.js` | Learnable skills (`SKILLS`) and the `SkillBook` (slots, cooldowns, auto-cast targeting, manual Q/E/F). |
| `components/Spirits.js` | The tea spirits and their dialogue (greetings, Legendary lines, Duo exchanges). |
| `components/Divinity.js` | World transformation per ascension tier (variant trees/rocks, lanterns, petals, crystals, islands, heaven). |
| `components/Random.js` | Seeded randomness for the Daily Brew (`seeded(fn)` swaps `Math.random` only inside `fn`). |
| `components/Leaderboard.js` | Client for the leaderboard API; fails quietly without a server. |
| `components/Net.js`, `components/RemoteTode.js` | Co-op networking and teammate puppets (see Co-op above). |
| `components/TouchControls.js` | Joystick and buttons for touch devices. |
| `components/Achievements.js` | Achievement list and unlocking (rewards Golden Leaves). |
| `components/Arenas.js` | The arenas after the garden: builders, sky dome / portal / lava shaders, `motes` particles, `arenaForWave`. |
| `components/Graphics.js` | Graphics levels: tone mapping, character reflection map, `smoothGeometry`, `upgradeMaterial`. |
| `components/Ascension.js` | Transformation tiers and visuals (aura shader, crest, shards, halo, rune circle) and post-processing targets per tier. |
| `components/Effects.js` | Short-lived effects: lightning bolts (camera-facing ribbons), strikes with warning rings, rings, burning pools, blasts, chain lightning. |
| `components/Weather.js` | Time of day per wave, weather (clear, Tea Rain, Gale, Thunderstorm) with gameplay modifiers, rain/leaves/fireflies. |
| `components/Waves.js` | Wave composition and difficulty scaling (`waveConfig`, `FINAL_WAVE` = the Empress, `HELL_WAVE` = Bee-zebub). |
| `components/Meta.js` | Pantry upgrades, Golden Leaves, story lines. |
| `components/Music.js` | Procedural soundtrack (garden / battle / boss songs, intensity layers 0–4). |
| `components/Sound.js` | Web Audio setup, separate music/SFX channels, synthesized sound effects (`play(name)`). |
| `components/PostFX.js` | EffectComposer: sanitize pass, bloom, reality-warp/aberration/vignette/flash/shatter shader. `update()` eases effects every frame, `render()` draws. |
| `components/Hud.js` | All DOM UI: HUD, ability bar, damage numbers, cards, title, pause, Pantry, game over, victory. Menu buttons use `data-action` and call `hud.onAction`. |
| `components/Environment.js` | Procedural garden: fence, beehives, pond, tea table, trees, rocks, flowers, pollen, butterflies. Returns circle obstacles. |
| `components/Map.js` | Lawn (canvas texture with mowing pattern and path) + meadow; `MAP_HALF_SIZE`, `isInsideMap`. |
| `components/House.js`, `Camera.js`, `Renderer.js`, `Input.js`, `Particles.js`, `Projectile.js`, `collision.js` | As named. |
| `dev/bot.js` | Dev-only autoplayer for balance testing. |
| `../server/server.js` | Node server: static hosting of `dist/` + `/api/scores` leaderboard (+ future multiplayer relay). |
| `style.css` | All UI styling. |

## Conventions and gotchas

- **The world is Z-up.** glTF models are Y-up, so they get `rotation.x = Math.PI / 2`; procedural props are
  modelled Y-up and turned with `model()` in `Environment.js`. Facing: `model.rotation.y = atan2(dx, -dy)`.
- The camera is a child of the player group at offset `(300, -300, 300)`. WASD is camera-relative:
  screen-right = `(1, 1, 0)`, screen-up = `(-1, 1, 0)`.
- **Every damage source goes through `damageEnemy()`** in `main.js`, so kills, score, the ultimate gauge, Hailstorm's
  double damage and the damage multiplier stay consistent. Lightning should also call `lightningHit()`.
- Effects may spawn other effects during `update()`; `Effects.update` handles that, so keep using `effects.addEffect`.
- **Nothing in an arena blocks movement or shots** except the map edge and Tode's house: bees fly over trees,
  rocks and ponds, shots fly over everything, and Tode walks through props, which fade (`updatePropFade`) when
  he is near or between them and the camera (meshes made with `single()` are tagged `userData.prop`).
  Obstacles still exist for scattering decoration. Bees only avoid each other (overlap is only blocked when it
  gets worse, so they always separate).
- **Zones:** each arena's centrepiece is a zone (`zone` on its obstacle): water (the pond, oil spring, fountain)
  slows Tode to a swim, the Tournament's rift speeds him up, the Underworld's lava pool burns.
- **Bee models:** the garden uses the glTF bee, whose 7 parts are merged into one skinned mesh at load
  (`mergeBeeParts` in `Enemy.js`); `Enemy.dispose()` frees each bee's skeleton (its bone texture). Every other
  arena has its own procedural species (`components/BeeModels.js`: ronin hornets, seraph bees, void wasps,
  demon hornets, plus regalia for each boss) with flapping wings, a swaying abdomen and a tumbling death,
  smoother each arena. Geometry is cached per kind and arena and marked `userData.shared`/`keepGeometry` so
  dispose leaves it alone. Their hitboxes match the glTF bee (`HITBOX_PER_SCALE`), so balance doesn't change. The HUD runs every frame, so it only writes to the DOM when a value changed
  (`setText`/`setStyle` in `Hud.js`). Adaptive resolution won't climb back to a ratio that proved too slow.
- Constants for tuning sit at the top of each file (`main.js`, `Player.js` `BASE_STATS`, `Enemy.js`
  `ENEMY_TYPES`, `Waves.js`).
- `AGENTS.md` (repo root) was written for the course: don't look for or run the course's Jest tests.

## Testing and debugging

There are no automated tests for the game. Verify changes by running it in a browser.

While `npm run dev` runs, `window.game` exposes helpers in the browser console (stripped from production builds):

```js
game.step(5)              // advance 5 s of game time without requestAnimationFrame
game.startWave(20)        // jump to a wave
game.spawn('queen', 0, 150), game.killAll(), game.skipSpawns()
game.give('eye')          // grant a brew by id (also Duo/Legendary)
game.ultimate('teapot')   // own an ultimate with a full gauge
game.setTier(4)           // jump to an ascension tier
game.setWeather('night', 'storm')
game.learn('comet')       // learn (or level up) a skill
game.hurt(99)             // hurt Tode (test downed / game over)
game.coop                 // co-op state (remotes, host flag)
game.renderer.info        // draw calls, triangles, GPU textures/geometries (watch for leaks)
game.setArena('hell')     // show an arena right away; game.startWave(21) travels there instead
game.arena                // the current arena id
game.ultimate('summon')   // then press R for the Great Tode
game.bullets.list         // enemy bullets in flight
game.level, game.infusion, game.chooseInfusion(0)
game.settings.autoCast = false
game.autoPause = false    // stop auto-pausing on window blur (needed for background test tabs)
const bot = game.makeBot(); bot.run(300)  // autoplay 300 s and get a log of waves, picks and death
```

Tip for AI agents with an embedded browser: a hidden browser pane pauses `requestAnimationFrame`, so drive the game
with `game.step()` and take a screenshot to see the result. `step()` renders only its last frame; CSS animations
(banners) run on real time, so a screenshot right after a long step can still show them.

Balance reference (Oct 13, after infusions and the tea bomb): the bot (perfect aim, random picks, dodges bullets
but not telegraphed strikes) died at waves 10 and 20 and beat Bee-zebub once in three runs, at level ~18–19.
Runs take about 7 minutes. Humans will find the bullet patterns harder than the bot does. See `SUBMISSION.md` for the contest post kit.

## Ideas / roadmap

- Deploy to Azure (see above), record a gameplay video for the submission post.
- More variety: new bee behaviours per arena (not only looks), more brews, keepsakes, room/door choices like Hades,
  chests or shrines during waves (Risk of Rain).
- Arenas are only seen from the gameplay camera's steep angle (sky domes show in the travel cut-scenes); a giant
  landmark per arena placed toward the camera's view (-x, +y) is what reads best in play.
- The Divinity world transformations (blossoms, lanterns, heaven) only apply in the garden.
- The music mix has not been checked by ear; volumes in `Music.js`/`Sound.js` may need tuning.

## Credits

- `tode.glb`: from the JetBrains Academy course.
- `enemy.glb`: "Armabee Evolved" by Quaternius, [CC0](https://creativecommons.org/publicdomain/zero/1.0/), via [Poly Pizza](https://poly.pizza/m/GcttdvsqsQ).
- `small_house.glb`: "Small House" by Jarlan Perez, [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/), via [Poly Pizza](https://poly.pizza/m/053kskrV4U_).
- Everything else (scenery, effects, music, sound) is generated in code.
