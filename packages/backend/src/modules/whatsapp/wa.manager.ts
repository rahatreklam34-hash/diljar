import path from 'path';
import fs from 'fs';
import { prisma } from '../../lib/prisma';

// Baileys ESM-only paket; CommonJS derlemede gerçek dynamic import ile yüklenir.
let _baileys: any = null;
async function loadBaileys(): Promise<any> {
  if (_baileys) return _baileys;
  const dynImport = new Function('m', 'return import(m)') as (m: string) => Promise<any>;
  _baileys = await dynImport('@whiskeysockets/baileys');
  return _baileys;
}

let _qrcode: any = null;
async function loadQrcode(): Promise<any> {
  if (_qrcode) return _qrcode;
  _qrcode = require('qrcode');
  return _qrcode;
}

const silentLogger: any = {
  level: 'silent',
  child: () => silentLogger,
  trace() {}, debug() {}, info() {}, warn() {}, error() {}, fatal() {},
};

const SESSIONS_DIR = process.env.WA_SESSIONS_DIR || path.resolve(process.cwd(), 'wa_sessions');

type LineRuntime = {
  sock: any;
  status: string; // disconnected | connecting | qr | connected | logout
  qrDataUrl?: string;
  startedAt: number;
};

const runtimes = new Map<string, LineRuntime>();

export function getRuntime(lineId: string) {
  return runtimes.get(lineId);
}

export function lineStatus(lineId: string): { status: string; qr?: string } {
  const rt = runtimes.get(lineId);
  if (!rt) return { status: 'disconnected' };
  return { status: rt.status, qr: rt.qrDataUrl };
}

export function isConnected(lineId: string): boolean {
  return runtimes.get(lineId)?.status === 'connected';
}

function sessionPath(lineId: string) {
  return path.join(SESSIONS_DIR, lineId);
}

async function setStatus(lineId: string, status: string, extra: any = {}) {
  const rt = runtimes.get(lineId);
  if (rt) rt.status = status;
  try {
    await prisma.whatsappLine.update({ where: { id: lineId }, data: { status, ...extra } });
  } catch { /* satır silinmiş olabilir */ }
}

// Normalize TR telefon → 90XXXXXXXXXX (sadece rakam)
export function normPhone(raw: string): string {
  let d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 10 && d.startsWith('5')) d = '90' + d;
  else if (d.length === 11 && d.startsWith('0')) d = '90' + d.slice(1);
  else if (d.length === 12 && d.startsWith('90')) { /* ok */ }
  else if (d.length === 13 && d.startsWith('900')) d = '90' + d.slice(3);
  return d;
}

function jidToPhone(jid: string): string {
  return normPhone(String(jid || '').split('@')[0].split(':')[0]);
}

function extractText(msg: any): string {
  const m = msg?.message;
  if (!m) return '';
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    (m.buttonsResponseMessage?.selectedDisplayText) ||
    (m.listResponseMessage?.title) ||
    ''
  );
}

// Gelen mesajı kaydet (sticky: müşteri ilk hangi hatta düştüyse o hatta sabitlenir)
async function handleIncoming(lineId: string, tenantId: string, msg: any) {
  try {
    if (!msg?.key) return;
    // Emoji tepki: ayrı balon açmadan hedef mesajın reaction alanını güncelle
    const reactMsg = msg?.message?.reactionMessage;
    if (reactMsg) {
      const targetId = reactMsg.key?.id;
      const emoji = reactMsg.text || '';
      if (targetId) {
        await prisma.whatsappMessage.updateMany({ where: { tenantId, waMessageId: String(targetId) }, data: { reaction: emoji || null } }).catch(() => {});
      }
      return;
    }
    if (msg.key.fromMe) return;
    const jid: string = msg.key.remoteJid || '';
    if (!jid.endsWith('@s.whatsapp.net')) return; // grup/durum/broadcast hariç
    const phone = jidToPhone(jid);
    if (!phone) return;
    const body = extractText(msg);
    const pushName = msg.pushName || null;
    // Alıntılı (yanıt) mesaj bilgisi — gösterim için
    const ctx = msg?.message?.extendedTextMessage?.contextInfo
      || msg?.message?.imageMessage?.contextInfo
      || msg?.message?.videoMessage?.contextInfo
      || msg?.message?.documentMessage?.contextInfo;
    const replyToWaId = ctx?.stanzaId ? String(ctx.stanzaId) : null;
    const replyToText = ctx?.quotedMessage ? extractText({ message: ctx.quotedMessage }).slice(0, 120) : null;

    // Cloud API 24s müşteri hizmet penceresi: gelen her mesajda yenilenir (free-form gönderim için)
    const windowExpiresAt = new Date(Date.now() + 24 * 3600 * 1000);

    let convo = await prisma.whatsappConversation.findUnique({ where: { tenantId_customerPhone: { tenantId, customerPhone: phone } } });
    let firstContact = false;
    if (!convo) {
      firstContact = true;
      const cust = await prisma.customer.findFirst({ where: { tenantId, telefon: { contains: phone.slice(-10) } } }).catch(() => null);
      convo = await prisma.whatsappConversation.create({
        data: { tenantId, lineId, customerPhone: phone, customerName: pushName || cust?.ad || null, customerId: cust?.id || null, lastMessageAt: new Date(), lastPreview: body.slice(0, 120), lastDirection: 'in', unread: 1, windowExpiresAt },
      });
    } else {
      await prisma.whatsappConversation.update({
        where: { id: convo.id },
        data: { lastMessageAt: new Date(), lastPreview: body.slice(0, 120), lastDirection: 'in', unread: { increment: 1 }, customerName: convo.customerName || pushName || undefined, windowExpiresAt },
      });
    }
    await prisma.whatsappMessage.create({
      data: { tenantId, conversationId: convo.id, lineId: convo.lineId, customerPhone: phone, direction: 'in', body: body || '[medya]', mediaType: m_mediaType(msg), waMessageId: msg.key.id || null, status: 'delivered', replyToWaId, replyToText },
    });

    // Oto-yanıt: yalnızca ilk temas + ayar açıksa, kuyruğa (throttle'a tabi)
    if (firstContact) {
      const st = await prisma.whatsappSettings.findUnique({ where: { tenantId } }).catch(() => null);
      if (st?.otoYanitAktif && st.otoYanitMetin) {
        await prisma.whatsappOutbox.create({ data: { tenantId, lineId: convo.lineId, customerPhone: phone, body: st.otoYanitMetin, kind: 'auto' } });
      }
    }

    // AI oto-yanıt (ayar açıksa): lazy require ile döngüsel import'tan kaçın
    if (body && body.trim()) {
      try { const { maybeAiReply } = require('./wa.service'); await maybeAiReply(tenantId, convo, body); } catch { /* */ }
    }
  } catch (e: any) { console.error('[wa] handleIncoming HATA', lineId, e?.message || e); }
}

function m_mediaType(msg: any): string | null {
  const m = msg?.message || {};
  if (m.imageMessage) return 'image';
  if (m.videoMessage) return 'video';
  if (m.audioMessage) return 'audio';
  if (m.documentMessage) return 'document';
  return null;
}

// Hattı başlat / QR üret
export async function startLine(lineId: string): Promise<void> {
  const line = await prisma.whatsappLine.findUnique({ where: { id: lineId } });
  if (!line) throw new Error('Hat bulunamadı');

  const existing = runtimes.get(lineId);
  if (existing && (existing.status === 'connecting' || existing.status === 'connected')) return;

  const baileys = await loadBaileys();
  const makeWASocket = baileys.default || baileys.makeWASocket;
  const { useMultiFileAuthState, fetchLatestBaileysVersion, Browsers } = baileys;

  fs.mkdirSync(sessionPath(lineId), { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath(lineId));
  let version: any = undefined;
  try { const v = await fetchLatestBaileysVersion(); version = v.version; } catch { /* default */ }

  const sock = makeWASocket({
    version,
    auth: state,
    logger: silentLogger,
    printQRInTerminal: false,
    browser: Browsers ? Browsers.appropriate('Diljar') : ['Diljar', 'Chrome', '1.0'],
    syncFullHistory: false,
    markOnlineOnConnect: false,
    // Alıcı şifre çözemeyip yeniden gönderim isterse (retry-receipt) mesajı geri ver →
    // aksi halde karşı tarafta "Waiting for this message" takılı kalır.
    getMessage: async (key: any): Promise<any> => {
      try {
        const id = key?.id;
        if (!id) return undefined;
        const m = await prisma.whatsappMessage.findFirst({ where: { waMessageId: id }, select: { body: true } });
        if (m?.body) return { conversation: m.body };
      } catch { /* */ }
      return undefined;
    },
  });

  runtimes.set(lineId, { sock, status: 'connecting', startedAt: Date.now() });
  await setStatus(lineId, 'connecting');

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (u: any) => {
    const rt = runtimes.get(lineId);
    if (!rt) return;
    if (u.qr) {
      try { const qrcode = await loadQrcode(); rt.qrDataUrl = await qrcode.toDataURL(u.qr); } catch { /* */ }
      rt.status = 'qr';
      await setStatus(lineId, 'qr');
    }
    if (u.connection === 'open') {
      rt.qrDataUrl = undefined;
      rt.status = 'connected';
      const phone = jidToPhone(sock.user?.id || '');
      console.log(`[wa] line=${lineId} CONNECTED phone=${phone}`);
      await setStatus(lineId, 'connected', { phone: phone || undefined, jid: sock.user?.id || undefined, lastConnectedAt: new Date() });
    }
    if (u.connection === 'close') {
      const baileys2 = await loadBaileys();
      const DisconnectReason = baileys2.DisconnectReason || {};
      const code = u.lastDisconnect?.error?.output?.statusCode;
      const loggedOut = code === (DisconnectReason.loggedOut || 401);
      console.log(`[wa] line=${lineId} close code=${code} loggedOut=${loggedOut}`);
      if (loggedOut) {
        rt.status = 'logout';
        runtimes.delete(lineId);
        try { fs.rmSync(sessionPath(lineId), { recursive: true, force: true }); } catch { /* */ }
        await setStatus(lineId, 'logout', { jid: null, phone: null });
      } else {
        // Soket öldü: runtime'ı temizle ki startLine erken return etmesin (QR eşleşme sonrası 515 restartRequired dahil)
        try { sock.ev.removeAllListeners?.('connection.update'); } catch { /* */ }
        runtimes.delete(lineId);
        await setStatus(lineId, 'connecting');
        const delay = code === (DisconnectReason.restartRequired || 515) ? 500 : 3000;
        setTimeout(() => { startLine(lineId).catch((e) => console.error('[wa] reconnect err', lineId, e?.message)); }, delay);
      }
    }
  });

  sock.ev.on('messages.upsert', async (ev: any) => {
    if (ev.type !== 'notify') return;
    console.log('[wa] messages.upsert', lineId, 'type=', ev.type, 'count=', (ev.messages || []).length);
    for (const msg of ev.messages || []) {
      await handleIncoming(lineId, line.tenantId, msg);
    }
  });
}

export async function logoutLine(lineId: string): Promise<void> {
  const rt = runtimes.get(lineId);
  try { await rt?.sock?.logout?.(); } catch { /* */ }
  try { rt?.sock?.end?.(undefined); } catch { /* */ }
  runtimes.delete(lineId);
  try { fs.rmSync(sessionPath(lineId), { recursive: true, force: true }); } catch { /* */ }
  await setStatus(lineId, 'logout', { jid: null, phone: null });
}

export async function stopLine(lineId: string): Promise<void> {
  const rt = runtimes.get(lineId);
  try { rt?.sock?.end?.(undefined); } catch { /* */ }
  runtimes.delete(lineId);
  await setStatus(lineId, 'disconnected');
}

// Alıntı (quoted) için minimal Baileys mesaj nesnesi kur
function buildQuoted(jid: string, quoted?: { waId?: string | null; fromMe?: boolean; text?: string | null } | null): any {
  if (!quoted?.waId) return undefined;
  return {
    key: { remoteJid: jid, id: quoted.waId, fromMe: !!quoted.fromMe },
    message: { conversation: quoted.text || '' },
  };
}

// Mesaj gönder — başarılıysa waMessageId döner
export async function sendText(lineId: string, phone: string, body: string, quoted?: { waId?: string | null; fromMe?: boolean; text?: string | null } | null): Promise<string | null> {
  const rt = runtimes.get(lineId);
  if (!rt || rt.status !== 'connected' || !rt.sock) throw new Error('Hat bağlı değil');
  const jid = normPhone(phone) + '@s.whatsapp.net';
  const q = buildQuoted(jid, quoted);
  const r = await rt.sock.sendMessage(jid, { text: body }, q ? { quoted: q } : undefined);
  return r?.key?.id || null;
}

// Medya gönder (Baileys) — public URL üzerinden. type: image|video|audio|document
export async function sendMedia(lineId: string, phone: string, type: string, url: string, caption?: string, fileName?: string, quoted?: { waId?: string | null; fromMe?: boolean; text?: string | null } | null): Promise<string | null> {
  const rt = runtimes.get(lineId);
  if (!rt || rt.status !== 'connected' || !rt.sock) throw new Error('Hat bağlı değil');
  const jid = normPhone(phone) + '@s.whatsapp.net';
  let content: any;
  if (type === 'image') content = { image: { url }, caption: caption || undefined };
  else if (type === 'video') content = { video: { url }, caption: caption || undefined };
  else if (type === 'audio') content = { audio: { url }, mimetype: 'audio/mp4' };
  else content = { document: { url }, fileName: fileName || 'dosya', caption: caption || undefined };
  const q = buildQuoted(jid, quoted);
  const r = await rt.sock.sendMessage(jid, content, q ? { quoted: q } : undefined);
  return r?.key?.id || null;
}

// Emoji tepki gönder/kaldır (emoji='' → kaldır). targetFromMe: hedef mesaj bizim mi?
export async function sendReaction(lineId: string, phone: string, targetWaId: string, emoji: string, targetFromMe: boolean): Promise<string | null> {
  const rt = runtimes.get(lineId);
  if (!rt || rt.status !== 'connected' || !rt.sock) throw new Error('Hat bağlı değil');
  const jid = normPhone(phone) + '@s.whatsapp.net';
  const key = { remoteJid: jid, id: targetWaId, fromMe: !!targetFromMe };
  const r = await rt.sock.sendMessage(jid, { react: { text: emoji || '', key } });
  return r?.key?.id || null;
}

// Herkesten sil (yalnızca kendi gönderdiğimiz mesaj). targetWaId: silinecek mesaj id'si
export async function deleteForEveryone(lineId: string, phone: string, targetWaId: string, targetFromMe: boolean): Promise<void> {
  const rt = runtimes.get(lineId);
  if (!rt || rt.status !== 'connected' || !rt.sock) throw new Error('Hat bağlı değil');
  const jid = normPhone(phone) + '@s.whatsapp.net';
  const key = { remoteJid: jid, id: targetWaId, fromMe: !!targetFromMe };
  await rt.sock.sendMessage(jid, { delete: key });
}

// Açılışta aktif QR (Baileys) hatlarını yeniden bağla (oturum dosyası varsa QR'sız bağlanır)
export async function reconnectActiveLines(): Promise<void> {
  const lines = await prisma.whatsappLine.findMany({ where: { active: true } }).catch(() => [] as any[]);
  for (const l of lines) {
    if ((l as any).channel === 'api') continue; // Cloud API hatları soket gerektirmez
    if (l.status === 'logout') continue;
    if (!fs.existsSync(path.join(sessionPath(l.id), 'creds.json'))) continue; // QR ile bağlanmamış
    startLine(l.id).catch(() => {});
  }
}
