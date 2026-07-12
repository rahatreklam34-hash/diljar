// sepetw.com external products API — istemci + eslestirme
// Tum cagrilar SUNUCU tarafinda yapilir; secret asla tarayiciya gitmez.

export interface SepetwConfig {
  baseUrl?: string;
  apiKey?: string;
  apiSecret?: string;
  salesChannel?: string; // all | magaza | mezat
  onlyInStock?: boolean;
}

export interface SepetwVariation {
  id?: number;
  varyasyonKodu?: string;
  renk?: string;
  beden?: string;
  stokAdeti?: number;
  rezerveStok?: number;
  kullanilabilirStok?: number;
  fiyat?: number;
  alisFiyati?: number;
  lokasyon?: string;
}

export interface SepetwProduct {
  id?: number;
  urunAdi?: string;
  satisKodu?: string;
  gorselUrl?: string;
  aciklama?: string;
  aktifMi?: boolean;
  barkod?: string;
  marka?: string;
  cinsiyet?: string;
  kategoriId?: number;
  eskiFiyat?: number | null;
  satisKanali?: string;
  varyasyonlar?: SepetwVariation[];
}

const DEFAULT_BASE = 'https://sepetw.com';

function headers(cfg: SepetwConfig) {
  return {
    'X-Api-Key': cfg.apiKey || '',
    'X-Api-Secret': cfg.apiSecret || '',
    Accept: 'application/json',
  };
}

async function getPage(cfg: SepetwConfig, page: number, pageSize: number): Promise<any> {
  const base = (cfg.baseUrl || DEFAULT_BASE).replace(/\/+$/, '');
  const ch = cfg.salesChannel || 'all';
  const ois = cfg.onlyInStock ? 'true' : 'false';
  const url = `${base}/api/external/products?page=${page}&pageSize=${pageSize}&salesChannel=${encodeURIComponent(ch)}&onlyInStock=${ois}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const r = await fetch(url, { headers: headers(cfg), signal: ctrl.signal });
    const body: any = await r.json().catch(() => ({}));
    if (r.status === 401) throw new Error(body?.message || 'API key/secret gecersiz (401)');
    if (!r.ok || body?.success === false) throw new Error(body?.message || `Istek basarisiz (HTTP ${r.status})`);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

// Baglanti testi: ilk sayfadan toplam urun sayisini dondur
export async function testConnection(cfg: SepetwConfig): Promise<{ totalItems: number }> {
  const body = await getPage(cfg, 1, 1);
  return { totalItems: Number(body?.totalItems) || 0 };
}

// Tum sayfalari gez, ham urunleri topla
export async function fetchAllProducts(cfg: SepetwConfig): Promise<SepetwProduct[]> {
  const pageSize = 100;
  const first = await getPage(cfg, 1, pageSize);
  const totalPages = Math.max(1, Number(first?.totalPages) || 1);
  let items: SepetwProduct[] = Array.isArray(first?.items) ? first.items : [];
  for (let p = 2; p <= totalPages; p++) {
    const body = await getPage(cfg, p, pageSize);
    if (Array.isArray(body?.items)) items = items.concat(body.items);
  }
  return items;
}

// ───── Eslestirme ─────

export function normalizeCinsiyet(v?: string): string {
  const s = (v || '').toLocaleLowerCase('tr-TR').trim();
  if (s.startsWith('kad')) return 'kadin';
  if (s.startsWith('erk') || s.startsWith('bay')) return 'erkek';
  if (s.startsWith('coc') || s.startsWith('çoc') || s.startsWith('kid')) return 'cocuk';
  return 'unisex';
}

export interface MappedVariation {
  ad: string;
  deger: string;
  stok: number;
  ekFiyat: number;
  barkod: string | null;
}

export interface MappedRow {
  matchKey: string; // satisKodu (eslestirme anahtari)
  kaynakId: string; // kaynak urun id
  categoryName: string | null; // "Kategori #<id>"
  product: {
    ad: string;
    cinsiyet: string;
    salesCode: string | null;
    barkod: string | null;
    marka: string | null;
    aciklama: string | null;
    eskiFiyat: number | null;
    alisFiyat: number;
    satisFiyat: number;
    stokAdeti: number;
    lokasyon: string;
    images: string[];
  };
  variations: MappedVariation[];
  warn?: string; // eslestirme/veri uyarisi
}

export function mapProduct(src: SepetwProduct): MappedRow {
  const variations = Array.isArray(src.varyasyonlar) ? src.varyasyonlar : [];
  // Net fiyatlar (KDV haric, oldugu gibi) — taban = min fiyat
  const fiyatlar = variations.map((v) => Number(v.fiyat) || 0).filter((x) => x > 0);
  const alislar = variations.map((v) => Number(v.alisFiyati) || 0).filter((x) => x > 0);
  const satisFiyat = fiyatlar.length ? Math.min(...fiyatlar) : 0;
  const alisFiyat = alislar.length ? Math.min(...alislar) : 0;

  const mappedVars: MappedVariation[] = (() => {
    // Satisa esas varyasyon = BEDEN. Renk satisa esas degil: ayni bedenin
    // farkli renklerini tek satirda birlestir, stoklarini topla.
    const groups = new Map<string, { stok: number; ekFiyat: number; barkod: string | null; hasBeden: boolean }>();
    for (const v of variations) {
      const beden = (v.beden || '').trim();
      const renk = (v.renk || '').trim();
      const key = beden || renk || 'Tek'; // beden yoksa renk, o da yoksa Tek
      const stok = Number(v.kullanilabilirStok) || 0;
      const ek = (Number(v.fiyat) || 0) - satisFiyat;
      const ekFiyat = ek > 0 ? Math.round(ek * 100) / 100 : 0;
      const g = groups.get(key);
      if (g) {
        g.stok += stok;
        g.ekFiyat = Math.min(g.ekFiyat, ekFiyat); // taban en dusuk fark
        if (!g.barkod && v.varyasyonKodu) g.barkod = v.varyasyonKodu;
      } else {
        groups.set(key, { stok, ekFiyat, barkod: v.varyasyonKodu || null, hasBeden: !!beden });
      }
    }
    return Array.from(groups.entries()).map(([deger, g]) => ({
      ad: g.hasBeden ? 'Beden' : 'Varyasyon',
      deger,
      stok: g.stok,
      ekFiyat: g.ekFiyat,
      barkod: g.barkod,
    }));
  })();

  const stokAdeti = mappedVars.reduce((s, v) => s + v.stok, 0);
  const images = src.gorselUrl ? [src.gorselUrl] : [];
  const salesCode = (src.satisKodu || '').trim() || null;
  // Lokasyon varyasyon seviyesinde gelir; benzersiz dolu degerleri birlestir
  const lokasyon = Array.from(new Set(
    variations.map((v) => (v.lokasyon || '').trim()).filter(Boolean),
  )).join(', ');

  const warns: string[] = [];
  if (!salesCode) warns.push('Satis kodu yok — eslestirilemez');
  if (!variations.length) warns.push('Varyasyon yok');
  if (satisFiyat <= 0) warns.push('Satis fiyati 0');

  return {
    matchKey: salesCode || '',
    kaynakId: src.id != null ? String(src.id) : '',
    categoryName: src.kategoriId != null ? `Kategori #${src.kategoriId}` : null,
    product: {
      ad: (src.urunAdi || '').trim() || 'Isimsiz urun',
      cinsiyet: normalizeCinsiyet(src.cinsiyet),
      salesCode,
      barkod: (src.barkod || '').trim() || null,
      marka: (src.marka || '').trim() || null,
      aciklama: (src.aciklama || '').trim() || null,
      eskiFiyat: src.eskiFiyat != null ? Number(src.eskiFiyat) : null,
      alisFiyat,
      satisFiyat,
      stokAdeti,
      lokasyon,
      images,
    },
    variations: mappedVars,
    warn: warns.length ? warns.join('; ') : undefined,
  };
}

// ───── Musteri (bakiye) cekme ─────

export interface SepetwCustomer {
  id?: number;
  musteriAdiSoyadi?: string;
  kullaniciadi?: string;
  telefon?: string;
  bakiye?: number | null;
  il?: string | null;
  ilce?: string | null;
  adres?: string | null;
  tckn?: string | null;
  email?: string | null;
}

async function getCustomerPage(cfg: SepetwConfig, page: number, pageSize: number): Promise<any> {
  const base = (cfg.baseUrl || DEFAULT_BASE).replace(/\/+$/, '');
  const url = `${base}/api/external/customers?page=${page}&pageSize=${pageSize}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const r = await fetch(url, { headers: headers(cfg), signal: ctrl.signal });
    const body: any = await r.json().catch(() => ({}));
    if (r.status === 401) throw new Error(body?.message || 'API key/secret gecersiz (401)');
    if (!r.ok || body?.success === false) throw new Error(body?.message || `Istek basarisiz (HTTP ${r.status})`);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

// Tum musterileri gez (sayfali)
export async function fetchAllCustomers(cfg: SepetwConfig): Promise<SepetwCustomer[]> {
  const pageSize = 200;
  const first = await getCustomerPage(cfg, 1, pageSize);
  const totalPages = Math.max(1, Number(first?.totalPages) || 1);
  let items: SepetwCustomer[] = Array.isArray(first?.items) ? first.items : [];
  for (let p = 2; p <= totalPages; p++) {
    const body = await getCustomerPage(cfg, p, pageSize);
    if (Array.isArray(body?.items)) items = items.concat(body.items);
  }
  return items;
}

// Telefon normalizasyonu: yalnizca rakamlar, son 10 hane (ulke/sifir onekleri atilir)
export function normalizePhone(v?: string | null): string {
  const d = String(v || '').replace(/\D+/g, '');
  if (!d) return '';
  return d.length > 10 ? d.slice(-10) : d;
}

export function normalizeUsername(v?: string | null): string {
  return String(v || '').trim().toLocaleLowerCase('tr-TR').replace(/^@+/, '');
}
