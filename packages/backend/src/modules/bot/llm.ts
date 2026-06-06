import { prisma } from '../../lib/prisma';
import { TOOL_DEFS, execTool, ToolCtx } from './assistant.tools';

interface Msg { role: 'system' | 'user' | 'assistant' | 'tool'; content: string | null; tool_calls?: any; tool_call_id?: string; name?: string; }

async function getOpenAI(tenantId?: string): Promise<{ apiKey: string; model: string } | null> {
  // Önce firma (tenant) anahtarı, yoksa platform anahtarı
  let s = tenantId
    ? await prisma.integrationSetting.findFirst({ where: { scope: 'TENANT', tenantId, provider: 'openai', enabled: true } })
    : null;
  if (!s) s = await prisma.integrationSetting.findFirst({ where: { scope: 'PLATFORM', provider: 'openai', enabled: true } });
  const c: any = s?.config || {};
  if (!c.api_key) return null;
  return { apiKey: c.api_key, model: c.model || 'gpt-4o-mini' };
}

export async function llmAvailable(tenantId?: string): Promise<boolean> {
  return (await getOpenAI(tenantId)) !== null;
}

// Ticket icin kisa baslik + ozet uretir (LLM yoksa null)
export async function summarizeTicket(tenantId: string, history: { role: string; content: string }[]): Promise<{ baslik: string; ozet: string } | null> {
  const oa = await getOpenAI(tenantId);
  if (!oa) return null;
  const konusma = history
    .map((m) => `${m.role === 'user' ? 'Müşteri' : m.role === 'agent' ? 'Yetkili' : 'Asistan'}: ${String(m.content).startsWith('data:image') ? '[görsel]' : m.content}`)
    .join('\n')
    .slice(0, 4000);
  const sys = 'Aşağıdaki müşteri-asistan sohbetinden bir destek kaydı için JSON üret. Sadece şu formatta dön: {"baslik":"...","ozet":"..."}. baslik en fazla 6 kelimelik, durumu özetleyen kısa bir başlık olsun (ör. "Hasarlı ürün iadesi"). ozet ise sorunu, sipariş no/görsel gibi detayları içeren 1-3 cümlelik özet olsun. Türkçe yaz.';
  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${oa.apiKey}` },
      body: JSON.stringify({ model: oa.model, messages: [{ role: 'system', content: sys }, { role: 'user', content: konusma }], temperature: 0.3, max_tokens: 200, response_format: { type: 'json_object' } }),
    });
    if (!resp.ok) return null;
    const data: any = await resp.json();
    const txt = data?.choices?.[0]?.message?.content;
    const j = JSON.parse(txt);
    if (j?.baslik) return { baslik: String(j.baslik).slice(0, 80), ozet: String(j.ozet || '').slice(0, 500) };
    return null;
  } catch { return null; }
}

/**
 * LLM ile yanit uretir. Yapilandirilmamis/hata durumunda null doner (kural motoruna dusulur).
 * history: [{role:'user'|'bot'|'agent', content}]
 */
export async function llmReply(tenantId: string, text: string, history: { role: string; content: string }[] = []): Promise<string | null> {
  const oa = await getOpenAI(tenantId);
  if (!oa) return null;

  const cfg = await prisma.botConfig.findUnique({ where: { tenantId } });
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
  const kb = await prisma.botKnowledge.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 60 });
  const products = await prisma.product.findMany({ where: { tenantId, aktif: true }, select: { ad: true, salesCode: true, satisFiyat: true, stokAdeti: true, marka: true }, take: 80 });

  const kbText = kb.map((k) => `S: ${k.soru}\nC: ${k.cevap}`).join('\n');
  const prodText = products.map((p) => `- ${p.ad}${p.marka ? ' (' + p.marka + ')' : ''} | kod:${p.salesCode || '-'} | fiyat:${p.satisFiyat}₺ | stok:${p.stokAdeti}`).join('\n');

  const sys = [
    `Sen "${cfg?.name || 'Asistan'}" adında, "${tenant?.name || 'mağaza'}" için çalışan bir müşteri temsilcisisin.`,
    cfg?.persona ? `Kişiliğin: ${cfg.persona}` : '',
    cfg?.profil ? `Profilin / bildiklerin:\n${cfg.profil}` : '',
    `Görevin: Müşterilere Türkçe, kısa, samimi ve İNSAN gibi yanıt vermek. Emoji kullanabilirsin. Asla "ben bir yapay zekayım" deme; gerçek bir temsilci gibi davran.`,
    `Ürünler, fiyat ve stok bilgileri:\n${prodText || '(ürün yok)'}`,
    kbText ? `Sık sorulanlar / bilgi tabanı:\n${kbText}` : '',
    `Kurallar: Bilmediğin/elinde olmayan bir bilgiyi uydurma; gerekiyorsa "kontrol edip döneyim" de.`,
    `Ürünle ilgili bir SORUN/ŞİKAYET/İADE söz konusuysa: destek kaydı önermeden ÖNCE müşteriden sırayla şunları nazikçe iste — (1) sorunun kısa özeti, (2) sipariş numarası, (3) mümkünse ürünün fotoğrafı (fotoğraf ekleme butonu sohbette mevcut). Bu bilgiler alındıktan sonra mesajının EN SONUNA ayrı satırda [TICKET] etiketini ekle (müşteri bu etiketi görmez).`,
    `Sıradan ürün/fiyat/stok/kargo sorularında ticket açma; sadece çözülemeyen sorun/iade durumunda [TICKET] kullan.`,
  ].filter(Boolean).join('\n\n');

  const msgs: Msg[] = [{ role: 'system', content: sys }];
  for (const h of history.slice(-10)) {
    const c = String(h.content).startsWith('data:image') ? '[müşteri bir görsel gönderdi]' : h.content;
    if (h.role === 'user') msgs.push({ role: 'user', content: c });
    else if (h.role === 'bot' || h.role === 'agent') msgs.push({ role: 'assistant', content: c });
  }
  msgs.push({ role: 'user', content: text });

  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${oa.apiKey}` },
      body: JSON.stringify({ model: oa.model, messages: msgs, temperature: 0.7, max_tokens: 400 }),
    });
    if (!resp.ok) { console.error('[llm] http', resp.status, await resp.text().catch(() => '')); return null; }
    const data: any = await resp.json();
    const content = data?.choices?.[0]?.message?.content;
    return typeof content === 'string' ? content.trim() : null;
  } catch (e) {
    console.error('[llm] error', e);
    return null;
  }
}

/**
 * Satış yetkili asistan: OpenAI tool-calling ile depo/ürün erişimi, sepet, kupon, ödeme.
 * ctx içinde sohbet müşteri bilgisi (instagram/telefon/ad) ve appOrigin gelir.
 * LLM yoksa veya hata olursa null döner (engine kural motoruna düşer).
 */
export async function llmReplyTools(tenantId: string, text: string, history: { role: string; content: string }[], ctx: ToolCtx): Promise<string | null> {
  const oa = await getOpenAI(tenantId);
  if (!oa) return null;
  const cfg = await prisma.botConfig.findUnique({ where: { tenantId } });
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
  const kb = await prisma.botKnowledge.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 40 });
  const kbText = kb.map((k) => `S: ${k.soru}\nC: ${k.cevap}`).join('\n');

  const sys = [
    `Sen "${cfg?.name || 'Asistan'}" adında, "${tenant?.name || 'mağaza'}" için çalışan, SATIŞ YAPMAYA YETKİLİ bir müşteri temsilcisisin.`,
    cfg?.persona ? `Kişiliğin: ${cfg.persona}` : '',
    cfg?.profil ? `Profilin:\n${cfg.profil}` : '',
    `Türkçe, kısa, samimi ve İNSAN gibi konuş. Emoji kullanabilirsin. Asla yapay zeka olduğunu söyleme.`,
    `SATIŞ YETKİLERİN (araçlarla yap): ürün ara (urun_ara), sepete ekle (sepete_ekle), sepetten çıkar (sepetten_cikar), kupon uygula (kupon_uygula), sepet özetini gör (sepet_ozeti), satışı kesinleştirip ödeme bağlantısı ver (odeme_iste), sipariş linki paylaş (siparis_linki).`,
    `KURALLAR: Fiyat/stok için her zaman önce urun_ara çağır, uydurma. Müşteri almak isterse sepete_ekle. Müşteriye "ödeme yapmak ister misiniz?" diye SORMA; bunun yerine hemen şimdi öderse sipariş tutarının %3'ü kadar VIP puan kazanacağını söyleyerek ödemeye teşvik et ve odeme_iste çağır. Sohbete bir sepet bağlıysa (siparişi tamamla'dan gelen müşteri) önce sepet_ozeti ile ürünleri ad/adet/fiyat olarak listele, toplam tutarı söyle, sonra odeme_iste çağır. odeme_iste sonucundaki yönlendirmeye göre ÖDEME YÖNTEMİ sor: Havale/EFT seçerse banka bilgilerini ve sipariş no'yu ver, açıklamaya sipariş no yazmasını iste, VIP puanı hatırlat; Kredi Kartı seçerse ödeme linki hazırlandığını söyle ve sepet bağlantısını ilet. Kupon verirse kupon_uygula. Sipariş hazırlık/kargo aşamasına geçtiyse araçlar değişiklik yaptırmaz; nazikçe söyle.`,
    `Bir SORUN/ŞİKAYET/İADE varsa: önce kısa özet + sipariş no + mümkünse fotoğraf iste; sonra mesaj sonuna ayrı satırda [TICKET] ekle (müşteri görmez).`,
    kbText ? `Bilgi tabanı:\n${kbText}` : '',
  ].filter(Boolean).join('\n\n');

  const msgs: Msg[] = [{ role: 'system', content: sys }];
  for (const h of history.slice(-10)) {
    const c = String(h.content).startsWith('data:image') ? '[müşteri bir görsel gönderdi]' : h.content;
    if (h.role === 'user') msgs.push({ role: 'user', content: c });
    else if (h.role === 'bot' || h.role === 'agent') msgs.push({ role: 'assistant', content: c });
  }
  msgs.push({ role: 'user', content: text });

  try {
    for (let i = 0; i < 5; i++) {
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${oa.apiKey}` },
        body: JSON.stringify({ model: oa.model, messages: msgs, tools: TOOL_DEFS, tool_choice: 'auto', temperature: 0.6, max_tokens: 500 }),
      });
      if (!resp.ok) { console.error('[llm-tools] http', resp.status, await resp.text().catch(() => '')); return null; }
      const data: any = await resp.json();
      const m = data?.choices?.[0]?.message;
      if (!m) return null;
      if (m.tool_calls && m.tool_calls.length) {
        msgs.push({ role: 'assistant', content: m.content ?? null, tool_calls: m.tool_calls });
        for (const tc of m.tool_calls) {
          let args: any = {};
          try { args = JSON.parse(tc.function.arguments || '{}'); } catch { /* */ }
          const result = await execTool(tc.function.name, args, ctx);
          msgs.push({ role: 'tool', tool_call_id: tc.id, name: tc.function.name, content: result });
        }
        continue;
      }
      return typeof m.content === 'string' ? m.content.trim() : null;
    }
    return null;
  } catch (e) {
    console.error('[llm-tools] error', e);
    return null;
  }
}
