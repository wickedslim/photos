// Экран подключения Яндекс Диска, настройки (шторка) и всплывающие сообщения.
import { YANDEX_CLIENT_ID } from './config.js';
import { storage, openExternal, pushBack } from './tg.js';
import { YaDisk, AuthError } from './api.js';
import { storageUsage } from './store.js';
import { photosCount } from './grid.js';
import { startLogin, manualLoginUrl } from './auth.js';

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
        <div class="app-icon"><svg viewBox="0 0 64 64" width="72" height="72"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffcc00"/><stop offset=".5" stop-color="#ff5e3a"/><stop offset="1" stop-color="#c644fc"/></linearGradient></defs><rect width="64" height="64" rx="15" fill="url(#g)"/><circle cx="32" cy="32" r="13" fill="none" stroke="#fff" stroke-width="5"/></svg></div>
        <h1>Фото с Яндекс Диска</h1>
        <p>Все ваши снимки в удобной галерее прямо в Telegram</p>
      </div>
      ${message ? `<div class="notice">${esc(message)}</div>` : ''}
      <ul class="promises">
        <li><span>👀</span><div><b>Только просмотр</b><br>Приложение ничего не удаляет и не меняет на Диске</div></li>
        <li><span>🔒</span><div><b>Фото остаются вашими</b><br>Они идут с Яндекса прямо на ваш телефон и никуда больше</div></li>
        <li><span>⚡</span><div><b>Вход один раз</b><br>Telegram запомнит подключение на всех ваших устройствах</div></li>
      </ul>
      <button class="big-btn" id="login">Войти через Яндекс</button>
      <div class="setup-hint">Откроется страница Яндекса — войдите и нажмите «Разрешить». Потом вы сразу вернётесь сюда.</div>
      <button class="text-btn small" id="more">Другой способ входа</button>
      <div class="manual" hidden>
        <div class="group-title">Вход по токену</div>
        <div class="group">
          <label class="row input-row" ${YANDEX_CLIENT_ID ? 'hidden' : ''}>
            <span>ClientID</span>
            <input id="clientId" placeholder="из oauth.yandex.ru" value="${esc(savedClientId)}" autocomplete="off" autocapitalize="off" spellcheck="false">
          </label>
          <button class="row link" id="getToken">Получить токен на странице Яндекса</button>
          <label class="row input-row">
            <input id="token" placeholder="Вставьте токен" autocomplete="off" autocapitalize="off" spellcheck="false">
          </label>
        </div>
        <button class="big-btn secondary" id="connect">Подключить</button>
      </div>
    </div>`;
  const q = (s) => root.querySelector(s);
  const clientId = () => YANDEX_CLIENT_ID || q('#clientId').value.trim();
  const needClientId = () => {
    q('.manual').hidden = false;
    toast('Укажите ClientID приложения');
    q('#clientId').focus();
  };

  q('#login').addEventListener('click', async () => {
    const id = clientId();
    if (!id) return needClientId();
    if (!YANDEX_CLIENT_ID) await storage.set('ya_client_id', id);
    q('#login').disabled = true;
    q('#login').textContent = 'Открываю Яндекс…';
    startLogin(id);
  });

  q('#more').addEventListener('click', () => {
    q('.manual').hidden = !q('.manual').hidden;
    if (!q('.manual').hidden) q('.manual').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  q('#getToken').addEventListener('click', async () => {
    const id = clientId();
    if (!id) return needClientId();
    if (!YANDEX_CLIENT_ID) await storage.set('ya_client_id', id);
    openExternal(manualLoginUrl(id));
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
      toast(me.name ? `Подключено: ${me.name}` : 'Подключено');
      onDone();
    } catch (e) {
      toast(e instanceof AuthError ? 'Токен не подошёл' : e.message);
      btn.disabled = false;
      btn.textContent = 'Подключить';
    }
  });

}

// Окошко с полем ввода в стиле iOS (window.prompt в Telegram работает не везде).
export function askText({ title, message = '', value = '', placeholder = '', ok = 'Готово' }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'alert-wrap';
    wrap.innerHTML = `
      <div class="alert">
        <div class="alert-title">${esc(title)}</div>
        ${message ? `<div class="alert-msg">${esc(message)}</div>` : ''}
        <input class="alert-input" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off" enterkeyhint="done">
        <div class="alert-btns"><button data-r="cancel">Отмена</button><button data-r="ok" class="bold">${esc(ok)}</button></div>
      </div>`;
    document.body.append(wrap);
    const input = wrap.querySelector('input');
    requestAnimationFrame(() => {
      wrap.classList.add('open');
      input.focus();
      input.select();
    });
    let popBack = () => {};
    const done = (v) => {
      popBack();
      wrap.classList.remove('open');
      setTimeout(() => wrap.remove(), 200);
      resolve(v);
    };
    popBack = pushBack(() => done(null));
    wrap.addEventListener('click', (e) => {
      const r = e.target.closest('[data-r]')?.dataset.r;
      if (r) done(r === 'ok' ? input.value : null);
    });
    input.addEventListener('keydown', (e) => e.key === 'Enter' && done(input.value));
  });
}

const fmtBytes = (b) => (b > 1e9 ? `${(b / 1e9).toFixed(1)} ГБ` : `${Math.round(b / 1e6)} МБ`);

export async function showSettings({ disk, count, folder, indexer, onFolder, onReindex, onClearCache, onLogout }) {
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
      <div class="group-title">Люди и умный поиск</div>
      <div class="group">
        <div class="row"><span>Анализ фото</span><span class="muted">${indexer.enabled ? `${indexer.done.toLocaleString('ru')} из ${indexer.total.toLocaleString('ru')}` : 'выключен'}</span></div>
        <button class="row link ${indexer.enabled ? 'danger' : ''}" id="ml">${indexer.enabled ? 'Выключить и удалить результаты анализа' : 'Включить'}</button>
      </div>
      <div class="group-foot">Лица и содержимое фото анализируются только на этом устройстве. Имена людей тоже хранятся здесь.</div>
      <div class="group">
        <button class="row link danger" id="logout">Отключить Яндекс Диск</button>
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
  q('#ml').addEventListener('click', async () => {
    if (indexer.enabled) {
      await indexer.disable();
      toast('Анализ выключен, данные удалены');
    } else {
      indexer.enable();
      toast('Анализ включён');
    }
    close();
  });
  q('#logout').addEventListener('click', () => {
    close();
    onLogout();
  });

  disk.me().then((m) => (q('#acc').textContent = m.name || '—'), () => (q('#acc').textContent = '—'));
  storageUsage().then((u) => (q('#usage').textContent = fmtBytes(u)));
}
