import './style.css';
import { initTelegram, storage, haptic } from './tg.js';
import { YaDisk, DemoDisk, AuthError, isAbort } from './api.js';
import { loadIndex, saveIndex, clearIndex, previewStore } from './store.js';
import { PreviewLoader } from './loader.js';
import { Library } from './library.js';
import { Collections, openPage } from './collections.js';
import { Search } from './search.js';
import { Favorites } from './favorites.js';
import { openViewer } from './viewer.js';
import { showSetup, showSettings, toast } from './screens.js';

const FULL_REFRESH_MS = 24 * 3600 * 1000;
const app = document.getElementById('app');

initTelegram();
boot();

async function boot(message) {
  const demo = new URLSearchParams(location.search).has('demo') || (await storage.get('demo')) === '1';
  const token = demo ? null : await storage.get('ya_token');
  app.textContent = '';
  if (!demo && !token) return showSetup(app, { onDone: () => boot(), message });
  startLibrary(demo ? new DemoDisk() : new YaDisk(token));
}

function normFolder(v) {
  const s = (v || '').trim().replace(/^disk:/, '').replace(/\/+$/, '');
  if (!s) return '';
  return 'disk:' + (s.startsWith('/') ? s : '/' + s);
}

async function startLibrary(disk) {
  const ns = disk.kind;
  const store = previewStore('previews-' + ns);
  const thumbs = new PreviewLoader(disk, store, { concurrency: 8, persist: true, memLimit: 800 });
  const bigs = new PreviewLoader(disk, store, { concurrency: 3, persist: false, memLimit: 16 });

  let all = [];
  let shown = [];
  let folder = (await storage.get('folder')) || '';
  let refreshing = null;
  const favorites = new Favorites(ns);
  favorites.load();

  const apply = () => {
    const prefix = normFolder(folder);
    shown = prefix ? all.filter((it) => it.p.startsWith(prefix + '/')) : all;
    library.setItems(shown);
    collections.setItems(shown);
    search.setItems(shown);
  };

  // Каркас: три вкладки и таб-бар внизу, как в «Фото» на iPhone.
  app.innerHTML = `
    <div class="tab" data-tab="library"></div>
    <div class="tab" data-tab="collections"></div>
    <div class="tab" data-tab="search"></div>
    <nav class="tabbar">
      <button data-tab="library"><svg viewBox="0 0 28 28" width="26" height="26"><rect x="3" y="7" width="18" height="16" rx="3.5" fill="currentColor"/><path d="M7.5 4.5h14A3.5 3.5 0 0 1 25 8v12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span>Медиатека</span></button>
      <button data-tab="collections"><svg viewBox="0 0 28 28" width="26" height="26"><rect x="3" y="3" width="10" height="10" rx="2.5" fill="currentColor"/><rect x="15" y="3" width="10" height="10" rx="2.5" fill="currentColor" opacity=".55"/><rect x="3" y="15" width="10" height="10" rx="2.5" fill="currentColor" opacity=".55"/><rect x="15" y="15" width="10" height="10" rx="2.5" fill="currentColor"/></svg><span>Коллекции</span></button>
      <button data-tab="search"><svg viewBox="0 0 28 28" width="26" height="26"><circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="m17.6 17.6 6 6" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/></svg><span>Поиск</span></button>
    </nav>`;
  const tabEl = (name) => app.querySelector(`.tab[data-tab="${name}"]`);
  const showTab = (name) => {
    app.querySelectorAll('[data-tab]').forEach((e) => e.classList.toggle('active', e.dataset.tab === name));
  };
  app.querySelector('.tabbar').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    showTab(b.dataset.tab);
    haptic('light');
  });
  showTab('library');

  const openV = (items, index, host) => openViewer({ items, index, thumbs, bigs, disk, host, favorites, toast });
  const collections = new Collections(tabEl('collections'), {
    loader: thumbs,
    favorites,
    openPage: (opts) => openPage(tabEl('collections'), { ...opts, loader: thumbs, onOpen: openV }),
  });
  const search = new Search(tabEl('search'), { loader: thumbs, onOpen: openV });

  const library = new Library(tabEl('library'), {
    loader: thumbs,
    onOpen: openV,
    onSettings: () =>
      showSettings({
        disk,
        count: shown.length,
        folder,
        onFolder: async (v) => {
          folder = v;
          await storage.set('folder', v);
          apply();
        },
        onReindex: () => refresh(true),
        onClearCache: async () => {
          thumbs.clearMemory();
          await store.clear();
          library.setItems(shown);
        },
        onLogout: async () => {
          thumbs.clearMemory();
          await store.clear();
          await clearIndex(ns);
          await storage.remove(ns === 'demo' ? 'demo' : 'ya_token');
          boot();
        },
      }),
  });

  const setAll = (items) => {
    items.sort((a, b) => a.t - b.t);
    all = items;
    apply();
  };

  async function refresh(full) {
    if (refreshing) return refreshing;
    library.setBusy(true, 'Загружаю список фото…');
    refreshing = (async () => {
      try {
        if (full) {
          const items = await disk.listAll((n) => library.setBusy(true, `Загружаю список фото… ${n.toLocaleString('ru')}`));
          setAll(items);
          await saveIndex(ns, { items, updated: Date.now() });
        } else {
          // Быстрое обновление: добавляем недавно загруженные.
          const recent = await disk.recent();
          const known = new Set(all.map((it) => it.p));
          const fresh = recent.filter((it) => !known.has(it.p));
          if (fresh.length) {
            setAll(all.concat(fresh));
            const prev = (await loadIndex(ns)) || {};
            await saveIndex(ns, { items: all, updated: prev.updated || Date.now() });
          }
        }
      } catch (e) {
        if (e instanceof AuthError) {
          await storage.remove('ya_token');
          return boot('Доступ к Диску пропал — подключите его заново.');
        }
        if (!isAbort(e)) toast(e.message || 'Ошибка сети');
      } finally {
        library.setBusy(false);
        refreshing = null;
      }
    })();
    return refreshing;
  }

  const cached = await loadIndex(ns);
  if (cached?.items?.length) {
    setAll(cached.items);
    refresh(Date.now() - (cached.updated || 0) > FULL_REFRESH_MS);
  } else {
    refresh(true);
  }
}
