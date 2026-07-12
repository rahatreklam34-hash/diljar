// WhatsApp görsel workflow yürütme motoru.
// Graph: { nodes:[{id,type,subtype,config,x,y}], edges:[{id,from,to,branch?}] }
//   type: 'trigger' | 'condition' | 'delay' | 'action' | 'decision'
// Run: bir müşteri için akıştaki konumu (currentNodeId) + bekleme (wakeAt) tutar.
// Delay düğümü run'ı 'waiting' yapar; processWorkflowTick uyandırınca GÜNCEL order verisiyle devam eder.
import { prisma } from '../../lib/prisma';
import { normPhone } from './wa.manager';
import { env } from '../../config/env';

type GNode = { id: string; type: string; subtype: string; config?: any; x?: number; y?: number };
type GEdge = { id?: string; from: string; to: string; branch?: 'yes' | 'no' | null };
type Graph = { nodes: GNode[]; edges: GEdge[] };

const MAX_STEPS = 100; // sonsuz döngü koruması

// Bilinen (AKTİF) blok subtype'ları — editör de bunları aktif gösterir.
export const ACTIVE_BLOCKS = {
  trigger: ['order', 'status', 'payment_received'],
  condition: ['payment_received', 'amount_gt', 'amount_lt', 'first_order', 'has_product', 'campaign_used', 'city_istanbul', 'cod_payment'],
  delay: ['preset'],
  action: ['send_message', 'send_template', 'send_media', 'send_payment_link', 'send_cargo_link', 'update_status', 'cancel_order', 'complete_order', 'add_note'],
};

function asGraph(g: any): Graph {
  const nodes: GNode[] = Array.isArray(g?.nodes) ? g.nodes : [];
  const edges: GEdge[] = Array.isArray(g?.edges) ? g.edges : [];
  return { nodes, edges };
}
function nodeById(g: Graph, id?: string | null): GNode | null {
  if (!id) return null;
  return g.nodes.find((n) => n.id === id) || null;
}
// Bir düğümden çıkan kenarı bul. branch verilmişse o dalı, yoksa ilk (dalsız) kenarı döndür.
function nextNode(g: Graph, fromId: string, branch?: 'yes' | 'no'): GNode | null {
  const outs = g.edges.filter((e) => e.from === fromId);
  if (!outs.length) return null;
  if (branch) {
    const m = outs.find((e) => (e.branch || null) === branch);
    return m ? nodeById(g, m.to) : null;
  }
  const plain = outs.find((e) => !e.branch) || outs[0];
  return nodeById(g, plain.to);
}
function triggerNode(g: Graph): GNode | null {
  return g.nodes.find((n) => n.type === 'trigger') || null;
}

// Delay preset → dakika
function delayMinutes(cfg: any): number {
  const presetMap: Record<string, number> = {
    '5m': 5, '10m': 10, '20m': 20, '30m': 30, '1h': 60, '3h': 180, '24h': 1440,
  };
  if (cfg?.preset === 'custom') return Math.max(0, Math.min(10080, Math.round(Number(cfg?.customMin) || 0)));
  const m = presetMap[String(cfg?.preset || '')];
  return m != null ? m : Math.max(0, Math.min(10080, Math.round(Number(cfg?.customMin ?? cfg?.minutes ?? 0)) || 0));
}

// {ad}{no}{tutar}{link}{urun} ikamesi
function applyVars(text: string, ctx: Record<string, any>): string {
  return String(text || '')
    .replace(/\{ad\}/g, String(ctx.ad ?? ''))
    .replace(/\{no\}/g, String(ctx.no ?? ''))
    .replace(/\{tutar\}/g, String(ctx.tutar ?? ''))
    .replace(/\{link\}/g, String(ctx.link ?? ''))
    .replace(/\{urun\}/g, String(ctx.urun ?? ''));
}
function fillNumbered(text: string, vars: any[]): string {
  return String(text || '').replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, n) => {
    const v = vars[Number(n) - 1];
    return v == null ? '' : String(v);
  });
}

// Sipariş + müşteriden çalışma değişkenlerini (context) üret.
async function buildContext(tenantId: string, order: any): Promise<Record<string, any>> {
  let cust: any = null;
  if (order?.customerId) cust = await prisma.customer.findUnique({ where: { id: order.customerId } }).catch(() => null);
  const no = order?.orderNo ? `${order.orderYil}-${String(order.orderNo).padStart(3, '0')}` : ('#' + String(order?.id || '').slice(-5));
  const items: any[] = Array.isArray(order?.items) ? order.items : [];
  const ad = order?.musteriHandle || cust?.instagram || cust?.ad || 'Müşteri';
  const tutar = Number(order?.toplam ?? 0).toLocaleString('tr-TR');
  const link = order?.token ? `${String(env.APP_DOMAIN || '').replace(/\/$/, '')}/sepet/${order.token}` : '';
  const urun = Array.from(new Set(items.map((i) => i.kod || i.ad || '').filter(Boolean))).slice(0, 3).join(', ');
  return { ad, no, tutar, link, urun };
}

// ── Koşul değerlendirme (GÜNCEL order ile) ───────────────────────────────────
async function evalCondition(tenantId: string, sub: string, cfg: any, order: any, ctx: Record<string, any>): Promise<boolean> {
  const toplam = Number(order?.toplam ?? 0);
  const tahsilat = Number(order?.tahsilat ?? 0);
  switch (sub) {
    case 'payment_received':
      return tahsilat >= toplam - 0.01 && toplam > 0 ? true : (order?.odemeBildirim === 'onaylandi');
    case 'amount_gt':
      return toplam > Number(cfg?.value ?? 0);
    case 'amount_lt':
      return toplam < Number(cfg?.value ?? 0);
    case 'first_order': {
      if (!order?.customerId) return true;
      const cnt = await prisma.storeOrder.count({ where: { tenantId, customerId: order.customerId, durum: { not: 'sepet' } } }).catch(() => 1);
      return cnt <= 1;
    }
    case 'has_product': {
      const items: any[] = Array.isArray(order?.items) ? order.items : [];
      const needle = String(cfg?.kod || cfg?.productId || '').trim().toLowerCase();
      if (!needle) return items.length > 0;
      return items.some((i) => String(i.kod || '').toLowerCase() === needle || String(i.productId || '').toLowerCase() === needle || String(i.ad || '').toLowerCase().includes(needle));
    }
    case 'campaign_used': {
      const used = !!order?.indirimKodu;
      const want = String(cfg?.kod || '').trim();
      return want ? String(order?.indirimKodu || '').toLowerCase() === want.toLowerCase() : used;
    }
    case 'city_istanbul': {
      const want = String(cfg?.city || 'istanbul').toLocaleLowerCase('tr');
      return String(order?.il || '').toLocaleLowerCase('tr').includes(want);
    }
    case 'cod_payment':
      return /kap[ıi]da|kapida|cod/i.test(String(order?.odemeYontemi || ''));
    default:
      return false; // "Yakında" koşulları → false (akışı kilitlemez, Hayır dalına gider)
  }
}

// ── Aksiyon yürütme ──────────────────────────────────────────────────────────
// Mesaj aksiyonları outbox'a yazılır (mevcut worker/planSend gönderir, hat seçimi worker'da).
async function runAction(tenantId: string, sub: string, cfg: any, run: any, order: any, ctx: Record<string, any>): Promise<{ converted?: boolean }> {
  const phone = normPhone(run.customerPhone || ctx.phone || '');
  const baseOutbox = { tenantId, lineId: null as string | null, channel: 'api', customerPhone: phone, orderId: run.orderId || null, kind: 'workflow' };
  switch (sub) {
    case 'send_message': {
      if (!phone) break;
      const body = applyVars(String(cfg?.mesaj || ''), ctx);
      if (body.trim()) await prisma.whatsappOutbox.create({ data: { ...baseOutbox, body } }).catch(() => {});
      break;
    }
    case 'send_template': {
      if (!phone || !cfg?.sablonId) break;
      const vars: string[] = Array.isArray(cfg?.sablonVars) ? cfg.sablonVars.map((v: string) => applyVars(String(v ?? ''), ctx)) : [];
      await prisma.whatsappOutbox.create({ data: { ...baseOutbox, body: '', templateId: String(cfg.sablonId), templateVars: vars as any } }).catch(() => {});
      break;
    }
    case 'send_media': {
      if (!phone || !cfg?.mediaUrl) break;
      const body = applyVars(String(cfg?.mesaj || ''), ctx);
      await prisma.whatsappOutbox.create({ data: { ...baseOutbox, body, mediaType: String(cfg?.mediaType || 'image'), mediaUrl: String(cfg.mediaUrl), fileName: cfg?.fileName || null } }).catch(() => {});
      break;
    }
    case 'send_payment_link': {
      if (!phone) break;
      const link = ctx.link || (order?.token ? `${String(env.APP_DOMAIN || '').replace(/\/$/, '')}/sepet/${order.token}` : '');
      const body = applyVars(String(cfg?.mesaj || 'Merhaba {ad}, {no} numaralı siparişinizin ödemesini şu linkten tamamlayabilirsiniz: {link}'), { ...ctx, link });
      await prisma.whatsappOutbox.create({ data: { ...baseOutbox, body, kind: 'payment' } }).catch(() => {});
      break;
    }
    case 'send_cargo_link': {
      if (!phone) break;
      const takip = order?.kargoTakip || '';
      if (!takip) break;
      const body = applyVars(String(cfg?.mesaj || 'Merhaba {ad}, kargonuz yola çıktı. Takip: ') + takip, ctx);
      await prisma.whatsappOutbox.create({ data: { ...baseOutbox, body } }).catch(() => {});
      break;
    }
    case 'update_status': {
      const durum = String(cfg?.durum || '').trim();
      if (run.orderId && durum) {
        await prisma.storeOrder.update({ where: { id: run.orderId }, data: { durum } }).catch(() => {});
        await logOrderEvent(tenantId, run.orderId, `Otomasyon: durum → ${durum}`);
      }
      break;
    }
    case 'cancel_order': {
      if (run.orderId) {
        await prisma.storeOrder.update({ where: { id: run.orderId }, data: { durum: 'iptal' } }).catch(() => {});
        await logOrderEvent(tenantId, run.orderId, 'Otomasyon: sipariş iptal edildi');
      }
      break;
    }
    case 'complete_order': {
      if (run.orderId) {
        await prisma.storeOrder.update({ where: { id: run.orderId }, data: { durum: 'tamamlandi' } }).catch(() => {});
        await logOrderEvent(tenantId, run.orderId, 'Otomasyon: sipariş tamamlandı');
      }
      return { converted: true };
    }
    case 'add_note': {
      if (run.orderId) {
        const note = applyVars(String(cfg?.not || cfg?.mesaj || ''), ctx);
        if (note) {
          await prisma.storeOrder.update({ where: { id: run.orderId }, data: { not: note } }).catch(() => {});
          await logOrderEvent(tenantId, run.orderId, `Otomasyon notu: ${note.slice(0, 120)}`);
        }
      }
      break;
    }
    default:
      break; // "Yakında" aksiyonları → no-op
  }
  return {};
}

async function logOrderEvent(tenantId: string, orderId: string, islem: string): Promise<void> {
  try { await prisma.orderEvent.create({ data: { tenantId, orderId, kullanici: 'otomasyon', islem } }); } catch { /* */ }
}

// ── Run ilerletme ────────────────────────────────────────────────────────────
async function advanceRun(runId: string): Promise<void> {
  let run = await prisma.whatsappWorkflowRun.findUnique({ where: { id: runId } }).catch(() => null);
  if (!run || run.status === 'done' || run.status === 'canceled' || run.status === 'failed') return;
  const wf = await prisma.whatsappWorkflow.findUnique({ where: { id: run.workflowId } }).catch(() => null);
  if (!wf || !wf.aktif) { await prisma.whatsappWorkflowRun.update({ where: { id: runId }, data: { status: 'canceled' } }).catch(() => {}); return; }
  const graph = asGraph(wf.graph);
  const ctx: Record<string, any> = { ...(run.context as any), phone: run.customerPhone };

  let node = nodeById(graph, run.currentNodeId);
  let steps = run.steps || 0;
  let converted = run.converted || false;

  try {
    while (node) {
      if (steps++ > MAX_STEPS) { await prisma.whatsappWorkflowRun.update({ where: { id: runId }, data: { status: 'failed', steps, lastError: 'max steps' } }).catch(() => {}); return; }

      if (node.type === 'trigger') {
        node = nextNode(graph, node.id);
        continue;
      }
      if (node.type === 'delay') {
        const nxt = nextNode(graph, node.id);
        if (!nxt) { await prisma.whatsappWorkflowRun.update({ where: { id: runId }, data: { status: 'done', steps, converted } }).catch(() => {}); return; }
        const wakeAt = new Date(Date.now() + delayMinutes(node.config) * 60000);
        await prisma.whatsappWorkflowRun.update({ where: { id: runId }, data: { status: 'waiting', wakeAt, currentNodeId: nxt.id, steps, converted } }).catch(() => {});
        return;
      }
      if (node.type === 'condition' || node.type === 'decision') {
        const order = run.orderId ? await prisma.storeOrder.findFirst({ where: { id: run.orderId, tenantId: run.tenantId } }).catch(() => null) : null;
        const res = await evalCondition(run.tenantId, node.subtype, node.config, order || {}, ctx);
        node = nextNode(graph, node.id, res ? 'yes' : 'no');
        continue;
      }
      if (node.type === 'action') {
        const order = run.orderId ? await prisma.storeOrder.findFirst({ where: { id: run.orderId, tenantId: run.tenantId } }).catch(() => null) : null;
        const r = await runAction(run.tenantId, node.subtype, node.config, run, order || {}, ctx);
        if (r.converted) converted = true;
        node = nextNode(graph, node.id);
        continue;
      }
      // bilinmeyen tip → atla
      node = nextNode(graph, node.id);
    }
    // graph sonu
    await prisma.whatsappWorkflowRun.update({ where: { id: runId }, data: { status: 'done', steps, converted } }).catch(() => {});
  } catch (e: any) {
    await prisma.whatsappWorkflowRun.update({ where: { id: runId }, data: { status: 'failed', steps, lastError: String(e?.message || e).slice(0, 300) } }).catch(() => {});
  }
}

// ── Tetikleyici: eşleşen workflow'lar için run başlat ────────────────────────
export async function startWorkflowRuns(
  tenantId: string,
  triggerKind: string,
  opts: { phone?: string | null; orderId?: string | null; durum?: string | null; order?: any; context?: Record<string, any> },
): Promise<void> {
  try {
    const wfs = await prisma.whatsappWorkflow.findMany({ where: { tenantId, triggerKind, aktif: true } }).catch(() => [] as any[]);
    if (!wfs.length) return;

    let order = opts.order || null;
    if (!order && opts.orderId) order = await prisma.storeOrder.findFirst({ where: { id: opts.orderId, tenantId } }).catch(() => null);
    const phone = normPhone(opts.phone || order?.customer?.telefon || '') || normPhone(opts.phone || '');
    let resolvedPhone = phone;
    if ((!resolvedPhone || resolvedPhone.length < 11) && order?.customerId) {
      const c = await prisma.customer.findUnique({ where: { id: order.customerId } }).catch(() => null);
      resolvedPhone = normPhone(c?.telefon || '');
    }
    if (!resolvedPhone || resolvedPhone.length < 11) return;

    const ctx = opts.context || (order ? await buildContext(tenantId, order) : {});

    for (const wf of wfs as any[]) {
      // triggerFilter (örn. { durum }) eşleşmesi
      const filt = (wf.triggerFilter || {}) as any;
      if (filt && filt.durum && opts.durum && String(filt.durum) !== String(opts.durum)) continue;
      const graph = asGraph(wf.graph);
      const tnode = triggerNode(graph);
      if (!tnode) continue;
      const start = nextNode(graph, tnode.id);
      if (!start) continue;
      // Aynı (workflow, telefon, order) için aktif koşan run varsa tekrar başlatma
      const dup = await prisma.whatsappWorkflowRun.findFirst({
        where: { tenantId, workflowId: wf.id, customerPhone: resolvedPhone, orderId: opts.orderId || null, status: { in: ['running', 'waiting'] } },
        select: { id: true },
      }).catch(() => null);
      if (dup) continue;
      const run = await prisma.whatsappWorkflowRun.create({
        data: { tenantId, workflowId: wf.id, customerPhone: resolvedPhone, orderId: opts.orderId || null, currentNodeId: start.id, status: 'running', context: ctx as any },
      }).catch(() => null);
      if (run) await advanceRun(run.id);
    }
  } catch { /* tetikleyici hatası ana akışı bozmasın */ }
}

// ── Cron: bekleyen run'ları uyandır (her dakika) ─────────────────────────────
export async function processWorkflowTick(): Promise<void> {
  try {
    const due = await prisma.whatsappWorkflowRun.findMany({
      where: { status: 'waiting', wakeAt: { lte: new Date() } },
      select: { id: true }, take: 200, orderBy: { wakeAt: 'asc' },
    }).catch(() => [] as any[]);
    for (const r of due as any[]) {
      await prisma.whatsappWorkflowRun.update({ where: { id: r.id }, data: { status: 'running' } }).catch(() => {});
      await advanceRun(r.id);
    }
  } catch { /* */ }
}

// DELETE route: workflow silinince koşan run'ları iptal et
export async function cancelRunsForWorkflow(tenantId: string, workflowId: string): Promise<void> {
  await prisma.whatsappWorkflowRun.updateMany({
    where: { tenantId, workflowId, status: { in: ['running', 'waiting'] } },
    data: { status: 'canceled' },
  }).catch(() => {});
}
