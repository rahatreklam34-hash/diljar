import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { asyncHandler, ApiError } from '../../lib/http';
import { botReply } from '../bot/engine';

const router = Router();

async function getConfig(tenantId: string) {
  let c = await prisma.botConfig.findUnique({ where: { tenantId } });
  if (!c) c = await prisma.botConfig.create({ data: { tenantId } });
  return c;
}

// Bot ayarlari
router.get('/config', asyncHandler(async (req: Request, res: Response) => {
  res.json(await getConfig(req.tenantId!));
}));
router.put('/config', asyncHandler(async (req: Request, res: Response) => {
  await getConfig(req.tenantId!);
  const { name, greeting, persona, profil, active } = req.body || {};
  const data: any = {};
  if (name !== undefined) data.name = name;
  if (greeting !== undefined) data.greeting = greeting;
  if (persona !== undefined) data.persona = persona;
  if (profil !== undefined) data.profil = profil;
  if (active !== undefined) data.active = !!active;
  const c = await prisma.botConfig.update({ where: { tenantId: req.tenantId! }, data });
  res.json(c);
}));

// Bilgi tabani (egitim)
router.get('/knowledge', asyncHandler(async (req: Request, res: Response) => {
  res.json(await prisma.botKnowledge.findMany({ where: { tenantId: req.tenantId! }, orderBy: { createdAt: 'desc' } }));
}));
router.post('/knowledge', asyncHandler(async (req: Request, res: Response) => {
  const { soru, cevap } = req.body || {};
  if (!soru || !cevap) throw new ApiError(422, 'Soru ve cevap gerekli');
  res.status(201).json(await prisma.botKnowledge.create({ data: { tenantId: req.tenantId!, soru, cevap } }));
}));
router.delete('/knowledge/:id', asyncHandler(async (req: Request, res: Response) => {
  const f = await prisma.botKnowledge.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!f) throw new ApiError(404, 'Bulunamadi');
  await prisma.botKnowledge.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
}));

// Test / egitim sohbeti (kayit tutmaz, ticket olusturmaz)
router.post('/test', asyncHandler(async (req: Request, res: Response) => {
  const { message, lastOfferedTicket } = req.body || {};
  const r = await botReply(req.tenantId!, String(message || ''), !!lastOfferedTicket);
  res.json({ reply: r.reply, offerTicket: !!r.offerTicket || !!r.createTicket });
}));

// Sohbetle egitim: serbest metinle ogret. Her mesaj profile + bilgi tabanina islenir.
router.post('/train/chat', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  const message = String(req.body?.message || '').trim();
  const answerGapId = req.body?.answerGapId as string | undefined;
  if (!message) throw new ApiError(422, 'Mesaj gerekli');
  const cfg = await getConfig(t);

  let learnedNote = message;
  if (answerGapId) {
    // Botun sordugu eksigin cevabi
    const g = await prisma.botGap.findFirst({ where: { id: answerGapId, tenantId: t } });
    if (g) {
      await prisma.botKnowledge.create({ data: { tenantId: t, soru: g.ornek, cevap: message } });
      await prisma.botGap.update({ where: { id: g.id }, data: { cozuldu: true } });
      learnedNote = `"${g.ornek}" sorusuna cevap: ${message}`;
    }
  } else {
    // Serbest ogretme
    const m = message.match(/^\s*(?:soru|s)\s*[:：](.+?)\s*(?:cevap|c)\s*[:：](.+)$/is);
    let soru = ''; let cevap = '';
    if (m) { soru = m[1].trim(); cevap = m[2].trim(); } else { soru = message; cevap = message; }
    await prisma.botKnowledge.create({ data: { tenantId: t, soru, cevap } });
  }

  const yeniProfil = (cfg.profil ? cfg.profil + '\n' : '') + '• ' + learnedNote;
  await prisma.botConfig.update({ where: { tenantId: t }, data: { profil: yeniProfil.slice(0, 8000) } });

  const gap = await prisma.botGap.findFirst({ where: { tenantId: t, cozuldu: false }, orderBy: { adet: 'desc' } });
  let reply = 'Öğrendim ve profilime ekledim. ✅ Başka ne anlatmak istersin?';
  if (gap) {
    reply = `Öğrendim, teşekkürler. ✅\n\nBir eksiğim var: Şu soruya cevap veremiyorum ve şimdiye kadar ${gap.adet} kez soruldu:\n“${gap.ornek}”\nBuna ne cevap vermemi istersin?`;
  }
  res.json({ reply, gapId: gap?.id || null, profil: yeniProfil.slice(0, 8000) });
}));

// CV/profil otomatik olustur (config + bilgi tabanindan)
router.post('/profile/generate', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  const cfg = await getConfig(t);
  const kb = await prisma.botKnowledge.findMany({ where: { tenantId: t }, orderBy: { createdAt: 'desc' }, take: 50 });
  const lines: string[] = [];
  lines.push(`Adım: ${cfg.name}`);
  lines.push(`Görevim: Müşterilere ürünler, fiyat ve stok hakkında yardımcı olmak; sorunları çözmek, gerektiğinde destek kaydı açmak.`);
  if (cfg.persona) lines.push(`Kişiliğim: ${cfg.persona}`);
  lines.push(`Karşılama: ${cfg.greeting}`);
  if (kb.length) {
    lines.push('');
    lines.push('Bildiklerim:');
    kb.forEach((k) => lines.push(`- ${k.soru} → ${k.cevap}`));
  }
  const profil = lines.join('\n').slice(0, 8000);
  await prisma.botConfig.update({ where: { tenantId: t }, data: { profil } });
  res.json({ profil });
}));

// Eksikler (bot cevap veremedikleri)
router.get('/gaps', asyncHandler(async (req: Request, res: Response) => {
  res.json(await prisma.botGap.findMany({ where: { tenantId: req.tenantId!, cozuldu: false }, orderBy: { adet: 'desc' }, take: 100 }));
}));
router.post('/gaps/:id/resolve', asyncHandler(async (req: Request, res: Response) => {
  const g = await prisma.botGap.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!g) throw new ApiError(404, 'Bulunamadi');
  const cevap = String(req.body?.cevap || '').trim();
  if (!cevap) throw new ApiError(422, 'Cevap gerekli');
  await prisma.botKnowledge.create({ data: { tenantId: req.tenantId!, soru: g.ornek, cevap } });
  await prisma.botGap.update({ where: { id: g.id }, data: { cozuldu: true } });
  res.json({ ok: true });
}));
router.delete('/gaps/:id', asyncHandler(async (req: Request, res: Response) => {
  const g = await prisma.botGap.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!g) throw new ApiError(404, 'Bulunamadi');
  await prisma.botGap.delete({ where: { id: g.id } });
  res.json({ ok: true });
}));

// Musteri sohbetleri
router.get('/sessions', asyncHandler(async (req: Request, res: Response) => {
  const sessions = await prisma.chatSession.findMany({
    where: { tenantId: req.tenantId! },
    orderBy: { updatedAt: 'desc' },
    take: 100,
    include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  res.json(sessions);
}));
router.get('/sessions/:id', asyncHandler(async (req: Request, res: Response) => {
  const s = await prisma.chatSession.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! }, include: { messages: { orderBy: { createdAt: 'asc' } } } });
  if (!s) throw new ApiError(404, 'Bulunamadi');
  res.json(s);
}));
router.post('/sessions/:id/reply', asyncHandler(async (req: Request, res: Response) => {
  const s = await prisma.chatSession.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!s) throw new ApiError(404, 'Bulunamadi');
  const content = String(req.body?.content || '').trim();
  if (!content) throw new ApiError(422, 'Mesaj gerekli');
  await prisma.chatMessage.create({ data: { tenantId: req.tenantId!, sessionId: s.id, role: 'agent', content } });
  await prisma.chatSession.update({ where: { id: s.id }, data: { updatedAt: new Date() } });
  res.status(201).json({ ok: true });
}));

// Hazir bilgi tabani (satis sonrasi / pazarlama)
const SEED: { soru: string; cevap: string }[] = [
  { soru: 'kargo ne zaman gelir kac gunde teslim', cevap: 'Siparişleriniz genellikle 1-3 iş günü içinde kargoya verilir ve bölgenize göre 1-4 iş gününde elinize ulaşır. Kargo takip numaranız hazır olunca sizinle paylaşılır.' },
  { soru: 'kargo ucreti kac para bedava kargo', cevap: 'Belirli tutar üzeri siparişlerde kargo ücretsizdir; altındaki siparişlerde sabit kargo ücreti uygulanır. Sepet ekranında kargo tutarını görebilirsiniz.' },
  { soru: 'siparisimi nasil takip ederim kargo takip', cevap: 'Siparişiniz kargoya verildiğinde size bir takip numarası iletiyoruz. Bu numarayla kargo firmasının sitesinden gönderinizi anlık takip edebilirsiniz.' },
  { soru: 'iade nasil yaparim iade kosullari', cevap: 'Ürünü teslim aldıktan sonra 14 gün içinde, kullanılmamış ve etiketli şekilde iade edebilirsiniz. İade talebinizi bize iletmeniz yeterli; size iade sürecini adım adım anlatırız.' },
  { soru: 'degisim beden degisimi nasil olur', cevap: 'Beden veya renk değişimi yapabilirsiniz. Ürün kullanılmamış olmalı; değişim talebinizi iletin, uygun ürünle değişimi hızlıca sağlayalım.' },
  { soru: 'param ne zaman iade edilir geri odeme', cevap: 'İade ürünü bize ulaşıp kontrol edildikten sonra ödemeniz, ödeme yönteminize göre genellikle 1-7 iş günü içinde iade edilir.' },
  { soru: 'hangi odeme yontemleri var taksit kredi karti', cevap: 'Kredi/banka kartı ve havale/EFT ile ödeme yapabilirsiniz. Anlaşmalı bankaların kartlarına taksit imkânı sunulmaktadır.' },
  { soru: 'urun stokta var mi beden var mi', cevap: 'Stok durumunu hemen kontrol edebilirim. Hangi ürünü ve bedeni istediğinizi yazarsanız güncel stok bilgisini paylaşayım.' },
  { soru: 'indirim kampanya var mi kupon kodu', cevap: 'Güncel kampanya ve indirim kodlarımız zaman zaman değişir. Sepette geçerli bir indirim kodunuz varsa uygulayabilirsiniz; fırsatları kaçırmamak için bizi takipte kalın!' },
  { soru: 'calisma saatleri ne zaman aciksiniz', cevap: 'Mesajlarınıza hafta içi ve hafta sonu en kısa sürede dönüyoruz. Yoğunluğa göre yanıt süremiz değişebilir ama sizi asla yanıtsız bırakmayız 😊' },
  { soru: 'urun orijinal mi garanti var mi', cevap: 'Tüm ürünlerimiz orijinaldir. Herhangi bir sorun yaşamanız durumunda destek ekibimiz size yardımcı olur.' },
  { soru: 'siparis verdim onay geldi mi', cevap: 'Siparişiniz oluştuğunda tarafınıza bilgilendirme yapılır. Sipariş numaranızı paylaşırsanız durumunu kontrol edebilirim.' },
  { soru: 'fatura adres bilgisi degistirme', cevap: 'Sipariş kargoya verilmeden önce teslimat/fatura bilgilerinizi güncelleyebiliriz. Lütfen doğru bilgileri benimle paylaşın.' },
  { soru: 'urun ne zaman tekrar gelecek stok yenilenecek mi', cevap: 'Tükenen ürünlerimiz talebe göre yeniden stoğa girebiliyor. İstediğiniz ürünü not alıp, geldiğinde size haber verilmesini sağlayabilirim.' },
];

router.post('/knowledge/seed', asyncHandler(async (req: Request, res: Response) => {
  const t = req.tenantId!;
  const mevcut = await prisma.botKnowledge.findMany({ where: { tenantId: t }, select: { soru: true } });
  const set = new Set(mevcut.map((m) => m.soru.toLowerCase()));
  let eklenen = 0;
  for (const s of SEED) {
    if (set.has(s.soru.toLowerCase())) continue;
    await prisma.botKnowledge.create({ data: { tenantId: t, soru: s.soru, cevap: s.cevap } });
    eklenen++;
  }
  res.status(201).json({ eklenen });
}));

// ───── Destek Talepleri (musteri) ─────
router.get('/destek-talepleri', asyncHandler(async (req: Request, res: Response) => {
  res.json(await prisma.destekTalebi.findMany({ where: { tenantId: req.tenantId! }, orderBy: { createdAt: 'desc' }, take: 200 }));
}));
router.post('/destek-talepleri', asyncHandler(async (req: Request, res: Response) => {
  const { musteriAd, baslik, konu, detay } = req.body || {};
  if (!baslik) throw new ApiError(422, 'Başlık gerekli');
  const no = 'DT' + Math.random().toString(36).slice(2, 7).toUpperCase();
  res.status(201).json(await prisma.destekTalebi.create({ data: { tenantId: req.tenantId!, no, musteriAd: musteriAd || null, baslik, konu: konu || null, detay: detay || null, kaynak: 'manuel' } }));
}));
router.patch('/destek-talepleri/:id', asyncHandler(async (req: Request, res: Response) => {
  const f = await prisma.destekTalebi.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!f) throw new ApiError(404, 'Bulunamadi');
  const { durum, detay, baslik, konu, yanit } = req.body || {};
  const data: any = {};
  if (durum !== undefined) data.durum = durum;
  if (detay !== undefined) data.detay = detay;
  if (baslik !== undefined) data.baslik = baslik;
  if (konu !== undefined) data.konu = konu;
  if (yanit !== undefined) data.yanit = yanit;
  res.json(await prisma.destekTalebi.update({ where: { id: req.params.id }, data }));
}));
router.delete('/destek-talepleri/:id', asyncHandler(async (req: Request, res: Response) => {
  const f = await prisma.destekTalebi.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!f) throw new ApiError(404, 'Bulunamadi');
  await prisma.destekTalebi.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
}));

export default router;
