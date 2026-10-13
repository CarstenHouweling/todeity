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

- WASD move (camera-relative), mouse aims, hold LMB to spit, Shift/RMB hop-dash, Space tea splash,
  R/middle mouse fires the ultimate, Q/E/F cast skills (when auto-cast is off), Esc/P pauses, M mutes.
- Waves of bees spawn at the four corners. After each wave: pick 1 of 3 **brews** (power-ups), offered by a tea
  spirit with a line of dialogue. After wave 2 you pick an **ultimate**; after waves 3, 7, 11 and 15 a **skill**
  (or a skill upgrade). Boss every 5th wave (Queen Buzzbelle, cinematic entrance, rage phases), final boss
  **Empress Buzzbelle at wave 20**, then a victory screen with an optional endless mode. Elite bees from wave 6.
- **Skills auto-cast** by default (the owner mostly runs, aims and shoots); the pause menu switches to manual.
  The tea splash also auto-casts when bees crowd in.
- **Ascension:** brew levels (+2 per Duo/Legendary, +2 for the ultimate, 1 + level per skill) give "power"; at
  thresholds 3/7/12/18 Tode transforms (Awakened → Golden → Radiant → God of Tea) with a cut-scene, and **the world
  transforms with him** (blossoms → lanterns and petals → crystals and floating islands → a marble heaven above the
  clouds).
- **Feel:** slow-motion finishers on the last bee of a wave and bosses, hit-stop, kill-combo callouts with a score
  bonus. The spit evolves with each ascension tier (+6% damage per tier).
- **First impressions:** the title camera orbits a Golden Tode; the first run starts with a skippable story
  cut-scene (`meta.seenStory`). 📸 / C saves a watermarked screenshot.
- **Phones:** touch controls (floating joystick, dash/splash/ultimate buttons) with auto-aim and auto-fire; skills
  always auto-cast. Quality adapts to the frame rate (pixel ratio 0.6–1.5, shadows off as a last resort).
- **Meta progression:** each run earns Golden Leaves for permanent upgrades in Tode's Pantry (title screen),
  and Tode says a story line after each run. **Leaderboard** (all-time and a seeded **Daily Brew**) via
  `game/server`. Saved in `localStorage`: `tode-meta`, `tode-best-score`, `tode-sound`, `tode-settings`, `tode-name`.

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
- **Limits.** Browsers pause background tabs, so the host must keep the game visible. No joining a run that has
  started. Knockback from a guest's skills (tornado pull, tongue) only shows on their own screen.

## Code map (`game/src`)

| File | Responsibility |
| --- | --- |
| `main.js` | Game loop, state machine (phases), collisions, enemy AI (chasers, stingers, bosses), abilities, brew effects, waves, menus wiring, dev debug handle. The `ctx` object passes hooks to the modules below. |
| `components/Player.js` | Tode: movement with acceleration and hop animation, dash charges, shield, revive, gauge, `BASE_STATS` (every stat a brew can change lives here). |
| `components/Enemy.js` | Bee types (`ENEMY_TYPES`: drone, zipper, brute, stinger, queen, empress), statuses (burn, chill/freeze), hit flash, death animation, boss crown. |
| `components/PowerUps.js` | Brews: `BLENDS`, regular brews with rarity values, `DUOS`, `LEGENDARIES`, `rollBrews()` offer logic. |
| `components/Ultimates.js` | Steeping Beam, Thunder Tea Storm, Grand Teapot Drop. |
| `components/Skills.js` | Learnable skills (`SKILLS`) and the `SkillBook` (slots, cooldowns, auto-cast targeting, manual Q/E/F). |
| `components/Spirits.js` | The tea spirits and their dialogue (greetings, Legendary lines, Duo exchanges). |
| `components/Divinity.js` | World transformation per ascension tier (variant trees/rocks, lanterns, petals, crystals, islands, heaven). |
| `components/Random.js` | Seeded randomness for the Daily Brew (`seeded(fn)` swaps `Math.random` only inside `fn`). |
| `components/Leaderboard.js` | Client for the leaderboard API; fails quietly without a server. |
| `components/Net.js`, `components/RemoteTode.js` | Co-op networking and teammate puppets (see Co-op above). |
| `components/Ascension.js` | Transformation tiers and visuals (aura shader, crest, shards, halo, rune circle) and post-processing targets per tier. |
| `components/Effects.js` | Short-lived effects: lightning bolts (camera-facing ribbons), strikes with warning rings, rings, burning pools, blasts, chain lightning. |
| `components/Weather.js` | Time of day per wave, weather (clear, Tea Rain, Gale, Thunderstorm) with gameplay modifiers, rain/leaves/fireflies. |
| `components/Waves.js` | Wave composition and difficulty scaling (`waveConfig`, `FINAL_WAVE`). |
| `components/Meta.js` | Pantry upgrades, Golden Leaves, story lines. |
| `components/Music.js` | Procedural soundtrack (garden / battle / boss songs, intensity layers 0–4). |
| `components/Sound.js` | Web Audio setup, separate music/SFX channels, synthesized sound effects (`play(name)`). |
| `components/PostFX.js` | EffectComposer: bloom, reality-warp/chromatic-aberration/vignette/flash shader. |
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
- Bees steer around obstacles (`moveEnemy` tries rotated directions). Overlap is only blocked when it gets worse,
  so stuck characters can always separate.
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
game.settings.autoCast = false
game.autoPause = false    // stop auto-pausing on window blur (needed for background test tabs)
const bot = game.makeBot(); bot.run(300)  // autoplay 300 s and get a log of waves, picks and death
```

Tip for AI agents with an embedded browser: a hidden browser pane pauses `requestAnimationFrame`, so drive the game
with `game.step()` and take a screenshot to see the result.

Balance reference (Oct 14): the bot (perfect aim, random picks, dodges stingers but not telegraphed strikes) dies
at the wave-5 or wave-10 Queen in most runs, sometimes reaches wave 13+, and wins now and then. Runs take about
6–8 minutes. See `SUBMISSION.md` for the contest post kit.

## Ideas / roadmap

- Deploy to Azure (see above), record a gameplay video for the submission post.
- More variety: more bee types, more brews, keepsakes, a second arena or biome, room/door choices like Hades.
- The music mix has not been checked by ear; volumes in `Music.js`/`Sound.js` may need tuning.

## Credits

- `tode.glb`: from the JetBrains Academy course.
- `enemy.glb`: "Armabee Evolved" by Quaternius, [CC0](https://creativecommons.org/publicdomain/zero/1.0/), via [Poly Pizza](https://poly.pizza/m/GcttdvsqsQ).
- `small_house.glb`: "Small House" by Jarlan Perez, [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/), via [Poly Pizza](https://poly.pizza/m/053kskrV4U_).
- Everything else (scenery, effects, music, sound) is generated in code.
