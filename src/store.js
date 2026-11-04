// Локальный кэш: индекс фото — в IndexedDB, превью — в Cache Storage браузера.
import { get, set, del } from 'idb-keyval';

const indexKey = (ns) => `index-v2:${ns}`;

export const loadIndex = (ns) => get(indexKey(ns));
export const saveIndex = (ns, data) => set(indexKey(ns), data);
export const clearIndex = (ns) => del(indexKey(ns));

export function previewStore(name) {
  let opened = null;
  const open = () => {
    if (!('caches' in window)) return Promise.resolve(null);
    return (opened ||= caches.open(name).catch(() => null));
  };
  const key = (size, path) => location.origin + '/__preview/' + size + '/' + encodeURIComponent(path);

  return {
    async get(size, path) {
      const c = await open();
      const r = c && (await c.match(key(size, path)));
      return r ? r.blob() : null;
    },
    async put(size, path, blob) {
      const c = await open();
      if (!c) return;
      const res = new Response(blob, { headers: { 'content-type': blob.type || 'image/jpeg' } });
      await c.put(key(size, path), res).catch(() => {});
    },
    async clear() {
      opened = null;
      if ('caches' in window) await caches.delete(name);
    },
  };
}

export async function storageUsage() {
  try {
    const e = await navigator.storage.estimate();
    return e.usage || 0;
  } catch {
    return 0;
  }
}
