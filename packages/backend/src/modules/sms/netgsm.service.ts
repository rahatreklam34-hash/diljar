import https from 'https';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../lib/http';

export interface NetgsmConfig {
  usercode: string;
  password: string;
  msgheader: string;
  // Bildirim tercihleri (sms ayar ekranindan)
  notify_new?: boolean;
  notify_approved?: boolean;
  notify_shipped?: boolean;
  notify_cancel?: boolean;
  notify_lowstock?: boolean;
  tpl_new?: string;
  tpl_approved?: string;
  tpl_shipped?: string;
  tpl_cancel?: string;
  tpl_lowstock?: string;
}

export const DEFAULT_TEMPLATES = {
  tpl_new: 'Sayin {ad}, {no} numarali siparisiniz alindi. Tesekkur ederiz. {firma}',
  tpl_approved: 'Sayin {ad}, {no} numarali siparisiniz onaylandi. Tutar: {tutar} TL. {firma}',
  tpl_shipped: 'Sayin {ad}, {no} numarali siparisiniz kargoya verildi. {kargo} Takip No: {takip}',
  tpl_cancel: 'Sayin {ad}, {no} numarali siparisiniz iptal edilmistir. {firma}',
  tpl_lowstock: 'Sayin {ad}, {urun} {beden} urunu icin stok yetersiz oldugundan {no} numarali siparisiniz olusturulamadi. {firma}',
};

// NetGSM hata kodlari -> Turkce aciklama
const CODE_MSG: Record<string, string> = {
  '00': 'Gonderim basarili',
  '20': 'Mesaj metni hatali veya karakter sayisi limiti asildi',
  '30': 'Gecersiz kullanici adi/sifre ya da API erisim izni yok (IP/kullanici)',
  '40': 'Gonderici basligi (msgheader) sisteminizde tanimli degil',
  '50': 'Aboneliginiz IYS kontrollu hesaba uygun degil',
  '51': 'Aboneliginize tanimli bir IYS marka bilgisi bulunamadi',
  '70': 'Hatali veya eksik parametre',
  '80': 'Gonderim sinir asimi',
  '85': 'Mukerrer gonderim sinir asimi (ayni numaraya 1 dk icinde 20+)',
};

async function loadConfig(tenantId: string, requireCreds = true): Promise<NetgsmConfig> {
  const s = await prisma.integrationSetting.findFirst({ where: { scope: 'TENANT', tenantId, provider: 'netgsm' } });
  if (!s || !s.enabled) throw new ApiError(400, 'NetGSM entegrasyonu yapilandirilmamis veya pasif. Entegrasyonlar > SMS bolumunden bilgilerinizi girin.');
  const c: any = s.config || {};
  const cfg: NetgsmConfig = {
    usercode: (c.usercode || '').toString().trim(),
    password: (c.password || '').toString().trim(),
    msgheader: (c.msgheader || '').toString().trim(),
    notify_new: !!c.notify_new, notify_approved: !!c.notify_approved, notify_shipped: !!c.notify_shipped,
    notify_cancel: !!c.notify_cancel, notify_lowstock: !!c.notify_lowstock,
    tpl_new: c.tpl_new || DEFAULT_TEMPLATES.tpl_new,
    tpl_approved: c.tpl_approved || DEFAULT_TEMPLATES.tpl_approved,
    tpl_shipped: c.tpl_shipped || DEFAULT_TEMPLATES.tpl_shipped,
    tpl_cancel: c.tpl_cancel || DEFAULT_TEMPLATES.tpl_cancel,
    tpl_lowstock: c.tpl_lowstock || DEFAULT_TEMPLATES.tpl_lowstock,
  };
  if (requireCreds && (!cfg.usercode || !cfg.password || !cfg.msgheader)) {
    throw new ApiError(400, 'NetGSM kullanici kodu, sifre ve gonderici basligi (msgheader) zorunludur.');
  }
  return cfg;
}

// Tenant'in netgsm config'ini (gizli olmadan) dondur — ayar ekrani icin
export async function getNetgsmSettings(tenantId: string) {
  const s = await prisma.integrationSetting.findFirst({ where: { scope: 'TENANT', tenantId, provider: 'netgsm' } });
  const c: any = (s?.config as any) || {};
  return {
    enabled: !!s?.enabled,
    configured: !!(c.usercode && c.password && c.msgheader),
    msgheader: c.msgheader || '',
    notify_new: !!c.notify_new,
    notify_approved: !!c.notify_approved,
    notify_shipped: !!c.notify_shipped,
    notify_cancel: !!c.notify_cancel,
    notify_lowstock: !!c.notify_lowstock,
    tpl_new: c.tpl_new || DEFAULT_TEMPLATES.tpl_new,
    tpl_approved: c.tpl_approved || DEFAULT_TEMPLATES.tpl_approved,
    tpl_shipped: c.tpl_shipped || DEFAULT_TEMPLATES.tpl_shipped,
    tpl_cancel: c.tpl_cancel || DEFAULT_TEMPLATES.tpl_cancel,
    tpl_lowstock: c.tpl_lowstock || DEFAULT_TEMPLATES.tpl_lowstock,
  };
}

// Bildirim tercihlerini kaydet (kimlik bilgileri korunur)
export async function saveNetgsmPrefs(tenantId: string, prefs: Partial<NetgsmConfig>) {
  const existing = await prisma.integrationSetting.findFirst({ where: { scope: 'TENANT', tenantId, provider: 'netgsm' } });
  const cur: any = (existing?.config as any) || {};
  const keys: (keyof NetgsmConfig)[] = ['notify_new', 'notify_approved', 'notify_shipped', 'notify_cancel', 'notify_lowstock', 'tpl_new', 'tpl_approved', 'tpl_shipped', 'tpl_cancel', 'tpl_lowstock'];
  const merged: any = { ...cur };
  for (const k of keys) if (prefs[k] !== undefined) merged[k] = prefs[k];
  if (existing) {
    await prisma.integrationSetting.update({ where: { id: existing.id }, data: { config: merged } });
  } else {
    await prisma.integrationSetting.create({ data: { scope: 'TENANT', tenantId, provider: 'netgsm', enabled: false, mode: 'TEST', category: 'SMS', config: merged } });
  }
  return getNetgsmSettings(tenantId);
}

// Numarayi NetGSM formatina getir (5xxxxxxxxx -> 10 hane)
function normNo(raw: string): string | null {
  let d = (raw || '').replace(/\D/g, '');
  if (d.startsWith('90')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  if (d.length === 10 && d.startsWith('5')) return d;
  return null;
}

// IPv4'e zorlanmis HTTPS istegi (IPv6 takilmalarini onler)
function httpsReq(opts: { method: string; host: string; path: string; headers?: any; body?: string }): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { method: opts.method, host: opts.host, path: opts.path, family: 4, headers: opts.headers || {}, timeout: 15000 },
      (res) => { let data = ''; res.setEncoding('utf8'); res.on('data', (c) => { data += c; }); res.on('end', () => resolve({ status: res.statusCode || 0, text: data })); }
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('NetGSM zaman asimi')); });
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

export interface SmsResult { ok: boolean; sent: number; failed: number; code: string; jobid?: string; message: string; invalidNumbers: string[] }

// Toplu SMS gonder (REST v2 JSON)
export async function sendSms(tenantId: string, rawNumbers: string[], message: string): Promise<SmsResult> {
  const cfg = await loadConfig(tenantId, true);
  if (!message || !message.trim()) throw new ApiError(422, 'Mesaj metni bos olamaz.');
  const invalid: string[] = [];
  const valid: string[] = [];
  for (const n of rawNumbers || []) { const nn = normNo(n); if (nn) valid.push(nn); else if (n) invalid.push(n); }
  const uniq = [...new Set(valid)];
  if (!uniq.length) return { ok: false, sent: 0, failed: invalid.length, code: '70', message: 'Gecerli telefon numarasi yok.', invalidNumbers: invalid };

  const auth = Buffer.from(`${cfg.usercode}:${cfg.password}`).toString('base64');
  const body = JSON.stringify({
    msgheader: cfg.msgheader,
    encoding: 'TR',
    messages: uniq.map((no) => ({ msg: message, no })),
  });
  const r = await httpsReq({
    method: 'POST', host: 'api.netgsm.com.tr', path: '/sms/rest/v2/send',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}`, 'Content-Length': Buffer.byteLength(body) },
    body,
  });
  let j: any = null; try { j = JSON.parse(r.text); } catch { j = null; }
  const code = (j && (j.code ?? j.Code))?.toString() || (r.status === 200 ? '00' : String(r.status));
  const jobid = j && (j.jobid || j.jobID || j.JobID);
  const ok = code === '00';
  return {
    ok,
    sent: ok ? uniq.length : 0,
    failed: ok ? invalid.length : uniq.length + invalid.length,
    code,
    jobid: jobid ? String(jobid) : undefined,
    message: ok ? `${uniq.length} numaraya gonderildi.` : (CODE_MSG[code] || (j?.description || j?.message) || `Gonderilemedi (kod: ${code})`),
    invalidNumbers: invalid,
  };
}

// Kimlik dogrulama testi — REST v2 msgheader ucu (SMS gondermeden dogrular)
export async function checkNetgsm(tenantId: string): Promise<{ ok: boolean; balance?: string; message: string }> {
  const cfg = await loadConfig(tenantId, true);
  const auth = Buffer.from(`${cfg.usercode}:${cfg.password}`).toString('base64');
  try {
    const r = await httpsReq({
      method: 'GET', host: 'api.netgsm.com.tr', path: '/sms/rest/v2/msgheader',
      headers: { Authorization: `Basic ${auth}` },
    });
    let j: any = null; try { j = JSON.parse(r.text); } catch { j = null; }
    const code = (j && (j.code ?? j.Code))?.toString() || (r.status === 200 ? '00' : String(r.status));
    if (code !== '00') {
      return { ok: false, message: CODE_MSG[code] || (j?.description || `NetGSM kimlik dogrulama basarisiz (kod: ${code}).`) };
    }
    const headers: string[] = Array.isArray(j?.msgheaders) ? j.msgheaders : [];
    // Kayitli gonderici basligi sistemde tanimli mi?
    if (cfg.msgheader && headers.length && !headers.some((h) => (h || '').trim().toLowerCase() === cfg.msgheader.toLowerCase())) {
      return { ok: false, message: `Gonderici basligi "${cfg.msgheader}" sisteminizde tanimli degil. Tanimli basliklar: ${headers.join(', ')}` };
    }
    return {
      ok: true,
      balance: headers.length ? `Basliklar: ${headers.join(', ')}` : undefined,
      message: 'NetGSM baglantisi basarili.',
    };
  } catch (e: any) {
    return { ok: false, message: e?.message || 'NetGSM baglantisi kurulamadi.' };
  }
}

function renderTpl(tpl: string, vars: Record<string, string>): string {
  return (tpl || '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : ''));
}

// Siparis bildirimi gonder (sessiz: hata firlatmaz, sadece loglar)
export async function notifyOrderSms(
  tenantId: string,
  event: 'new' | 'approved' | 'shipped' | 'cancel' | 'lowstock',
  data: { phone?: string | null; ad?: string | null; no?: string; tutar?: number; kargo?: string; takip?: string; firma?: string; kullaniciadi?: string; durum?: string; beden?: string; urun?: string; instagram?: string }
): Promise<void> {
  try {
    if (!data.phone) return;
    const cfg = await loadConfig(tenantId, false).catch(() => null);
    if (!cfg) return;
    const enabledMap = { new: cfg.notify_new, approved: cfg.notify_approved, shipped: cfg.notify_shipped, cancel: cfg.notify_cancel, lowstock: cfg.notify_lowstock };
    if (!enabledMap[event]) return;
    if (!cfg.usercode || !cfg.password || !cfg.msgheader) return;
    const tplMap = { new: cfg.tpl_new, approved: cfg.tpl_approved, shipped: cfg.tpl_shipped, cancel: cfg.tpl_cancel, lowstock: cfg.tpl_lowstock };
    const msg = renderTpl(tplMap[event] || '', {
      ad: data.ad || 'Musterimiz',
      no: data.no || '',
      tutar: data.tutar != null ? Math.round(data.tutar).toLocaleString('tr-TR') : '',
      kargo: data.kargo || '',
      takip: data.takip || '',
      firma: data.firma || '',
      kullaniciadi: data.kullaniciadi || data.instagram || '',
      durum: data.durum || '',
      beden: data.beden || '',
      urun: data.urun || '',
      instagram: data.instagram || '',
    }).trim();
    if (!msg) return;
    await sendSms(tenantId, [data.phone], msg).catch((e) => console.error('[SMS notify]', String(e?.message || e)));
  } catch (e: any) {
    console.error('[SMS notify error]', String(e?.message || e));
  }
}
