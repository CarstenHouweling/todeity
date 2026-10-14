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
az webapp up --name todeity-<something-unique> --runtime "NODE:24-lts" --sku B1 --location westeurope
az webapp config set --name todeity-<something-unique> --resource-group <the group az webapp up printed> \
  --startup-file "npm start" --web-sockets-enabled true
az webapp config appsettings set --name todeity-<something-unique> --resource-group <group> \
  --settings DATA_DIR=/home/data
```

- **Web sockets must be enabled** for co-op (Linux apps always have them on; the portal hides the toggle there). `DATA_DIR=/home/data` keeps scores across restarts and redeploys.
- App Service sets `PORT` itself. B1 is the cheapest tier that keeps the app awake (Free/F1 sleeps, which drops
  co-op rooms). Redeploy after changes with the same `az webapp up` command.
- The game also works from any static host (just `dist/`), without the leaderboard and co-op.

Scores are stored as JSON (`scores.json`, top 100 all-time + 14 days of daily boards). The server rate-limits
submissions per IP and rejects implausible scores; it trusts `X-Forwarded-For`, so it is not cheat-proof.

## Gameplay summary

- WASD move (camera-relative), mouse aims, hold LMB to spit, Shift/RMB hop-dash, Space tea bomb,
  R/middle mouse fires the ultimate, Q/E/F cast skills (when auto-cast is off), Esc/P pauses, M mutes.
- Waves of bees spawn at the four corners. After each wave: pick 1 of 3 **brews** (power-ups), offered by a tea
  spirit with a line of dialogue. After the first boss (wave 5) you pick an **ultimate**. **Skills** come from
  levelling up (see Experience). Every arena has its boss (cinematic entrance, rage phases, bullet patterns): Queen
  Buzzbelle (5), the Hornet Shogun (10), the Seraph Queen (15), **Empress Buzzbelle (20)**, then the ground gives
  way and the true finale is **Bee-zebub in the Underworld (21)**, then a victory screen with an optional
  endless mode. Elite bees from wave 6.
- **Roguelite bullet hell:** ranged bees shoot harder patterns per arena (`STINGER_PATTERNS`: single shots → fans
  → wide fans → fans plus rings → fast fans), and bosses mix fans, aimed volleys, slow dense rings (`halo`), two-
  and four-armed spirals (`spiral`/`cross`), charges and summons (`ATTACKS` in `startQueenAttack`). Enemy bullets
  are an instanced field (`components/Bullets.js`), hit on a forgiving core, and tea bombs cancel them. The swarm
  cap grows by 6 per arena.
- **Chaos:** bee health and numbers grow steeply (`waveConfig`). From wave 4 waves may get **modifiers**
  (`MODIFIERS` in `Waves.js`: Frenzy, Horde, Elite Surge, Meteor Shower, Vengeful Swarm, Armoured; two at once
  from wave 14), shown under the weather. Each arena past the garden has a **hazard** from its second wave on
  (`HAZARDS` in main.js: falling boulders, holy lightning, meteors, brimstone; `effects.meteor()`), and from wave 6
  coordinated **squads** appear (`spawnSquad`: an encirclement, a phalanx marching across, a firing squad of
  stingers that volley together).
- **Experience:** kills drop tea-leaf orbs (`components/Leaves.js`) that fly to Tode within his magnet range;
  every level is a pick of 3 **skills**, new ones or upgrades (14 skills, up to 6 slots, level 5 each). Solo, the
  game pauses for the pick (`openLevelUp`, back to the fight afterwards, possibly via a mid-wave transformation);
  in co-op the picks wait until the wave is cleared (the bar shows `Lv 7 (+2)`). At most one skill pick between
  waves (`skillPickedThisBreak`); extra levels come up `LEVEL_UP_DELAY` seconds into the next wave, one at a time.
  The curve (`leavesForLevel`) gives about one level per wave (bot: Lv 20 at wave 20). Every player
  gathers their own leaves. **Critical hits** (5%) deal double damage with gold numbers.
- **Side objectives** (`OBJECTIVES` in main.js): when Tode reaches an arena it gets one: smash 3 wild hives
  (garden) or golden hives (Sky Citadel), hives being `nest` structure enemies that keep letting out bees; or hold
  3 shrines (temple bells, reality rifts), circles that fill while a Tode stands in them and draw bees in. The
  arena's last wave doesn't clear until it's done (`gateOpen`): the way on is sealed. Arrows at the screen edge
  point at objectives out of view.
- **Bigger arenas:** every arena is 4 tiles wider than the one before (`arenaTiles`; `setMapTiles` on arrival).
  Builders lay out in garden-sized coordinates and `spread` stretches them; `fillProps` adds more props; bigger
  fields get extra spawn points along the edges.
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
- **Ascension** (`components/Ascension.js`): power (brew levels, +2 per Duo/Legendary, +2 for the ultimate,
  1 + level per skill) crosses 3/10/20/36/54 and Tode transforms with a cut-scene (a quake, stars pouring into him via
  `ascension.charge`, a burst that shatters reality and a pillar of light). Five unique forms (`STAGES`), each built
  from a noise-driven flame aura shell (`auraShell`, tall and spiky enough to read from the gameplay camera),
  spiral ribbons (`swirlRibbons`, energy or `fire`), stars flying into him (`pullStars`, an instanced stream),
  lightning arcs, orbiting sparkles, rising debris, a crest, halo, runes and a galaxy: Awakened (white wind),
  Golden (towering golden flame), Radiant (gold spirals, lightning, debris, stars), God of Tea (crimson flame in a
  vortex of fire, halo, runes), Omnitode (silver-violet, galaxy underfoot, a constant star stream). Additive layers
  stack, so colours stay under the bloom threshold (0.93) or the screen washes out white. In the garden **the world
  transforms with him** (blossoms → lanterns and petals → crystals and floating islands → a marble heaven).
- **Feel:** slow-motion finishers on the last bee of a wave and bosses, hit-stop, kill-combo callouts with a score
  bonus. The spit evolves with each ascension tier (+6% damage per tier).
- **First impressions:** the title camera orbits plain Tode (his forms are a surprise; the ending shows him plain
  again too); the first run starts with a skippable story
  cut-scene (`meta.seenStory`). 📸 / C saves a watermarked screenshot.
- **Finale:** the Empress (wave 20) has a Royal Spiral attack. Bee-zebub (wave 21, horns and a fire aura) adds
  Brimstone Rings (walls of fire spreading from him: only a hop-dash gets you through), chasing Hellfire Pillars,
  hellfire rain and an Infernal Spiral, with two rage phases where he grows. Beating him plays the ending
  cut-scene back home in the garden, and credits.
- **Raid bosses** (`BOSS_SCRIPTS`, `MECHANICS` and the "Raid bosses" / "Boss stages" sections in main.js): every
  boss fights in stages. At each health fraction it roars, attacks 8% faster and starts a mechanic; a **phase lock**
  (`stageFloor`, in `damageEnemy`) keeps its health at the threshold until that stage has begun, so damage can't
  skip stages (except during a ritual, which must be breakable). An **enrage timer** per boss (2:00 to 3:40 of
  fighting, shown under the boss bar) makes it much faster and harder hitting with stinger rain (`ENRAGE`).
  Mechanics:
  - Shields (`startWard`, `startGuardians`, `updateRaid`): the boss is immune (`Enemy.setShield`; `damageEnemy`
    ignores it, `targetable()` hides it from aiming, skills and bombs) until its **Shield Wards** (`ward` bees,
    tethered) are smashed, 3 circles of light are held, or its **Hive Guardians** (`guardian` bees) fall. Guards
    come meanwhile; when the timer (30/40 s) runs out the shield overloads (everyone hit, boss heals 10%). Broken:
    the boss is **staggered** 4 s (×1.5 damage).
  - **Interrupt** (`startInterrupt`, `ritual`): it channels for 8 s; deal 18% of its health (more in co-op) to break
    it (stagger), or it heals 15% and attacks faster for good. A break bar shows under the boss bar.
  - Repeating ones, cast whenever due (`dueMechanic`, `MECHANICS.every`): **Royal Nurses** (`nurse` bees fly to the
    boss and heal it 4%), **Falling Stars** (`soaks`: stand in every circle, or everyone takes 2 and it heals),
    **Judgement** (`marked`: the marked Tode must reach a purple circle in 6.5 s or take 2), **Blade Storm**
    (`bladeStorm`: rotating blades from the boss, telegraphed for 1 s).
  - **Ring of Fire** (`closing`, Bee-zebub): a fire wall closes in to 42% of the arena for the rest of the fight.
  - **Cataclysm** (`CATACLYSM`, Seraph/Empress/Bee-zebub attack): only circles of light are safe (2 hearts).
  Co-op: the host decides; messages `stage`, `say`, `ward`, `wardOff`, `overload`, `cata`, `enrage`, `brk`,
  `brkOff`, `soak`, `soakFail`, `mark`, `markOff`, `blades`, `closing`; snapshot flags 64 (shielded), 128
  (staggered), 256 (enraged). Mechanics that hurt are checked on every screen for its own Tode.
- **Hive tactics** (`TACTICS`, `updateTactics`, host only): from wave 4 chasers may be flankers (`assignFlank`:
  they spiral in from the sides), from wave 7 packs near a Tode lunge together along telegraphed lines
  (`startPounce`/`updatePounce`), from wave 11 stingers fire synchronized volleys (`tactics.volleyIn`), from wave 15
  elites and every other stinger lead their shots (`todeMotion` tracks each Tode's velocity). The Hive Mind vow
  (`tacticsWave()`) brings all of it in from wave 2.
- **Beam clash** (solo): when the Empress or Bee-zebub hits a rage phase they fire a beam at Tode, he answers, and
  the player mashes Space/click/tap to push the clash point back (`CLASH` in main.js). Winning deals 10% of the
  boss's health and **shatters reality** (`postfx.shatter()`: the screen cracks into shifted shards with an
  inverted flash); losing costs a heart.
- **Ultimates** (picked after wave 5, the gauge fills slowly): Steeping Beam (an enormous beam; Tode keeps moving
  at 45% speed and steering it), Thunder Tea Storm and **Summoning: Great Tode** (a summoning seal, then a giant
  toad that stomps, tongue-lashes the thickest crowds three times and body-slams).
- **Achievements** (`components/Achievements.js`): 16, each worth 15 Golden Leaves, shown in the Pantry.
  First-run **tips** appear once each (`meta.tips`).
- **Cursed tiles** ("Forbidden tiles" section in main.js, `CURSED`): from wave 3 every non-boss wave lays out
  2×2-grid tiles (more each wave, rolled away from Tode and the objectives; seeded for the Daily Brew; the host
  shares them in co-op). Stepping on one (not while hop-dashing) calls a ring of bees (`ambush`, the host spawns;
  guests send `ambush`); it re-arms after 9 s.
- **Difficulty curve** (`waveConfig`): past wave 10 swarms grow quadratically and more of them are stingers; from
  wave 16 bees hit for an extra heart; hazards fall in growing numbers (up to 8 at once) and from wave 13 **bullet
  curtains** (`bulletCurtain`: a wall of stingers sweeping across with a gap near a Tode) come more and more often.
  **Endless** (waves past 21): bees +10% health per wave, always 2–3 modifiers, every boss in turn (`ENDLESS_BOSSES`),
  +1 contact damage every 10 waves.
- **Co-op objectives:** a circle (arena objective or a boss's circles of light) only fills while every standing
  frog is in it (`circleHolders`). Shield wards and guardians are attuned to one player each (`attune`, labelled;
  `owner`; the host ignores other players' hits, and an owner who is down or gone frees it).
- **Steeping** (`components/Steeping.js`, title screen after the first run): vows with ranks (more bees, tougher
  bees/bosses, faster bullets, fewer hearts, early elites, a modifier every wave, a locked Pantry). Each rank adds its
  heat to the Steep level; score and Golden Leaves get ×(1 + 0.12 × Steep). Solo only: `runVows` returns nothing for
  the Daily Brew and co-op. The level is sent to the leaderboard (`steep`) and shown there, in the HUD and on shares.
- **Keepsakes** (`components/Keepsakes.js`, title screen): one trinket per run (`meta.keepsake`). The teacup is free,
  the other 10 unlock with achievements (`unlock`), and the achievement toast says so. `apply({ stats, player,
  grant })`: `grant` holds the hooks for effects that aren't stats (a skill pick, a charm, starting Awakened…).
- **Charms** (`components/Charms.js`): stacking trinkets without a cap, dropped by elites (35%), hives and held
  shrines (always), bosses (3, at least Uncommon) and plain bees (0.4%). They lie on the ground (`CharmDrops`, emoji
  sprites) until picked up and fly to Tode when a wave is cleared. Stat charms `apply` once per copy; the others
  trigger in `charmHit`/`charmKill` from `damageEnemy` (sources in `PROC_SOURCES`). Charm damage passes on half its
  trigger chance (`withProc`, `procScale`) and at most `PROC_BUDGET` triggers fire per frame, so chains die out.
  Loaded Dice add rolls. In co-op every player gathers their own.
- **Shrines** (`components/Shrines.js`, `setupShrine` in main.js): from wave 2, about a third of the non-boss waves get one (each usable once);
  stand on it for 0.9 s. Shrine of Chance: 1 heart for a charm (50%), two (15%) or nothing. Bitter
  Shrine (solo): the wave gets elites, frenzy, 50% more bees and a squad, then an extra Epic brew pick
  (`bonusPicks`, `offerBrews(true)`). Cursed Leaves: a `CURSES` brew (PowerUps.js, kind `curse`) with a drawback.
- **Memory** (`meta.lastRun`, `meta.bosses`, `meta.blendPicks`; `rememberRun`/`boss` in Meta.js): at a run's first
  brew offer the speaking spirit talks about the last run (its killer, depth, a god form, a victory, the Steep, a
  favourite Blend); later offers sometimes mention the favourite. Bosses taunt at their entrance from `bossTaunt`
  (first meeting, beat Tode before, lost before). Tode's line after a boss defeat names that boss.
- **Voices:** spirits and bosses babble synthesized syllables while their line types out (`babble`/`hush` in
  Sound.js, a `voice` per spirit in Spirits.js, `hud.onSpeak`/`onHush`).
- **Readability:** enemy bullets have a dark outline (back-face rim mesh) and draw after all other transparent
  effects. The pause menu's **calm effects** (`settings.calmFx`) halve particles, soften flashes, pulses and shake
  during play (cut-scenes keep the full show) and drop the spit trails.
- **Phones and tablets:** twin-stick touch controls (`TouchControls.js`): the left half of the screen is a floating
  move stick, the right half a floating aim stick (both wait faintly in their bottom corners), and dash/bomb/ultimate
  buttons sit in a row above the aim stick. Tode always spits by himself: where the aim stick points (`input.aiming`,
  `input.aimAxis`; spit's aim assist still applies), or at the nearest bee in range when it's let go. Skills always
  auto-cast (the pause menu hides that toggle). Touch mode turns on for a coarse pointer or touch without hover,
  and on the first real touch otherwise (touchscreen laptops). Quality adapts to the frame rate (pixel ratio
  0.6–1.5, shadows off as a last resort).
- **Touch HUD:** the brew and charm rows (`.inventory`) are replaced by a one-line count under the hearts
  (`.inventory-summary`); charm pickups float up from Tode instead of toasts; at most 2 toasts, low on the left;
  weather and modifier lines show only their names; banners and callouts wrap. Narrow screens (`max-width: 600px`)
  shrink hearts and score and move the wave line below them. The pause menu still lists the whole build.
- **Short screens** (phones in landscape, `max-height: 500px` at the end of `style.css`): menus, popups and HUD
  widgets are shrunk with CSS `zoom` and menus scroll. World-anchored labels and objective arrows are positioned in
  screen pixels, so never zoom them (or `.hud` as a whole). Inside a zoomed element `vh` lengths shrink too.
- **Title screen layout:** in order of importance: a big Start run; the ways to play (Daily Brew, Co-op,
  Leaderboard); smaller run preparation (Pantry, Keepsake, Steeping); then small pills (save code, fullscreen,
  What's new with the version). Keep new entries in that order rather than adding full-size buttons.
- **Fullscreen:** a button in the title and pause menus (`Fullscreen.js`, with the `webkit` API for iPad Safari);
  hidden where the browser can't do it (iPhone Safari). Menus redraw on `fullscreenchange` (`refreshMenu`).
- **Healing and the ultimate:** Stolen Honey and Herbal Remedy share a 12 s cooldown (`LIFESTEAL_COOLDOWN`);
  Petal Shield and Stolen Honey upgrades always improve the current value (their card text depends on the level).
  The ultimate gauge fills by the health actually taken off bees divided by the wave's `hpScale`, so it charges at
  the same pace all run.
- **Sharing a run:** the game-over screen shows everything gathered (ultimate, skills, brews) and a 📤 Share button
  that opens a popup with a 1200×630 card drawn on a canvas (`ShareCard.js`: score, time, wave, level, bees, form,
  build, the last frame as a backdrop) plus a text line. Share uses the native share sheet (image + text) where
  available, else copy image (`ClipboardItem`, pastes straight into Discord) / copy text / save image.
- **Invites and link previews:** the co-op room view shows an invite link (`?room=CODE`, `inviteLink()`); opening it
  shows the lobby with the code filled in (`openInvite()` at boot, which also strips the parameter). `index.html`
  has Open Graph / Twitter tags pointing at `public/og-image.jpg` (1200×630) with the absolute Azure URL, so a
  pasted link unfurls in Discord. Change those URLs if the game moves.
- **Promo material:** `game/promo/` holds the trailer (MP4 for YouTube/X and a <10 MB one for Discord), a GIF and
  banners. They were made by stepping the dev build frame by frame (`game.step(1/30)`), copying
  `renderer.domElement` into a 2D canvas (cropped around Tode) and posting each JPEG to a small local receiver,
  then adding captions and encoding with Pillow + ffmpeg. The DOM HUD isn't in those frames.
- **Versions:** `components/Changelog.js` lists every release, newest first; its first entry is the version shown
  on the title screen and in the 📜 What's new popup (title and pause menus). **Add an entry and bump
  `package.json` for every major change.** Popups use `hud.showModal()` over the current menu; while one is open
  Esc closes it and no other key reaches the game.
- **Meta progression:** each run earns Golden Leaves (`leavesForRun`: mostly waves, bosses and victory; a wave-10
  run pays ~90, the whole Pantry costs ~1,300) for permanent upgrades in Tode's Pantry (title screen),
  and Tode says a story line after each run. **Cloud saves** (`components/CloudSave.js`, `server/saves.js`): the
  server owns leaves, Pantry levels, achievements and run stats. Every browser gets a save code (`MINT-FROG-42`,
  two words and a number) on its first visit. A ☁️ pill on the title screen and in the Pantry opens the save
  popup (`hud.showSave`): copy the code or load another one. At start the server's copy replaces the local one (so editing localStorage doesn't stick); a finished
  run is reported (`reportRun` in `endRun`) and the server computes the leaves itself with the shared rules
  (`leavesForRun`, `PANTRY`, `ACHIEVEMENTS`, `steepBonus` are imported from `src/`, so the server needs the `src`
  folder next to it), accepts achievements only when the run fits them (`earned()`), and refuses a run whose
  playtime exceeds the real time since the previous report. Pantry purchases are checked too (`reportBuy`).
  Achievements unlocked this session wait in memory (`notePending`) until the next run report. Without a server
  the game falls back to local progress. Forged requests can still cheat; this only stops storage edits.
  **Leaderboards** via `game/server`: score, deepest run (wave, then
  level), fastest Bee-zebub (clear time) and a seeded **Daily Brew**. The run timer (top right) only counts
  fighting: menus, skill picks, cut-scenes and pauses don't count. Saved in `localStorage`: `tode-meta` (also vows, keepsake and memory), `tode-best-score`, `tode-sound`, `tode-settings`, `tode-name`.

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
- **Living floors** (`floorOverlay` in Arenas.js): the Tournament and the Underworld are seen mostly as floor, so
  each gets an additive shader layer over its stone: a drifting nebula, pulsing seams, twinkling stars and a rune
  ring (Tournament), magma under the floor, a turning summoning sigil and sparks (Underworld). GLSL note: `half`
  is a reserved word.
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
  is down. The garden grows (25 → 31 → 35 → 41 tiles), and per extra player waves get 60% more bees that are 30%
  tougher, bosses 80% more health (`COOP_*` in main.js); bigger maps get extra spawn points on the edges.
- **Experience in co-op:** everyone collects their own copy of every bee's leaves (and charm drops), so leaf values
  and charm odds are divided by the swarm growth (`coopShare()`): each frog levels at about the solo pace.
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
| `components/Leaves.js` | Tea-leaf experience orbs and the level curve (`leavesForLevel`). |
| `components/PowerUps.js` | Brews: `BLENDS`, regular brews with rarity values, `DUOS`, `LEGENDARIES`, `rollBrews()` offer logic. |
| `components/Ultimates.js` | Steeping Beam, Thunder Tea Storm, Summoning: Great Tode (and the teapot model). |
| `components/Skills.js` | 14 skills (`SKILLS`) and the `SkillBook` (6 slots, cooldowns, auto-cast targeting, manual Q/E/F for the first three). |
| `components/Spirits.js` | The tea spirits and their dialogue (greetings, Legendary lines, Duo exchanges, memories of past runs, voices) and the bosses' taunts. |
| `components/Divinity.js` | World transformation per ascension tier (variant trees/rocks, lanterns, petals, crystals, islands, heaven). |
| `components/Random.js` | Seeded randomness for the Daily Brew (`seeded(fn)` swaps `Math.random` only inside `fn`). |
| `components/Leaderboard.js` | Client for the leaderboard API; fails quietly without a server. |
| `components/CloudSave.js` | Cloud save client: save code, sync at start, run and Pantry reports. |
| `components/Net.js`, `components/RemoteTode.js` | Co-op networking and teammate puppets (see Co-op above). |
| `components/TouchControls.js` | Twin sticks (move / aim) and buttons for touch devices; touch detection. |
| `components/Fullscreen.js` | Fullscreen toggle with the prefixed Safari API. |
| `components/ShareCard.js` | The end-of-run share image and text. |
| `components/Changelog.js` | Version history (`CHANGELOG`, `VERSION`) for the What's new popup. |
| `components/Achievements.js` | Achievement list and unlocking (rewards Golden Leaves). |
| `components/Steeping.js` | Steeping vows, the Steep level and its bonus. |
| `components/Keepsakes.js` | Keepsakes, their unlocks and the chosen one. |
| `components/Charms.js` | Charm definitions, rarity rolls and the charms lying on the ground (`CharmDrops`). |
| `components/Shrines.js` | Shrine types and their models (main.js runs them: `setupShrine`, `useShrine`). |
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
| `../server/server.js` | Node server: static hosting of `dist/`, `/api/scores` leaderboards (score, depth, speed, daily) and the co-op relay. |
| `../server/saves.js` | `/api/save` cloud saves (`saves.json` in `DATA_DIR`): codes, run rewards, Pantry purchases, rate limits. |
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
game.ultimate('storm')    // own an ultimate with a full gauge
game.setTier(4)           // jump to an ascension tier
game.setWeather('night', 'storm')
game.learn('comet')       // learn (or level up) a skill
game.hurt(99)             // hurt Tode (test downed / game over)
game.coop                 // co-op state (remotes, host flag)
game.renderer.info        // draw calls, triangles, GPU textures/geometries (watch for leaks)
game.setArena('hell')     // show an arena right away; game.startWave(21) travels there instead
game.arena                // the current arena id
game.ultimate('summon')   // then press R for the Great Tode
game.charm('spoon', 5)    // gain charms (no id: a random one); game.charmCounts
game.shrine('bitter')     // put a shrine in the arena now: 'chance', 'bitter' or 'cursed'
game.bullets.list         // enemy bullets in flight
game.level                // Tode's level (tea leaves)
game.settings.autoCast = false
game.autoPause = false    // stop auto-pausing on window blur (needed for background test tabs)
game.persist = false      // don't save progress or the best score this session (use it before bot runs)
const bot = game.makeBot(); bot.run(300)  // autoplay 300 s and get a log of waves, picks and death
```

Tip for AI agents with an embedded browser: a hidden browser pane pauses `requestAnimationFrame`, so drive the game
with `game.step()` and take a screenshot to see the result. A hidden pane can also show a stale canvas; for exact
shots copy `game.renderer.domElement.toDataURL()` into a full-screen `<img>` right after a step. Setting
`game.player.invulnerableLeft` makes Tode blink (model and aura hidden on some frames). Co-op can be tested with
two tabs against `npm run server` (stepping each tab in turn, with short awaits for the messages). `step()` renders only its last frame; CSS animations
(banners) run on real time, so a screenshot right after a long step can still show them.

Balance reference (Oct 14, v0.12): the bot can't do raid mechanics well (it flees the boss instead of walking to
circles), so it dies at the first or second boss; with 80 hearts a Queen fight took ~50 s and a Shogun fight ~45–70 s
through all stages. Earlier (v0.11 with raid bosses and tactics): the bot (perfect aim, random picks, dodges bullets
but not telegraphed strikes or lunges, walks into shrines and circles of light) died at waves 5, 10 and 15 (the
Shogun's charges during his shield phase are its usual end). Before v0.11 it died at the wave-10 Shogun twice and
at wave 16 once. Humans will find the bullet patterns harder than the bot does. See `SUBMISSION.md` for the contest post kit.

## Ideas / roadmap

- Readability seen while making the trailer: the Sky Citadel at golden hour plus a high ascension form washes out
  to near white, and the Steeping Beam whites out the garden for ~2.5 s. Tode himself is hard to spot inside the
  God of Tea aura.
- More variety: new bee behaviours per arena (not only looks), more brews and charms.
- Co-op: Steeping is solo only and the Bitter Shrine doesn't appear (it changes the host's waves).
- Arenas are only seen from the gameplay camera's steep angle (sky domes show in the travel cut-scenes); a giant
  landmark per arena placed toward the camera's view (-x, +y) is what reads best in play.
- The Divinity world transformations (blossoms, lanterns, heaven) only apply in the garden.
- The music mix has not been checked by ear; volumes in `Music.js`/`Sound.js` may need tuning.

## Credits

- `tode.glb`: from the JetBrains Academy course.
- `enemy.glb`: "Armabee Evolved" by Quaternius, [CC0](https://creativecommons.org/publicdomain/zero/1.0/), via [Poly Pizza](https://poly.pizza/m/GcttdvsqsQ).
- `small_house.glb`: "Small House" by Jarlan Perez, [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/), via [Poly Pizza](https://poly.pizza/m/053kskrV4U_).
- Everything else (scenery, effects, music, sound) is generated in code.
