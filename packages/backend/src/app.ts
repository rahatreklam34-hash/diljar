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

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: env.APP_DOMAIN, credentials: true }));
  app.use(express.json({ limit: '20mb' }));
  app.use(cookieParser());

  const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 1000, standardHeaders: true, legacyHeaders: false });
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50, standardHeaders: true, legacyHeaders: false });

  app.get('/api/v1/health', (_req, res) => res.json({ ok: true, name: env.APP_NAME }));

  // Herkese açık uçlar (auth gerektirmez): planlar + online mağaza vitrini
  app.use('/api/v1/public', publicRoutes);

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

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
