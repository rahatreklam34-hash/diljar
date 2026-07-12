// Resmî WhatsApp Cloud API webhook'u — PUBLIC (auth/tenant middleware'inden ÖNCE mount edilir).
// GET  : Meta doğrulaması (hub.verify_token eşleşince hub.challenge döner)
// POST : gelen mesaj / teslim durumu / şablon onay durumu olayları
import { Router, Request, Response } from 'express';
import * as crypto from 'crypto';
import { prisma } from '../../lib/prisma';
import { normPhone } from './wa.manager';
import { apiDownloadMedia } from './wa.cloud';
import { saveMedia, mediaKindFromMime } from './wa.media';
import { maybeAiReply } from './wa.service';
import { extractTalepNo, isCardPaymentRequest, catalogOrderTrigger, catalogMediaReceived, catalogCardPaymentRequested } from '../store/catalog.trigger';

const router = Router();

// Body içindeki ilk phone_number_id'den tenant'ı (ve App Secret'i) çöz
async function tenantSecretFromBody(body: any): Promise<{ tenantId: string; appSecret: string } | null> {
  try {
    for (const entry of body?.entry || []) {
      for (const change of entry?.changes || []) {
        const pnid = change?.value?.metadata?.phone_number_id;
        if (!pnid) continue;
        const line = await prisma.whatsappLine.findFirst({ where: { phoneNumberId: pnid, channel: 'api' } }).catch(() => null);
        if (!line) continue;
        const st = await prisma.whatsappSettings.findFirst({ where: { tenantId: line.tenantId } }).catch(() => null);
        if (st?.metaAppSecret) return { tenantId: line.tenantId, appSecret: st.metaAppSecret };
        return null; // hat bulundu ama App Secret yapılandırılmamış → doğrulama atlanır
      }
    }
  } catch { /* yoksay */ }
  return null;
}

// Meta X-Hub-Signature-256 doğrulaması (App Secret ile HMAC-SHA256, raw gövde üzerinden)
function verifySignature(req: Request, appSecret: string): boolean {
  const header = String(req.headers['x-hub-signature-256'] || '');
  if (!header.startsWith('sha256=')) return false;
  const raw: Buffer | undefined = (req as any).rawBody;
  if (!raw || !raw.length) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(raw).digest('hex');
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ─── GET: doğrulama ───────────────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = String(req.query['hub.verify_token'] || '');
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token) {
    const match = await prisma.whatsappSettings.findFirst({ where: { webhookVerifyToken: token } }).catch(() => null);
    if (match) return res.status(200).send(String(challenge || ''));
  }
  return res.sendStatus(403);
});

// ─── POST: olaylar ──────────────────────────────────────────────────────────────
router.post('/', async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    if (body.object !== 'whatsapp_business_account') { res.sendStatus(200); return; }
    // İmza doğrulaması: tenant App Secret yapılandırılmışsa zorunlu (sahte webhook engellenir)
    const ts = await tenantSecretFromBody(body);
    if (ts && !verifySignature(req, ts.appSecret)) {
      console.warn('[wa-webhook] gecersiz imza reddedildi', ts.tenantId);
      res.sendStatus(401);
      return;
    }
    // Meta hızlı 200 bekler; işlemi arka planda yap.
    res.sendStatus(200);
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const field = change.field;
        const value = change.value || {};
        if (field === 'messages') {
          await handleMessagesChange(value).catch((e) => console.error('[wa-webhook] messages', e));
        } else if (field === 'message_template_status_update') {
          // Multi-tenant: şablon olayı WABA seviyesindedir; entry.id = WABA ID → tenant çöz.
          await handleTemplateStatus(value, entry?.id).catch((e) => console.error('[wa-webhook] tpl', e));
        }
      }
    }
  } catch (e) { console.error('[wa-webhook] post', e); if (!res.headersSent) res.sendStatus(200); }
});

async function lineByPhoneNumberId(phoneNumberId?: string): Promise<any | null> {
  if (!phoneNumberId) return null;
  return prisma.whatsappLine.findFirst({ where: { phoneNumberId, channel: 'api' } }).catch(() => null);
}

async function handleMessagesChange(value: any): Promise<void> {
  const phoneNumberId = value?.metadata?.phone_number_id;
  const line = await lineByPhoneNumberId(phoneNumberId);
  if (!line) return;
  const tenantId = line.tenantId;

  // 1) Gelen mesajlar
  const contacts = value.contacts || [];
  const nameByWaId = new Map<string, string>();
  for (const c of contacts) if (c.wa_id) nameByWaId.set(String(c.wa_id), c?.profile?.name || '');

  for (const msg of value.messages || []) {
    await handleInboundMessage(line, tenantId, msg, nameByWaId).catch((e) => console.error('[wa-webhook] inbound', e));
  }

  // 2) Giden teslim/okundu durumları
  for (const stt of value.statuses || []) {
    const waId = stt.id;
    const status = stt.status; // sent | delivered | read | failed
    if (!waId || !status) continue;
    let error: string | null = null;
    if (status === 'failed' && Array.isArray(stt.errors) && stt.errors.length) {
      const e = stt.errors[0] || {};
      error = [e.code, e.title || e.message, e.error_data?.details].filter(Boolean).join(' - ') || 'Bilinmeyen hata';
    }
    await prisma.whatsappMessage
      .updateMany({ where: { tenantId, waMessageId: waId }, data: error ? { status, error } : { status } })
      .catch(() => {});
  }
}

async function handleInboundMessage(line: any, tenantId: string, msg: any, nameByWaId: Map<string, string>): Promise<void> {
  const phone = normPhone(msg.from || '');
  if (!phone) return;
  const pushName = nameByWaId.get(String(msg.from)) || null;

  // Emoji tepki: ayrı balon açmadan hedef mesajın reaction alanını güncelle
  if (msg.type === 'reaction') {
    const targetId = msg.reaction?.message_id;
    const emoji = msg.reaction?.emoji || '';
    if (targetId) {
      await prisma.whatsappMessage.updateMany({ where: { tenantId, waMessageId: String(targetId) }, data: { reaction: emoji || null } }).catch(() => {});
    }
    return;
  }

  // Metin + medya çıkarımı
  let body = '';
  let mediaType: string | null = null;
  let mediaUrl: string | null = null;
  let mediaMime: string | null = null;
  let fileName: string | null = null;
  let waMediaId: string | null = null;

  const type = msg.type;
  if (type === 'text') body = msg.text?.body || '';
  else if (type === 'button') body = msg.button?.text || '';
  else if (type === 'interactive') body = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || '';
  else if (['image', 'video', 'audio', 'document', 'sticker'].includes(type)) {
    const m = msg[type] || {};
    waMediaId = m.id || null;
    body = m.caption || '';
    fileName = m.filename || null;
    mediaMime = m.mime_type || null;
    mediaType = mediaKindFromMime(mediaMime || '') || (type === 'sticker' ? 'image' : type);
    // Medyayı indir + diske kaydet + public URL üret
    if (waMediaId) {
      const dl = await apiDownloadMedia(line, waMediaId).catch(() => null);
      if (dl) {
        const saved = saveMedia(dl.buffer, dl.mime || mediaMime || 'application/octet-stream', fileName || undefined);
        mediaUrl = saved.url;
        if (!mediaMime) mediaMime = dl.mime;
      }
    }
  } else if (type === 'reaction') {
    // tepki yukarıda erken işlendi (buraya normalde düşmez)
    return;
  } else if (type === 'location') {
    const loc = msg.location || {};
    const label = loc.name || loc.address || `${loc.latitude}, ${loc.longitude}`;
    body = `Konum: ${label}`;
    if (loc.latitude != null && loc.longitude != null) body += ` https://maps.google.com/?q=${loc.latitude},${loc.longitude}`;
  } else if (type === 'contacts') {
    const c = Array.isArray(msg.contacts) ? msg.contacts[0] : null;
    body = c?.name?.formatted_name ? `Kişi: ${c.name.formatted_name}` : '[kişi kartı]';
  } else {
    body = `[${type || 'mesaj'}]`;
  }

  const windowExpiresAt = new Date(Date.now() + 24 * 3600 * 1000);
  const preview = (body || '[medya]').slice(0, 120);

  // Alıntılı (yanıt) mesaj bilgisi — gösterim için
  const replyToWaId: string | null = msg.context?.id ? String(msg.context.id) : null;
  let replyToText: string | null = null;
  if (replyToWaId) {
    const orig = await prisma.whatsappMessage.findFirst({ where: { tenantId, waMessageId: replyToWaId }, select: { body: true } }).catch(() => null);
    if (orig) replyToText = (orig.body || '').slice(0, 120);
  }

  let convo = await prisma.whatsappConversation.findUnique({ where: { tenantId_customerPhone: { tenantId, customerPhone: phone } } });
  if (!convo) {
    const cust = await prisma.customer.findFirst({ where: { tenantId, telefon: { contains: phone.slice(-10) } } }).catch(() => null);
    convo = await prisma.whatsappConversation.create({
      data: { tenantId, lineId: line.id, customerPhone: phone, customerName: pushName || cust?.ad || null, customerId: cust?.id || null, lastMessageAt: new Date(), lastPreview: preview, lastDirection: 'in', unread: 1, windowExpiresAt },
    });
  } else {
    await prisma.whatsappConversation.update({
      where: { id: convo.id },
      data: { lastMessageAt: new Date(), lastPreview: preview, lastDirection: 'in', unread: { increment: 1 }, customerName: convo.customerName || pushName || undefined, windowExpiresAt },
    });
  }

  await prisma.whatsappMessage.create({
    data: {
      tenantId, conversationId: convo.id, lineId: line.id, customerPhone: phone, direction: 'in',
      body: body || '[medya]', mediaType, mediaUrl, mediaMime, fileName, waMediaId, waMessageId: msg.id || null, status: 'delivered',
      replyToWaId, replyToText,
    },
  });

  // Katalog sipariş tetikleyicileri
  const textForCheck = body || '';
  const talepNo = extractTalepNo(textForCheck);
  if (talepNo) {
    // TalepNo bulundu → siparişi tetikle
    await catalogOrderTrigger(tenantId, talepNo, phone, msg.id || '').catch((e) => console.error('[wa-webhook] catalog trigger', e));
  } else if (mediaType && ['image', 'document'].includes(mediaType)) {
    // Medya geldi → dekont kontrolü
    await catalogMediaReceived(tenantId, phone).catch((e) => console.error('[wa-webhook] catalog media', e));
  } else if (textForCheck && isCardPaymentRequest(textForCheck)) {
    // Kredi kartı talebi → sayaç durdur
    await catalogCardPaymentRequested(tenantId, phone).catch((e) => console.error('[wa-webhook] catalog card', e));
  }

  // AI oto-yanıt (pencere içi serbest metin)
  if (body && body.trim()) await maybeAiReply(tenantId, convo, body).catch(() => {});
}

async function handleTemplateStatus(value: any, wabaId?: string): Promise<void> {
  const name = value?.message_template_name;
  const lang = value?.message_template_language;
  const metaId = value?.message_template_id ? String(value.message_template_id) : null;
  const event = String(value?.event || '').toUpperCase(); // APPROVED | REJECTED | FLAGGED | PENDING_DELETION ...
  const reason = value?.reason || null;
  if (!name) return;
  const statusMap: Record<string, string> = { APPROVED: 'approved', REJECTED: 'rejected', PENDING: 'pending', FLAGGED: 'disabled', DISABLED: 'disabled', PAUSED: 'disabled' };
  const status = statusMap[event];
  if (!status) return;
  // Multi-tenant güvenlik: WABA ID → tenant çöz. Çözülemezse cross-tenant güncellemeyi ÖNLE (dur).
  if (!wabaId) { console.warn('[wa-webhook] tpl: WABA ID yok, guncelleme atlandi', name); return; }
  const line = await prisma.whatsappLine.findFirst({ where: { wabaId: String(wabaId), channel: 'api' } }).catch(() => null);
  if (!line?.tenantId) { console.warn('[wa-webhook] tpl: tenant cozulemedi, guncelleme atlandi', wabaId, name); return; }
  const where: any = { tenantId: line.tenantId, name };
  if (lang) where.language = lang;
  await prisma.whatsappTemplate.updateMany({ where, data: { status, metaId: metaId || undefined, rejectReason: status === 'rejected' ? String(reason || '') : null } }).catch(() => {});
}

export default router;
