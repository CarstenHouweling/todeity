import { defineConfig } from 'vite';

// During development the game runs on Vite; the leaderboard API and co-op relay run with `npm run server`.
export default defineConfig({
  server: {
    proxy: {
      '/api': 'http://localhost:8787',
      '/ws': { target: 'ws://localhost:8787', ws: true },
    },
  },
});
