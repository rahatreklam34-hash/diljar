import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { env } from '../../config/env';
import { asyncHandler, ApiError } from '../../lib/http';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../lib/jwt';
import { authenticate } from '../../middleware/auth';

const router = Router();

const registerSchema = z.object({
  fullName: z.string().min(2, 'Ad Soyad gerekli'),
  companyName: z.string().min(2, 'Firma adı gerekli'),
  phone: z.string().min(7, 'Telefon gerekli'),
  email: z.string().email('Geçerli e-posta girin'),
  password: z.string().min(6, 'Şifre en az 6 karakter olmalı'),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const REFRESH_COOKIE = 'ft_refresh';

function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/api/v1/auth',
  });
}

async function buildAuthResponse(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { tenant: true },
  });
  if (!user) throw new ApiError(404, 'Kullanıcı bulunamadı');
  const payload = { userId: user.id, tenantId: user.tenantId, role: user.role };
  return {
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      unvan: user.unvan,
      permissions: Array.isArray(user.permissions) ? user.permissions : null,
      prefs: (user as any).prefs ?? null,
      tenantId: user.tenantId,
      tenant: user.tenant
        ? { id: user.tenant.id, name: user.tenant.name }
        : null,
    },
  };
}

// POST /register — yeni firma + sahip kullanıcı
router.post('/register', asyncHandler(async (req: Request, res: Response) => {
  const data = registerSchema.parse(req.body);
  const exists = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
  if (exists) throw new ApiError(409, 'Bu e-posta zaten kayıtlı');

  const passwordHash = await bcrypt.hash(data.password, 10);

  const result = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: { name: data.companyName, phone: data.phone },
    });
    const user = await tx.user.create({
      data: {
        email: data.email.toLowerCase(),
        passwordHash,
        fullName: data.fullName,
        role: 'TENANT_OWNER',
        tenantId: tenant.id,
      },
    });
    return user;
  });

  const auth = await buildAuthResponse(result.id);
  setRefreshCookie(res, auth.refreshToken);
  res.status(201).json({ accessToken: auth.accessToken, user: auth.user });
}));

// POST /login
router.post('/login', asyncHandler(async (req: Request, res: Response) => {
  const data = loginSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
  if (!user) throw new ApiError(401, 'E-posta veya şifre hatalı');
  const ok = await bcrypt.compare(data.password, user.passwordHash);
  if (!ok) throw new ApiError(401, 'E-posta veya şifre hatalı');

  const auth = await buildAuthResponse(user.id);
  setRefreshCookie(res, auth.refreshToken);
  // Personel giriş logu — akışı bozmaz
  if (user.tenantId) prisma.auditLog.create({ data: { tenantId: user.tenantId, userId: user.id, userName: user.fullName || user.email, action: 'giris', entity: 'oturum', detail: 'Panel girişi' } }).catch(() => {});
  res.json({ accessToken: auth.accessToken, user: auth.user });
}));

// POST /refresh — httpOnly cookie ile yeni access token
router.post('/refresh', asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) throw new ApiError(401, 'Oturum bulunamadı');
  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    throw new ApiError(401, 'Oturum süresi doldu');
  }
  const auth = await buildAuthResponse(payload.userId);
  setRefreshCookie(res, auth.refreshToken);
  res.json({ accessToken: auth.accessToken, user: auth.user });
}));

// POST /logout
router.post('/logout', (req: Request, res: Response) => {
  res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
  res.json({ ok: true });
});

// PATCH /me/prefs — kullanıcının kendi tercihlerini (kısayollar vb.) günceller
router.patch('/me/prefs', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const prefs = req.body?.prefs ?? req.body ?? {};
  const user = await prisma.user.update({ where: { id: req.auth!.userId }, data: { prefs } });
  res.json({ prefs: (user as any).prefs ?? null });
}));

// PATCH /me/profile — kullanıcı kendi profilini günceller (ad, e-posta, şifre)
const profileSchema = z.object({
  fullName: z.string().min(2, 'Ad Soyad en az 2 karakter').optional(),
  email: z.string().email('Geçerli e-posta girin').optional(),
  newPassword: z.string().min(6, 'Yeni şifre en az 6 karakter').optional(),
  currentPassword: z.string().optional(),
});
router.patch('/me/profile', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const data = profileSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
  if (!user) throw new ApiError(404, 'Kullanıcı bulunamadı');

  const emailChanging = !!data.email && data.email.toLowerCase() !== user.email;
  const pwChanging = !!data.newPassword;
  // E-posta veya şifre değişiyorsa mevcut şifre doğrulanır
  if (emailChanging || pwChanging) {
    if (!data.currentPassword) throw new ApiError(400, 'Mevcut şifrenizi girin');
    const ok = await bcrypt.compare(data.currentPassword, user.passwordHash);
    if (!ok) throw new ApiError(401, 'Mevcut şifre hatalı');
  }

  const patch: any = {};
  if (data.fullName && data.fullName !== user.fullName) patch.fullName = data.fullName;
  if (emailChanging) {
    const exists = await prisma.user.findUnique({ where: { email: data.email!.toLowerCase() } });
    if (exists && exists.id !== user.id) throw new ApiError(409, 'Bu e-posta zaten kayıtlı');
    patch.email = data.email!.toLowerCase();
  }
  if (pwChanging) patch.passwordHash = await bcrypt.hash(data.newPassword!, 10);

  if (Object.keys(patch).length) await prisma.user.update({ where: { id: user.id }, data: patch });

  const fresh = await prisma.user.findUnique({ where: { id: user.id }, include: { tenant: true } });
  res.json({
    user: {
      id: fresh!.id,
      email: fresh!.email,
      fullName: fresh!.fullName,
      role: fresh!.role,
      unvan: fresh!.unvan,
      permissions: Array.isArray(fresh!.permissions) ? fresh!.permissions : null,
      prefs: (fresh as any).prefs ?? null,
      tenantId: fresh!.tenantId,
      tenant: fresh!.tenant ? { id: fresh!.tenant.id, name: fresh!.tenant.name } : null,
    },
  });
}));

// GET /me
router.get('/me', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.auth!.userId },
    include: { tenant: true },
  });
  if (!user) throw new ApiError(404, 'Kullanıcı bulunamadı');
  res.json({
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      unvan: user.unvan,
      permissions: Array.isArray(user.permissions) ? user.permissions : null,
      prefs: (user as any).prefs ?? null,
      tenantId: user.tenantId,
      tenant: user.tenant
        ? { id: user.tenant.id, name: user.tenant.name }
        : null,
    },
  });
}));

export default router;
