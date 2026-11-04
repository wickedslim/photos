// Тестовая медиатека для скриншотов и разработки: http://localhost:5173/?mock
// Только для режима разработки — в рабочую сборку этот файл не попадает.
// Фото — бесплатные снимки с Unsplash через сервис picsum.photos.

const DAY = 86400000;
const SIZES = { S: 150, M: 300, L: 500, XL: 800, XXL: 1024, XXXL: 1280 };

// Простой предсказуемый генератор случайных чисел: при каждом запуске одна и та же «медиатека».
function rng(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

export class MockDisk {
  constructor() {
    this.kind = 'mock';
  }

  async me() {
    return { uid: '', name: 'Демо', total: 0, used: 0 };
  }

  async listAll(onProgress) {
    const list = [];
    for (let page = 1; page <= 4; page++) {
      const r = await fetch(`https://picsum.photos/v2/list?page=${page}&limit=100`);
      list.push(...(await r.json()));
      onProgress?.(list.length);
    }
    const rand = rng(7);
    // Перемешиваем: у picsum первые снимки — сплошь ноутбуки.
    for (let j = list.length - 1; j > 0; j--) {
      const r = Math.floor(rand() * (j + 1));
      [list[j], list[r]] = [list[r], list[j]];
    }
    const now = new Date();
    now.setHours(18, 0, 0, 0);
    const trips = [
      { name: 'Сочи 2025', la: 43.58, lo: 39.72, from: 140, days: 20 },
      { name: 'Стамбул', la: 41.01, lo: 28.97, from: 520, days: 12 },
    ];
    const items = [];
    let day = 0;
    let i = 0;
    while (i < list.length) {
      const n = 2 + Math.floor(rand() * 8);
      const trip = trips.find((t) => day >= t.from && day < t.from + t.days);
      for (let k = 0; k < n && i < list.length; k++, i++) {
        const p = list[i];
        const t = now.getTime() - day * DAY - Math.floor(rand() * 10) * 3600000 - k * 120000;
        const folder = trip ? `Отпуск/${trip.name}` : rand() < 0.12 ? 'Семья' : 'Фотокамера';
        const name = `IMG_${String(4000 + i).padStart(4, '0')}.jpg`;
        // В u храним номер снимка на picsum и его размеры (список фото кэшируется между запусками)
        const it = { p: `disk:/${folder}/${name}`, n: name, u: `${p.id}:${p.width}:${p.height}`, t, s: 1500000 + Math.floor(rand() * 3000000) };
        if (trip) Object.assign(it, { la: trip.la + rand() * 0.05, lo: trip.lo + rand() * 0.05 });
        else if (rand() < 0.6) Object.assign(it, { la: 55.75 + rand() * 0.05, lo: 37.6 + rand() * 0.05 });
        items.push(it);
      }
      day += 1 + Math.floor(rand() * (day < 30 ? 3 : 28)); // снимки за несколько лет
    }
    return items;
  }

  async recent() {
    return [];
  }

  url(item, size) {
    const [id, w, h] = item.u.split(':');
    const ph = { id, w: +w, h: +h };
    const side = SIZES[size] || 500;
    const k = side / Math.max(ph.w, ph.h);
    return `https://picsum.photos/id/${ph.id}/${Math.round(ph.w * k)}/${Math.round(ph.h * k)}`;
  }

  async previewBlob(item, size, signal) {
    const r = await fetch(this.url(item, size), { signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.blob();
  }

  async originalUrl(item) {
    return this.url(item, 'XXXL');
  }
}
