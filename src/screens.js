// Экран подключения Яндекс Диска, настройки (шторка) и всплывающие сообщения.
import { YANDEX_CLIENT_ID } from './config.js';
import { storage, openExternal, pushBack } from './tg.js';
import { YaDisk, AuthError } from './api.js';
import { storageUsage } from './store.js';
import { photosCount } from './grid.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function toast(text) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = text;
  document.body.append(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, 2600);
}

// Пользователь может вставить и сам токен, и всю ссылку вида ...#access_token=...&...
function extractToken(text) {
  const s = text.trim();
  const m = s.match(/access_token=([^&\s]+)/);
  return m ? decodeURIComponent(m[1]) : s.replace(/\s+/g, '');
}

export async function showSetup(root, { onDone, message }) {
  const savedClientId = YANDEX_CLIENT_ID || (await storage.get('ya_client_id')) || '';
  root.innerHTML = `
    <div class="setup scroller">
      <div class="setup-hero">
        <div class="app-icon"><svg viewBox="0 0 64 64" width="64" height="64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffcc00"/><stop offset=".5" stop-color="#ff5e3a"/><stop offset="1" stop-color="#c644fc"/></linearGradient></defs><rect width="64" height="64" rx="15" fill="url(#g)"/><circle cx="32" cy="32" r="13" fill="none" stroke="#fff" stroke-width="5"/></svg></div>
        <h1>Фото с Яндекс Диска</h1>
        <p>Ваши фото в привычной галерее прямо в Telegram. Доступ только на чтение.</p>
      </div>
      ${message ? `<div class="notice">${esc(message)}</div>` : ''}
      <div class="group-title">Шаг 1. Получите токен</div>
      <div class="group">
        <label class="row input-row" ${YANDEX_CLIENT_ID ? 'hidden' : ''}>
          <span>ClientID</span>
          <input id="clientId" placeholder="из oauth.yandex.ru" value="${esc(savedClientId)}" autocomplete="off" autocapitalize="off" spellcheck="false">
        </label>
        <button class="row link" id="getToken">Войти в Яндекс и получить токен</button>
      </div>
      <div class="group-foot">Откроется страница Яндекса. После входа скопируйте показанный токен и вернитесь сюда.</div>
      <div class="group-title">Шаг 2. Вставьте токен</div>
      <div class="group">
        <label class="row input-row">
          <input id="token" placeholder="y0_AgAAAA…" autocomplete="off" autocapitalize="off" spellcheck="false">
        </label>
      </div>
      <button class="big-btn" id="connect">Подключить</button>
      <button class="text-btn" id="demo">Посмотреть демо без Яндекса</button>
    </div>`;
  const q = (s) => root.querySelector(s);

  q('#getToken').addEventListener('click', async () => {
    const id = YANDEX_CLIENT_ID || q('#clientId').value.trim();
    if (!id) {
      toast('Сначала укажите ClientID приложения');
      q('#clientId').focus();
      return;
    }
    if (!YANDEX_CLIENT_ID) await storage.set('ya_client_id', id);
    openExternal(`https://oauth.yandex.ru/authorize?response_type=token&client_id=${encodeURIComponent(id)}`);
  });

  q('#connect').addEventListener('click', async () => {
    const token = extractToken(q('#token').value);
    if (!token) return toast('Вставьте токен');
    const btn = q('#connect');
    btn.disabled = true;
    btn.textContent = 'Проверяю…';
    try {
      const me = await new YaDisk(token).me();
      await storage.set('ya_token', token);
      await storage.remove('demo');
      toast(me.name ? `Подключено: ${me.name}` : 'Подключено');
      onDone();
    } catch (e) {
      toast(e instanceof AuthError ? 'Токен не подошёл' : e.message);
      btn.disabled = false;
      btn.textContent = 'Подключить';
    }
  });

  q('#demo').addEventListener('click', async () => {
    await storage.set('demo', '1');
    onDone();
  });
}

const fmtBytes = (b) => (b > 1e9 ? `${(b / 1e9).toFixed(1)} ГБ` : `${Math.round(b / 1e6)} МБ`);

export async function showSettings({ disk, count, folder, onFolder, onReindex, onClearCache, onLogout }) {
  const sheet = document.createElement('div');
  sheet.className = 'sheet-wrap';
  sheet.innerHTML = `
    <div class="sheet-bg"></div>
    <div class="sheet scroller">
      <div class="sheet-head"><div class="sheet-grab"></div><h2>Настройки</h2><button class="text-btn done">Готово</button></div>
      <div class="group">
        <div class="row"><span>Аккаунт</span><span class="muted" id="acc">…</span></div>
        <div class="row"><span>В медиатеке</span><span class="muted">${photosCount(count)}</span></div>
      </div>
      <div class="group-title">Папка с фото</div>
      <div class="group">
        <label class="row input-row"><input id="folder" placeholder="Весь Диск" value="${esc(folder)}" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
      </div>
      <div class="group-foot">Например, <b>/Фотокамера</b> — туда телефон выгружает снимки. Пусто — все фото с Диска.</div>
      <div class="group">
        <button class="row link" id="reindex">Обновить список фото</button>
        <button class="row link" id="clear">Очистить кэш миниатюр <span class="muted" id="usage"></span></button>
      </div>
      <div class="group">
        <button class="row link danger" id="logout">${disk.kind === 'demo' ? 'Выйти из демо-режима' : 'Отключить Яндекс Диск'}</button>
      </div>
    </div>`;
  document.body.append(sheet);
  requestAnimationFrame(() => sheet.classList.add('open'));
  const q = (s) => sheet.querySelector(s);

  let popBack = () => {};
  const close = () => {
    popBack();
    const v = q('#folder').value.trim();
    if (v !== folder) onFolder(v);
    sheet.classList.remove('open');
    setTimeout(() => sheet.remove(), 350);
  };
  popBack = pushBack(close);

  q('.sheet-bg').addEventListener('click', close);
  q('.done').addEventListener('click', close);
  q('#folder').addEventListener('keydown', (e) => e.key === 'Enter' && e.target.blur());
  q('#reindex').addEventListener('click', () => {
    close();
    onReindex();
  });
  q('#clear').addEventListener('click', async () => {
    await onClearCache();
    q('#usage').textContent = fmtBytes(await storageUsage());
    toast('Кэш очищен');
  });
  q('#logout').addEventListener('click', () => {
    close();
    onLogout();
  });

  disk.me().then((m) => (q('#acc').textContent = m.name || '—'), () => (q('#acc').textContent = '—'));
  storageUsage().then((u) => (q('#usage').textContent = fmtBytes(u)));
}
