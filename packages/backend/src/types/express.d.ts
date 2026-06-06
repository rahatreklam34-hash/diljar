import { TenantPrisma } from '../lib/prisma';

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        tenantId: string | null;
        role: string;
      };
      tenantId?: string;
      db?: TenantPrisma;
      tenantStatus?: string;
    }
  }
}

export {};
