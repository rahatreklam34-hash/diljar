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

function pickVariation(degerler: string[], tokens: string[], fromIdx: number): string | null {
  if (!degerler.length) return null;
  const set = degerler.map((d) => String(d).toUpperCase());
  for (let j = fromIdx + 1; j < tokens.length; j++) {
    const idx = set.indexOf(tokens[j]);
    if (idx >= 0) return degerler[idx];
  }
  for (let j = 0; j < tokens.length; j++) {
    const idx = set.indexOf(tokens[j]);
    if (idx >= 0) return degerler[idx];
  }
  return null;
}

// Yorum metninden ürün + beden çöz (kod/barkod eşleşmesi). Yoksa null (sipariş açılmaz).
async function resolveFromMessage(tenantId: string, text: string): Promise<any | null> {
  const tokens = String(text || '')
    .split(/[\s,.;:!?()\[\]]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (!tokens.length) return null;
  const upper = tokens.map((x) => x.toUpperCase());

  const [products, frees] = await Promise.all([
    prisma.product.findMany({
      where: { tenantId, aktif: true },
      select: { id: true, ad: true, salesCode: true, barkod: true, variations: { select: { deger: true, barkod: true } } },
    }),
    prisma.freeProduct.findMany({
      where: { tenantId, aktif: true },
      select: { id: true, ad: true, salesCode: true, variations: true },
    }),
  ]);

  for (let i = 0; i < upper.length; i++) {
    const code = upper[i];
    if (code.length < 2) continue;

    // Ürün varyasyon barkodu eşleşmesi (doğrudan beden seçer)
    for (const p of products) {
      const v = (p.variations || []).find((vv) => (vv.barkod || '').toUpperCase() === code);
      if (v) return { productId: p.id, variation: v.deger, beden: v.deger, urun: p.ad, kod: code };
    }
    // Ürün satış kodu / ana barkod
    const p = products.find((pp) => (pp.salesCode || '').toUpperCase() === code || (pp.barkod || '').toUpperCase() === code);
    if (p) {
      const variation = pickVariation((p.variations || []).map((v) => v.deger), upper, i);
      return { productId: p.id, variation: variation || null, beden: variation || null, urun: p.ad, kod: code };
    }
    // Tedarikçi (drop) ürün satış kodu
    const fp = frees.find((ff) => (ff.salesCode || '').toUpperCase() === code);
    if (fp) {
      const vars = Array.isArray(fp.variations) ? (fp.variations as any[]).map((v) => v.deger) : [];
      const variation = pickVariation(vars, upper, i);
      return { freeProductId: fp.id, variation: variation || null, beden: variation || null, urun: fp.ad, kod: code };
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
        const lo = await placeLiveOrder(s.tenantId, { streamId: s.id, user: name, ...resolved });
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
      select: { id: true, tenantId: true, fbVideoId: true, fbToken: true, fbSince: true },
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
        const lo = await placeLiveOrder(s.tenantId, { streamId: s.id, user: name, ...resolved });
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
      select: { id: true, tenantId: true, igUserId: true, igToken: true, igSince: true },
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
