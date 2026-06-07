import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../../lib/prisma';
import { asyncHandler, ApiError } from '../../lib/http';

const router = Router();

// Yalnızca firma sahibi personel yönetebilir
function ownerOnly(req: Request) {
  if (req.auth?.role !== 'TENANT_OWNER') throw new ApiError(403, 'Bu işlem için yetkiniz yok (yalnızca patron).');
}

// Personel listesi
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  ownerOnly(req);
  const list = await prisma.user.findMany({
    where: { tenantId: req.tenantId!, role: 'TENANT_USER' },
    select: { id: true, email: true, fullName: true, unvan: true, permissions: true, aktif: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  res.json(list);
}));

// Personel oluştur
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  ownerOnly(req);
  const { email, password, fullName, unvan, permissions } = req.body || {};
  if (!email || !password || !fullName) throw new ApiError(422, 'Ad, e-posta ve şifre zorunlu');
  const ex = await prisma.user.findUnique({ where: { email: String(email).toLowerCase() } });
  if (ex) throw new ApiError(409, 'Bu e-posta zaten kayıtlı');
  const passwordHash = await bcrypt.hash(String(password), 10);
  const u = await prisma.user.create({
    data: { email: String(email).toLowerCase(), passwordHash, fullName, unvan: unvan || null, role: 'TENANT_USER', tenantId: req.tenantId!, permissions: Array.isArray(permissions) ? permissions : [], aktif: true },
    select: { id: true, email: true, fullName: true, unvan: true, permissions: true, aktif: true },
  });
  res.status(201).json(u);
}));

// Personel güncelle (yetki/unvan/aktif/şifre)
router.patch('/:id', asyncHandler(async (req: Request, res: Response) => {
  ownerOnly(req);
  const found = await prisma.user.findFirst({ where: { id: req.params.id, tenantId: req.tenantId!, role: 'TENANT_USER' } });
  if (!found) throw new ApiError(404, 'Personel bulunamadı');
  const data: any = {};
  if (req.body.fullName !== undefined) data.fullName = req.body.fullName;
  if (req.body.unvan !== undefined) data.unvan = req.body.unvan || null;
  if (req.body.aktif !== undefined) data.aktif = !!req.body.aktif;
  if (Array.isArray(req.body.permissions)) data.permissions = req.body.permissions;
  if (req.body.password) data.passwordHash = await bcrypt.hash(String(req.body.password), 10);
  const u = await prisma.user.update({ where: { id: found.id }, data, select: { id: true, email: true, fullName: true, unvan: true, permissions: true, aktif: true } });
  res.json(u);
}));

// Personel sil
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  ownerOnly(req);
  const found = await prisma.user.findFirst({ where: { id: req.params.id, tenantId: req.tenantId!, role: 'TENANT_USER' } });
  if (!found) throw new ApiError(404, 'Personel bulunamadı');
  await prisma.user.delete({ where: { id: found.id } });
  res.json({ ok: true });
}));

// ───────── Ekip Sohbeti (iç mesajlaşma) ─────────
router.get('/team/messages', asyncHandler(async (req: Request, res: Response) => {
  const msgs = await prisma.teamMessage.findMany({ where: { tenantId: req.tenantId! }, orderBy: { createdAt: 'asc' }, take: 300 });
  res.json(msgs);
}));
router.post('/team/messages', asyncHandler(async (req: Request, res: Response) => {
  const content = String(req.body?.content || '').trim();
  if (!content) throw new ApiError(422, 'Mesaj boş');
  const u = await prisma.user.findUnique({ where: { id: req.auth!.userId }, select: { fullName: true } });
  const m = await prisma.teamMessage.create({ data: { tenantId: req.tenantId!, userId: req.auth!.userId, ad: u?.fullName || 'Kullanıcı', content: content.slice(0, 2000) } });
  res.status(201).json(m);
}));

export default router;
