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

### Deploying while people play (v0.24.3)

A deploy restarts the Node process (about a minute on B1, which has no staging slot). The game itself keeps running
in every browser; what touches the server is made to survive the gap:

- **Data files** (`server/store.js`, used for `saves.json` and `scores.json`): never written in place. Each write
  goes to `<file>.tmp`, is flushed and renamed over the file, so a kill mid-write can't leave half a file. Every
  write keeps the previous version as `<file>.bak`, and `DATA_DIR/backups/` gets one copy per day (7 days). A file
  that won't parse is moved aside (`.corrupt-<time>`) and the newest good backup is loaded; with none, **the server
  refuses to start** instead of starting empty and overwriting everyone's saves. To restore by hand: stop the app,
  copy a backup over the file, start it.
- **Shutdown:** on SIGTERM (App Service sends it) the server stops accepting, tells sockets `restarting`, waits for
  pending writes (at most 8 s) and exits.
- **Co-op runs carry on:** `Net.js` reconnects for up to 150 s and sends `resume` (code, id, host, name, colour);
  the server makes the room again with the same code, host and ids (ids start at a random number per process, so
  new players never take a resuming id). The host keeps simulating meanwhile; when a teammate comes back the host
  re-sends the current `wave` (and `cleared`), guests ignore a wave they already started (`guestWave`), and missing
  teammates are only dropped `TEAM_GRACE` (60 s) after we're back (`teammatesChanged` in main.js). A teammate whose
  puppet was dropped gets a new one when they return. A room made again by a guest closes if the host isn't back in
  `RESUME_GRACE` (120 s).
- **Gardens** reconnect by themselves (`GardenHub.reconnect`, backoff up to 15 s).
- **Run reports** are queued in `localStorage` (`tode-unsent-runs`) until the server answers; each has a `runId`
  and the server remembers the last 20 per save (`recentRuns`), so a report sent twice pays once. `initCloud`
  retries quietly when the server was away at start. The queue is sent after every sync and retried every 30 s.
- **Old pages:** when the presence socket reconnects (`onServerBack`), the game asks `/api/health` for the server's
  `version`; a different one shows a "✨ vX is out · reload" pill on the title screen (never during a run).

Still lost in a deploy: anything the host sends while the server is away (one-off events like a boss intro or a
shrine; snapshots and the wave catch up), Pantry purchases made during the gap (they are undone, the leaves come
back), and a leaderboard submit during the gap (the button can be pressed again). Two runs queued while the server
is away can trip the playtime check for the second. Deploy when few people play (the admin page's Who's online).

### Admin

The owner's admin page lives at **`/admin`** (`server/admin.html`, served by `server/admin.js`; not part of the Vite
build and not linked from the game). It only exists when the server has an `ADMIN_TOKEN` environment variable;
without one, `/admin` and every `/api/admin/…` endpoint answer 404. Use a long random token:

```bash
ADMIN_TOKEN=$(openssl rand -hex 24) npm run server            # locally: http://localhost:8787/admin
az webapp config appsettings set --name todeity --resource-group carsten --subscription "Carsten DVK" \
  --settings ADMIN_TOKEN=<token>                               # Azure (restarts the app)
```

The page asks for the token (kept in `sessionStorage` only), refreshes the stats every 5 s and lists every board
with per-entry delete, "all by this name" and clear-board buttons. The API sends `Authorization: Bearer <token>`
(compared with `timingSafeEqual` on SHA-256 hashes, never logged); 10 failed attempts per IP in 10 minutes (or 100
from everyone) give 429 until the window ends. Admin actions are logged without the token.

- `GET /api/admin/stats`: online players (`presence.online`, `byState`, `peak` since start), co-op sockets and
  rooms, uptime, memory, number of cloud saves and scores per board.
- `GET /api/admin/boards`: every board (`all`, `depth`, `speed`, `daily/YYYY-MM-DD`) with its entries.
- `DELETE /api/admin/boards/:board/entries/:id`, `DELETE /api/admin/boards/:board` (clear; `daily` alone clears
  every day), `DELETE /api/admin/players/:name` (every entry with that name, any case, on all boards).

Score entries have a short random `id` (assigned on insert; older entries get one when the server loads the file).
Copies of one run on several boards share the id; deleting removes it from one board.

**Presence.** Every open game keeps a tiny socket on `/ws?presence=1` (`components/Presence.js`, server side
`server/presence.js`) that reports what the player is doing: `{ t: 'state', s, n, g, c, d }` (a state word such as
title, garden, visit, lobby, run, daily, coop, paused or gameover; the player tag's name and #tag; the frog class;
a detail line like "co-op ×3 (host) · wave 7 · Sage Mountain"). main.js sends `presenceNow()` once a second when it
changed. The admin page's "Who's online" table lists everyone (only the admin API shows names). These sockets live in their own
`WebSocketServer`, never reach the co-op relay, and are capped (128-byte messages, about one per second, 8 per IP,
5000 in total) and pinged every 20 s. Co-op sockets are capped at 16 per IP. main.js opens it at boot
(`startPresence`) and `setPhase` reports title, run, daily, coop, paused or gameover.

## Gameplay summary

- WASD move (camera-relative), mouse aims, Space/Shift/RMB hop-dash, E/middle mouse fires the ultimate, Esc/P
  pauses, M mutes. Tode spits by himself whenever a bee is within spit range (`settings.autoSpit`, on by default;
  the pause menu's "Spit: hold LMB" brings back holding the left button, which always spits too). Skills and the tea bomb always cast themselves (there are no manual casts).
- Waves of bees spawn at the four corners. After each wave: pick 1 of 3 **brews** (power-ups), offered by a tea
  spirit with a line of dialogue. After the first boss (wave 5) you pick an **ultimate**. **Skills** come from
  levelling up (see Experience). Every arena has its boss (cinematic entrance, rage phases, bullet patterns): Queen
  Buzzbelle (5), the Hornet Shogun (10), the Seraph Queen (15), **Empress Buzzbelle (20)**, then the ground gives
  way and the true finale is **Bee-zebub in the Underworld (21)**, then a victory screen with an optional
  endless mode. Elite bees from wave 6.
- **Roguelite bullet hell:** ranged bees shoot harder patterns per arena (`STINGER_PATTERNS`: single shots → fans
  → wide fans → fans plus rings → fast fans), and bosses mix fans, aimed volleys, slow dense rings (`halo`), two-
  and four-armed spirals (`spiral`/`cross`), charges and summons (`ATTACKS` in `startQueenAttack`). Enemy bullets
  are an instanced field (`components/Bullets.js`), hit on a forgiving core, and tea bombs cancel them. **Graze**
  (v0.25.1, `GRAZE`, `graze()` in `updateEnemyProjectiles`): a bullet passing within `GRAZE.reach` of the hitbox
  without hitting sparkles, chimes and pays 0.6% ultimate charge and 15 points, once per bullet; not while Tode
  blinks after a hit, but during a hop-dash it counts. **Stage leaves** (`bulletsToLeaves`, called by
  `stageEffects` and `bossDefeated`, so on every screen in co-op): every bullet in the air becomes a tea leaf (at most
  `STAGE_LEAVES.total` worth, 0.25 per bullet) and all leaves fly to Tode. The swarm
  cap grows by 6 per arena.
- **Chaos:** bee health and numbers grow steeply (`waveConfig`). From wave 4 waves may get **modifiers**
  (`MODIFIERS` in `Waves.js`: Frenzy, Horde, Elite Surge, Meteor Shower, Vengeful Swarm, Armoured; two at once
  from wave 14), shown under the weather. Each arena past the garden has a **hazard** from its second wave on
  (`HAZARDS` in main.js: falling boulders, holy lightning, meteors, brimstone; `effects.meteor()`), and from wave 4
  coordinated **squads** appear (`spawnSquad`: an encirclement, a phalanx marching across, a firing squad of
  stingers that volley together, from wave 8 a bombing run of zippers dropping stingers sideways, from wave 11 a
  pincer of two phalanxes).
- **Arena events** ("Arena events" section in main.js, `ARENA_EVENTS`, host only, bullets shared via
  `sharedStinger`): from wave 7 patterns of stingers sweep the field every 15 s (down to 5 s; rarer in boss waves):
  bullet curtains (`curtainLine`, any direction incl. diagonals, gap near a Tode), Lighthouse (turning arms of
  stingers), The Noose (two rings closing in), Crossfire, Double Curtain, Closing Walls, Stinger Rain (diagonal
  lines) and Starburst. Timed ones run as `arenaEvents` entries (`later(delay, fn)` schedules a step). Bullets
  outside the arena only die when flying away from it, so events can start them outside.
- **Experience:** kills drop tea-leaf orbs (`components/Leaves.js`) that fly to Tode within his magnet range;
  every level is a pick of 3 **skills**, new ones or upgrades (24 skills, up to 6 slots, level 5 each). A mastered
  skill (level 5) casts twice (`MASTERY_ECHO`), or cools down 30% faster if it lasts a while (`ECHOLESS`).
  **Fusions** (`FUSIONS` in Skills.js, 13 of them): when both skills of a pair reach `FUSE_LEVEL` (4), a rainbow
  fusion card takes the first offer; picking it replaces the two slots with one fused skill (levels 1–3, `vlevel`
  maps a fusion level onto the old classes' levels). Fusions live in `SKILLS` too (`fusion: true`), so co-op replays
  and the HUD treat them like any skill; `power()` counts a fusion as the two skills it came from. Offers carry a
  `hint` (what a skill fuses with, or what its mastery does). The first three levels are cheap (`FIRST_LEVELS` in
  Leaves.js) so a run gets its first skills in wave 1. Solo, the
  game pauses for the pick (`openLevelUp`, back to the fight afterwards, possibly via a mid-wave transformation);
  in co-op the picks wait until the wave is cleared (the bar shows `Lv 7 (+2)`). At most one skill pick between
  waves (`skillPickedThisBreak`); extra levels come up `LEVEL_UP_DELAY` seconds into the next wave, one at a time.
  The curve (`leavesForLevel`) gives about one level per wave after the first three. Every player
  gathers their own leaves. **Critical hits** (5%) deal double damage with gold numbers.
- **Royal Tea Chest** (v0.25.2, "The boss chest" in main.js, `CHEST`): `bossDefeated` drops a golden chest where
  the boss fell (not Bee-zebub's final fall; co-op guests get the spot in `bossDown`'s `p`), it hops and slides to
  Tode (`updateChestDrop`), and `offerRewards` opens it before the ultimate and brew picks (phase `chest`,
  `hud.showChest`: a reel of icons slows down, lands on ×1/×3/×5, then the rewards pop out; Space or ✨ Collect).
  Count: the run's first chest 3, then 5 (10%), 3 (35%) or 1. Rewards (`rollChest`): a level for a random known skill
  below its max (fusions to `FUSION_MAX`), else an Uncommon-or-better charm. A co-op guest whose host starts the next
  wave mid-chest takes the rewards and goes along (`collectChest({ moveOn })`).
- **Side objectives** (`OBJECTIVES` in main.js): when Tode reaches an arena it gets one: smash 3 wild hives
  (garden) or golden hives (Sky Citadel), hives being `nest` structure enemies that keep letting out bees; or hold
  3 shrines (temple bells, reality rifts), circles that fill while a Tode stands in them and draw bees in. The
  arena's last wave doesn't clear until it's done (`gateOpen`): the way on is sealed. Arrows at the screen edge
  point at objectives out of view. Tode's damage grows much faster than the bees' health, so hives, shield wards and
  guardians get an extra health factor per arena (`STRUCTURE_SCALE`, on top of the wave's `hpScale`), arena circles
  take longer to hold and draw more (and later tougher) bees (`ZONE_TIMES`), and so do a boss's circles of light
  (`LIGHT_TIMES`).
- **Bigger arenas:** every arena is 4 tiles wider than the one before (`arenaTiles`; `setMapTiles` on arrival).
  Builders lay out in garden-sized coordinates and `spread` stretches them; `fillProps` adds more props; bigger
  fields get extra spawn points along the edges.
- **Arenas** (`components/Arenas.js`): a new playing field every 5 waves: Tode's Garden (1–5), Sage Mountain
  (6–10), Sky Citadel (11–15), Tournament of the Gods (16–20), The Underworld (21+). Each has its own ground,
  props/obstacles, corner spawners, sky dome, lighting palette, particles and post-processing boost, and is built
  at a higher **graphics level** (see below). Between arenas a `travel` cut-scene plays (leap through a flash, a
  swoop over the new arena that shows off its sky, a landing shockwave); into the Underworld Tode *falls*.
- **Skills always auto-cast** (the owner mostly runs, aims and shoots; manual Q/E/F casting was removed in v0.15).
- **Tea bomb** (automatic; replaced the tea splash): lobs a boiling kettle bomb at the thickest crowd within 430
  (3+ bees, a boss counts 3); it explodes
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
- **Classes** (`components/Classes.js`, v0.17): seven frogs, all open, picked under Start run (`hud.showClasses`,
  `meta.frogClass`): Tode, Bullfrog Brawler (8 hearts, two spinning throwing axes that hit ×3 and cleave, hard dash
  shove, Tongue Lash), Tree Frog Sharpshooter (4 hearts, long piercing double-damage darts, crits), Toad Alchemist
  (lobbed potions: `Projectile.lob` flies an arc under gravity, `LOB_TIME`, and `shatterPotion` splashes
  `POTION_RADIUS` where it lands, aimed at the assisted bee via `lobRange`; 3 elemental tea bombs, Sugar Mines),
  Starleaf Mage (4 hearts, small homing fireballs that burn, faster skills, Ball Lightning), Toad Summoner (pond toads at his side,
  `companions`; the Great Tode ultimate from the start, as his own Ancient Pond Toad) and Ninja Toad (throwing stars,
  2 dashes, `dashDecoy`: a log the bees chase; bosses ignore it). A class is `apply({ stats, player, grant })` on top
  of `BASE_STATS`, before the Pantry and the keepsake; its mechanics are stats in `BASE_STATS` ("Class mechanics")
  read by main.js ("Class mechanics" section: `placeDecoy`, `updateCompanions`; `steer` for homing; `teaBlast` for
  elements) and `Projectile` (`shape`). The Daily Brew plays the class of the day (`classOfTheDay`). Hits round to
  whole damage, so give low-damage classes whole-number boosts (a +20% on a 1-damage spit does nothing). Balance (bot,
  300 hearts, waves 1–10, one run each so noisy): Queen 22–49 s, Shogun 18–62 s, 4.6–8.7 hits a minute for every class.
  The Dart Frog was dropped (it overlapped the Ninja). Inspired by ninja-anime toads but deliberately original: no
  leaf headband, no copied characters or names.
- **The frogs** (`components/FrogModels.js`): every player is a procedural voxel frog with real joints (head, jaw,
  tongue, throat, blinking eyes, arms, folding legs); `Player.setClass` builds it (`FROG_SCALE`, with Tode's original
  hitbox for every class) and `player.animate` runs it every frame. The game drives it: running legs follow the hop
  (`setLocomotion`), `flick()` per spit, a one-shot `dash`, `victory` in the ascension and story cut-scenes, a sip in
  the ending, and the signature move now and then on the title screen. `rig.inPlace` keeps moves from walking the frog
  off its hitbox in play. Ascension tints the frog's own materials (`ownMaterials`); later arenas make them glossier but
  keep them blocky. `/classes.html` (dev only) previews them all.
- **First impressions:** the title camera orbits plain Tode (his forms are a surprise; the ending shows him plain
  again too); the first run starts with a skippable story
  cut-scene (`meta.seenStory`). 📸 / C saves a watermarked screenshot.
- **Finale:** the Empress (wave 20) has a Royal Spiral attack. Bee-zebub (wave 21, horns and a fire aura) adds
  Brimstone Rings (walls of fire spreading from him: only a hop-dash gets you through), chasing Hellfire Pillars,
  hellfire rain and an Infernal Spiral, with two rage phases where he grows. Beating him plays the ending
  cut-scene back home in the garden, and credits.
- **Raid bosses** (`BOSS_SCRIPTS`, `MECHANICS` and the "Raid bosses" / "Boss stages" sections in main.js): every
  boss fights in stages. At each health fraction it roars, attacks 8% faster and starts a mechanic. **Apart from its
  shield, a boss always takes damage**: the fight lasts through its health (`hp` in `BOSS_SCRIPTS` multiplies
  ENEMY_TYPES: ×2.2 Queen, ×2.8 Shogun, ×4 Seraph, ×9 Empress, ×12 Bee-zebub; the Queen and Shogun got a stage
  more and faster attacks in v0.19 because they were too easy), never through a lock that swallows
  hits. (Until v0.15 a phase lock held the boss at each threshold and every stage lasted at least 13–15 s, with ⏳ on
  blocked hits; players hated not being able to do anything.) A stage starts the frame its threshold is crossed: a
  shield goes up even mid-attack or mid-stagger, and a mechanic that takes over the boss (a ritual, a blade storm)
  cuts its attack or stagger short, but waits for a running ritual or blade storm; during a cataclysm the stages
  with their own circles wait. A big burst can cross several thresholds; their stages then follow one after another.
  The ritual's damage target is a share of the health before the `hp` boost. An **enrage timer** per boss (3:20 to
  5:00 of fighting, shown under the boss bar) makes it much faster and harder hitting with stinger rain (`ENRAGE`).
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
  elites and every other stinger lead their shots (`todeMotion` tracks each Tode's velocity). **Manoeuvres**
  (`MANOEUVRES`, every 14 s down to 6 s): from wave 4 a pack circles a Tode on a ring and collapses on him with
  telegraphed lunges (`startSurround`, ai mode `surround`), from wave 6 stingers take posts around him, wind up
  and fire together (`startCrossfire`, `updatePost`), from wave 9 a rolling strike (a pounce whose lunges come one
  after another). The Hive Mind vow (`tacticsWave()`) brings all of it in from wave 2.
- **Beam clash** (solo): when the Empress or Bee-zebub hits a rage phase they fire a beam at Tode, he answers, and
  the player mashes Space/click/tap to push the clash point back (`CLASH` in main.js). Winning deals 10% of the
  boss's health and **shatters reality** (`postfx.shatter()`: the screen cracks into shifted shards with an
  inverted flash); losing costs a heart.
- **Ultimates** (picked after wave 5, the gauge fills slowly): Steeping Beam (an enormous beam; Tode keeps moving
  at 45% speed and steering it; since v0.24.9 a boss in it loses `BEAM_BOSS_SHARE` (20%) of its max health per second
  as `raw` damage that ignores Tode's multipliers, and bees take `BEAM_DPS` × the wave's `hpScale` via
  `ctx.waveScale()`: flat damage took only 11% of the Queen and less of each later boss; measured now ~30–45% of the
  Shogun per beam, shields still block it), Thunder Tea Storm and **Summoning: Great Tode** (a summoning seal, then a giant
  toad that stomps, tongue-lashes the thickest crowds three times and body-slams; the tongue is a Bézier tube from
  its mouth, `mouthForward`/`mouthHeight`, rebuilt every frame).
- **Achievements** (`components/Achievements.js`): 39, each with its own `reward` (3 to 60 Golden Leaves), shown
  in the Pantry. The server checks each against the run report (`earned()` in `server/saves.js`), so a new
  achievement needs a rule there too. Run bookkeeping for them lives in `feats` (main.js).
  First-run **tips** appear once each (`meta.tips`).
- **Cursed tiles** ("Forbidden tiles" section in main.js, `CURSED`): from wave 3 every non-boss wave lays out
  2×2-grid tiles (more each wave, rolled away from Tode and the objectives; seeded for the Daily Brew; the host
  shares them in co-op). Stepping on one (not while hop-dashing) costs a heart (two from wave 16), **hexes** Tode
  (`hexLeft`: half speed for 2.6 s, no dash for the first 0.8 s), closes a ring of stingers in on the tile
  (`curseTode`) and calls a ring of bees led by an elite from wave 6 (`ambush`, the host spawns; guests send
  `ambush`); it re-arms after 7 s.
- **Difficulty curve** (`waveConfig`): past wave 10 swarms grow quadratically and more of them are stingers; from
  wave 16 bees hit for an extra heart; hazards fall in growing numbers (up to 8 at once) and arena events come more
  and more often.
  **Endless** (waves past 21): bees +10% health per wave, always 2–3 modifiers, every boss in turn (`ENDLESS_BOSSES`),
  +1 contact damage every 10 waves.
- **Co-op classes:** every player plays their own class; the state message carries it (`c`) and `RemoteTode`
  rebuilds the puppet; spits carry their style (`st`), a Ninja's decoy is a `decoy` message (the host's bees chase it).
  The Summoner's pond toads are local only (their spits show as his).
- **Co-op objectives:** a circle (arena objective or a boss's circles of light) only fills while every standing
  frog is in it (`circleHolders`). Shield wards and guardians are attuned to one player each (`attune`, labelled;
  `owner`; the host ignores other players' hits, and an owner who is down or gone frees it).
- **Daily Brew twists** (`components/DailyTwists.js`, shared with the server): every UTC day rolls one trial
  (`TRIALS`, harder, `reward` multiplies score and Golden Leaves) and one boon (`BOONS`); Sundays two trials,
  Saturdays two boons. The 📅 button opens `hud.showDaily`; main.js reads them with `twist(id)` (stats in
  `applyTwists`, waves in `startWave`/`beginWave`, plus `rollElite`, `healPlayer`, cursed tiles and boss health).
  The run report sends `dailyKey`; the server only pays the bonus for today's or yesterday's key.
- **Coming back** (`components/Rewards.js`, shared with the server): a 🎁 daily gift (`STREAK_GIFTS`, a 7-day cycle,
  trinkets on days 3 and 7) and the 🫖 kettle (`KETTLE_HOURS`, leaves and a 30% trinket chance), claimed through
  `POST /api/save/:code/claim` (`claimReward` in CloudSave.js; locally when offline). **Trinkets** (`TRINKETS`,
  23): milestones unlock by themselves from the progress (`unlock`), gift and kettle ones are stored in
  `progress.trinkets`. They stand around Tode on the title screen (`TitleGarden.js`, models in `TrinketModels.js`,
  placements in `progress.decor`, saved with `POST …/decor` via `saveDecor`). New ones place themselves
  (`syncTrinkets`, `meta.trinketsSeen` is local).
- **The garden editor** (🏡 My garden, v0.21, `TitleGarden.js`): the camera is the player's (`updateCamera`: yaw,
  pitch, distance and a target that ease toward `goal`; drag to orbit, wheel or pinch to zoom, right-drag, two
  fingers or WASD to pan, Q/E to turn, 🧭 `resetView`, 🗺 `planView`). Trinkets are dragged from the tray
  (`beginTray`, a `pointerdown` on `[data-trinket]` in main.js; a tap instead makes it follow the pointer until the
  next tap) or on the lawn; R / wheel turns, Delete puts away, G grid snap, Ctrl+Z `undo()` (decor snapshots).
  The tray keeps its trinket buttons between updates (`hud.refreshGarden`), since one may be under a finger mid-drag.
  Tray pictures are rendered once (`TrinketPortraits.js`). Trinkets animate (`userData.anim(t, night)` in
  `TrinketModels.js`); 🌙 night (`meta.gardenNight`, local) switches the title sky and the soft ground glows.
  **Sets** (`SETS`, `gardenSets`, `gardenBeauty` in Rewards.js): all parts within `SET_RADIUS` of their middle show
  a ring and particles (`SET_EFFECTS`) and add beauty (shown on the profile).
- **Gardens as a meeting place** (v0.22, `GardenHub.js`): 🏡 My garden puts Tode in his garden as a hopping frog
  (`hub.update`: `WALK_SPEED`, Space/Shift/🦘 jumps with `JUMP_SPEED`/`GRAVITY`; the camera follows him, see
  `TitleGarden.walk`, and is a child of his group, so `updateCamera` gets his position as `origin`). Frogs bump on
  the same level and can land on each other's heads (`topHeight`, `STAND_RADIUS`; only when falling) and ride along.
  ✏️ Edit garden (owner only) switches to the editor and back. Everyone in a garden is in a **garden room** on the
  server (same socket as co-op: `genter`/`gleave`/`gstate`/`gevent`, `GARDEN_MAX` 12, `GET /api/gardens` lists the
  liveliest), sending states 12×/s; others are `GardenFrog` puppets with a name label. **Parties:** 🚩 Invite
  (F) opens an `INVITE_RADIUS` circle; the inviter's screen puts frogs inside it into its party (`p` in its state,
  first come, up to 3); members press ✋ Ready (R); when all are ready a `COUNTDOWN` runs (or ▶ Go now), then
  `setOffWithParty` (main.js) opens a private co-op room, sends its code in a `go` event, waits for the party to join
  and calls `hostStartCoop`; members `joinParty` and start on the host's usual `start` message. `startRun` leaves
  the garden first (`leaveGardenView`). The owner's decor changes go out as `decor` events. On phones the touch
  controls have a garden mode (move stick and a jump button in the bottom-right corner; the right half turns the
  camera). The garden toolbar (`.menu.garden-walk`, z-index 5) sits above the stick zones (z-index 3) so its
  buttons get taps; the menu itself passes touches through, and the round corner buttons stack above the jump button.
- **Player tag** (v0.23, `components/PlayerTag.js`, shared with the server): name (2–16 characters, `cleanName`), a
  4-digit `#tag` the server gives every save, and a name colour (`TAG_COLORS`). It lives in the cloud save
  (`save.profile`, `POST /api/save/:code/profile`, `saveProfile` in CloudSave.js; `meta.profile` locally) and
  `playerName()` reads it first. `nameProblem()` refuses rude names (look-alike letters folded; `FRAGMENTS` anywhere,
  `WORDS` only as whole words, so Spicy or Peacock pass); the server also runs leaderboard, co-op and garden names
  through `publicName()`. 🏷 on the title (and the co-op lobby's "Playing as" chip) opens `hud.showProfile`;
  `needName(next)` asks for a name before the first co-op or garden step.
- **The playground** (v0.24): the house and trinkets are solid (`GardenPhysics.js`: height fields sampled once by
  raycasting down, `hub.world.heightAt`; walls stop you unless they're within `STEP_UP`, tops can be stood on).
  `BOUNCE` (trampoline, Fairy Ring) throws frogs up; the Teapot Cannon fires them along its facing (`CANNON`); the
  Tea Ball is shared physics (whoever touches it kicks it and sends a `ball` event; everyone simulates). Emotes
  (`Emotes.js`, keys 1–9, 😀 panel; most unlock with achievements) and boops (B: a `boop` event shoves the other frog
  on its own screen). Public gardens: `save.garden.public` (`POST …/garden { public }`, `setGardenPublic`);
  `GET /api/gardens` lists only public ones, at most 30: those with frogs in them right now (fullest first), then
  the loveliest empty ones (`listGardens`; `loveliestGardens()` in saves.js is cached until a public garden's decor,
  name or visibility changes; also in the co-op lobby, and in the 👀 Visit popup, which the title
  screen's 👀 Visit garden opens too: it shows at once and `hud.setVisitGardens` fills the list in). That button
  carries a pulsing green badge with the number of public gardens that have frogs in them (`hud.setLiveGardens`,
  `gardenLabel`; `refreshRooms` fetches the list with the Co-op rooms every 15 s on the title screen). Garden achievements: `tower`, `openhouse`.
- **Visiting gardens:** the save code is a password, so it is never shared. Each save can get a separate random
  **garden code** (`POST /api/save/:code/garden`, `save.garden`, 6 characters); `GET /api/garden/:garden` returns only
  the name, decor, level and beauty (misses are rate-limited). 🔗 Share shows the code and a `?garden=CODE` link;
  👀 Visit loads that decor read-only (`garden.visit`, `hud.showGardenVisit`). Returning players see a profile on the title (`accountLevel`: level, rank, runs,
  best wave, achievements, streak) instead of the story and controls.
- **Steeping** (`components/Steeping.js`, title screen after the first run): vows with ranks (more bees, tougher
  bees/bosses, faster bullets, fewer hearts, early elites, a modifier every wave, a locked Pantry). Each rank adds its
  heat to the Steep level; score and Golden Leaves get ×(1 + 0.12 × Steep). Solo only: `runVows` returns nothing for
  the Daily Brew and co-op. The level is sent to the leaderboard (`steep`) and shown there, in the HUD and on shares.
- **Keepsakes** (`components/Keepsakes.js`, title screen): one trinket per run (`meta.keepsake`). The teacup is free,
  the other 10 unlock with the harder achievements (`unlock`: Shogun, Mastery, Untouchable, Tea Scholar, Boiling
  Over, Elite Hunter, Living Legend, Flawless, Empress, Bee-zebub), and the achievement toast says so. `apply({ stats, player,
  grant })`: `grant` holds the hooks for effects that aren't stats (a skill pick, a charm, starting Awakened…).
- **Charms** (`components/Charms.js`): stacking trinkets, dropped by elites (35%, less after each drop in a wave), hives and held
  shrines (always), bosses (3, at least Uncommon) and plain bees (0.4%). They lie on the ground (`CharmDrops`, emoji
  sprites) until picked up and fly to Tode when a wave is cleared. Stat charms `apply` once per copy; the others
  trigger in `charmHit`/`charmKill` from `damageEnemy` (sources in `PROC_SOURCES`). Charm damage passes on half its
  trigger chance (`withProc`, `procScale`) and at most `PROC_BUDGET` triggers fire per frame, so chains die out.
  Loaded Dice add rolls. In co-op every player gathers their own.
  **Everything flattens out** (v0.24.8): a Steep 18 run full of elites gathered 50–90 copies of each charm, and stat
  charms that multiplied per copy gave ×200 damage and +750% speed. Stat charms now follow `stacked(base, n, cap)`
  (about `base` per copy at first, never past `cap`: damage +100%, crit +50%, speed +60%, spit rate ×2); `apply(stats,
  n)` gets the new count and applies the step from n − 1 to n. Honey Hearts stop at `HEART_MAX` (5), Loaded Dice at
  `DICE_MAX` (3) extra rolls, Leaf Battery at 3% per kill (`batteryCharge`), the Firecracker's radius at twice its
  first (`firecrackerRadius`). Charms dropped by elites and plain bees get rarer within a wave (`CHARM_FALLOFF` 0.6
  per drop, `beeCharmsThisWave`): 5 elites drop ~1.4 (was 1.8), 300 elites ~8 (was ~105). Bosses, hives, wards and
  shrines are unaffected.
- **Shrines** (`components/Shrines.js`, `setupShrine` in main.js): from wave 2, about a third of the non-boss waves get one (each usable once);
  stand on it for 0.9 s. Shrine of Chance: 1 heart for a charm (50%), two (15%) or nothing. Bitter
  Shrine (solo): the wave gets elites, frenzy, 50% more bees and a squad, then an extra Epic brew pick
  (`bonusPicks`, `offerBrews(true)`). Cursed Leaves: a `CURSES` brew (PowerUps.js, kind `curse`) with a drawback.
- **Memory** (`meta.lastRun`, `meta.bosses`, `meta.blendPicks`; `rememberRun`/`boss` in Meta.js): at a run's first
  brew offer the speaking spirit talks about the last run (its killer, depth, a god form, a victory, the Steep, a
  favourite Blend); later offers sometimes mention the favourite. Bosses taunt at their entrance from `bossTaunt`
  (first meeting, beat Tode before, lost before). Tode's line after a boss defeat names that boss.
- **Voices:** spirits and bosses babble synthesized syllables while their line types out (`babble`/`hush` in
  Sound.js, a `voice` per spirit and `BOSS_VOICES` per boss in Spirits.js, `hud.onSpeak`/`onHush`). Every syllable
  is a vowel: the voice's oscillator through two resonances (`VOWELS`, F1/F2 at 300–2,300 Hz whatever the pitch,
  so deep voices still come through phone, tablet and laptop speakers); a voice's `layer` adds a growl or a choir.
  Voices have their own bus with a limiter (`voiceBus`), and the music dips to 30% while anyone talks
  (`duckMusic`). Measured at the speakers (RMS): the boss theme ~0.13 (0.04 dipped), boss voices 0.09–0.13,
  spirits 0.05–0.10, the garden theme ~0.04; keep new voices in that range (`volume`, `VOICE_GAIN`). A boss roars at
  `BOSS_ROARS_AT` and speaks at `BOSS_SPEAKS_AT` (main.js): its taunt used to start under the roar and was drowned
  out.
- **Readability:** enemy bullets have a dark outline (back-face rim mesh) and draw after all other transparent
  effects. The pause menu's **calm effects** (`settings.calmFx`) halve particles, soften flashes, pulses and shake
  during play (cut-scenes keep the full show) and drop the spit trails.
- **Phones and tablets:** twin-stick touch controls (`TouchControls.js`): the left half of the screen is a floating
  move stick, the right half a floating aim stick (both wait faintly in their bottom corners), and dash/bomb/ultimate
  buttons sit in a row above the aim stick. Tode always spits by himself: where the aim stick points (`input.aiming`,
  `input.aimAxis`; spit's aim assist still applies), or at the nearest bee in range when it's let go. Skills always
  auto-cast (the pause menu hides that toggle). Touch mode turns on for a coarse pointer or touch without hover,
  and on the first real touch otherwise (touchscreen laptops). Graphics quality: see Graphics levels.
- **Touch HUD:** the brew and charm rows (`.inventory`) are replaced by a one-line count under the hearts
  (`.inventory-summary`); charm pickups float up from Tode instead of toasts; at most 2 toasts, low on the left;
  weather and modifier lines show only their names; banners and callouts wrap. Narrow screens (`max-width: 600px`)
  shrink hearts and score and move the wave line below them. The pause menu still lists the whole build, below its
  buttons and in its own scrolling box (`.pause .build`), so Resume stays reachable. The body has
  `touch-action: none` for the sticks, so every scrolling menu box sets `touch-action: pan-y`; panel heights use
  `dvh` (tablet `vh` includes the browser bars).
- **Screen size:** everything is sized from the layout viewport (`viewWidth`/`viewHeight` in `Viewport.js`), never
  `window.innerWidth`: on phones that grows when the browser zooms out, and a canvas sized from it made the page wider
  than the screen and kept it zoomed out (menus cut off on the right). The canvas is pinned to the screen by CSS
  (`position: fixed`, the renderer only sets its resolution) and the viewport can't be zoomed. iPhone Safari ignores
  `user-scalable=no`, so `html` has `touch-action: none` and `blockBrowserZoom()` (`Viewport.js`) cancels Safari's
  pinch (`gesture*` events) and the second tap of a quick double tap (clicking by hand when the finger didn't move;
  text fields excluded). `-webkit-tap-highlight-color: transparent` stops the blue flash over the clickable title
  menu on Android, and `-webkit-touch-callout: none` the long-press menu. Long menus and popups
  scroll, but their last `.menu-buttons` row (Back, Done, Close) is sticky at the bottom, so it's always on screen:
  the buttons float on their own (solid, with a shadow), with no bar behind them.
- **Short screens** (phones in landscape, `max-height: 500px` at the end of `style.css`): menus, popups and HUD
  widgets are shrunk with CSS `zoom` and menus scroll. World-anchored labels and objective arrows are positioned in
  screen pixels, so never zoom them (or `.hud` as a whole). Inside a zoomed element `vh` lengths shrink too.
- **First impressions (v0.25):** a new player's title shows only Start run, the class and the ways to play (Daily
  Brew, Co-op, Leaderboard) plus Visit garden; the reward chips and the run preparation buttons
  (`hud.prepareButtons`: Pantry, Keepsake, Steeping, My garden) appear after the first run, glowing ✨ New until the
  next run starts (`meta.seenUnlocks`, true for players who had more than one run before). The game-over screen hides
  the run's HUD (`body.run-ended`, set by `showMenu`) and moves toasts to the bottom-left corner. **The first
  volley** (`startFirstVolley`/`updateFirstVolley`, `VOLLEY`): Tode clears waves 1–4 standing still, so early in wave
  2 (solo) a shielded stinger bee marks 7 lanes with telegraphs for 1.5 s and fires a slow fan at Tode; it stays
  shielded (so the wave can't end and auto-spit can't kill it) until the dodge is judged: a hit says "Ouch", no hit
  for 2.4 s says "Nimble!" and drops tea leaves and points. **Gentle Brew** (`GENTLE` in Steeping.js, `meta.gentle`):
  +3 hearts, one extra life, stingers ×0.8 (`launchStinger`), score ×0.5; solo outside the Daily Brew only, vows
  don't apply (taking a vow switches it off). The game-over screen offers it after a death before wave 10 by a player
  whose best is below wave 10 (`offerGentle`); the title footer toggles it (`toggle-gentle`). Scores carry `gentle`
  (🌿 on the boards).
- **Title screen layout:** in order of importance: (after the first run) the profile and the reward chips; a big
  Start run; the ways to play (Daily Brew, Co-op, Leaderboard); smaller run preparation (Pantry, Keepsake, Steeping,
  My garden, Visit garden); then small pills (save code, fullscreen, What's new with the version). Keep new entries in that order rather than adding full-size buttons.
- **Fullscreen:** a button in the title and pause menus (`Fullscreen.js`, with the `webkit` API for iPad Safari).
  iPhone Safari can't make a page fullscreen at all (only videos), so there the button opens a how-to for **Add to
  Home Screen** (`needsHomeScreen`, `hud.showFullscreenHelp`, shown once by itself on the first visit): the game is
  installable (`public/manifest.webmanifest` with `display: fullscreen`, Apple's `apple-mobile-web-app-*` meta tags,
  `apple-touch-icon.png` and icons rendered from the voxel Tode) and runs without browser bars from the Home Screen.
  `viewport-fit=cover` lets the game fill the screen around the notch; the HUD, menus, popups, corner and touch
  buttons, toasts and the resting thumbsticks keep clear of it with the safe-area insets (`--safe-*` in `style.css`,
  `safeInsets()` in TouchControls.js), while the world-anchored layers (labels, arrows, the hurt flash) are pushed
  back out to the full screen so they stay over their bees. Zoomed widgets (short screens) divide the inset by the
  zoom. Menus redraw on `fullscreenchange` (`refreshMenu`).
- **Healing and the ultimate:** Stolen Honey and Herbal Remedy share a 12 s cooldown (`LIFESTEAL_COOLDOWN`);
  Petal Shield and Stolen Honey upgrades always improve the current value (their card text depends on the level).
  The ultimate gauge fills by the health actually taken off bees divided by the wave's `hpScale`, so it charges at
  the same pace all run.
- **Co-op carries everything:** Pantry upgrades and the keepsake apply in co-op (`startRun` is the same), and since
  v0.24 so does Steeping: the host's vows go out with the `start` message (`runVows({ coop, shared })`), the room
  view shows the Steep and the host's "Change vows" button opens the Steeping screen (`showSteeping('room')`).
  Co-op scores go to their own boards (`coop2`/`coop3`/`coop4` in server.js, with the `team`); only the host
  submits. Wards and guardians attuned to a player get a ring in the owner's colour (and a pillar of light for your
  own), arrows only point at yours, and hitting a teammate's says whose it is (`lockedHint`).
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
  run pays ~35, a wave-20 run ~85, the whole Pantry of 8 upgrades costs ~6,000) for permanent upgrades in Tode's
  Pantry (title screen),
  and Tode says a story line after each run. **Cloud saves** (`components/CloudSave.js`, `server/saves.js`): the
  server owns leaves, Pantry levels, achievements and run stats. Every browser gets a save code (`MINT-FROG-42`,
  two words and a number) on its first visit. A ☁️ pill on the title screen and in the Pantry opens the save
  popup (`hud.showSave`): copy the code or load another one. At start the server's copy replaces the local one (so editing localStorage doesn't stick); a finished
  run is reported (`reportRun` in `endRun`) and the server computes the leaves itself with the shared rules
  (`leavesForRun`, `PANTRY`, `ACHIEVEMENTS`, `steepBonus` are imported from `src/`, so the server needs the `src`
  folder next to it), accepts achievements only when the run fits them (`earned()`), and refuses a run whose
  playtime exceeds the real time since the previous report. Pantry purchases are checked too (`reportBuy`).
  Elite kills may not exceed kills (with the elite vow and Elite Surge most late bees are elites; a cap per wave
  refused a Steep 18 run in v0.24.6). A refused report shows a toast with the reason (`cloud.onRefused`,
  `hud.runRefused`); the game-over screen's leaves are only the local estimate.
  Achievements unlocked this session wait in memory (`notePending`) until the next run report. Reports that don't
  get through wait in `tode-unsent-runs` (see Deploying while people play). Without a server
  the game falls back to local progress. Forged requests can still cheat; this only stops storage edits.
  **Leaderboards** via `game/server`: score, deepest run (wave, then
  level), fastest Bee-zebub (clear time; any run with a `clear`, also one that died later in endless) and a seeded
  **Daily Brew**. The run timer (top right) only counts
  fighting: menus, skill picks, cut-scenes and pauses don't count. Saved in `localStorage`: `tode-meta` (also vows, keepsake and memory), `tode-best-score`, `tode-sound`, `tode-settings`, `tode-name`, `tode-save-code`, `tode-unsent-runs`.

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
- **Quality** (`components/Quality.js`, the Graphics section in main.js): the player picks 🖥 Auto / High / Low
  (`settings.graphics`, pause menu and title pill). It applies a **step**: 0 everything, 1 no bloom (and no sanitize
  pass), 2 no multisampling and **lite** (`PostFX.render` draws straight to the screen while no flash, shatter,
  warp or aberration runs; lite drops the steady warp, and a CSS `.css-vignette` replaces the shader's), 3 no
  shadows, 4 **Low**: also resolution 0.5–1×, 45% particles, plain character materials in every arena
  (`applyCharacterGraphics`) and no arena floor shaders or motes (`userData.arenaFx`, `applyArenaFx`). Auto starts
  at 4 when `looksWeak()` (≤2 GB memory, a phone with ≤4 cores, a tiny screen or a known weak GPU) and otherwise walks
  down `AUTO_LADDER` (resolution and steps in turns, two at once below 25 fps) in 2 s windows under 45 fps; steps
  never come back in a session. High only lowers the resolution (and shadows below 30 fps). The canvas itself has
  no antialiasing: the composer's multisampled targets do it. Measured on a Mac at the same resolution in the
  Tournament: 6.1 ms per frame at step 0, 2.0 ms at Low. 📈 `settings.showFps` shows fps, resolution and the step.
  In the console: `game.quality`, `game.setQualityStep(n)`.
- **Safety:** PostFX first runs a sanitize pass (NaN/Inf → black, values capped at 6) so a bad pixel can't become
  a flickering black box and a pile of additive particles can't haze the screen. Arena particles (`motes`) use a
  shader that caps point size and fades points near the camera.

## Co-op multiplayer (2–4 players)

Title screen → 👥 Co-op → ⚡ Quick play, join a listed public room, create a public or private room, or join one
with its 4-letter code; the host starts the run. Needs the server (`npm run server` in development; the Vite dev
server proxies `/ws` and `/api`).

- **Public rooms** (v0.20): a room is public or private (`room.public`; the host flips it with `visibility`).
  `GET /api/rooms` lists the public rooms that aren't running and have space, fullest first (`openPublicRooms`,
  at most 50 shown, `MAX_PUBLIC_ROOMS` 200 in all), plus how many frogs are in a run. Quick play (`quick`) joins the
  first of them or creates a public room. The lobby polls the list every 3 s (`pollRooms`, only the `.room-list`
  is redrawn so a typed name survives) and the title screen every 15 s for the Co-op button (`setCoopRooms`). When a
  run ends the host sends `open`, so the room is listed (and joinable) again until the next start.

- **Authority split.** The host's browser runs the bees, waves, bosses and weather and sends snapshots (15/s).
  Every player runs their *own* Tode locally (movement, abilities, damage) and streams its state (20/s).
  Guests forward their hits (`k: 'hit'`) and statuses (`k: 'st'`) to the host, which applies them.
- **Replication by events.** Spits, splashes, skills and ultimates are sent as events and replayed on the other
  screens as visuals only (`remoteCtx()` in main.js gives a context whose damage hooks do nothing). Shared hazards
  (stingers, storm strikes, boss rain, explosions) are simulated by everyone, each checking hits on their own Tode.
- **Flow.** After a wave each player picks their own rewards; the host waits until everyone is ready (or 40 s).
  A fallen Tode is *downed*: it spectates a teammate and gets back up at the next wave. The run ends when everyone
  is down. The garden grows (25 → 31 → 35 → 41 tiles), and per extra player waves get 60% more bees that are 30%
  tougher, bosses 80% more health (`COOP_*` in main.js); bigger maps get extra spawn points on the edges. The first
  waves felt empty for a team, so they get another 100% per extra player on top (`COOP_EARLY`, fading out by wave 7,
  `coopEarly()`), and the spawn interval is divided by the same factor (`coopShare()`), so bigger swarms don't
  trickle in.
- **Experience in co-op:** everyone collects their own copy of every bee's leaves (and charm drops), so leaf values
  and charm odds are divided by the swarm growth (`coopShare()`): each frog levels at about the solo pace.
- **Code.** `components/Net.js` (WebSocket client, batched messages), `components/RemoteTode.js` (teammate
  puppets with their own ascension visuals and name tags), the "Co-op" section in `main.js` (snapshots, mirrors,
  message handling, lobby), and the relay in `server/server.js`.
- **Arenas** follow the wave number, so every screen travels on its own when the host's `wave` message arrives
  (the host sends it before its own travel). Brimstone Rings are events (`k: 'fring'`), simulated by everyone.
- **Restarts:** a dropped connection or a server restart doesn't end the run; everyone reconnects into the same
  room (see Deploying while people play).
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
| `components/Skills.js` | 14 skills (`SKILLS`) and the `SkillBook` (6 slots, cooldowns, auto-cast targeting). |
| `components/Spirits.js` | The tea spirits and their dialogue (greetings, Legendary lines, Duo exchanges, memories of past runs, voices) and the bosses' taunts. |
| `components/Divinity.js` | World transformation per ascension tier (variant trees/rocks, lanterns, petals, crystals, islands, heaven). |
| `components/Random.js` | Seeded randomness for the Daily Brew (`seeded(fn)` swaps `Math.random` only inside `fn`). |
| `components/Leaderboard.js` | Client for the leaderboard API; fails quietly without a server. |
| `components/CloudSave.js` | Cloud save client: save code, sync at start, run and Pantry reports. |
| `components/Net.js`, `components/RemoteTode.js` | Co-op networking (rooms, Quick play, `fetchRooms`) and teammate puppets (see Co-op above). |
| `components/Presence.js` | `startPresence(state)` / `setPresence(state)`: the presence socket for the admin stats (see Admin). |
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
| `components/GardenPhysics.js` | Height fields: what frogs stand on in a garden (the house, trinkets). |
| `components/Emotes.js` | Garden emotes and their achievement unlocks. |
| `components/PlayerTag.js` | The player tag rules: name cleaning and filtering, colours, random names, #tags (shared with the server). |
| `components/Quality.js` | The Auto / High / Low setting: quality steps, `looksWeak()` device guess. |
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
| `components/Classes.js` | The frog classes: stats, starting kits, the chosen class and the class of the day. |
| `components/DailyTwists.js` | The Daily Brew's trials and boons per day (no three.js: the server imports it). |
| `components/Rewards.js` | Daily gift, kettle, trinket list and unlocks, decor cleaning, account level (shared with the server). |
| `components/TrinketModels.js` | Procedural models of the 23 trinkets. |
| `components/TitleGarden.js` | The trinkets on the title screen, the garden camera and the editor (raycasts onto the lawn). |
| `components/GardenHub.js` | Gardens as a meeting place: hopping, jumping and stacking, garden rooms, invite circles and parties. |
| `components/ClassPortraits.js` | Renders each class's frog once into a portrait for the menus (a small throwaway WebGL renderer). |
| `components/FrogModels.js` | The player frogs (since v0.17; `tode.glb` is no longer used): procedural voxel frogs in Tode's style with real joints (head, jaw, tongue, throat, blinking eyes, arms, folding legs) and animations: idle, hop, spit, dash, victory and a signature move per class. Seven classes: Tode, Brawler, Sharpshooter, Alchemist, Mage, Summoner (calls up a giant Ancient Pond Toad, the hidden `giant` look; his little `pondling` companions) and Ninja. Effects (`smoke`, `runeCircle`, `sparks`) are pure functions of time, so frozen frames match live ones. The Summoner and Ninja are inspired by ninja-anime toads but deliberately original (no leaf headband, no copied characters or names): keep it that way for the challenge rules. Built Y-up facing +Z. |
| `dev/classes.js`, `../classes.html` | Dev-only preview of the classes (`/classes.html` while `npm run dev` runs; not in the production build): the five frogs cycling their moves, with camera buttons. `preview.sheet([...])` in the console renders a contact sheet of frozen moments. |
| `../server/server.js` | Node server: static hosting of `dist/`, `/api/scores` leaderboards (score, depth, speed, daily) and the co-op relay. |
| `../server/saves.js` | `/api/save` cloud saves (`saves.json` in `DATA_DIR`): codes, run rewards, Pantry purchases, rate limits. |
| `../server/store.js` | Safe JSON files: atomic writes, `.bak` and daily backups, refuses to start over a broken file. |
| `../server/admin.js`, `../server/admin.html` | The owner's `/admin` page and `/api/admin/…` API (only with `ADMIN_TOKEN`; see Admin). |
| `../server/presence.js` | Presence sockets (`/ws?presence=1`): online count by state, peak, limits, pings. |
| `style.css` | All UI styling. |

## Conventions and gotchas

- **The world is Z-up.** glTF models are Y-up, so they get `rotation.x = Math.PI / 2`; procedural props are
  modelled Y-up and turned with `model()` in `Environment.js`. Facing: `model.rotation.y = atan2(dx, -dy)`.
- The camera is a child of the player group at offset `(300, -300, 300)`. WASD is camera-relative:
  screen-right = `(1, 1, 0)`, screen-up = `(-1, 1, 0)`.
- **Every damage source goes through `damageEnemy()`** in `main.js`, so kills, score, the ultimate gauge, Hailstorm's
  double damage and the damage multiplier stay consistent. Its options: `raw` (the amount is final, no multipliers)
  and `steady` (a stream of hits that shouldn't hit-stop each tick). Lightning should also call `lightningHit()`.
- Effects may spawn other effects during `update()`; `Effects.update` handles that, so keep using `effects.addEffect`.
  Each effect updates in its own try/catch: an exception used to drop every effect still in flight from the list
  undisposed, and they stayed frozen in the scene into the garden (v0.24.7). Objects an effect adds to the scene
  outside `Effect.add` (skill roots, ultimates, the biscuit) are tagged with `markEffect`, and `effects.clear()`
  also removes any tagged object left in the scene.
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
  smoother each arena. Every regular bee must read as a bee: bold dark/gold stripes and see-through, buzzing insect
  wings (a style's `bugWing` tints them); only the boss queens keep the feather or bat wings of their style. Geometry is cached per kind and arena and marked `userData.shared`/`keepGeometry` so
  dispose leaves it alone. Their hitboxes match the glTF bee (`HITBOX_PER_SCALE`), so balance doesn't change. The HUD runs every frame, so it only writes to the DOM when a value changed
  (`setText`/`setStyle` in `Hud.js`). Adaptive resolution won't climb back to a ratio that proved too slow.
- Constants for tuning sit at the top of each file (`main.js`, `Player.js` `BASE_STATS`, `Enemy.js`
  `ENEMY_TYPES`, `Waves.js`).
- **The frame loop must not throw.** three.js asks for the next frame only after `setAnimationLoop`'s callback
  returns, so one exception per frame froze the whole game (v0.24.2: the `flip` move read the Ninja's `gear.tails`
  on every frog, and the garden's cannon and Backflip emote play `flip` on any class). The callback now catches and
  logs each distinct error once. Any rig move can be played on any class (emotes, garden events), so a move that
  touches class gear must guard it (`gear.x ?? []`, `if (gear.x)`), and anything a move shows must be hidden again
  at the start of `rig.update` (like `gear.flying`, the Alchemist's thrown vial). Entering or leaving a garden plays
  `idle`, so a title-screen move or an emote doesn't carry over.
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
game.ultimate('summon')   // then press E for the Great Tode
game.charm('spoon', 5)    // gain charms (no id: a random one); game.charmCounts
game.shrine('bitter')     // put a shrine in the arena now: 'chance', 'bitter' or 'cursed'
game.bullets.list         // enemy bullets in flight
game.level                // Tode's level (tea leaves)
game.event('lighthouse')  // start an arena event now (see ARENA_EVENTS)
game.tactic('surround')   // start a hive manoeuvre now: 'surround', 'crossfire' or 'rolling'
game.squad()              // spawn a random squad
game.autoPause = false    // stop auto-pausing on window blur (needed for background test tabs)
game.persist = false      // don't save progress or the best score this session (use it before bot runs)
game.meta.trinkets.push('duck'); game.syncGarden()  // test trinkets and rewards with changed progress
const bot = game.makeBot(); bot.run(300)  // autoplay 300 s and get a log of waves, picks and death
```

Tip for AI agents with an embedded browser: a hidden browser pane pauses `requestAnimationFrame`, so drive the game
with `game.step()` and take a screenshot to see the result. A hidden pane can also show a stale canvas; for exact
shots copy `game.renderer.domElement.toDataURL()` into a full-screen `<img>` right after a step. Setting
`game.player.invulnerableLeft` makes Tode blink (model and aura hidden on some frames). Co-op can be tested with
two tabs against `npm run server` (stepping each tab in turn, with short awaits for the messages). `step()` renders only its last frame; CSS animations
(banners) run on real time, so a screenshot right after a long step can still show them.

Boss balance (Oct 14, v0.16, the bot with 300 hearts, measured with a harness around `bot.run`): player damage spreads
very widely late in a run, about 300–600 per second for a weak random build at waves 20–21 and 1,100–2,500+ for a
strong one, so boss health is set for a weak build to win in ~3 minutes, inside the enrage timer, and a strong one
in about a minute. Fights measured (shielded time in brackets): Queen 64–85 s (32–44), Shogun 41–68 s (17–28),
Seraph 51–93 s (40–47), Empress 70 s (41) with a strong build, Bee-zebub 35–71 s (5–26) with a strong build that
kept growing. Before v0.16 the phase lock made 30–60 s of most fights "no progress": Shogun 78 s with 30 s locked,
Seraph 121 s with 52 s, Empress 118 s with 48 s, Bee-zebub 147 s with 59 s.

Balance reference (Oct 14, v0.12): the bot can't do raid mechanics well (it flees the boss instead of walking to
circles), so it dies at the first or second boss; with 80 hearts a Queen fight took ~50 s and a Shogun fight ~45–70 s
through all stages. Earlier (v0.11 with raid bosses and tactics): the bot (perfect aim, random picks, dodges bullets
but not telegraphed strikes or lunges, walks into shrines and circles of light) died at waves 5, 10 and 15 (the
Shogun's charges during his shield phase are its usual end). Before v0.11 it died at the wave-10 Shogun twice and
at wave 16 once. Humans will find the bullet patterns harder than the bot does. See `SUBMISSION.md` for the contest post kit.

## Ideas / roadmap

- Readability seen while making the trailer: the Sky Citadel at golden hour plus a high ascension form washes out
  to near white (the Steeping Beam's white-out was toned down in v0.24.9). Tode himself is hard to spot inside the
  God of Tea aura.
- More variety: new bee behaviours per arena (not only looks), more brews and charms.
- Co-op: Steeping is solo only and the Bitter Shrine doesn't appear (it changes the host's waves).
- Arenas are only seen from the gameplay camera's steep angle (sky domes show in the travel cut-scenes); a giant
  landmark per arena placed toward the camera's view (-x, +y) is what reads best in play.
- The Divinity world transformations (blossoms, lanterns, heaven) only apply in the garden.
- The music mix has not been checked by ear; volumes in `Music.js`/`Sound.js` may need tuning.

## Credits

- `tode.glb`: from the JetBrains Academy course (the original Tode; since v0.17 the frogs are built in code, in his style).
- `enemy.glb`: "Armabee Evolved" by Quaternius, [CC0](https://creativecommons.org/publicdomain/zero/1.0/), via [Poly Pizza](https://poly.pizza/m/GcttdvsqsQ).
- `small_house.glb`: "Small House" by Jarlan Perez, [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/), via [Poly Pizza](https://poly.pizza/m/053kskrV4U_).
- Everything else (scenery, effects, music, sound) is generated in code.
