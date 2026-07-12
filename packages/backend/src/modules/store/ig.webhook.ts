// Resmî Instagram Messaging (Graph API) webhook'u — PUBLIC (auth/tenant middleware'inden ÖNCE mount edilir).
// Kendi bağlı Instagram Business hesabına gelen DM ve yorumlara Meta'nın RESMİ Graph API'si
// (webhook + Send API) ile otomatik yanıt / karşılama verir. Chrome/DOM otomasyonu YOK.
//
// GET  : Meta doğrulaması (hub.verify_token eşleşince hub.challenge döner)
// POST : gelen DM (messaging) / yorum (comments) olayları → oto-yanıt gönderir
import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/prisma';

const router = Router();

// ─── GET: Meta doğrulaması ───────────────────────────────────────────────────
// Kullanıcı Meta App panelinde girdiği verify_token bir tenant'ın
// StoreSetting.igWebhookVerifyToken alanıyla eşleşirse hub.challenge döner.
router.get('/', async (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = String(req.query['hub.verify_token'] || '');
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token) {
    const match = await prisma.storeSetting
      .findFirst({ where: { igWebhookVerifyToken: token } })
      .catch(() => null);
    if (match) return res.status(200).send(String(challenge || ''));
  }
  return res.sendStatus(403);
});

// ─── POST: olaylar ────────────────────────────────────────────────────────────
router.post('/', async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    // Instagram webhook object alanı 'instagram' veya (bazı kurulumlarda) 'page'
    if (body.object !== 'instagram' && body.object !== 'page') {
      res.sendStatus(200);
      return;
    }
    // Meta hızlı 200 bekler; işlemi arka planda yap.
    res.sendStatus(200);
    for (const entry of body.entry || []) {
      // 1) DM olayları (messaging dizisi)
      const messaging: any[] = Array.isArray(entry.messaging) ? entry.messaging : [];
      for (const m of messaging) {
        await handleDmEvent(entry, m).catch((e) => console.error('[ig-webhook] dm', e?.message));
      }
      // 2) Yorum olayları (changes dizisi, field='comments')
      const changes: any[] = Array.isArray(entry.changes) ? entry.changes : [];
      for (const ch of changes) {
        if (ch.field === 'comments') {
          await handleCommentEvent(entry, ch.value || {}).catch((e) => console.error('[ig-webhook] comment', e?.message));
        }
      }
    }
  } catch (e: any) {
    console.error('[ig-webhook] post', e?.message);
    if (!res.headersSent) res.sendStatus(200);
  }
});

// entry.id (IG hesap/sayfa id) → tenant (StoreSetting.igUserIdSaved eşleşmesi)
async function tenantByIgId(igId: string): Promise<{ tenantId: string; igToken: string; igUserId: string } | null> {
  if (!igId) return null;
  const ss = await prisma.storeSetting
    .findFirst({ where: { igUserIdSaved: igId }, select: { tenantId: true, igTokenSaved: true, igUserIdSaved: true } })
    .catch(() => null);
  if (ss?.igTokenSaved && ss?.igUserIdSaved) {
    return { tenantId: ss.tenantId, igToken: ss.igTokenSaved, igUserId: ss.igUserIdSaved };
  }
  return null;
}

// Türkçe-güvenli küçük harf (anahtar kelime eşleşmesi için ASCII'ye katlar)
const asciiLower = (s: any): string => String(s ?? '')
  .replace(/[ıİiI]/g, 'i')
  .replace(/[şŞ]/g, 's')
  .replace(/[çÇ]/g, 'c')
  .replace(/[ğĞ]/g, 'g')
  .replace(/[öÖ]/g, 'o')
  .replace(/[üÜ]/g, 'u')
  .toLowerCase();

// Çalışma saati içinde miyiz? (bas/bit saat "HH:MM"). Saatler tanımsızsa daima "içinde" say.
function calismaSaatiIcinde(bas?: string | null, bit?: string | null): boolean {
  if (!bas || !bit) return true;
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const [bh, bm] = bas.split(':').map((x) => parseInt(x, 10));
  const [eh, em] = bit.split(':').map((x) => parseInt(x, 10));
  if (isNaN(bh) || isNaN(eh)) return true;
  const start = bh * 60 + (bm || 0);
  const end = eh * 60 + (em || 0);
  if (start <= end) return cur >= start && cur <= end;
  // Gece devreden aralık (ör 22:00-06:00)
  return cur >= start || cur <= end;
}

// Gelen metne göre yanıt metnini çöz: ayar aktif mi → çalışma saati dışı mı →
// anahtar kelime eşleşen ilk aktif kural (öncelik) → karşılama.
// Dönen: { text, kuralId } | null (yanıt yok)
async function resolveReply(tenantId: string, kanal: 'dm' | 'yorum', metin: string): Promise<{ text: string; kuralId: string | null } | null> {
  const ayar = await prisma.igOtoAyar.findUnique({ where: { tenantId } }).catch(() => null);
  if (!ayar || !ayar.aktif) return null;

  // Çalışma saati dışı mesajı (aktifse ve saat dışındaysak) öncelikli
  if (ayar.calismaSaatDisiAktif && ayar.calismaSaatDisiMetni && !calismaSaatiIcinde(ayar.calismaBasSaat, ayar.calismaBitSaat)) {
    return { text: ayar.calismaSaatDisiMetni, kuralId: null };
  }

  const lower = asciiLower(metin || '');

  // Anahtar kelime eşleşen ilk aktif kural (öncelik sırasına göre)
  const kurallar = await prisma.igOtoYanitKural.findMany({
    where: { tenantId, tip: kanal, aktif: true },
    orderBy: [{ oncelik: 'desc' }, { createdAt: 'asc' }],
  }).catch(() => [] as any[]);

  // Önce anahtar kelimesi OLAN kurallar (spesifik eşleşme)
  for (const k of kurallar) {
    const kws = String(k.anahtarKelimeler || '').split(',').map((x: string) => asciiLower(x.trim())).filter(Boolean);
    if (!kws.length) continue;
    if (kws.some((kw: string) => lower.includes(kw))) {
      return { text: k.yanitMetni, kuralId: k.id };
    }
  }
  // Sonra anahtar kelimesi BOŞ olan (tüm mesajlara yanıt) kural
  const genel = kurallar.find((k: any) => !String(k.anahtarKelimeler || '').trim());
  if (genel) return { text: genel.yanitMetni, kuralId: genel.id };

  // Kural yoksa karşılama (aktifse) — yalnızca DM için mantıklı
  if (kanal === 'dm' && ayar.karsilamaAktif && ayar.karsilamaMetni) {
    return { text: ayar.karsilamaMetni, kuralId: null };
  }
  return null;
}

// ─── Send API: DM yanıtı (recipient id + message.text) ────────────────────────
// POST https://graph.facebook.com/<IG_ID>/messages
async function sendDm(igUserId: string, token: string, recipientId: string, text: string): Promise<boolean> {
  const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(igUserId)}/messages`;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text },
        access_token: token,
      }),
    });
    const j: any = await r.json().catch(() => ({}));
    if (j?.error) { console.error('[ig-webhook] sendDm error:', j.error?.message); return false; }
    return true;
  } catch (e: any) {
    console.error('[ig-webhook] sendDm fetch', e?.message);
    return false;
  }
}

// ─── Send API: yorum yanıtı ───────────────────────────────────────────────────
// POST https://graph.facebook.com/<comment_id>/replies  (message=...)
async function replyComment(commentId: string, token: string, text: string): Promise<boolean> {
  const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(commentId)}/replies`;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, access_token: token }),
    });
    const j: any = await r.json().catch(() => ({}));
    if (j?.error) { console.error('[ig-webhook] replyComment error:', j.error?.message); return false; }
    return true;
  } catch (e: any) {
    console.error('[ig-webhook] replyComment fetch', e?.message);
    return false;
  }
}

// DM olayı işle
async function handleDmEvent(entry: any, m: any): Promise<void> {
  // Kendi gönderdiğimiz mesajın echo'suna yanıt verme
  if (m?.message?.is_echo) return;
  const igId = String(entry?.id || '');
  const ctx = await tenantByIgId(igId);
  if (!ctx) return;

  const senderId = String(m?.sender?.id || '');
  const text = String(m?.message?.text || '');
  // Kendimize gelen: sender bizim hesap id'imizse atla
  if (!senderId || senderId === ctx.igUserId) return;

  await prisma.igMesajLog.create({
    data: { tenantId: ctx.tenantId, yon: 'in', kanal: 'dm', gonderen: senderId, metin: text || null },
  }).catch(() => {});

  const reply = await resolveReply(ctx.tenantId, 'dm', text);
  if (!reply) return;

  const ok = await sendDm(ctx.igUserId, ctx.igToken, senderId, reply.text);
  if (ok) {
    await prisma.igMesajLog.create({
      data: { tenantId: ctx.tenantId, yon: 'out', kanal: 'dm', gonderen: senderId, metin: reply.text, kuralId: reply.kuralId },
    }).catch(() => {});
  }
}

// Yorum olayı işle
async function handleCommentEvent(entry: any, value: any): Promise<void> {
  const igId = String(entry?.id || '');
  const ctx = await tenantByIgId(igId);
  if (!ctx) return;

  const commentId = String(value?.id || '');
  const text = String(value?.text || '');
  const fromId = String(value?.from?.id || '');
  const fromName = value?.from?.username || null;
  if (!commentId) return;
  // Kendi hesabımızın yorumuna yanıt verme (döngü engeli)
  if (fromId && fromId === ctx.igUserId) return;

  await prisma.igMesajLog.create({
    data: { tenantId: ctx.tenantId, yon: 'in', kanal: 'yorum', gonderen: fromName || fromId || null, metin: text || null },
  }).catch(() => {});

  const reply = await resolveReply(ctx.tenantId, 'yorum', text);
  if (!reply) return;

  const ok = await replyComment(commentId, ctx.igToken, reply.text);
  if (ok) {
    await prisma.igMesajLog.create({
      data: { tenantId: ctx.tenantId, yon: 'out', kanal: 'yorum', gonderen: fromName || fromId || null, metin: reply.text, kuralId: reply.kuralId },
    }).catch(() => {});
  }
}

export default router;
