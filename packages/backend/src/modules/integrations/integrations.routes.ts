import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { asyncHandler, ApiError } from '../../lib/http';
import { PAYMENT_PROVIDERS, CARGO_PROVIDERS, AI_PROVIDERS, BANKING_PROVIDERS, SMS_PROVIDERS, findProvider, maskConfig } from './catalog';

const router = Router();
const MASK = '••••••••';

// Sağlayıcı kataloğu (form alanları)
router.get('/catalog', asyncHandler(async (_req: Request, res: Response) => {
  res.json({ payment: PAYMENT_PROVIDERS, cargo: CARGO_PROVIDERS, ai: AI_PROVIDERS, banking: BANKING_PROVIDERS, sms: SMS_PROVIDERS });
}));

// Tenant'ın entegrasyon ayarları (gizli alanlar maskeli)
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const list = await prisma.integrationSetting.findMany({ where: { scope: 'TENANT', tenantId: req.tenantId! } });
  res.json(list.map((s) => ({ ...s, config: maskConfig(s.provider, s.config) })));
}));

// Upsert tenant entegrasyonu
router.put('/:provider', asyncHandler(async (req: Request, res: Response) => {
  const provider = req.params.provider;
  const def = findProvider(provider);
  if (!def) throw new ApiError(404, 'Bilinmeyen sağlayıcı');

  const { enabled = false, mode = 'TEST', config = {} } = req.body || {};
  const existing = await prisma.integrationSetting.findFirst({ where: { scope: 'TENANT', tenantId: req.tenantId!, provider } });

  // Maskelenmiş şifre alanları geldiyse mevcut değeri koru
  const merged: any = { ...(existing?.config as any || {}) };
  for (const f of def.fields) {
    const v = config[f.key];
    if (v === undefined) continue;
    if (f.type === 'password' && v === MASK) continue; // değiştirme
    merged[f.key] = v;
  }

  const data = { enabled: !!enabled, mode: mode === 'LIVE' ? 'LIVE' : 'TEST', config: merged, category: def.category };
  const saved = existing
    ? await prisma.integrationSetting.update({ where: { id: existing.id }, data })
    : await prisma.integrationSetting.create({ data: { ...data, scope: 'TENANT', tenantId: req.tenantId!, provider } });

  res.json({ ...saved, config: maskConfig(provider, saved.config) });
}));

export default router;
