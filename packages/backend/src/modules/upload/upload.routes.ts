import { Router, Request, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { prisma } from '../../lib/prisma';
import { env } from '../../config/env';
import { asyncHandler, ApiError } from '../../lib/http';

const router = Router();

const uploadRoot = path.resolve(process.cwd(), env.UPLOAD_DIR);

const storage = multer.diskStorage({
  destination: (req: Request, _file, cb) => {
    const dir = path.join(uploadRoot, req.tenantId || 'common');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const unique = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024 },
});

// POST /uploads — dosya yükle
router.post('/', upload.single('file'), asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw new ApiError(400, 'Dosya gerekli');
  const rec = await prisma.upload.create({
    data: {
      tenantId: req.tenantId!,
      fileName: req.file.filename,
      originalName: Buffer.from(req.file.originalname, 'latin1').toString('utf8'),
      mimeType: req.file.mimetype,
      size: req.file.size,
      path: path.relative(uploadRoot, req.file.path),
      category: (req.body.category as string) || 'genel',
      createdByUserId: req.auth!.userId,
    },
  });
  res.status(201).json(rec);
}));

// GET /uploads — liste
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const list = await prisma.upload.findMany({ where: { tenantId: req.tenantId! }, orderBy: { createdAt: 'desc' } });
  res.json(list);
}));

// GET /uploads/:id/download
router.get('/:id/download', asyncHandler(async (req: Request, res: Response) => {
  const rec = await prisma.upload.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!rec) throw new ApiError(404, 'Dosya bulunamadı');
  const full = path.join(uploadRoot, rec.path);
  if (!fs.existsSync(full)) throw new ApiError(404, 'Dosya diskte bulunamadı');
  res.download(full, rec.originalName);
}));

// DELETE /uploads/:id
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const rec = await prisma.upload.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!rec) throw new ApiError(404, 'Dosya bulunamadı');
  const full = path.join(uploadRoot, rec.path);
  fs.promises.unlink(full).catch(() => {});
  await prisma.upload.delete({ where: { id: rec.id } });
  res.json({ ok: true });
}));

export default router;
