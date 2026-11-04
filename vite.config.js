import { defineConfig } from 'vite';

// base: './' — чтобы сайт работал на GitHub Pages по адресу вида https://user.github.io/repo/
export default defineConfig({
  base: './',
  build: { target: 'es2020' },
  server: { host: true },
});
