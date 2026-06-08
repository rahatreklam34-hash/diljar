import https from 'https';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../lib/http';

export type OdemeTipi = 'gonderici' | 'alici';

export interface GondericiBilgi { unvan: string; telefon: string; il: string; ilce: string; adres: string }
export interface AliciBilgi { ad: string; telefon: string; il: string; ilce: string; adres: string }

// IPv4'e zorlanmis HTTPS POST (IPv6 takilmalarini onler)
function httpsPost(host: string, path: string, body: string, headers: Record<string, string>, timeoutMs = 20000): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { method: 'POST', host, path, family: 4, headers: { ...headers, 'Content-Length': Buffer.byteLength(body) }, timeout: timeoutMs },
      (res) => { let d = ''; res.setEncoding('utf8'); res.on('data', (c) => { d += c; }); res.on('end', () => resolve({ status: res.statusCode || 0, text: d })); }
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('Kargo servisi zaman asimi')); });
    req.write(body);
    req.end();
  });
}

function esc(s: string): string {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function getGonderici(tenantId: string): Promise<GondericiBilgi | null> {
  const s = await prisma.integrationSetting.findFirst({ where: { scope: 'TENANT', tenantId, provider: 'gonderici' } });
  const c: any = s?.config || {};
  if (!c.unvan && !c.adres) return null;
  return { unvan: c.unvan || '', telefon: c.telefon || '', il: c.il || '', ilce: c.ilce || '', adres: c.adres || '' };
}

async function loadCarrier(tenantId: string, provider: string): Promise<any> {
  const s = await prisma.integrationSetting.findFirst({ where: { scope: 'TENANT', tenantId, provider } });
  if (!s || !s.enabled) throw new ApiError(400, `${provider} kargo entegrasyonu yapilandirilmamis veya pasif.`);
  return s.config || {};
}

// Tasiyiciya gore takip (sorgu) linki
export function trackingUrl(provider: string, no: string): string {
  const n = encodeURIComponent(no || '');
  switch (provider) {
    case 'yurtici': return `https://www.yurticikargo.com/tr/online-servisler/gonderi-sorgula?code=${n}`;
    case 'aras': return `https://kargotakip.araskargo.com.tr/?gonderitakipno=${n}`;
    case 'surat': return `https://www.suratkargo.com.tr/KargoTakip/?kargotakipno=${n}`;
    case 'mng': return `https://service.mngkargo.com.tr/ionline/MNGTakip.aspx?takipNo=${n}`;
    case 'ptt': return `https://gonderitakip.ptt.gov.tr/Track/Verify?q=${n}`;
    default: return '';
  }
}

// ───── Yurtiçi Kargo (KOPS SOAP) createShipment ─────
async function yurticiCreateShipment(cfg: any, p: { cargoKey: string; alici: AliciBilgi; odeme: OdemeTipi; desi: number; kg: number; aciklama?: string }): Promise<{ trackingNo: string }> {
  const env = (cfg.env || 'prod').toLowerCase();
  const host = env === 'test' ? 'testwebservices.yurticikargo.com' : 'webservices.yurticikargo.com';
  const path = '/KOPSWebServices/ShippingOrderDispatcherServices';
  // ödemeType: 0 = gönderici ödemeli, 1 = alıcı ödemeli (anlaşmaya göre)
  const odemeType = p.odeme === 'alici' ? '1' : '0';
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="http://service.ws.yurtici.com/">` +
    `<soapenv:Header/><soapenv:Body><ser:createShipment>` +
    `<wsUserName>${esc(cfg.ws_username)}</wsUserName>` +
    `<wsPassword>${esc(cfg.ws_password)}</wsPassword>` +
    `<userLanguage>TR</userLanguage>` +
    `<ShippingOrderVO>` +
    `<cargoKey>${esc(p.cargoKey)}</cargoKey>` +
    `<invoiceKey>${esc(p.cargoKey)}</invoiceKey>` +
    `<receiverCustName>${esc(p.alici.ad)}</receiverCustName>` +
    `<receiverAddress>${esc(p.alici.adres)}</receiverAddress>` +
    `<cityName>${esc(p.alici.il)}</cityName>` +
    `<townName>${esc(p.alici.ilce)}</townName>` +
    `<receiverPhone1>${esc((p.alici.telefon || '').replace(/\D/g, ''))}</receiverPhone1>` +
    `<emailAddress></emailAddress>` +
    `<desi>${Math.max(1, Math.round(p.desi || 1))}</desi>` +
    `<kg>${Math.max(1, Math.round(p.kg || 1))}</kg>` +
    `<cargoCount>1</cargoCount>` +
    `<paymentType>${odemeType}</paymentType>` +
    `<specialField1>${esc(p.aciklama || '')}</specialField1>` +
    `</ShippingOrderVO>` +
    `</ser:createShipment></soapenv:Body></soapenv:Envelope>`;
  const r = await httpsPost(host, path, xml, { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '""' });
  const t = r.text || '';
  // Başarı: outFlag/errCode 0. Yurtiçi takip kodu olarak cargoKey kullanılır.
  const outFlag = (t.match(/<outFlag>([^<]*)<\/outFlag>/) || [])[1];
  const errCode = (t.match(/<errCode>([^<]*)<\/errCode>/) || [])[1];
  const errMsg = (t.match(/<errMessage>([^<]*)<\/errMessage>/) || [])[1] || (t.match(/<faultstring>([^<]*)<\/faultstring>/) || [])[1];
  const ok = (outFlag === '0') || (errCode === '0') || /success/i.test(t);
  if (!ok) {
    throw new ApiError(502, `Yurtiçi Kargo gönderi oluşturulamadı: ${errMsg || ('HTTP ' + r.status)}`);
  }
  // Takip no: dönen docId/jobId varsa onu, yoksa cargoKey
  const docId = (t.match(/<jobId>([^<]*)<\/jobId>/) || [])[1] || (t.match(/<docId>([^<]*)<\/docId>/) || [])[1];
  return { trackingNo: docId || p.cargoKey };
}

// Tasiyici bazli gonderi olustur. manualTracking verilirse API cagrilmaz.
export async function createShipment(
  tenantId: string,
  p: { provider: string; cargoKey: string; alici: AliciBilgi; odeme: OdemeTipi; desi: number; kg: number; aciklama?: string; manualTracking?: string }
): Promise<{ trackingNo: string; trackingUrl: string; manual: boolean }> {
  // Manuel takip no -> dogrudan kaydet
  if (p.manualTracking && p.manualTracking.trim()) {
    return { trackingNo: p.manualTracking.trim(), trackingUrl: trackingUrl(p.provider, p.manualTracking.trim()), manual: true };
  }
  const cfg = await loadCarrier(tenantId, p.provider);
  if (p.provider === 'yurtici') {
    if (!cfg.ws_username || !cfg.ws_password) throw new ApiError(400, 'Yurtiçi WS kullanıcı adı/şifre eksik.');
    const res = await yurticiCreateShipment(cfg, p);
    return { trackingNo: res.trackingNo, trackingUrl: trackingUrl('yurtici', res.trackingNo), manual: false };
  }
  // Diğer firmalar için otomatik API henüz yok -> manuel takip no ile devam edilmeli
  throw new ApiError(400, 'Bu kargo firması için otomatik gönderi henüz desteklenmiyor. Lütfen "Manuel takip no" girerek devam edin.');
}
