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

// ── Демо-режим: генерирует фейковую библиотеку, чтобы посмотреть интерфейс без токена ──
const SIZE_PX = { S: 150, M: 300, L: 500, XL: 800, XXXL: 1280 };
const RATIOS = [4 / 3, 3 / 4, 3 / 4, 16 / 9, 1, 9 / 16];
const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('aborted', 'AbortError'));
    });
  });

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

export class DemoDisk {
  constructor() {
    this.kind = 'demo';
  }

  async me() {
    return { name: 'Демо-режим' };
  }

  async listAll(onProgress) {
    const out = [];
    let seed = 42;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const day = 86400000;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = today.getTime();
    const begin = end - 3 * 365 * day;
    const HOME = [55.75, 37.62];
    const CITIES = [
      ['Сочи', 43.6, 39.73], ['Стамбул', 41.01, 28.97], ['Санкт-Петербург', 59.94, 30.31], ['Казань', 55.79, 49.12],
      ['Тбилиси', 41.72, 44.79], ['Калининград', 54.71, 20.51], ['Алтай', 51.96, 85.96], ['Ереван', 40.18, 44.51],
    ];
    const trips = CITIES.map((c, k) => ({ city: c, start: begin + Math.floor(((k + rnd() * 0.8) / CITIES.length) * 3 * 365) * day, len: 3 + Math.floor(rnd() * 7) }));
    const jitter = (v, d) => v + (rnd() - 0.5) * d;
    let n = 0;
    for (let t = begin; t <= end; t += day) {
      const d = new Date(t);
      const trip = trips.find((tr) => t >= tr.start && t < tr.start + tr.len * day);
      const anniversary = d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
      if (!trip && !anniversary && t < end - 2 * day && rnd() < 0.55) continue;
      const count = trip ? 5 + Math.floor(rnd() * 20) : Math.floor(rnd() ** 2 * 18) + 1;
      for (let i = 0; i < count; i++) {
        n++;
        const shot = !trip && rnd() < 0.07;
        const name = `IMG_${String(n).padStart(4, '0')}.${shot ? 'PNG' : 'jpg'}`;
        const folder = trip && rnd() < 0.6 ? `Поездки/${trip.city[0]} ${d.getFullYear()}` : 'Фотокамера';
        const it = { p: `disk:/${folder}/${name}`, n: name, u: 'demo', t: t + 9 * 3600000 + i * 1200000, s: 2_500_000 + Math.floor(rnd() * 3e6) };
        if (!shot && rnd() < 0.85) {
          const [la, lo] = trip ? [jitter(trip.city[1], 0.1), jitter(trip.city[2], 0.1)] : [jitter(HOME[0], 0.3), jitter(HOME[1], 0.3)];
          Object.assign(it, { la, lo });
        }
        out.push(it);
      }
    }
    await sleep(400);
    onProgress?.(out.length);
    return out;
  }

  async recent() {
    return [];
  }

  // Размер и пропорции фото стабильны для каждого файла (зависят от хэша пути).
  dims(item, size) {
    const h = hash(item.p);
    const ratio = RATIOS[h % RATIOS.length];
    const base = SIZE_PX[size] || 500;
    const w = ratio >= 1 ? base : Math.round(base * ratio);
    return { h, w, hgt: ratio >= 1 ? Math.round(base / ratio) : base };
  }

  // Случайные настоящие фото с picsum.photos (бесплатно, без ключа). Без сети — цветная заглушка.
  async previewBlob(item, size, signal) {
    const { h, w, hgt } = this.dims(item, size);
    try {
      const res = await fetch(`https://picsum.photos/seed/${h}/${w}/${hgt}`, { signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.blob();
    } catch (e) {
      if (isAbort(e)) throw e;
      await sleep(50, signal);
      return this.placeholder(item, h, w, hgt);
    }
  }

  placeholder(item, h, w, hgt) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = hgt;
    const ctx = c.getContext('2d');
    const hue = h % 360;
    const g = ctx.createLinearGradient(0, 0, w, hgt);
    g.addColorStop(0, `hsl(${hue} 70% 62%)`);
    g.addColorStop(1, `hsl(${(hue + 50) % 360} 65% 38%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, hgt);
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.font = `600 ${Math.round(Math.min(w, hgt) / 9)}px -apple-system, system-ui, sans-serif`;
    ctx.fillText(new Date(item.t).toLocaleDateString('ru'), w * 0.07, hgt * 0.88);
    return new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', 0.85));
  }

  async originalUrl(item) {
    const { h, w, hgt } = this.dims(item, 'XXXL');
    return `https://picsum.photos/seed/${h}/${w * 2}/${hgt * 2}`;
  }
}
