import { defineConfig } from 'vite';

// During development the game runs on Vite; the leaderboard API runs separately with `npm run server`.
export default defineConfig({
  server: {
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
});
