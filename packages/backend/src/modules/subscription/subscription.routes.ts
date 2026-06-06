import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/http';

const router = Router();

// GET /plans — aktif planlar (herkese açık değil ama auth'lu)
router.get('/plans', asyncHandler(async (_req: Request, res: Response) => {
  const plans = await prisma.plan.findMany({ where: { isActive: true }, orderBy: { priceMonthly: 'asc' } });
  res.json(plans);
}));

// GET /subscription — mevcut tenant aboneliği + durum
router.get('/subscription', asyncHandler(async (req: Request, res: Response) => {
  const tenant = await prisma.tenant.findUnique({
    where: { id: req.tenantId! },
    include: { subscriptions: { orderBy: { createdAt: 'desc' }, take: 1, include: { plan: true } } },
  });
  res.json({
    status: tenant?.status,
    trialEndsAt: tenant?.trialEndsAt,
    creditBalance: tenant?.creditBalance ?? 0,
    subscription: tenant?.subscriptions[0] || null,
  });
}));

// GET /credits — kredi hareketleri
router.get('/credits', asyncHandler(async (req: Request, res: Response) => {
  const ledger = await prisma.creditLedger.findMany({
    where: { tenantId: req.tenantId! },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  const tenant = await prisma.tenant.findUnique({ where: { id: req.tenantId! }, select: { creditBalance: true } });
  res.json({ balance: tenant?.creditBalance ?? 0, ledger });
}));

export default router;
