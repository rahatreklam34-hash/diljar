import { prisma } from '../../lib/prisma';
import { isConnected, sendText, sendMedia, normPhone } from './wa.manager';
import { apiSendText, apiSendTemplate, apiSendMedia } from './wa.cloud';
import { botReply } from '../bot/engine';
import { env } from '../../config/env';
import { startWorkflowRuns } from './wa.workflow';

export async function ensureSettings(tenantId: string) {
  let st = await prisma.whatsappSettings.findUnique({ where: { tenantId } });
  if (!st) st = await prisma.whatsappSettings.create({ data: { tenantId } });
  return st;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// Ödeme bekleyen TÜM sepetlere toplu ödeme talebi (route + zamanlayıcı ortak kullanır)
export async function runBulkPendingPayments(tenantId: string): Promise<{ total: number; sent: number; skipped: number }> {
  const orders = await prisma.storeOrder.findMany({
    where: { tenantId, durum: { notIn: ['tamamlandi', 'iptal'] } },
    select: { id: true, toplam: true, tahsilat: true },
    orderBy: { createdAt: 'desc' }, take: 1000,
  });
  const pending = orders.filter((o) => (Number(o.toplam || 0) - Number(o.tahsilat || 0)) > 0.01);
  let sent = 0; let skipped = 0;
  for (const o of pending) {
    const r = await enqueuePaymentRequest(tenantId, { orderId: o.id }).catch(() => ({ ok: false } as any));
    if (r && r.ok) sent++; else skipped++;
  }
  return { total: pending.length, sent, skipped };
}

// Zamanlanmış ödeme hatırlatması: ayarlı saatlerde (HH:MM) ödeme bekleyenlere toplu talep gönderir.
// Her dakika bir kez çağrılır (cron). Aynı dakikada tekrar tetiklenmesin diye in-memory işaret tutulur.
const _lastReminderTick = new Map<string, string>();
export async function runPaymentReminderTick(): Promise<void> {
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const stamp = todayStr() + ' ' + hhmm;
  const settings = await prisma.whatsappSettings.findMany({ where: { odemeHatirlatmaAktif: true } }).catch(() => [] as any[]);
  for (const st of settings as any[]) {
    const times: string[] = Array.isArray(st.odemeHatirlatmaSaatleri) ? (st.odemeHatirlatmaSaatleri as any[]).map((x) => String(x).trim()) : [];
    if (!times.includes(hhmm)) continue;
    if (_lastReminderTick.get(st.tenantId) === stamp) continue; // bu dakika zaten çalıştı
    _lastReminderTick.set(st.tenantId, stamp);
    const r = await runBulkPendingPayments(st.tenantId).catch(() => ({ total: 0, sent: 0, skipped: 0 }));
    console.log(`[wa-reminder] tenant=${st.tenantId} ${hhmm} -> gonderilen=${r.sent}/${r.total}`);
  }
}

// Serbest metin gövdesindeki {{1}}..{{n}} yer tutucularını templateVars ile doldur.
// (Pencere AÇIKKEN serbest metin gider; kullanıcı şablon metnini {{n}} ile kaydetmişse
//  müşteri boş "{{1}}" görmemesi için burada gerçek değerlerle değiştirilir.)
function fillNumbered(text: string, vars: (string | number | null | undefined)[]): string {
  return String(text || '').replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, n) => {
    const v = vars[Number(n) - 1];
    return v == null ? '' : String(v);
  });
}

// Bir hat gönderime hazır mı? QR → soket bağlı; API → doğrulanmış + kimlik bilgileri tam.
function lineReady(line: any): boolean {
  if ((line as any).channel === 'api') return !!(line.apiVerified && line.phoneNumberId && line.accessToken);
  return isConnected(line.id);
}

// Çalışma saati içinde miyiz?
function withinBusinessHours(st: any): boolean {
  if (!st?.calismaSaatAktif) return true;
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const [bh, bm] = String(st.calismaBasla || '09:00').split(':').map(Number);
  const [eh, em] = String(st.calismaBitis || '22:00').split(':').map(Number);
  const start = bh * 60 + bm;
  const end = eh * 60 + em;
  if (start <= end) return cur >= start && cur <= end;
  return cur >= start || cur <= end; // gece aşan aralık
}

// Bir hattın günlük YENİ SOHBET sayacını gün değiştiyse sıfırla, güncel limit/aralık değerlerini döndür.
function lineLimits(line: any, st: any): { limit: number; aralik: number; newChatToday: number } {
  const limit = (line.gunlukLimit && line.gunlukLimit > 0) ? line.gunlukLimit : (st.lineDefaultLimit || 200);
  const aralik = (line.gonderimAralikSn && line.gonderimAralikSn > 0) ? line.gonderimAralikSn : (st.globalAralikSn || 8);
  const newChatToday = line.newChatDate === todayStr() ? (line.newChatToday || 0) : 0;
  return { limit, aralik, newChatToday };
}

// Müşteriyle son 24 saatte hiç mesaj (gelen/giden) yoksa bu bir "yeni sohbet"tir → günlük limite tabidir.
async function isNewChat(tenantId: string, phone: string): Promise<boolean> {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const recent = await prisma.whatsappMessage.findFirst({ where: { tenantId, customerPhone: phone, createdAt: { gte: since } }, select: { id: true } }).catch(() => null);
  return !recent;
}

// Bir hat API (resmî Cloud) kanalı mı ve gönderime hazır mı?
function isApiLine(line: any): boolean { return (line as any)?.channel === 'api'; }

// Varsayılan gönderim hattı: ilk HAZIR API hattı (otomatik bildirimler her zaman buradan gider).
function defaultApiLine(lines: any[]): any | null {
  return lines.find((l) => isApiLine(l) && lineReady(l)) || null;
}

// Sticky hat: müşterinin son 24 saatte yazıştığı HAZIR hattı döndür (yoksa null → dengeli dağıtım).
async function resolveStickyLine(tenantId: string, phone: string, lines: any[]): Promise<string | null> {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const recentMsg = await prisma.whatsappMessage.findFirst({
    where: { tenantId, customerPhone: phone, createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' }, select: { lineId: true },
  }).catch(() => null);
  const byId = (id?: string | null) => lines.find((l) => l.id === id);
  if (recentMsg?.lineId) { const l = byId(recentMsg.lineId); if (l && lineReady(l)) return l.id; }
  const convo = await prisma.whatsappConversation.findUnique({ where: { tenantId_customerPhone: { tenantId, customerPhone: phone } } }).catch(() => null);
  if (convo && new Date(convo.lastMessageAt).getTime() >= since.getTime()) { const l = byId(convo.lineId); if (l && lineReady(l)) return l.id; }
  return null;
}

// Otomatik bildirimler (sipariş/ödeme/durum vb.) için hat seçimi:
//  - Müşterinin sticky hattı API ise onu kullan (aynı numaradan devam).
//  - Aksi halde (sticky yok veya sticky QR ise) → varsayılan API hattı.
//  - Hiç QR/Baileys'e DÜŞME. Uygun API hattı yoksa null (worker da API-only seçer).
async function resolveApiLineForAuto(tenantId: string, phone: string, lines: any[]): Promise<string | null> {
  const stickyId = await resolveStickyLine(tenantId, phone, lines);
  if (stickyId) {
    const sticky = lines.find((l) => l.id === stickyId);
    if (sticky && isApiLine(sticky)) return stickyId; // sticky zaten API → koru
  }
  const def = defaultApiLine(lines); // sticky yok ya da QR → varsayılan API hattı
  return def ? def.id : null;
}

// Bağlı + (yeni sohbet limiti dolmamış) + aralığı geçmiş hatlardan en az yüklü olanı seç (dengeli dağıtım)
function pickBalancedLine(lines: any[], st: any, now: number, usedThisTick: Set<string>, isNew: boolean, onlyQr = false, onlyApi = false): any | null {
  const eligible = lines.filter((l) => {
    const api = (l as any).channel === 'api';
    if (onlyQr && api) return false;
    if (onlyApi && !api) return false;
    if (!lineReady(l)) return false;
    if (!api && usedThisTick.has(l.id)) return false; // API resmi kanal: tick içinde tekrar kullanılabilir
    const { limit, aralik, newChatToday } = lineLimits(l, st);
    if (isNew && newChatToday >= limit) return false; // yeni sohbet limiti dolmuş hat atlanır
    const lastMs = l.lastSentAt ? new Date(l.lastSentAt).getTime() : 0;
    if (!api && now - lastMs < aralik * 1000) return false; // throttle yalnızca QR/Baileys için
    return true;
  });
  if (!eligible.length) return null;
  eligible.sort((a, b) => {
    const sa = a.newChatDate === todayStr() ? a.newChatToday : 0;
    const sb = b.newChatDate === todayStr() ? b.newChatToday : 0;
    return sa - sb;
  });
  return eligible[0];
}

// Kullanıcı tanımlı (özel) otomasyonları kuyruğa ekle.
// Zamanlayıcı (gecikmeDk) → scheduledAt; Şablon (sablonId+sablonVars) → api-template; Manuel (mesaj) → body.
async function enqueueCustomAutomations(
  tenantId: string,
  st: any,
  trigger: string,
  ctx: { phone: string; lineId: string | null; orderId?: string | null; vars: string[]; repl: Record<string, string> },
): Promise<void> {
  try {
    const list: any[] = Array.isArray(st?.ozelOtomasyonlar) ? st.ozelOtomasyonlar : [];
    const applyRepl = (s: string) => Object.entries(ctx.repl).reduce((acc, [k, v]) => acc.split(k).join(String(v ?? '')), String(s || ''));
    for (const oz of list) {
      if (!oz || oz.aktif === false) continue;
      if (String(oz.tetikleyici || 'order') !== trigger) continue;
      const delayMin = Math.max(0, Math.min(10080, Number(oz.gecikmeDk) || 0));
      const scheduledAt = new Date(Date.now() + delayMin * 60000);
      if (oz.mod === 'template' && oz.sablonId) {
        const tplVars: string[] = Array.isArray(oz.sablonVars) && oz.sablonVars.length
          ? oz.sablonVars.map((v: string) => applyRepl(v))
          : ctx.vars;
        await prisma.whatsappOutbox.create({ data: { tenantId, lineId: ctx.lineId, channel: 'api', customerPhone: ctx.phone, kind: 'ozel', body: '', orderId: ctx.orderId || null, templateId: String(oz.sablonId), templateVars: tplVars as any, scheduledAt } }).catch(() => {});
      } else if (oz.mesaj) {
        const body = fillNumbered(applyRepl(oz.mesaj), ctx.vars);
        await prisma.whatsappOutbox.create({ data: { tenantId, lineId: ctx.lineId, channel: 'api', customerPhone: ctx.phone, kind: 'ozel', orderId: ctx.orderId || null, body, scheduledAt } }).catch(() => {});
      }
    }
  } catch { /* özel otomasyon hatası ana akışı bozmasın */ }
}

// Mağazaya WhatsApp talep iletimi mümkün mü? (sipariş bildirimi açık + gönderime hazır API hattı var)
// Online mağaza siparişi: bu kontrol geçilmeden sipariş KESİNLEŞMEZ (talep mağazaya/panele iletilemiyorsa).
export async function isStoreWhatsappReady(tenantId: string): Promise<boolean> {
  try {
    const st = await prisma.whatsappSettings.findUnique({ where: { tenantId } }).catch(() => null);
    if (st && (st as any).siparisBildirimAktif === false) return false;
    const lines = await prisma.whatsappLine.findMany({ where: { tenantId } }).catch(() => [] as any[]);
    return !!defaultApiLine(lines); // en az bir hazır (doğrulanmış + kimlik bilgili) API hattı
  } catch {
    return false;
  }
}

// Sipariş bildirimi kuyruğa ekle (müşteriye). Sticky: müşteri varsa kendi hattına.
// Dönüş: kuyruğa (whatsappOutbox) gerçekten yazıldıysa true; aksi halde (WA kapalı/hazır hat yok/hata) false.
export async function enqueueOrderNotification(tenantId: string, order: any): Promise<boolean> {
  try {
    const st = await prisma.whatsappSettings.findUnique({ where: { tenantId } }).catch(() => null);
    if (st && st.siparisBildirimAktif === false) return false;
    let cust: any = null;
    if (order?.customerId) cust = await prisma.customer.findUnique({ where: { id: order.customerId } }).catch(() => null);
    let phoneRaw = order?.customer?.telefon || order?.telefon || order?.musteriTelefon || cust?.telefon || '';
    const phone = normPhone(phoneRaw);
    if (!phone || phone.length < 11) return false;

    // Her aksiyonda gönder: yalnızca 3sn'lik çift-tetikleme/çift-tıklama koruması.
    if (order?.id) {
      const debounce = new Date(Date.now() - 3 * 1000);
      const dup = await prisma.whatsappOutbox.findFirst({ where: { tenantId, orderId: String(order.id), kind: 'order', createdAt: { gte: debounce } }, select: { id: true } }).catch(() => null);
      if (dup) return true; // zaten kuyruğa yazılmış → iletim sağlanmış say
    }

    const no = order?.orderNo ? `${order.orderYil}-${String(order.orderNo).padStart(3, '0')}` : ('#' + String(order.id || '').slice(-5));

    // Sepet kalemlerinden satış kodu / varyasyon / ürün tutarı türet (6 değişkenli sipariş bildirimi şablonu için)
    let items: any[] = Array.isArray(order?.items) ? order.items : [];
    let token = order?.token;
    let toplam = order?.toplam ?? order?.tutar;
    let handle = order?.musteriHandle || '';
    if (order?.id) {
      const dbOrder = await prisma.storeOrder.findFirst({ where: { id: String(order.id), tenantId }, select: { items: true, token: true, toplam: true, musteriHandle: true } }).catch(() => null);
      if (dbOrder) {
        if (!items.length && Array.isArray(dbOrder.items)) items = dbOrder.items as any[];
        if (!token) token = (dbOrder as any).token;
        if (toplam == null) toplam = (dbOrder as any).toplam;
        if (!handle) handle = (dbOrder as any).musteriHandle || '';
      }
    }
    // {{1}} = Instagram kullanıcı adı (ad soyad değil). Öncelik: sipariş handle → müşteri instagram → ad.
    const ad = handle || order?.customer?.instagram || cust?.instagram || order?.customer?.ad || cust?.ad || order?.aliciAd || 'Müşteri';
    const productIds = Array.from(new Set(items.map((i) => i.productId).filter(Boolean)));
    const prods = productIds.length ? await prisma.product.findMany({ where: { tenantId, id: { in: productIds } }, select: { id: true, salesCode: true } }).catch(() => [] as any[]) : [];
    const codeMap = new Map(prods.map((p: any) => [p.id, p.salesCode]));
    // {{2}} = SATIŞ KODU (ürün adı DEĞİL). Kalem kodu → ürün salesCode; yoksa "-".
    const kodlar = Array.from(new Set(items.map((i) => i.kod || codeMap.get(i.productId) || '').filter(Boolean)));
    const satisKodu = kodlar.length ? kodlar.slice(0, 3).join(', ') : '-';
    // {{3}} = satın alınan BEDEN / varyasyon.
    const varyasyonlar = Array.from(new Set(items.map((i) => i.varyasyon || i.beden || '').filter(Boolean)));
    const varyasyon = varyasyonlar.length ? varyasyonlar.slice(0, 3).join(', ') : '-';

    const tutar = Number(toplam ?? 0).toLocaleString('tr-TR');
    const link = token ? `${(env.APP_DOMAIN || '').replace(/\/$/, '')}/sepet/${token}` : '-';
    const aksiyon = String(order?.aksiyon || 'Siparişiniz alındı');
    const vars = [ad, satisKodu, varyasyon, tutar || '-', aksiyon, link || '-'];
    const tpl = (st?.siparisSablon) || 'Merhaba {ad}, {no} numaralı siparişiniz alındı. Toplam: {tutar} TL. Teşekkürler!';
    const body = fillNumbered(
      tpl.replace(/\{ad\}/g, ad).replace(/\{no\}/g, no).replace(/\{tutar\}/g, tutar).replace(/\{link\}/g, link === '-' ? '' : link),
      vars,
    );

    const lines = await prisma.whatsappLine.findMany({ where: { tenantId } }).catch(() => [] as any[]);
    const apiLineId = await resolveApiLineForAuto(tenantId, phone, lines);
    // templateVars sırası = siparis_bildirimi şablonundaki {{1}}..{{6}}: ad, satışKodu, varyasyon, ürünTutarı, durum, sepetLinki
    // Otomatik bildirim → her zaman API (channel:'api'). QR/Baileys'e fallback YOK.
    await prisma.whatsappOutbox.create({ data: { tenantId, lineId: apiLineId, channel: 'api', customerPhone: phone, body, kind: 'order', orderId: order?.id || null, templateVars: vars as any } });

    // Kullanıcı tanımlı (özel) otomasyonlar — 'order' tetikleyicili olanlar.
    await enqueueCustomAutomations(tenantId, st, 'order', {
      phone, lineId: apiLineId, orderId: order?.id || null, vars,
      repl: { '{ad}': ad, '{no}': no, '{tutar}': tutar, '{link}': link === '-' ? '' : link, '{urun}': '' },
    });

    // Görsel workflow'lar — 'order' (Sipariş Alındı) tetikleyicisi.
    void startWorkflowRuns(tenantId, 'order', {
      phone, orderId: order?.id || null,
      context: { ad, no, tutar, link: link === '-' ? '' : link, urun: satisKodu === '-' ? '' : satisKodu },
    });
    return true; // talep başarıyla kuyruğa (whatsappOutbox) yazıldı → mağazaya iletim sağlandı
  } catch { /* sipariş akışını asla bozma */ return false; }
}

// ── Mağaza panel gelen-kutusu hedef hattı ─────────────────────────────────────
// Online sipariş TALEBİ, mağazanın WhatsApp paneline GELEN mesaj/konuşma olarak düşer.
// Hedef hat = mağaza numarasına (STORE_WA_PANEL_PHONE, vars. 05323093472) bağlı hat;
// bulunamazsa mevcut varsayılan panel (API) hattı; o da yoksa tenant'ın herhangi bir hattı.
// Numara sabit gömülmez; env ile override edilebilir, yoksa aşağıdaki varsayılana düşer.
const STORE_WA_PANEL_PHONE = String((env as any)?.STORE_WA_PANEL_PHONE || process.env.STORE_WA_PANEL_PHONE || '05323093472');

// Online mağaza talebinin GİDECEĞİ WhatsApp numarası (müşteri wa.me ile buraya yazar).
// Öncelik: mağazaya bağlı panel hattının kendi numarası → yoksa STORE_WA_PANEL_PHONE.
// Katalog akışıyla aynı hattı hedefler; numara sabit gömülmez, hat/config'e bağlıdır.
export async function resolveStoreWaTargetPhone(tenantId: string): Promise<string | null> {
  try {
    const { line } = await resolvePanelLine(tenantId);
    const linePhone = normPhone(String((line as any)?.phone || ''));
    if (linePhone && linePhone.length >= 11) return linePhone;
  } catch { /* yoksay */ }
  const fallback = normPhone(STORE_WA_PANEL_PHONE);
  return fallback && fallback.length >= 11 ? fallback : null;
}

async function resolvePanelLine(tenantId: string): Promise<{ line: any | null; matchedByPhone: boolean }> {
  const lines = await prisma.whatsappLine.findMany({ where: { tenantId } }).catch(() => [] as any[]);
  if (!lines.length) return { line: null, matchedByPhone: false };
  const target = normPhone(STORE_WA_PANEL_PHONE);
  if (target && target.length >= 11) {
    const byPhone = lines.find((l) => normPhone((l as any).phone || '') === target);
    if (byPhone) return { line: byPhone, matchedByPhone: true };
  }
  // Numaraya bağlı hat yok → varsayılan hazır API hattı, o da yoksa ilk hat.
  const def = defaultApiLine(lines) || lines[0];
  return { line: def || null, matchedByPhone: false };
}

// Online sipariş TALEBİNİ mağazanın WhatsApp PANELİNE GELEN mesaj/konuşma olarak yaz.
// Katalog talebinin panele düşme mekanizmasıyla AYNI model kullanılır:
//   whatsappConversation (müşteri telefonuyla) + whatsappMessage(direction:'in').
// Dönüş: panele başarıyla yazıldıysa TRUE. Aksi halde FALSE (sipariş KESİNLEŞMEZ → rollback).
// NOT: Konuşma müşteri telefonuyla açılır ki panelden verilecek yanıt müşteriye gitsin;
// mesaj 'in' yönünde yazılır → panelde müşteriden gelmiş TALEP balonu olarak görünür.
export async function enqueuePanelInboundOrderRequest(tenantId: string, order: any): Promise<boolean> {
  try {
    const st = await prisma.whatsappSettings.findUnique({ where: { tenantId } }).catch(() => null);
    if (st && (st as any).siparisBildirimAktif === false) return false;

    // Panel hedef hattı
    const { line } = await resolvePanelLine(tenantId);
    if (!line) return false; // hiç hat yok → panele düşürülemez → sipariş alınmaz

    // Müşteri bilgisi + telefonu (konuşma anahtarı)
    let cust: any = null;
    if (order?.customerId) cust = await prisma.customer.findUnique({ where: { id: order.customerId } }).catch(() => null);
    const custAd = order?.customer?.ad || cust?.ad || order?.musteriHandle || 'Müşteri';
    const custIg = order?.customer?.instagram || cust?.instagram || order?.musteriHandle || '';
    const custAdres = order?.adres || cust?.adres || order?.customer?.adres || '';
    const phone = normPhone(order?.customer?.telefon || order?.telefon || cust?.telefon || '');
    if (!phone || phone.length < 11) return false;

    // Sipariş kalemleri (ürün + adet + tutar)
    let items: any[] = Array.isArray(order?.items) ? order.items : [];
    let toplam = order?.toplam ?? order?.tutar;
    if (order?.id) {
      const dbOrder = await prisma.storeOrder.findFirst({ where: { id: String(order.id), tenantId }, select: { items: true, toplam: true } }).catch(() => null);
      if (dbOrder) {
        if (!items.length && Array.isArray(dbOrder.items)) items = dbOrder.items as any[];
        if (toplam == null) toplam = (dbOrder as any).toplam;
      }
    }
    const no = order?.orderNo ? `${order.orderYil}-${String(order.orderNo).padStart(3, '0')}` : ('#' + String(order?.id || '').slice(-5));
    const urunler = items.map((it: any) => `• ${it.ad || it.urunAd || '-'}${it.varyasyon ? ' (' + it.varyasyon + ')' : ''} x${it.adet || 1}`).join('\n') || '-';
    const tutar = Number(toplam ?? 0).toLocaleString('tr-TR') + '₺';

    // Panelde "talep" balonu: müşteri adına gelen mesaj metni
    const body =
      `🛒 YENİ ONLİNE SİPARİŞ TALEBİ\n` +
      `👤 ${custAd}${custIg ? ' (@' + custIg.replace(/^@/, '') + ')' : ''}\n` +
      `📞 ${phone}\n` +
      (custAdres ? `📍 ${custAdres}\n` : '') +
      `🔢 Sipariş No: ${no}\n\n` +
      `📦 Ürünler:\n${urunler}\n\n` +
      `💰 Toplam: ${tutar}\n\n` +
      `Talebimi onaylamanızı rica ederim.`;

    const preview = body.replace(/\n+/g, ' ').slice(0, 120);
    const windowExpiresAt = new Date(Date.now() + 24 * 3600 * 1000);

    // Katalog/webhook ile AYNI konuşma modeli: müşteri telefonuyla upsert, 'in' mesaj yaz.
    let convo = await prisma.whatsappConversation.findUnique({ where: { tenantId_customerPhone: { tenantId, customerPhone: phone } } }).catch(() => null);
    if (!convo) {
      convo = await prisma.whatsappConversation.create({
        data: { tenantId, lineId: line.id, customerPhone: phone, customerName: custAd || null, customerId: order?.customerId || cust?.id || null, lastMessageAt: new Date(), lastPreview: preview, lastDirection: 'in', unread: 1, closed: false, windowExpiresAt },
      });
    } else {
      convo = await prisma.whatsappConversation.update({
        where: { id: convo.id },
        data: { lastMessageAt: new Date(), lastPreview: preview, lastDirection: 'in', unread: { increment: 1 }, closed: false, customerName: convo.customerName || custAd || undefined, customerId: convo.customerId || order?.customerId || cust?.id || undefined, windowExpiresAt },
      });
    }

    await prisma.whatsappMessage.create({
      data: { tenantId, conversationId: convo.id, lineId: convo.lineId, customerPhone: phone, direction: 'in', body, status: 'delivered' },
    });

    return true; // talep panele (gelen kutusu/konuşma) başarıyla düştü → sipariş KESİNLEŞEBİLİR
  } catch { return false; }
}

// Durum bildirimi (iptal / yetersiz stok / riskli) — yalnızca KAYITLI müşteriye gönderilir.
export async function enqueueStatusNotification(
  tenantId: string,
  opts: { phone?: string | null; ad?: string | null; kind: 'iptal' | 'stok' | 'riskli' | 'hazirlik' | 'odemeonay'; payload?: { no?: string; urun?: string; tutar?: string | number } },
): Promise<void> {
  try {
    const phone = normPhone(opts.phone || '');
    if (!phone || phone.length < 11) return;
    const cust = await prisma.customer.findFirst({ where: { tenantId, telefon: { contains: phone.slice(-10) } } }).catch(() => null);
    if (!cust) return;

    const st = await prisma.whatsappSettings.findUnique({ where: { tenantId } }).catch(() => null);
    let aktif = true;
    let tpl = '';
    if (opts.kind === 'iptal') { aktif = st?.iptalAktif ?? true; tpl = st?.iptalSablon || 'Merhaba {ad}, {no} numaralı siparişiniz iptal edilmiştir.'; }
    else if (opts.kind === 'stok') { aktif = st?.stokAktif ?? true; tpl = st?.stokSablon || 'Merhaba {ad}, talep ettiğiniz {urun} ürününde stok yetersizliği oluştu.'; }
    else if (opts.kind === 'hazirlik') { aktif = (st as any)?.hazirlikAktif ?? true; tpl = (st as any)?.hazirlikSablon || 'Merhaba {ad}, Siparişiniz için gerekli kontroller tamamlanmıştır. Sepetiniz kargo hazırlık sürecine alınmıştır.'; }
    else if (opts.kind === 'odemeonay') { aktif = (st as any)?.odemeOnayAktif ?? true; tpl = (st as any)?.odemeOnaySablon || 'Merhaba {ad}, {tutar} tutarındaki ödemeniz başarıyla onaylanmıştır. Ödemeniz sistemimize işlenmiştir. Teşekkür eder, iyi alışverişler dileriz.'; }
    else { aktif = st?.riskliAktif ?? false; tpl = st?.riskliSablon || 'Merhaba {ad}, siparişinizle ilgili sizinle iletişime geçeceğiz.'; }
    if (!aktif) return;

    const ad = opts.ad || cust.ad || 'Müşteri';
    const no = opts.payload?.no || '';
    const urun = opts.payload?.urun || '';
    const tutar = opts.payload?.tutar != null ? Number(opts.payload.tutar).toLocaleString('tr-TR') : '';
    const aksiyon = opts.kind === 'stok' ? (urun ? `${urun} ürününde stok yetersizliği` : 'Üründe stok yetersizliği')
      : opts.kind === 'iptal' ? 'Siparişiniz iptal edildi'
      : opts.kind === 'hazirlik' ? 'Siparişiniz kargo hazırlık sürecinde'
      : opts.kind === 'odemeonay' ? 'Ödemeniz onaylandı'
      : 'Siparişiniz inceleniyor';
    // odemeonay için {{2}}=tutar olacak şekilde değişken sırası (onaylı şablon eşleşmesi için)
    const vars = opts.kind === 'odemeonay'
      ? [ad, tutar || '-', '-', tutar || '-', aksiyon, '-']
      : [ad, urun || no || '-', '-', tutar || '-', aksiyon, '-'];
    const body = fillNumbered(
      tpl.replace(/\{ad\}/g, ad).replace(/\{no\}/g, no).replace(/\{urun\}/g, urun).replace(/\{tutar\}/g, tutar),
      vars,
    );

    const lines = await prisma.whatsappLine.findMany({ where: { tenantId } }).catch(() => [] as any[]);
    const apiLineId = await resolveApiLineForAuto(tenantId, phone, lines);
    // 6 değişken: ad, satışKodu(urun), varyasyon, ürünTutarı, durum, sepetLinki
    // Otomatik durum bildirimi → her zaman API. QR/Baileys'e fallback YOK.
    await prisma.whatsappOutbox.create({ data: { tenantId, lineId: apiLineId, channel: 'api', customerPhone: phone, body, kind: opts.kind, templateVars: vars as any } });

    // Kullanıcı tanımlı (özel) otomasyonlar — 'status' (sipariş durumu değişti) tetikleyicili olanlar.
    await enqueueCustomAutomations(tenantId, st, 'status', {
      phone, lineId: apiLineId, vars,
      repl: { '{ad}': ad, '{no}': no, '{tutar}': tutar, '{urun}': urun, '{link}': '' },
    });

    // Görsel workflow'lar — 'status' (Sipariş Durumu) tetikleyicisi. durum = iptal/stok/riskli.
    void startWorkflowRuns(tenantId, 'status', {
      phone, durum: opts.kind,
      context: { ad, no, tutar, link: '', urun },
    });
  } catch { /* akışı asla bozma */ }
}

// İade/Değişim bilgilendirme mesajını kuyruğa ekle (best-effort, serbest metin)
export async function enqueueIadeNotification(tenantId: string, opts: { phone?: string | null; body: string }): Promise<void> {
  try {
    const phone = normPhone(opts.phone || '');
    if (!phone || phone.length < 11 || !opts.body) return;
    const lines = await prisma.whatsappLine.findMany({ where: { tenantId } }).catch(() => [] as any[]);
    const apiLineId = await resolveApiLineForAuto(tenantId, phone, lines);
    await prisma.whatsappOutbox.create({ data: { tenantId, lineId: apiLineId, channel: 'api', customerPhone: phone, body: opts.body, kind: 'ozel' } });
  } catch { /* akışı asla bozma */ }
}

// Canlı satış: bir sepetin (storeOrder) onay bildirimini kuyruğa ekle
export async function enqueueOrderApprovalForCart(tenantId: string, cartId: string, customer?: { ad?: string | null; telefon?: string | null }): Promise<void> {
  try {
    const cart = await prisma.storeOrder.findFirst({ where: { id: cartId, tenantId } });
    if (!cart) return;
    await enqueueOrderNotification(tenantId, {
      id: cart.id,
      customerId: cart.customerId,
      customer: { ad: customer?.ad, telefon: customer?.telefon },
      orderNo: (cart as any).orderNo, orderYil: (cart as any).orderYil,
      toplam: cart.toplam, token: (cart as any).token,
      aksiyon: 'Siparişiniz onaylandı',
    });
  } catch { /* */ }
}

// Müşteriye ödeme/sepet linki gönder (sepet durumuna göre ödeme isteme).
export async function enqueuePaymentRequest(tenantId: string, opts: { orderId?: string; phone?: string | null; ad?: string | null; link?: string | null }): Promise<{ ok: boolean; reason?: string }> {
  try {
    const st = await prisma.whatsappSettings.findUnique({ where: { tenantId } }).catch(() => null);
    if (st && st.odemeAktif === false) return { ok: false, reason: 'Ödeme bildirimi kapalı' };

    let phoneRaw = opts.phone || '';
    let ad = opts.ad || 'Müşteri';
    let no = '';
    let link = opts.link || '';
    let tutar = '';
    if (opts.orderId) {
      const cart = await prisma.storeOrder.findFirst({ where: { id: opts.orderId, tenantId } }).catch(() => null);
      if (cart) {
        if (!phoneRaw && cart.customerId) {
          const c = await prisma.customer.findUnique({ where: { id: cart.customerId } }).catch(() => null);
          phoneRaw = c?.telefon || ''; ad = opts.ad || c?.ad || 'Müşteri';
        }
        no = (cart as any).orderNo ? `${(cart as any).orderYil}-${String((cart as any).orderNo).padStart(3, '0')}` : ('#' + String(cart.id).slice(-5));
        if (!link && (cart as any).token) link = `${env.APP_DOMAIN}/sepet/${(cart as any).token}`;
        tutar = Number((cart as any).toplam ?? 0).toLocaleString('tr-TR');
      }
    }
    const phone = normPhone(phoneRaw);
    if (!phone || phone.length < 11) return { ok: false, reason: 'Geçerli telefon yok' };

    const tpl = st?.odemeSablon || 'Merhaba {ad}, {no} numaralı siparişinizin ödemesini şu linkten tamamlayabilirsiniz: {link}';
    const vars = [ad, no || '-', link || '-', tutar || '-'];
    const body = fillNumbered(
      tpl.replace(/\{ad\}/g, ad).replace(/\{no\}/g, no).replace(/\{link\}/g, link),
      vars,
    );

    const lines = await prisma.whatsappLine.findMany({ where: { tenantId } }).catch(() => [] as any[]);
    const apiLineId = await resolveApiLineForAuto(tenantId, phone, lines);
    // Otomatik ödeme talebi → her zaman API. QR/Baileys'e fallback YOK.
    await prisma.whatsappOutbox.create({ data: { tenantId, lineId: apiLineId, channel: 'api', customerPhone: phone, body, kind: 'payment', orderId: opts.orderId || null, templateVars: vars as any } });
    return { ok: true };
  } catch (e: any) { return { ok: false, reason: String(e?.message || e) }; }
}

// Onaylı şablonla toplu mesaj kampanyası: segment müşterilerini açıp her biri için outbox üretir.
// Değişken pozisyon konvansiyonu (frontend VAR_LABELS ile aynı):
// {{1}} Ad Soyad · {{2}} Tutar · {{3}} Link · {{4}} Ürün Sayısı · {{5}} Sipariş No · {{6}} Durum · {{7}} Link
type BulkVarCtx = { ad: string; tutar: number; link: string; urun: number; siparisNo: string; durum: string };
function fmtTutarTR(n: number): string {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  const [tam, kus] = v.toFixed(2).split('.');
  const grouped = tam.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return kus === '00' ? grouped : `${grouped},${kus}`;
}
// WhatsApp parametreleri yeni satır / sekme / 4+ boşluk içeremez ve boş olamaz.
function sanitizeVar(s: string, fallback: string): string {
  const v = String(s ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return v || fallback;
}
// Şablona göre değişken pozisyon anlamı. Bazı sistem şablonları (ödeme talebi) genel
// konvansiyondan (2=Tutar) farklı bir sıra kullanır → yanlış alan eşleşmesini önlemek için
// şablon adına göre özel harita uygulanır.
type BulkVarField = 'ad' | 'tutar' | 'link' | 'urun' | 'siparisNo' | 'durum';
function templateVarLayout(tpl: any): BulkVarField[] {
  const name = String(tpl?.name || '').toLowerCase();
  // odeme_talebi: 'Merhaba {{1}}, {{2}} numaralı siparişiniz için ödeme bağlantınız: {{3}}. Tutar: {{4}} TL.'
  //   {{1}}=Ad, {{2}}=Sipariş No, {{3}}=Link, {{4}}=Tutar
  if (name === 'odeme_talebi' || /odeme[_\s-]*(talebi|talep|link|baglant)/.test(name)) {
    return ['ad', 'siparisNo', 'link', 'tutar'];
  }
  // Genel konvansiyon (siparis_guncelleme ve diğerleri):
  //   {{1}}=Ad, {{2}}=Tutar, {{3}}=Link, {{4}}=Ürün Sayısı, {{5}}=Sipariş No, {{6}}=Durum, {{7}}=Link
  return ['ad', 'tutar', 'link', 'urun', 'siparisNo', 'durum', 'link'];
}
function fieldValue(field: BulkVarField | undefined, ctx: BulkVarCtx): string {
  switch (field) {
    case 'ad': return ctx.ad;
    case 'tutar': return ctx.tutar > 0 ? fmtTutarTR(ctx.tutar) : '';
    case 'link': return ctx.link;
    case 'urun': return ctx.urun > 0 ? String(ctx.urun) : '';
    case 'siparisNo': return ctx.siparisNo;
    case 'durum': return ctx.durum;
    default: return '';
  }
}
function autoVarValue(pos: number, ctx: BulkVarCtx, layout?: BulkVarField[]): string {
  const map = layout || ['ad', 'tutar', 'link', 'urun', 'siparisNo', 'durum', 'link'];
  return fieldValue(map[pos - 1], ctx);
}

export async function enqueueBulk(tenantId: string, jobId: string): Promise<void> {
  try {
    const job = await prisma.whatsappBulkJob.findFirst({ where: { id: jobId, tenantId } });
    if (!job || job.status === 'canceled') return;
    const tpl = await prisma.whatsappTemplate.findFirst({ where: { id: job.templateId, tenantId } });
    if (!tpl || tpl.status !== 'approved') {
      await prisma.whatsappBulkJob.update({ where: { id: job.id }, data: { status: 'canceled' } }).catch(() => {});
      return;
    }
    const filter: any = (job.filterJson as any) || {};
    const audienceType = String(filter.audienceType || 'all');
    // Hedef telefonları topla
    let phones: string[] = [];
    if (Array.isArray(filter.phones) && filter.phones.length) {
      phones = filter.phones.map((p: string) => normPhone(p)).filter(Boolean);
    } else {
      const where: any = { tenantId };
      if (Array.isArray(filter.customerIds) && filter.customerIds.length) where.id = { in: filter.customerIds };
      const custs = await prisma.customer.findMany({ where, select: { telefon: true, ad: true, id: true } }).catch(() => [] as any[]);
      phones = custs.map((c) => normPhone(c.telefon || '')).filter((p) => p && p.length >= 11);
    }
    phones = Array.from(new Set(phones));

    // Şablondaki değişken sayısı (gönderilecek parametre sayısı bununla eşleşmeli → #132000 önlenir)
    const varCount = (() => { let m = 0; const re = /\{\{(\d+)\}\}/g; let x: any; while ((x = re.exec(String(tpl.bodyText || '')))) m = Math.max(m, Number(x[1])); return m; })();
    const manualVars: string[] = Array.isArray(filter.vars) ? filter.vars.map((v: any) => String(v ?? '')) : [];

    // Alıcı bazlı bağlam (ad / tutar / link / ürün / sipariş no / durum)
    const ctxByPhone = new Map<string, BulkVarCtx>();
    const setCtx = (rawPhone: string | null | undefined, partial: Partial<BulkVarCtx>) => {
      const ph = normPhone(rawPhone || '');
      if (!ph) return;
      const cur = ctxByPhone.get(ph) || { ad: '', tutar: 0, link: '', urun: 0, siparisNo: '', durum: '' };
      ctxByPhone.set(ph, { ...cur, ...partial });
    };
    if (varCount > 0) {
      if (audienceType === 'cart' || audienceType === 'unpaid') {
        const durumFilter = audienceType === 'cart' ? { durum: 'sepet' } : { durum: { notIn: ['tamamlandi', 'iptal'] } };
        const orders = await prisma.storeOrder.findMany({
          where: { tenantId, ...(durumFilter as any) },
          orderBy: { createdAt: 'desc' },
          select: { orderNo: true, orderYil: true, durum: true, toplam: true, tahsilat: true, items: true, odemeLinki: true, musteriHandle: true, customer: { select: { ad: true, telefon: true } } },
        }).catch(() => [] as any[]);
        for (const o of orders) {
          if (audienceType === 'unpaid' && (Number(o.toplam || 0) - Number(o.tahsilat || 0)) <= 0) continue;
          const ph = normPhone(o.customer?.telefon || '');
          if (!ph || ctxByPhone.has(ph)) continue; // en güncel sipariş kalır
          const itemArr = Array.isArray(o.items) ? o.items : [];
          const urun = itemArr.reduce((a: number, it: any) => a + (Number(it?.adet) || 1), 0);
          const tutar = audienceType === 'unpaid' ? (Number(o.toplam || 0) - Number(o.tahsilat || 0)) : Number(o.toplam || 0);
          setCtx(ph, {
            ad: o.customer?.ad || o.musteriHandle || '',
            tutar,
            link: o.odemeLinki || '',
            urun,
            siparisNo: o.orderNo ? `${o.orderYil}-${String(o.orderNo).padStart(3, '0')}` : '',
            durum: o.durum || '',
          });
        }
      }
      // Bağlamı olmayan (veya sadece ad gereken) telefonlar için müşteri adını çek
      const missing = phones.filter((p) => !ctxByPhone.get(p)?.ad);
      if (missing.length) {
        const custs = await prisma.customer.findMany({ where: { tenantId }, select: { ad: true, telefon: true } }).catch(() => [] as any[]);
        for (const c of custs) { const ph = normPhone(c.telefon || ''); if (ph && missing.includes(ph) && !ctxByPhone.get(ph)?.ad) setCtx(ph, { ad: c.ad || '' }); }
      }
    }

    let created = 0;
    // Şablon değişken pozisyon haritası (ödeme talebinde 2=Sipariş No, 4=Tutar gibi özel sıra)
    const layout = templateVarLayout(tpl);
    // Şablon bazlı varsayılan örnek değerler (katalog linki vb.) — manuel/otomatik yoksa kullanılır
    const tplSample: string[] = Array.isArray(tpl.sampleJson) ? (tpl.sampleJson as any[]).map((v) => String(v ?? '')) : [];
    for (const phone of phones) {
      const ctx = ctxByPhone.get(phone) || { ad: '', tutar: 0, link: '', urun: 0, siparisNo: '', durum: '' };
      // Her pozisyon için: manuel değer doluysa onu kullan, boşsa alıcı verisinden otomatik doldur, o da yoksa şablon varsayılanı
      const varList: string[] = [];
      for (let i = 1; i <= varCount; i++) {
        const manual = (manualVars[i - 1] || '').trim();
        const auto = autoVarValue(i, ctx, layout);
        const def = (tplSample[i - 1] || '').trim();
        const fallback = i === 1 ? 'Değerli Müşterimiz' : '-';
        varList.push(sanitizeVar(manual || auto || def, fallback));
      }
      const body = renderTemplatePreview(tpl, varList);
      await prisma.whatsappOutbox.create({
        data: { tenantId, lineId: null, customerPhone: phone, body, kind: 'bulk', templateId: tpl.id, templateVars: varList as any, bulkJobId: job.id },
      }).catch(() => {});
      created++;
    }
    await prisma.whatsappBulkJob.update({ where: { id: job.id }, data: { total: created, status: 'running' } }).catch(() => {});
  } catch (e) { console.error('[wa] enqueueBulk', e); }
}

function renderTemplatePreview(tpl: any, vars: string[]): string {
  let s = String(tpl.bodyText || '');
  vars.forEach((v, i) => { s = s.replace(new RegExp(`\\{\\{${i + 1}\\}\\}`, 'g'), v); });
  return s;
}

// AI oto-yanıt: ayar açıksa gelen mesaja botReply ile otomatik cevap üret → outbox(kind='ai').
// Döngü koruması: yalnızca gelen mesaja yanıt; son 8 sn içinde zaten AI cevabı kuyruğa girdiyse atla.
export async function maybeAiReply(tenantId: string, convo: any, incomingText: string): Promise<void> {
  try {
    if (!incomingText || !incomingText.trim()) return;
    const st = await prisma.whatsappSettings.findUnique({ where: { tenantId } }).catch(() => null);
    if (!st?.aiAutoReplyAktif) return;

    const recentAi = await prisma.whatsappOutbox.findFirst({
      where: { tenantId, customerPhone: convo.customerPhone, kind: 'ai', createdAt: { gte: new Date(Date.now() - 8000) } },
      select: { id: true },
    }).catch(() => null);
    if (recentAi) return;

    const histMsgs = await prisma.whatsappMessage.findMany({
      where: { conversationId: convo.id }, orderBy: { createdAt: 'desc' }, take: 12,
    }).catch(() => [] as any[]);
    const history = histMsgs.reverse().slice(0, -1).map((m) => ({ role: m.direction === 'in' ? 'user' : 'bot', content: m.body || '' }));

    const ctx: any = { tenantId, session: { musteriAd: convo.customerName || null, telefon: convo.customerPhone || null }, appOrigin: env.APP_DOMAIN || '', cartToken: null };
    const r = await botReply(tenantId, incomingText, false, history, ctx).catch(() => null);
    const reply = (r as any)?.reply?.trim();
    if (!reply) return;

    await prisma.whatsappOutbox.create({ data: { tenantId, lineId: convo.lineId, customerPhone: convo.customerPhone, body: reply, kind: 'ai' } });
  } catch { /* yanıt akışını bozma */ }
}

type SendPlan =
  | { mode: 'baileys-text' }
  | { mode: 'baileys-media' }
  | { mode: 'api-text' }
  | { mode: 'api-media' }
  | { mode: 'api-template'; templateName: string; language: string; bodyParams: string[]; header?: { type: 'text' | 'image' | 'document'; value: string } }
  | { mode: 'fallback-baileys'; lineId: string }
  | { mode: 'skip' };

// Pencere kapalıyken kind'a göre kullanılacak varsayılan onaylı şablon adı.
// Sipariş aksiyonları (alındı/onaylandı/ürün eklendi/çıkarıldı/stok/iptal) tek şablonda toplanır.
const DEFAULT_TEMPLATE_BY_KIND: Record<string, string> = {
  order: 'siparis_wpbildir',
  status: 'siparis_wpbildir',
  stok: 'siparis_wpbildir',
  iptal: 'siparis_wpbildir',
  riskli: 'siparis_wpbildir',
  payment: 'odeme_talebi',
  hazirlik: 'siparis_wpbildir',
  odemeonay: 'siparis_wpbildir',
};

// Bir satır + hat + konuşma penceresine göre nasıl gönderileceğini planla.
async function planSend(tenantId: string, row: any, line: any, convo: any, st: any, lines: any[], now: number, usedThisTick: Set<string>): Promise<SendPlan> {
  const hasMedia = !!row.mediaUrl;
  // QR (Baileys) hat: pencere kavramı yok
  if ((line as any).channel !== 'api') {
    return hasMedia ? { mode: 'baileys-media' } : { mode: 'baileys-text' };
  }

  // API hat
  const windowOpen = !!(convo && convo.windowExpiresAt && new Date(convo.windowExpiresAt).getTime() > now);

  // Şablonla gönderim isteniyorsa (pencereden bağımsız çalışır)
  if (row.templateId) {
    const tpl = await prisma.whatsappTemplate.findFirst({ where: { id: row.templateId, tenantId } }).catch(() => null);
    if (tpl && tpl.status === 'approved') {
      let vars: string[] = Array.isArray(row.templateVars) ? (row.templateVars as any[]).map((v) => String(v ?? '')) : [];
      // Şablonun gerektirdiği {{n}} değişken sayısı. Panel/sohbetten şablon seçilince templateVars boş gelebilir;
      // eksikse otomatik doldur (1. değişken müşteri adı). Aksi halde Meta "parametre sayısı uyuşmuyor" der ve mesaj gitmez.
      const need = (() => { let m = 0; const re = /\{\{(\d+)\}\}/g; let x: any; while ((x = re.exec(String(tpl.bodyText || '')))) m = Math.max(m, Number(x[1])); return m; })();
      if (vars.length < need) {
        let ad = '';
        const last10 = row.customerPhone.replace(/\D/g, '').slice(-10);
        if (need >= 1 && last10) { const c = await prisma.customer.findFirst({ where: { tenantId, telefon: { contains: last10 } }, select: { ad: true } }).catch(() => null); ad = c?.ad || ''; }
        const filled: string[] = [];
        for (let i = 1; i <= need; i++) {
          const existing = (vars[i - 1] || '').trim();
          filled.push(sanitizeVar(existing || (i === 1 ? ad : ''), i === 1 ? 'Değerli Müşterimiz' : '-'));
        }
        vars = filled;
      } else if (vars.length > need) {
        vars = vars.slice(0, need);
      }
      let header: any = undefined;
      if (tpl.headerType === 'text' && tpl.headerText) header = { type: 'text', value: tpl.headerText };
      else if ((tpl.headerType === 'image' || tpl.headerType === 'document') && row.mediaUrl) header = { type: tpl.headerType, value: row.mediaUrl };
      return { mode: 'api-template', templateName: tpl.name, language: tpl.language || 'tr', bodyParams: vars, header };
    }
    // şablon onaylı değil → fallback dene
  }

  // Pencere açıksa serbest metin/medya (normal mesaj — ödeme/şablon tetiklemez)
  if (windowOpen) return hasMedia ? { mode: 'api-media' } : { mode: 'api-text' };

  // Pencere KAPALI: kind'a göre varsayılan onaylı şablonu otomatik kullan.
  // Manuel sohbet mesajları (kind='manual' veya boş) için panelde seçilen "pencere kapalı" şablonuna düşülür.
  const effKind = row.kind && String(row.kind) !== '' ? String(row.kind) : 'manual';
  if (!row.templateId) {
    const mapped = (st as any)?.sablonEslesme?.[effKind];
    let name = mapped || DEFAULT_TEMPLATE_BY_KIND[effKind];
    // Sohbet ekranından gönderilen serbest metin (manuel mesaj) + pencere KAPALI:
    // iletisim onaylı şablonuna düş (müşteri ile iletişim kurmak için uygun şablon).
    if (!name && effKind === 'manual') name = (st as any)?.sablonEslesme?.iletisim || 'iletisim';
    if (name) {
      const tpl = await prisma.whatsappTemplate.findFirst({ where: { tenantId, name, status: 'approved' } }).catch(() => null);
      if (tpl) {
        let vars: string[] = Array.isArray(row.templateVars) ? (row.templateVars as any[]).map((v) => String(v ?? '')) : [];
        // Şablonun gerektirdiği değişken sayısı (manuel mesajlarda templateVars boş olur → otomatik doldur)
        const need = (() => { let m = 0; const re = /\{\{(\d+)\}\}/g; let x: any; while ((x = re.exec(String(tpl.bodyText || '')))) m = Math.max(m, Number(x[1])); return m; })();
        if (vars.length < need) {
          let ad = '';
          const last10 = row.customerPhone.replace(/\D/g, '').slice(-10);
          if (need >= 1 && last10) { const c = await prisma.customer.findFirst({ where: { tenantId, telefon: { contains: last10 } }, select: { ad: true } }).catch(() => null); ad = c?.ad || ''; }
          const filled: string[] = [];
          for (let i = 1; i <= need; i++) {
            const existing = (vars[i - 1] || '').trim();
            filled.push(sanitizeVar(existing || (i === 1 ? ad : ''), i === 1 ? 'Değerli Müşterimiz' : '-'));
          }
          vars = filled;
        }
        if (vars.length === need) {
          let header: any = undefined;
          if (tpl.headerType === 'text' && tpl.headerText) header = { type: 'text', value: tpl.headerText };
          else if ((tpl.headerType === 'image' || tpl.headerType === 'document') && row.mediaUrl) header = { type: tpl.headerType, value: row.mediaUrl };
          return { mode: 'api-template', templateName: tpl.name, language: tpl.language || 'tr', bodyParams: vars, header };
        }
      }
    }
  }

  // Pencere kapalı + onaylı şablon yok → gönderilemez (QR/Baileys'e otomatik düşme YOK)
  return { mode: 'skip' }; // gönderilemiyor → beklet
}

let _working = false;

// Kuyruk worker'ı: throttle + günlük limit + sticky + dengeli dağıtım + kanal (QR/API) dispatch
export async function processOutbox(): Promise<void> {
  if (_working) return;
  _working = true;
  try {
    const tenants: string[] = (await prisma.whatsappOutbox.findMany({
      where: { status: 'pending', scheduledAt: { lte: new Date() } },
      distinct: ['tenantId'], select: { tenantId: true }, take: 20,
    })).map((r) => r.tenantId);

    for (const tenantId of tenants) {
      const st = await ensureSettings(tenantId);
      if (!withinBusinessHours(st)) continue;

      const lines = await prisma.whatsappLine.findMany({ where: { tenantId } });
      if (!lines.length) continue;

      const pending = await prisma.whatsappOutbox.findMany({
        where: { tenantId, status: 'pending', scheduledAt: { lte: new Date() } },
        orderBy: { scheduledAt: 'asc' }, take: 50,
      });

      const usedThisTick = new Set<string>();
      const now = Date.now();

      for (const row of pending) {
        // Konuşma + 24 saatlik pencere durumu (limit kararı buna göre verilir)
        const convo = await prisma.whatsappConversation.findUnique({ where: { tenantId_customerPhone: { tenantId, customerPhone: row.customerPhone } } }).catch(() => null);
        const windowOpen = !!(convo && (convo as any).windowExpiresAt && new Date((convo as any).windowExpiresAt).getTime() > now);
        // Günlük (anti-spam) limit YALNIZCA pencere KAPALI gönderimlere (onaylı şablon / yeni sohbet başlatma) uygulanır.
        // Pencere AÇIK serbest oturum mesajları limite tabi DEĞİLDİR; sınır dolu olsa bile gönderilir.
        const newChat = !windowOpen || !!(row as any).templateId;

        // Kanal politikası: VARSAYILAN API. Yalnızca kullanıcı panelden açıkça QR seçtiyse (row.channel==='qr')
        // Baileys/QR kullanılır. Otomatik bildirimler (channel:'api'/null) hiçbir zaman QR'a düşmez.
        const wantsQr = (row as any).channel === 'qr';

        // Hangi hat?
        let line: any = null;
        if (row.lineId) {
          const stored = lines.find((l) => l.id === row.lineId) || null;
          if (stored) {
            const storedApi = (stored as any).channel === 'api';
            // Kanal uyuşmazlığı: QR isteniyor ama hat API (veya tersi) → kayıtlı hattı yok say, doğru kanaldan seç.
            if (wantsQr === storedApi) {
              line = null;
            } else {
              line = stored;
              const { limit, aralik, newChatToday } = lineLimits(line, st);
              const lastMs = line.lastSentAt ? new Date(line.lastSentAt).getTime() : 0;
              const limitDolu = newChat && newChatToday >= limit;
              const throttled = !storedApi && (usedThisTick.has(line.id) || now - lastMs < aralik * 1000);
              if (!lineReady(line) || limitDolu || throttled) line = null;
            }
          }
        }
        if (!line) {
          // QR isteniyorsa yalnızca QR hatlarından; aksi halde yalnızca API hatlarından seç.
          line = pickBalancedLine(lines, st, now, usedThisTick, newChat, wantsQr, !wantsQr);
        }
        if (!line) continue; // uygun hat yok → beklet

        const plan = await planSend(tenantId, row, line, convo, st, lines, now, usedThisTick);
        if (plan.mode === 'skip') {
          // gönderilemiyor (pencere kapalı + onaylı şablon yok + fallback yok) → sonraki tick'e ertele
          await prisma.whatsappOutbox.update({ where: { id: row.id }, data: { scheduledAt: new Date(now + 60000), error: 'Pencere kapalı / onaylı şablon yok' } }).catch(() => {});
          continue;
        }

        // Fallback ise gönderim hattını değiştir
        let sendLine = line;
        if (plan.mode === 'fallback-baileys') {
          sendLine = lines.find((l) => l.id === plan.lineId) || line;
        }

        try {
          let waId: string | null = null;
          let templateName: string | null = null;
          const phone = row.customerPhone;
          const mediaType = row.mediaType || 'document';
          const mediaUrl = row.mediaUrl || '';

          // Alıntılı (yanıt) gönderim bilgisi: hedef mesajın yönünü çöz (Baileys quoted için fromMe gerekir)
          const replyToWaId: string | null = (row as any).replyToWaId || null;
          let replyToText: string | null = (row as any).replyToText || null;
          let replyFromMe = false;
          if (replyToWaId) {
            const orig = await prisma.whatsappMessage.findFirst({ where: { tenantId, waMessageId: replyToWaId }, select: { direction: true, body: true } }).catch(() => null);
            if (orig) { replyFromMe = orig.direction === 'out'; if (!replyToText) replyToText = (orig.body || '').slice(0, 120); }
          }
          const quoted = replyToWaId ? { waId: replyToWaId, fromMe: replyFromMe, text: replyToText } : null;

          if (plan.mode === 'baileys-text' || (plan.mode === 'fallback-baileys')) {
            waId = await sendText(sendLine.id, phone, row.body, quoted);
          } else if (plan.mode === 'baileys-media') {
            waId = await sendMedia(sendLine.id, phone, mediaType, mediaUrl, row.body || undefined, row.fileName || undefined, quoted);
          } else if (plan.mode === 'api-text') {
            waId = await apiSendText(sendLine, phone, row.body, replyToWaId);
          } else if (plan.mode === 'api-media') {
            waId = await apiSendMedia(sendLine, phone, mediaType, mediaUrl, row.body || undefined, row.fileName || undefined, replyToWaId);
          } else if (plan.mode === 'api-template') {
            waId = await apiSendTemplate(sendLine, phone, plan.templateName, plan.language, plan.bodyParams, plan.header);
            templateName = plan.templateName;
          }

          const preview = (row.body || (templateName ? `[şablon: ${templateName}]` : '[medya]')).slice(0, 120);
          const convoRow = await prisma.whatsappConversation.upsert({
            where: { tenantId_customerPhone: { tenantId, customerPhone: phone } },
            update: { lastMessageAt: new Date(), lastPreview: preview, lastDirection: 'out', closed: false },
            create: { tenantId, lineId: sendLine.id, customerPhone: phone, lastMessageAt: new Date(), lastPreview: preview, lastDirection: 'out' },
          });
          await prisma.whatsappMessage.create({
            data: {
              tenantId, conversationId: convoRow.id, lineId: sendLine.id, customerPhone: phone, direction: 'out',
              body: row.body || '', mediaType: row.mediaType || null, mediaUrl: row.mediaUrl || null, fileName: row.fileName || null,
              templateName, waMessageId: waId, status: 'sent',
              replyToWaId: replyToWaId || null, replyToText: replyToText || null,
              sentByName: (row as any).sentByName || null,
            },
          });
          await prisma.whatsappOutbox.update({ where: { id: row.id }, data: { status: 'sent', sentAt: new Date(), lineId: sendLine.id, attempts: { increment: 1 } } });

          // Toplu iş ilerlemesi
          if (row.bulkJobId) await prisma.whatsappBulkJob.update({ where: { id: row.bulkJobId }, data: { sent: { increment: 1 } } }).catch(() => {});

          // Hat sayaçları
          const sd = sendLine.sentDate === todayStr();
          const nd = sendLine.newChatDate === todayStr();
          const data: any = { lastSentAt: new Date(), sentDate: todayStr(), sentToday: sd ? { increment: 1 } : 1 };
          if (newChat) { data.newChatDate = todayStr(); data.newChatToday = nd ? { increment: 1 } : 1; }
          await prisma.whatsappLine.update({ where: { id: sendLine.id }, data });
          sendLine.lastSentAt = new Date(); sendLine.sentDate = todayStr(); sendLine.sentToday = (sd ? (sendLine.sentToday || 0) : 0) + 1;
          if (newChat) { sendLine.newChatDate = todayStr(); sendLine.newChatToday = (nd ? (sendLine.newChatToday || 0) : 0) + 1; }
          usedThisTick.add(sendLine.id);
        } catch (e: any) {
          console.error(`[processOutbox] Mesaj gönderim hatası id=${row.id} phone=${row.customerPhone}:`, e?.message || e);
          const attempts = (row.attempts || 0) + 1;
          const failed = attempts >= 5;
          await prisma.whatsappOutbox.update({ where: { id: row.id }, data: { attempts, status: failed ? 'failed' : 'pending', error: String(e?.message || e).slice(0, 200), scheduledAt: new Date(now + 60000) } });
          if (failed && row.bulkJobId) await prisma.whatsappBulkJob.update({ where: { id: row.bulkJobId }, data: { failed: { increment: 1 } } }).catch(() => {});
        }
      }

      // Tamamlanan toplu işleri kapat
      await closeFinishedBulkJobs(tenantId).catch(() => {});
    }
  } catch (e: any) { console.error('[processOutbox] Genel hata:', e?.message || e); } finally {
    _working = false;
  }
}

async function closeFinishedBulkJobs(tenantId: string): Promise<void> {
  const jobs = await prisma.whatsappBulkJob.findMany({ where: { tenantId, status: 'running' } }).catch(() => [] as any[]);
  for (const j of jobs) {
    if ((j.sent + j.failed) >= j.total && j.total > 0) {
      await prisma.whatsappBulkJob.update({ where: { id: j.id }, data: { status: 'done' } }).catch(() => {});
    }
  }
}
