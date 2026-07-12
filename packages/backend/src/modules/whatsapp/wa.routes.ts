import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { asyncHandler, ApiError } from '../../lib/http';
import { actorName } from '../store/store.routes';
import { startLine, logoutLine, stopLine, lineStatus, isConnected, normPhone, sendReaction, deleteForEveryone } from './wa.manager';
import { ensureSettings, enqueuePaymentRequest, enqueueBulk, processOutbox } from './wa.service';
import { apiPhoneInfo, apiSendReaction } from './wa.cloud';
import { submitTemplate, syncTemplateStatuses } from './wa.templates';
import { cancelRunsForWorkflow } from './wa.workflow';
import { saveMedia, mediaKindFromMime } from './wa.media';
import { env } from '../../config/env';
import { sendSms, getNetgsmSettings, saveNetgsmPrefs } from '../sms/netgsm.service';
import { llmReply, llmAvailable } from '../bot/llm';

const router = Router();

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function maskToken(t?: string | null): string | null {
  if (!t) return null;
  const s = String(t);
  return s.length <= 8 ? '••••' : `${s.slice(0, 4)}••••${s.slice(-4)}`;
}

// data:[mime];base64,xxxx → diske kaydet, public URL döndür
function saveDataUrl(dataUrl: string, fileName?: string): { url: string; mediaType: string; mime: string; fileName?: string } | null {
  const m = /^data:([^;]+);base64,(.+)$/s.exec(String(dataUrl || ''));
  if (!m) return null;
  const mime = m[1];
  const buf = Buffer.from(m[2], 'base64');
  const saved = saveMedia(buf, mime, fileName);
  return { url: saved.url, mediaType: mediaKindFromMime(mime), mime, fileName: fileName };
}

// ─── Hatlar ───────────────────────────────────────────────────────────────────

// Hat listesi (canlı runtime durumuyla birleşik)
router.get('/lines', asyncHandler(async (req: Request, res: Response) => {
  const lines = await prisma.whatsappLine.findMany({ where: { tenantId: req.tenantId! }, orderBy: { createdAt: 'asc' } });
  const out = lines.map((l) => {
    const rt = lineStatus(l.id);
    const sentToday = l.sentDate === todayStr() ? l.sentToday : 0;
    const newChatToday = l.newChatDate === todayStr() ? l.newChatToday : 0;
    const isApi = (l as any).channel === 'api';
    return {
      id: l.id, label: l.label, phone: l.phone, jid: l.jid,
      status: isApi ? (l.apiVerified ? 'connected' : 'disconnected') : (rt.status !== 'disconnected' ? rt.status : l.status),
      channel: (l as any).channel || 'qr',
      wabaId: l.wabaId || null, phoneNumberId: l.phoneNumberId || null,
      hasToken: !!l.accessToken, apiTokenMasked: maskToken(l.accessToken), apiVerified: !!l.apiVerified,
      active: l.active, gunlukLimit: l.gunlukLimit, gonderimAralikSn: l.gonderimAralikSn,
      sentToday, newChatToday, lastSentAt: l.lastSentAt, lastConnectedAt: l.lastConnectedAt,
      hasQr: !!rt.qr,
    };
  });
  res.json({ lines: out });
}));

// Yeni hat ekle
router.post('/lines', asyncHandler(async (req: Request, res: Response) => {
  const { label, gunlukLimit, gonderimAralikSn } = req.body || {};
  if (!label || !String(label).trim()) throw new ApiError(422, 'Hat etiketi gerekli.');
  const line = await prisma.whatsappLine.create({
    data: {
      tenantId: req.tenantId!, label: String(label).trim(),
      gunlukLimit: Number(gunlukLimit) || 0, gonderimAralikSn: Number(gonderimAralikSn) || 0,
    },
  });
  res.json({ ok: true, line });
}));

// Hat güncelle (etiket / limit / aralık / aktif)
router.put('/lines/:id', asyncHandler(async (req: Request, res: Response) => {
  const line = await prisma.whatsappLine.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!line) throw new ApiError(404, 'Hat bulunamadı.');
  const { label, gunlukLimit, gonderimAralikSn, active } = req.body || {};
  const data: any = {};
  if (label != null) data.label = String(label).trim();
  if (gunlukLimit != null) data.gunlukLimit = Number(gunlukLimit) || 0;
  if (gonderimAralikSn != null) data.gonderimAralikSn = Number(gonderimAralikSn) || 0;
  if (active != null) data.active = !!active;
  const updated = await prisma.whatsappLine.update({ where: { id: line.id }, data });
  res.json({ ok: true, line: updated });
}));

// Hattı başlat → QR üretimi tetiklenir
router.post('/lines/:id/connect', asyncHandler(async (req: Request, res: Response) => {
  const line = await prisma.whatsappLine.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!line) throw new ApiError(404, 'Hat bulunamadı.');
  await startLine(line.id);
  res.json({ ok: true, ...lineStatus(line.id) });
}));

// QR/durum polling
router.get('/lines/:id/qr', asyncHandler(async (req: Request, res: Response) => {
  const line = await prisma.whatsappLine.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!line) throw new ApiError(404, 'Hat bulunamadı.');
  res.json(lineStatus(line.id));
}));

// Oturumu kapat (QR'ı geçersiz kıl + oturum dosyalarını sil)
router.post('/lines/:id/logout', asyncHandler(async (req: Request, res: Response) => {
  const line = await prisma.whatsappLine.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!line) throw new ApiError(404, 'Hat bulunamadı.');
  await logoutLine(line.id);
  res.json({ ok: true });
}));

// Hattı sil (önce durdur, sonra kayıt sil)
router.delete('/lines/:id', asyncHandler(async (req: Request, res: Response) => {
  const line = await prisma.whatsappLine.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!line) throw new ApiError(404, 'Hat bulunamadı.');
  try { await stopLine(line.id); } catch { /* */ }
  await prisma.whatsappLine.delete({ where: { id: line.id } });
  res.json({ ok: true });
}));

// ─── Hat kanalı / Cloud API yapılandırması ─────────────────────────────────────

// Kanal değiştir: qr ↔ api
router.put('/lines/:id/channel', asyncHandler(async (req: Request, res: Response) => {
  const line = await prisma.whatsappLine.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!line) throw new ApiError(404, 'Hat bulunamadı.');
  const channel = String(req.body?.channel || '').toLowerCase();
  if (!['qr', 'api'].includes(channel)) throw new ApiError(422, 'Geçersiz kanal (qr|api).');
  // QR → API geçişinde soketi durdur
  if (channel === 'api') { try { await stopLine(line.id); } catch { /* */ } }
  const updated = await prisma.whatsappLine.update({ where: { id: line.id }, data: { channel } });
  res.json({ ok: true, line: { id: updated.id, channel: updated.channel } });
}));

// Cloud API kimliklerini kaydet (token maskeli döner)
router.put('/lines/:id/api', asyncHandler(async (req: Request, res: Response) => {
  const line = await prisma.whatsappLine.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!line) throw new ApiError(404, 'Hat bulunamadı.');
  const { phoneNumberId, wabaId, accessToken } = req.body || {};
  const data: any = { channel: 'api', apiVerified: false };
  if (phoneNumberId != null) data.phoneNumberId = String(phoneNumberId).trim() || null;
  if (wabaId != null) data.wabaId = String(wabaId).trim() || null;
  if (accessToken != null && String(accessToken).trim() && !/•/.test(String(accessToken))) data.accessToken = String(accessToken).trim();
  const updated = await prisma.whatsappLine.update({ where: { id: line.id }, data });
  res.json({ ok: true, line: { id: updated.id, channel: updated.channel, phoneNumberId: updated.phoneNumberId, wabaId: updated.wabaId, hasToken: !!updated.accessToken, apiTokenMasked: maskToken(updated.accessToken), apiVerified: updated.apiVerified } });
}));

// Bağlantıyı test et (Graph /{phoneNumberId})
router.post('/lines/:id/api/verify', asyncHandler(async (req: Request, res: Response) => {
  const line = await prisma.whatsappLine.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!line) throw new ApiError(404, 'Hat bulunamadı.');
  try {
    const info = await apiPhoneInfo(line);
    await prisma.whatsappLine.update({ where: { id: line.id }, data: { apiVerified: true, phone: info.phone || line.phone, status: 'connected' } });
    res.json({ ok: true, phone: info.phone, name: info.name });
  } catch (e: any) {
    await prisma.whatsappLine.update({ where: { id: line.id }, data: { apiVerified: false } }).catch(() => {});
    throw new ApiError(400, 'Doğrulama başarısız: ' + String(e?.message || e));
  }
}));

// Webhook bilgisi (panelde Meta'ya yapıştırmak için) — verify token yoksa üret
router.get('/webhook-info', asyncHandler(async (req: Request, res: Response) => {
  let st = await ensureSettings(req.tenantId!);
  if (!st.webhookVerifyToken) {
    const token = crypto.randomBytes(16).toString('hex');
    st = await prisma.whatsappSettings.update({ where: { tenantId: req.tenantId! }, data: { webhookVerifyToken: token } });
  }
  const base = (env.APP_DOMAIN || '').replace(/\/$/, '');
  res.json({ url: `${base}/api/v1/whatsapp/webhook`, verifyToken: st.webhookVerifyToken });
}));

// ─── Şablonlar ──────────────────────────────────────────────────────────────────

router.get('/templates', asyncHandler(async (req: Request, res: Response) => {
  const templates = await prisma.whatsappTemplate.findMany({ where: { tenantId: req.tenantId! }, orderBy: { updatedAt: 'desc' } });
  res.json({ templates });
}));

router.post('/templates', asyncHandler(async (req: Request, res: Response) => {
  const b = req.body || {};
  const name = String(b.name || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 60);
  if (!name) throw new ApiError(422, 'Şablon adı gerekli (küçük harf + _).');
  if (!String(b.bodyText || '').trim()) throw new ApiError(422, 'Şablon gövdesi gerekli.');
  const tpl = await prisma.whatsappTemplate.create({
    data: {
      tenantId: req.tenantId!, name, language: String(b.language || 'tr'), category: String(b.category || 'UTILITY'),
      headerType: b.headerType || null, headerText: b.headerText || null, bodyText: String(b.bodyText),
      footerText: b.footerText || null, buttonsJson: b.buttonsJson || undefined, sampleJson: b.sampleJson || undefined, varMap: b.varMap || undefined,
      status: 'draft',
    },
  });
  res.json({ ok: true, template: tpl });
}));

router.put('/templates/:id', asyncHandler(async (req: Request, res: Response) => {
  const tpl = await prisma.whatsappTemplate.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!tpl) throw new ApiError(404, 'Şablon bulunamadı.');
  if (tpl.status === 'pending') throw new ApiError(409, 'Onay bekleyen şablon düzenlenemez.');
  const b = req.body || {};
  const data: any = {};
  if (b.language != null) data.language = String(b.language);
  if (b.category != null) data.category = String(b.category);
  if (b.headerType !== undefined) data.headerType = b.headerType || null;
  if (b.headerText !== undefined) data.headerText = b.headerText || null;
  if (b.bodyText != null) data.bodyText = String(b.bodyText);
  if (b.footerText !== undefined) data.footerText = b.footerText || null;
  if (b.buttonsJson !== undefined) data.buttonsJson = b.buttonsJson || undefined;
  if (b.sampleJson !== undefined) data.sampleJson = b.sampleJson || undefined;
  if (b.varMap !== undefined) data.varMap = b.varMap || undefined;
  if (b.status === 'draft') data.status = 'draft';
  const updated = await prisma.whatsappTemplate.update({ where: { id: tpl.id }, data });
  res.json({ ok: true, template: updated });
}));

router.delete('/templates/:id', asyncHandler(async (req: Request, res: Response) => {
  const tpl = await prisma.whatsappTemplate.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!tpl) throw new ApiError(404, 'Şablon bulunamadı.');
  await prisma.whatsappTemplate.delete({ where: { id: tpl.id } });
  res.json({ ok: true });
}));

// Şablonu Meta'ya onaya gönder
router.post('/templates/:id/submit', asyncHandler(async (req: Request, res: Response) => {
  const r = await submitTemplate(req.tenantId!, req.params.id);
  if (!r.ok) throw new ApiError(400, r.error || 'Onaya gönderilemedi.');
  res.json({ ok: true, status: r.status });
}));

// Meta'dan şablon durumlarını senkronla (manuel tetik)
router.post('/templates/sync', asyncHandler(async (req: Request, res: Response) => {
  await syncTemplateStatuses(req.tenantId!);
  const templates = await prisma.whatsappTemplate.findMany({ where: { tenantId: req.tenantId! }, orderBy: { updatedAt: 'desc' } });
  res.json({ ok: true, templates });
}));

// Varsayılan sistem şablonlarını oluştur + Meta onayına gönder (sipariş güncelleme + ödeme talebi)
router.post('/templates/seed-defaults', asyncHandler(async (req: Request, res: Response) => {
  const defaults = [
    {
      name: 'siparis_guncelleme', category: 'UTILITY', language: 'tr',
      bodyText: 'Merhaba {{1}}, siparişiniz güncellendi. Satış Kodu: {{2}}, Varyasyon: {{3}}, Tutar: {{4}} TL, Durum: {{5}}. Sepet linkiniz: {{6}} - Teşekkür ederiz.',
      footerText: null,
      sampleJson: ['Ayşe', 'ABC123', 'M / Kırmızı', '1.250,00', 'Siparişiniz onaylandı', 'https://magaza.com/sepet/abc123'],
    },
    {
      name: 'odeme_talebi', category: 'UTILITY', language: 'tr',
      bodyText: 'Merhaba {{1}}, {{2}} numaralı siparişiniz için ödeme bağlantınız: {{3}}. Tutar: {{4}} TL.',
      footerText: null,
      sampleJson: ['Ayşe', '2026-001', 'https://example.com/sepet/abc', '1.250,00'],
    },
  ];
  const results: any[] = [];
  for (const d of defaults) {
    let tpl = await prisma.whatsappTemplate.findFirst({ where: { tenantId: req.tenantId!, name: d.name } });
    if (!tpl) {
      tpl = await prisma.whatsappTemplate.create({
        data: {
          tenantId: req.tenantId!, name: d.name, language: d.language, category: d.category,
          headerType: null, headerText: null, bodyText: d.bodyText, footerText: d.footerText,
          sampleJson: d.sampleJson, status: 'draft',
        },
      });
    } else if (tpl.status !== 'pending' && tpl.status !== 'approved') {
      tpl = await prisma.whatsappTemplate.update({ where: { id: tpl.id }, data: { bodyText: d.bodyText, sampleJson: d.sampleJson, category: d.category } });
    }
    let submit: any = { skipped: true };
    if (tpl.status !== 'approved' && tpl.status !== 'pending') {
      submit = await submitTemplate(req.tenantId!, tpl.id);
    }
    results.push({ name: d.name, status: tpl.status, submit });
  }
  const templates = await prisma.whatsappTemplate.findMany({ where: { tenantId: req.tenantId! }, orderBy: { updatedAt: 'desc' } });
  res.json({ ok: true, results, templates });
}));

// ─── Toplu mesaj ─────────────────────────────────────────────────────────────────

router.get('/bulk', asyncHandler(async (req: Request, res: Response) => {
  const jobs = await prisma.whatsappBulkJob.findMany({ where: { tenantId: req.tenantId! }, orderBy: { createdAt: 'desc' }, take: 50 });
  res.json({ jobs });
}));

router.get('/bulk/:id', asyncHandler(async (req: Request, res: Response) => {
  const job = await prisma.whatsappBulkJob.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!job) throw new ApiError(404, 'Kampanya bulunamadı.');
  res.json({ job });
}));

router.post('/bulk', asyncHandler(async (req: Request, res: Response) => {
  const b = req.body || {};
  const tpl = await prisma.whatsappTemplate.findFirst({ where: { id: String(b.templateId || ''), tenantId: req.tenantId! } });
  if (!tpl) throw new ApiError(404, 'Şablon bulunamadı.');
  if (tpl.status !== 'approved') throw new ApiError(409, 'Yalnızca onaylı şablonla toplu gönderim yapılabilir.');
  const job = await prisma.whatsappBulkJob.create({
    data: { tenantId: req.tenantId!, templateId: tpl.id, filterJson: b.filter || {}, status: 'queued', createdBy: (req as any).userId || null },
  });
  // Alıcıları arka planda kuyruğa al
  void enqueueBulk(req.tenantId!, job.id);
  res.json({ ok: true, job });
}));

router.post('/bulk/:id/cancel', asyncHandler(async (req: Request, res: Response) => {
  const job = await prisma.whatsappBulkJob.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!job) throw new ApiError(404, 'Kampanya bulunamadı.');
  await prisma.whatsappBulkJob.update({ where: { id: job.id }, data: { status: 'canceled' } });
  await prisma.whatsappOutbox.updateMany({ where: { bulkJobId: job.id, status: 'pending' }, data: { status: 'skipped' } }).catch(() => {});
  res.json({ ok: true });
}));

// ─── Toplu Mesaj: alıcı sayıları, segment & kapasite ───────────────────────────────
function bulkPhoneOk(t?: string | null): string {
  const p = normPhone(String(t || ''));
  return p && p.length >= 11 ? p : '';
}

async function resolveBulkPhones(tenantId: string, audience: any): Promise<string[]> {
  const type = String(audience?.type || 'all');
  let phones: string[] = [];
  if (type === 'phones' || type === 'manual') {
    const raw = Array.isArray(audience?.phones) ? audience.phones : String(audience?.phones || '').split(/[\s,;]+/);
    phones = raw.map((p: string) => bulkPhoneOk(p)).filter(Boolean);
  } else if (type === 'cart') {
    const o = await prisma.storeOrder.findMany({ where: { tenantId, durum: 'sepet' }, select: { customer: { select: { telefon: true } } } });
    phones = o.map((x) => bulkPhoneOk(x.customer?.telefon)).filter(Boolean);
  } else if (type === 'unpaid') {
    const o = await prisma.storeOrder.findMany({ where: { tenantId, durum: { notIn: ['tamamlandi', 'iptal'] } }, select: { toplam: true, tahsilat: true, customer: { select: { telefon: true } } } });
    phones = o.filter((x) => (x.toplam - x.tahsilat) > 0).map((x) => bulkPhoneOk(x.customer?.telefon)).filter(Boolean);
  } else {
    const c = await prisma.customer.findMany({ where: { tenantId, telefon: { not: null } }, select: { telefon: true } });
    phones = c.map((x) => bulkPhoneOk(x.telefon)).filter(Boolean);
  }
  return Array.from(new Set(phones));
}

router.get('/bulk-audience', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const [allCust, custWithPhone, lines, cartOrders, pendingOrders] = await Promise.all([
    prisma.customer.count({ where: { tenantId } }),
    prisma.customer.count({ where: { tenantId, telefon: { not: null } } }),
    prisma.whatsappLine.findMany({ where: { tenantId, active: true }, select: { gunlukLimit: true } }),
    prisma.storeOrder.findMany({ where: { tenantId, durum: 'sepet' }, select: { toplam: true, tahsilat: true, customer: { select: { telefon: true } } } }),
    prisma.storeOrder.findMany({ where: { tenantId, durum: { notIn: ['tamamlandi', 'iptal'] } }, select: { toplam: true, tahsilat: true, customer: { select: { telefon: true } } } }),
  ]);
  const cart = cartOrders.filter((o) => bulkPhoneOk(o.customer?.telefon));
  const unpaid = pendingOrders.filter((o) => (o.toplam - o.tahsilat) > 0 && bulkPhoneOk(o.customer?.telefon));
  const cartPhones = new Set(cart.map((o) => bulkPhoneOk(o.customer?.telefon)));
  const unpaidPhones = new Set(unpaid.map((o) => bulkPhoneOk(o.customer?.telefon)));
  const cartTutar = cart.reduce((a, o) => a + (o.toplam || 0), 0);
  const unpaidTutar = unpaid.reduce((a, o) => a + ((o.toplam - o.tahsilat) || 0), 0);
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const sentToday = await prisma.whatsappOutbox.count({ where: { tenantId, status: 'sent', sentAt: { gte: dayStart } } }).catch(() => 0);
  const limitToplam = lines.reduce((a, l) => a + (l.gunlukLimit && l.gunlukLimit > 0 ? l.gunlukLimit : 0), 0);
  res.json({
    audience: { tumMusteri: custWithPhone, tumMusteriToplam: allCust, sepetOlan: cartPhones.size, odemesizSepet: unpaidPhones.size },
    segment: { sepetOlan: cartPhones.size, odemesizSepet: unpaidPhones.size, sepetTutar: cartTutar, odemesizTutar: unpaidTutar, toplamTutar: cartTutar + unpaidTutar },
    kapasite: { gunlukLimit: limitToplam, gonderilenBugun: sentToday, kalan: limitToplam > 0 ? Math.max(0, limitToplam - sentToday) : null },
  });
}));

type BulkRecipient = { phone: string; ad: string; tutar: number; ref: string; durum: string };

// Alıcı önizleme listesi: telefonla birlikte müşteri adı / tutar / sipariş bilgisi (UI'da liste göstermek için)
async function resolveBulkRecipients(tenantId: string, audience: any, limit = 1000): Promise<BulkRecipient[]> {
  const type = String(audience?.type || 'all');
  const orderSelect = { orderNo: true, orderYil: true, durum: true, toplam: true, tahsilat: true, musteriHandle: true, createdAt: true, customer: { select: { ad: true, telefon: true } } } as const;
  const siparisNo = (o: any) => (o.orderNo ? `${o.orderYil}-${String(o.orderNo).padStart(3, '0')}` : '—');
  const seen = new Set<string>();
  const out: BulkRecipient[] = [];
  const push = (phone: string, ad: string, tutar: number, ref: string, durum: string) => {
    if (!phone || seen.has(phone)) return;
    seen.add(phone);
    out.push({ phone, ad: ad || 'Müşteri', tutar, ref, durum });
  };

  if (type === 'phones' || type === 'manual') {
    const raw = Array.isArray(audience?.phones) ? audience.phones : String(audience?.phones || '').split(/[\s,;]+/);
    for (const p of raw) push(bulkPhoneOk(p), 'Manuel numara', 0, '', '');
  } else if (type === 'cart') {
    const o = await prisma.storeOrder.findMany({ where: { tenantId, durum: 'sepet' }, orderBy: { createdAt: 'desc' }, select: orderSelect });
    for (const x of o) push(bulkPhoneOk(x.customer?.telefon), x.customer?.ad || x.musteriHandle || '', x.toplam || 0, siparisNo(x), 'Sepet');
  } else if (type === 'unpaid') {
    const o = await prisma.storeOrder.findMany({ where: { tenantId, durum: { notIn: ['tamamlandi', 'iptal'] } }, orderBy: { createdAt: 'desc' }, select: orderSelect });
    for (const x of o.filter((y) => (y.toplam - y.tahsilat) > 0)) push(bulkPhoneOk(x.customer?.telefon), x.customer?.ad || x.musteriHandle || '', (x.toplam - x.tahsilat) || 0, siparisNo(x), x.durum || 'Ödemesiz');
  } else {
    const c = await prisma.customer.findMany({ where: { tenantId, telefon: { not: null } }, orderBy: { createdAt: 'desc' }, select: { ad: true, telefon: true } });
    for (const x of c) push(bulkPhoneOk(x.telefon), x.ad || '', 0, '', '');
  }
  return out.slice(0, limit);
}

router.post('/bulk-audience/preview', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const withList = req.body?.detail === true || req.body?.list === true;
  if (withList) {
    const recipients = await resolveBulkRecipients(tenantId, req.body?.audience);
    return res.json({ count: recipients.length, recipients });
  }
  const phones = await resolveBulkPhones(tenantId, req.body?.audience);
  res.json({ count: phones.length });
}));

router.post('/bulk-send', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const b = req.body || {};
  const channel = b.channel === 'sms' ? 'sms' : 'api';
  const phones = await resolveBulkPhones(tenantId, b.audience);
  if (!phones.length) throw new ApiError(400, 'Geçerli alıcı bulunamadı. Lütfen alıcı seçimini kontrol edin.');

  if (channel === 'sms') {
    const msg = String(b.body || '').trim();
    if (!msg) throw new ApiError(422, 'SMS metni boş olamaz.');
    let sent = 0; let failed = 0;
    try {
      const r: any = await sendSms(tenantId, phones, msg);
      if (r && r.ok === false) { failed = phones.length; } else { sent = phones.length; }
    } catch {
      failed = phones.length;
    }
    return res.json({ ok: failed === 0, channel, total: phones.length, sent, failed });
  }

  const tpl = await prisma.whatsappTemplate.findFirst({ where: { id: String(b.templateId || ''), tenantId } });
  if (!tpl) throw new ApiError(404, 'WhatsApp toplu gönderimi için bir şablon seçin.');
  if (tpl.status !== 'approved') throw new ApiError(409, 'Yalnızca onaylı şablonla WhatsApp toplu gönderimi yapılabilir.');
  const filter: any = {
    phones,
    vars: Array.isArray(b.vars) ? b.vars : [],
    tags: Array.isArray(b.tags) ? b.tags : [],
    note: String(b.note || ''),
    channel: 'api',
    audienceType: String(b.audience?.type || 'all'),
  };
  const job = await prisma.whatsappBulkJob.create({ data: { tenantId, templateId: tpl.id, filterJson: filter, status: 'queued', createdBy: (req as any).userId || null } });
  void enqueueBulk(tenantId, job.id);
  res.json({ ok: true, channel, total: phones.length, job });
}));

// ─── Ödeme isteme ─────────────────────────────────────────────────────────────────

router.post('/payment', asyncHandler(async (req: Request, res: Response) => {
  const b = req.body || {};
  const r = await enqueuePaymentRequest(req.tenantId!, { orderId: b.orderId, phone: b.phone, ad: b.ad, link: b.link });
  if (!r.ok) throw new ApiError(400, r.reason || 'Ödeme isteği gönderilemedi.');
  res.json({ ok: true });
}));

router.post('/conversations/:id/payment', asyncHandler(async (req: Request, res: Response) => {
  const convo = await prisma.whatsappConversation.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!convo) throw new ApiError(404, 'Konuşma bulunamadı.');
  const r = await enqueuePaymentRequest(req.tenantId!, { orderId: req.body?.orderId, phone: convo.customerPhone, ad: convo.customerName, link: req.body?.link });
  if (!r.ok) throw new ApiError(400, r.reason || 'Ödeme isteği gönderilemedi.');
  res.json({ ok: true });
}));

// Ödeme bekleyen TÜM sepetlere toplu ödeme talebi (pencere açıksa normal metin, kapalıysa şablon — planSend karar verir)
router.post('/payment/bulk-pending', asyncHandler(async (req: Request, res: Response) => {
  const orders = await prisma.storeOrder.findMany({
    where: { tenantId: req.tenantId!, durum: { notIn: ['tamamlandi', 'iptal'] } },
    select: { id: true, toplam: true, tahsilat: true },
    orderBy: { createdAt: 'desc' }, take: 1000,
  });
  const pending = orders.filter((o) => (Number(o.toplam || 0) - Number(o.tahsilat || 0)) > 0.01);
  let sent = 0; let skipped = 0;
  const fails: string[] = [];
  for (const o of pending) {
    const r = await enqueuePaymentRequest(req.tenantId!, { orderId: o.id }).catch(() => ({ ok: false, reason: 'hata' } as any));
    if (r && r.ok) sent++; else { skipped++; if (r?.reason) fails.push(r.reason); }
  }
  res.json({ ok: true, total: pending.length, sent, skipped, reasons: Array.from(new Set(fails)).slice(0, 5) });
}));

// Okunmamış mesaj toplamı (sidebar canlı badge için)
router.get('/unread-count', asyncHandler(async (req: Request, res: Response) => {
  const agg = await prisma.whatsappConversation.aggregate({ where: { tenantId: req.tenantId!, unread: { gt: 0 } }, _sum: { unread: true }, _count: true }).catch(() => null as any);
  res.json({ total: (agg?._sum?.unread) || 0, conversations: (agg?._count) || 0 });
}));

// ─── Gelen kutusu ───────────────────────────────────────────────────────────────

// Konuşma listesi (birleşik gelen kutusu; hat etiketiyle)
router.get('/conversations', asyncHandler(async (req: Request, res: Response) => {
  const q = String(req.query.q || '').trim();
  const statusFilter = String(req.query.status || '').trim(); // open | closed | ''
  const inboxFilter = String(req.query.inbox || '').trim(); // unanswered | ''
  const lineFilter = String(req.query.lineId || '').trim();
  const tagFilter = String(req.query.tag || '').trim();
  const paymentFilter = String(req.query.payment || '').trim(); // pending = ödeme bekleniyor
  const notesFilter = String(req.query.notes || '').trim(); // yes = notu olan sohbetler
  const where: any = { tenantId: req.tenantId! };
  if (statusFilter === 'open') where.closed = false;
  else if (statusFilter === 'closed') where.closed = true;
  if (inboxFilter === 'unanswered') where.lastDirection = 'in'; // cevapsız: son mesaj müşteriden
  if (lineFilter) where.lineId = lineFilter;
  if (tagFilter) where.tags = { has: tagFilter };
  if (notesFilter === 'yes') where.note = { not: null };

  // Ödeme bekleniyor filtresi: NET kalan bakiyesi olan müşterilerin conversationlarını bul
  // (bir sepet fazla ödenmişse diğerinin borcunu netler; net kalan <= 0 ise ödeme bekliyor sayılmaz)
  let paymentConvoIds: string[] | null = null;
  if (paymentFilter === 'pending') {
    where.closed = false;
    const openOrders = await prisma.storeOrder.findMany({
      where: { tenantId: req.tenantId!, durum: { notIn: ['tamamlandi', 'iptal'] } },
      select: { customerId: true, toplam: true, tahsilat: true, customer: { select: { telefon: true } } },
    });
    const normTel = (t?: string | null) => { const d = (t || '').replace(/\D/g, ''); return d.length >= 10 ? (d.startsWith('90') ? d : `90${d.slice(-10)}`) : ''; };
    // Müşteri (id ve telefon) bazında NET kalan topla
    const netById: Record<string, number> = {};
    const netByTel: Record<string, number> = {};
    for (const o of openOrders) {
      const kalan = Number(o.toplam || 0) - Number(o.tahsilat || 0);
      if (o.customerId) netById[o.customerId] = (netById[o.customerId] || 0) + kalan;
      const tel = normTel(o.customer?.telefon);
      if (tel) netByTel[tel] = (netByTel[tel] || 0) + kalan;
    }
    const customerIds = Object.entries(netById).filter(([, n]) => n > 0.01).map(([id]) => id);
    const phones = Object.entries(netByTel).filter(([, n]) => n > 0.01).map(([tel]) => tel);
    const convoWhere: any[] = [];
    if (customerIds.length) convoWhere.push({ customerId: { in: customerIds } });
    if (phones.length) convoWhere.push({ customerPhone: { in: phones } });
    if (convoWhere.length) {
      const matchConvos = await prisma.whatsappConversation.findMany({
        where: { tenantId: req.tenantId!, OR: convoWhere },
        select: { id: true },
      });
      paymentConvoIds = matchConvos.map((c) => c.id);
    } else {
      paymentConvoIds = [];
    }
    if (paymentConvoIds.length) where.id = { in: paymentConvoIds };
    else { res.json({ conversations: [] }); return; }
  }
  const matchMap = new Map<string, string>();
  if (q) {
    const digits = q.replace(/\D/g, '');
    // İsim + numara + mesaj metni araması
    const msgHits = await prisma.whatsappMessage.findMany({
      where: { tenantId: req.tenantId!, body: { contains: q, mode: 'insensitive' } },
      select: { conversationId: true, body: true }, take: 300, orderBy: { createdAt: 'desc' },
    }).catch(() => [] as any[]);
    const convoIds = Array.from(new Set(msgHits.map((m) => m.conversationId).filter(Boolean)));
    // Her konuşma için eşleşen mesaj metnini sakla (önizlemede aranan kelime görünsün)
    for (const m of msgHits) { if (m.conversationId && !matchMap.has(m.conversationId) && m.body) matchMap.set(m.conversationId, m.body); }
    where.OR = [
      { customerName: { contains: q, mode: 'insensitive' } },
      ...(digits ? [{ customerPhone: { contains: digits } }] : []),
      ...(convoIds.length ? [{ id: { in: convoIds } }] : []),
    ];
  }
  // En yeni 200 konuşma + TÜM okunmamışlar: okunmamış bir sohbetin son mesajı en yeni 200 dışında kalsa bile üstte görünür.
  const [recentConvos, unreadConvos] = await Promise.all([
    prisma.whatsappConversation.findMany({ where, orderBy: { lastMessageAt: 'desc' }, take: 200 }),
    prisma.whatsappConversation.findMany({ where: { ...where, unread: { gt: 0 } }, orderBy: { lastMessageAt: 'asc' }, take: 1000 }),
  ]);
  const seenConvo = new Set<string>();
  const convos = [...unreadConvos, ...recentConvos].filter((c) => (seenConvo.has(c.id) ? false : (seenConvo.add(c.id), true)));
  const lines = await prisma.whatsappLine.findMany({ where: { tenantId: req.tenantId! }, select: { id: true, label: true, channel: true } });
  const lmap = new Map(lines.map((l) => [l.id, l]));
  // Müşteri adını + kaydı var mı bilgisini Customer tablosundan tamamla
  const phones = Array.from(new Set(convos.map((c) => c.customerPhone.slice(-10)).filter(Boolean)));
  const nameMap = new Map<string, string>();
  const existSet = new Set<string>();
  if (phones.length) {
    const custs = await prisma.customer.findMany({
      where: { tenantId: req.tenantId!, OR: phones.map((p) => ({ telefon: { contains: p } })) },
      select: { ad: true, instagram: true, telefon: true },
    }).catch(() => []);
    // Görünen ad olarak Instagram kullanıcı adını tercih et; yoksa ad
    for (const cu of custs) { const key = String(cu.telefon || '').replace(/\D/g, '').slice(-10); if (key) { nameMap.set(key, (cu as any).instagram || cu.ad); existSet.add(key); } }
  }
  const now = Date.now();
  const out = convos.map((c) => {
    const ln = lmap.get(c.lineId);
    const key = c.customerPhone.slice(-10);
    return {
      id: c.id, customerPhone: c.customerPhone, customerName: nameMap.get(key) || c.customerName || null, customerId: c.customerId,
      customerExists: !!c.customerId || existSet.has(key),
      lineId: c.lineId, lineLabel: ln?.label || '—', channel: (ln as any)?.channel || 'qr',
      lastMessageAt: c.lastMessageAt, lastPreview: c.lastPreview, lastDirection: c.lastDirection, unread: c.unread,
      matchPreview: matchMap.get(c.id) || null,
      closed: c.closed, tags: c.tags || [], note: c.note || null, windowOpen: !!(c.windowExpiresAt && new Date(c.windowExpiresAt).getTime() > now),
    };
  });
  // Okunmamışlar her zaman en üstte ve en uzun bekleyen (en eski) önce; gerisi en yeni önce
  out.sort((a, b) => {
    const au = a.unread > 0, bu = b.unread > 0;
    if (au !== bu) return au ? -1 : 1;
    const ta = new Date(a.lastMessageAt as any).getTime(), tb = new Date(b.lastMessageAt as any).getTime();
    return au ? ta - tb : tb - ta;
  });
  res.json({ conversations: out });
}));

// Konuşma mesaj geçmişi
router.get('/conversations/:id/messages', asyncHandler(async (req: Request, res: Response) => {
  const convo = await prisma.whatsappConversation.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!convo) throw new ApiError(404, 'Konuşma bulunamadı.');
  // Sohbet gövdesinde EN YENİ mesajlar görünmeli: son 500'ü al (desc), gösterim için artan sıraya çevir.
  // (orderBy asc + take:500 çok mesajlı sohbette en yeni mesajları KIRPIYORDU → gövdede son mesaj görünmüyordu.)
  const recent = await prisma.whatsappMessage.findMany({ where: { conversationId: convo.id }, orderBy: { createdAt: 'desc' }, take: 500 });
  const messages = recent.reverse();
  const line = await prisma.whatsappLine.findUnique({ where: { id: convo.lineId }, select: { label: true, phone: true, channel: true } }).catch(() => null);
  const windowOpen = !!(convo.windowExpiresAt && new Date(convo.windowExpiresAt).getTime() > Date.now());
  const key = convo.customerPhone.replace(/\D/g, '').slice(-10);
  let customerExists = !!convo.customerId;
  let igName: string | null = null;
  if (key) {
    const c = await prisma.customer.findFirst({ where: { tenantId: req.tenantId!, telefon: { contains: key } }, select: { id: true, instagram: true, ad: true } }).catch(() => null);
    if (c) { customerExists = true; igName = (c as any).instagram || c.ad || null; }
  }
  const displayName = igName || convo.customerName || null;
  res.json({ conversation: { ...convo, customerName: displayName, lineLabel: line?.label || '—', linePhone: line?.phone || null, channel: (line as any)?.channel || 'qr', windowOpen, customerExists }, messages });
}));

// AI cevap önerisi: gelen son müşteri mesajına göre öneri üretir (göndermez)
router.post('/conversations/:id/suggest', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const convo = await prisma.whatsappConversation.findFirst({ where: { id: req.params.id, tenantId } });
  if (!convo) throw new ApiError(404, 'Konuşma bulunamadı.');
  const msgs = await prisma.whatsappMessage.findMany({ where: { conversationId: convo.id }, orderBy: { createdAt: 'asc' }, take: 30 });
  // Son müşteri (gelen) mesajını bul
  let lastInIdx = -1;
  for (let i = msgs.length - 1; i >= 0; i--) { if (msgs[i].direction === 'in' && (msgs[i].body || '').trim()) { lastInIdx = i; break; } }
  if (lastInIdx < 0) throw new ApiError(422, 'Yanıtlanacak bir müşteri mesajı bulunamadı.');
  const history = msgs.slice(0, lastInIdx)
    .map((m) => ({ role: m.direction === 'in' ? 'user' : 'agent', content: (m.body || '').trim() }))
    .filter((h) => h.content);
  const text = (msgs[lastInIdx].body || '').trim();
  const reply = await llmReply(tenantId, text, history);
  if (!reply) {
    const ok = await llmAvailable(tenantId);
    return res.json({ suggestion: null, reason: ok ? 'Öneri üretilemedi, tekrar deneyin.' : 'AI önerisi için OpenAI entegrasyonu yapılandırılmamış.' });
  }
  const clean = reply.replace(/\[TICKET\]/gi, '').trim();
  res.json({ suggestion: clean });
}));

// Mesaja emoji tepki ver / kaldır (emoji boş → kaldır)
router.post('/messages/:id/react', asyncHandler(async (req: Request, res: Response) => {
  const emoji = String(req.body?.emoji ?? '').trim();
  const msg = await prisma.whatsappMessage.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!msg) throw new ApiError(404, 'Mesaj bulunamadı.');
  if (!msg.waMessageId) throw new ApiError(422, 'Bu mesaja tepki verilemiyor.');
  const line = await prisma.whatsappLine.findUnique({ where: { id: msg.lineId } });
  if (!line) throw new ApiError(404, 'Hat bulunamadı.');
  const targetFromMe = msg.direction === 'out';
  try {
    if ((line as any).channel === 'api') {
      await apiSendReaction(line as any, msg.customerPhone, msg.waMessageId, emoji);
    } else {
      await sendReaction(line.id, msg.customerPhone, msg.waMessageId, emoji, targetFromMe);
    }
  } catch (e: any) {
    throw new ApiError(422, e?.message || 'Tepki gönderilemedi. (24 saatlik pencere kapalı olabilir)');
  }
  await prisma.whatsappMessage.update({ where: { id: msg.id }, data: { reaction: emoji || null } });
  res.json({ ok: true, reaction: emoji || null });
}));

// Mesajı sil — QR hattında herkesten siler; resmi API'de yalnızca panelden gizler
router.delete('/messages/:id', asyncHandler(async (req: Request, res: Response) => {
  const msg = await prisma.whatsappMessage.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!msg) throw new ApiError(404, 'Mesaj bulunamadı.');
  if (msg.direction !== 'out') throw new ApiError(422, 'Yalnızca gönderdiğiniz mesajlar silinebilir.');
  const line = await prisma.whatsappLine.findUnique({ where: { id: msg.lineId } });
  let everyone = false;
  if (line && (line as any).channel !== 'api' && msg.waMessageId) {
    try { await deleteForEveryone(line.id, msg.customerPhone, msg.waMessageId, true); everyone = true; } catch (e) { /* hat bağlı değilse panelde gizlemekle yetin */ }
  }
  await prisma.whatsappMessage.update({ where: { id: msg.id }, data: { deleted: true } });
  res.json({ ok: true, everyone });
}));

// Konuşmadaki müşteriyi kayıt olarak oluştur (kayıt yoksa)
router.post('/conversations/:id/customer', asyncHandler(async (req: Request, res: Response) => {
  const convo = await prisma.whatsappConversation.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!convo) throw new ApiError(404, 'Konuşma bulunamadı.');
  const instagram = String(req.body?.instagram || '').trim().replace(/^@+/, '');
  if (!instagram) throw new ApiError(422, 'Instagram kullanıcı adı zorunlu.');
  const ad = String(req.body?.ad || instagram).trim() || instagram;
  const key = convo.customerPhone.replace(/\D/g, '').slice(-10);
  const ik = instagram.toLowerCase().replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/^@+/, '').trim() || null;
  let cust = convo.customerId ? await prisma.customer.findUnique({ where: { id: convo.customerId } }).catch(() => null) : null;
  if (!cust && key) cust = await prisma.customer.findFirst({ where: { tenantId: req.tenantId!, telKey: key } }).catch(() => null);
  if (!cust && key) cust = await prisma.customer.findFirst({ where: { tenantId: req.tenantId!, telefon: { contains: key } } }).catch(() => null);
  if (!cust && ik) cust = await prisma.customer.findFirst({ where: { tenantId: req.tenantId!, igKey: ik } }).catch(() => null);
  let finalCust;
  if (!cust) {
    finalCust = await prisma.customer.create({ data: { tenantId: req.tenantId!, ad, instagram, igKey: ik, telefon: convo.customerPhone.replace(/\D/g, ''), telKey: key || null } });
  } else if (!cust.instagram) {
    finalCust = await prisma.customer.update({ where: { id: cust.id }, data: { instagram, igKey: (cust as any).igKey || ik } }).catch(() => cust!);
  } else {
    finalCust = cust;
  }
  await prisma.whatsappConversation.update({ where: { id: convo.id }, data: { customerId: finalCust.id, customerName: convo.customerName || finalCust.ad } }).catch(() => {});
  res.json({ ok: true, customer: { id: finalCust.id, ad: finalCust.ad, telefon: finalCust.telefon, instagram: finalCust.instagram } });
}));

// Konuşmaya etiket ata / güncelle (sohbet durumu etiketleri)
router.put('/conversations/:id/tags', asyncHandler(async (req: Request, res: Response) => {
  const convo = await prisma.whatsappConversation.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!convo) throw new ApiError(404, 'Konuşma bulunamadı.');
  const raw: any[] = Array.isArray(req.body?.tags) ? req.body.tags : [];
  const tags: string[] = Array.from(new Set<string>(raw.map((t: any) => String(t || '').trim()).filter((s: string) => !!s))).slice(0, 20);
  const updated = await prisma.whatsappConversation.update({ where: { id: convo.id }, data: { tags } });
  res.json({ ok: true, tags: updated.tags });
}));

// Sohbete tutturulan (pinned) müşteri notunu kaydet / kaldır (boş gönderilirse silinir)
router.put('/conversations/:id/note', asyncHandler(async (req: Request, res: Response) => {
  const convo = await prisma.whatsappConversation.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!convo) throw new ApiError(404, 'Konuşma bulunamadı.');
  const note = String(req.body?.note ?? '').trim().slice(0, 1000);
  const updated = await prisma.whatsappConversation.update({ where: { id: convo.id }, data: { note: note || null } });
  res.json({ ok: true, note: updated.note });
}));

// Tenant genelinde kullanılan tüm etiketler (filtre kutusu için)
router.get('/conversation-tags', asyncHandler(async (req: Request, res: Response) => {
  const rows = await prisma.whatsappConversation.findMany({ where: { tenantId: req.tenantId! }, select: { tags: true }, take: 2000 });
  const set = new Set<string>();
  for (const r of rows) for (const t of (r.tags || [])) set.add(t);
  res.json({ tags: Array.from(set).sort((a, b) => a.localeCompare(b, 'tr')) });
}));

// Konuşmanın müşterisine ait açık sepeti getir (modal için)
router.get('/conversations/:id/cart', asyncHandler(async (req: Request, res: Response) => {
  const convo = await prisma.whatsappConversation.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!convo) throw new ApiError(404, 'Konuşma bulunamadı.');
  const digits = convo.customerPhone.replace(/\D/g, '').slice(-10);
  const where: any = { tenantId: req.tenantId!, durum: { notIn: ['tamamlandi', 'iptal'] } };
  const ors: any[] = [];
  // Telefondan müşteriyi çöz → instagram/handle ile de eşleştir (handle ile açılmış sepetler bulunabilsin)
  let custId = convo.customerId || '';
  let igHandle = '';
  if (digits) {
    const cu = await prisma.customer.findFirst({ where: { tenantId: req.tenantId!, telefon: { contains: digits } }, select: { id: true, instagram: true } }).catch(() => null);
    if (cu) { custId = custId || cu.id; igHandle = String((cu as any).instagram || '').replace(/^@+/, '').trim(); }
  }
  if (custId) ors.push({ customerId: custId });
  if (digits) ors.push({ customer: { telefon: { contains: digits } } });
  if (igHandle && igHandle.length >= 2) {
    ors.push({ musteriHandle: { equals: igHandle, mode: 'insensitive' } });
    ors.push({ customer: { instagram: { equals: igHandle, mode: 'insensitive' } } });
  }
  const convoHandle = String(convo.customerName || '').replace(/^@+/, '').trim();
  if (convoHandle && convoHandle.length >= 2) ors.push({ musteriHandle: { equals: convoHandle, mode: 'insensitive' } });
  if (ors.length) where.OR = ors;
  const adaylar = await prisma.storeOrder.findMany({
    where, orderBy: { createdAt: 'desc' }, take: 15,
    include: { customer: { select: { ad: true, telefon: true } } },
  }).catch(() => [] as any[]);
  // Bu konuşmanın kullanıcı adına birebir uyan sepeti tercih et (farklı kullanıcı adları aynı sepeti paylaşmasın)
  const hset = new Set([igHandle, convoHandle].filter((x) => x && x.length >= 2).map((x) => x.toLowerCase()));
  const norm = (s: any) => String(s || '').replace(/^@+/, '').trim().toLowerCase();
  let cart: any = null;
  if (hset.size) cart = adaylar.find((c: any) => hset.has(norm(c.musteriHandle))) || null;
  // Kullanıcı adına uyan yoksa: telefonu birebir eşleşen sepeti dene
  if (!cart && digits) cart = adaylar.find((c: any) => String(c.customer?.telefon || '').replace(/\D/g, '').slice(-10) === digits) || null;
  // Hâlâ yoksa ve kullanıcı adı biliniyorsa, yanlış hesabın sepetini göstermemek için boş dön
  if (!cart && hset.size === 0) cart = adaylar[0] || null;
  if (!cart) return res.json({ cart: null });
  res.json({
    cart: {
      id: cart.id,
      no: cart.orderNo ? `${cart.orderYil}-${String(cart.orderNo).padStart(3, '0')}` : ('#' + String(cart.id).slice(-5)),
      durum: cart.durum, kanal: cart.kanal,
      musteri: cart.customer?.ad || cart.musteriHandle || convo.customerName || '',
      items: Array.isArray(cart.items) ? cart.items : [],
      araToplam: cart.araToplam, indirim: cart.indirim, kargoUcreti: cart.kargoUcreti,
      toplam: cart.toplam, tahsilat: cart.tahsilat,
      token: (cart as any).token || null,
      link: (cart as any).token ? `${(env.APP_DOMAIN || '').replace(/\/$/, '')}/sepet/${(cart as any).token}` : null,
    },
  });
}));

// Konuşmayı okundu işaretle
router.post('/conversations/:id/read', asyncHandler(async (req: Request, res: Response) => {
  const convo = await prisma.whatsappConversation.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!convo) throw new ApiError(404, 'Konuşma bulunamadı.');
  await prisma.whatsappConversation.update({ where: { id: convo.id }, data: { unread: 0 } });
  res.json({ ok: true });
}));
router.post('/conversations/:id/close', asyncHandler(async (req: Request, res: Response) => {
  const convo = await prisma.whatsappConversation.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!convo) throw new ApiError(404, 'Konuşma bulunamadı.');
  await prisma.whatsappConversation.update({ where: { id: convo.id }, data: { closed: true, closedAt: new Date() } });
  res.json({ ok: true });
}));

router.post('/conversations/:id/reopen', asyncHandler(async (req: Request, res: Response) => {
  const convo = await prisma.whatsappConversation.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!convo) throw new ApiError(404, 'Konuşma bulunamadı.');
  await prisma.whatsappConversation.update({ where: { id: convo.id }, data: { closed: false, closedAt: null } });
  res.json({ ok: true });
}));

// Manuel cevap gönder → konuşmanın sticky hattından, throttle'a tabi kuyruğa (metin ve/veya medya)
router.post('/conversations/:id/send', asyncHandler(async (req: Request, res: Response) => {
  const convo = await prisma.whatsappConversation.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!convo) throw new ApiError(404, 'Konuşma bulunamadı.');
  const body = String(req.body?.body || '').trim();
  const templateId = req.body?.templateId ? String(req.body.templateId) : null;
  const templateVars = Array.isArray(req.body?.templateVars) ? req.body.templateVars.map((v: any) => String(v ?? '')) : undefined;
  let media: any = null;
  if (req.body?.mediaDataUrl) media = saveDataUrl(String(req.body.mediaDataUrl), req.body?.fileName);
  else if (req.body?.mediaUrl) media = { url: String(req.body.mediaUrl), mediaType: req.body?.mediaType || 'document', fileName: req.body?.fileName };
  if (!body && !media && !templateId) throw new ApiError(422, 'Mesaj boş olamaz.');
  // Kanal: varsayılan API. Kullanıcı panelden açıkça 'qr' seçtiyse QR/Baileys'ten gider.
  const channel = String(req.body?.channel || '').toLowerCase() === 'qr' ? 'qr' : 'api';
  // Alıntılı (yanıt) gönderim: panel mesaj id'sini WhatsApp mesaj id'sine çöz
  const replyToId = req.body?.replyToId ? String(req.body.replyToId) : null;
  let replyToWaId: string | null = null; let replyToText: string | null = null;
  if (replyToId) {
    const orig = await prisma.whatsappMessage.findFirst({ where: { id: replyToId, tenantId: req.tenantId!, conversationId: convo.id }, select: { waMessageId: true, body: true } }).catch(() => null);
    if (orig?.waMessageId) { replyToWaId = orig.waMessageId; replyToText = (orig.body || '').slice(0, 120); }
  }
  // lineId'i hatta sabitleme; worker doğru kanaldan (API varsayılan / QR seçildiyse QR) seçer.
  const senderName = await actorName((req as any).auth?.userId || (req as any).userId);
  await prisma.whatsappOutbox.create({
    data: { tenantId: req.tenantId!, lineId: null, channel, customerPhone: convo.customerPhone, body, kind: templateId ? 'template' : 'manual', templateId, templateVars: templateVars as any, mediaType: media?.mediaType || null, mediaUrl: media?.url || null, fileName: media?.fileName || null, replyToWaId, replyToText, sentByName: senderName },
  });
  if (convo.closed) await prisma.whatsappConversation.update({ where: { id: convo.id }, data: { closed: false, closedAt: null } }).catch(() => {});
  processOutbox().catch(() => {}); // anında gönderim (API hattı için bekletme)
  res.json({ ok: true });
}));

// Numaraya yeni mesaj başlat (manuel) → outbox (lineId boş → dengeli/sticky worker seçer)
router.post('/send', asyncHandler(async (req: Request, res: Response) => {
  const phone = normPhone(String(req.body?.phone || ''));
  const body = String(req.body?.body || '').trim();
  const templateId = req.body?.templateId ? String(req.body.templateId) : null;
  const templateVars = Array.isArray(req.body?.templateVars) ? req.body.templateVars.map((v: any) => String(v ?? '')) : undefined;
  if (!phone || phone.length < 11) throw new ApiError(422, 'Geçerli telefon gerekli.');
  if (!body && !templateId) throw new ApiError(422, 'Mesaj boş olamaz.');
  const convo = await prisma.whatsappConversation.findUnique({ where: { tenantId_customerPhone: { tenantId: req.tenantId!, customerPhone: phone } } }).catch(() => null);
  // Kanal: varsayılan API. Açıkça 'qr' seçildiyse QR. lineId boş → worker doğru kanaldan seçer.
  const channel = String(req.body?.channel || '').toLowerCase() === 'qr' ? 'qr' : 'api';
  const replyToId = req.body?.replyToId ? String(req.body.replyToId) : null;
  let replyToWaId: string | null = null; let replyToText: string | null = null;
  if (replyToId) {
    const orig = await prisma.whatsappMessage.findFirst({ where: { id: replyToId, tenantId: req.tenantId!, customerPhone: phone }, select: { waMessageId: true, body: true } }).catch(() => null);
    if (orig?.waMessageId) { replyToWaId = orig.waMessageId; replyToText = (orig.body || '').slice(0, 120); }
  }
  await prisma.whatsappOutbox.create({ data: { tenantId: req.tenantId!, lineId: null, channel, customerPhone: phone, body, kind: templateId ? 'template' : 'manual', templateId, templateVars: templateVars as any, replyToWaId, replyToText } });
  processOutbox().catch(() => {});
  res.json({ ok: true });
}));

// ─── Mesaj kuyruğu (outbox) yönetimi ─────────────────────────────────────────
// Bekleyen (iletilmemiş) mesajları listele + kind bazında özet
router.get('/queue', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const kind = String(req.query.kind || '').trim();
  const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(String(req.query.pageSize || '50'), 10) || 50));
  const where: any = { tenantId, status: 'pending' };
  if (kind) where.kind = kind;
  const [rows, total, summary] = await Promise.all([
    prisma.whatsappOutbox.findMany({
      where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize,
      select: { id: true, customerPhone: true, body: true, kind: true, channel: true, templateId: true, scheduledAt: true, createdAt: true, error: true, bulkJobId: true },
    }),
    prisma.whatsappOutbox.count({ where }),
    prisma.whatsappOutbox.groupBy({ by: ['kind'], where: { tenantId, status: 'pending' }, _count: { _all: true } }),
  ]);
  const byKind: Record<string, number> = {};
  let totalAll = 0;
  for (const s of summary) { byKind[s.kind] = s._count._all; totalAll += s._count._all; }
  res.json({ rows, total, totalAll, page, pageSize, byKind });
}));

// Bekleyen mesajları iptal et: { ids?: string[], all?: boolean, kind?: string }
router.post('/queue/cancel', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids.map((x: any) => String(x)) : [];
  const all = req.body?.all === true;
  const kind = String(req.body?.kind || '').trim();
  if (!all && ids.length === 0) throw new ApiError(422, 'İptal edilecek mesaj seçilmedi.');
  const where: any = { tenantId, status: 'pending' };
  if (!all) where.id = { in: ids };
  if (kind) where.kind = kind;
  const r = await prisma.whatsappOutbox.updateMany({ where, data: { status: 'skipped', error: 'Kullanıcı tarafından iptal edildi' } });
  res.json({ ok: true, cancelled: r.count });
}));

// ─── Ayarlar ───────────────────────────────────────────────────────────────────

router.get('/settings', asyncHandler(async (req: Request, res: Response) => {
  const st = await ensureSettings(req.tenantId!);
  const safe: any = { ...st };
  if (safe.metaAppSecret) safe.metaAppSecret = maskToken(safe.metaAppSecret);
  res.json({ settings: safe });
}));

router.put('/settings', asyncHandler(async (req: Request, res: Response) => {
  await ensureSettings(req.tenantId!);
  const b = req.body || {};
  const data: any = {};
  if (b.globalAralikSn != null) data.globalAralikSn = Math.max(1, Number(b.globalAralikSn) || 8);
  if (b.jitterSn != null) data.jitterSn = Math.max(0, Number(b.jitterSn) || 0);
  if (b.lineDefaultLimit != null) data.lineDefaultLimit = Math.max(1, Number(b.lineDefaultLimit) || 200);
  if (b.calismaSaatAktif != null) data.calismaSaatAktif = !!b.calismaSaatAktif;
  if (b.calismaBasla != null) data.calismaBasla = String(b.calismaBasla);
  if (b.calismaBitis != null) data.calismaBitis = String(b.calismaBitis);
  if (b.otoYanitAktif != null) data.otoYanitAktif = !!b.otoYanitAktif;
  if (b.otoYanitMetin != null) data.otoYanitMetin = String(b.otoYanitMetin);
  if (b.siparisBildirimAktif != null) data.siparisBildirimAktif = !!b.siparisBildirimAktif;
  if (b.siparisSablon != null) data.siparisSablon = String(b.siparisSablon);
  if (b.iptalAktif != null) data.iptalAktif = !!b.iptalAktif;
  if (b.iptalSablon != null) data.iptalSablon = String(b.iptalSablon);
  if (b.stokAktif != null) data.stokAktif = !!b.stokAktif;
  if (b.stokSablon != null) data.stokSablon = String(b.stokSablon);
  if (b.riskliAktif != null) data.riskliAktif = !!b.riskliAktif;
  if (b.riskliSablon != null) data.riskliSablon = String(b.riskliSablon);
  // Ödeme isteme
  if (b.odemeAktif != null) data.odemeAktif = !!b.odemeAktif;
  if (b.odemeSablon != null) data.odemeSablon = String(b.odemeSablon);
  // Ödeme onaylandı bildirimi
  if (b.odemeOnayAktif != null) data.odemeOnayAktif = !!b.odemeOnayAktif;
  if (b.odemeOnaySablon != null) data.odemeOnaySablon = String(b.odemeOnaySablon);
  // Kargo hazırlık bildirimi
  if (b.hazirlikAktif != null) data.hazirlikAktif = !!b.hazirlikAktif;
  if (b.hazirlikSablon != null) data.hazirlikSablon = String(b.hazirlikSablon);
  // Ödeme yapmayanlara zamanlı toplu hatırlatma
  if (b.odemeHatirlatmaAktif != null) data.odemeHatirlatmaAktif = !!b.odemeHatirlatmaAktif;
  if (b.odemeHatirlatmaSaatleri != null) {
    const arr: any[] = Array.isArray(b.odemeHatirlatmaSaatleri) ? b.odemeHatirlatmaSaatleri : [];
    data.odemeHatirlatmaSaatleri = Array.from(new Set(arr
      .map((x: any) => String(x || '').trim())
      .filter((x: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(x))))
      .slice(0, 12);
  }
  // Cloud API genel ayarları
  if (b.apiFallbackBaileys != null) data.apiFallbackBaileys = !!b.apiFallbackBaileys;
  if (b.metaAppId != null) data.metaAppId = String(b.metaAppId) || null;
  if (b.metaAppSecret != null && !/•/.test(String(b.metaAppSecret))) data.metaAppSecret = String(b.metaAppSecret) || null;
  // AI oto-yanıt
  if (b.aiAutoReplyAktif != null) data.aiAutoReplyAktif = !!b.aiAutoReplyAktif;
  if (b.aiPrompt != null) data.aiPrompt = String(b.aiPrompt) || null;
  if (b.aiSadecePencereIci != null) data.aiSadecePencereIci = !!b.aiSadecePencereIci;
  // Hazır metinler (quick reply): [{ id, baslik, metin, kategori, dil, kisayol, aktif, kullanim, sonKullanim }]
  if (b.hazirCevaplar != null) {
    const arr: any[] = Array.isArray(b.hazirCevaplar) ? b.hazirCevaplar : [];
    data.hazirCevaplar = arr
      .map((x: any) => {
        let ks = String(x?.kisayol || '').trim().toLowerCase().replace(/\s+/g, '').slice(0, 30);
        if (ks && !ks.startsWith('/')) ks = '/' + ks;
        return {
          id: String(x?.id || '').trim() || Math.random().toString(36).slice(2, 10),
          baslik: String(x?.baslik || '').trim().slice(0, 80),
          metin: String(x?.metin || '').trim().slice(0, 2000),
          kategori: String(x?.kategori || 'Genel').trim().slice(0, 40) || 'Genel',
          dil: String(x?.dil || 'tr').trim() === 'en' ? 'en' : 'tr',
          kisayol: ks,
          aktif: x?.aktif !== false,
          kullanim: Math.max(0, Math.round(Number(x?.kullanim) || 0)),
          sonKullanim: x?.sonKullanim ? String(x.sonKullanim).slice(0, 40) : null,
        };
      })
      .filter((x: any) => !!x.metin)
      .slice(0, 300);
  }
  // Hazır metin kategorileri
  if (b.hazirKategoriler != null) {
    const arr: any[] = Array.isArray(b.hazirKategoriler) ? b.hazirKategoriler : [];
    data.hazirKategoriler = Array.from(new Set(arr.map((x: any) => String(x || '').trim().slice(0, 40)).filter(Boolean))).slice(0, 40);
  }
  // Durum → onaylı şablon adı eşlemesi
  if (b.sablonEslesme != null) {
    const src = (b.sablonEslesme && typeof b.sablonEslesme === 'object') ? b.sablonEslesme : {};
    const out: any = {};
    for (const k of ['order', 'status', 'stok', 'iptal', 'riskli', 'payment', 'manual', 'hazirlik', 'odemeonay']) {
      const v = String(src[k] || '').trim();
      if (v) out[k] = v;
    }
    data.sablonEslesme = out;
  }
  // Sohbet kutusuna sabitlenen onaylı şablon id'leri
  if (b.sabitSablonlar != null) {
    const arr: any[] = Array.isArray(b.sabitSablonlar) ? b.sabitSablonlar : [];
    data.sabitSablonlar = Array.from(new Set(arr.map((x: any) => String(x || '').trim()).filter(Boolean))).slice(0, 30);
  }
  // Kullanıcı tanımlı otomasyonlar
  if (b.ozelOtomasyonlar != null) {
    const arr: any[] = Array.isArray(b.ozelOtomasyonlar) ? b.ozelOtomasyonlar : [];
    const trigs = ['order', 'status'];
    data.ozelOtomasyonlar = arr
      .map((x: any) => {
        const mod = x?.mod === 'template' ? 'template' : 'manual';
        const sablonVars = Array.isArray(x?.sablonVars) ? x.sablonVars.map((v: any) => String(v ?? '').slice(0, 400)) : [];
        return {
          id: String(x?.id || '').trim() || Math.random().toString(36).slice(2, 10),
          ad: String(x?.ad || '').trim().slice(0, 80),
          tetikleyici: trigs.includes(String(x?.tetikleyici)) ? String(x.tetikleyici) : 'order',
          gecikmeDk: Math.max(0, Math.min(10080, Math.round(Number(x?.gecikmeDk) || 0))),
          mod,
          sablonId: mod === 'template' ? String(x?.sablonId || '').trim() : '',
          sablonVars: mod === 'template' ? sablonVars : [],
          mesaj: mod === 'manual' ? String(x?.mesaj || '').trim().slice(0, 2000) : '',
          aktif: x?.aktif !== false,
        };
      })
      .filter((x: any) => !!x.ad && (x.mod === 'template' ? !!x.sablonId : !!x.mesaj))
      .slice(0, 30);
  }
  const st = await prisma.whatsappSettings.update({ where: { tenantId: req.tenantId! }, data });
  // Hassas alanları maskele
  const safe: any = { ...st };
  if (safe.metaAppSecret) safe.metaAppSecret = maskToken(safe.metaAppSecret);
  res.json({ ok: true, settings: safe });
}));

// ─── Bildirim Merkezi: WhatsApp + NetGSM SMS tek panel ──────────────────────────
function pickWaNotify(st: any) {
  return {
    siparisBildirimAktif: !!st.siparisBildirimAktif,
    iptalAktif: !!st.iptalAktif,
    stokAktif: !!st.stokAktif,
    riskliAktif: !!st.riskliAktif,
    odemeAktif: !!st.odemeAktif,
    odemeHatirlatmaAktif: !!st.odemeHatirlatmaAktif,
    odemeSablon: st.odemeSablon || '',
    odemeOnayAktif: st.odemeOnayAktif ?? true,
    odemeOnaySablon: st.odemeOnaySablon || '',
    hazirlikAktif: st.hazirlikAktif ?? true,
    hazirlikSablon: st.hazirlikSablon || '',
    sablonEslesme: (st.sablonEslesme && typeof st.sablonEslesme === 'object') ? st.sablonEslesme : {},
  };
}

router.get('/notify-center', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  const st = await ensureSettings(t);
  const sms = await getNetgsmSettings(t);
  const templates = await prisma.whatsappTemplate.findMany({
    where: { tenantId: t, status: 'approved' },
    orderBy: { name: 'asc' },
  });
  res.json({ wa: pickWaNotify(st), sms, templates });
}));

router.put('/notify-center', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  await ensureSettings(t);
  const b = req.body || {};
  const wa = (b.wa && typeof b.wa === 'object') ? b.wa : {};
  const sms = (b.sms && typeof b.sms === 'object') ? b.sms : {};
  // WhatsApp ayarları
  const data: any = {};
  for (const k of ['siparisBildirimAktif', 'iptalAktif', 'stokAktif', 'riskliAktif', 'odemeAktif', 'odemeHatirlatmaAktif', 'odemeOnayAktif', 'hazirlikAktif']) {
    if (wa[k] != null) data[k] = !!wa[k];
  }
  if (wa.odemeSablon != null) data.odemeSablon = String(wa.odemeSablon);
  if (wa.odemeOnaySablon != null) data.odemeOnaySablon = String(wa.odemeOnaySablon);
  if (wa.hazirlikSablon != null) data.hazirlikSablon = String(wa.hazirlikSablon);
  if (wa.sablonEslesme != null) {
    const src = (wa.sablonEslesme && typeof wa.sablonEslesme === 'object') ? wa.sablonEslesme : {};
    const out: any = {};
    for (const k of ['order', 'status', 'stok', 'iptal', 'riskli', 'payment', 'manual', 'hazirlik', 'odemeonay']) {
      const v = String(src[k] || '').trim();
      if (v) out[k] = v;
    }
    data.sablonEslesme = out;
  }
  if (Object.keys(data).length) await prisma.whatsappSettings.update({ where: { tenantId: t }, data });
  // NetGSM SMS tercihleri (kimlik bilgileri korunur)
  const smsPrefs: any = {};
  for (const k of ['notify_new', 'notify_approved', 'notify_shipped', 'notify_cancel', 'notify_lowstock']) {
    if (sms[k] != null) smsPrefs[k] = !!sms[k];
  }
  for (const k of ['tpl_new', 'tpl_approved', 'tpl_shipped', 'tpl_cancel', 'tpl_lowstock']) {
    if (sms[k] != null) smsPrefs[k] = String(sms[k]);
  }
  const smsOut = Object.keys(smsPrefs).length ? await saveNetgsmPrefs(t, smsPrefs) : await getNetgsmSettings(t);
  const st = await ensureSettings(t);
  res.json({ ok: true, wa: pickWaNotify(st), sms: smsOut });
}));

// ─── Hazır metin kullanım sayacı (gerçek istatistik) ────────────────────────────
router.post('/quick-replies/use', asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.body?.id || '').trim();
  if (!id) { res.json({ ok: true }); return; }
  const st = await prisma.whatsappSettings.findUnique({ where: { tenantId: req.tenantId! } });
  const arr: any[] = Array.isArray(st?.hazirCevaplar) ? (st!.hazirCevaplar as any[]) : [];
  let changed = false;
  const out = arr.map((x: any) => {
    if (x?.id === id) { changed = true; return { ...x, kullanim: (Number(x?.kullanim) || 0) + 1, sonKullanim: new Date().toISOString() }; }
    return x;
  });
  if (changed) await prisma.whatsappSettings.update({ where: { tenantId: req.tenantId! }, data: { hazirCevaplar: out } });
  res.json({ ok: true });
}));

// ─── Özet durum ─────────────────────────────────────────────────────────────────

router.get('/status', asyncHandler(async (req: Request, res: Response) => {
  const lines = await prisma.whatsappLine.findMany({ where: { tenantId: req.tenantId! } });
  let acik = 0, sentToday = 0;
  for (const l of lines) {
    if ((l as any).channel === 'api' ? l.apiVerified : isConnected(l.id)) acik++;
    if (l.sentDate === todayStr()) sentToday += l.sentToday;
  }
  const queue = await prisma.whatsappOutbox.count({ where: { tenantId: req.tenantId!, status: 'pending' } });
  const unread = await prisma.whatsappConversation.aggregate({ where: { tenantId: req.tenantId! }, _sum: { unread: true } });
  res.json({ hatSayisi: lines.length, acik, sentToday, queue, unread: unread._sum.unread || 0 });
}));

// Genel Durum panosu — tüm dashboard verisi tek çağrıda
router.get('/dashboard', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const now = new Date();
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const since7 = new Date(now.getTime() - 7 * 24 * 3600 * 1000);

  const lines = await prisma.whatsappLine.findMany({ where: { tenantId } });
  const st = await prisma.whatsappSettings.findUnique({ where: { tenantId } }).catch(() => null as any);
  const defLimit = (st?.lineDefaultLimit && st.lineDefaultLimit > 0) ? st.lineDefaultLimit : 200;

  let acik = 0;
  const lineCards = lines.map((l: any) => {
    const connected = l.channel === 'api' ? !!l.apiVerified : isConnected(l.id);
    if (connected) acik++;
    const limit = l.gunlukLimit && l.gunlukLimit > 0 ? l.gunlukLimit : defLimit;
    return {
      id: l.id, label: l.label, phone: l.phone, channel: l.channel || 'qr', connected,
      sentToday: l.sentDate === todayStr() ? l.sentToday : 0, limit,
      lastConnectedAt: l.lastConnectedAt, lastSentAt: l.lastSentAt,
    };
  });

  const [queue, todaySent, todayFailed, sent7, failed7, recent] = await Promise.all([
    prisma.whatsappOutbox.count({ where: { tenantId, status: 'pending' } }),
    prisma.whatsappMessage.count({ where: { tenantId, direction: 'out', createdAt: { gte: startToday } } }),
    prisma.whatsappMessage.count({ where: { tenantId, direction: 'out', status: 'failed', createdAt: { gte: startToday } } }),
    prisma.whatsappMessage.count({ where: { tenantId, direction: 'out', createdAt: { gte: since7 } } }),
    prisma.whatsappMessage.count({ where: { tenantId, direction: 'out', status: 'failed', createdAt: { gte: since7 } } }),
    prisma.whatsappMessage.findMany({ where: { tenantId, direction: 'out' }, orderBy: { createdAt: 'desc' }, take: 8 }),
  ]);
  const successRate = sent7 > 0 ? Math.round(((sent7 - failed7) / sent7) * 100) : 100;
  const todayOk = Math.max(0, todaySent - todayFailed);

  const orders = await prisma.storeOrder.findMany({
    where: { tenantId, durum: { notIn: ['sepet', 'tamamlandi', 'iptal'] } },
    select: { id: true, toplam: true, tahsilat: true, musteriHandle: true, createdAt: true, customer: { select: { ad: true, instagram: true } } },
    orderBy: { createdAt: 'desc' }, take: 300,
  });
  const pend = orders.filter((o: any) => (Number(o.toplam || 0) - Number(o.tahsilat || 0)) > 0.01);
  const overdue = pend.filter((o: any) => (now.getTime() - new Date(o.createdAt).getTime()) > 24 * 3600 * 1000).length;
  const pendingCarts = pend.slice(0, 6).map((o: any) => ({
    musteri: o.customer?.instagram || o.musteriHandle || o.customer?.ad || 'Misafir',
    tutar: Number(o.toplam || 0) - Number(o.tahsilat || 0),
    bekleyenDk: Math.max(0, Math.round((now.getTime() - new Date(o.createdAt).getTime()) / 60000)),
  }));

  const recentSends = recent.map((m: any) => ({
    alici: m.customerPhone || '—',
    phone: (m.customerPhone || '').replace(/\D/g, ''),
    tur: m.templateName ? 'Şablon Mesajı' : (m.mediaType ? 'Medya' : 'Mesaj'),
    icerik: m.body || (m.mediaType ? '[medya]' : ''),
    durum: m.status || 'sent',
    error: m.error || null,
    saat: m.createdAt,
  }));

  res.json({
    stats: { sentToday: todaySent, pendingCarts: pend.length, overdue, successRate, acik, hatSayisi: lines.length, queue },
    anlik: { gonderilen: todaySent, basarili: todayOk, basarisiz: todayFailed, bekleyen: queue, sonGonderim: recent[0]?.createdAt || null },
    lines: lineCards,
    recentSends,
    pendingCarts,
    automations: {
      odemeHatirlatma: !!st?.odemeHatirlatmaAktif,
      sepetLinki: !!st?.odemeAktif,
      iptalBilgi: !!st?.iptalAktif,
      stok: !!st?.stokAktif,
      siparisBildirim: !!st?.siparisBildirimAktif,
      riskli: !!st?.riskliAktif,
    },
    calisma: { aktif: !!st?.calismaSaatAktif, basla: st?.calismaBasla || '09:00', bitis: st?.calismaBitis || '23:00' },
  });
}));

// ─── Görsel Workflow (otomasyon akışları) ────────────────────────────────────

const WF_TRIGGERS = ['order', 'status', 'payment_received', 'cart_abandon', 'membership', 'login', 'vip'];

function normalizeGraph(g: any): any {
  const nodes = Array.isArray(g?.nodes) ? g.nodes.map((n: any) => ({
    id: String(n?.id || '').trim(),
    type: String(n?.type || ''),
    subtype: String(n?.subtype || ''),
    config: n?.config && typeof n.config === 'object' ? n.config : {},
    x: Number(n?.x) || 0,
    y: Number(n?.y) || 0,
  })).filter((n: any) => n.id && n.type) : [];
  const edges = Array.isArray(g?.edges) ? g.edges.map((e: any) => ({
    id: String(e?.id || `${e?.from}-${e?.to}-${e?.branch || ''}`),
    from: String(e?.from || ''),
    to: String(e?.to || ''),
    branch: e?.branch === 'yes' || e?.branch === 'no' ? e.branch : null,
  })).filter((e: any) => e.from && e.to) : [];
  return { nodes, edges };
}

// Workflow listesi + kart istatistikleri (run agregatları)
router.get('/workflows', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const wfs = await prisma.whatsappWorkflow.findMany({ where: { tenantId }, orderBy: { updatedAt: 'desc' } });
  const since24 = new Date(Date.now() - 24 * 3600 * 1000);
  const out = await Promise.all(wfs.map(async (wf: any) => {
    const [total, done, last24, waiting, active, converted] = await Promise.all([
      prisma.whatsappWorkflowRun.count({ where: { tenantId, workflowId: wf.id } }),
      prisma.whatsappWorkflowRun.count({ where: { tenantId, workflowId: wf.id, status: 'done' } }),
      prisma.whatsappWorkflowRun.count({ where: { tenantId, workflowId: wf.id, createdAt: { gte: since24 } } }),
      prisma.whatsappWorkflowRun.count({ where: { tenantId, workflowId: wf.id, status: 'waiting' } }),
      prisma.whatsappWorkflowRun.count({ where: { tenantId, workflowId: wf.id, status: { in: ['running', 'waiting'] } } }),
      prisma.whatsappWorkflowRun.count({ where: { tenantId, workflowId: wf.id, converted: true } }),
    ]);
    return {
      id: wf.id, ad: wf.ad, triggerKind: wf.triggerKind, triggerFilter: wf.triggerFilter,
      graph: wf.graph, aktif: wf.aktif, updatedAt: wf.updatedAt,
      stats: {
        total, basariOrani: total > 0 ? Math.round((done / total) * 100) : 0,
        son24: last24, donusumOrani: total > 0 ? Math.round((converted / total) * 100) : 0,
        bekleyen: waiting, aktifKullanici: active,
      },
    };
  }));
  res.json({ ok: true, workflows: out });
}));

// Yeni workflow
router.post('/workflows', asyncHandler(async (req: Request, res: Response) => {
  const b = req.body || {};
  const ad = String(b.ad || '').trim();
  if (!ad) throw new ApiError(422, 'Akış adı zorunlu');
  const triggerKind = WF_TRIGGERS.includes(String(b.triggerKind)) ? String(b.triggerKind) : 'order';
  const graph = normalizeGraph(b.graph);
  const wf = await prisma.whatsappWorkflow.create({
    data: {
      tenantId: req.tenantId!, ad, triggerKind,
      triggerFilter: b.triggerFilter && typeof b.triggerFilter === 'object' ? b.triggerFilter : undefined,
      graph, aktif: b.aktif !== false,
    },
  });
  res.json({ ok: true, workflow: wf });
}));

// Workflow güncelle
router.put('/workflows/:id', asyncHandler(async (req: Request, res: Response) => {
  const b = req.body || {};
  const existing = await prisma.whatsappWorkflow.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!existing) throw new ApiError(404, 'Akış bulunamadı');
  const data: any = {};
  if (b.ad != null) data.ad = String(b.ad).trim().slice(0, 120);
  if (b.triggerKind != null && WF_TRIGGERS.includes(String(b.triggerKind))) data.triggerKind = String(b.triggerKind);
  if (b.triggerFilter !== undefined) data.triggerFilter = b.triggerFilter && typeof b.triggerFilter === 'object' ? b.triggerFilter : null;
  if (b.graph != null) data.graph = normalizeGraph(b.graph);
  if (b.aktif != null) data.aktif = !!b.aktif;
  const wf = await prisma.whatsappWorkflow.update({ where: { id: existing.id }, data });
  res.json({ ok: true, workflow: wf });
}));

// Workflow sil (koşan run'ları iptal et)
router.delete('/workflows/:id', asyncHandler(async (req: Request, res: Response) => {
  const existing = await prisma.whatsappWorkflow.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!existing) throw new ApiError(404, 'Akış bulunamadı');
  await cancelRunsForWorkflow(req.tenantId!, existing.id);
  await prisma.whatsappWorkflow.delete({ where: { id: existing.id } });
  res.json({ ok: true });
}));

// Hazır şablondan workflow oluştur
router.post('/workflows/from-template', asyncHandler(async (req: Request, res: Response) => {
  const key = String(req.body?.key || '');
  const tpl = buildTemplateWorkflow(key);
  if (!tpl) throw new ApiError(422, 'Geçersiz şablon');
  const wf = await prisma.whatsappWorkflow.create({
    data: { tenantId: req.tenantId!, ad: tpl.ad, triggerKind: tpl.triggerKind, triggerFilter: tpl.triggerFilter || undefined, graph: tpl.graph, aktif: tpl.aktif },
  });
  res.json({ ok: true, workflow: wf });
}));

// Hazır şablon graph üreticileri. Çalışan adımlar aktif; eksik-olaya bağlı şablonlar aktif:false (taslak).
function buildTemplateWorkflow(key: string): { ad: string; triggerKind: string; triggerFilter?: any; graph: any; aktif: boolean } | null {
  const N = (id: string, type: string, subtype: string, config: any, x: number, y: number) => ({ id, type, subtype, config, x, y });
  const E = (from: string, to: string, branch?: 'yes' | 'no') => ({ id: `${from}-${to}-${branch || ''}`, from, to, branch: branch || null });
  switch (key) {
    case 'siparis_odeme_tamamla':
      return {
        ad: 'Sipariş → Ödeme → Tamamlama', triggerKind: 'order', aktif: true,
        graph: {
          nodes: [
            N('t', 'trigger', 'order', {}, 80, 40),
            N('a1', 'action', 'send_payment_link', { mesaj: 'Merhaba {ad}, {no} numaralı siparişinizin ödemesi için: {link}' }, 80, 160),
            N('d1', 'delay', 'preset', { preset: '20m' }, 80, 280),
            N('c1', 'condition', 'payment_received', {}, 80, 400),
            N('x1', 'action', 'complete_order', {}, 320, 400),
            N('a2', 'action', 'send_message', { mesaj: 'Merhaba {ad}, ödemenizi henüz alamadık. Linki tekrar gönderiyoruz: {link}' }, 80, 520),
            N('d2', 'delay', 'preset', { preset: '30m' }, 80, 640),
            N('c2', 'condition', 'payment_received', {}, 80, 760),
            N('x2', 'action', 'complete_order', {}, 320, 760),
            N('x3', 'action', 'cancel_order', {}, 80, 880),
          ],
          edges: [
            E('t', 'a1'), E('a1', 'd1'), E('d1', 'c1'),
            E('c1', 'x1', 'yes'), E('c1', 'a2', 'no'),
            E('a2', 'd2'), E('d2', 'c2'),
            E('c2', 'x2', 'yes'), E('c2', 'x3', 'no'),
          ],
        },
      };
    case 'ilk_siparis':
      return {
        ad: 'İlk Sipariş Karşılama', triggerKind: 'order', aktif: true,
        graph: {
          nodes: [
            N('t', 'trigger', 'order', {}, 80, 40),
            N('c1', 'condition', 'first_order', {}, 80, 160),
            N('a1', 'action', 'send_message', { mesaj: 'Hoş geldiniz {ad}! İlk siparişiniz için teşekkürler. 🎁' }, 320, 160),
          ],
          edges: [E('t', 'c1'), E('c1', 'a1', 'yes')],
        },
      };
    case 'tekrar_satin_alma':
      return {
        ad: 'Tekrar Satın Alma', triggerKind: 'order', aktif: true,
        graph: {
          nodes: [
            N('t', 'trigger', 'order', {}, 80, 40),
            N('c1', 'condition', 'first_order', {}, 80, 160),
            N('a1', 'action', 'send_message', { mesaj: 'Tekrar aramızda olmanıza sevindik {ad}! 💚' }, 320, 280),
          ],
          edges: [E('t', 'c1'), E('c1', 'a1', 'no')],
        },
      };
    case 'sepet_terk':
      return {
        ad: 'Sepet/Ödeme Hatırlatma', triggerKind: 'order', aktif: true,
        graph: {
          nodes: [
            N('t', 'trigger', 'order', {}, 80, 40),
            N('d1', 'delay', 'preset', { preset: '1h' }, 80, 160),
            N('c1', 'condition', 'payment_received', {}, 80, 280),
            N('a1', 'action', 'send_message', { mesaj: 'Merhaba {ad}, sepetinizdeki ürünler sizi bekliyor: {link}' }, 80, 400),
          ],
          edges: [E('t', 'd1'), E('d1', 'c1'), E('c1', 'a1', 'no')],
        },
      };
    // Aşağıdakiler backend olayı henüz yok → taslak (aktif:false)
    case 'kargo_bilgilendirme':
      return {
        ad: 'Kargo Bilgilendirme (taslak)', triggerKind: 'status', triggerFilter: { durum: 'kargoda' }, aktif: false,
        graph: {
          nodes: [
            N('t', 'trigger', 'status', {}, 80, 40),
            N('a1', 'action', 'send_cargo_link', { mesaj: 'Merhaba {ad}, siparişiniz kargoya verildi. Takip: ' }, 80, 160),
          ],
          edges: [E('t', 'a1')],
        },
      };
    case 'vip_musteri':
      return {
        ad: 'VIP Müşteri (taslak)', triggerKind: 'order', aktif: false,
        graph: {
          nodes: [
            N('t', 'trigger', 'order', {}, 80, 40),
            N('c1', 'condition', 'amount_gt', { value: 5000 }, 80, 160),
            N('a1', 'action', 'send_message', { mesaj: 'Değerli müşterimiz {ad}, size özel avantajlar yolda! 🌟' }, 320, 160),
          ],
          edges: [E('t', 'c1'), E('c1', 'a1', 'yes')],
        },
      };
    case 'iade_sonrasi':
      return {
        ad: 'İade Sonrası Takip (taslak)', triggerKind: 'status', triggerFilter: { durum: 'iptal' }, aktif: false,
        graph: {
          nodes: [
            N('t', 'trigger', 'status', {}, 80, 40),
            N('d1', 'delay', 'preset', { preset: '24h' }, 80, 160),
            N('a1', 'action', 'send_message', { mesaj: 'Merhaba {ad}, deneyiminiz hakkında görüşünüzü merak ediyoruz.' }, 80, 280),
          ],
          edges: [E('t', 'd1'), E('d1', 'a1')],
        },
      };
    default:
      return null;
  }
}

export default router;
