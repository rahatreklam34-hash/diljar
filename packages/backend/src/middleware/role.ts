import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../lib/http';

/** Sadece belirtilen rollere izin verir. */
export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(new ApiError(401, 'Yetkilendirme gerekli'));
    if (!roles.includes(req.auth.role)) {
      return next(new ApiError(403, 'Bu işlem için yetkiniz yok'));
    }
    next();
  };
}

export const requireSuperAdmin = requireRole('SUPER_ADMIN');
