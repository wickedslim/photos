// Обёртка над Telegram WebApp API. Приложение работает и в обычном браузере (для отладки).
export const tg = window.Telegram?.WebApp;
export const inTelegram = Boolean(tg && tg.initData);

const can = (v) => inTelegram && tg.isVersionAtLeast?.(v);

// Тема — дневная/ночная по настройке устройства. Переключателя в приложении нет намеренно.
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

export function initTelegram() {
  applyTheme();
  // Телефон сам перешёл в ночной режим (по расписанию или вручную) — перекрашиваемся на лету.
  darkQuery.addEventListener('change', applyTheme);
  if (!inTelegram) return;
  tg.ready();
  tg.expand();
  if (can('7.7')) tg.disableVerticalSwipes();
  // На телефонах — полноэкранный режим, как у нативного приложения.
  if (can('8.0') && ['ios', 'android'].includes(tg.platform)) {
    try { tg.requestFullscreen(); } catch {}
  }
  tg.onEvent('themeChanged', applyTheme);
}

export function isDark() {
  return darkQuery.matches;
}

export function applyTheme() {
  const dark = isDark();
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const bg = dark ? '#000000' : '#ffffff';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
  if (inTelegram) {
    try {
      tg.setHeaderColor(bg);
      tg.setBackgroundColor(bg);
      if (can('7.10')) tg.setBottomBarColor(bg);
    } catch {}
  }
}

// ── Хранилище: Telegram CloudStorage (синхронизируется между устройствами) или localStorage ──
const useCloud = can('6.9');

export const storage = {
  get(key) {
    if (!useCloud) return Promise.resolve(localStorage.getItem(key));
    return new Promise((resolve) => {
      tg.CloudStorage.getItem(key, (err, value) => {
        if (err || !value) return resolve(localStorage.getItem(key));
        localStorage.removeItem(key); // в облаке есть — локальная копия (от старых версий) не нужна
        resolve(value);
      });
    });
  },
  // В Telegram пишем только в CloudStorage: на github.io адрес сайта общий для всех проектов
  // владельца, и лишняя копия токена в localStorage ни к чему.
  set(key, value) {
    if (!useCloud) {
      localStorage.setItem(key, value);
      return Promise.resolve();
    }
    localStorage.removeItem(key);
    return new Promise((resolve) =>
      tg.CloudStorage.setItem(key, value, (err) => {
        if (err) localStorage.setItem(key, value); // запасной вариант, если облако недоступно
        resolve();
      }),
    );
  },
  remove(key) {
    localStorage.removeItem(key);
    if (!useCloud) return Promise.resolve();
    return new Promise((resolve) => tg.CloudStorage.removeItem(key, () => resolve()));
  },
};

export function openExternal(url) {
  if (inTelegram) tg.openLink(url);
  else window.open(url, '_blank', 'noopener');
}

// Кнопка «Назад» Telegram: стек обработчиков (просмотрщик поверх настроек и т.п.)
const backStack = [];
function syncBack() {
  if (!inTelegram) return;
  if (backStack.length) tg.BackButton.show();
  else tg.BackButton.hide();
}
if (inTelegram) tg.BackButton.onClick(() => backStack[backStack.length - 1]?.());

export function pushBack(handler) {
  backStack.push(handler);
  syncBack();
  return () => {
    const i = backStack.lastIndexOf(handler);
    if (i >= 0) backStack.splice(i, 1);
    syncBack();
  };
}

export function haptic(type = 'light') {
  if (!can('6.1')) return;
  try {
    if (type === 'select') tg.HapticFeedback.selectionChanged();
    else tg.HapticFeedback.impactOccurred(type);
  } catch {}
}
