# Todeity: Rise of the Tea God: submission kit

Everything for the JetBrains Academy Build Your Game Challenge post (submissions open **Mon Oct 19, 10:00 CEST**;
voting until Oct 23, 11:00 CEST; winners Oct 28). Rules recap: start public posts with **#JetBrainsGameChallenge**;
no third-party trademarks or logos, recognizable characters, memes, or commercial music or recordings (Todeity uses
none: all music and sound are generated in code, all scenery is procedural).

Numbers below are counted from the code (v0.29.4, Oct 17). Recount them if content changes before posting.

## One-liner

> A frog. A cup of tea. A thousand bees. **Todeity** is a 3D roguelite bullet hell where Tode the Frog brews divine
> powers between waves and ascends from garden frog to **God of Tea**, while the world itself transforms around him.

## What I added to the course game

The course game: Tode defends his garden from bees in one arena. Todeity keeps that heart (the frog, the garden,
the bees, the spit) and builds a whole roguelite around it:

- **A run with a story:** five arenas from the garden to the Underworld, raid bosses with stages and mechanics, and a
  finale against Bee-zebub, who rises again in his true form, plus an endless mode.
- **Build-crafting:** brews from talking tea spirits, auto-casting skills that fuse, charms that stack and chain,
  ultimates, keepsakes and seven frog classes.
- **Transformation:** five ascension forms with cut-scenes, and the garden itself turns divine with them.
- **Bullet hell:** fans, rings, spirals and telegraphed volleys; dodge, hop-dash through, and *graze* for rewards.
- **Meta and community:** cloud saves, a Pantry of permanent upgrades, Steeping difficulty vows, a seeded Daily Brew,
  leaderboards, 2–4 player co-op, a Wardrobe of 54 earnable wearables, and gardens where players meet, decorate,
  play Leaf Rush, swim in the pond, fire each other out of a teapot cannon and form parties.

## Post draft (short)

#JetBrainsGameChallenge 🐸☕ **Todeity: Rise of the Tea God**

Tode just wanted his morning tea. Then the bees came.

Pick a frog, brew powers from five tea spirits, fuse your skills, and watch Tode transform: *Awakened → Golden →
Radiant → God of Tea → Omnitode*, while his garden blooms into a floating marble heaven. Five arenas, raid bosses all
the way down to **Bee-zebub**, who doesn't stay down. A **Royal Tea Chest** from every boss, a Steeping Beam that melts
them, and a Wardrobe full of crowns, capes and wings you earn along the way.
Solo, on your phone, or in **co-op with up to 4 friends**, then hang out in each other's gardens.

▶ Play free in your browser: https://todeity.azurewebsites.net
🎬 Trailer: <YouTube link> (or attach `todeity-trailer-discord.mp4`)

Built from the "Build a Game with an AI Coding Agent" course with Claude Code as my AI pair: Three.js, procedural
world, all music and sound generated in code.

## Discord post (copy and paste)

About 1,100 characters (Discord's limit is 2,000).

```
#JetBrainsGameChallenge 🐸☕ **Todeity: Rise of the Tea God**

A frog. A cup of tea. A thousand bees.
Tode just wanted his morning tea. Then the bees came. Brew powers from five tea spirits, ascend from garden frog to **God of Tea**, and fight through five arenas and raid bosses all the way down to **Bee-zebub**, who rises again in his true form.

▶ **Play free in your browser:** https://todeity.azurewebsites.net
🐸 7 frogs · 🎁 a Royal Tea Chest from every boss · ✦ graze bullets for power
👑 54 crowns, capes, wings and auras to earn and wear
👥 Co-op for up to 4, or meet other players in their gardens: Leaf Rush, a pond, a teapot cannon (👀 Visit garden)
📅 A new **Daily Brew** every day: same seed for everyone, one leaderboard
🌿 New to bullet hells? Gentle Brew gives you extra hearts · 🔥 Too easy? Take Steeping vows
📱 Works on phones and tablets too

Post your run card below (📤 Share run → Copy image on the game-over screen) and tell me how far you got!
Made from the "Build a Game with an AI Coding Agent" course with Claude Code: Three.js, procedural world, all music and sound generated in code.
```

Attach `todeity-trailer-discord.mp4` (or `todeity.gif`). Discord unfurls the game link with the banner by itself.

## How I built it (paste into the post or a reply)

> Todeity started as the course's frog-and-bees game on Oct 13 and grew in five days of directing Claude Code (Anthropic's
> AI coding agent): 67 commits, about 34,000 lines of JavaScript, a Three.js client and a small Node server for
> cloud saves, leaderboards, co-op and gardens. I set the direction, played every build and said what felt wrong; the
> agent wrote the code, and kept a handoff document (`DEVELOPMENT.md`) up to date so every new session could pick up
> where the last one stopped. Nothing is a bought asset: the frogs, bees, bosses, arenas and wearables are built
> from code, and the soundtrack, voices and sound effects are synthesized in the browser. Balance came from an
> autoplay bot the agent wrote to play run after run (it is how we found a build that killed bees half a second
> after they spawned, and taught the hive to adapt). Even the trailer is rendered by a script that drives the game
> frame by frame.

(About 150 words. Recount commits and lines on posting day: `git log --oneline | wc -l` and
`cat src/*.js src/components/*.js src/dev/*.js server/*.js server/*.html index.html classes.html | wc -l` in `game/`.)

## Feature highlights (for the longer post or the video captions)

- **Seven frogs:** Tode, the Bullfrog Brawler (spinning axes), the Tree Frog Sharpshooter (piercing darts), the Toad
  Alchemist (lobbed potions), the Starleaf Mage (homing fireballs), the Toad Summoner (pond toads and a giant Ancient
  Pond Toad) and the Ninja Toad (throwing stars and decoy logs), each a fully animated voxel frog with a signature move.
- **Brews from talking tea spirits:** 27 brews in 5 Blends (Green Tea, Ember Black, Frost Mint, Chamomile, Storm
  Oolong) with rarities, 8 Duo brews, 5 Legendaries and 5 cursed brews with a drawback (45 in all). The spirits
  remember your last run; bosses taunt you about theirs.
- **24 auto-casting skills, 13 fusions:** level a skill up, and when two partners are trained up they fuse into one
  (a rainbow card). Mastered skills cast twice. Six at once, so the action never stops.
- **14 charms** that stack (with diminishing returns, so builds stay sane) and chain into each other (lightning, homing
  biscuits, firecrackers), dropped by elites, hives, shrines and bosses.
- **Royal Tea Chest:** every boss leaves one. A reel spins and lands on 1, 3 or 5 rewards.
- **Ascension:** five transformations with cut-scenes (golden flame aura, lightning, a halo, a crimson vortex, a galaxy
  underfoot), and the garden transforms with Tode: blossoms, lanterns, crystals, floating islands, a marble heaven.
- **Three ultimates:** the Steeping Beam (sweep it through the swarm, or hold it on a boss and watch it melt), the
  Thunder Tea Storm, and Summoning: Great Tode (a giant battle toad that stomps, tongue-lashes and body-slams).
- **Roguelite bullet hell:** fans, rings and spirals; 8 arena events (bullet curtains, a lighthouse of stingers,
  closing rings, starbursts); hive tactics (encirclements, phalanxes, synchronized volleys). Hop-dash through bullets,
  and **graze**: near misses sparkle and charge your ultimate. When a boss breaks into a new stage, every bullet turns
  into a tea leaf.
- **The hive adapts:** shred bees too fast and they come back tougher and in packs, so even a maxed-out build stays a
  fight.
- **Raid bosses:** Queen Buzzbelle, the Hornet Shogun, the Seraph Queen, Empress Buzzbelle, then the ground gives way
  and you fall into the Underworld to face **Bee-zebub**, a winged devil in a fire aura. Beat him and he **rises again
  in his true form**: bigger, faster, crowned in hellfire, with new stages. Shields with circling crystals to smash,
  rituals to interrupt, a ring of fire, beam clashes you win by mashing, enrage timers.
- **Five arenas:** Tode's Garden → Sage Mountain → Sky Citadel → Tournament of the Gods → the Underworld, each with
  its own bee species, hazards, side objective and sky; the graphics get richer with every arena.
- **Weather and time of day:** tea rain, gales and thunderstorms, from morning to night. Wave modifiers, shrines,
  cursed tiles.
- **Difficulty for everyone:** Gentle Brew (extra hearts and an extra life) after an early fall, and 10 Steeping
  vows (up to Steep 25) for more score and Golden Leaves.
- **Meta progression:** Golden Leaves for Tode's Pantry (13 permanent upgrades), 17 keepsakes, 39 achievements, cloud
  saves with a save code, a daily gift and a kettle that brews rewards every 4 hours, and an account level with seven
  ranks from Tadpole to Todeity that shows as an aura around your frog in gardens.
- **The Wardrobe:** 54 wearables in five slots (14 hats, 9 face, 9 body, 10 back, 12 auras): a crown, a ronin helm,
  devil horns, a grand moustache, a golden breastplate, draped capes, butterfly and infernal wings, a steam jetpack,
  auras of petals, embers and stardust. Four are free; the rest are earned with achievements, levels and divine forms.
  Every class can wear everything, and you wear it in runs, in co-op and in gardens.
- **Community:** leaderboards (score, deepest run, fastest Bee-zebub, Daily Brew, co-op; every run goes on by itself,
  one best entry per frog), a seeded **Daily Brew** with daily twists (13 trials, 12 boons), **co-op for 2–4** with
  public rooms and Quick play, and **gardens**: decorate yours with 27 trinkets in 8 sets, pick one of 7 garden songs
  and day or night, visit other players' gardens, hop on each other's heads, play **Leaf Rush** (30 s, grab the most
  leaves), swim in the pond and skip stones, kick the Tea Ball, fire the Teapot Cannon, boop frogs and trinkets, use
  17 emotes (Power Up shows your highest divine form with a sonic boom), and form a party that sets off on a co-op run
  together.
- **Juice:** slow-motion finishers, hit-stop, kill-streak callouts, a procedural orchestral soundtrack, synthesized
  voices for spirits and bosses.
- **Readable chaos:** a ring under your frog and his outline through anything in front of him, outlined bullets, and
  a calm-effects setting.
- **Plays anywhere:** keyboard and mouse, or twin-stick touch controls; installable to the Home Screen; adapts its
  graphics quality to the device.

## Promo assets (`game/promo/`)

Made on Oct 16 from **v0.25.2**: no Wardrobe, no garden games, no true-form Bee-zebub, no level auras. Re-render
from the shot list below before posting (how: DEVELOPMENT.md, Promo material). The MP4s and GIFs are not in git (too
big); they are in `game/promo/` on the machine that made them.

| File | Use |
| --- | --- |
| `todeity-trailer-1080p.mp4` | The trailer with the game's own music: upload to YouTube, link it in the post |
| `todeity-trailer-720p.mp4` | X / LinkedIn / anywhere that wants a smaller file |
| `todeity-trailer-discord.mp4` | 960×540, under 10 MB: attach to the Discord post, plays inline (muted until clicked) |
| `todeity.gif` | 12 s highlights, 480 px, ~7 MB: for places that don't play video |
| `todeity-chest.gif`, `todeity-ascension.gif`, `todeity-bosses.gif`, `todeity-garden.gif` | Short loops for replies and comments |
| `todeity-banner-1200x630.jpg` | Link preview / social card (also `public/og-image.jpg`) |
| `todeity-banner-1920x1080.png`, `todeity-banner-2400x1260.png` | Hi-res banner for posts and slides |
| `todeity-header-1500x500.png` | X / profile header |

Worth adding: a `todeity-trueform.gif` (the cold open) and a `todeity-wardrobe.gif` (scene 12) for replies.

## The new trailer (about 60 s, for v0.29)

The old cut opened on a calm garden; a voter scrolling past sees nothing happen for five seconds. The new one opens on
the most dramatic moment in the game, then cuts to the calm garden for the story beat, and adds the Wardrobe and the
garden games at the end.

**Music** (`music.mjs`, sections are `[song, intensity, bars]`):

```bash
node music.mjs '[["boss",4,1],["garden",0,2],["battle",2,4],["battle",3,6],["divine",4,4],["boss",4,6],["garden",0,6]]' work/trailer.wav
```

Frames per bar, measured from the current scenes at 30 fps: garden ~78.5, battle ~54.5, divine ~51.5, boss ~64.8.
Check them against the `starts` that `music.mjs` prints before setting each scene's `N`, so cuts land on the beat.

**Shots** (scenes in `promo/capture/scenes/`; "keep" means the existing script as is, "new" ones are sketched below):

| Time | Music | Scene | What we see | Caption |
| --- | --- | --- | --- | --- |
| 0:00 | boss, 1 bar | **00-trueform** (new) | Bee-zebub falls, the screen cracks, he rises again twice the size in hellfire | none; the game's own banner "Bee-zebub rises again!" |
| 0:02 | garden, 2 bars | 01-title (keep) | Hard cut to the quiet garden, Tode on the path | Tode just wanted his morning tea. |
| 0:08 | battle, 2 bars | 02-swarm (keep) | A ring of 30 bees closes in | Then the bees came. / A 3D roguelite bullet hell |
| 0:11 | battle, 2 bars | 03-bullets (keep) | The noose and a starburst, Tode hop-dashing through | Dodge, dash, graze |
| 0:15 | battle, 2 bars | 04-picks (shorten to one pick) | A skill pick with a rainbow fusion card | 24 skills · 13 fusions |
| 0:19 | battle, 2 bars | 05-frogs (keep) | Class picker, then the Brawler and the Mage in action | Seven frogs |
| 0:23 | battle, 2 bars | 06-chest (keep) | The Royal Tea Chest reel lands on ×5 | A Royal Tea Chest / From every boss |
| 0:27 | divine, 4 bars | 07-ascend (keep) | Golden, then God of Tea | Ascend / From garden frog to God of Tea |
| 0:34 | boss, ~1.6 bars | 08-beam (keep) | The Steeping Beam on the Shogun | Unleash ultimates |
| 0:37 | boss, ~1.6 bars | 09-summon (keep) | The Great Tode stomps a crowd | Summon the Great Tode |
| 0:41 | boss, ~1.2 bars | 10-underworld, the fall only (cut 10x) | The ground gives way into the Underworld | none |
| 0:43 | boss, ~1.6 bars | 11 (keep) | Raid boss mechanics | Raid bosses / Stages · shields · enrage timers |
| 0:47 | garden, 2 bars | **12-wardrobe** (new) | In the garden, the frog tries on a crown, a mantle, wings and an ember aura, then Power Up | Dress up your frog / 54 things to wear, all earned |
| 0:52 | garden, 2 bars | **12b-garden** (new) | Leaf Rush, a cannon shot into the pond, a skipped stone | Play together in gardens / Leaf Rush · co-op for up to 4 |
| 0:57 | garden, 2 bars | 13-end (keep) | End card | Play free in your browser |

`assemble.py` order becomes `['00','01','02','03','04','05','06','07','08','09','10','11','12','12b','13']`, and
`render.sh`'s default list gets `00` and `12b`. Scene 10 no longer needs its `10x` record (the cold open shows
Bee-zebub); drop it so the boss section is 6 bars. Total ≈ 1,830 frames, about 61 s.

**New scene sketches** (untested; write them like the existing ones, then check the contact sheets):

- `00-trueform.sh`: `$C reload "$META"`, then in `eval`: `$startRun`, learn a strong build (`comet`, `thunder`,
  `fireflies` ×3 as in scene 10), `game.startWave(21)` and `waitFor(() => boss() && game.phase === "fighting", 60000)`,
  `game.setTier(4)`, `below(240)` for a few frames so both are in view, then `boss().hp = 1` and `ff(0.2)`: the next
  hit calls `riseAgain` (the roar, the crack, the banner, his intro). Start recording one frame before the hit; about
  65 frames.
- `12-wardrobe.sh`: put an outfit in the veteran save first (`meta.profile.outfit = {}`, `metaClass`-style python
  edit of `$META`), open the garden (`[data-action=garden]`), then `game.action('garden-wardrobe')`. In `each`, call
  `game.action('wear', { id })` on the beat: `crown` (n=10), `royalcape` (n=40), `fairy` or `batwings` (n=70),
  `embers` (n=100); close the panel at n=120 and `game.action('emote', { id: 'power' })`. The veteran save
  (`meta-vet.json`: every achievement, `maxTier` 4, about level 10) unlocks all of these; Stardust and the other
  Omnitode or high-level items need `maxTier: 5` or more runs in that save. About 157 frames.
- `12b-garden.sh`: open the garden as in scene 12, `game.action('garden-rush')` (a 3 s countdown, then leaves fall:
  start recording after `ff(3)`), walk the frog through the leaves with `__pilot.setKey` as scene 12 does, and for the
  second half aim at the teapot cannon or the pond (`POND` in Environment.js) so the shot ends in a splash. About
  157 frames.
- **Co-op**, if there's time: the harness drives one browser, so record 10–15 s of a real 2–3 tab co-op run with OBS
  (1920×1080, each frog in a different outfit) and use it instead of `12b`, or as a separate clip for replies.

**YouTube chapters:**

```
0:00 He doesn't stay down
0:02 Tode just wanted his morning tea
0:08 Then the bees came
0:11 Dodge, dash, graze
0:15 Skills that fuse
0:19 Seven frogs
0:23 The Royal Tea Chest
0:27 Ascend: Golden Tode, God of Tea
0:34 Ultimates: the Steeping Beam
0:37 Summon the Great Tode
0:41 Down to the Underworld
0:43 Raid bosses
0:47 Dress up your frog
0:52 Gardens and co-op
0:57 Play free in your browser
```

(Recheck the times against the rendered video: they follow the bar lengths above.)

**YouTube title:** Todeity: Rise of the Tea God · trailer (#JetBrainsGameChallenge)

**YouTube description:**

```
#JetBrainsGameChallenge
Tode just wanted his morning tea. Then the bees came.
A 3D roguelite bullet hell in your browser: pick one of seven frogs, brew powers from talking tea spirits, fuse your skills and ascend from garden frog to God of Tea, all the way down to Bee-zebub in the Underworld, who rises again in his true form. Earn crowns, capes and wings, play Leaf Rush in each other's gardens, or team up in co-op for up to 4.

▶ Play free: https://todeity.azurewebsites.net

Made from the JetBrains Academy course "Build a Game with an AI Coding Agent" with Claude Code. Everything you hear and see is generated in code: Three.js, procedural world, synthesized music. Even this trailer was rendered by a script that drives the game frame by frame.
```

Re-record by hand (OBS, 1920×1080, desktop browser) only for footage the capture kit can't make, like real co-op
or several players in one garden. 📸 (or **C**) in the game takes clean, watermarked screenshots.

## Launch-day checklist (Oct 19, 10:00 CEST)

- **Saturday/Sunday:** render the new trailer and GIFs from the shot list above, watch them through once with sound,
  and refresh the banner stills if the frogs or forms changed (`STILLS=1 bash scenes/render.sh 07 09 03`).
- **Before Monday:** upload `todeity-trailer-1080p.mp4` to YouTube (public or unlisted) with the title, description
  and chapters above, and put its link in both post drafts.
- **Sunday evening:** stop adding features. Deploy the latest build, then **restart the app** so the server code is
  fresh too (`az webapp restart --name todeity --resource-group carsten --subscription "Carsten DVK"`). Check that
  `https://todeity.azurewebsites.net/api/health` reports the version in `Changelog.js`.
- Recount the numbers in this file if content changed, and the commits and lines in "How I built it".
- Open the live site once (cold start) on desktop and on a phone; play to wave 2 and die once (the Gentle Brew offer).
- Make your own garden public and decorate it, so 👀 Visit garden isn't empty when the first voters arrive.
- Paste the link in a private Discord channel to check the preview card (Discord caches previews: if it shows an old
  one, add `?v=2` to the link in the post).
- Post early: submissions appear in the order they arrive, and voting starts right away.
- During the week: answer comments, share a co-op invite and your garden in the thread, mention the Daily Brew leader
  each day. Every 👍 on the official post counts, so share the post link (not just the game link) with friends.
- Deploy fixes only when few people play (the admin page's Who's online); runs and gardens survive a restart.
- Keep the App Service running until at least Oct 28 (winners announced) so the jury can still play.

## Credits

- Game design, code, music and sound: generated with Claude Code (Anthropic) under my direction.
- Original course project: JetBrains Academy "Build a Game with an AI Coding Agent" (Tode and the garden).
- `enemy.glb`: "Armabee Evolved" by Quaternius (CC0) via Poly Pizza.
- `small_house.glb`: "Small House" by Jarlan Perez (CC-BY 3.0) via Poly Pizza. **Credit required.**
