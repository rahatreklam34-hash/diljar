// Resmî WhatsApp Cloud API (Meta Graph) istemcisi.
// channel='api' olan hatlar bu modül üzerinden gönderim/medya/şablon işlemleri yapar.
import { normPhone } from './wa.manager';

const GRAPH = 'https://graph.facebook.com/v21.0';

type ApiLine = { phoneNumberId?: string | null; accessToken?: string | null; wabaId?: string | null };

function authHeaders(line: ApiLine): Record<string, string> {
  return { Authorization: `Bearer ${line.accessToken || ''}`, 'Content-Type': 'application/json' };
}

async function graph(method: string, urlPath: string, token: string, body?: any): Promise<any> {
  const res = await fetch(`${GRAPH}/${urlPath}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  if (!res.ok) {
    const e = json?.error || {};
    // Meta "Invalid parameter" gibi genel mesaj döner; asıl sebep error_user_msg / error_data.details içinde olur
    const detail = e.error_data?.details || e.error_user_msg || e.error_user_title;
    const base = e.message || `HTTP ${res.status}`;
    const msg = detail && detail !== base ? `${base}: ${detail}` : base;
    const err: any = new Error(msg);
    err.status = res.status; err.body = json;
    throw err;
  }
  return json;
}

// Bağlantı testi: phoneNumber bilgisi döner (display_phone_number, verified_name)
export async function apiPhoneInfo(line: ApiLine): Promise<{ phone: string; name?: string }> {
  if (!line.phoneNumberId || !line.accessToken) throw new Error('API hattı için Phone Number ID ve token gerekli');
  const j = await graph('GET', `${line.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`, line.accessToken);
  return { phone: normPhone(j?.display_phone_number || ''), name: j?.verified_name };
}

// Serbest metin (yalnızca 24s müşteri hizmet penceresi içinde gönderilebilir)
// replyToWaId verilirse alıntılı yanıt (context.message_id) olarak gönderilir.
export async function apiSendText(line: ApiLine, toPhone: string, text: string, replyToWaId?: string | null): Promise<string | null> {
  const payload: any = {
    messaging_product: 'whatsapp', to: normPhone(toPhone), type: 'text', text: { preview_url: true, body: text },
  };
  if (replyToWaId) payload.context = { message_id: replyToWaId };
  const j = await graph('POST', `${line.phoneNumberId}/messages`, line.accessToken!, payload);
  return j?.messages?.[0]?.id || null;
}

// Emoji tepki gönder/kaldır (emoji='' → tepki kaldırılır). 24s pencere içinde geçerli.
export async function apiSendReaction(line: ApiLine, toPhone: string, messageId: string, emoji: string): Promise<string | null> {
  const j = await graph('POST', `${line.phoneNumberId}/messages`, line.accessToken!, {
    messaging_product: 'whatsapp', to: normPhone(toPhone), type: 'reaction',
    reaction: { message_id: messageId, emoji: emoji || '' },
  });
  return j?.messages?.[0]?.id || null;
}

// Şablon mesajı (pencere dışı / iş başlatma). components: body params + opsiyonel header
export async function apiSendTemplate(
  line: ApiLine,
  toPhone: string,
  templateName: string,
  language: string,
  bodyParams: string[] = [],
  header?: { type: 'text' | 'image' | 'document'; value: string },
  otpCode?: string,
): Promise<string | null> {
  const components: any[] = [];
  if (header) {
    if (header.type === 'text') components.push({ type: 'header', parameters: [{ type: 'text', text: header.value }] });
    else if (header.type === 'image') components.push({ type: 'header', parameters: [{ type: 'image', image: { link: header.value } }] });
    else if (header.type === 'document') components.push({ type: 'header', parameters: [{ type: 'document', document: { link: header.value } }] });
  }
  if (bodyParams.length) components.push({ type: 'body', parameters: bodyParams.map((t) => ({ type: 'text', text: String(t ?? '') })) });
  // AUTHENTICATION şablonu: kopyala-kod (COPY_CODE) butonu kodu parametre olarak ister
  if (otpCode) components.push({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: String(otpCode) }] });
  const j = await graph('POST', `${line.phoneNumberId}/messages`, line.accessToken!, {
    messaging_product: 'whatsapp', to: normPhone(toPhone), type: 'template',
    template: { name: templateName, language: { code: language || 'tr' }, components },
  });
  return j?.messages?.[0]?.id || null;
}

// Medya gönder (public URL ile). type: image|document|video|audio
export async function apiSendMedia(line: ApiLine, toPhone: string, type: string, link: string, caption?: string, fileName?: string, replyToWaId?: string | null): Promise<string | null> {
  const media: any = { link };
  if (caption && (type === 'image' || type === 'video' || type === 'document')) media.caption = caption;
  if (type === 'document' && fileName) media.filename = fileName;
  const payload: any = {
    messaging_product: 'whatsapp', to: normPhone(toPhone), type, [type]: media,
  };
  if (replyToWaId) payload.context = { message_id: replyToWaId };
  const j = await graph('POST', `${line.phoneNumberId}/messages`, line.accessToken!, payload);
  return j?.messages?.[0]?.id || null;
}

// Gelen medya indir: önce media id → url, sonra url'i auth ile çek
export async function apiDownloadMedia(line: ApiLine, mediaId: string): Promise<{ buffer: Buffer; mime: string } | null> {
  try {
    const meta = await graph('GET', `${mediaId}`, line.accessToken!);
    const url = meta?.url;
    if (!url) return null;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${line.accessToken}` } });
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    return { buffer: Buffer.from(ab), mime: meta?.mime_type || res.headers.get('content-type') || 'application/octet-stream' };
  } catch { return null; }
}

// --- Şablon yönetimi (WABA seviyesinde) ---
export async function apiCreateTemplate(line: ApiLine, payload: any): Promise<{ id: string; status: string }> {
  if (!line.wabaId) throw new Error('WABA ID gerekli');
  const j = await graph('POST', `${line.wabaId}/message_templates`, line.accessToken!, payload);
  return { id: j?.id, status: j?.status || 'PENDING' };
}

export async function apiListTemplates(line: ApiLine): Promise<any[]> {
  if (!line.wabaId) return [];
  const j = await graph('GET', `${line.wabaId}/message_templates?fields=name,status,category,language,id,rejected_reason&limit=200`, line.accessToken!);
  return j?.data || [];
}

export async function apiDeleteTemplate(line: ApiLine, name: string): Promise<void> {
  if (!line.wabaId) return;
  await graph('DELETE', `${line.wabaId}/message_templates?name=${encodeURIComponent(name)}`, line.accessToken!);
}
