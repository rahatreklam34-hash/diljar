import { PrismaClient, Prisma } from '@prisma/client';

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'production' ? ['error'] : ['error', 'warn'],
});

// Tenant ile izole edilen modeller (otomatik tenantId enjeksiyonu)
const TENANT_SCOPED = new Set<string>([
  'CariHesap', 'CariHareket', 'Hareket', 'KasaBanka', 'KrediKarti',
  'BirikimHesabi', 'Cek', 'Personel', 'PersonelHareket', 'DuzenliOdeme',
  'EmanetPara', 'Hedef', 'SistemLog', 'Upload', 'SupportTicket',
  'AuditLog',
]);

const READ_OPS = new Set(['findFirst', 'findFirstOrThrow', 'findMany', 'count', 'aggregate', 'groupBy']);
const WRITE_WHERE_OPS = new Set(['update', 'updateMany', 'delete', 'deleteMany', 'findUnique', 'findUniqueOrThrow']);

/**
 * Belirli bir tenant'a kilitlenmiş Prisma istemcisi döndürür.
 * Tüm tenant-scoped model sorgularına otomatik olarak tenantId filtresi/verisi ekler.
 * Bu, controller/servisteki açık tenantId kullanımına ek ikinci güvenlik katmanıdır.
 */
export function tenantPrisma(tenantId: string) {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }: any) {
          if (!model || !TENANT_SCOPED.has(model)) {
            return query(args);
          }
          args = args || {};
          if (READ_OPS.has(operation) || WRITE_WHERE_OPS.has(operation)) {
            args.where = { ...(args.where || {}), tenantId };
          } else if (operation === 'create') {
            args.data = { ...(args.data || {}), tenantId };
          } else if (operation === 'createMany') {
            const data = args.data;
            if (Array.isArray(data)) {
              args.data = data.map((d: any) => ({ ...d, tenantId }));
            } else if (data) {
              args.data = { ...data, tenantId };
            }
          } else if (operation === 'upsert') {
            args.where = { ...(args.where || {}), tenantId };
            args.create = { ...(args.create || {}), tenantId };
          }
          return query(args);
        },
      },
    },
  });
}

export type TenantPrisma = ReturnType<typeof tenantPrisma>;
export { Prisma };
