import { prisma } from '../../lib/prisma';
import { llmReply, llmReplyTools } from './llm';
import { ToolCtx } from './assistant.tools';

const norm = (s: string) => (s || '').toLowerCase().replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ö/g, 'o').replace(/ü/g, 'u').trim();

const COMPLAINT = ['sikayet', 'iade', 'sorun', 'problem', 'bozuk', 'memnun deg', 'memnun degil', 'iptal', 'kotu', 'hata', 'yanlis', 'eksik', 'kirik', 'gelmedi', 'kayip', 'kayıp', 'hasarli', 'hasarlı'];
const AFFIRM = /^(evet|olur|tamam|tabi|lutfen|olsun|onay|isterim|istiyorum|e)\b/;

export interface BotResult { reply: string; offerTicket?: boolean; createTicket?: boolean; unanswered?: boolean; }

export async function botReply(tenantId: string, text: string, lastBotOfferedTicket = false, history: { role: string; content: string }[] = [], ctx?: ToolCtx): Promise<BotResult> {
  const t = norm(text);

  // Ticket onayi (deterministik)
  if (lastBotOfferedTicket && AFFIRM.test(t)) {
    return { reply: 'Hemen ilgileniyorum, talebinizi oluşturuyorum. Yetkili arkadaşımız en kısa sürede sizinle iletişime geçecek. 🙏', createTicket: true };
  }

  // Satış yetkili LLM (tool-calling) varsa onu kullan
  if (ctx) {
    const llmT = await llmReplyTools(tenantId, text, history, ctx);
    if (llmT !== null) {
      const lower = norm(llmT);
      const ticket = /\[TICKET\]/i.test(llmT) || /(olusturdum|olusturuldu|actim|ilettim|iletildi|kaydiniz olust|kayit olust|talebiniz olust|talep olust|talebiniz alind|destek kaydi olus)/.test(lower);
      const reply = llmT.replace(/\[TICKET\]/ig, '').trim();
      return { reply: reply || 'Buyrun, size nasıl yardımcı olabilirim?', createTicket: ticket };
    }
  }

  // LLM varsa onu kullan
  const llm = await llmReply(tenantId, text, history);
  if (llm !== null) {
    const tagged = /\[TICKET\]/i.test(llm);
    // Model etiketi unutup prozada "kayıt oluşturdum/ilettim" derse de yakala
    const lower = norm(llm);
    const claimsCreated = /(olusturdum|olusturuldu|actim|ilettim|iletildi|kaydiniz olust|kayit olust|talebiniz olust|talep olust|talebiniz alind|destek kaydi olus)/.test(lower);
    const ticket = tagged || claimsCreated;
    const reply = llm.replace(/\[TICKET\]/ig, '').trim();
    return { reply: reply || 'Buyrun, size nasıl yardımcı olabilirim?', createTicket: ticket };
  }

  // ── LLM yoksa kural motoru ──

  // İnsancıl küçük sohbet
  if (/(^|\b)(merhaba|selam|iyi gunler|iyi günler|gunaydin|günaydın|iyi aksamlar|iyi akşamlar|naber|nasilsin|nasılsın)(\b|$)/i.test(t)) {
    return { reply: 'Merhaba 😊 Hoş geldiniz! Size nasıl yardımcı olabilirim? Ürünlerimiz, fiyatlar, kargo veya iade konularında sorularınızı yanıtlayabilirim.' };
  }
  if (/(tesekkur|teşekkür|sagol|sağ ol|eyvallah|tşk)/i.test(t)) {
    return { reply: 'Rica ederim, ne demek 😊 Başka bir konuda yardımcı olabileceğim bir şey var mı?' };
  }
  if (/(gorusuruz|görüşürüz|hosca kal|hoşça kal|bay bay|iyi gunler dilerim)/i.test(t)) {
    return { reply: 'Tekrar bekleriz, iyi günler dilerim! 👋' };
  }

  if (COMPLAINT.some((k) => t.includes(k))) {
    return { reply: 'Yaşadığınız durumu çözmek isterim. Konuyu yetkilimize iletmek üzere bir destek kaydı oluşturabilirim. Onaylıyor musunuz? (Evet / Hayır)', offerTicket: true };
  }

  // Urun sorgusu
  const products = await prisma.product.findMany({ where: { tenantId, aktif: true }, select: { ad: true, salesCode: true, satisFiyat: true, stokAdeti: true } });
  const qTokens = t.split(/\s+/).filter((w) => w.length > 2);
  const prod = products.find((p) => {
    const code = norm(p.salesCode || '');
    if (code && t.includes(code)) return true;
    const words = norm(p.ad).split(/\s+/).filter((w) => w.length > 2);
    const overlap = words.filter((w) => t.includes(w)).length;
    return overlap >= Math.min(2, words.length);
  });
  if (prod) {
    const stokTxt = prod.stokAdeti > 0 ? `stoklarımızda mevcut (${prod.stokAdeti} adet)` : 'şu an maalesef stokta yok';
    return { reply: `${prod.ad}: ${prod.satisFiyat.toLocaleString('tr-TR')}₺ — ${stokTxt}. Başka bir konuda yardımcı olabilir miyim?` };
  }

  // Bilgi tabani eslestirme
  const kb = await prisma.botKnowledge.findMany({ where: { tenantId } });
  let best: { score: number; cevap: string } | null = null;
  for (const k of kb) {
    const ks = norm(k.soru);
    let score = 0;
    for (const w of qTokens) if (ks.includes(w)) score++;
    if (ks.includes(t) || (t.length > 4 && t.includes(ks))) score += 3;
    if (!best || score > best.score) best = { score, cevap: k.cevap };
  }
  if (best && best.score >= 1) return { reply: best.cevap };

  return { reply: 'Bu konuda emin olamadım. Sorunuzu biraz daha detaylandırabilir ya da bir yetkiliyle görüşmek için destek kaydı oluşturabilirim. Destek kaydı ister misiniz? (Evet / Hayır)', offerTicket: true, unanswered: true };
}

export function offeredTicket(content: string): boolean {
  return /\(Evet\s*\/\s*Hay[ıi]r\)/i.test(content);
}
