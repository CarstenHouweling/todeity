# Todeity: Rise of the Tea God

A frog. A cup of tea. A thousand bees. **Todeity** is a 3D roguelite bullet hell that runs in the browser: Tode the Frog
brews divine powers between waves and ascends from garden frog to God of Tea, fighting through five arenas and their
raid bosses down to Bee-zebub in the Underworld.

▶ **Play it:** https://todeity.azurewebsites.net · 📖 **Everything in the game on one page:** https://todeity.azurewebsites.net/about

Made for the JetBrains Academy **Build Your Game Challenge** (#JetBrainsGameChallenge), starting from the course
project of [Build a Game with an AI Coding Agent](https://plugins.jetbrains.com/plugin/30327-build-a-game-with-ai-coding-agent).

## What I added to the course game

The course game is Tode defending his garden from bees in one arena. Todeity keeps the frog, the garden, the bees and
the spit, and builds a whole roguelite around them:

- **A run with a story:** five arenas (Tode's Garden, Sage Mountain, Sky Citadel, Tournament of the Gods, the
  Underworld), raid bosses with stages and mechanics, a final boss who rises again in his true form, and an endless mode.
- **Build-crafting:** brews offered by talking tea spirits, 24 auto-casting skills that fuse, stacking charms,
  three ultimates, keepsakes and seven frog classes.
- **Transformation:** five ascension forms with cut-scenes, and the garden turns divine with them.
- **Bullet hell:** fans, rings, spirals and telegraphed volleys; hop-dash through them and graze for rewards.
- **Meta and community:** cloud saves, a Pantry of permanent upgrades, difficulty vows, a seeded Daily Brew,
  leaderboards, online co-op for 2–4 players, a Wardrobe of 54 earnable wearables, and gardens where players meet,
  decorate and play mini-games.
- **Plays anywhere:** keyboard and mouse or twin-stick touch controls; installable to the Home Screen.

## Build and run

You need [Node.js](https://nodejs.org) 18 or newer. Everything happens in the `game/` folder:

```bash
cd game
npm install
npm run dev
```

Open the address Vite prints (usually http://localhost:5173). That is the whole game; leaderboards, cloud saves,
co-op and gardens also need the server, so start it in a second terminal:

```bash
cd game
npm run server
```

It listens on http://localhost:8787, and the dev server forwards `/api` and the web sockets to it. Without it the
game still plays and keeps your progress in the browser.

For a production build:

```bash
cd game
npm run build   # builds the game into game/dist
npm start       # serves game/dist plus the API from one Node process (PORT, default 8787)
```

`game/dist` alone also works on any static host, without the online features. Deployment notes (Azure App Service),
controls, code structure and debug tools are in [game/DEVELOPMENT.md](game/DEVELOPMENT.md).

**Controls:** WASD to move, the mouse to aim (Tode spits by himself), Space or Shift to hop-dash, E to fire the
ultimate, Esc to pause, M to mute. On phones and tablets: the left half of the screen is a move stick, the right half an aim stick, with dash,
bomb and ultimate buttons above it.

## Repository layout

- `game/`: Todeity itself (Three.js client in `game/src`, Node server in `game/server`, trailer tooling in
  `game/promo/capture`).
- `Introduction/`, `Skeleton/`, `Core_loop/`, `Visual/`, `Conclusion/` and the root `package.json`, `jest.config.js`
  and friends: the original JetBrains Academy course tasks and their checks, kept as they came.

## License and attribution

This project is based on the JetBrains Academy course project "Build a Game with an AI Coding Agent"
(https://github.com/jetbrains-academy/game-course), Copyright (c) 2025 JetBrains Academy, released under the MIT
License. The original copyright and permission notice are kept in [LICENSE](LICENSE), and Todeity is distributed under
the same MIT License.

## Third-party assets and libraries

Everything else you see and hear (the frogs, bees, bosses, arenas, wearables, effects, music, voices and sound
effects) is made procedurally in code for this project. No trademarks, logos, existing characters or commercial music
are used.

| Asset | Used for | Source | License |
| --- | --- | --- | --- |
| `game/public/models/enemy.glb`, "Armabee Evolved" by Quaternius | The bee model | [Poly Pizza](https://poly.pizza) / [quaternius.com](https://quaternius.com) | CC0 1.0 |
| `game/public/models/small_house.glb`, "Small House" by Jarlan Perez | Tode's house in the garden | [Poly Pizza](https://poly.pizza) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| `game/public/models/tode.glb` | The course's Tode model (no longer loaded; Todeity's frogs are procedural) | JetBrains Academy course project | MIT |
| Grandstander font by Tyler Finck, via [@fontsource/grandstander](https://fontsource.org/fonts/grandstander) | The wordmark and in-game callouts | [Google Fonts](https://fonts.google.com/specimen/Grandstander) | SIL Open Font License 1.1 |
| [three.js](https://threejs.org) | 3D rendering | npm `three` | MIT |
| [ws](https://github.com/websockets/ws) | Server web sockets (co-op, gardens) | npm `ws` | MIT |
| [Vite](https://vite.dev) | Dev server and build (development only) | npm `vite` | MIT |
| [playwright-core](https://playwright.dev) | Drives headless Chrome to render the trailers (promo tooling only) | npm `playwright-core` | Apache 2.0 |

## AI tools used

- **Claude Code** (Anthropic), my AI coding agent for the whole extension: it wrote the game and server code, the
  procedural models, music and sound, the about page, the trailer capture scripts and the project docs, under my
  direction. I set the design, played every build and decided what to keep, change or cut.
- The trailers, GIFs and banners are not AI-generated images or video: they are rendered from the running game by
  scripts in `game/promo/capture`.
