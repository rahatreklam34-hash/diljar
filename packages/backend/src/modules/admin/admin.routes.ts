import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { asyncHandler, ApiError } from '../../lib/http';
import { PAYMENT_PROVIDERS, AI_PROVIDERS, findProvider, maskConfig } from '../integrations/catalog';

const router = Router();

// ───── Genel istatistik ─────
router.get('/stats', asyncHandler(async (_req: Request, res: Response) => {
  const [tenantCount, activeCount, trialCount, frozenCount, pendingPayments, openTickets, confirmedAgg] = await Promise.all([
    prisma.tenant.count(),
    prisma.tenant.count({ where: { status: 'ACTIVE' } }),
    prisma.tenant.count({ where: { status: 'TRIAL' } }),
    prisma.tenant.count({ where: { status: 'FROZEN' } }),
    prisma.payment.count({ where: { status: 'PENDING' } }),
    prisma.supportTicket.count({ where: { status: { not: 'CLOSED' } } }),
    prisma.payment.aggregate({ where: { status: 'CONFIRMED' }, _sum: { amount: true } }),
  ]);
  res.json({
    tenantCount, activeCount, trialCount, frozenCount,
    pendingPayments, openTickets,
    totalRevenue: confirmedAgg._sum.amount || 0,
  });
}));

// ───── Tenant yönetimi ─────
router.get('/tenants', asyncHandler(async (req: Request, res: Response) => {
  const q = (req.query.q as string) || '';
  const status = req.query.status as string | undefined;
  const tenants = await prisma.tenant.findMany({
    where: {
      AND: [
        q ? { name: { contains: q, mode: 'insensitive' } } : {},
        status ? { status: status as any } : {},
      ],
    },
    orderBy: { createdAt: 'desc' },
    include: {
      users: { where: { role: 'TENANT_OWNER' }, take: 1, select: { email: true, fullName: true } },
      subscriptions: { orderBy: { createdAt: 'desc' }, take: 1, include: { plan: true } },
      payments: { where: { status: 'CONFIRMED' }, select: { id: true }, take: 1 },
    },
  });
  res.json(tenants);
}));

router.get('/tenants/:id', asyncHandler(async (req: Request, res: Response) => {
  const tenant = await prisma.tenant.findUnique({
    where: { id: req.params.id },
    include: {
      users: { select: { id: true, email: true, fullName: true, role: true } },
      subscriptions: { orderBy: { createdAt: 'desc' }, include: { plan: true } },
      payments: { orderBy: { createdAt: 'desc' } },
      creditLedger: { orderBy: { createdAt: 'desc' }, take: 50 },
    },
  });
  if (!tenant) throw new ApiError(404, 'Firma bulunamadı');
  res.json(tenant);
}));

// Dondur
router.patch('/tenants/:id/freeze', asyncHandler(async (req: Request, res: Response) => {
  const tenant = await prisma.tenant.update({ where: { id: req.params.id }, data: { status: 'FROZEN' } });
  await audit(req, tenant.id, 'FREEZE', 'Tenant', tenant.id, 'Hesap donduruldu');
  res.json(tenant);
}));

const activateSchema = z.object({
  planId: z.string().optional(),
  billingCycle: z.enum(['MONTHLY', 'YEARLY']).default('MONTHLY'),
});

// Aktifleştir (abonelik başlat/uzat)
router.patch('/tenants/:id/activate', asyncHandler(async (req: Request, res: Response) => {
  const body = activateSchema.parse(req.body);
  const now = new Date();
  const end = new Date(now);
  if (body.billingCycle === 'YEARLY') end.setFullYear(end.getFullYear() + 1);
  else end.setMonth(end.getMonth() + 1);

  const result = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.update({ where: { id: req.params.id }, data: { status: 'ACTIVE' } });
    const sub = await tx.subscription.create({
      data: {
        tenantId: tenant.id,
        planId: body.planId || null,
        status: 'ACTIVE',
        billingCycle: body.billingCycle,
        currentPeriodStart: now,
        currentPeriodEnd: end,
      },
    });
    // plan kredisi varsa ekle
    if (body.planId) {
      const plan = await tx.plan.findUnique({ where: { id: body.planId } });
      if (plan && plan.creditPerMonth > 0) {
        const t = await tx.tenant.update({ where: { id: tenant.id }, data: { creditBalance: { increment: plan.creditPerMonth } } });
        await tx.creditLedger.create({ data: { tenantId: tenant.id, amount: plan.creditPerMonth, balanceAfter: t.creditBalance, type: 'PURCHASE', description: `${plan.name} plan kredisi`, createdByUserId: req.auth!.userId } });
      }
    }
    return sub;
  });
  await audit(req, req.params.id, 'ACTIVATE', 'Tenant', req.params.id, `Abonelik aktifleştirildi (${body.billingCycle})`);
  res.json(result);
}));

// Kredi/kontör ekle
const creditSchema = z.object({ amount: z.number(), description: z.string().optional() });
router.post('/tenants/:id/credit', asyncHandler(async (req: Request, res: Response) => {
  const { amount, description } = creditSchema.parse(req.body);
  const result = await prisma.$transaction(async (tx) => {
    const t = await tx.tenant.update({ where: { id: req.params.id }, data: { creditBalance: { increment: amount } } });
    return tx.creditLedger.create({
      data: { tenantId: req.params.id, amount, balanceAfter: t.creditBalance, type: amount >= 0 ? 'PURCHASE' : 'ADJUSTMENT', description: description || 'Manuel kredi işlemi', createdByUserId: req.auth!.userId },
    });
  });
  await audit(req, req.params.id, 'CREDIT', 'Tenant', req.params.id, `Kredi: ${amount}`);
  res.status(201).json(result);
}));

// ───── Ödemeler ─────
router.get('/payments', asyncHandler(async (req: Request, res: Response) => {
  const status = (req.query.status as string) || undefined;
  const payments = await prisma.payment.findMany({
    where: status ? { status: status as any } : {},
    orderBy: { createdAt: 'desc' },
    include: { tenant: { select: { name: true } } },
  });
  res.json(payments);
}));

const createPaymentSchema = z.object({
  tenantId: z.string(),
  amount: z.number().int(),
  method: z.enum(['BANK_TRANSFER', 'MANUAL', 'CREDIT_CARD']).default('BANK_TRANSFER'),
  adminNote: z.string().optional(),
});
router.post('/payments', asyncHandler(async (req: Request, res: Response) => {
  const b = createPaymentSchema.parse(req.body);
  const p = await prisma.payment.create({ data: { ...b, status: 'PENDING' } });
  res.status(201).json(p);
}));

router.post('/payments/:id/confirm', asyncHandler(async (req: Request, res: Response) => {
  const p = await prisma.payment.update({
    where: { id: req.params.id },
    data: { status: 'CONFIRMED', confirmedByUserId: req.auth!.userId, confirmedAt: new Date(), adminNote: req.body.adminNote },
  });
  await audit(req, p.tenantId, 'PAYMENT_CONFIRM', 'Payment', p.id, `Ödeme onaylandı: ${p.amount}`);
  res.json(p);
}));

router.post('/payments/:id/reject', asyncHandler(async (req: Request, res: Response) => {
  const p = await prisma.payment.update({ where: { id: req.params.id }, data: { status: 'REJECTED', adminNote: req.body.adminNote } });
  res.json(p);
}));

// ───── Gelir raporu (abonelik kazançları) ─────
router.get('/revenue', asyncHandler(async (_req: Request, res: Response) => {
  const payments = await prisma.payment.findMany({ where: { status: 'CONFIRMED' }, orderBy: { confirmedAt: 'asc' } });
  const byMonth: Record<string, number> = {};
  let total = 0;
  for (const p of payments) {
    const d = p.confirmedAt || p.createdAt;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    byMonth[key] = (byMonth[key] || 0) + p.amount;
    total += p.amount;
  }
  res.json({ total, byMonth, count: payments.length });
}));

// ───── Destek (tüm tenantlar) ─────
router.get('/tickets', asyncHandler(async (req: Request, res: Response) => {
  const status = (req.query.status as string) || undefined;
  const tickets = await prisma.supportTicket.findMany({
    where: status ? { status: status as any } : {},
    orderBy: { updatedAt: 'desc' },
    include: { tenant: { select: { name: true } } },
  });
  res.json(tickets);
}));

router.get('/tickets/:id', asyncHandler(async (req: Request, res: Response) => {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: req.params.id },
    include: { messages: { orderBy: { createdAt: 'asc' } }, tenant: { select: { name: true } } },
  });
  if (!ticket) throw new ApiError(404, 'Talep bulunamadı');
  res.json(ticket);
}));

router.post('/tickets/:id/messages', asyncHandler(async (req: Request, res: Response) => {
  const content = (req.body.content as string) || '';
  if (!content.trim()) throw new ApiError(422, 'Mesaj gerekli');
  const ticket = await prisma.supportTicket.findUnique({ where: { id: req.params.id } });
  if (!ticket) throw new ApiError(404, 'Talep bulunamadı');
  const msg = await prisma.ticketMessage.create({
    data: { ticketId: ticket.id, senderUserId: req.auth!.userId, content, isAdmin: true },
  });
  await prisma.supportTicket.update({ where: { id: ticket.id }, data: { status: 'ANSWERED', updatedAt: new Date() } });
  res.status(201).json(msg);
}));

router.patch('/tickets/:id', asyncHandler(async (req: Request, res: Response) => {
  const status = req.body.status as string;
  const ticket = await prisma.supportTicket.update({ where: { id: req.params.id }, data: { status: status as any } });
  res.json(ticket);
}));

// ───── Audit log ─────
router.get('/audit', asyncHandler(async (req: Request, res: Response) => {
  const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200, include: { tenant: { select: { name: true } } } });
  res.json(logs);
}));

// ───── Planlar yönetimi ─────
router.get('/plans', asyncHandler(async (_req: Request, res: Response) => {
  res.json(await prisma.plan.findMany({ orderBy: { priceMonthly: 'asc' } }));
}));

const planSchema = z.object({
  name: z.string().min(1),
  priceMonthly: z.number().int().min(0),
  priceYearly: z.number().int().min(0),
  creditPerMonth: z.number().min(0).default(0),
  features: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
});

router.post('/plans', asyncHandler(async (req: Request, res: Response) => {
  const b = planSchema.parse(req.body);
  const p = await prisma.plan.create({ data: { ...b, features: b.features as any } });
  res.status(201).json(p);
}));

router.patch('/plans/:id', asyncHandler(async (req: Request, res: Response) => {
  const b = planSchema.partial().parse(req.body);
  const data: any = { ...b };
  if (b.features) data.features = b.features as any;
  const p = await prisma.plan.update({ where: { id: req.params.id }, data });
  res.json(p);
}));

router.delete('/plans/:id', asyncHandler(async (req: Request, res: Response) => {
  // plana bağlı abonelik varsa pasifleştir, yoksa sil
  const subCount = await prisma.subscription.count({ where: { planId: req.params.id } });
  if (subCount > 0) {
    const p = await prisma.plan.update({ where: { id: req.params.id }, data: { isActive: false } });
    return res.json({ ...p, _softDeleted: true });
  }
  await prisma.plan.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
}));

// ───── Analitik (grafik verileri + beklentiler) ─────
router.get('/analytics', asyncHandler(async (_req: Request, res: Response) => {
  const now = new Date();
  const tenants = await prisma.tenant.findMany({ select: { status: true, createdAt: true } });
  const payments = await prisma.payment.findMany({ where: { status: 'CONFIRMED' }, select: { amount: true, confirmedAt: true, createdAt: true, tenantId: true } });
  const activeSubs = await prisma.subscription.findMany({
    where: { status: 'ACTIVE' },
    select: { billingCycle: true, plan: { select: { priceMonthly: true, priceYearly: true } } },
  });

  // Durum dağılımı
  const statusBreakdown: Record<string, number> = {};
  for (const t of tenants) statusBreakdown[t.status] = (statusBreakdown[t.status] || 0) + 1;

  // Son 6 ay: kayıt ve gelir
  const months: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const regByMonth: Record<string, number> = {};
  const revByMonth: Record<string, number> = {};
  months.forEach((m) => { regByMonth[m] = 0; revByMonth[m] = 0; });
  for (const t of tenants) {
    const k = `${t.createdAt.getFullYear()}-${String(t.createdAt.getMonth() + 1).padStart(2, '0')}`;
    if (k in regByMonth) regByMonth[k]++;
  }
  for (const p of payments) {
    const d = p.confirmedAt || p.createdAt;
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (k in revByMonth) revByMonth[k] += p.amount;
  }

  // MRR beklentisi (aktif aboneliklerden aylık tahmini gelir, kuruş)
  let mrr = 0;
  for (const s of activeSubs) {
    if (!s.plan) continue;
    mrr += s.billingCycle === 'YEARLY' ? Math.round(s.plan.priceYearly / 12) : s.plan.priceMonthly;
  }
  const paidTenantIds = new Set(payments.map((p) => p.tenantId));

  res.json({
    statusBreakdown,
    months,
    registrations: months.map((m) => regByMonth[m]),
    revenue: months.map((m) => revByMonth[m]),
    mrr,
    projectedAnnual: mrr * 12,
    paidCount: paidTenantIds.size,
    activeSubsCount: activeSubs.length,
  });
}));

// ───── Platform Ödeme Entegrasyonları (abonelik tahsilatı) ─────
const MASK = '••••••••';

router.get('/integrations/catalog', asyncHandler(async (_req: Request, res: Response) => {
  res.json({ payment: PAYMENT_PROVIDERS, ai: AI_PROVIDERS });
}));

router.get('/integrations', asyncHandler(async (_req: Request, res: Response) => {
  const list = await prisma.integrationSetting.findMany({ where: { scope: 'PLATFORM' } });
  res.json(list.map((s) => ({ ...s, config: maskConfig(s.provider, s.config) })));
}));

router.put('/integrations/:provider', asyncHandler(async (req: Request, res: Response) => {
  const provider = req.params.provider;
  const def = findProvider(provider);
  if (!def || (def.category !== 'PAYMENT' && def.category !== 'AI')) throw new ApiError(404, 'Bilinmeyen sağlayıcı');
  const { enabled = false, mode = 'TEST', config = {} } = req.body || {};
  const existing = await prisma.integrationSetting.findFirst({ where: { scope: 'PLATFORM', provider, tenantId: null } });
  const merged: any = { ...((existing?.config as any) || {}) };
  for (const f of def.fields) {
    const v = config[f.key];
    if (v === undefined) continue;
    if (f.type === 'password' && v === MASK) continue;
    merged[f.key] = v;
  }
  const data = { enabled: !!enabled, mode: mode === 'LIVE' ? 'LIVE' : 'TEST', config: merged, category: def.category };
  const saved = existing
    ? await prisma.integrationSetting.update({ where: { id: existing.id }, data })
    : await prisma.integrationSetting.create({ data: { ...data, scope: 'PLATFORM', tenantId: null, provider } });
  res.json({ ...saved, config: maskConfig(provider, saved.config) });
}));

async function audit(req: Request, tenantId: string, action: string, entity: string, entityId: string, detail: string) {
  try {
    await prisma.auditLog.create({ data: { tenantId, userId: req.auth?.userId || null, action, entity, entityId, detail } });
  } catch { /* yut */ }
}

export default router;
