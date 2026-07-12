import { prisma } from '../../lib/prisma';
import { placeLiveOrder } from './live.routes';

// ───────── Facebook Canlı Yayın Yorum Entegrasyonu ─────────
// Aktif yayında FB videosuna bağlıysa, yorumları periyodik çeker,
// içinde satış kodu/barkod geçen yorumlardan otomatik sipariş oluşturur.

export interface FbFeedItem {
  id: string;
  name: string;
  message: string;
  matched: boolean;
  urun?: string;
  at: number;
}

const feeds = new Map<string, FbFeedItem[]>(); // streamId -> son yorumlar
const seen = new Map<string, Set<string>>(); // streamId -> islenmis yorum id'leri

export function getFbFeed(streamId: string): FbFeedItem[] {
  return feeds.get(streamId) || [];
}

export function clearFbState(streamId: string) {
  feeds.delete(streamId);
  seen.delete(streamId);
}

// Tam URL veya numerik id verilebilir; içinden video id (uzun sayı) çıkarılır.
export function extractVideoId(input: string): string {
  const s = String(input || '').trim();
  const matches = s.match(/\d{6,}/g);
  if (matches && matches.length) return matches[matches.length - 1];
  return s;
}

function pushFeed(streamId: string, item: FbFeedItem) {
  const arr = feeds.get(streamId) || [];
  arr.unshift(item);
  if (arr.length > 60) arr.length = 60;
  feeds.set(streamId, arr);
}

// ── Sipariş ayıklama yardımcıları ──

// Türkçe-güvenli BÜYÜK harf: tüm I-ailesini (i, ı, İ, I) ASCII 'I'ya katlar.
// JS toLowerCase/toUpperCase, Türkçe 'İ' için birleştirici nokta (U+0307) üretip
// satış kodu eşleşmesini bozuyordu. Kod eşleştirmede büyük/küçük + TR karakter farkı yok sayılır.
const trUpper = (s: any): string => String(s ?? '')
  .replace(/[ıİiI]/g, 'I')
  .replace(/[şŞ]/g, 'S')
  .replace(/[çÇ]/g, 'C')
  .replace(/[ğĞ]/g, 'G')
  .replace(/[öÖ]/g, 'O')
  .replace(/[üÜ]/g, 'U')
  .toUpperCase()
  .trim();

// Türkçe-güvenli küçük harf (niyet kelimeleri için ASCII'ye katlar)
const asciiLower = (s: any): string => String(s ?? '')
  .replace(/[ıİiI]/g, 'i')
  .replace(/[şŞ]/g, 's')
  .replace(/[çÇ]/g, 'c')
  .replace(/[ğĞ]/g, 'g')
  .replace(/[öÖ]/g, 'o')
  .replace(/[üÜ]/g, 'u')
  .toLowerCase();

// Mesajı tokenlara böl (ham — büyük/küçük dönüşümü çağıran yerde yapılır)
function tokenize(msg: string): string[] {
  return String(msg || '')
    .split(/[\s,.;:!?()\[\]\/\\"'+]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

// Satın alma niyeti kelimeleri (varsa uzun mesaja tolerans tanınır)
const BUY_WORDS = new Set([
  'al', 'alir', 'alırım', 'alirim', 'alıyorum', 'aliyorum', 'alayım', 'alayim',
  'alabilir', 'alabilirmiyim', 'alacam', 'alacağım', 'alacagim', 'almak',
  'istiyorum', 'isterim', 'siparis', 'sipariş', 'ver', 'verir', 'verin',
  'olsun', 'lütfen', 'lutfen', 'rezerve', 'kapat', 'kapatın', 'kapatin',
]);
function hasBuyIntent(tokens: string[]): boolean {
  return tokens.some((t) => BUY_WORDS.has(t));
}

// Bedeni, kod indexine yakınlık (token mesafesi) içinde ara; en yakını döner
function findBedenNear(upperTokens: string[], degerler: string[], codeIdx: number, maxDist: number): string | null {
  if (!degerler.length) return null;
  const set = degerler.map((d) => trUpper(d));
  let best: string | null = null;
  let bestDist = Infinity;
  for (let j = 0; j < upperTokens.length; j++) {
    if (j === codeIdx) continue;
    const idx = set.indexOf(upperTokens[j]);
    if (idx >= 0) {
      const dist = Math.abs(j - codeIdx);
      if (dist <= maxDist && dist < bestDist) { best = degerler[idx]; bestDist = dist; }
    }
  }
  return best;
}

const MAX_TOKENS_PLAIN = 12; // niyet yoksa varyasyonlu üst sınır
const MAX_TOKENS_INTENT = 20; // niyet varsa üst sınır
const MAX_TOKENS_NONVAR = 5; // varyasyonsuz: kısa/net mesaj sınırı (niyet yoksa)
const MAX_BEDEN_DIST = 3; // kod ile beden arası izinli token mesafesi

// Yorum metninden ürün + beden çöz. Yeni kurallar: tam token eşleşmesi,
// varyasyonlu üründe beden zorunlu + yakınlık, uzun sohbet cümlelerini ele.
async function resolveFromMessage(tenantId: string, text: string): Promise<any | null> {
  const tokens = tokenize(text);
  if (!tokens.length) return null;
  const upper = tokens.map((x) => trUpper(x));
  const intent = hasBuyIntent(tokens.map((x) => asciiLower(x)));

  const [products, frees] = await Promise.all([
    prisma.product.findMany({
      where: { tenantId, aktif: true },
      select: { id: true, ad: true, salesCode: true, barkod: true, stokAdeti: true, variations: { select: { deger: true, barkod: true, stok: true } } },
    }),
    prisma.freeProduct.findMany({
      where: { tenantId, aktif: true },
      select: { id: true, ad: true, salesCode: true, variations: true },
    }),
  ]);

  // 1) Doğrudan varyasyon barkodu (operatör/okutma) — tek güçlü sinyal, filtreye takılmaz
  for (const p of products) {
    for (const v of p.variations || []) {
      if (v.barkod && upper.includes(trUpper(v.barkod))) {
        return { productId: p.id, variation: v.deger, beden: v.deger, urun: p.ad, kod: v.barkod, stokYetersiz: (v.stok ?? 0) <= 0 };
      }
    }
  }

  // 2) Token token gez, tam eşleşen satış kodu / barkod ara
  for (let i = 0; i < upper.length; i++) {
    const code = upper[i];
    if (code.length < 2) continue;

    const p = products.find((pp) => (pp.salesCode && trUpper(pp.salesCode) === code) || (pp.barkod && trUpper(pp.barkod) === code));
    if (p) {
      const varList = (p.variations || []);
      const degerler = varList.map((v) => v.deger);
      if (degerler.length > 0) {
        // VARYASYONLU: uzun sohbeti ele + beden zorunlu + yakınlık
        if (tokens.length > (intent ? MAX_TOKENS_INTENT : MAX_TOKENS_PLAIN)) continue;
        const beden = findBedenNear(upper, degerler, i, MAX_BEDEN_DIST);
        if (!beden) continue; // beden yok → sipariş açılmaz
        const vobj = varList.find((v) => v.deger === beden);
        return { productId: p.id, variation: beden, beden, urun: p.ad, kod: p.salesCode || code, stokYetersiz: !!vobj && (vobj.stok ?? 0) <= 0 };
      }
      // VARYASYONSUZ: niyet yoksa kısa/net mesaj zorunlu
      if (tokens.length > (intent ? MAX_TOKENS_INTENT : MAX_TOKENS_NONVAR)) continue;
      return { productId: p.id, variation: null, beden: null, urun: p.ad, kod: p.salesCode || code, stokYetersiz: (p.stokAdeti ?? 0) <= 0 };
    }

    // Tedarikçi (drop) ürün satış kodu — aynı kurallar
    const fp = frees.find((ff) => ff.salesCode && trUpper(ff.salesCode) === code);
    if (fp) {
      const vars = Array.isArray(fp.variations) ? (fp.variations as any[]).map((v) => v.deger) : [];
      if (vars.length > 0) {
        if (tokens.length > (intent ? MAX_TOKENS_INTENT : MAX_TOKENS_PLAIN)) continue;
        const beden = findBedenNear(upper, vars, i, MAX_BEDEN_DIST);
        if (!beden) continue;
        return { freeProductId: fp.id, variation: beden, beden, urun: fp.ad, kod: fp.salesCode || code };
      }
      if (tokens.length > (intent ? MAX_TOKENS_INTENT : MAX_TOKENS_NONVAR)) continue;
      return { freeProductId: fp.id, variation: null, beden: null, urun: fp.ad, kod: fp.salesCode || code };
    }
  }
  return null;
}

async function pollStream(s: { id: string; tenantId: string; fbVideoId: string | null; fbToken: string | null; fbSince: Date | null }) {
  if (!s.fbVideoId || !s.fbToken) return;
  const sinceMs = s.fbSince ? s.fbSince.getTime() : Date.now() - 60 * 1000;
  const sinceSec = Math.floor(sinceMs / 1000);
  const url =
    `https://graph.facebook.com/v21.0/${encodeURIComponent(s.fbVideoId)}/comments` +
    `?fields=id,from,message,created_time&order=chronological&live_filter=no_filter` +
    `&since=${sinceSec}&limit=50&access_token=${encodeURIComponent(s.fbToken)}`;

  let data: any;
  try {
    const resp = await fetch(url);
    data = await resp.json();
  } catch (e: any) {
    console.error('[fb] fetch', e?.message);
    return;
  }
  if (data?.error) {
    console.error('[fb] graph error:', data.error?.message);
    return;
  }
  const comments: any[] = Array.isArray(data?.data) ? data.data : [];
  if (!comments.length) return;

  const seenSet = seen.get(s.id) || new Set<string>();
  let maxTs = sinceMs;

  for (const c of comments) {
    const cid = String(c.id || '');
    if (!cid) continue;
    const ts = c.created_time ? new Date(c.created_time).getTime() : Date.now();
    if (ts < sinceMs) continue; // eski yorumları atla
    if (seenSet.has(cid)) continue;
    seenSet.add(cid);
    if (ts > maxTs) maxTs = ts;

    const name = c.from?.name || 'Facebook';
    const message = String(c.message || '');
    let matched = false;
    let urun = '';
    const resolved = await resolveFromMessage(s.tenantId, message);
    if (resolved) {
      try {
        const lo = await placeLiveOrder(s.tenantId, { streamId: s.id, user: name, commentId: cid, saticiAd: (s as any).activeSatici || null, ...resolved });
        matched = true;
        urun = (lo as any)?.urun || resolved.urun || '';
      } catch (e: any) {
        console.error('[fb] order', e?.message);
      }
    }
    pushFeed(s.id, { id: cid, name, message, matched, urun, at: ts });
  }

  // seen seti çok büyürse kırp
  if (seenSet.size > 1000) {
    const arr = [...seenSet].slice(-500);
    seen.set(s.id, new Set(arr));
  } else {
    seen.set(s.id, seenSet);
  }

  if (maxTs > sinceMs) {
    await prisma.liveStream.update({ where: { id: s.id }, data: { fbSince: new Date(maxTs) } }).catch(() => {});
  }
}

let running = false;
export async function pollFacebookComments() {
  if (running) return; // önceki tur bitmeden yenisini başlatma
  running = true;
  try {
    const streams = await prisma.liveStream.findMany({
      where: { status: 'active', NOT: { fbVideoId: null } },
      select: { id: true, tenantId: true, fbVideoId: true, fbToken: true, fbSince: true, activeSatici: true },
    });
    for (const s of streams) {
      await pollStream(s).catch((e) => console.error('[fb] poll', e?.message));
    }
  } catch (e: any) {
    console.error('[fb] poller', e?.message);
  } finally {
    running = false;
  }
}

// ───────── Instagram Canlı Yayın Yorum Entegrasyonu ─────────
// Aktif yayın bir Instagram hesabına bağlıysa, o anda yayında olan canlı medyayı
// bulur, yorumlarını çeker ve içinde satış kodu geçen yorumlardan sipariş açar.

const igFeeds = new Map<string, FbFeedItem[]>(); // streamId -> son yorumlar
const igSeen = new Map<string, Set<string>>(); // streamId -> islenmis yorum id'leri

export function getIgFeed(streamId: string): FbFeedItem[] {
  return igFeeds.get(streamId) || [];
}

export function clearIgState(streamId: string) {
  igFeeds.delete(streamId);
  igSeen.delete(streamId);
}

function pushIgFeed(streamId: string, item: FbFeedItem) {
  const arr = igFeeds.get(streamId) || [];
  arr.unshift(item);
  if (arr.length > 60) arr.length = 60;
  igFeeds.set(streamId, arr);
}

async function pollIgStream(s: { id: string; tenantId: string; igUserId: string | null; igToken: string | null; igSince: Date | null }) {
  if (!s.igUserId || !s.igToken) return;
  const tok = encodeURIComponent(s.igToken);

  // 1) O anda yayında olan canlı medyayı bul (yoksa yayın açık değildir)
  let mediaId = '';
  try {
    const lmUrl = `https://graph.instagram.com/v21.0/${encodeURIComponent(s.igUserId)}/live_media?fields=id&limit=1&access_token=${tok}`;
    const r = await fetch(lmUrl);
    const j: any = await r.json();
    if (j?.error) { console.error('[ig] live_media error:', j.error?.message); return; }
    const arr: any[] = Array.isArray(j?.data) ? j.data : [];
    if (!arr.length) return; // şu an canlı yayın yok
    mediaId = String(arr[0]?.id || '');
  } catch (e: any) { console.error('[ig] live_media fetch', e?.message); return; }
  if (!mediaId) return;

  // 2) Canlı medyanın yorumlarını çek (zaman damgasıyla filtrelenemez → id ile tekilleştir)
  const sinceMs = s.igSince ? s.igSince.getTime() : Date.now() - 60 * 1000;
  let comments: any[] = [];
  try {
    const cUrl = `https://graph.instagram.com/v21.0/${encodeURIComponent(mediaId)}/comments?fields=id,text,timestamp,username,from&limit=50&access_token=${tok}`;
    const r = await fetch(cUrl);
    const j: any = await r.json();
    if (j?.error) { console.error('[ig] comments error:', j.error?.message); return; }
    comments = Array.isArray(j?.data) ? j.data : [];
  } catch (e: any) { console.error('[ig] comments fetch', e?.message); return; }
  if (!comments.length) return;

  const seenSet = igSeen.get(s.id) || new Set<string>();
  let maxTs = sinceMs;

  // Kronolojik işlemek için ters çevir (API ters kronolojik dönebilir)
  for (const c of [...comments].reverse()) {
    const cid = String(c.id || '');
    if (!cid) continue;
    const ts = c.timestamp ? new Date(c.timestamp).getTime() : Date.now();
    if (ts < sinceMs) continue; // eski yorumları atla
    if (seenSet.has(cid)) continue;
    seenSet.add(cid);
    if (ts > maxTs) maxTs = ts;

    const name = c.username || c.from?.username || 'Instagram';
    const message = String(c.text || '');
    let matched = false;
    let urun = '';
    const resolved = await resolveFromMessage(s.tenantId, message);
    if (resolved) {
      try {
        const lo = await placeLiveOrder(s.tenantId, { streamId: s.id, user: name, commentId: cid, saticiAd: (s as any).activeSatici || null, ...resolved });
        matched = true;
        urun = (lo as any)?.urun || resolved.urun || '';
      } catch (e: any) {
        console.error('[ig] order', e?.message);
      }
    }
    pushIgFeed(s.id, { id: cid, name, message, matched, urun, at: ts });
  }

  if (seenSet.size > 1000) {
    igSeen.set(s.id, new Set([...seenSet].slice(-500)));
  } else {
    igSeen.set(s.id, seenSet);
  }

  if (maxTs > sinceMs) {
    await prisma.liveStream.update({ where: { id: s.id }, data: { igSince: new Date(maxTs) } }).catch(() => {});
  }
}

let igRunning = false;
export async function pollInstagramComments() {
  if (igRunning) return;
  igRunning = true;
  try {
    const streams = await prisma.liveStream.findMany({
      where: { status: 'active', NOT: { igUserId: null } },
      select: { id: true, tenantId: true, igUserId: true, igToken: true, igSince: true, activeSatici: true },
    });
    for (const s of streams) {
      await pollIgStream(s).catch((e) => console.error('[ig] poll', e?.message));
    }
  } catch (e: any) {
    console.error('[ig] poller', e?.message);
  } finally {
    igRunning = false;
  }
}

// Kayıtlı Instagram token'larını periyodik yeniler → uzun ömürlü token süresi (60 gün)
// her seferinde sıfırlanır, böylece token KALICI kalır ve bir daha "sıfırlanmaz".
// Hata olsa bile kayıtlı token ASLA silinmez (kullanıcı tekrar girmek zorunda kalmasın).
let igRefreshRunning = false;
export async function refreshSavedIgTokens() {
  if (igRefreshRunning) return;
  igRefreshRunning = true;
  try {
    const settings = await prisma.storeSetting.findMany({ where: { NOT: { igTokenSaved: null } }, select: { tenantId: true, igTokenSaved: true } });
    for (const ss of settings) {
      const tok = ss.igTokenSaved;
      if (!tok) continue;
      try {
        const r = await fetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(tok)}`);
        const j: any = await r.json();
        if (j?.access_token) {
          await prisma.storeSetting.updateMany({ where: { tenantId: ss.tenantId }, data: { igTokenSaved: j.access_token } });
          await prisma.liveStream.updateMany({ where: { tenantId: ss.tenantId, status: 'active', NOT: { igUserId: null } }, data: { igToken: j.access_token } });
          console.log('[ig] token yenilendi tenant=' + ss.tenantId);
        }
        // j.error olsa bile token'ı silme; mevcut token geçerliliğini sürdürür
      } catch (e: any) { console.error('[ig] refresh', e?.message); }
    }
  } finally {
    igRefreshRunning = false;
  }
}
