import https from 'https';
import http from 'http';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../lib/http';

export type OdemeTipi = 'gonderici' | 'alici';

export interface GondericiBilgi { unvan: string; telefon: string; il: string; ilce: string; adres: string }
export interface AliciBilgi { ad: string; telefon: string; il: string; ilce: string; adres: string }

// HTTP veya HTTPS POST — protocol parametresine göre seçim yapar
function soapPost(protocol: 'http' | 'https', host: string, port: number, path: string, body: string, headers: Record<string, string>, timeoutMs = 20000): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const mod = protocol === 'https' ? https : http;
    const req = mod.request(
      { method: 'POST', host, port, path, family: 4, headers: { ...headers, 'Content-Length': Buffer.byteLength(body) }, timeout: timeoutMs },
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

// ───── Yurtiçi Kargo (KOPS SOAP) ─────
// Yurtiçi KOPS API HTTP kullanır: prod → port 8080, test → port 9090
function yurticiHostPort(cfg: any): { host: string; port: number } {
  if (cfg.host) {
    const raw = String(cfg.host).replace(/^https?:\/\//, '');
    const [h, p] = raw.split(':');
    return { host: h.replace(/\/.*$/, ''), port: p ? parseInt(p, 10) : 8080 };
  }
  const env = (cfg.env || 'prod').toLowerCase();
  return env === 'test'
    ? { host: 'testwebservices.yurticikargo.com', port: 9090 }
    : { host: 'webservices.yurticikargo.com', port: 8080 };
}

// Ödeme tipine göre 4 kimlikten doğrusunu seç:
//   Gönderici/Normal (GoN), Gönderici/Tahsilatlı (GoT), Alıcı/Normal (AoN), Alıcı/Tahsilatlı (AoT)
// Belirli kimlik tanımlı değilse genel ws_username/ws_password'e düşer.
function yurticiCreds(cfg: any, odeme: OdemeTipi, tahsilat: boolean): { user: string; pass: string; kargoTip: string } {
  const role = odeme === 'alici' ? 'Ao' : 'Go';
  const kind = tahsilat ? 'T' : 'N';
  const key = role + kind; // GoN | GoT | AoN | AoT
  const user = cfg['wsUser' + key] || cfg.ws_username || '';
  const pass = cfg['wsPass' + key] || cfg.ws_password || '';
  const kargoTip = `${odeme === 'alici' ? 'AÖ' : 'GÖ'}-${tahsilat ? 'T' : 'N'}`;
  return { user, pass, kargoTip };
}

async function yurticiCreateShipment(cfg: any, p: { cargoKey: string; alici: AliciBilgi; odeme: OdemeTipi; tahsilat?: boolean; codTutar?: number; desi: number; kg: number; aciklama?: string }): Promise<{ trackingNo: string; kargoTip: string }> {
  const { host, port } = yurticiHostPort(cfg);
  const path = '/KOPSWebServices/ShippingOrderDispatcherServices';
  const tahsilat = !!p.tahsilat;
  const { user, pass, kargoTip } = yurticiCreds(cfg, p.odeme, tahsilat);
  if (!user || !pass) throw new ApiError(400, 'Yurtiçi WS kullanıcı adı/şifre eksik.');
  const koliDesi = 1;
  const koliKg = 1;
  const sf1 = koliDesi + '$' + koliKg + '#';
  const odemeType = p.odeme === 'alici' ? '1' : '0';
  // Tahsilatlı (kapıda ödeme) gönderide tahsilat tutarı alanları
  const codXml = tahsilat && (p.codTutar || 0) > 0
    ? `<ttInvoiceAmount>${Math.round((p.codTutar || 0) * 100) / 100}</ttInvoiceAmount><ttDocumentId>${esc(p.cargoKey)}</ttDocumentId><ttCollectionType>0</ttCollectionType>`
    : '';
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="http://yurticikargo.com.tr/ShippingOrderDispatcherServices">` +
    `<soapenv:Header/><soapenv:Body><ser:createShipment>` +
    `<wsUserName>${esc(user)}</wsUserName>` +
    `<wsPassword>${esc(pass)}</wsPassword>` +
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
    codXml +
    `<specialField1>${sf1}</specialField1>` +
    `</ShippingOrderVO>` +
    `</ser:createShipment></soapenv:Body></soapenv:Envelope>`;
  const r = await soapPost('http', host, port, path, xml, { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '""' });
  const t = r.text || '';
  // Başarı: outFlag/errCode 0. Yurtiçi takip kodu olarak cargoKey kullanılır.
  const outFlag = (t.match(/<outFlag>([^<]*)<\/outFlag>/) || [])[1];
  const errCode = (t.match(/<errCode>([^<]*)<\/errCode>/) || [])[1];
  const errMsg = (t.match(/<errMessage>([^<]*)<\/errMessage>/) || [])[1] || (t.match(/<faultstring>([^<]*)<\/faultstring>/) || [])[1];
  const ok = (outFlag === '0') || (errCode === '0') || /success/i.test(t);
  if (!ok) {
    throw new ApiError(502, `Yurtiçi Kargo gönderi oluşturulamadı: ${errMsg || ('HTTP ' + r.status)}`);
  }
  // Takip no: Yurtiçi gerçek per-paket takip numarasını (cargoTrackingNumber) ancak gönderi
  // fiziksel olarak teslim alınıp taranınca üretir; createShipment cevabındaki jobId/docId
  // TÜM gönderilerde aynı olan sevkiyat parti no'sudur ve takip no DEĞİLDİR — kullanma.
  // Gerçek numara queryShipment (cargoKey ile) üzerinden sonradan otomatik çekilir.
  return { trackingNo: '', kargoTip };
}

export interface KargoHareket { tarih: string; durum: string; birim: string }
export interface KargoDurumSonuc { durum: string; teslim: boolean; hareketler: KargoHareket[]; trackingNumber?: string; operationStatus?: string; asama?: string; asamaLabel?: string; ucret?: number }

// Yurtiçi durum metni / operationStatus -> aşama kodu (5 durum)
//   hazirlaniyor: gönderi oluşturuldu, Yurtiçi henüz işleme almadı
//   kabul:        Yurtiçi barkodu işleme aldı / teslim aldı / aktarma / yolda
//   dagitim:      dağıtıma çıktı
//   teslim:       teslim edildi
//   teslim_edilemedi: adreste bulunamadı / iade / teslim edilemedi
export function kargoAsamaBelirle(opStatus: string, text: string): { asama: string; label: string } {
  const s = `${opStatus || ''} ${text || ''}`.toLocaleLowerCase('tr-TR');
  const has = (...k: string[]) => k.some((x) => s.includes(x));
  // 0) İade süreci (gönderici/şubeye geri dönüyor) — teslim_edilemedi'den ayrı
  if (has('iade', 'geri gönder', 'geri gonder', 'göndericiye', 'gondericiye', 'iadeye'))
    return { asama: 'iade', label: 'İade Sürecinde' };
  // 1) Teslim edilemedi (önce kontrol — "teslim edileme..." teslimle karışmasın)
  if (has('edilemedi', 'edileme', 'bulunamadı', 'bulunamadi', 'başarısız', 'basarisiz', 'reddedildi', 'kabul etmedi', 'hasarlı', 'hasarli', 'adres yetersiz', 'çıkmadı'))
    return { asama: 'teslim_edilemedi', label: 'Teslim Edilemedi' };
  // 2) Teslim edildi  ("Kargo teslim edilmiştir.")
  if (/\bdlv\b/i.test(opStatus) || has('teslim edil', 'teslim edilmiş', 'teslim edildi', 'delivered'))
    return { asama: 'teslim', label: 'Teslim Edildi' };
  // 3) Dağıtıma çıktı — YALNIZ açıkça dağıtım/kurye hareketi ("dağıtıma çıkmıştır", kurye dağıtımda)
  //    NOT: "Kargo Teslimattadır." dağıtım DEĞİLDİR; aşağıda Kargoya Verildi sayılır.
  if (has('dağıtıma çık', 'dagitima cik', 'dağıtıma cik', 'dagitima çik', 'dağıtımda', 'dagitimda', 'dağıtım için', 'kurye', 'out for delivery'))
    return { asama: 'dagitim', label: 'Dağıtıma Çıktı' };
  // 4) Kargoya verildi / yolda  ("Kargo Teslimattadır.", "Kargo Yüklendi", işlem görmüş, şube/transfer/aktarma/çıkış)
  if (has('teslimat', 'yüklendi', 'yuklendi', 'işlem görmüş', 'islem gormus', 'fatura', 'şube', 'sube', 'ulaşmış', 'ulasmis', 'ulaştı', 'ulasti', 'transfer', 'aktarma', 'çıkış', 'cikis', 'ayrıl', 'ayril', 'yola çık', 'yola cik', 'kabul', 'teslim alın', 'teslim alin', 'hareket', 'sevk', 'işleme alın', 'isleme alin'))
    return { asama: 'kabul', label: 'Kargoya Verildi' };
  // 5) İşlem görmemiş / kayıt bekleniyor -> hazırlanıyor
  return { asama: 'hazirlaniyor', label: 'Kargo Hazırlanıyor' };
}

// queryShipment: cargoKey ile güncel durum + hareketler
async function yurticiQueryShipment(cfg: any, cargoKey: string): Promise<KargoDurumSonuc> {
  const { host, port } = yurticiHostPort(cfg);
  // queryShipment, gonderi olusturma servisiyle ayni uctan calisir (ShippingOrderDispatcherServices)
  const path = '/KOPSWebServices/ShippingOrderDispatcherServices';
  const user = cfg.wsUserGoN || cfg.ws_username || '';
  const pass = cfg.wsPassGoN || cfg.ws_password || '';
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="http://yurticikargo.com.tr/ShippingOrderDispatcherServices">` +
    `<soapenv:Header/><soapenv:Body><ser:queryShipment>` +
    `<wsUserName>${esc(user)}</wsUserName>` +
    `<wsPassword>${esc(pass)}</wsPassword>` +
    `<wsLanguage>TR</wsLanguage>` +
    `<keys>${esc(cargoKey)}</keys>` +
    `<keyType>0</keyType>` +
    `<addHistoricalData>true</addHistoricalData>` +
    `<onlyTracking>false</onlyTracking>` +
    `</ser:queryShipment></soapenv:Body></soapenv:Envelope>`;
  const r = await soapPost('http', host, port, path, xml, { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '' });
  const t = r.text || '';
  const hareketler: KargoHareket[] = [];
  // Hareket gecmisi (kargo islem gordukce dolar)
  const re = /<(?:shippingDeliveryItemDetailVO|operationDetailVO)>([\s\S]*?)<\/(?:shippingDeliveryItemDetailVO|operationDetailVO)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const blk = m[1];
    const durum = (blk.match(/<operationMessage>([^<]*)<\/operationMessage>/) || blk.match(/<eventName>([^<]*)<\/eventName>/) || [])[1] || '';
    const tarih = (blk.match(/<operationDate>([^<]*)<\/operationDate>/) || blk.match(/<eventDate>([^<]*)<\/eventDate>/) || [])[1] || '';
    const birim = (blk.match(/<unitName>([^<]*)<\/unitName>/) || blk.match(/<operationCenter>([^<]*)<\/operationCenter>/) || [])[1] || '';
    if (durum || tarih) hareketler.push({ tarih, durum, birim });
  }
  // Guncel durum + gercek Yurtici kargo takip numarasi (islem gordukten sonra dolar)
  const detail = (t.match(/<shippingDeliveryDetailVO>([\s\S]*?)<\/shippingDeliveryDetailVO>/) || [])[1] || t;
  const opMsg = (detail.match(/<operationMessage>([^<]*)<\/operationMessage>/) || [])[1] || '';
  const opStatus = (detail.match(/<operationStatus>([^<]*)<\/operationStatus>/) || [])[1] || '';
  // Gerçek Yurtiçi takip numarası (AWB): docId alanı. Yurtiçi'nin kendi gönderi-sorgula
  // linki de bu docId'yi 'code' olarak kullanır. cargoTrackingNumber bu uçtan hiç dönmez.
  const docId = (t.match(/<docId>([^<]*)<\/docId>/) || [])[1] || '';
  const trackingNumber = (t.match(/<cargoTrackingNumber>([^<]*)<\/cargoTrackingNumber>/) || [])[1] || docId || '';
  const genel = opMsg || (hareketler.length ? hareketler[hareketler.length - 1].durum : '');
  // Yurtiçi tarafında oluşan kargo ücreti (sözleşmeli hesaplarda çoğunlukla boş döner)
  const ucretRaw = (detail.match(/<(?:amount|totalAmount|price|invoiceAmount|cargoAmount|ucret)>([^<]*)<\/(?:amount|totalAmount|price|invoiceAmount|cargoAmount|ucret)>/i) || [])[1] || '';
  const ucretNum = parseFloat(String(ucretRaw).replace(',', '.'));
  const ucret = isFinite(ucretNum) && ucretNum > 0 ? ucretNum : undefined;
  // Hata: outFlag != 0 ve hic veri yoksa outResult/faultstring mesaji
  const faultMsg = (t.match(/<faultstring>([^<]*)<\/faultstring>/) || [])[1];
  const outFlag = (t.match(/<outFlag>([^<]*)<\/outFlag>/) || [])[1];
  const outResult = (t.match(/<outResult>([^<]*)<\/outResult>/) || [])[1] || '';
  if (!genel && !hareketler.length && faultMsg) throw new ApiError(502, `Yurtiçi durum sorgusu başarısız: ${faultMsg}`);
  if (!genel && !hareketler.length && outFlag && outFlag !== '0') {
    const a = kargoAsamaBelirle(opStatus, outResult);
    return { durum: outResult || 'Kayıt bulunamadı', teslim: false, hareketler: [], operationStatus: opStatus || undefined, trackingNumber: trackingNumber || undefined, asama: a.asama, asamaLabel: a.label, ucret };
  }
  const a = kargoAsamaBelirle(opStatus, `${genel} ${hareketler.map((h) => h.durum).join(' ')}`);
  return { durum: genel || 'Bilgi bekleniyor', teslim: a.asama === 'teslim', hareketler, operationStatus: opStatus || undefined, trackingNumber: trackingNumber || undefined, asama: a.asama, asamaLabel: a.label, ucret };
}

// Tasiyici bazli gonderi olustur. manualTracking verilirse API cagrilmaz.
export async function createShipment(
  tenantId: string,
  p: { provider: string; cargoKey: string; alici: AliciBilgi; odeme: OdemeTipi; tahsilat?: boolean; codTutar?: number; desi: number; kg: number; aciklama?: string; manualTracking?: string }
): Promise<{ trackingNo: string; trackingUrl: string; manual: boolean; kargoTip?: string }> {
  // Manuel takip no -> dogrudan kaydet
  if (p.manualTracking && p.manualTracking.trim()) {
    return { trackingNo: p.manualTracking.trim(), trackingUrl: trackingUrl(p.provider, p.manualTracking.trim()), manual: true };
  }
  const cfg = await loadCarrier(tenantId, p.provider);
  // Kapida odeme (tahsilatli) entegrasyondan acilmadiysa gonderi tahsilatsiz olusturulur.
  const codAcik = cfg.kapidaOdeme === true || cfg.kapidaOdeme === 'true' || cfg.kapidaOdeme === 1 || cfg.kapidaOdeme === '1';
  if (!codAcik) { p.tahsilat = false; p.codTutar = 0; }
  if (p.provider === 'yurtici') {
    const res = await yurticiCreateShipment(cfg, p);
    return { trackingNo: res.trackingNo, trackingUrl: trackingUrl('yurtici', res.trackingNo), manual: false, kargoTip: res.kargoTip };
  }
  // Diğer firmalar için otomatik API henüz yok -> manuel takip no ile devam edilmeli
  throw new ApiError(400, 'Bu kargo firması için otomatik gönderi henüz desteklenmiyor. Lütfen "Manuel takip no" girerek devam edin.');
}

// Kargo durumu sorgula (şu an yalnız Yurtiçi otomatik). cargoKey -> güncel durum + hareketler.
export async function queryShipment(tenantId: string, provider: string, cargoKey: string): Promise<KargoDurumSonuc> {
  const cfg = await loadCarrier(tenantId, provider);
  if (provider === 'yurtici') return yurticiQueryShipment(cfg, cargoKey);
  throw new ApiError(400, 'Bu kargo firması için otomatik durum sorgusu desteklenmiyor.');
}
