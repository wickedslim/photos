import { defineConfig } from 'vite';

// base: './' — чтобы сайт работал на GitHub Pages по адресу вида https://user.github.io/repo/
export default defineConfig({
  base: './',
  build: { target: 'es2022' },
  // Фоновый поток с моделями — ES-модуль (нужен для динамических импортов внутри transformers.js).
  worker: { format: 'es' },
  server: { host: true },
});
