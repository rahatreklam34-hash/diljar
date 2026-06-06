import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';

/**
 * Bireysel mod: abonelik kısıtlaması devre dışı. (SaaS'a geçişte eski kontrol geri eklenecek.)
 */
export async function subscriptionGuard(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.auth) return next(new ApiError(401, 'Yetkilendirme gerekli'));
    // Bireysel mod: abonelik kısıtlaması uygulanmaz (SaaS'a geçişte tekrar aktif edilecek)
    if (req.tenantId) {
      const tenant = await prisma.tenant.findUnique({ where: { id: req.tenantId }, select: { status: true } });
      req.tenantStatus = tenant?.status;
    }
    return next();
  } catch (e) {
    next(e);
  }
}
