import { prisma } from '../../lib/prisma';
import { nextOrderNo } from '../store/store.routes';

const norm = (s: string) => (s || '').toLowerCase().replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/^@/, '').trim();
const genToken = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
const tl = (n: number) => (n || 0).toLocaleString('tr-TR') + '₺';
const recompute = (items: any[], indirim = 0, kargo = 0) => { const ara = items.reduce((s, it) => s + (Number(it.fiyat) || 0) * (Number(it.adet) || 1), 0); return { araToplam: ara, toplam: Math.max(0, ara - indirim + kargo) }; };
const MODIFIABLE = new Set(['sepet', 'yeni']);

export interface ToolCtx { tenantId: string; session: { musteriAd?: string | null; instagram?: string | null; telefon?: string | null }; appOrigin: string; cartToken?: string | null; }

async function resolveCustomer(tenantId: string, session: ToolCtx['session']) {
  const ig = norm(session.instagram || ''); const tel = (session.telefon || '').replace(/\D/g, ''); const ad = norm(session.musteriAd || '');
  const list = await prisma.customer.findMany({ where: { tenantId } });
  let c = list.find((x) => (ig && norm(x.instagram || '') === ig) || (tel.length >= 7 && (x.telefon || '').replace(/\D/g, '') === tel) || (ad && norm(x.ad || '') === ad)) || null;
  if (!c) {
    const count = await prisma.customer.count({ where: { tenantId } });
    c = await prisma.customer.create({ data: { tenantId, musteriNo: 1000 + count + 1, ad: session.musteriAd || session.instagram || session.telefon || 'Sohbet Müşterisi', instagram: session.instagram || null, telefon: session.telefon || null, not: 'Asistan sohbeti' } });
  }
  return c;
}

async function getBotCart(ctx: ToolCtx) {
  const tenantId = ctx.tenantId;
  // Sepet linkinden gelindiyse mevcut sepeti kullan (yeni sepet açma)
  if (ctx.cartToken) {
    const existing = await prisma.storeOrder.findFirst({ where: { token: ctx.cartToken, tenantId } });
    if (existing && MODIFIABLE.has(existing.durum)) return existing;
  }
  const customer = await resolveCustomer(tenantId, ctx.session);
  let cart = await prisma.storeOrder.findFirst({ where: { tenantId, customerId: customer.id, botSatis: true, durum: 'sepet' }, orderBy: { createdAt: 'desc' } });
  if (!cart) {
    const seq = await nextOrderNo(prisma, tenantId);
    cart = await prisma.storeOrder.create({ data: { tenantId, ...seq, customerId: customer.id, botSatis: true, kanal: 'asistan', durum: 'sepet', token: genToken(), items: [], araToplam: 0, indirim: 0, toplam: 0 } });
  }
  return cart;
}

const SIZE_WORDS = new Set(['xs', 's', 'm', 'l', 'xl', 'xxl', 'xxxl', '2xl', '3xl', 'small', 'medium', 'large', 'beden', 'numara', 'no']);
const STOP = new Set(['bana', 'yaz', 'yazar', 'misin', 'lutfen', 'rica', 'ederim', 'urun', 'urunun', 'urunden', 'adet', 'tane', 'bir', 'kodlu', 'kodu', 'kod', 'fiyat', 'fiyati', 'stok', 'var', 'mi', 'ekle', 'sepete', 'istiyorum', 'alabilir', 've', 'ile', 'icin', 'beden', 'bedeni', 'numara', 'rengi', 'renk']);

function matchProduct(products: any[], q: string) {
  const n = norm(q);
  // 1) kod/sku/barkod token eşleşmesi
  const tokens = n.split(/[\s,.;]+/).filter(Boolean);
  for (const tok of tokens) {
    if (tok.length < 2) continue;
    const p = products.find((x) => [x.salesCode, x.sku, x.barkod].some((c) => c && norm(c) === tok));
    if (p) return p;
  }
  // 2) kod/sku query içinde geçiyor mu
  let p = products.find((x) => [x.salesCode, x.sku, x.barkod].some((c) => c && c.length >= 3 && n.includes(norm(c))));
  if (p) return p;
  // 3) ad kelime örtüşmesi (beden/stop kelimeleri çıkar)
  const words = tokens.filter((w) => w.length > 2 && !SIZE_WORDS.has(w) && !STOP.has(w));
  let best: any = null; let bestScore = 0;
  for (const x of products) {
    const an = norm(x.ad);
    const anWords = an.split(/\s+/).filter(Boolean);
    let score = 0;
    if (n.includes(an) && an.length > 2) score += 6;
    for (const w of words) { if (an.includes(w)) score += 1; if (anWords.some((aw: string) => aw.startsWith(w) || w.startsWith(aw))) score += 0.5; }
    if (score > bestScore) { bestScore = score; best = x; }
  }
  return bestScore >= 1 ? best : null;
}

function extractBeden(q: string): string {
  const n = norm(q);
  const m = n.match(/\b(xs|xxl|xxxl|2xl|3xl|xl|s|m|l)\b/);
  if (m) return m[1].toUpperCase();
  const num = n.match(/\b(3[0-9]|4[0-9]|5[0-5])\b/); // 30-55 numara
  return num ? num[1] : '';
}

// OpenAI tool tanımları
export const TOOL_DEFS = [
  { type: 'function', function: { name: 'urun_ara', description: 'Depodaki ürünleri ada, satış koduna, SKU veya barkoda göre arar; fiyat ve stok döner.', parameters: { type: 'object', properties: { sorgu: { type: 'string', description: 'Ürün adı veya kodu' } }, required: ['sorgu'] } } },
  { type: 'function', function: { name: 'sepete_ekle', description: 'Müşterinin sepetine ürün ekler ve stoktan düşer. Beden/varyasyon varsa belirt.', parameters: { type: 'object', properties: { urun: { type: 'string', description: 'Ürün adı, satış kodu veya SKU' }, adet: { type: 'number' }, beden: { type: 'string' } }, required: ['urun'] } } },
  { type: 'function', function: { name: 'sepetten_cikar', description: 'Sepetten bir ürünü çıkarır ve stoğa iade eder.', parameters: { type: 'object', properties: { urun: { type: 'string' } }, required: ['urun'] } } },
  { type: 'function', function: { name: 'kupon_uygula', description: 'Sepete indirim kuponu/kodu uygular.', parameters: { type: 'object', properties: { kod: { type: 'string' } }, required: ['kod'] } } },
  { type: 'function', function: { name: 'sepet_ozeti', description: 'Sepetteki ürünleri ve toplam tutarı döner.', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'odeme_iste', description: 'Satışı kesinleştirir (sipariş oluşturur) ve müşteriye ödeme/tahsilat bağlantısı verir.', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'siparis_linki', description: 'Sepet/sipariş paylaşım bağlantısını döner.', parameters: { type: 'object', properties: {} } } },
];

// Tool çalıştırıcı — string sonuç döner (modele geri beslenir)
export async function execTool(name: string, args: any, ctx: ToolCtx): Promise<string> {
  const t = ctx.tenantId;
  try {
    if (name === 'urun_ara') {
      const products = await prisma.product.findMany({ where: { tenantId: t, aktif: true }, include: { variations: true }, take: 200 });
      const p = matchProduct(products, String(args?.sorgu || ''));
      if (!p) return JSON.stringify({ bulundu: false, mesaj: 'Eşleşen ürün bulunamadı.' });
      return JSON.stringify({ bulundu: true, ad: p.ad, kod: p.salesCode || p.sku || p.barkod, fiyat: p.satisFiyat, stok: p.stokAdeti, bedenler: (p.variations || []).map((v: any) => ({ beden: v.deger, stok: v.stok })) });
    }

    const cart = await getBotCart(ctx);
    if (!MODIFIABLE.has(cart.durum) && name !== 'sepet_ozeti' && name !== 'siparis_linki') {
      return JSON.stringify({ hata: true, mesaj: 'Bu sipariş hazırlık/kargo aşamasına geçtiği için değişiklik yapılamaz.' });
    }
    const items: any[] = Array.isArray(cart.items) ? (cart.items as any) : [];

    if (name === 'sepete_ekle') {
      const products = await prisma.product.findMany({ where: { tenantId: t, aktif: true }, include: { variations: true }, take: 200 });
      const p = matchProduct(products, String(args?.urun || ''));
      if (!p) return JSON.stringify({ hata: true, mesaj: 'Ürün bulunamadı. Lütfen ürün adını veya satış kodunu netleştirin.' });
      const adet = Math.max(1, Number(args?.adet) || 1);
      let beden = args?.beden ? String(args.beden) : '';
      // Beden belirtilmediyse cümleden çıkarmayı dene
      if (!beden && (p.variations || []).length) { const b2 = extractBeden(String(args?.urun || '')); if (b2) beden = b2; }
      let fiyat = p.satisFiyat;
      if ((p.variations || []).length > 0 && !beden) {
        return JSON.stringify({ hata: true, mesaj: 'Beden belirtilmeli', urun: p.ad, mevcutBedenler: (p.variations || []).filter((v: any) => v.stok > 0).map((v: any) => v.deger) });
      }
      if (beden) {
        const v = (p.variations || []).find((x: any) => norm(x.deger) === norm(beden));
        if (!v) return JSON.stringify({ hata: true, mesaj: `"${beden}" bedeni yok.`, mevcutBedenler: (p.variations || []).map((x: any) => x.deger) });
        if (v.stok < adet) return JSON.stringify({ hata: true, mesaj: `Stok yetersiz (${v.stok} adet).` });
        fiyat += v.ekFiyat || 0;
        await prisma.productVariation.update({ where: { id: v.id }, data: { stok: { decrement: adet } } });
      } else if ((p.stokAdeti || 0) < adet) {
        return JSON.stringify({ hata: true, mesaj: `Stok yetersiz (${p.stokAdeti} adet).` });
      }
      await prisma.product.update({ where: { id: p.id }, data: { stokAdeti: { decrement: adet } } });
      items.push({ productId: p.id, ad: p.ad + (beden ? ` (${beden})` : ''), varyasyon: beden || null, adet, fiyat, stokDusuldu: true });
      const tot = recompute(items, cart.indirim || 0, cart.kargoUcreti || 0);
      await prisma.storeOrder.update({ where: { id: cart.id }, data: { items, ...tot } });
      try { await prisma.orderEvent.create({ data: { tenantId: t, orderId: cart.id, kullanici: 'Asistan', islem: 'Ürün eklendi (asistan)', detay: p.ad + (beden ? ` (${beden}) x${adet}` : ` x${adet}`) } }); } catch { /* */ }
      return JSON.stringify({ ok: true, eklendi: p.ad + (beden ? ` (${beden})` : ''), adet, birim: fiyat, sepettekiUrunSayisi: items.length, guncelSepetToplam: tot.toplam, not: 'Sepet toplamı tüm ürünleri içerir.' });
    }

    if (name === 'sepetten_cikar') {
      const idx = items.findIndex((it) => norm(it.ad).includes(norm(String(args?.urun || ''))));
      if (idx < 0) return JSON.stringify({ hata: true, mesaj: 'Sepette bu ürün yok.' });
      const removed = items[idx];
      if (removed?.productId && removed?.stokDusuldu) {
        const adet = Number(removed.adet) || 1;
        if (removed.varyasyon) { const v = await prisma.productVariation.findFirst({ where: { productId: removed.productId, tenantId: t, deger: removed.varyasyon } }); if (v) await prisma.productVariation.update({ where: { id: v.id }, data: { stok: { increment: adet } } }); }
        await prisma.product.updateMany({ where: { id: removed.productId, tenantId: t }, data: { stokAdeti: { increment: adet } } });
      }
      const rest = items.filter((_, i) => i !== idx);
      const tot = recompute(rest, cart.indirim || 0, cart.kargoUcreti || 0);
      await prisma.storeOrder.update({ where: { id: cart.id }, data: { items: rest, ...tot } });
      try { await prisma.orderEvent.create({ data: { tenantId: t, orderId: cart.id, kullanici: 'Asistan', islem: 'Ürün çıkarıldı (asistan)', detay: removed?.ad || '' } }); } catch { /* */ }
      return JSON.stringify({ ok: true, cikarildi: removed?.ad, sepetToplam: tot.toplam });
    }

    if (name === 'kupon_uygula') {
      const kod = String(args?.kod || '').trim();
      const d = await prisma.discountCode.findFirst({ where: { tenantId: t, aktif: true, code: { equals: kod, mode: 'insensitive' } } });
      if (!d) return JSON.stringify({ hata: true, mesaj: 'Geçersiz veya pasif kupon kodu.' });
      const ara = items.reduce((s, it) => s + (Number(it.fiyat) || 0) * (Number(it.adet) || 1), 0);
      const indirim = Math.min(d.tip === 'yuzde' ? ara * d.deger / 100 : d.deger, ara);
      await prisma.storeOrder.update({ where: { id: cart.id }, data: { indirim, indirimKodu: d.code, toplam: Math.max(0, ara - indirim) } });
      try { await prisma.orderEvent.create({ data: { tenantId: t, orderId: cart.id, kullanici: 'Asistan', islem: 'Kupon uygulandı (asistan)', detay: `${d.code} (-${tl(indirim)})` } }); } catch { /* */ }
      return JSON.stringify({ ok: true, kupon: d.code, indirim, yeniToplam: Math.max(0, ara - indirim) });
    }

    if (name === 'sepet_ozeti') {
      return JSON.stringify({ urunler: items.map((it) => ({ ad: it.ad, adet: it.adet, fiyat: it.fiyat })), indirim: cart.indirim || 0, toplam: cart.toplam || 0, durum: cart.durum });
    }

    if (name === 'siparis_linki') {
      return JSON.stringify({ link: `${ctx.appOrigin}/sepet/${cart.token}`, toplam: cart.toplam || 0 });
    }

    if (name === 'odeme_iste') {
      if (items.length === 0) return JSON.stringify({ hata: true, mesaj: 'Sepet boş.' });
      if (cart.durum === 'sepet') await prisma.storeOrder.update({ where: { id: cart.id }, data: { durum: 'yeni' } });
      const tahsilEdilen = cart.tahsilat || 0;
      const kalan = Math.max(0, (cart.toplam || 0) - tahsilEdilen);
      const siparisNo = cart.orderNo ? `${cart.orderYil || new Date(cart.createdAt).getFullYear()}-${String(cart.orderNo).padStart(3, '0')}` : cart.id.slice(-5).toUpperCase();
      const puan = Math.round((cart.toplam || 0) * 0.03);
      let banka: any = null;
      try { const st = await prisma.storeSetting.findUnique({ where: { tenantId: t } }); if (st?.iban) banka = { bankaAd: st.bankaAd, iban: st.iban, hesapSahibi: st.hesapSahibi }; } catch { /* */ }
      try { await prisma.orderEvent.create({ data: { tenantId: t, orderId: cart.id, kullanici: 'Asistan', islem: 'Sipariş oluşturuldu (asistan)', detay: `Sipariş No: ${siparisNo} · Bekleyen: ${tl(kalan)}` } }); } catch { /* */ }
      return JSON.stringify({ ok: true, siparisNo, urunSayisi: items.length, sepetToplam: cart.toplam || 0, indirim: cart.indirim || 0, tahsilEdilen, odenecekTutar: kalan, kazanilacakVipPuan: puan, sepetLink: `${ctx.appOrigin}/sepet/${cart.token}`, bankaBilgileri: banka, mesaj: `Müşteriye: "Siparişinizi oluşturdum (No: ${siparisNo}). Toplam ${tl(cart.toplam || 0)}. Ödemenizi Havale/EFT ile mi yoksa Kredi Kartı ile mi yapmak istersiniz?" diye sor. HAVALE/EFT seçerse: ${puan} VIP puan kazanacağını söyle, banka bilgilerini ver (${banka ? `${banka.bankaAd || ''} IBAN: ${banka.iban} - ${banka.hesapSahibi || ''}` : 'banka bilgisi tanımlı değil'}) ve açıklamaya sipariş numarasını (${siparisNo}) yazmasını iste. KREDİ KARTI seçerse: "Ödeme linki oluşturuyorum, birazdan ödeme bağlantınız hazır olacak" de ve şu sepet bağlantısını ilet: ${ctx.appOrigin}/sepet/${cart.token} (orada 'Sepeti Öde' butonu aktifleşince ödeyebilir).` });
    }

    return JSON.stringify({ hata: true, mesaj: 'Bilinmeyen işlem.' });
  } catch (e: any) {
    return JSON.stringify({ hata: true, mesaj: 'İşlem sırasında hata oluştu.' });
  }
}
