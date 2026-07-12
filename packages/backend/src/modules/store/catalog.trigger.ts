import { prisma } from '../../lib/prisma';
import { env } from '../../config/env';
import * as crypto from 'crypto';

/**
 * Katalog sipariş tetikleyicileri
 * - WhatsApp mesajından talepNo tespiti → sipariş başlatma + StoreOrder oluşturma + stok düşme
 * - Medya (dekont) tespiti
 * - Kredi kartı talebi tespiti
 * - İptal → stok iadesi
 */

// Sipariş onay mesajının en altına eklenen sabit ödeme/IBAN bilgisi
const IBAN_ODEME_BLOGU =
  '\n\n———\n' +
  'IBAN: TR94 0006 4000 0018 3201 8607 89\n' +
  'Banka: İş Bankası\n' +
  'Ad: RAHAT REKLAM SANAYİ TİCARET LİMİTED ŞİRKETİ\n' +
  "Açıklama: Sipariş numaranızı yazarak 'ürün alım bedeli' yazınız.";

/**
 * Meta Conversions API (server-side) ile 'Purchase' olayı gönderir.
 * - Tarayıcıdan bağımsız çalışır → client-side fbq'nun kaçırdığı dönüşümleri KESİN sayar.
 * - Pixel ID: StoreSetting.config.metaPixel (virgülle çoklu ise İLK id kullanılır).
 * - Access token: StoreSetting.config.metaCapiToken (panelden girilir).
 * - Token veya pixel yoksa SESSİZCE atlar (talep akışını asla bozmaz).
 */
async function sendMetaPurchaseCapi(
  tenantId: string,
  params: { value: number; talepNo: string; phone?: string | null; currency?: string },
) {
  try {
    const ss = await prisma.storeSetting.findUnique({
      where: { tenantId },
      select: { config: true },
    });
    const cfg: any = (ss?.config as any) || {};
    // metaPixel virgülle çoklu olabilir → ilk geçerli ID
    const pixelId = String(cfg.metaPixel || '').split(',').map((s: string) => s.trim()).filter(Boolean)[0];
    const token = String(cfg.metaCapiToken || '').trim();
    if (!pixelId || !token) return; // ayar yok → sessiz atla

    const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');
    // Telefonu Meta formatına normalize et (90XXXXXXXXXX), sonra hashle
    const user_data: Record<string, any> = {};
    const phDigits = (params.phone || '').replace(/\D/g, '');
    if (phDigits.length >= 10) {
      const norm = phDigits.length === 10 ? '90' + phDigits
        : phDigits.length === 11 && phDigits.startsWith('0') ? '9' + phDigits
        : phDigits;
      user_data.ph = [sha256(norm)];
    }

    const body = {
      data: [
        {
          event_name: 'Purchase',
          event_time: Math.floor(Date.now() / 1000),
          action_source: 'website',
          // Dedup için event_id = talepNo (client Purchase kaldırıldığı için tekil kaynak, yine de tutarlı)
          event_id: `talep_${params.talepNo}`,
          user_data,
          custom_data: {
            currency: params.currency || 'TRY',
            value: Number(params.value) || 0,
          },
        },
      ],
    };

    const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(token)}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      console.warn('[MetaCAPI] Purchase gönderilemedi:', resp.status, txt.slice(0, 300));
    }
  } catch (e: any) {
    // CAPI hatası talep akışını asla bozmasın
    console.warn('[MetaCAPI] Purchase hata:', e?.message || e);
  }
}

function normalizePhone(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length === 10) return '90' + digits;
  if (digits.length === 11 && digits.startsWith('0')) return '9' + digits;
  if (digits.startsWith('90') && digits.length >= 12) return digits;
  return digits;
}

async function enqueueWaMessage(tenantId: string, phone: string, body: string) {
  const customerPhone = normalizePhone(phone);
  if (customerPhone.length < 10) return;
  await prisma.whatsappOutbox.create({
    data: { tenantId, lineId: null, customerPhone, body, kind: 'auto', status: 'pending' },
  });
}

function fillTemplate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }
  return result;
}

// sipNo üretici (store.routes.ts'deki ile aynı mantık)
const SIP_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
async function generateSipNo(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = 'L';
    for (let i = 0; i < 6; i++) code += SIP_CHARS[Math.floor(Math.random() * SIP_CHARS.length)];
    const exists = await prisma.storeOrder.findFirst({ where: { sipNo: code } });
    if (!exists) return code;
  }
  throw new Error('Benzersiz sipariş no üretilemedi');
}

async function nextOrderNo(tenantId: string): Promise<{ orderNo: number; orderYil: number }> {
  const yil = new Date().getFullYear();
  const t = await prisma.tenant.findUnique({ where: { id: tenantId } });
  let seqNo = (t?.seqNo || 0);
  if ((t?.seqYil || 0) !== yil) seqNo = 0;
  seqNo += 1;
  await prisma.tenant.update({ where: { id: tenantId }, data: { seqNo, seqYil: yil } });
  return { orderNo: seqNo, orderYil: yil };
}

export function extractTalepNo(text: string): string | null {
  const match = text.match(/Talep\s+No[:\s]*\*?([A-Z0-9]{7,8})\*?/i);
  return match ? match[1].toUpperCase() : null;
}

export function isCardPaymentRequest(text: string): boolean {
  return /kart|kredi|k\.kart|kartla|karttan|kartım|kart\s*ile|credit\s*card/i.test((text || '').toLowerCase());
}

/**
 * Stok düşme: ürün ve varyasyon stoklarını düşür, item'lara stokDusuldu: true ekle
 */
async function deductStock(tenantId: string, items: any[]): Promise<any[]> {
  const updatedItems: any[] = [];
  for (const it of items) {
    const adet = Number(it.adet) || 1;
    const productId = it.productId;
    if (!productId) { updatedItems.push({ ...it, stokDusuldu: false }); continue; }

    const product = await prisma.product.findFirst({ where: { id: productId, tenantId } });
    if (!product) { updatedItems.push({ ...it, stokDusuldu: false }); continue; }

    // Varyasyonlu stok düşme
    let dusuldu = false;
    if (it.varyasyon) {
      const v = await prisma.productVariation.findFirst({ where: { productId, tenantId, deger: it.varyasyon } });
      if (v && v.stok >= adet) {
        await prisma.productVariation.update({ where: { id: v.id }, data: { stok: { decrement: adet } } });
        dusuldu = true;
      }
    }
    // Ana ürün stoğunu düş
    if ((product.stokAdeti || 0) >= adet) {
      await prisma.product.update({ where: { id: productId }, data: { stokAdeti: { decrement: adet } } });
      dusuldu = true;
    }
    // stokDusuldu flag'i GERÇEK duruma göre: iptal edilince returnStock sadece
    // gerçekten düşülen kalemleri geri yükler (yetersiz stokta yanlış iade önlenir).
    updatedItems.push({ ...it, stokDusuldu: dusuldu });
  }
  return updatedItems;
}

/**
 * Stok iadesi: iptal edilen siparişin stoklarını geri yükle
 */
async function returnStock(tenantId: string, items: any[]): Promise<void> {
  for (const it of items || []) {
    if (!it?.stokDusuldu) continue;
    const adet = Number(it.adet) || 1;
    if (it.productId) {
      if (it.varyasyon) {
        const v = await prisma.productVariation.findFirst({ where: { productId: it.productId, tenantId, deger: it.varyasyon } });
        if (v) await prisma.productVariation.update({ where: { id: v.id }, data: { stok: { increment: adet } } });
      }
      await prisma.product.updateMany({ where: { id: it.productId, tenantId }, data: { stokAdeti: { increment: adet } } });
    }
  }
}

// Şablon değişkenleri oluştur
function buildTemplateVars(request: any, extra: Record<string, string> = {}): Record<string, string> {
  const items = Array.isArray(request.items) ? request.items as any[] : [];
  const urunler = items.map((it: any) => `• ${it.ad || it.urunAd || '-'}${it.varyasyon ? ' (' + it.varyasyon + ')' : ''} x${it.adet || 1}`).join('\n');
  // request.toplam zaten indirim düşülmüş net tutardır
  const netToplam = Number(request.toplam) || 0;
  const indirimTutar = Number(request.indirim) || 0;
  const araToplam = netToplam + indirimTutar; // indirim öncesi ham tutar
  return {
    talepNo: request.talepNo,
    sipNo: request.sepetSipNo || '',
    musteri: request.musteri || '-',
    araToplam: araToplam.toLocaleString('tr-TR') + '₺',
    indirim: indirimTutar > 0 ? indirimTutar.toLocaleString('tr-TR') + '₺' : '0₺',
    toplam: netToplam.toLocaleString('tr-TR') + '₺',
    urunler,
    kalanDk: '0',
    sepetLink: request.sepetToken ? `${env.APP_DOMAIN || 'https://panel.diljar.com'}/sepet/${request.sepetToken}` : '',
    ...extra,
  };
}

/**
 * WhatsApp mesajı geldiğinde çağrılır: talepNo bulunmuşsa siparişi tetikle
 * 1. CatalogRequest güncelle (wpIletildi: true, müşteri eşleştir, rezerv başlat)
 * 2. StoreOrder oluştur (sepet — /sepet/{token} ile erişilebilir)
 * 3. Stok düş
 * 4. Onay mesajı gönder (sepet linki dahil)
 */
export async function catalogOrderTrigger(
  tenantId: string,
  talepNo: string,
  customerPhone: string,
  messageId: string,
) {
  const request = await prisma.catalogRequest.findFirst({
    where: { talepNo, wpIletildi: false, durum: { in: ['beklemede', 'rezervde', 'odeme_bekliyor'] } },
  });
  if (!request) return null;

  const setting = await prisma.catalogSetting.findUnique({ where: { tenantId: request.tenantId } });
  const rezervDk = setting?.rezervSureDk || 14;
  const now = new Date();
  // Online mağaza kaynaklı talep mi? (catalogId:'online') → StoreOrder kanalı 'online' olur
  // ki panelde "Online Mağaza Satışları" sekmesinde ve OnlineMagaza dashboard'unda görünsün.
  const isOnline = (request as any).catalogId === 'online';

  // Müşteri eşleştir — önce telKey (son 10 hane), sonra telefon varyantları
  const normalizedPhone = normalizePhone(customerPhone);
  const phoneVariants = [normalizedPhone, normalizedPhone.replace(/^90/, '0'), normalizedPhone.slice(2)];
  const tKey = (customerPhone || '').replace(/\D/g, '').slice(-10);
  let customer = tKey.length === 10
    ? await prisma.customer.findFirst({
        where: { tenantId: request.tenantId, telKey: tKey },
        select: { id: true, ad: true, instagram: true },
      })
    : null;
  if (!customer) {
    customer = await prisma.customer.findFirst({
      where: { tenantId: request.tenantId, telefon: { in: phoneVariants } },
      select: { id: true, ad: true, instagram: true },
    });
  }

  // Stok düş
  const rawItems = Array.isArray(request.items) ? request.items as any[] : [];
  const itemsWithStock = await deductStock(request.tenantId, rawItems);

  // Kayıtlı müşterinin açık sepeti (durum: 'sepet') var mı? Varsa onun üzerinden devam et.
  const openOrder = customer?.id
    ? await prisma.storeOrder.findFirst({
        where: { tenantId: request.tenantId, customerId: customer.id, durum: 'sepet' },
        orderBy: { createdAt: 'desc' },
      })
    : null;

  let order: any;
  let token: string;
  let sipNo: string;

  if (openOrder) {
    // Mevcut açık sepete katalog ürünlerini ekle
    const existingItems: any[] = Array.isArray(openOrder.items) ? (openOrder.items as any[]) : [];
    const mergedItems = [...existingItems, ...itemsWithStock];
    const ekAraToplam = (request.toplam || 0) + (request.indirim || 0);
    token = openOrder.token || crypto.randomBytes(18).toString('base64url');
    sipNo = openOrder.sipNo || (await generateSipNo());
    order = await prisma.storeOrder.update({
      where: { id: openOrder.id },
      data: {
        items: mergedItems,
        araToplam: (openOrder.araToplam || 0) + ekAraToplam,
        indirim: (openOrder.indirim || 0) + (request.indirim || 0),
        toplam: (openOrder.toplam || 0) + (request.toplam || 0),
        musteriHandle: customer?.ad || openOrder.musteriHandle || request.musteri || null,
        not: `${openOrder.not ? openOrder.not + ' | ' : ''}Katalog talebi: ${request.talepNo}`,
      },
    });
  } else {
    // Yeni sepet oluştur
    token = crypto.randomBytes(18).toString('base64url');
    sipNo = await generateSipNo();
    const seq = await nextOrderNo(request.tenantId);

    order = await prisma.storeOrder.create({
      data: {
        tenantId: request.tenantId,
        ...seq,
        sipNo,
        token,
        kanal: isOnline ? 'online' : 'katalog',
        durum: 'sepet',
        customerId: customer?.id || null,
        musteriHandle: customer?.ad || request.musteri || null,
        items: itemsWithStock,
        araToplam: (request.toplam || 0) + (request.indirim || 0),
        indirim: request.indirim || 0,
        indirimKodu: request.kuponKodu || null,
        toplam: request.toplam || 0,
        not: `${isOnline ? 'Online mağaza talebi' : 'Katalog talebi'}: ${request.talepNo}`,
      },
    });
  }

  // CatalogRequest güncelle
  const updated = await prisma.catalogRequest.update({
    where: { id: request.id },
    data: {
      wpIletildi: true,
      wpMesajId: messageId,
      durum: 'odeme_bekliyor',
      rezervBitis: new Date(now.getTime() + rezervDk * 60000),
      hatirlatmaSayisi: 0,
      orderId: order.id,
      sepetToken: token,
      sepetSipNo: sipNo,
      ...(customer ? { customerId: customer.id } : {}),
    },
  });

  // Online mağaza talebi StoreOrder'a döndü → Meta Conversions API 'Purchase' (server-side, KESİN sayar).
  // Token/pixel yoksa sessiz atlar; hata talep akışını bozmaz.
  if (isOnline) {
    await sendMetaPurchaseCapi(request.tenantId, {
      value: request.toplam || 0,
      talepNo: request.talepNo,
      phone: request.telefon,
      currency: 'TRY',
    });
  }

  // Sepet linki
  const sepetLink = `${env.APP_DOMAIN || 'https://panel.diljar.com'}/sepet/${token}`;

  // Onay mesajı gönder (ayarlardan şablon okunur)
  if (setting?.bildirimAktif !== false && request.telefon) {
    const vars = buildTemplateVars(request, {
      sipNo,
      kalanDk: String(rezervDk),
      sepetLink,
      musteri: request.musteri || customer?.ad || '-',
    });

    const defaultMsg = `✅ Siparişiniz alındı!\n\n🔢 Talep No: *{talepNo}*\n🛒 Sipariş No: *{sipNo}*\n👤 {musteri}\n💰 Toplam: *{toplam}*\n\n📦 Ürünler:\n{urunler}\n\n🔗 Sepet Detayı: {sepetLink}\n\n⏱️ Ödeme süresi: {kalanDk} dakika\n\n💳 Ödemenizi tamamladıktan sonra dekontunuzu bu sohbetten paylaşınız.\n\n⚠️ Süre dolduğunda ödeme yapılmamışsa siparişiniz otomatik iptal edilir.`;
    const template = setting?.siparisOnayMesaji || defaultMsg;
    const msg = fillTemplate(template, vars) + IBAN_ODEME_BLOGU;

    await enqueueWaMessage(request.tenantId, request.telefon, msg);
  }

  return updated;
}

/**
 * Aktif talebi olan müşteriden medya (dekont) geldiğinde çağrılır
 * - dekontAlindi: true
 * - Sayaç durur (rezervBitis: null)
 * - Otomatik yanıt gönderilir (ayarlardan şablon)
 */
export async function catalogMediaReceived(tenantId: string, customerPhone: string) {
  const normalizedPhone = normalizePhone(customerPhone);
  const phoneVariants = [normalizedPhone, normalizedPhone.replace(/^90/, '0'), normalizedPhone.slice(2)];

  const request = await prisma.catalogRequest.findFirst({
    where: {
      tenantId,
      telefon: { in: phoneVariants },
      wpIletildi: true,
      dekontAlindi: false,
      durum: { in: ['rezervde', 'odeme_bekliyor'] },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (!request) return null;

  // Dekont alındı + sayaç durdur
  const updated = await prisma.catalogRequest.update({
    where: { id: request.id },
    data: {
      dekontAlindi: true,
      dekontZamani: new Date(),
      rezervBitis: null, // Sayaç dursun
      durum: 'odeme_bekliyor',
    },
  });

  // Otomatik yanıt gönder (ayarlardan şablon)
  if (request.telefon) {
    const setting = await prisma.catalogSetting.findUnique({ where: { tenantId } });
    const defaultMsg = `✅ Ödeme bilginiz alınmıştır.\n\n🔢 Talep No: *{talepNo}*\n\nEn kısa sürede müşteri temsilcimiz ödemenizi kontrol edecek ve size dönüş yapacaktır.\n\nLütfen bekleyiniz.`;
    const template = (setting as any)?.dekontAlindiMesaji || defaultMsg;
    const vars = buildTemplateVars(request);
    const msg = fillTemplate(template, vars);
    await enqueueWaMessage(tenantId, request.telefon, msg);
  }

  return updated;
}

/**
 * Kredi kartı talebi geldiğinde çağrılır — sayaç durur
 */
export async function catalogCardPaymentRequested(tenantId: string, customerPhone: string) {
  const normalizedPhone = normalizePhone(customerPhone);
  const phoneVariants = [normalizedPhone, normalizedPhone.replace(/^90/, '0'), normalizedPhone.slice(2)];

  const request = await prisma.catalogRequest.findFirst({
    where: {
      tenantId,
      telefon: { in: phoneVariants },
      wpIletildi: true,
      kartOdeme: false,
      durum: { in: ['rezervde', 'odeme_bekliyor'] },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (!request) return null;

  const updated = await prisma.catalogRequest.update({
    where: { id: request.id },
    data: { kartOdeme: true, rezervBitis: null },
  });

  const setting = await prisma.catalogSetting.findUnique({ where: { tenantId } });
  if (setting?.bildirimAktif !== false && request.telefon) {
    const defaultMsg = `💳 Kredi kartı ile ödeme talebiniz alınmıştır.\n\n🔢 Talep No: *{talepNo}*\n💰 Toplam: *{toplam}*\n\nYetkilimiz en kısa sürede sizinle iletişime geçecektir. Siparişiniz rezerve edilmiştir ve süre sayacı durdurulmuştur.\n\nLütfen bekleyiniz.`;
    const template = (setting as any)?.kartOdemeMesaji || defaultMsg;
    const vars = buildTemplateVars(request);
    const msg = fillTemplate(template, vars);
    await enqueueWaMessage(tenantId, request.telefon, msg);
  }

  return updated;
}

/**
 * CatalogRequest iptal edildiğinde bağlı StoreOrder'u da iptal et + stok iade et
 */
export async function cancelLinkedOrder(orderId: string | null) {
  if (!orderId) return;
  const order = await prisma.storeOrder.findFirst({ where: { id: orderId } }).catch(() => null);
  if (!order || order.durum === 'iptal') return;

  // Stok iade et
  const items: any[] = Array.isArray(order.items) ? (order.items as any[]) : [];
  await returnStock(order.tenantId, items);

  // StoreOrder iptal
  await prisma.storeOrder.update({
    where: { id: orderId },
    data: { durum: 'iptal' },
  }).catch(() => null);
}
