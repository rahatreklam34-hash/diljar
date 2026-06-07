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
      tenantId: user.tenantId,
      tenant: user.tenant
        ? { id: user.tenant.id, name: user.tenant.name }
        : null,
    },
  });
}));

export default router;
