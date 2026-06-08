import { Router, Request, Response } from 'express';
import { asyncHandler, ApiError } from '../../lib/http';
import { sendSms, checkNetgsm, getNetgsmSettings, saveNetgsmPrefs } from './netgsm.service';

const router = Router();

// SMS bildirim ayarlari (gizli bilgi icermez)
router.get('/settings', asyncHandler(async (req: Request, res: Response) => {
  res.json(await getNetgsmSettings(req.tenantId!));
}));

// Bildirim tercihlerini kaydet (toggle + sablonlar)
router.put('/settings', asyncHandler(async (req: Request, res: Response) => {
  const b = req.body || {};
  const prefs = {
    notify_new: !!b.notify_new,
    notify_approved: !!b.notify_approved,
    notify_shipped: !!b.notify_shipped,
    tpl_new: typeof b.tpl_new === 'string' ? b.tpl_new : undefined,
    tpl_approved: typeof b.tpl_approved === 'string' ? b.tpl_approved : undefined,
    tpl_shipped: typeof b.tpl_shipped === 'string' ? b.tpl_shipped : undefined,
  };
  res.json(await saveNetgsmPrefs(req.tenantId!, prefs));
}));

// Baglanti / bakiye testi
router.get('/test', asyncHandler(async (req: Request, res: Response) => {
  res.json(await checkNetgsm(req.tenantId!));
}));

// Toplu SMS gonder (kampanyalar)
router.post('/send', asyncHandler(async (req: Request, res: Response) => {
  const { numbers, message } = req.body || {};
  if (!Array.isArray(numbers) || numbers.length === 0) throw new ApiError(422, 'En az bir telefon numarasi gerekli.');
  if (!message || !String(message).trim()) throw new ApiError(422, 'Mesaj metni bos olamaz.');
  const result = await sendSms(req.tenantId!, numbers.map(String), String(message));
  res.json(result);
}));

export default router;
