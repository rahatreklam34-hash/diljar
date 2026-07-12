import { Router, Request, Response } from 'express';
import { asyncHandler } from '../../lib/http';
import {
  getSettings, saveSettings, testSettings, buildPreview, getJobRows, commit, refreshStock, syncBalances,
} from './import.service';

const router = Router();

// Baglanti ayarlari (secret maskeli doner)
router.get('/sepetw/settings', asyncHandler(async (req: Request, res: Response) => {
  res.json(await getSettings(req.tenantId!));
}));

router.put('/sepetw/settings', asyncHandler(async (req: Request, res: Response) => {
  res.json(await saveSettings(req.tenantId!, req.body || {}));
}));

// Baglanti testi
router.post('/sepetw/test', asyncHandler(async (req: Request, res: Response) => {
  res.json(await testSettings(req.tenantId!));
}));

// Onizleme uret (DB yazma yok)
router.post('/sepetw/preview', asyncHandler(async (req: Request, res: Response) => {
  res.json(await buildPreview(req.tenantId!));
}));

// Is satirlari (sayfali / filtreli)
router.get('/jobs/:id', asyncHandler(async (req: Request, res: Response) => {
  res.json(await getJobRows(req.tenantId!, req.params.id, {
    status: req.query.status as string,
    q: req.query.q as string,
    page: req.query.page ? Number(req.query.page) : 1,
    pageSize: req.query.pageSize ? Number(req.query.pageSize) : 50,
  }));
}));

// Secilenleri ice aktar (olustur/guncelle)
router.post('/sepetw/commit', asyncHandler(async (req: Request, res: Response) => {
  const { jobId, selectedKeys } = req.body || {};
  res.json(await commit(req.tenantId!, jobId, Array.isArray(selectedKeys) ? selectedKeys : []));
}));

// Sadece stok guncelle (diger alanlara dokunmaz)
router.post('/sepetw/refresh-stock', asyncHandler(async (req: Request, res: Response) => {
  res.json(await refreshStock(req.tenantId!));
}));

// Musteri bakiyelerini sepetw'den cek (dryRun=true ile onizleme)
router.post('/sepetw/sync-balances', asyncHandler(async (req: Request, res: Response) => {
  res.json(await syncBalances(req.tenantId!, { dryRun: !!(req.body && req.body.dryRun) }));
}));

export default router;
