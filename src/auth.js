// Вход через Яндекс в одно нажатие (OAuth implicit flow, без сервера).
// Страница Яндекса открывается прямо внутри Telegram, после «Разрешить» Яндекс возвращает
// пользователя на адрес приложения с токеном в #hash — его забираем и сохраняем.
// Telegram-скрипт помнит данные запуска в sessionStorage, поэтому после возврата
// приложение по-прежнему «внутри Telegram» и токен попадает в CloudStorage пользователя.

const STATE_KEY = 'ya_oauth_state';
const SCOPE = 'cloud_api:disk.read';
export const MANUAL_REDIRECT = 'https://oauth.yandex.ru/verification_code';

// Адрес, на который Яндекс вернёт пользователя. Его нужно указать в настройках приложения
// на oauth.yandex.ru: https://wickedslim.github.io/photos/ (и http://localhost:5173/ для разработки).
export function redirectUri() {
  return location.origin + location.pathname;
}

function authorizeUrl(clientId, redirect, state) {
  const u = new URL('https://oauth.yandex.ru/authorize');
  u.searchParams.set('response_type', 'token');
  u.searchParams.set('client_id', clientId);
  u.searchParams.set('redirect_uri', redirect);
  // Явно просим только чтение: даже если в настройках приложения на oauth.yandex.ru
  // когда-нибудь появятся другие права, выданный токен останется «только просмотр».
  u.searchParams.set('scope', SCOPE);
  if (state) u.searchParams.set('state', state);
  return u.toString();
}

export function startLogin(clientId) {
  const state = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
  sessionStorage.setItem(STATE_KEY, state);
  location.assign(authorizeUrl(clientId, redirectUri(), state));
}

// Запасной путь: Яндекс показывает токен на своей странице, пользователь копирует его вручную.
export function manualLoginUrl(clientId) {
  return authorizeUrl(clientId, MANUAL_REDIRECT);
}

// Вызывается при запуске: если мы вернулись из Яндекса — достаём результат и чистим адресную строку.
export function takeOAuthResult() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (!h.has('access_token') && !h.has('error')) return null;
  const expected = sessionStorage.getItem(STATE_KEY);
  sessionStorage.removeItem(STATE_KEY);
  history.replaceState(null, '', location.pathname + location.search);
  if (h.has('error')) {
    return { error: h.get('error') === 'access_denied' ? 'Вы не разрешили доступ к Диску. Попробуйте ещё раз.' : 'Яндекс не завершил вход. Попробуйте ещё раз.' };
  }
  if (!expected || h.get('state') !== expected) {
    return { error: 'Вход не завершён. Нажмите «Войти через Яндекс» ещё раз.' };
  }
  return { token: h.get('access_token') };
}
