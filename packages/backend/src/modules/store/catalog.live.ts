/**
 * Katalog Canlı İzleme — In-memory visitor tracking
 * Ziyaretçiler heartbeat gönderiyor, 60sn gelmezse çıkmış sayılıyor
 */

interface CatalogVisitor {
  visitorId: string;       // Anonim ziyaretçi ID (localStorage)
  catalogId: string;
  tenantId: string;
  ip?: string;
  userAgent?: string;
  sayfaNo: number;         // Hangi sayfada
  sonGorulen?: string;     // Son görüntülenen ürün adı
  sonGorulenImg?: string;  // Son görüntülenen ürün görseli
  sepetUrunSayisi: number; // Sepetteki ürün sayısı
  sepetToplam: number;     // Sepet tutarı
  sepetUrunler: string[];  // Sepet ürün adları
  girisZamani: number;     // İlk giriş timestamp
  sonAktif: number;        // Son heartbeat timestamp
  durum: 'geziyor' | 'urun_inceliyor' | 'sepette' | 'siparis_veriyor';
}

const visitors = new Map<string, CatalogVisitor>();

// 60 saniye heartbeat gelmezse çıkmış say
const TIMEOUT_MS = 60_000;

function cleanExpired() {
  const now = Date.now();
  for (const [key, v] of visitors) {
    if (now - v.sonAktif > TIMEOUT_MS) visitors.delete(key);
  }
}

export function trackVisitor(data: {
  visitorId: string;
  catalogId: string;
  tenantId: string;
  ip?: string;
  userAgent?: string;
  sayfaNo?: number;
  sonGorulen?: string;
  sonGorulenImg?: string;
  sepetUrunSayisi?: number;
  sepetToplam?: number;
  sepetUrunler?: string[];
  durum?: string;
}) {
  const key = `${data.catalogId}:${data.visitorId}`;
  const existing = visitors.get(key);
  const now = Date.now();

  visitors.set(key, {
    visitorId: data.visitorId,
    catalogId: data.catalogId,
    tenantId: data.tenantId,
    ip: data.ip || existing?.ip,
    userAgent: data.userAgent || existing?.userAgent,
    sayfaNo: data.sayfaNo ?? existing?.sayfaNo ?? 1,
    sonGorulen: data.sonGorulen ?? existing?.sonGorulen,
    sonGorulenImg: data.sonGorulenImg ?? existing?.sonGorulenImg,
    sepetUrunSayisi: data.sepetUrunSayisi ?? existing?.sepetUrunSayisi ?? 0,
    sepetToplam: data.sepetToplam ?? existing?.sepetToplam ?? 0,
    sepetUrunler: data.sepetUrunler ?? existing?.sepetUrunler ?? [],
    girisZamani: existing?.girisZamani ?? now,
    sonAktif: now,
    durum: (data.durum as any) || existing?.durum || 'geziyor',
  });
}

export function getActiveVisitors(tenantId: string, catalogId?: string): CatalogVisitor[] {
  cleanExpired();
  const result: CatalogVisitor[] = [];
  for (const v of visitors.values()) {
    if (v.tenantId !== tenantId) continue;
    if (catalogId && v.catalogId !== catalogId) continue;
    result.push(v);
  }
  return result.sort((a, b) => b.sonAktif - a.sonAktif);
}

export function getVisitorStats(tenantId: string) {
  cleanExpired();
  const kataloglar = new Map<string, { aktif: number; sepetli: number; toplam: number }>();
  for (const v of visitors.values()) {
    if (v.tenantId !== tenantId) continue;
    const s = kataloglar.get(v.catalogId) || { aktif: 0, sepetli: 0, toplam: 0 };
    s.aktif++;
    if (v.sepetUrunSayisi > 0) { s.sepetli++; s.toplam += v.sepetToplam; }
    kataloglar.set(v.catalogId, s);
  }
  return Object.fromEntries(kataloglar);
}
