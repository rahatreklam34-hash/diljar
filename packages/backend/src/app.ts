import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';

import { authenticate, attachTenant } from './middleware/auth';
import { notFound, errorHandler } from './middleware/error';
import { prisma } from './lib/prisma';

import authRoutes from './modules/auth/auth.routes';
import dataRoutes from './modules/data/data.routes';
import supportRoutes from './modules/support/support.routes';
import uploadRoutes from './modules/upload/upload.routes';
import integrationRoutes from './modules/integrations/integrations.routes';
import isbankRoutes from './modules/isbank/isbank.routes';
import smsRoutes from './modules/sms/sms.routes';
import cargoRoutes from './modules/cargo/cargo.routes';
import staffRoutes from './modules/staff/staff.routes';
import storeRoutes from './modules/store/store.routes';
import liveRoutes from './modules/store/live.routes';
import freeRoutes from './modules/store/free.routes';
import assistantRoutes from './modules/bot/assistant.routes';
import adsRoutes from './modules/ads/ads.routes';
import publicRoutes from './modules/public/public.routes';
import birfaturaRoutes from './modules/birfatura/birfatura.routes';
import whatsappRoutes from './modules/whatsapp/wa.routes';
import importRoutes from './modules/import/import.routes';
import { cihazPanelRoutes, cihazAgentRoutes } from './modules/cihaz/cihaz.routes';
import { startCargoPoller } from './modules/cargo/cargo.poller';
import whatsappWebhook from './modules/whatsapp/wa.webhook';
import instagramWebhook from './modules/store/ig.webhook';
import { mediaDir } from './modules/whatsapp/wa.media';
import { reconnectActiveLines } from './modules/whatsapp/wa.manager';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: env.APP_DOMAIN, credentials: true }));
  app.use(express.json({ limit: '20mb', verify: (req, _res, buf) => { (req as any).rawBody = buf; } }));
  app.use(cookieParser());

  // Canlı yayın satış ekranı meşru şekilde sürekli polling yapar (aktif sipariş + FB/IG yorum
  // durumu her birkaç saniyede bir). Bu trafiği global limiter'a takılıp "429" ile ekranı
  // kilitlememek için canlı-yayın uçları limiter'dan MUAF tutulur (skip). Diğer tüm /api/v1
  // istekleri yine limitlenir; güvenlik korunur.
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10000,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => (req.originalUrl || req.path || '').includes('/store/live'),
  });
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50, standardHeaders: true, legacyHeaders: false });

  app.get('/api/v1/health', (_req, res) => res.json({ ok: true, name: env.APP_NAME }));

  // Herkese açık uçlar (auth gerektirmez): planlar + online mağaza vitrini
  app.use('/api/v1/public', publicRoutes);
  // BirFatura entegrasyonu — token header ile auth (Clerk auth'tan ÖNCE), base: /api/birfatura
  app.use('/api/birfatura', birfaturaRoutes);
  // BirFatura "Özel Entegrasyon" mağaza adresi https://diljar.com girilince
  // BirFatura otomatik https://diljar.com/api/orderStatus, /api/orders ... çağırır → /api altına da mount
  app.use('/api', birfaturaRoutes);

  // WhatsApp Cloud API webhook'u — PUBLIC (auth/tenant middleware'inden ÖNCE)
  app.use('/api/v1/whatsapp/webhook', whatsappWebhook);

  // Instagram Messaging (oto-yanıt) webhook'u — PUBLIC (auth/tenant middleware'inden ÖNCE)
  app.use('/api/v1/instagram/webhook', instagramWebhook);

  // Cihaz (Chrome eklentisi) agent uçları — PUBLIC (device JWT ile; auth/tenant'tan ÖNCE)
  app.use('/api/v1/cihaz-agent', cihazAgentRoutes);

  // WhatsApp medya dosyaları (gelen/giden) — statik public servis
  app.use('/wa-media', express.static(mediaDir()));

  // Auth (rate-limited)
  app.use('/api/v1/auth', authLimiter, authRoutes);

  // Tenant verisi (auth + tenant)
  app.use('/api/v1', apiLimiter, authenticate, attachTenant);
  app.use('/api/v1', dataRoutes);
  app.use('/api/v1/support', supportRoutes);
  app.use('/api/v1/uploads', uploadRoutes);
  app.use('/api/v1/integrations', integrationRoutes);
  app.use('/api/v1/isbank', isbankRoutes);
  app.use('/api/v1/sms', smsRoutes);
  app.use('/api/v1/cargo', cargoRoutes);
  app.use('/api/v1/staff', staffRoutes);
  app.use('/api/v1/store/live', liveRoutes);
  app.use('/api/v1/store/free', freeRoutes);
  app.use('/api/v1/store', storeRoutes);
  app.use('/api/v1/assistant', assistantRoutes);
  app.use('/api/v1/ads', adsRoutes);
  app.use('/api/v1/whatsapp', whatsappRoutes);
  app.use('/api/v1/import', importRoutes);
  app.use('/api/v1/cihaz', cihazPanelRoutes);

  // Sunucu açılışında aktif WhatsApp hatlarını (oturum dosyası varsa) yeniden bağla
  setTimeout(() => { reconnectActiveLines().catch(() => {}); }, 5000);

  // Yurtici kargolarda teslim olanlari periyodik olarak otomatik 'teslim'e ceken zamanlayici
  startCargoPoller();

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
