import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: 'Kaynak bulunamadı' });
}

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err instanceof ZodError) {
    return res.status(422).json({ error: 'Doğrulama hatası', details: err.flatten() });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Kayıt bulunamadı' });
    if (err.code === 'P2002') return res.status(409).json({ error: 'Bu kayıt zaten mevcut' });
    return res.status(400).json({ error: 'Veritabanı hatası', code: err.code });
  }
  console.error('[ERROR]', err);
  res.status(500).json({ error: 'Sunucu hatası' });
}
