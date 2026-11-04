// Клиент REST API Яндекс Диска. Работает прямо из браузера: API и сервер превью разрешают CORS.
const BASE = 'https://cloud-api.yandex.net/v1/disk';
const ITEM_FIELDS = ['name', 'path', 'preview', 'created', 'modified', 'photoslice_time', 'exif', 'size', 'mime_type'];
const LIST_FIELDS = ITEM_FIELDS.map((f) => 'items.' + f).join(',');

// Размер превью, ссылки на которое приходят вместе со списком файлов.
export const LIST_PREVIEW = 'L';

export class AuthError extends Error {}

export function isAbort(e) {
  return e?.name === 'AbortError';
}

// Компактная запись о фото, чтобы индекс на десятки тысяч фото занимал мало места.
function compact(r) {
  const date = r.photoslice_time || r.exif?.date_time || r.created || r.modified;
  return {
    p: r.path,
    n: r.name,
    u: r.preview || '',
    t: Date.parse(date) || 0,
    s: r.size || 0,
    ...gps(r.exif),
  };
}

// Координаты из EXIF (если Яндекс их отдаёт) — для коллекции «Поездки».
function gps(exif) {
  const la = Number(exif?.gps_latitude);
  const lo = Number(exif?.gps_longitude);
  return Number.isFinite(la) && Number.isFinite(lo) && (la || lo) ? { la, lo } : {};
}

// В ссылке на превью размер задаётся параметром size — пробуем подменить его,
// чтобы не делать лишний запрос к API ради каждого размера.
function withSize(url, size) {
  try {
    const u = new URL(url);
    if (!u.searchParams.has('size')) return null;
    u.searchParams.set('size', size);
    return u.toString();
  } catch {
    return null;
  }
}

export class YaDisk {
  constructor(token) {
    this.token = token;
    this.kind = 'real';
    this.rewriteWorks = true;
  }

  get headers() {
    return { Authorization: 'OAuth ' + this.token };
  }

  async api(path, params = {}, signal) {
    const url = new URL(BASE + path);
    for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v);
    const res = await fetch(url, { headers: this.headers, signal });
    if (res.status === 401) throw new AuthError('Токен недействителен или отозван');
    if (!res.ok) {
      let msg = res.statusText;
      try {
        const j = await res.json();
        msg = j.message || j.description || msg;
      } catch {}
      throw new Error(`Яндекс Диск: ${msg} (${res.status})`);
    }
    return res.json();
  }

  async me() {
    const d = await this.api('', { fields: 'user.display_name,user.login,total_space,used_space' });
    return { name: d.user?.display_name || d.user?.login || '', total: d.total_space, used: d.used_space };
  }

  // Полный список всех фото на Диске (постранично).
  async listAll(onProgress, signal) {
    const out = [];
    const limit = 1000;
    for (let offset = 0; ; offset += limit) {
      const d = await this.api(
        '/resources/files',
        { media_type: 'image', limit, offset, preview_size: LIST_PREVIEW, fields: LIST_FIELDS },
        signal,
      );
      const items = d.items || [];
      for (const r of items) out.push(compact(r));
      onProgress?.(out.length);
      if (items.length < limit) break;
    }
    return out;
  }

  // Недавно загруженные — для быстрого обновления без полного пересканирования.
  async recent(limit = 300, signal) {
    const d = await this.api(
      '/resources/last-uploaded',
      { media_type: 'image', limit, preview_size: LIST_PREVIEW, fields: LIST_FIELDS },
      signal,
    );
    return (d.items || []).map(compact);
  }

  async previewUrl(path, size, signal) {
    const d = await this.api('/resources', { path, preview_size: size, fields: 'preview' }, signal);
    if (!d.preview) throw new Error('У файла нет превью');
    return d.preview;
  }

  async fetchBlob(url, signal) {
    const res = await fetch(url, { headers: this.headers, signal });
    if (!res.ok) {
      const e = new Error('HTTP ' + res.status);
      e.status = res.status;
      throw e;
    }
    return res.blob();
  }

  async previewBlob(item, size, signal) {
    let direct = null;
    if (item.u) direct = size === LIST_PREVIEW ? item.u : this.rewriteWorks ? withSize(item.u, size) : null;
    if (direct) {
      try {
        return await this.fetchBlob(direct, signal);
      } catch (e) {
        if (isAbort(e)) throw e;
        // Ссылка протухла или подмена размера не работает — спросим API.
        if (size !== LIST_PREVIEW && e.status === 403) this.rewriteWorks = false;
      }
    }
    const url = await this.previewUrl(item.p, size, signal);
    if (size === LIST_PREVIEW) item.u = url;
    return this.fetchBlob(url, signal);
  }

  async originalUrl(item) {
    const d = await this.api('/resources/download', { path: item.p });
    return d.href;
  }
}
