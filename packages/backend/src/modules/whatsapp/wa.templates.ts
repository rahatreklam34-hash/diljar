// WhatsApp Cloud API mesaj şablonları: Meta'ya onaya gönderme + durum senkronu.
import { prisma } from '../../lib/prisma';
import { apiCreateTemplate, apiListTemplates } from './wa.cloud';

// Tenant için onaya/listelemeye uygun bir API hattı bul (wabaId + token olan)
async function apiLineFor(tenantId: string): Promise<any | null> {
  return prisma.whatsappLine.findFirst({
    where: { tenantId, channel: 'api', wabaId: { not: null }, accessToken: { not: null } },
    orderBy: { apiVerified: 'desc' },
  }).catch(() => null);
}

// Bir metindeki {{n}} değişkenlerinin EN BÜYÜK sıra numarasını döndürür.
// Meta, her {{n}} için tam olarak bir örnek (example) bekler; sayı uyuşmazsa "Invalid parameter" verir.
function maxVarIndex(text: string): number {
  let max = 0;
  for (const m of String(text || '').matchAll(/\{\{(\d+)\}\}/g)) {
    const n = parseInt(m[1], 10);
    if (n > max) max = n;
  }
  return max;
}

// Şablon adını Meta kurallarına uygun hale getir (yalnızca küçük harf, rakam, alt çizgi)
function normName(name: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 512) || 'sablon';
}

// Local şablon → Meta create payload
function buildMetaPayload(tpl: any): any {
  const components: any[] = [];

  if (tpl.headerType === 'text' && tpl.headerText) {
    const comp: any = { type: 'HEADER', format: 'TEXT', text: tpl.headerText };
    const hCount = maxVarIndex(tpl.headerText);
    // Header'da en fazla 1 değişken olabilir; örnek tek elemanlı dizi olmalı
    if (hCount > 0) comp.example = { header_text: ['örnek'] };
    components.push(comp);
  } else if (tpl.headerType === 'image' || tpl.headerType === 'document') {
    components.push({ type: 'HEADER', format: tpl.headerType.toUpperCase() });
  }

  const bodyComp: any = { type: 'BODY', text: tpl.bodyText };
  const bodyCount = maxVarIndex(tpl.bodyText);
  if (bodyCount > 0) {
    // Örnek dizisi tam olarak değişken sayısı kadar eleman içermeli (eksikse 'örnek' ile doldur, fazlaysa kırp)
    const raw: any[] = Array.isArray(tpl.sampleJson) ? (tpl.sampleJson as any[]) : [];
    const sample: string[] = Array.from({ length: bodyCount }, (_, i) => {
      const v = raw[i];
      return v == null || String(v).trim() === '' ? 'örnek' : String(v);
    });
    bodyComp.example = { body_text: [sample] };
  }
  components.push(bodyComp);

  if (tpl.footerText) components.push({ type: 'FOOTER', text: tpl.footerText });
  if (Array.isArray(tpl.buttonsJson) && tpl.buttonsJson.length) components.push({ type: 'BUTTONS', buttons: tpl.buttonsJson });

  return { name: normName(tpl.name), language: tpl.language || 'tr', category: tpl.category || 'UTILITY', components };
}

// Şablonu Meta'ya onaya gönder
export async function submitTemplate(tenantId: string, templateId: string): Promise<{ ok: boolean; status?: string; error?: string }> {
  const tpl = await prisma.whatsappTemplate.findFirst({ where: { id: templateId, tenantId } });
  if (!tpl) return { ok: false, error: 'Şablon bulunamadı' };
  const line = await apiLineFor(tenantId);
  if (!line) return { ok: false, error: 'Onay için doğrulanmış bir API hattı (WABA) gerekli' };
  try {
    const r = await apiCreateTemplate(line, buildMetaPayload(tpl));
    const status = String(r.status || 'PENDING').toLowerCase();
    const mapped = status === 'approved' ? 'approved' : status === 'rejected' ? 'rejected' : 'pending';
    await prisma.whatsappTemplate.update({ where: { id: tpl.id }, data: { status: mapped, metaId: r.id || null, rejectReason: null } });
    return { ok: true, status: mapped };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }
}

// Meta'daki şablon durumlarını çekip local kayıtlara işle (webhook gecikirse yedek; cron'dan çağrılır)
export async function syncTemplateStatuses(tenantId?: string): Promise<void> {
  const lines = await prisma.whatsappLine.findMany({
    where: { channel: 'api', wabaId: { not: null }, accessToken: { not: null }, ...(tenantId ? { tenantId } : {}) },
  }).catch(() => [] as any[]);
  // tenant başına tek WABA yeterli (aynı wabaId tekrarını atla)
  const seen = new Set<string>();
  for (const line of lines) {
    const key = `${line.tenantId}:${line.wabaId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      const remote = await apiListTemplates(line);
      for (const rt of remote) {
        const status = String(rt.status || '').toUpperCase();
        const mapped = status === 'APPROVED' ? 'approved' : status === 'REJECTED' ? 'rejected' : status === 'PENDING' ? 'pending' : status ? 'disabled' : null;
        if (!mapped) continue;
        await prisma.whatsappTemplate.updateMany({
          where: { tenantId: line.tenantId, name: rt.name, language: rt.language },
          data: { status: mapped, metaId: rt.id ? String(rt.id) : undefined, rejectReason: mapped === 'rejected' ? String(rt.rejected_reason || '') : null },
        }).catch(() => {});
      }
    } catch { /* hattı atla */ }
  }
}
