import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { asyncHandler, ApiError } from '../../lib/http';
import * as svc from './data.service';

const router = Router();

const META = new Set(['id', 'tenantId', 'createdAt', 'updatedAt', 'createdBy', 'hareketler', 'tenant', 'personel', 'cariHesap']);
function sanitize(body: any): any {
  const out: any = {};
  for (const k of Object.keys(body || {})) {
    if (!META.has(k)) out[k] = body[k];
  }
  return out;
}

// Bütün veriyi getir
router.get('/bootstrap', asyncHandler(async (req: Request, res: Response) => {
  const data = await svc.getBootstrap(req.tenantId!);
  res.json(data);
}));

// ───── Basit CRUD modelleri (bakiye etkisi olmayan) ─────
type SimpleCfg = { delegate: keyof typeof prisma };
const SIMPLE: Record<string, SimpleCfg> = {
  'cari-hesaplar': { delegate: 'cariHesap' as any },
  'kasa-banka': { delegate: 'kasaBanka' as any },
  'kredi-kartlari': { delegate: 'krediKarti' as any },
  'birikim': { delegate: 'birikimHesabi' as any },
  'personeller': { delegate: 'personel' as any },
  'personel-hareketler': { delegate: 'personelHareket' as any },
  'duzenli-odemeler': { delegate: 'duzenliOdeme' as any },
  'emanet': { delegate: 'emanetPara' as any },
  'hedefler': { delegate: 'hedef' as any },
};

for (const [seg, cfg] of Object.entries(SIMPLE)) {
  const model = () => (prisma as any)[cfg.delegate];

  router.post(`/${seg}`, asyncHandler(async (req: Request, res: Response) => {
    const created = await model().create({
      data: { ...sanitize(req.body), tenantId: req.tenantId!, createdBy: req.auth!.userId },
    });
    res.status(201).json(created);
  }));

  router.patch(`/${seg}/:id`, asyncHandler(async (req: Request, res: Response) => {
    const found = await model().findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
    if (!found) throw new ApiError(404, 'Kayıt bulunamadı');
    const updated = await model().update({ where: { id: req.params.id }, data: sanitize(req.body) });
    res.json(updated);
  }));

  router.delete(`/${seg}/:id`, asyncHandler(async (req: Request, res: Response) => {
    const found = await model().findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
    if (!found) throw new ApiError(404, 'Kayıt bulunamadı');
    await model().delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  }));
}

// ───── Kredi Kartı özel işlemler ─────
router.post('/kredi-kartlari/:id/odeme', asyncHandler(async (req: Request, res: Response) => {
  const { kaynakId, tutar } = req.body;
  await svc.krediKartiOdeme(req.tenantId!, req.params.id, kaynakId, Number(tutar));
  res.json({ ok: true });
}));
router.post('/kredi-kartlari/:id/harcama', asyncHandler(async (req: Request, res: Response) => {
  const { tutar, aciklama, kategori } = req.body;
  await svc.krediKartindanHarcama(req.tenantId!, req.params.id, Number(tutar), aciklama || 'Harcama', kategori || 'Diger');
  res.json({ ok: true });
}));

// ───── Cari Hareket (bakiye etkili) ─────
router.post('/cari-hareketler', asyncHandler(async (req: Request, res: Response) => {
  const r = await svc.addCariHareket(req.tenantId!, req.auth!.userId, req.body);
  res.status(201).json(r);
}));
router.patch('/cari-hareketler/:id', asyncHandler(async (req: Request, res: Response) => {
  const r = await svc.updateCariHareket(req.tenantId!, req.params.id, sanitize(req.body));
  res.json(r);
}));
router.delete('/cari-hareketler/:id', asyncHandler(async (req: Request, res: Response) => {
  const r = await svc.deleteCariHareket(req.tenantId!, req.params.id);
  res.json(r);
}));

// ───── Çekler (cari+kasa zinciri) ─────
router.post('/cekler', asyncHandler(async (req: Request, res: Response) => {
  const r = await svc.addCek(req.tenantId!, req.auth!.userId, req.body);
  res.status(201).json(r);
}));
router.patch('/cekler/:id', asyncHandler(async (req: Request, res: Response) => {
  const r = await svc.updateCek(req.tenantId!, req.params.id, sanitize(req.body));
  res.json(r);
}));
router.delete('/cekler/:id', asyncHandler(async (req: Request, res: Response) => {
  const r = await svc.deleteCek(req.tenantId!, req.params.id);
  res.json(r);
}));

// ───── Gelir/Gider ─────
router.post('/hareketler', asyncHandler(async (req: Request, res: Response) => {
  const r = await svc.addHareket(req.tenantId!, req.auth!.userId, req.body);
  res.status(201).json(r);
}));
router.patch('/hareketler/:id', asyncHandler(async (req: Request, res: Response) => {
  const found = await prisma.hareket.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!found) throw new ApiError(404, 'Kayıt bulunamadı');
  const updated = await prisma.hareket.update({ where: { id: req.params.id }, data: sanitize(req.body) });
  res.json(updated);
}));
router.delete('/hareketler/:id', asyncHandler(async (req: Request, res: Response) => {
  const r = await svc.deleteHareket(req.tenantId!, req.params.id);
  res.json(r);
}));

// ───── Sistem Log (manuel ekleme) ─────
router.post('/loglar', asyncHandler(async (req: Request, res: Response) => {
  const b = sanitize(req.body);
  const created = await prisma.sistemLog.create({ data: { ...b, tenantId: req.tenantId! } });
  res.status(201).json(created);
}));

export default router;
