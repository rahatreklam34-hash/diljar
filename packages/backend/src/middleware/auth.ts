import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../lib/jwt';
import { ApiError } from '../lib/http';
import { tenantPrisma } from '../lib/prisma';

/** JWT doğrular, req.auth doldurur. */
export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!token) {
    return next(new ApiError(401, 'Yetkilendirme gerekli'));
  }
  try {
    const payload = verifyAccessToken(token);
    req.auth = { userId: payload.userId, tenantId: payload.tenantId, role: payload.role };
    next();
  } catch {
    return next(new ApiError(401, 'Geçersiz veya süresi dolmuş oturum'));
  }
}

/** Tenant'a kilitli Prisma istemcisini req.db'ye koyar. */
export function attachTenant(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) return next(new ApiError(401, 'Yetkilendirme gerekli'));
  if (!req.auth.tenantId) {
    return next(new ApiError(403, 'Bu hesaba bağlı bir firma bulunamadı'));
  }
  req.tenantId = req.auth.tenantId;
  req.db = tenantPrisma(req.auth.tenantId);
  next();
}
