import { defineConfig } from 'vite';

// Политика безопасности страницы (CSP). Даже если в приложение как-то попадёт чужой код,
// браузер не даст ему загрузить свои скрипты или отправить данные куда-то, кроме Яндекс Диска.
//  - скрипты: только наш сайт и официальный скрипт Telegram;
//  - запросы: Яндекс Диск (API и превью) и Hugging Face (веса моделей для умного поиска);
//  - картинки: только наши и скачанные с Диска (blob:).
// В режиме разработки не добавляем — там Vite нужен свой вебсокет.
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://telegram.org 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "connect-src 'self' blob: https://cloud-api.yandex.net https://downloader.disk.yandex.ru https://huggingface.co https://*.huggingface.co https://*.hf.co",
  "worker-src 'self' blob:",
  "font-src 'self'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const csp = {
  name: 'csp',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
};

// base: './' — чтобы сайт работал на GitHub Pages по адресу вида https://user.github.io/repo/
export default defineConfig({
  base: './',
  plugins: [csp],
  build: { target: 'es2022' },
  // Фоновый поток с моделями — ES-модуль (нужен для динамических импортов внутри transformers.js).
  worker: { format: 'es' },
  server: { host: true },
});
