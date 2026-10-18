# Todeity: Rise of the Tea God: submission kit

Everything for the JetBrains Academy Build Your Game Challenge post (submissions open **Mon Oct 19, 10:00 CEST**;
voting until Oct 23, 11:00 CEST; winners Oct 28). Rules recap: start public posts with **#JetBrainsGameChallenge**;
no third-party trademarks or logos, recognizable characters, memes, or commercial music or recordings (Todeity uses
none: all music and sound are generated in code, all scenery is procedural).

Numbers below are counted from the code (v0.29.4, Oct 17; v0.29.5–6 were fixes only). Recount them if content changes before posting.

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

Attach `todeity-trailer-discord.mp4` (9.5 MB, plays inline). Discord unfurls the game link with the new banner by
itself. Keep the GIFs for replies: `todeity-trueform.gif` under "what's the final boss like?", `todeity-wardrobe.gif`
for the Wardrobe, `todeity-garden.gif` when inviting people to your garden.

## How I built it (paste into the post or a reply)

> Todeity started as the course's frog-and-bees game on Oct 13 and grew in five days of directing Claude Code (Anthropic's
> AI coding agent): 71 commits, about 34,000 lines of JavaScript, a Three.js client and a small Node server for
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

Rendered on **Oct 18 from v0.29.6** by the capture kit (how: DEVELOPMENT.md, Promo material). The MP4s and GIFs are
not in git (too big); they are in `game/promo/` on the machine that made them. Banners are committed.

| File | Use |
| --- | --- |
| `todeity-trailer-1080p.mp4` | The 66 s trailer with the game's own music: upload to YouTube, link it in the post |
| `todeity-trailer-720p.mp4` | X / LinkedIn / anywhere that wants a smaller file |
| `todeity-trailer-discord.mp4` | 960×540, 9.5 MB (under Discord's 10 MB): attach to the Discord post, plays inline |
| `todeity.gif` | 12 s highlights, 480 px, 9.3 MB: for places that don't play video |
| `todeity-trueform.gif` | Bee-zebub's killing blow, the screen shatters, he rises again (the cold open) |
| `todeity-ascension.gif`, `todeity-chest.gif`, `todeity-bosses.gif` | Golden Tode → God of Tea; the Royal Tea Chest; the Steeping Beam and a raid shield |
| `todeity-wardrobe.gif`, `todeity-garden.gif` | Crown, mantle, breastplate, embers, then Power Up; Leaf Rush in the garden |
| `todeity-banner-1200x630.jpg` | Link preview / social card (also `public/og-image.jpg`, linked as `og-image.jpg?v=0.29` so Discord refetches it) |
| `todeity-banner-1920x1080.png`, `todeity-banner-2400x1260.png` | Hi-res banner for posts and slides |
| `todeity-header-1500x500.png` | X / profile header |

The banner's three panels are Tode as God of Tea, the true-form Bee-zebub and Tode in his Wardrobe crown, with the
seven frogs below, each dressed in earned wearables.

## The trailer (66 s, v0.29.6)

Opens on the most dramatic moment in the game (Bee-zebub's true form), hard-cuts to the quiet garden for the story
beat, and ends on the Wardrobe and the garden games. Every cut lands on a bar of the music.

| Time | Scene | What we see | Caption |
| --- | --- | --- | --- |
| 0:00 | 00-trueform | The killing blow, the screen shatters, "Bee-zebub rises again!", his true-form entrance | (the game's own banner) |
| 0:03 | 01-title | The quiet garden, Tode on the path | Tode just wanted his morning tea. |
| 0:08 | 02-swarm | A ring of 30 bees closes in | Then the bees came. / A 3D roguelite bullet hell |
| 0:12 | 03-bullets | The noose and a starburst | Dodge, dash, graze |
| 0:15 | 04-picks | A skill pick with a fusion card, then a tea spirit's brew offer | 24 skills that fuse / Brews from talking tea spirits |
| 0:19 | 05-frogs | Class picker, the Brawler, the Mage | Seven frogs |
| 0:23 | 06-chest | The Royal Tea Chest reel | A Royal Tea Chest / From every boss |
| 0:26 | 07-ascend | Golden Tode, then God of Tea | Ascend |
| 0:33 | 08-beam | The Steeping Beam on the Hornet Shogun | Unleash ultimates |
| 0:37 | 09-summon | The Great Tode stomps a crowd | Summon the Great Tode |
| 0:40 | 10-underworld | The ground gives way into the Underworld | none |
| 0:44 | 11-raid | The Seraph Queen raises her shield, Halo Crystals circle the Sky Citadel | Raid bosses |
| 0:47 | 12-wardrobe | Crown, Divine Mantle, Golden Breastplate, Embers, then Power Up | Dress up your frog / 54 things to wear, all earned |
| 0:55 | 12b-garden | Leaf Rush: Tode hops from leaf to leaf past the pond | Play together in gardens |
| 1:00 | 13-end | End card | Play free in your browser |

**YouTube chapters** (YouTube wants each chapter at least 10 s long, so shots are grouped):

```
0:00 He doesn't stay down
0:12 Dodge, fuse, pick your frog
0:26 Ascend: God of Tea and the Steeping Beam
0:37 The Great Tode, the Underworld, raid bosses
0:47 Dress up your frog and play in gardens
```

**YouTube title:** Todeity: Rise of the Tea God · trailer (#JetBrainsGameChallenge)

**YouTube description:**

```
#JetBrainsGameChallenge
Tode just wanted his morning tea. Then the bees came.
A 3D roguelite bullet hell in your browser: pick one of seven frogs, brew powers from talking tea spirits, fuse your skills and ascend from garden frog to God of Tea, all the way down to Bee-zebub in the Underworld, who rises again in his true form. Earn crowns, capes and wings, play Leaf Rush in each other's gardens, or team up in co-op for up to 4.

▶ Play free: https://todeity.azurewebsites.net

Made from the JetBrains Academy course "Build a Game with an AI Coding Agent" with Claude Code. Everything you hear and see is generated in code: Three.js, procedural world, synthesized music. Even this trailer was rendered by a script that drives the game frame by frame.

0:00 He doesn't stay down
0:12 Dodge, fuse, pick your frog
0:26 Ascend: God of Tea and the Steeping Beam
0:37 The Great Tode, the Underworld, raid bosses
0:47 Dress up your frog and play in gardens
```

Not in the trailer: real co-op and several players in one garden (the harness drives one browser). For a reply
clip, record 10–15 s of a 2–3 tab co-op run with OBS (1920×1080, each frog in a different outfit).

## Launch-day checklist (Oct 19, 10:00 CEST)

- **Done Oct 18:** trailer, GIFs, banners and og-image re-rendered from v0.29.6. Watch the trailer through once with
  sound before uploading.
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
