// ClientID приложения из https://oauth.yandex.ru (он не секретный).
// Можно вписать сюда или задать переменной VITE_YANDEX_CLIENT_ID при сборке.
// Если оставить пустым — приложение спросит ClientID на экране подключения.
export const YANDEX_CLIENT_ID = import.meta.env.VITE_YANDEX_CLIENT_ID || '';
